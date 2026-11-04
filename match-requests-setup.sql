-- 룸메 매칭 신청 + 카드 상태(임시저장/게시/보관) 설정 (Supabase > SQL Editor 에서 1회 실행. 여러 번 실행해도 안전)
-- 1) roommate_posts.status : draft(임시저장, 목록에 안 뜸) · published(게시, 목록에 뜸) · archived(보관, 데이터는 남기고 목록에서만 숨김)
-- 2) match_requests : 채팅에서 보내는 룸메 매칭 신청. 받은 사람이 수락하면 '룸메 확정'
-- 3) 확정된 상대의 카드는 상대가 보관해도 서로 볼 수 있음 (하우스룰 탭에서 사용)

-- ---------- 1) 카드 상태 ----------
alter table public.roommate_posts add column if not exists status text not null default 'published';
alter table public.roommate_posts drop constraint if exists roommate_posts_status_check;
alter table public.roommate_posts add  constraint roommate_posts_status_check check (status in ('draft','published','archived'));

create index if not exists roommate_posts_list_idx
  on public.roommate_posts (status, gender, dorm_period, schema_version);

-- ---------- 2) 매칭 신청 ----------
create table if not exists public.match_requests (
  id           bigint generated always as identity primary key,
  from_id      uuid not null references auth.users(id) on delete cascade,
  to_id        uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);

-- 같은 두 사람 사이에 대기 중인 신청은 하나만
create unique index if not exists match_requests_pending_uq
  on public.match_requests (least(from_id, to_id), greatest(from_id, to_id)) where status = 'pending';
create index if not exists match_requests_to_idx on public.match_requests (to_id, status);

alter table public.match_requests enable row level security;

drop policy if exists "match_req_select" on public.match_requests;
drop policy if exists "match_req_insert" on public.match_requests;
drop policy if exists "match_req_update" on public.match_requests;
create policy "match_req_select" on public.match_requests for select to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);
create policy "match_req_insert" on public.match_requests for insert to authenticated
  with check (auth.uid() = from_id);
create policy "match_req_update" on public.match_requests for update to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id)
  with check (auth.uid() = from_id or auth.uid() = to_id);

-- 상태 변경 규칙 (트리거가 검사)
--  · 만들 때는 대기(pending)로만, 둘 중 한 명이라도 이미 확정이면 불가
--  · 받은 사람만 수락·거절, 보낸 사람만 취소, 처리된 신청은 다시 못 바꿈
--  · 신청 내용(보낸 사람·받는 사람·시간)은 못 바꿈
create or replace function public.match_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- 수락 시 자동 거절 처리(아래)에서 다시 들어온 경우는 통과
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception '신청은 대기 상태로만 만들 수 있어요.'; end if;
    if exists (select 1 from public.match_requests r where r.status = 'accepted'
               and (r.from_id in (new.from_id, new.to_id) or r.to_id in (new.from_id, new.to_id))) then
      raise exception '이미 룸메가 확정된 사람이 있어요.';
    end if;
    return new;
  end if;
  if new.from_id <> old.from_id or new.to_id <> old.to_id or new.created_at <> old.created_at then
    raise exception '신청 내용은 바꿀 수 없어요.';
  end if;
  if old.status <> 'pending' then raise exception '이미 처리된 신청이에요.'; end if;
  if new.status = 'accepted' or new.status = 'rejected' then
    if auth.uid() <> old.to_id then raise exception '받은 사람만 수락하거나 거절할 수 있어요.'; end if;
  elsif new.status = 'cancelled' then
    if auth.uid() <> old.from_id then raise exception '보낸 사람만 취소할 수 있어요.'; end if;
  else
    raise exception '잘못된 상태 변경이에요.';
  end if;
  if new.status = 'accepted' and exists (select 1 from public.match_requests r where r.status = 'accepted'
       and (r.from_id in (old.from_id, old.to_id) or r.to_id in (old.from_id, old.to_id))) then
    raise exception '이미 룸메가 확정된 사람이 있어요.';
  end if;
  new.responded_at := now();
  return new;
end $$;

drop trigger if exists match_requests_guard_trg on public.match_requests;
create trigger match_requests_guard_trg before insert or update on public.match_requests
  for each row execute function public.match_requests_guard();

-- 수락되면, 두 사람이 받았거나 보낸 나머지 대기 신청은 자동으로 거절
create or replace function public.match_requests_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    update public.match_requests set status = 'rejected', responded_at = now()
     where status = 'pending' and id <> new.id
       and (from_id in (new.from_id, new.to_id) or to_id in (new.from_id, new.to_id));
  end if;
  return null;
end $$;

drop trigger if exists match_requests_after_trg on public.match_requests;
create trigger match_requests_after_trg after update on public.match_requests
  for each row execute function public.match_requests_after();

-- ---------- 3) 카드 읽기 규칙 (상태에 따라) ----------
-- 게시된 카드 / 본인 카드 / 룸메가 확정된 상대의 카드만 읽을 수 있음
drop policy if exists "posts_read" on public.roommate_posts;
create policy "posts_read" on public.roommate_posts for select to authenticated
  using (
    status = 'published'
    or auth.uid() = user_id
    or exists (
      select 1 from public.match_requests m
       where m.status = 'accepted'
         and ((m.from_id = auth.uid() and m.to_id = roommate_posts.user_id)
           or (m.to_id = auth.uid() and m.from_id = roommate_posts.user_id))
    )
  );
