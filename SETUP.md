# KHUMATE 처음 실행하기 (초보자용)

전체 순서: ① Node.js 설치 → ② Supabase 프로젝트 만들기 → ③ SQL 실행 → ④ 메일 인증 끄기 → ⑤ 키를 .env 에 붙여넣기 → ⑥ 서버 실행

## ① Node.js 설치
- https://nodejs.org 에서 **LTS** 버전을 받아 설치합니다.
- 설치 확인: 터미널(Windows는 PowerShell)에서 `node -v` 를 치면 버전이 나와야 합니다.

## ② Supabase 프로젝트 만들기
1. https://supabase.com 가입(GitHub·구글 로그인 가능) → **New project**
2. 이름 아무거나, **Database Password** 는 만들어서 따로 적어 두기, Region 은 **Northeast Asia (Seoul)** 추천 → Create
3. 1~2분 기다리면 프로젝트가 만들어집니다.

## ③ SQL 실행 (데이터베이스 만들기)
왼쪽 메뉴 **SQL Editor** → **New query** → 파일 내용을 통째로 붙여넣고 **Run**.
- **`posts-setup.sql`** (룸메이트 글 테이블) ← 새 프로젝트는 이것만 실행하면 됩니다.
- `auth-setup.sql` / `posts-migration-1.sql` 은 **예전 버전을 이미 실행해 둔 경우에만** 필요합니다. (옛 "학교 메일만 가입" 규칙을 지우는 파일)
"Success" 가 나오면 정상입니다. 왼쪽 **Table Editor** 에 `roommate_posts` 가 보이면 확인 끝.

## ④ 로그인 설정 (메일 인증 끄기) ← 가장 중요
이 앱은 **아이디 + 비밀번호만으로** 가입합니다. (내부적으로 `아이디@khumate.app` 형태로 저장하지만 메일은 절대 보내지 않습니다.)
1. **Authentication → Sign In / Providers → Email** 에서
   - Email 로그인은 **켜짐**
   - **Confirm email** 은 **끔(OFF)**  ← 이걸 꺼야 인증 없이 가입과 동시에 로그인됩니다. 안 끄면 "Confirm email 을 꺼 주세요" 안내가 뜹니다.
2. 끝! 메일 템플릿·SMTP 설정은 필요 없습니다.

## ⑤ 키 복사해서 .env 만들기
1. Supabase **Project Settings → API Keys** 에서
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** 키 (새 화면에서는 *Publishable key* 로 보일 수 있음. 둘 다 사용 가능)
   를 복사합니다. ⚠️ `service_role` / `secret` 키는 **절대** 쓰지 마세요.
2. `khumate-server` 폴더에서 `.env.example` 을 복사해 이름을 `.env` 로 바꿉니다.
   - Mac: `cp .env.example .env`   /   Windows: `copy .env.example .env`
3. `.env` 를 열어 값을 붙여넣습니다.
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=복사한_키
PORT=3000
LOGIN_EMAIL_DOMAIN=khumate.app
```

## ⑥ 실행
```
cd khumate-server
npm install
npm start
```
"✅ 서버 실행 중: http://localhost:3000" 이 뜨면 브라우저에서 http://localhost:3000 을 엽니다. (끄려면 터미널에서 Ctrl+C)

## 동작 확인 순서
1. 회원가입 탭 → 아이디(영문 소문자·숫자·_ 4~20자) + 비밀번호 8자 이상 → 가입하기 (바로 로그인됨)
2. 하단 "내 정보 수정하기" → 전부 답하고 **게시하기**
3. 다른 아이디로 하나 더 가입해서(같은 성별·같은 거주 기간) 게시하면 서로 매칭률이 보입니다.

## 자주 막히는 곳
| 증상 | 원인 / 해결 |
|---|---|
| 서버가 `.env 파일에 ... 적어 주세요` 하고 꺼짐 | `.env` 가 `khumate-server` 폴더에 없거나 값이 비어 있음 |
| 가입 후 "Confirm email 을 꺼 주세요" | ④-1 (Confirm email 이 아직 켜져 있음) |
| 가입 시 "Email address ... is invalid" 류 오류 | Supabase 가 가짜 메일 도메인을 거부하는 경우. 알려 주시면 서버에서 가입시키는 방식으로 바꿔 드립니다 |
| "이미 사용 중인 아이디예요" | 다른 아이디로 가입 |
| 글 저장 실패 | ③ SQL 을 안 돌렸거나 로그인 풀림. 브라우저 F12 → Console 의 빨간 오류 확인 |
| 목록이 계속 "불러오는 중" | `.env` 키가 틀림. 다시 복사 |

## 알아두기
- **비밀번호를 잊으면 찾을 방법이 없습니다.** (메일이 없으므로)
- 누구나 계정을 만들 수 있어서, 학교 구성원 확인은 되지 않습니다.

## 테스트(선택)
`node tests/matching.test.js` — 매칭 점수 계산 검증 (설치 없이 실행됨)

---

## 🤖 AI 분석 설정 (선택)

비워 두면 규칙 점수만 보여요. 설정하면 목록의 "🤖 AI 정밀 분석" 버튼으로 상위 20명을 정밀 분석해 팝업으로 보여줘요. 목록 정렬(관련순)은 AI 없이도 전체가 즉시 적용돼요.

1. **SQL 실행**: Supabase SQL Editor 에서 `ai-match-setup.sql` 실행 (새 프로젝트, 기존 프로젝트 모두 동일)
2. **키 교체**: 채팅에 노출된 키는 폐기하고 새 키 발급
3. **모델 확인**: `curl -H "Authorization: Bearer 새_키" https://factchat-cloud.mindlogic.ai/v1/gateway/models/` 로 모델 이름 확인
4. **`khumate-server/.env` 에 추가**
   ```
   CHATBOT_BASE_URL=https://factchat-cloud.mindlogic.ai/v1/gateway
   CHATBOT_API_KEY=새_키
   CHATBOT_MODEL=확인한_모델_이름
   ```
5. **패키지 설치 후 실행**: `khumate-server` 에서 `npm install` → `npm start`
   - 서버 시작 줄에 `🤖 AI 분석 사용 가능` 이 보이면 정상이에요.
6. **배포 중이라면**: Render 의 Environment 에도 같은 3개 값을 넣고 다시 Deploy

비용: 버튼을 누를 때만 호출하고, 같은 쌍은 캐시해서 다시 부르지 않아요. 사람당 1시간에 10번까지 호출을 제한해요.

---

## 🔗 룸메 매칭 · 확정 설정 (Supabase)

Supabase > SQL Editor 에서 아래 순서로 한 번씩 실행하세요. 여러 번 실행해도 안전합니다.

1. `posts-setup.sql` (처음 만드는 경우) 또는 `posts-migration-1.sql` (이미 있는 경우)
2. `messages-setup.sql` (쪽지)
3. `ai-match-setup.sql` (AI 분석 결과 저장, 선택)
4. `match-requests-setup.sql` (카드 상태 · 룸메 신청)
5. `match-v2-setup.sql` (확정 해제 · 확정 시 자동 보관 · 확정 카드 복사본)
6. `match-v3-setup.sql` (해제 시 카드 다시 게시 · 확정 기록 삭제)

처음 한 번 실행한 뒤에는 다른 설정이 없습니다. 서버 설정(`.env`)도 바뀌지 않습니다.
