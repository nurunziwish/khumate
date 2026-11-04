-- 룸메 매칭 · 확정 설정 (Supabase > SQL Editor 에서 1회 실행. 여러 번 실행해도 안전)
-- 하는 일
--  1) 카드 상태: draft(임시저장) · published(게시) · archived(보관, 데이터는 남기고 목록에서만 숨김)
--  2) 룸메 신청: 채팅에서 보내고, 받은 사람이 수락하면 '룸메 확정'
--  3) 확정 시 두 사람의 카드는 자동으로 보관 상태가 되고, 카드 내용은 match_snapshots 에 따로 복사됨
--     (카드를 삭제해도 남고, 확정 중 카드를 고치면 복사본도 같이 고쳐짐)
--  4) 확정 해제(ended): 해제하면 카드를 다시 게시하고, 확정 기록(복사본)은 지움. 해제 후 다시 신청 가능
--  5) 확정 중에는 카드를 게시로 되돌릴 수 없음 (보관으로 유지)

-- ---------- 1) 카드 상태 ----------
alter table public.roommate_posts add column if not exists status text not null default 'published';
alter table public.roommate_posts drop constraint if exists roommate_posts_status_check;
alter table public.roommate_posts add  constraint roommate_posts_status_check check (status in ('draft','published','archived'));

create index if not exists roommate_posts_list_idx
  on public.roommate_posts (status, gender, dorm_period, schema_version);

-- ---------- 2) 룸메 신청 ----------
create table if not exists public.match_requests (
  id           bigint generated always as identity primary key,
  from_id      uuid not null references auth.users(id) on delete cascade,
  to_id        uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);

-- 상태 값 목록 (이미 만든 적이 있어도 'ended' 가 들어가도록 다시 맞춤)
alter table public.match_requests drop constraint if exists match_requests_status_check;
alter table public.match_requests add  constraint match_requests_status_check
  check (status in ('pending','accepted','rejected','cancelled','ended'));

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

-- ---------- 3) 신청 상태 변경 규칙 (트리거가 검사) ----------
--  · 만들 때는 대기(pending)로만, 둘 중 한 명이라도 이미 확정이면 불가
--  · 받은 사람만 수락·거절, 보낸 사람만 취소
--  · 확정된 룸메는 두 사람 중 누구나 '확정 해제(ended)'만 가능
--  · 신청 내용(보낸 사람·받는 사람·시간)은 못 바꿈
create or replace function public.match_requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;   -- 자동 처리(수락 시 거절 등)에서 다시 들어온 경우는 통과
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
  -- 확정된 룸메: 두 사람 중 누구나 확정 해제만 가능
  if old.status = 'accepted' then
    if new.status = 'ended' and auth.uid() in (old.from_id, old.to_id) then
      new.responded_at := now();
      return new;
    end if;
    raise exception '확정된 룸메는 확정 해제로만 바꿀 수 있어요.';
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

-- ---------- 4) 카드 복사본 (확정 기록) ----------
create table if not exists public.match_snapshots (
  match_id        bigint not null references public.match_requests(id) on delete cascade,
  owner_id        uuid   not null references auth.users(id) on delete cascade,
  title           text   not null default '',
  gender          text   not null default '',
  dorm_period     text   not null default '',
  dept            text   not null default '',
  student_id      text   not null default '',
  birth_year      text   not null default '',
  answers         jsonb  not null default '{}'::jsonb,
  schema_version  int    not null default 0,
  card_updated_at timestamptz,
  snapshot_at     timestamptz not null default now(),
  primary key (match_id, owner_id)
);

alter table public.match_snapshots enable row level security;
drop policy if exists "snap_select" on public.match_snapshots;
-- 읽기만 가능: 본인 복사본, 또는 같은 신청의 두 사람. 쓰기는 아래 트리거(서버 권한)만 함
create policy "snap_select" on public.match_snapshots for select to authenticated
  using (
    owner_id = auth.uid() or exists (
      select 1 from public.match_requests m
       where m.id = match_snapshots.match_id and auth.uid() in (m.from_id, m.to_id))
  );

-- ---------- 5) 수락 / 해제 시 처리 ----------
--  수락: 나머지 대기 신청 거절 + 두 사람 카드 보관 + 카드 복사본 만들기
--  해제: 카드를 다시 게시하고, 확정 기록(복사본)은 지움
create or replace function public.match_requests_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    update public.match_requests set status = 'rejected', responded_at = now()
     where status = 'pending' and id <> new.id
       and (from_id in (new.from_id, new.to_id) or to_id in (new.from_id, new.to_id));
    update public.roommate_posts set status = 'archived'
     where user_id in (new.from_id, new.to_id) and status <> 'archived';
    insert into public.match_snapshots (match_id, owner_id, title, gender, dorm_period, dept, student_id, birth_year, answers, schema_version, card_updated_at)
    select new.id, p.user_id, p.title, p.gender, p.dorm_period, p.dept, p.student_id, p.birth_year, p.answers, p.schema_version, p.updated_at
      from public.roommate_posts p where p.user_id in (new.from_id, new.to_id)
    on conflict (match_id, owner_id) do nothing;
  end if;

  if new.status = 'ended' and old.status = 'accepted' then
    update public.roommate_posts set status = 'published'
     where user_id in (new.from_id, new.to_id) and status = 'archived';
    delete from public.match_snapshots where match_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists match_requests_after_trg on public.match_requests;
create trigger match_requests_after_trg after update on public.match_requests
  for each row execute function public.match_requests_after();

-- ---------- 6) 카드 읽기 규칙 ----------
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

-- ---------- 7) 카드 수정 시 규칙 ----------
-- 7-1) 확정 중인 사람이 '게시'로 바꾸면 보관 상태로 되돌림
create or replace function public.posts_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and exists (
       select 1 from public.match_requests m
        where m.status = 'accepted' and new.user_id in (m.from_id, m.to_id)) then
    new.status := 'archived';
  end if;
  return new;
end $$;

drop trigger if exists roommate_posts_before_write_trg on public.roommate_posts;
create trigger roommate_posts_before_write_trg before insert or update on public.roommate_posts
  for each row execute function public.posts_before_write();

-- 7-2) 확정 중인 사람의 카드가 바뀌면, 진행 중인 확정의 복사본도 새 내용으로 고침
create or replace function public.posts_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.match_snapshots (match_id, owner_id, title, gender, dorm_period, dept, student_id, birth_year, answers, schema_version, card_updated_at, snapshot_at)
  select m.id, new.user_id, new.title, new.gender, new.dorm_period, new.dept, new.student_id, new.birth_year, new.answers, new.schema_version, new.updated_at, now()
    from public.match_requests m
   where m.status = 'accepted' and new.user_id in (m.from_id, m.to_id)
  on conflict (match_id, owner_id) do update set
    title = excluded.title, gender = excluded.gender, dorm_period = excluded.dorm_period, dept = excluded.dept,
    student_id = excluded.student_id, birth_year = excluded.birth_year, answers = excluded.answers,
    schema_version = excluded.schema_version, card_updated_at = excluded.card_updated_at, snapshot_at = now();
  return null;
end $$;

drop trigger if exists roommate_posts_after_write_trg on public.roommate_posts;
create trigger roommate_posts_after_write_trg after insert or update on public.roommate_posts
  for each row execute function public.posts_after_write();