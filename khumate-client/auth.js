// ================= 아이디 + 비밀번호 로그인 (메일 인증 없음) =================
// Supabase Auth 는 "메일 형식" 계정 이름이 필요해서, 사용자가 입력한 아이디를 내부적으로
// `아이디@LOGIN_EMAIL_DOMAIN` 으로 바꿔서 사용합니다. (실제 메일은 보내지 않음, 사용자는 메일을 몰라도 됨)
// ※ Supabase 대시보드에서 "Confirm email" 을 꺼 두어야 인증 없이 바로 가입·로그인됩니다. (SETUP.md 참고)
// 의존: CDN supabase-js, /supabase-config.js (서버가 .env 값으로 만들어 줌)

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);

const MIN_PW = 8;
const USERNAME_RE = /^[a-z0-9_]{4,20}$/;   // 영문 소문자·숫자·밑줄, 4~20자
const toEmail = username => `${username}@${LOGIN_EMAIL_DOMAIN}`;
const usernameOf = user => (user?.email || '').split('@')[0];

function setMsg(text, isError = true) {
  const el = $('auth-msg');
  el.textContent = text;
  el.className = `text-xs mt-3 ${isError ? 'text-red-500' : 'text-green-600'}`;
}

// 화면 전환: 'login' | 'signup'
function showAuthView(view) {
  ['login', 'signup'].forEach(v => $(`auth-view-${v}`).classList.toggle('hidden', v !== view));
  const active = 'text-red-600 border-red-500', idle = 'text-slate-400 border-transparent';
  $('auth-tab-login').className  = `flex-1 pb-2 text-sm font-bold border-b-2 ${view === 'login' ? active : idle}`;
  $('auth-tab-signup').className = `flex-1 pb-2 text-sm font-bold border-b-2 ${view === 'signup' ? active : idle}`;
  setMsg('');
}

function openAuthModal(view = 'login') { showAuthView(view); $('auth-modal').classList.remove('hidden'); }
function closeAuthModal() { $('auth-modal').classList.add('hidden'); }

const normName = id => $(id).value.trim().toLowerCase();
const USERNAME_RULE_TEXT = '아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 입력해 주세요.';

// 버튼 중복 클릭 방지 래퍼
async function withBusy(btnId, fn) {
  const btn = $(btnId); btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

// ---- 로그인 ----
const login = () => withBusy('auth-login-btn', async () => {
  const username = normName('login-id'), password = $('login-pw').value;
  if (!USERNAME_RE.test(username)) return setMsg(USERNAME_RULE_TEXT);
  if (!password) return setMsg('비밀번호를 입력해 주세요.');

  const { error } = await sb.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) {
    return setMsg(/not confirmed/i.test(error.message)
      ? 'Supabase 설정에서 "Confirm email" 을 꺼 주세요. (SETUP.md 참고)'
      : '아이디 또는 비밀번호가 맞지 않아요.');
  }
  closeAuthModal();
});

// ---- 회원가입: 아이디 + 비밀번호만 (인증 없이 바로 가입 완료, 자동 로그인) ----
const signUp = () => withBusy('auth-signup-btn', async () => {
  const username = normName('signup-id'), pw = $('signup-pw').value;
  if (!USERNAME_RE.test(username)) return setMsg(USERNAME_RULE_TEXT);
  if (pw.length < MIN_PW) return setMsg(`비밀번호는 ${MIN_PW}자 이상으로 해 주세요.`);
  if (pw !== $('signup-pw2').value) return setMsg('비밀번호 확인이 일치하지 않아요.');

  const { data, error } = await sb.auth.signUp({ email: toEmail(username), password: pw });
  if (error) {
    console.error(error);
    if (/already|registered/i.test(error.message)) return setMsg('이미 사용 중인 아이디예요.');
    if (/rate|seconds|too many/i.test(error.message)) return setMsg('잠시 후 다시 시도해 주세요.');
    return setMsg(`가입에 실패했어요. (${error.message})`);
  }
  // 이미 있는 아이디면 Supabase 설정에 따라 에러 대신 identities 가 빈 사용자를 돌려줌
  if (data.user && data.user.identities?.length === 0) return setMsg('이미 사용 중인 아이디예요.');
  // 세션이 없다 = Supabase 에서 "Confirm email" 이 켜져 있어서 인증을 기다리는 상태
  if (!data.session) return setMsg('Supabase 설정에서 "Confirm email" 을 꺼 주세요. (SETUP.md 참고)');
  closeAuthModal();   // 가입과 동시에 로그인됨
});

async function logout() {
  await sb.auth.signOut();
  location.reload();   // 로그아웃하면 화면을 새로고침해서 로그인 전 상태로
}

// 로그인 상태에 따라 헤더 버튼 갱신 (새로고침해도 세션 유지됨)
function renderAuthState(session) {
  const btn = $('auth-btn');
  btn.textContent = session ? '로그아웃' : '로그인';
  // 로그아웃은 회색, 로그인은 빨강
  btn.className = (session ? 'bg-slate-400 hover:bg-slate-500' : 'bg-red-600 hover:bg-red-700') + ' text-xs text-white font-semibold px-3 py-1 rounded-lg transition';
  btn.title = session ? `${usernameOf(session.user)} 님` : '';
  // 로그인 상태면 로그아웃 왼쪽에 내 아이디 표시
  const who = $('auth-user');
  if (who) { who.textContent = session ? usernameOf(session.user) : ''; who.classList.toggle('hidden', !session); }
  btn.onclick = session ? logout : () => openAuthModal('login');
  window.onAuthChanged?.(session);   // script.js 가 글 목록을 다시 불러옴
}

sb.auth.onAuthStateChange((_e, session) => renderAuthState(session));
sb.auth.getSession().then(({ data }) => renderAuthState(data.session));

// Enter 키로 제출
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || $('auth-modal').classList.contains('hidden')) return;
  const visible = ['login', 'signup'].find(v => !$(`auth-view-${v}`).classList.contains('hidden'));
  ({ login, signup: signUp })[visible]?.();
});