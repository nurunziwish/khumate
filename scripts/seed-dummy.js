// ================= 매칭 점검용 더미 계정 · 글 만들기 =================
// 질문지(profile-schema.js)를 읽어서 '내 정보'와 '원하는 룸메' 모든 항목에 답을 채웁니다.
// 답이 빠진 항목이 있으면 아무것도 저장하지 않고 목록을 보여 줍니다. (화면의 필수 입력 검사와 같은 기준)
//
// 사용 (저장소 루트에서):
//   node khumate-server/scripts/seed-dummy.js            더미 계정 만들고 글 게시
//   node khumate-server/scripts/seed-dummy.js --check    DB 없이 답변 완성도만 검사
//   node khumate-server/scripts/seed-dummy.js --cleanup  더미 계정의 글 삭제 (계정은 남음)
//
// 필요한 값 (khumate-server/.env): SUPABASE_URL, SUPABASE_ANON_KEY, LOGIN_EMAIL_DOMAIN(선택)
// service_role 키는 쓰지 않습니다. 대신 각 더미 계정으로 로그인해서 글을 올립니다 (RLS 그대로 적용).
// 전제: Supabase 의 Confirm email 이 꺼져 있어야 함 (auth.js 와 같은 조건)
// 옵션 환경변수: DUMMY_COUNT (기본 12, 짝수), DUMMY_PASSWORD (기본 값은 아래 참고), DUMMY_SEED

const path = require('path');
const { PROFILE_SCHEMA, SCHEMA_VERSION } = require('../../khumate-client/profile-schema.js');

const argv = process.argv.slice(2);
const MODE = argv.includes('--check') ? 'check' : argv.includes('--cleanup') ? 'cleanup' : 'seed';
const COUNT = Number(process.env.DUMMY_COUNT) || 12;
const PASSWORD = process.env.DUMMY_PASSWORD || 'khumate-dummy-2026';   // 테스트용. 실제 서비스 계정에는 쓰지 마세요
const DOMAIN = process.env.LOGIN_EMAIL_DOMAIN || 'khumate.app';
const SEED = Number(process.env.DUMMY_SEED) || 20261108;

// ---------- 난수 (같은 SEED면 항상 같은 더미가 나옴) ----------
function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRand(SEED);
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pickOne = arr => arr[Math.floor(rand() * arr.length)];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// 자기소개·글 제목 문구: 별도 난수로 고름 (질문 답은 그대로 두고, 문구만 매번 다양하게)
const textRand = makeRand(SEED + 7);
const textPick = arr => arr[Math.floor(textRand() * arr.length)];

const LEAN_INTRO = ['일찍 자고 아침에 정리하는 편이에요.', '적당히 외출하고 청소는 주기적으로 해요.', '밤에 활동이 많고 자유로운 편이에요.'];
const LEAN_TITLE = ['아침형 · 정리 잘하는 편', '적당히 활동적인 편', '밤형 · 자유로운 편'];
const INTRO_LINES = [
  p => `${p.name}입니다. ${LEAN_INTRO[p.lean]} 서로 존중하며 지내고 싶어요.`,
  p => `안녕하세요, ${p.name}입니다. ${LEAN_INTRO[p.lean]} 처음이라 조금 긴장되지만 잘 맞추고 싶어요.`,
  p => `${p.name}이라고 해요. ${LEAN_INTRO[p.lean]} 불편한 게 있으면 그때그때 말하는 편이에요.`,
  p => `${p.name}입니다! ${LEAN_INTRO[p.lean]} 편하게 지낼 수 있는 룸메를 만나고 싶어요.`,
  p => `반갑습니다, ${p.name}입니다. ${LEAN_INTRO[p.lean]} 생활 규칙은 미리 맞춰 두는 게 좋다고 생각해요.`,
  p => `${p.name}입니다. ${LEAN_INTRO[p.lean]} 방은 같이 쓰는 공간이니 서로 배려하며 지내요.`,
  p => `안녕하세요. ${p.name}이에요. ${LEAN_INTRO[p.lean]} 필요한 건 솔직하게 얘기하고 싶어요.`,
  p => `${p.name}입니다. 취미 얘기하면서 친하게 지내고 싶어요. ${LEAN_INTRO[p.lean]}`,
];
const TITLE_LINES = [
  p => `${LEAN_TITLE[p.lean]} 룸메 구해요`,
  p => `함께 살기 편한 ${p.label}`,
  p => `생활 리듬 맞는 룸메 찾아요 (${p.label})`,
  p => `${p.label} · ${LEAN_TITLE[p.lean]}`,
  p => `규칙 잘 지키는 룸메 찾는 ${p.label}`,
  p => `${LEAN_TITLE[p.lean]}, 같이 잘 지내요`,
];
const titleFor = p => `[더미] ${textPick(TITLE_LINES)(p)}`.slice(0, 60);
const pad2 = n => String(n).padStart(2, '0');

// ---------- 질문지 구조 (profile-form.js 의 규칙과 같게) ----------
const sectionScope = s => s.scope || 'me';
const isStatic = f => f.type === 'placeholder' || f.type === 'fixed';   // 저장하지 않는 칸
const plainLabel = t => String(t ?? '').replace(/\s*\[추가\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
const condOk = (when, res) => { const v = res[when.name]; return Array.isArray(v) ? v.includes(when.value) : v === when.value; };
const isEmptyAnswer = v => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

// 탭별 질문 목록 (group 은 안의 항목으로 펼침)
const fieldsOf = scope => PROFILE_SCHEMA.filter(s => sectionScope(s) === scope)
  .flatMap(s => s.fields.flatMap(f => (f.type === 'group' ? f.fields.map(sub => ({ ...sub, _group: f.label })) : [f])));
const ALL_FIELDS = [...fieldsOf('me'), ...fieldsOf('roommate')];

// 단과대 목록과 단과대별 학과 (내 정보의 학과 선택지 group 값으로 묶음)
const basicFields = fieldsOf('me');
const COLLEGE_OPTS = basicFields.find(f => f.name === 'college').options.map(o => o.value);
const DEPT_OPTS = basicFields.find(f => f.name === 'dept').options;
const deptsOf = college => DEPT_OPTS.filter(o => o.group === college).map(o => o.value);
const RM_DEPT_OPTS = ALL_FIELDS.find(f => f.name === 'rm_dept').options.map(o => o.value);
const HOBBY_OPTS = ALL_FIELDS.find(f => f.name === 'hobby').options.map(o => o.label);

// 시간 범위별 가능한 시각 (wake_time [5,12], sleep_time [21,4] 는 자정을 넘김)
const hoursIn = ([a, b]) => { const out = []; for (let h = a; ; h = (h + 1) % 24) { out.push(h); if (h === b) break; } return out; };

// ---------- 더미 사람 (성향 묶음 lean 0~2 로 답이 비슷한 사람끼리 모임) ----------
const NAMES = ['김', '이', '박', '최', '정', '윤', '장', '임', '한', '오', '서', '신'];
function makePersonas() {
  const half = COUNT / 2;
  const dorms = ['한 학기', '반년', '연간(1년)'];
  const out = [];
  for (const gender of ['남성', '여성']) {
    for (let i = 0; i < half; i++) {
      const tag = gender === '남성' ? 'm' : 'f';
      const lean = i % 3;
      out.push({
        key: `dummy_${tag}${pad2(i + 1)}`,
        label: `${gender} ${i + 1}번`,
        gender,
        dorm_period: dorms[Math.floor(i / 2) % 3],   // 두 명씩 같은 거주 기간 → 같은 조건에서 서로 후보가 됨
        lean,
        college: COLLEGE_OPTS[(i + (gender === '남성' ? 0 : 3)) % COLLEGE_OPTS.length],
        student_id: String(20 + ((i + lean) % 7)),           // 20~26학번
        birth_year: String(2000 + ((i * 2 + lean) % 7)),     // 2000~2006년생
        name: NAMES[(i + lean) % NAMES.length],
      });
    }
  }
  return out;
}

// ---------- 답 만들기 ----------
// 성향 묶음 선호 선택지 70%, 나머지는 무작위 (완전히 같은 사람만 나오지 않게)
const leanPick = (opts, p) => (rand() < 0.7 ? opts[p.lean % opts.length] : pickOne(opts));

function answerFor(f, p, res) {
  switch (f.type) {
    case 'radio':
      return leanPick(f.options.map(o => o.value), p);
    case 'select':
      return leanPick(f.options.map(o => o.value), p);
    case 'checkbox': {
      const vals = f.options.map(o => o.value);
      if (vals.includes('any')) return ['any'];
      const first = leanPick(vals, p);
      const second = rand() < 0.3 ? pickOne(vals.filter(v => v !== first)) : null;
      return second ? [first, second] : [first];
    }
    case 'combo':
      if (f.name === 'college') return p.college;
      if (f.name === 'dept') return pickOne(deptsOf(p.college));
      return leanPick(f.options.map(o => o.value), p);
    case 'tags': {
      if (f.name === 'rm_dept') {
        const pool = RM_DEPT_OPTS.filter(d => deptsOf(p.college).includes(d));
        return [...new Set([pickOne(pool.length ? pool : RM_DEPT_OPTS), pickOne(RM_DEPT_OPTS)])];
      }
      // 취미: 3~5개
      const n = randInt(3, 5), set = new Set();
      while (set.size < n) set.add(pickOne(HOBBY_OPTS));
      return [...set];
    }
    case 'range': {
      if (f.ticks) return randInt(0, f.ticks.length - 1);
      const base = [2, 3, 4][p.lean];
      return clamp(base + randInt(-1, 1), f.min, f.max);
    }
    case 'dual': {   // 룸메 범위 슬라이더: 문자열(JSON {lo,hi})로 저장됨 (profile-form.js 와 같음)
      const min = f.ticks ? 0 : f.min, max = f.ticks ? f.ticks.length - 1 : f.max;
      const base = f.ticks ? clamp(p.lean, 0, max) : clamp([2, 3, 4][p.lean], min, max);
      const lo = clamp(base - randInt(0, 2), min, max), hi = clamp(base + randInt(0, 2), lo, max);
      return JSON.stringify({ lo, hi });
    }
    case 'span': {   // 학번·나이 차이: 객체 {lo,hi} (-3~3)
      const a = randInt(-3, 3), b = randInt(-3, 3);
      return { lo: Math.min(a, b), hi: Math.max(a, b) };
    }
    case 'time': {   // 기상·취침 'HH:MM'
      const hs = hoursIn(f.span);
      return `${pad2(pickOne(hs))}:${pickOne(['00', '30'])}`;
    }
    case 'hourrange': {   // 룸메 기상·취침 범위 {from,to} (시 문자열)
      const hs = hoursIn(f.span);
      const a = randInt(0, hs.length - 2), b = randInt(a + 1, hs.length - 1);
      return { from: pad2(hs[a]), to: pad2(hs[b]) };
    }
    case 'number':
      return f.name === 'student_id' ? p.student_id : p.birth_year;
    case 'textarea':
    case 'text':
      if (f.name === 'intro') return textPick(INTRO_LINES)(p);   // 자기소개: 여러 문구 중 무작위
      return `${p.name}입니다. ${LEAN_INTRO[p.lean]} 서로 존중하며 지내고 싶어요.`;
    default:
      return undefined;
  }
}

// 한 사람의 답 (두 탭 전부). 기본 정보는 미리 정한 값을 씀
function buildAnswers(p) {
  const res = {};
  const preset = { gender: p.gender, dorm_period: p.dorm_period, college: p.college, dept: null,
    student_id: p.student_id, birth_year: p.birth_year, rm_fixed_gender: null, rm_fixed_dorm: null };
  preset.dept = pickOne(deptsOf(p.college));
  for (const f of ALL_FIELDS) {
    if (isStatic(f) || f.transient) continue;   // 고정 칸, 단과대(저장 안 함)
    // 조건에 안 맞는 하위 질문은 답하지 않은 것으로 (화면 저장과 같음: null / [])
    if (f.when && !condOk(f.when, res)) { res[f.name] = Array.isArray(f.default) ? [] : null; continue; }
    if (f.name in preset && preset[f.name] !== null) { res[f.name] = preset[f.name]; continue; }
    if (f.type === 'textarea' && f.name === 'intro') { res[f.name] = answerFor(f, p, res); continue; }
    res[f.name] = answerFor(f, p, res);
  }
  // 화면에서 저장하지 않는 값 (단과대 transient) 는 넣지 않음. 저장 형식 맞춤
  delete res.rm_college;
  return res;
}

// ---------- 완성도 검사 (findMissing 과 같은 기준 + 선택지·범위 확인) ----------
function checkAnswers(res) {
  const problems = [];
  for (const f of ALL_FIELDS) {
    if (isStatic(f) || f.transient) continue;
    if (f.when && !condOk(f.when, res)) continue;   // 숨은 질문은 필수 아님
    const v = res[f.name];
    if (!f.optional && isEmptyAnswer(v)) { problems.push(`빈 항목: ${f.name} (${plainLabel(f.label || f.sublabel)})`); continue; }
    if (isEmptyAnswer(v)) continue;   // 선택 항목을 비운 경우는 정상 (여기서는 전부 채움)
    if (f.digits && String(v).length !== f.digits) problems.push(`자리 수 오류: ${f.name}=${v}`);
    const vals = (f.options || []).map(o => o.value);
    const given = Array.isArray(v) ? v : [v];
    if (['radio', 'checkbox', 'select', 'combo'].includes(f.type) && vals.length) {
      const bad = given.filter(x => !vals.includes(x) && !(f.type === 'combo' && x));
      if (bad.length) problems.push(`선택지 밖 값: ${f.name}=${bad.join(',')}`);
    }
    if (f.type === 'range' && !f.ticks && (v < f.min || v > f.max)) problems.push(`범위 밖: ${f.name}=${v}`);
  }
  return problems;
}

// ---------- 실행 ----------
async function main() {
  const personas = makePersonas();
  const built = personas.map(p => ({ p, answers: buildAnswers(p) }));
  personas.forEach(p => { p.title = titleFor(p); });   // 글 제목 (문구 무작위)

  // 1) 답 검사
  let failed = 0;
  for (const { p, answers } of built) {
    const problems = checkAnswers(answers);
    if (problems.length) { failed++; console.log(`[${p.key}]`, problems.join(' / ')); }
  }
  const total = ALL_FIELDS.filter(f => !isStatic(f) && !f.transient).length;
  console.log(`질문 ${total}개 기준, 더미 ${personas.length}명 답변 검사: ${failed ? `문제 ${failed}명` : '모든 항목 답변 완료'}`);
  if (failed) { console.log('문제가 있어 아무것도 저장하지 않았어요.'); process.exit(1); }
  if (MODE === 'check') return;

  // 2) 계정 준비 + 글 올리기 (각 계정으로 로그인해서 RLS 그대로 적용)
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
  if (!URL_ || !KEY) { console.log('khumate-server/.env 에 SUPABASE_URL, SUPABASE_ANON_KEY 가 필요해요.'); process.exit(1); }
  const { createClient } = require('@supabase/supabase-js');
  const clientFor = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  for (const { p, answers } of built) {
    const email = `${p.key}@${DOMAIN}`;
    const sb = clientFor();
    let user = null;
    let { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (!error) user = data.user;
    if (MODE === 'cleanup') {
      if (!user) { console.log(`${p.key}: 로그인 못 함 (건너뜀)`); continue; }
      const { error: dErr } = await sb.from('roommate_posts').delete().eq('user_id', user.id);
      console.log(dErr ? `${p.key}: 삭제 실패 ${dErr.message}` : `${p.key}: 글 삭제`);
      continue;
    }
    if (!user) {
      ({ data, error } = await sb.auth.signUp({ email, password: PASSWORD }));
      if (error) throw new Error(`${p.key} 가입 실패: ${error.message}`);
      if (!data.session) throw new Error('이메일 확인이 켜져 있어요. Supabase 에서 Confirm email 을 끈 뒤 다시 실행하세요.');
      user = data.user;
    }
    const row = {
      user_id: user.id,
      title: p.title,
      gender: p.gender,
      dorm_period: p.dorm_period,
      dept: answers.dept || '',
      student_id: p.student_id,
      birth_year: p.birth_year,
      answers: { ...answers, student_id: p.student_id, birth_year: p.birth_year },
      schema_version: SCHEMA_VERSION,
      status: 'published',
    };
    const { error: uErr } = await sb.from('roommate_posts').upsert(row, { onConflict: 'user_id' });
    console.log(uErr ? `${p.key}: 글 저장 실패 ${uErr.message}` : `${p.key}: 글 게시 (${p.gender}, ${p.dorm_period})`);
  }
  if (MODE === 'seed') {
    console.log(`\n완료. 로그인 아이디: dummy_m01 ~ dummy_f06 (비밀번호: DUMMY_PASSWORD 또는 기본값)`);
    console.log('같은 성별·같은 거주 기간끼리 후보가 됩니다. 쌍: 1·2번, 3·4번, 5·6번 (남·여 각각)');
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });