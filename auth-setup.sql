-- (선택) 예전 "학교 메일(@khu.ac.kr)만 가입" 트리거 제거 — 아이디/비밀번호 가입으로 바뀌어서 더 이상 쓰지 않습니다.
-- 새 프로젝트라면 실행하지 않아도 되고, 이전에 실행했다면 반드시 1회 실행해야 가입이 됩니다. (여러 번 실행해도 안전)
drop trigger if exists enforce_school_email_trg on auth.users;
drop function if exists public.enforce_school_email();
