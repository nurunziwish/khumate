-- 쪽지(1:1 메시지) 테이블 (Supabase > SQL Editor 에서 1회 실행. 여러 번 실행해도 안전)
-- 보낸 사람·받은 사람만 읽을 수 있고, 보내기는 본인이 보낸 것만 가능합니다.
-- 쪽지 수 제한은 아직 없음 (나중에 추가 예정)
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  check (from_id <> to_id)
);

create index if not exists messages_to_idx on public.messages (to_id, read_at);
create index if not exists messages_pair_idx on public.messages (least(from_id, to_id), greatest(from_id, to_id), created_at);

alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated
  using (auth.uid() = from_id or auth.uid() = to_id);

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (auth.uid() = from_id);

-- 받은 쪽지만 '읽음 표시'를 바꿀 수 있음
drop policy if exists "messages_read_mark" on public.messages;
create policy "messages_read_mark" on public.messages
  for update to authenticated
  using (auth.uid() = to_id)
  with check (auth.uid() = to_id);

-- 읽음 표시 외의 칸(내용·보낸이·받는이·시간)은 바꾸지 못하게 막음
create or replace function public.messages_lock_fields() returns trigger
language plpgsql as $$
begin
  if new.body <> old.body or new.from_id <> old.from_id or new.to_id <> old.to_id or new.created_at <> old.created_at then
    raise exception '쪽지 내용은 바꿀 수 없어요.';
  end if;
  return new;
end $$;

drop trigger if exists messages_lock on public.messages;
create trigger messages_lock before update on public.messages
  for each row execute function public.messages_lock_fields();
