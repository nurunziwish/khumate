-- 이미 roommate_posts 테이블이 있는 경우 1회 실행 (Supabase > SQL Editor). 여러 번 실행해도 안전합니다.
-- 하는 일: schema_version 추가 / 입력값 검증 제약 추가 / 매칭용 인덱스 추가 / 학교 메일 트리거 제거
--
-- ⚠️ 기존 글은 schema_version = 0 이 됩니다. 예전 폼은 "안 건드린 항목도 기본값으로 저장"했기 때문에
--    매칭에는 쓰지 않고(0은 매칭 제외), 사용자가 새 질문지로 다시 게시하면 1이 됩니다.
--    테스트 글을 정리하려면 아래 한 줄의 주석을 풀어서 실행하세요.
-- delete from public.roommate_posts;

alter table public.roommate_posts
  add column if not exists schema_version int not null default 0;

alter table public.roommate_posts drop constraint if exists roommate_posts_schema_version_check;
alter table public.roommate_posts add  constraint roommate_posts_schema_version_check check (schema_version >= 0);

-- 출생년도: 1980~2019 의 4자리
alter table public.roommate_posts drop constraint if exists roommate_posts_birth_year_check;
alter table public.roommate_posts add  constraint roommate_posts_birth_year_check
  check (birth_year ~ '^(19[89][0-9]|20[01][0-9])$');

-- 거주 기간: 폼의 선택지와 동일한 값만
alter table public.roommate_posts drop constraint if exists roommate_posts_dorm_period_check;
alter table public.roommate_posts add  constraint roommate_posts_dorm_period_check
  check (dorm_period in ('한 학기','반년','연간(1년)'));

-- 학과 길이
alter table public.roommate_posts drop constraint if exists roommate_posts_dept_check;
alter table public.roommate_posts add  constraint roommate_posts_dept_check
  check (char_length(dept) <= 30);

-- answers: JSON 객체 + 크기 제한(약 20KB)
alter table public.roommate_posts drop constraint if exists roommate_posts_answers_check;
alter table public.roommate_posts add  constraint roommate_posts_answers_check
  check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 20000);

-- 매칭 후보 조회용 인덱스
create index if not exists roommate_posts_match_idx
  on public.roommate_posts (gender, dorm_period, schema_version);

-- 예전 학교 메일 트리거 제거 (아이디/비밀번호 가입으로 변경됨 — auth-setup.sql 과 동일)
drop trigger if exists enforce_school_email_trg on auth.users;
drop function if exists public.enforce_school_email();
