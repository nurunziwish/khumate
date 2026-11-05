// ================= 1. 탭 전환 기능 =================
function switchTab(tabName) {
  if (tabName === 'chatting') setTimeout(renderInbox, 0);   // 메시지함 탭을 열면 최신 목록
  if (tabName === 'houserule') setTimeout(renderHouseRule, 0);   // 하우스룰: 확정된 룸메의 카드 (matches.js)
  const tabs = ['matching', 'chatting', 'houserule'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const content = document.getElementById(`content-${t}`);
    
    if (btn && content) {
      if (t === tabName) {
        btn.className = "flex-1 py-3 text-sm font-bold text-red-600 border-b-2 border-red-600 transition";
        content.classList.remove('hidden');
      } else {
        btn.className = "flex-1 py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 transition";
        content.classList.add('hidden');
      }
    }
  });
}

// ================= 2. 모달(팝업창) 제어 기능 =================
function openFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (modal) modal.classList.add('hidden');
}

// 이전 버전 질문지로 쓴 글은 기본값이 섞여 있어서 폼을 비워서 다시 받습니다.
function answersForForm(post) {
  return post && (post.schema_version ?? 0) >= SCHEMA_VERSION ? (post.answers || {}) : {};
}

function openProfileEdit() {
  resetMissingWatch();
  if (!currentUser) {   // 로그인 필요
    openAuthModal('login');
    setMsg('로그인하면 내 정보를 작성할 수 있어요.', false);
    return;
  }
  // 임시 저장한 내용이 있으면 그걸, 없으면 이미 올린 글의 답안을 폼에 채워서 보여줌
  const draft = readDraft();
  renderProfileSections(draft ? draft.answers : answersForForm(myPost));
  const title = document.getElementById('post-title');
  title.value = draft ? draft.title : (myPost?.title || '');
  title.maxLength = 60;
  profileBaseline = formSnapshot();   // 연 직후 상태: 나중에 달라졌는지 확인하는 기준
  document.getElementById('profile-modal').classList.remove('hidden');
  if (draft) showToast('임시 저장한 내용을 불러왔어요.');
}

// ---------- 임시 저장 (저장하기 버튼) ----------
// 게시 전에 작성 중인 내용을 이 브라우저(localStorage)에 사용자별로 보관합니다. DB·목록에는 영향 없음.
// 질문지 버전이 바뀌면(SCHEMA_VERSION) 예전 임시 저장은 무시합니다.
const draftKey = () => `khumate-draft:${currentUser?.id}`;
function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()));
    return d && d.v === SCHEMA_VERSION && d.answers ? d : null;
  } catch { return null; }
}
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch {} }

async function saveDraft() {
  if (!currentUser) { closeProfileEdit(true); return openAuthModal('login'); }
  if (!(await khuConfirm('지금 내용 그대로 비공개 상태로 저장할까요?\n목록에서는 내려가고, 게시하기를 누르면 다시 올라가요.', { okText: '저장' }))) return;
  const title = document.getElementById('post-title').value;
  const p = collectProfile();   // 안 고른 항목은 null/'' 로 저장 → 다시 열면 미응답 상태 그대로
  // 1) 이 브라우저에 보관 (기존 방식)
  let ok = true;
  try { localStorage.setItem(draftKey(), JSON.stringify({ v: SCHEMA_VERSION, title, answers: p })); }
  catch { ok = false; }
  // 2) 카드도 DB에 임시저장 (목록·매칭에는 안 뜸). 필수 항목 없이 있는 만큼 저장 (빈 칸은 null)
  const studentId = digits(p.student_id), birthYear = digits(p.birth_year);
  const yearOk = birthYear.length === 4 && +birthYear >= 1980 && +birthYear <= 2019;
  let dbMsg = '카드를 보관했어요. 게시하기를 눌러야 목록에 올라가요.';
  try {
    await savePost({
      user_id: currentUser.id,
      title: title.trim().slice(0, 60) || '룸메이트 구해요',
      gender: p.gender || null, dorm_period: p.dorm_period || null, dept: p.dept || '',
      student_id: studentId.length === 2 ? studentId : null,
      birth_year: yearOk ? birthYear : null,
      answers: { ...p, student_id: studentId.length === 2 ? studentId : '', birth_year: yearOk ? birthYear : '' },
      schema_version: SCHEMA_VERSION,
      status: 'draft',
    });
    if (myPost?.status === 'published') dbMsg = '카드를 보관했어요. 목록에서 내려갔으니, 게시하기를 눌러야 다시 올라가요.';
  } catch (e) { console.error(e); dbMsg = '카드 보관에 실패했어요. 인터넷 연결을 확인해 주세요.'; }
  closeProfileEdit(true);
  showToast(ok ? dbMsg : '이 브라우저에서는 임시 저장을 할 수 없어요.');
  await loadPosts();
}

// 잠깐 떴다 사라지는 안내 문구
// ================= 사이트 서식 팝업 (브라우저 기본 창 대신) =================
// khuConfirm(문구) → 확인이면 true, 취소면 false / khuAlert(문구) → 확인만 있는 안내
function khuDialog({ message, okText = '확인', cancelText = null }) {
  return new Promise(resolve => {
    document.getElementById('khu-dialog')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'khu-dialog';
    wrap.className = 'fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div class="border-b border-slate-100 px-5 py-3">
          <p class="text-red-600 font-black tracking-tight">KHUMATE</p>
        </div>
        <div class="px-5 py-5">
          <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${esc(message)}</p>
        </div>
        <div class="px-5 pb-5 flex gap-2">
          ${cancelText ? `<button data-r="0" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition">${esc(cancelText)}</button>` : ''}
          <button data-r="1" class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition">${esc(okText)}</button>
        </div>
      </div>`;
    const close = v => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape' && cancelText) close(false);
      if (e.key === 'Enter') close(true);
    };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('button[data-r]');
      if (b) close(b.dataset.r === '1');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('button[data-r="1"]').focus();
  });
}
const khuConfirm = (message, opts = {}) => khuDialog({ message, cancelText: '취소', okText: '확인', ...opts });
const khuAlert = message => khuDialog({ message });

function showToast(text) {
  document.getElementById('khu-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'khu-toast';
  el.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg max-w-[90vw] text-center';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
// 수정 중 내용이 바뀌었는지 비교하기 위한 기준 (openProfileEdit 에서 정함)
let profileBaseline = null;
// 화면에 있는 입력칸 값 전체를 기준으로 비교 (제목·답안·시간 선택 칸의 숨은 값까지 포함)
const formSnapshot = () => JSON.stringify(
  [...(document.getElementById('profile-modal')?.querySelectorAll('input, textarea') || [])].map(el =>
    [el.value, el.checked ?? null, el.dataset?.touched ?? null]));

// force: 저장한 뒤 닫는 경우처럼 확인이 필요 없을 때 true. 그 밖(✕ 버튼 등)에서 바뀐 내용이 있으면 확인창을 띄움
async function closeProfileEdit(force = false) {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  if (!force && profileBaseline !== null && formSnapshot() !== profileBaseline
      && !(await khuConfirm('저장하지 않은 내용이 있어요.\n저장하지 않고 닫을까요?', { okText: '닫기' }))) return;
  profileBaseline = null;
  modal.classList.add('hidden');
}

// ================= 3. 글 목록 + 매칭 (Supabase DB) =================
let currentUser = null;     // 로그인한 사용자 (auth.js 가 알려줌)
let myPost = null;          // 내가 올린 글 (없으면 null)
let listState = null;       // 마지막으로 불러온 목록 { mode, ranked | browse }
let sortMode = 'match';     // 'match'(매칭순) | 'latest'(최신순)
let loadedUserId;           // 목록을 마지막으로 불러온 사용자 id (undefined = 아직 안 불러옴)
let loadSeq = 0;
let aiByUid = new Map();    // AI 분석 결과 (user_id → { rule_score, adjust, final, summary, good, warn })
let aiRunning = false;            // 오래된 응답이 새 응답을 덮어쓰지 않게 하는 번호

// 로그인 상태가 바뀔 때 호출됨 (auth.js).
// 탭 복귀·토큰 갱신 때도 호출되므로, 사용자가 실제로 바뀐 경우에만 다시 불러옴
function onAuthChanged(session) {
  currentUser = session?.user ?? null;
  const id = currentUser?.id ?? null;
  if (id === loadedUserId) return;
  loadedUserId = id;
  aiByUid.clear(); aiLatest = null; aiNote = ''; aiError = ''; savedAiLoaded = null; aiBatchRank = null;
  loadPosts();
}

// 숫자만 남기기 ("24학번" → "24")
const digits = v => String(v ?? '').replace(/\D/g, '');

// 매칭률 배지 색 (80↑ 진한 빨강, 60↑ 주황, 그 아래 회색)
// 매칭률 배지 색: 점수가 높을수록 진함 (6단계)
const scoreTone = score => score >= 90 ? 'bg-red-700'
  : score >= 80 ? 'bg-red-600'
  : score >= 70 ? 'bg-red-500'
  : score >= 60 ? 'bg-orange-500'
  : score >= 50 ? 'bg-orange-400'
  : 'bg-slate-400';

function matchBadgeHtml(m) {
  return `<span class="ml-auto px-2 py-0.5 ${scoreTone(m.score)} text-white rounded-md">${m.conflict ? '⚠ ' : ''}매칭률 ${m.score}%</span>`;
}

// post: DB 행 / match: matchScore() 결과 (내 글이거나 둘러보기면 null)
const MY_STATUS_LABEL = { published: '공개 중', draft: '비공개 중', archived: '비공개 중' };

function cardHtml(post, match = null, plain = false, inList = false) {
  const mine = !plain && currentUser && post.user_id === currentUser.id;   // plain: 읽기 전용 (확정 카드 복사본)
  const blank = !!post.blank;   // 아직 카드를 쓰지 않은 내 칸 (미리보기용, 저장된 글 아님)
  // 나와 같은 성별·거주 기간인 남의 카드는 살짝 붉게 구분 (목록에서만)
  const sameCond = !plain && !mine && !!myPost && post.gender === myPost.gender && post.dorm_period === myPost.dorm_period;
  // 내 카드 오른쪽 위: 공개 중(누르면 비공개로) / 비공개 중. 임시저장도 비공개로 보여 줌
  const isPublic = post.status === 'published';
  const stateHtml = blank
    ? `<span class="ml-auto px-2.5 py-1 rounded-lg bg-slate-400 text-white text-xs font-bold">📝 작성 전</span>`
    : `<button onclick="event.stopPropagation(); archiveMyPost()" class="ml-auto px-2.5 py-1 rounded-lg ${isPublic ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-500 hover:bg-slate-600'} text-white text-xs font-bold shadow-sm transition">${isPublic ? '🌐 공개 중' : '🔒 비공개 중'}</button>`;
  // 로그인 안 한 사용자는 카드 내용을 볼 수 없으니 로그인 창을 띄움
  const open = blank ? 'openMyCardModal()' : !currentUser ? "openAuthModal('login')" : `openViewModal('${esc(post.user_id)}')`;
  // 값이 비어 있으면 그 칸은 안 보여 줌
  const chip = (v, cls) => v ? `<span class="${cls}">${esc(v)}</span>` : '';
  return `
    <div data-uid="${esc(post.user_id)}" onclick="${open}" class="${sameCond ? 'bg-rose-50/50' : 'bg-white'} ${mine ? 'border-transparent' : sameCond ? 'border-red-200 hover:border-red-300' : 'border-slate-200 hover:border-red-300'} p-5 rounded-2xl border cursor-pointer shadow-sm hover:shadow-md transition space-y-2.5">
      <!-- 1단: 성별 & 거주기간 (붉은색 강조 태그) + 매칭률 -->
      <div class="flex items-center gap-1.5 text-xs font-bold">
        ${chip(post.gender, 'px-2.5 py-1 bg-red-100 text-red-600 rounded-md border border-red-200')}
        ${chip(post.dorm_period, 'px-2.5 py-1 bg-red-50 text-red-600 rounded-md border border-red-100')}
        ${mine ? (inList ? '<span class="ml-auto px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold">✦ 내 글</span>' : stateHtml) : match ? matchBadgeHtml(match) : ''}
      </div>

      <!-- 2단: 게시글 제목 (크게) -->
      <h3 class="font-black ${blank ? 'text-slate-300' : 'text-slate-800'} text-lg leading-snug pt-0.5">${esc(post.title)}</h3>

      <!-- 3단: 학과 & 학번 & 나이(출생년도) -->
      <div class="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-600 pt-1 border-t border-slate-100">
        ${post.dept ? `<span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-semibold">${esc(post.dept)}</span>` : ''}
        ${post.student_id ? `<span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700">${esc(post.student_id)}학번</span>` : ''}
        ${post.birth_year ? `<span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700">${esc(post.birth_year)}년생</span>` : ''}
        ${mine && !blank && !inList ? `<span class="ml-auto"><button onclick="event.stopPropagation(); removeMyPost()" class="text-slate-400 hover:text-red-600 underline">🗑️ 내 글 삭제</button></span>` : ''}
      </div>
    </div>`;
}

function showListMessage(text) {
  document.getElementById('card-list-container').innerHTML =
    `<p class="text-center text-sm text-slate-400 py-10">${text}</p>`;
}

const bannerHtml = (html, action = '') =>
  `<div class="bg-red-50 border border-red-100 text-red-700 text-xs font-semibold rounded-xl px-4 py-3 leading-relaxed">${html}${action}</div>`;

// 정렬 버튼 표시 갱신 (관련순은 내 글이 있을 때만 사용 가능)
function updateSortButtons() {
  const matched = listState?.mode === 'matched';
  const active = 'text-red-600 font-bold', idle = 'hover:text-slate-800';
  const on = matched ? sortMode : 'latest';
  const latest = document.getElementById('sort-latest'), match = document.getElementById('sort-match');
  document.getElementById('ai-open-btn')?.classList.toggle('hidden', !matched);
  if (!latest || !match) return;
  latest.className = on === 'latest' ? active : idle;
  match.className = (on === 'match' ? active : idle) + (matched ? '' : ' opacity-40 cursor-not-allowed');
  match.title = matched ? '' : '내 정보를 작성하면 관련도 순으로 볼 수 있어요';
}

function setSort(mode) {
  if (mode === 'match' && listState?.mode !== 'matched') return;
  sortMode = mode;
  renderList();
}

// 이미 불러온 데이터로 목록을 그림 (정렬 버튼을 눌러도 DB를 다시 부르지 않음)
function renderList() {
  const box = document.getElementById('card-list-container');
  const mineBox = document.getElementById('my-post-container');
  if (!box || !mineBox || !listState) return;
  updateSortButtons();
  const openBtn = '<button onclick="openProfileEdit()" class="ml-1 underline">내 정보 작성하기</button>';
  const loginBtn = '<button onclick="openAuthModal(\'login\')" class="ml-1 underline">로그인하기</button>';

  // 내 글은 필터 줄 아래 별도 칸에 표시 (목록에는 넣지 않음)
  // 카드가 없으면 빈 내 매칭카드 모양을 띄우고, 그 아래 빨간 박스로 안내
  const blankPost = { user_id: currentUser?.id, status: 'draft', blank: true, title: '아직 작성한 카드가 없어요', gender: '', dorm_period: '', dept: '', student_id: '', birth_year: '' };
  mineBox.innerHTML = myPost ? `<p class="khu-grad-text text-xs font-black mb-1.5 px-1">✦ 내 매칭 카드</p><div class="khu-grad-shadow">${cardHtml(myPost)}</div>`
    : currentUser ? `<p class="khu-grad-text text-xs font-black mb-1.5 px-1">✦ 내 매칭 카드</p><div class="khu-grad-shadow">${cardHtml(blankPost)}</div><div class="mt-2">${bannerHtml('내 매칭카드를 완성하고 게시하여 매칭에 참여하세요.', openBtn)}</div>` : '';

  const parts = [];
  if (listState.mode === 'matched') {
    let rows, text;
    if (sortMode === 'latest') {
      // 최신순: 성별·거주 기간과 상관없이 전체 글. 같은 조건인 글에만 매칭률을 붙임
      const byId = new Map(listState.ranked.map(r => [r.post.user_id, r.match]));
      rows = listState.browse
        .map(p => ({ post: p, match: byId.get(p.user_id) ?? null }));
      text = `전체 매칭 카드 ${rows.length}개를 최근 수정순으로 보여드려요. 같은 성별·거주 기간 글에는 매칭률이 함께 떠요.`;
    } else {
      rows = listState.ranked;
      text = `${esc(myPost.gender)} · ${esc(myPost.dorm_period)} 조건이 같은 룸메이트 ${rows.length}명을 관련도 높은 순으로 보여드려요.`;
    }
    parts.push(bannerHtml(`${text} (카드를 누르면 답안을 볼 수 있어요)`));
    parts.push(...(rows.length
      ? rows.map(r => r.post.user_id === currentUser?.id
          ? `<div class="khu-grad-shadow">${cardHtml(r.post, null, false, true)}</div>`
          : cardHtml(r.post, r.match))
      : ['<p class="text-center text-sm text-slate-400 py-10">아직 같은 조건의 글이 없어요. 조금만 기다려 주세요!</p>']));
  } else {
    const msg = listState.mode === 'confirmed' ? '룸메가 확정됐어요. 카드는 목록에서 내려갔고, 하우스룰 탭에서 서로의 카드를 볼 수 있어요.'
      : listState.mode === 'draft' ? '비공개 상태예요. 게시하기를 눌러야 목록과 매칭에 올라가요.'
      : listState.mode === 'archived' ? '카드가 비공개 중이에요. 목록과 매칭에서 숨겨져 있어요. 공개 중으로 바꾸면 다시 참여해요.'
      : listState.mode === 'outdated' ? '질문지가 새로워졌어요. 새 질문에 답하고 다시 게시하면 매칭에 참여할 수 있어요.'
      : listState.mode === 'guest' ? '로그인하면 같은 성별·같은 거주 기간 룸메이트를 관련도 순으로 볼 수 있어요. (지금은 글만 볼 수 있어요)'
      : null;   // 카드가 없을 때는 위의 내 매칭 카드 칸이 안내하므로 따로 띄우지 않음
    if (msg) parts.push(bannerHtml(msg, listState.mode === 'guest' ? loginBtn : openBtn));
    const others = listState.browse.filter(p => !currentUser || p.user_id !== currentUser.id);
    parts.push(...(others.length ? others.map(p => cardHtml(p)) : ['<p class="text-center text-sm text-slate-400 py-10">아직 올라온 글이 없어요. 첫 글을 올려 보세요!</p>']));
  }
  box.innerHTML = parts.join('');
}

async function loadPosts() {
  const box = document.getElementById('card-list-container');
  if (!box) return;
  const seq = ++loadSeq;
  const uid = currentUser?.id ?? null;
  try {
    let mine = null, state;
    if (!uid) {
      // 로그인 안 한 사용자: 글 목록만 (쪽지 등은 막혀 있음)
      state = { mode: 'guest', browse: await fetchBrowsePosts(GUEST_LIST_COLUMNS) };
    } else {
      mine = await fetchMyPost(uid);
      if (mine && mine.status !== 'published') {
        // 임시저장·보관 중인 카드: 목록과 매칭에서 빠짐 (내 카드 칸에만 보임). 확정된 룸메가 있으면 확정 상태
        const confirmed = await fetchAcceptedMatch(uid);
        const mode = confirmed ? 'confirmed' : mine.status === 'archived' ? 'archived' : 'draft';
        state = { mode, browse: await fetchBrowsePosts() };
      } else if (mine && (mine.schema_version ?? 0) >= SCHEMA_VERSION) {
        // 같은 성별·같은 거주 기간만 DB에서 가져와서(하드 필터) 점수로 정렬
        const candidates = await fetchCandidates(mine);
        state = { mode: 'matched', ranked: rankMatches(mine, candidates, SCHEMA_VERSION), browse: await fetchBrowsePosts() };
      } else {
        state = { mode: mine ? 'outdated' : 'nopost', browse: await fetchBrowsePosts() };
      }
    }
    if (seq !== loadSeq) return;   // 그 사이 더 새로운 요청이 시작됨
    myPost = mine; listState = state;
    loadSavedAi();   // 이미 분석한 카드 기록을 불러옴 (한 번만)
    renderList();
  } catch (e) {
    if (seq !== loadSeq) return;
    console.error(e);
    showListMessage('글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}

// 커스텀 게시 확인 모달 열기/닫기
function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
}

// 입력 검사: 문제가 있으면 안내하고 null, 괜찮으면 게시할 값을 돌려줌
function validateProfile() {
  const p = collectProfile();   // 기본 프로필 + 설문 전체 (profile-schema.js 기준)

  const missing = findMissing(p);
  if (missing.length) {
    showProfileTab(scopeOfField(missing[0].name));   // 빈 항목이 있는 탭으로 이동 (질문 순서상 첫 번째 항목 기준)
    highlightMissing(missing);
    const names = missing.slice(0, 4).map(m => m.label).join(', ');
    khuAlert(`아직 답하지 않은 항목이 ${missing.length}개 있어요.\n(${names}${missing.length > 4 ? ' 외' : ''})`);
    return null;
  }
  const studentId = digits(p.student_id), birthYear = digits(p.birth_year);
  if (studentId.length !== 2) { khuAlert('학번은 숫자 2자리로 입력해 주세요. (예: 24)'); return null; }
  if (birthYear.length !== 4 || +birthYear < 1980 || +birthYear > 2019) { khuAlert('출생년도는 1980~2019 사이 숫자 4자리로 입력해 주세요. (예: 2005)'); return null; }
  return { p, studentId, birthYear };
}

// 게시하기 버튼: 검사를 통과해야 확인 모달이 열림
function confirmPublish() {
  if (!currentUser) return openAuthModal('login');
  if (!validateProfile()) return;
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.remove('hidden');
}

// 게시하기: 내 글이 이미 있으면 새 내용으로 덮어쓰기 (사용자당 글 1개)
let publishing = false;
async function executePublish() {
  if (publishing) return;
  if (!currentUser) { closeConfirmModal(); return openAuthModal('login'); }

  const v = validateProfile();   // 확인 모달이 열려 있는 동안 값이 바뀌었을 수도 있어 한 번 더
  if (!v) return closeConfirmModal();
  const { p, studentId, birthYear } = v;

  const row = {
    user_id: currentUser.id,
    title: document.getElementById('post-title').value.trim().slice(0, 60) || '룸메이트 구해요',
    gender: p.gender,
    dorm_period: p.dorm_period,
    dept: p.dept || '',
    student_id: studentId,
    birth_year: birthYear,
    answers: { ...p, student_id: studentId, birth_year: birthYear },   // 설문 전체 (수정 때 다시 불러옴 / 매칭에 사용)
    schema_version: SCHEMA_VERSION,
    status: 'published',   // 게시: 목록과 매칭에 올라감
  };
  // 룸메가 확정된 동안에는 목록에 다시 올리지 않고 보관 상태로 저장
  const confirmed = await fetchAcceptedMatch(currentUser.id).catch(() => null);
  if (confirmed) row.status = 'archived';

  publishing = true;
  try {
    await savePost(row);
  } catch (e) {
    console.error(e);
    publishing = false;
    closeConfirmModal();
    return khuAlert('저장에 실패했어요. 로그인 상태와 인터넷 연결을 확인해 주세요.');
  }
  publishing = false;

  clearDraft();   // 게시했으니 임시 저장은 더 필요 없음 (이후엔 게시된 글이 폼에 불러와짐)
  closeConfirmModal();
  closeProfileEdit(true);
  if (confirmed) showToast('룸메가 확정된 상태라 목록에는 올리지 않고 보관해 두었어요.');
  await loadPosts();
}

// 카드 보관: 데이터는 남기고 목록·매칭에서만 숨김. 다시 보관 해제하면 게시 상태로 돌아감
// 공개 중 ↔ 비공개 중 (버튼을 누르면 반대 상태로. 각각 팝업으로 확인)
async function archiveMyPost() {
  if (!currentUser || !myPost) return;
  const toPublic = myPost.status !== 'published';
  if (toPublic) {
    // 공개로 바꾸려면 모든 항목을 채워야 함 (비어 있으면 어떤 항목인지 알려 주고 막음)
    const missing = findMissing(myPost.answers || {});
    if (missing.length) {
      const names = missing.slice(0, 4).map(m => m.label).join(', ');
      return khuAlert(`항목을 모두 채워야 공개할 수 있어요.\n아직 비어 있는 항목 ${missing.length}개: ${names}${missing.length > 4 ? ' 외' : ''}\n\n수정하기에서 채운 뒤 다시 눌러 주세요.`);
    }
    if (await fetchAcceptedMatch(currentUser.id).catch(() => null)) {
      return khuAlert('룸메가 확정된 동안에는 공개로 바꿀 수 없어요. 하우스룰 탭에서 확정을 해제하면 가능해요.');
    }
    if (!(await khuConfirm('카드를 공개 상태로 바꿀까요?\n목록과 매칭에 다시 올라가요.', { okText: '공개로' }))) return;
  } else {
    if (!(await khuConfirm('지금 내용 그대로 비공개 상태로 바꿀까요?\n목록에서만 내려가고, 카드 내용과 룸메 신청은 그대로 남아요.', { okText: '비공개로' }))) return;
  }
  try { await setPostStatus(currentUser.id, toPublic ? 'published' : 'archived'); }
  catch (e) { console.error(e); return khuAlert('처리에 실패했어요.'); }
  showToast(toPublic ? '카드를 공개했어요. 다시 목록에 올라갔어요.' : '카드를 비공개로 바꿨어요. 목록에서는 보이지 않아요.');
  await loadPosts();
}

async function removeMyPost() {
  if (!currentUser) return;
  const confirmed = await fetchAcceptedMatch(currentUser.id).catch(() => null);
  const msg = '카드와 작성한 내용이 모두 삭제돼요.\n삭제한 글은 되돌릴 수 없어요.' + (confirmed ? '\n확정된 룸메와의 카드 기록은 하우스룰에 남아요.' : '');
  if (!(await khuConfirm(msg, { okText: '삭제' }))) return;
  try { await deletePost(currentUser.id); } catch (e) { return khuAlert('삭제에 실패했어요.'); }
  clearDraft();   // 이 브라우저에 남은 임시 저장도 지워서 수정 화면에 다시 나오지 않게
  await loadPosts();
}

// ================= 5. 다른 사람 글 보기 (읽기 전용 답안) =================
// 카드를 누르면 DB에서 그 글의 답안을 다시 받아와서, 내 정보 수정 폼과 같은 모양으로 보여줍니다.
// 모든 입력칸은 비활성화되어 있어서 볼 수만 있고 바꿀 수 없어요.
async function openViewModal(userId) {
  let row;
  try { row = await fetchPostById(userId); }
  catch (e) { console.error(e); return khuAlert('글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  if (!row) row = snapshotCache.get(userId);   // 카드를 지웠어도 확정 당시 복사본이 있으면 보여 줌 (matches.js)
  if (!row) return khuAlert('이미 삭제된 글이에요.');

  document.getElementById('view-title').textContent = row.title;
  document.getElementById('view-meta').textContent =
    [row.gender, row.dorm_period, row.dept, `${row.student_id}학번`, `${row.birth_year}년생`].filter(Boolean).join(' · ');
  resetViewScroll();
  renderProfileSections(row.answers || {}, 'view-sections');

  // AI 분석 결과가 있으면 답안 위에 보여 줌 (로그인한 사용자만 있음)
  const ai = currentUser ? aiByUid.get(row.user_id) : null;
  const aiBox = document.getElementById('view-ai');
  const aiOld = ai && currentUser && myPost && row.user_id !== currentUser.id && aiState(row.user_id, row.updated_at) === 'stale';
  aiBox.innerHTML = ai ? (aiOld ? '<p class="text-[11px] text-rose-600 font-bold px-1">⚠ 카드가 바뀌기 전 기준으로 분석한 결과예요. 다시 분석해 보세요.</p>' : '') + aiBoxHtml(ai) : '';
  aiBox.classList.toggle('hidden', !ai);
  // 내 카드가 있고 남의 카드면 항목별 비교를 같이 보여 줌
  // 점수 설명: 각 질문 칸 바로 아래에 붙이고, 칸을 찾지 못한 항목만 아래 비교표에 남김
  const cmpBox = document.getElementById('view-compare');
  const canCompare = !!currentUser && !!myPost && row.user_id !== currentUser.id;
  // 성별·거주 기간은 글의 열(column)에 있어서 답안과 합쳐서 비교에 넘김
  viewCompareCtx = canCompare ? {
    a: { gender: myPost.gender, dorm_period: myPost.dorm_period, ...(myPost.answers || {}) },
    b: { gender: row.gender, dorm_period: row.dorm_period, ...(row.answers || {}) },
  } : null;
  cmpBox.innerHTML = '';
  cmpBox.classList.add('hidden');

  // 쪽지 버튼: 로그인 안 했거나 내 글이면 비활성화 (쪽지 기능 자체는 아직 준비 중)
  const msgBtn = document.getElementById('view-msg-btn');
  msgBtn.dataset.peer = row.user_id;
  msgBtn.dataset.title = row.title || '';
  // 내 카드면 아래에 수정하기 버튼 (닫기 버튼은 없앰: 위 ✕ 로 닫음)
  const footer = document.getElementById('view-footer');
  const isOwn = !!currentUser && row.user_id === currentUser.id;
  viewRowCtx = row;
  footer.innerHTML = isOwn
    ? `<button onclick="closeViewModal(); openProfileEdit()" class="w-full py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:shadow-lg text-white font-bold rounded-xl shadow-sm transition">수정하기</button>`
    : '';
  footer.classList.toggle('hidden', !isOwn);
  if (!isOwn && currentUser && myPost) renderViewAiFooter();   // 남의 카드: AI 정밀 분석 버튼 (상태에 따라 다르게)
  const own = !!currentUser && row.user_id === currentUser.id;
  msgBtn.disabled = false;   // 차단하지 않음: 로그인·공개 여부는 누를 때 팝업으로 안내
  msgBtn.classList.toggle('hidden', own);   // 내 카드에는 쪽지 버튼 자체를 숨김
  msgBtn.title = '';

  const scope = document.getElementById('view-sections');
  scope.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = true; el.tabIndex = -1; });
  document.getElementById('view-modal').classList.remove('hidden');
  relayoutViewCompare();
}
// 하단 "내 매칭카드" 버튼: 내 카드 모달을 연다 (거기서 수정하기 → 수정창). 카드가 아직 없으면 바로 수정창
function openMyCardModal() {
  if (!currentUser) return openProfileEdit();   // 로그인 안내는 수정창 쪽에서 처리
  if (myPost) return openViewModal(currentUser.id);
  // 아직 아무것도 안 쓴 경우: 빈 답안을 그대로 채운 모양으로 띄움 (읽기 전용, 수정하기 버튼으로 수정창)
  document.getElementById('view-title').textContent = '내 매칭 카드';
  document.getElementById('view-meta').textContent = '';
  resetViewScroll();
  renderProfileSections({}, 'view-sections');
  document.getElementById('view-ai').classList.add('hidden');
  document.getElementById('view-msg-btn').classList.add('hidden');
  const footer = document.getElementById('view-footer');
  footer.innerHTML = `<button onclick="closeViewModal(); openProfileEdit()" class="w-full py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:shadow-lg text-white font-bold rounded-xl shadow-sm transition">수정하기</button>`;
  footer.classList.remove('hidden');
  const scope = document.getElementById('view-sections');
  scope.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = true; el.tabIndex = -1; });
  document.getElementById('view-modal').classList.remove('hidden');
}
// 쪽지 보내기·룸메 신청 전에 내 카드가 공개 중인지 DB에서 다시 확인
async function requirePublishedCard() {
  if (!currentUser) return false;
  let p;
  try { p = await fetchMyPost(currentUser.id); }
  catch { showToast('카드 상태를 확인하지 못했어요. 잠시 후 다시 해 주세요.'); return false; }
  if (p?.status === 'published') return true;
  await khuAlert('내 매칭 카드를 공개해야 쪽지를 보내고 룸메 신청을 할 수 있어요.\n수정하기에서 카드를 완성한 뒤 공개로 바꿔 주세요.');
  return false;
}
function onMessageClick() {
  khuAlert('쪽지 기능은 준비 중이에요.');
}
// 쪽지 버튼: 답안 보기 창을 닫고 상대와의 대화창을 염 (messages.js)
async function onNoteClick() {
  const btn = document.getElementById('view-msg-btn');
  if (!currentUser) return khuAlert('로그인 후 쪽지를 보낼 수 있어요.');
  if (!(await requirePublishedCard())) return;   // 내 카드가 공개 중이 아니면 안내 팝업만 띄움
  closeViewModal();
  openThread(btn.dataset.peer, btn.dataset.title);
}
function closeViewModal() {
  const modal = document.getElementById('view-modal');
  if (modal) modal.classList.add('hidden');
  resetViewScroll();   // 다시 열면 맨 위부터
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('view-modal').classList.contains('hidden')) closeViewModal();
  else closeAiModal();
});

// ================= 5. AI 정밀 분석 (상위 20명, 하이브리드) =================
// 목록 정렬은 규칙 점수로 전체가 즉시 됩니다. 'AI 정밀 분석' 버튼을 누르면 팝업이 열리고,
// 상위 20명을 AI가 한 번에 읽어 규칙 점수를 ±10점 보정하고 설명을 붙입니다.
// 결과는 팝업의 순위 카드로 보여 주고, 같은 쌍은 서버 DB에 저장되어 다시 AI를 부르지 않아요.
let aiBatchRank = null;  // 마지막 전체 분석 때 카드별 순위 (Map: 카드 id → 순위). 순위가 바뀌면 다시 분석 가능
let aiLatest = null;   // 마지막 분석 결과 (최종 점수 순 정렬 전 원본), 아직 없으면 null
let aiNote = '';       // 마지막 분석의 안내 문구 (예: AI 설정이 없음)
let aiError = '';      // 마지막 분석 실패 메시지

function openAiModal() {
  if (!currentUser || listState?.mode !== 'matched') return;
  renderAiModal();
  document.getElementById('ai-modal').classList.remove('hidden');
}

function closeAiModal() {
  document.getElementById('ai-modal')?.classList.add('hidden');
}

function renderAiModal() {
  const info = document.getElementById('ai-modal-info');
  const btn = document.getElementById('ai-run-btn');
  const body = document.getElementById('ai-modal-body');
  if (!info || !btn || !body) return;
  const cands = (listState?.ranked || []).slice(0, 20);   // 서버가 분석하는 상위 20명과 같은 대상
  const n = cands.length;
  info.textContent = `같은 성별·거주 기간 관련도 상위 ${n}명 대상`;
  // 전원이 '분석 완료(바뀐 것 없음)'이면 버튼을 회색으로 막음
  const curIds = cands.map(x => x.post.user_id);
  // 분석 때 순위와 지금 순위가 하나라도 다르면 '관련도 순서가 바뀜' (카드가 빠지거나 새로 들어와도 순위가 밀림)
  const rankChanged = !!aiBatchRank && [...aiBatchRank].some(([id, rk]) => curIds.indexOf(id) + 1 !== rk);
  // 분석 때 없던 카드가 상위 목록에 들어온 경우 (예: 10명이던 목록에 11등이 추가)
  const addedCount = aiBatchRank ? cands.filter(x => !aiBatchRank.has(x.post.user_id)).length : 0;
  const allDone = n > 0 && !rankChanged && addedCount === 0 && cands.every(x => aiState(x.post.user_id, x.post.updated_at) === 'done');
  // 내 카드가 분석 뒤에 바뀌었으면 버튼 옆에 안내
  const myChanged = !!myPost && cands.some(x => {
    const r = aiByUid.get(x.post.user_id);
    return !!r && !!r.viewer_updated && new Date(r.viewer_updated).getTime() !== new Date(myPost.updated_at).getTime();
  });
  const msgs = [myChanged ? '⚠ 내 카드가 바뀌었어요' : '', rankChanged ? '⚠ 관련도 순서가 바뀌었어요' : '', addedCount ? `➕ 새 카드 ${addedCount}명이 추가됐어요` : ''].filter(Boolean);
  const notesHtml = msgs.length ? `<div class="space-y-1 mb-3">${msgs.map(m => `<p class="text-xs font-bold text-rose-600">${m}</p>`).join('')}</div>` : '';
  btn.disabled = aiRunning || n === 0 || allDone;
  btn.textContent = aiRunning ? '분석 중…' : allDone ? '✔ 분석 최신 상태' : aiLatest ? '🔄 다시 분석' : '▶ 분석 시작';
  body.innerHTML = notesHtml + aiBodyHtml(n);
}

function aiBodyHtml(n) {
  if (aiRunning) {
    return `
      <div class="text-center py-14">
        <div class="text-4xl animate-pulse">🤖</div>
        <p class="text-sm font-bold text-slate-700 mt-3">AI가 상위 ${n}명의 답안을 읽고 있어요</p>
        <p class="text-xs text-slate-400 mt-1">보통 20~60초 걸려요. 창을 닫아도 분석은 계속돼요.</p>
      </div>`;
  }
  if (aiError) {
    return `<div class="bg-rose-50 border border-rose-100 text-rose-700 text-sm font-semibold rounded-xl p-4">${esc(aiError)}</div>`;
  }
  if (!aiLatest) {
    return `
      <div class="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-2xl p-5 space-y-2 text-sm text-slate-700 leading-relaxed">
        <p class="font-black text-slate-800">이렇게 분석해요</p>
        <p>① 규칙 점수가 높은 상위 ${n}명을 골라요.</p>
        <p>② AI가 답안을 함께 읽고 점수를 ±10점 보정해요.</p>
        <p>③ 잘 맞는 점과 확인할 점을 한 줄씩 설명해요.</p>
        <p class="text-xs text-slate-400 pt-1">분석 결과는 저장되어서 같은 사람은 다음에 바로 나와요. 1시간에 10번까지 누를 수 있어요.</p>
      </div>`;
  }
  if (!aiLatest.length) {
    return `<p class="text-center text-sm text-slate-400 py-10">${esc(aiNote || '분석할 후보가 아직 없어요.')}</p>`;
  }
  const note = aiNote ? `<p class="text-xs font-bold text-rose-600 bg-rose-50 rounded-lg px-3 py-2">${esc(aiNote)}</p>` : '';
  return `${note}<p class="text-xs font-bold text-slate-500">AI 최종 점수 순 · ${aiLatest.length}명</p>` +
    aiLatest.map((r, i) => aiCardHtml(r, i + 1)).join('');
}

// AI 결과 카드 (순위 · 최종 점수 · 설명 · 잘 맞는 점 · 확인할 점). 누르면 답안 보기
function aiCardHtml(r, rank) {
  const post = listState?.ranked?.find(x => x.post.user_id === r.user_id)?.post;
  if (!post) return '';
  const medal = ['from-amber-300 to-yellow-500', 'from-slate-300 to-slate-400', 'from-orange-300 to-orange-500'][rank - 1];
  const badge = medal ? `bg-gradient-to-br ${medal} text-white shadow` : 'bg-slate-100 text-slate-500';
  const tone = r.final >= 80 ? 'text-red-600' : r.final >= 60 ? 'text-orange-500' : 'text-slate-500';
  const adj = r.adjust > 0 ? `+${r.adjust}` : `${r.adjust}`;
  const adjTone = r.adjust > 0 ? 'text-emerald-600' : r.adjust < 0 ? 'text-rose-500' : 'text-slate-400';
  const targetChanged = !!r.target_updated && new Date(r.target_updated).getTime() !== new Date(post.updated_at).getTime();   // 이 카드(상대)만 바뀐 경우
  const meta = [post.dept, `${post.student_id}학번`, `${post.birth_year}년생`].filter(Boolean).map(esc).join(' · ');
  const good = (r.good || []).map(g => `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100">✔ ${esc(g)}</span>`).join('');
  const warn = (r.warn || []).map(w => `<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-100">⚠ ${esc(w)}</span>`).join('');
  return `
    <div onclick="openViewModal('${esc(r.user_id)}')" class="cursor-pointer bg-white rounded-2xl border ${rank <= 3 ? 'border-red-200' : 'border-slate-200'} p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition space-y-3">
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl ${badge} flex items-center justify-center text-sm font-black shrink-0">${rank}</div>
        <div class="min-w-0 flex-1">
          <h4 class="font-black text-slate-800 truncate">${esc(post.title)}</h4>
          <p class="text-[11px] text-slate-500 font-semibold truncate">${meta}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-2xl font-black ${tone} leading-none">${r.final}<span class="text-xs font-bold text-slate-400">점</span></p>
          <p class="text-[10px] font-bold ${adjTone} mt-1">규칙 ${r.rule_score} ${adj}</p>
        </div>
      </div>
      <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style="width:${r.final}%"></div>
      </div>
      ${targetChanged ? '<p class="text-[11px] font-bold text-rose-600">⚠ 이 카드가 바뀌었어요 (이전 분석 기준)</p>' : ''}
      <p class="text-sm text-slate-700 leading-relaxed">${esc(r.summary)}</p>
      ${r.analysis ? `<p class="text-xs text-slate-600 leading-relaxed">${esc(r.analysis)}</p>` : ''}
      ${good || warn ? `<div class="flex flex-wrap gap-1.5">${good}${warn}</div>` : ''}
      <p class="text-xs font-bold text-red-600 text-right">답안 보기 →</p>
    </div>`;
}

async function runAiMatch() {
  if (aiRunning || !currentUser) return;
  aiRunning = true;
  aiError = '';
  const batchRank = new Map((listState?.ranked || []).slice(0, 20).map((x, i) => [x.post.user_id, i + 1]));
  renderAiModal();
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
    const res = await fetch('/api/match-ai', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.');
    applyAiResults(json.results || [], json.warning || '');
    aiBatchRank = batchRank;
  } catch (e) {
    console.error(e);
    aiError = e.message || 'AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.';
  } finally {
    aiRunning = false;
    renderAiModal();
  }
}

// 저장된 AI 분석 불러오기 (새로고침 뒤에도 '분석 완료' 상태를 기억)
let savedAiLoaded = null;
function loadSavedAi() {
  if (!currentUser || !myPost) return;
  if (savedAiLoaded) return savedAiLoaded;
  savedAiLoaded = (async () => {
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      const res = await fetch('/api/match-ai/saved', { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'saved failed');
      const list = json.results || [];
      list.forEach(r => aiByUid.set(r.user_id, r));
      if ((json.batch_ranks || []).length) aiBatchRank = new Map(json.batch_ranks.map(x => [x.user_id, x.batch_rank]));
      if (!aiLatest && list.length) applyAiResults(list, '');
      if (viewRowCtx && !document.getElementById('view-modal').classList.contains('hidden')) refreshViewAi();
      if (!document.getElementById('ai-modal').classList.contains('hidden')) renderAiModal();
    } catch (e) {
      console.error(e);
      savedAiLoaded = null;   // 실패하면 다음에 다시 시도
    }
  })();
  return savedAiLoaded;
}
// 보기 창의 AI 박스·버튼을 지금 기록 기준으로 다시 그림
function refreshViewAi() {
  const row = viewRowCtx;
  if (!row) return;
  const ai = currentUser ? aiByUid.get(row.user_id) : null;
  const aiBox = document.getElementById('view-ai');
  const stale = !!ai && !!currentUser && !!myPost && row.user_id !== currentUser.id && aiState(row.user_id, row.updated_at) === 'stale';
  aiBox.innerHTML = ai ? (stale ? '<p class="text-[11px] text-rose-600 font-bold px-1">⚠ 카드가 바뀌기 전 기준으로 분석한 결과예요. 다시 분석해 보세요.</p>' : '') + aiBoxHtml(ai) : '';
  aiBox.classList.toggle('hidden', !ai);
  renderViewAiFooter();
}

// 지금 보고 있는 카드 (AI 버튼 상태 계산용)
let viewRowCtx = null;
// 이 카드를 지금 내 글·상대 글 기준으로 분석했는지: 'done'(변경 없음) / 'stale'(바뀌었거나 이전 분석) / 'none'(분석 전)
function aiState(userId, targetUpdated) {
  const r = aiByUid.get(userId);
  if (!r) return 'none';
  const sameT = (x, y) => !!x && !!y && new Date(x).getTime() === new Date(y).getTime();
  return myPost && sameT(r.viewer_updated, myPost.updated_at) && sameT(r.target_updated, targetUpdated) ? 'done' : 'stale';
}
// 보기 창 하단 AI 버튼: 분석 전 = 활성, 분석 후 변경 없음 = 회색(누르면 안내), 카드가 바뀌었으면 알림 + 활성
function renderViewAiFooter() {
  const footer = document.getElementById('view-footer');
  const row = viewRowCtx;
  if (!footer || !row || !myPost || !currentUser || row.user_id === currentUser.id) return;
  const sameCond = row.gender === myPost.gender && row.dorm_period === myPost.dorm_period;
  const st = aiState(row.user_id, row.updated_at);
  const done = st === 'done';
  const btnCls = done ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-gradient-to-r from-red-600 to-orange-500 hover:shadow-lg text-white';
  const label = done ? '✔ 분석 완료 (카드 변경 없음)' : '🤖 AI 정밀 분석';
  footer.innerHTML = `${st === 'stale' ? '<p class="text-xs font-bold text-rose-600 text-center mb-2">⚠ 카드 내용이 바뀌었어요. 다시 분석할 수 있어요.</p>' : ''}
    <button id="view-ai-btn" onclick="runSingleAi('${esc(row.user_id)}', ${sameCond})" class="w-full py-3 ${btnCls} font-bold rounded-xl shadow-sm transition">${label}</button>`;
  footer.classList.remove('hidden');
}

// 보기 창의 'AI 정밀 분석': 이 카드 한 장만 분석해서 같은 서식으로 답안 위에 보여 줌
let aiSingleRunning = false;
async function runSingleAi(userId, sameCond) {
  if (!sameCond) return khuAlert('성별 또는 거주 기간이 달라서 AI 정밀 분석을 할 수 없어요.\n같은 성별·같은 거주 기간의 카드만 분석할 수 있어요.');
  if (aiSingleRunning || !currentUser) return;
  if (aiState(userId, viewRowCtx?.updated_at) === 'done') return khuAlert('이미 분석한 상태예요.\n카드 내용이 바뀌면 다시 분석할 수 있어요.');
  aiSingleRunning = true;
  const btn = document.getElementById('view-ai-btn');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 AI 분석 중… (최대 1분)'; }
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
    const res = await fetch('/api/match-ai', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: userId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.');
    const r = (json.results || []).find(x => x.user_id === userId);
    if (!r || !r.ai) throw new Error(json.warning || 'AI 분석 결과를 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    aiByUid.set(userId, r);
    if (aiLatest) {   // AI 팝업 목록이 이미 있으면 이 카드 항목도 갱신
      aiLatest = aiLatest.filter(x => x.user_id !== userId).concat(r)
        .sort((x, y) => y.final - x.final || y.rule_score - x.rule_score);
    }
    const box = document.getElementById('view-ai');
    box.innerHTML = aiBoxHtml(r);
    box.classList.remove('hidden');
  } catch (e) {
    console.error(e);
    khuAlert(e.message || 'AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    aiSingleRunning = false;
    renderViewAiFooter();
  }
}

// 분석 결과 저장: 팝업은 최종 점수 순으로 그리고, 답안 보기 창에서도 쓸 수 있게 사람별로도 보관
// 목록 순서는 바꾸지 않음 (목록은 규칙 점수 기준으로 항상 즉시 정렬)
function applyAiResults(results, warning) {
  aiLatest = results.slice().sort((x, y) => y.final - x.final || y.rule_score - x.rule_score);
  aiNote = warning;
  results.forEach(r => aiByUid.set(r.user_id, r));
}

// 답의 값을 사람이 읽는 말로 (선택지는 라벨, 범위는 a~b)
function valueText(key, v) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '미응답';
  const f = allFields().find(x => x.name === key);
  // 단계 이름이 있는 슬라이더는 숫자 대신 단계 이름 (룸메 칸은 같은 이름의 내 칸 설정을 씀)
  const steps = f?.steps || allFields().find(x => x.name === key.replace(/^rm_/, ''))?.steps;
  const minV = f?.min ?? allFields().find(x => x.name === key.replace(/^rm_/, ''))?.min ?? 1;
  const sLab = x => steps && steps[Number(x) - minV] !== undefined ? (steps[Number(x) - minV] || `${x}단계`) : String(x);
  if (steps && typeof v === 'object' && !Array.isArray(v)) return `${sLab(v.lo ?? v.from)} ~ ${sLab(v.hi ?? v.to)}`;
  if (steps && !Array.isArray(v) && typeof v !== 'object') return sLab(v);
  const lab = x => f?.options?.find(op => String(op.value) === String(x))?.label ?? String(x);
  if (Array.isArray(v)) return v.map(lab).join(', ');
  if (typeof v === 'object') return v.from !== undefined ? `${v.from}~${v.to}` : `${v.lo}~${v.hi}`;
  return lab(v);
}
// 정밀 분석 창: 내 카드와 항목별로 비교 (내 허용 범위 안인지, 상대 허용 범위 안인지, 점수)
// 설명 박스 없이 질문 칸 자체에 표시 (남의 카드 보기에서만)
//  - 룸메 탭 선택지: 내 정보가 허용되는 선택지는 초록, 멀수록 노랑→빨강
//  - 룸메 탭 범위 슬라이더: 내 정보 값을 점으로 표시, 범위 안이면 초록 테두리 / 밖이면 빨강
//  - 정보 탭 슬라이더: 선 색은 숨기고, 내 룸메 허용 범위를 초록 띠로 표시
let viewCompareCtx = null;   // 지금 보기 모달의 내 답·상대 답 (탭을 바꾸면 다시 그림)

// 행거·냉장고: 원하는 룸메 조건과 상대 답을 케이스별로 판정
//  - 있음을 원하는데 상대가 없음 → X
//  - 없음을 원하는데 상대가 있음 → X
//  - 공유 의사를 원하는데 상대가 공유 불가 → X
//  - 공구 의사를 원하는데 상대가 공구 의사 없음 → X
const SHARE_ITEMS = { hanger: '행거', fridge: '냉장고' };
function shareCases(it, a, b) {
  const label = SHARE_ITEMS[it];
  // 원하는 룸메 답은 중복 선택(배열)일 수 있음: 있음·없음을 둘 다 고르면 그 조건은 상관없음
  const pick = k => [].concat(a[k] ?? []);
  const wants = pick('rm_' + it), wantsLend = pick('rm_' + it + '_lend'), wantsBuy = pick('rm_' + it + '_buy');
  const wantOwn = wants.includes('own') && !wants.includes('none');
  const wantNone = wants.includes('none') && !wants.includes('own');
  const wantLend = wantsLend.includes('yes') && !wantsLend.includes('no');
  const wantBuy = wantsBuy.includes('yes') && !wantsBuy.includes('no');
  const have = b[it];
  const issues = [];
  if (wantOwn && have !== 'own') issues.push(`상대 ${label} 없음 (원하는 룸메는 ${label} 있음)`);
  if (wantNone && have === 'own') issues.push(`상대 ${label} 있음 (원하는 룸메는 ${label} 없음)`);
  if (wantLend && have === 'own' && b[it + '_lend'] !== 'yes') issues.push(`상대 공유 의사 없음 (원하는 룸메는 공유 의사 있음)`);
  if (wantBuy && have !== 'own' && b[it + '_buy'] !== 'yes') issues.push(`상대 공구 의사 없음 (원하는 룸메는 공구 의사 있음)`);
  if (!issues.length) return { ok: true, text: `✅ ${label} 조건 맞음` };
  return { ok: false, text: `❌ ${issues.join(' · ')}` };
}
function relayoutViewCompare() {
  if (!viewCompareCtx) return;
  inlineCompare(viewCompareCtx.a, viewCompareCtx.b);
}

// 보기 모달 정리: 취미 입력칸·소개글 안내 문구 제거, 내 취미와 겹치는 태그는 초록
function tidyViewSections(a) {
  const scope = document.getElementById('view-sections');
  if (!scope) return;
  scope.querySelectorAll('input, textarea').forEach(el => { el.placeholder = ''; });
  // 읽기 전용: 태그 × 버튼과 '전체 삭제' 버튼 제거
  scope.querySelectorAll('[data-tag-remove], [data-tag-clear]').forEach(n => n.remove());
  // 원하는 룸메 학과: 단과대 드롭다운 칸 숨기고, 학과 검색칸·안내 문구 숨김 (고른 학과 칩만 보임)
  const deptEl = scope.querySelector('[data-fields~="rm_dept"]');
  if (deptEl) {
    deptEl.querySelectorAll('.khu-tags-wrap, .khu-tags-msg').forEach(n => { n.style.display = 'none'; });
    const grid = deptEl.querySelector('.grid');
    const collegeCell = [...deptEl.querySelectorAll('.grid > .min-w-0')].find(c => [...c.querySelectorAll('span')].some(s => s.textContent.trim() === '단과대'));
    if (collegeCell) { collegeCell.style.display = 'none'; if (grid) grid.style.gridTemplateColumns = '1fr'; }
  }
  const hobbyEl = scope.querySelector('[data-fields~="hobby"]');
  if (hobbyEl) {
    hobbyEl.querySelectorAll('.khu-tags-wrap, .khu-tags-msg').forEach(n => { n.style.display = 'none'; });
    const mine = [].concat(a.hobby || []).map(String);
    // 칩은 '#취미명' 텍스트 + × 버튼으로 이루어져 있어서, 칩의 글자(텍스트 노드)만 보고 비교
    hobbyEl.querySelectorAll('.khu-tags-chips > span').forEach(chip => {
      const t = [...chip.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().replace(/^#/, '');
      if (!mine.includes(t)) return;
      chip.style.background = '#ecfdf5'; chip.style.color = '#047857'; chip.style.borderColor = '#6ee7b7';
    });
  }
  // 원하는 룸메 학과 칩: 내 학과와 같은 칩은 초록, '상관없음'은 항상 초록
  if (deptEl) {
    const myDept = a.dept ? String(a.dept) : '';
    deptEl.querySelectorAll('.khu-tags-chips > span').forEach(chip => {
      const t = chip.textContent.trim();
      if (!(t === '상관없음' || (myDept && t === myDept))) return;
      chip.style.background = '#ecfdf5'; chip.style.color = '#047857'; chip.style.borderColor = '#6ee7b7';
    });
  }
  const introEl = scope.querySelector('[data-fields~="intro"]');
  if (introEl) {
    const ta = introEl.querySelector('textarea');
    if (!ta || !ta.value.trim()) introEl.style.display = 'none';   // 소개글이 없으면 칸 자체를 숨김
  }
}

// 남의 카드 보기: 질문 칸마다 한 줄 표시 + 탭 맨 위 요약 (설명 박스·색 없음)
//  - 내 정보 탭: 상대 정보가 내 룸메 허용 범위 안인지
//  - 원하는 룸메 탭: 내 정보가 상대 룸메 허용 범위 안인지
function inlineCompare(a, b) {
  const scope = document.getElementById('view-sections');
  if (!scope) return;
  scope.querySelectorAll('.khu-cmp').forEach(el => el.remove());   // 이전 표시 지우고 다시 그림
  tidyViewSections(a);
  const fieldEl = (name, panel) => scope.querySelector(`[data-panel="${panel}"] [data-fields~="${name}"]`);
  const pill = (ok, text) => `<span class="khu-cmp inline-flex items-center max-w-full px-2.5 py-1 rounded-full text-[11px] leading-snug font-bold border ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}">${text}</span>`;
  const resultText = (p, any) => any ? '✅ 상관없음 (모두 허용)'
    : !isVal(p) ? '➖ 조건 없음'
    : p >= 0.999 ? '✅ 허용 범위 안'
    : `❌ 허용 범위 밖 (일치율 ${Math.round(p * 100)}%)`;
  const addPill = (el, html) => {
    const wrap = `<div class="khu-cmp mt-1.5">${html}</div>`;
    const lab = el.querySelector(':scope > label');
    if (lab) lab.insertAdjacentHTML('afterend', wrap);
    else el.insertAdjacentHTML('afterbegin', wrap);
  };
  // 수면 시간·학과처럼 한 묶음 안에 칸이 나란히 있는 항목은, 해당 칸 바로 위에 알약을 붙임
  const SUBS = { sleep_time: '취침', wake_time: '기상', rm_sleep_time: '취침', rm_wake_time: '기상', rm_dept: '학과', shower_duration: '소요 시간', rm_shower_duration: '소요 시간', shower_time: '시간대 (중복 선택)', rm_shower_time: '시간대 (중복 선택)' };
  // 생활 리듬: 기상·취침 박스 아래에 한 줄로 붙임
  const placeBelow = (el, html) => { if (el) el.insertAdjacentHTML('beforeend', `<div class="khu-cmp mt-2">${html}</div>`); };
  const placeIn = (el, key, html) => {
    if (!el) return;
    const sub = SUBS[key];
    const cell = sub && [...el.querySelectorAll('.grid > .min-w-0')].find(c => [...c.querySelectorAll('span')].some(s => s.textContent.trim() === sub));
    if (!cell) return addPill(el, html);
    cell.insertAdjacentHTML('afterbegin', `<div class="khu-cmp mb-1.5">${html}</div>`);
  };
  const tally = { me: { ok: 0, total: 0 }, roommate: { ok: 0, total: 0 } };

  for (const d of DIMENSIONS) {
    if (!d.pref) {
      // 허용 범위가 없는 항목: 답끼리 얼마나 맞는지 (행거·냉장고 공유 의사 등). 취미·이미 알약 붙은 칸은 건너뜀
      if (d.key === 'rhythm') {   // 생활 리듬: 기상·취침 박스 아래에 한 줄
        const sv = d.sim(a, b);
        if (isVal(sv)) { const ok = sv >= 0.5; placeBelow(fieldEl('sleep_time', 'me'), pill(ok, `생활 리듬 ${ok ? '겹침 ✅' : '안 겹침 ❌'}`)); }
        continue;
      }
      const meKeyS = d.uses.find(k => !/^rm_/.test(k));
      if (!meKeyS || meKeyS === 'hobby' || !d.sim) continue;
      const el = fieldEl(meKeyS, 'me');
      if (!el || el.querySelector('.khu-cmp')) continue;
      if (SHARE_ITEMS[meKeyS]) {
        if (![].concat(a['rm_' + meKeyS] ?? []).length) continue;   // 원하는 룸메 답이 없으면 표시 안 함
        const r = shareCases(meKeyS, a, b);
        addPill(el, pill(r.ok, r.text));
        continue;
      }
      const sv = d.sim(a, b);
      if (!isVal(sv)) continue;
      const ok = sv >= 0.5;
      addPill(el, pill(ok, `내 답: ${esc(valueText(meKeyS, a[meKeyS]))} · 상대 답: ${esc(valueText(meKeyS, b[meKeyS]))} ${ok ? '✅' : '❌'}`));
      continue;
    }
    const meKey = d.uses.find(k => !/^rm_/.test(k));
    const rmKey = d.uses.find(k => /^rm_/.test(k));
    if (!meKey || !rmKey) continue;
    const anyA = anyPick(a, d), anyB = anyPick(b, d);
    const pa = anyA ? 1 : d.pref(a, b);   // 내 룸메 허용 범위 ↔ 상대 정보
    const pb = anyB ? 1 : d.pref(b, a);   // 상대 룸메 허용 범위 ↔ 내 정보

    if (d.key === 'dept') {
      // 학과: 나의 학과 칸 → 내가 원하는 학과 안에 상대 학과가 있는지 / 원하는 룸메 학과 칸 → 상대가 원하는 학과 안에 내 학과가 있는지
      const deptEl = fieldEl('dept', 'me');
      if (deptEl && isVal(pa)) {
        const ok = pa >= 0.999;
        addPill(deptEl, pill(ok, anyA ? '내 원하는 학과: 상관없음 ✅' : `내 원하는 학과에 상대 학과 포함 ${ok ? '✅' : '❌'}`));
        tally.me.total++; if (ok) tally.me.ok++;
      }
      const rmDeptEl = fieldEl('rm_dept', 'roommate');
      if (rmDeptEl && isVal(pb)) {
        const ok = pb >= 0.999;
        placeIn(rmDeptEl, 'rm_dept', pill(ok, anyB ? '상대 원하는 학과: 상관없음 ✅' : `상대 원하는 학과에 내 학과 포함 ${ok ? '✅' : '❌'}`));
        tally.roommate.total++; if (ok) tally.roommate.ok++;
      }
      continue;
    }

    const infoEl = fieldEl(meKey, 'me');
    if (infoEl && isVal(pa)) {
      const ok = pa >= 0.999;
      placeIn(infoEl, meKey, pill(ok, `내 룸메 허용 범위: ${esc(valueText(rmKey, a[rmKey]))} ${ok ? '✅' : '❌'}`));
      tally.me.total++; if (ok) tally.me.ok++;
    }
    const rmEl = fieldEl(rmKey, 'roommate');
    if (rmEl && isVal(pb)) {
      const ok = pb >= 0.999;
      placeIn(rmEl, rmKey, pill(ok, `내 정보: ${esc(valueText(meKey, a[meKey]))} ${ok ? '✅' : '❌'}`));
      tally.roommate.total++; if (ok) tally.roommate.ok++;
    }
  }

  // 성별·거주 기간: 나와 같아야 해서 내 정보 탭은 내 값과, 원하는 룸메 탭은 고정 칸에 상대 값을 보여 줌
  [['gender', 'gender', '성별'], ['dorm_period', 'dorm_period', '거주 기간']].forEach(([name, key, label]) => {
    const el = fieldEl(name, 'me');
    if (!el || !b[key]) return;
    const ok = b[key] === a[key];
    addPill(el, pill(ok, `내 ${label}: ${esc(a[key])} ${ok ? '✅' : '❌'}`));
    tally.me.total++; if (ok) tally.me.ok++;
  });
  [['rm_fixed_gender', 'gender', '성별'], ['rm_fixed_dorm', 'dorm_period', '거주 기간']].forEach(([name, key, label]) => {
    const el = fieldEl(name, 'roommate');
    if (!el || !b[key]) return;
    const ok = b[key] === a[key];
    addPill(el, pill(ok, `상대 ${label}: ${esc(b[key])} ${ok ? '✅' : '❌'}`));
    tally.roommate.total++; if (ok) tally.roommate.ok++;
  });

  // 탭 맨 위 요약 + 범례
  const score = matchScore(a, b);
  const summary = (panel, label, t) => {
    const el = scope.querySelector(`[data-panel="${panel}"]`);
    if (!el) return;
    el.insertAdjacentHTML('afterbegin', `
      <div class="khu-cmp rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-700 leading-relaxed">
        <p class="font-bold">${label} 기준 맞는 항목 <span class="text-red-600">${t.ok}/${t.total}</span>${score ? ` · 규칙 점수 ${score.score}점` : ''}</p>
        <p class="text-slate-500 mt-0.5">✅ 허용 범위 안 · ❌ 허용 범위 밖 (괄호는 일치율)</p>
      </div>`);
  };
  summary('me', '내 룸메 허용', tally.me);
  summary('roommate', '상대 룸메 허용', tally.roommate);
}

function compareHtml(mine, theirs) {
  const rows = matchBreakdown(mine, theirs);
  if (!rows.length) return '<p class="text-xs text-slate-400">비교할 항목이 부족해요.</p>';
  return compareRowsHtml(rows, matchScore(mine, theirs));
}
function compareRowsHtml(rows, ms) {
  const tone = t => t.startsWith('범위 안') ? 'text-emerald-600 font-bold' : t.startsWith('범위 밖') ? 'text-rose-600 font-bold' : 'text-slate-400';
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed space-y-2">
      <p class="font-bold text-slate-800">🔍 내 카드와 비교 <span class="font-normal text-slate-500">${ms ? `· 규칙 점수 ${ms.score}점` : ''}</span></p>
      ${rows.map(r => `
        <div class="py-2 border-b border-slate-100 last:border-none space-y-0.5">
          <p class="font-bold text-slate-700">${esc(r.label)} <span class="font-semibold text-red-600">${r.score}점</span></p>
          <p class="text-slate-600">나: ${esc(valueText(r.key, r.mine))} · 상대: ${esc(valueText(r.key, r.theirs))}</p>
          <p><span class="text-slate-500">내 허용:</span> <span class="${tone(r.mineRange)}">${esc(r.mineRange)}</span> · <span class="text-slate-500">상대 허용:</span> <span class="${tone(r.theirsRange)}">${esc(r.theirsRange)}</span></p>
        </div>`).join('')}
    </div>`;
}

function aiBoxHtml(ai) {
  const adj = ai.adjust > 0 ? `+${ai.adjust}` : `${ai.adjust}`;
  return `
    <div class="bg-red-50/60 border border-red-100 text-slate-700 rounded-xl p-4 text-xs leading-relaxed space-y-2">
      <p class="font-bold text-red-600">🤖 AI 분석 <span class="font-bold text-slate-500">· 규칙 ${ai.rule_score}점 → AI 보정 ${adj} → 최종 ${ai.final}점</span></p>
      <p>${esc(ai.summary)}</p>
      ${ai.analysis ? `<p class="text-slate-600">${esc(ai.analysis)}</p>` : ''}
      ${ai.good?.length ? `<p class="font-bold text-slate-600"><span class="text-emerald-600 font-bold">✔ 잘 맞는 점</span> ${ai.good.map(esc).join(' · ')}</p>` : ''}
      ${ai.warn?.length ? `<p class="font-bold text-slate-600"><span class="text-rose-600 font-bold">⚠ 확인해 보세요</span> ${ai.warn.map(esc).join(' · ')}</p>` : ''}
      ${ai.talk?.length ? `<p class="font-bold text-slate-600"><span class="text-red-600 font-bold">💬 맞춰 볼 것</span> ${ai.talk.map(esc).join(' · ')}</p>` : ''}
    </div>`;
}

// ================= 4. 초기 실행 =================
// 질문을 추가했는데 매칭 규칙(matching.js)에 없으면 콘솔에서 알려 줌
checkMatchCoverage(PROFILE_SCHEMA.filter(s => sectionScope(s) === 'me'));   // 원하는 룸메(rm_) 질문은 매칭 규칙을 따로 만들 예정

// auth.js 가 로그인 상태를 알려 주는 시점이 이 파일이 로드되기보다 빠르면 놓칠 수 있으므로,
// 시작할 때 현재 세션을 한 번 직접 확인 (같은 사용자면 onAuthChanged 가 중복 로딩을 막아 줌)
sb.auth.getSession().then(({ data }) => onAuthChanged(data.session));