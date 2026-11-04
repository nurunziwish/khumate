-- 룸메이트 글 테이블 (Supabase > SQL Editor 에서 1회 실행)  ※ 새로 만드는 경우용
-- 이미 roommate_posts 가 있다면 이 파일 대신 posts-migration-1.sql 을 실행하세요.
--
-- 사용자 1명당 글 1개: user_id 가 기본키라서 두 번째 글은 "덮어쓰기"가 됩니다.
-- 설문 답안 전체는 answers(jsonb) 한 칸에 들어가므로, 설문 항목을 바꿔도 DB는 고칠 필요가 없습니다.
-- 대신 schema_version 으로 "어느 버전의 질문지로 답했는지"를 기록합니다. (매칭은 같은 버전 글끼리만)
-- (기존에 있던 posts 테이블은 건드리지 않습니다. 새 이름: roommate_posts)

create table if not exists public.roommate_posts (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  title          text not null default '룸메이트 구해요' check (char_length(title) between 1 and 60),
  gender         text not null check (gender in ('남성','여성')),
  dorm_period    text not null check (dorm_period in ('한 학기','반년','연간(1년)')),
  dept           text not null default '' check (char_length(dept) <= 30),
  student_id     text not null check (student_id ~ '^[0-9]{2}$'),
  birth_year     text not null check (birth_year ~ '^(19[89][0-9]|20[01][0-9])$'),   -- 1980~2019
  answers        jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 20000),
  schema_version int  not null default 0 check (schema_version >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 매칭 후보 조회용 인덱스: 같은 성별 + 같은 거주 기간 + 최신 질문지
create index if not exists roommate_posts_match_idx
  on public.roommate_posts (gender, dorm_period, schema_version);

-- 수정할 때마다 updated_at 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists roommate_posts_touch on public.roommate_posts;
create trigger roommate_posts_touch
  before update on public.roommate_posts
  for each row execute function public.touch_updated_at();

-- 보안 규칙(RLS): 로그인한 사람은 모든 글을 볼 수 있고, 쓰기/수정/삭제는 본인 글만 가능
alter table public.roommate_posts enable row level security;

drop policy if exists "posts_read"   on public.roommate_posts;
drop policy if exists "posts_insert" on public.roommate_posts;
drop policy if exists "posts_update" on public.roommate_posts;
drop policy if exists "posts_delete" on public.roommate_posts;

create policy "posts_read"   on public.roommate_posts for select to authenticated using (true);
create policy "posts_insert" on public.roommate_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "posts_update" on public.roommate_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts_delete" on public.roommate_posts for delete to authenticated using (auth.uid() = user_id);
