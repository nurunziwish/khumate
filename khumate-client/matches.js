// ================= 룸메 매칭 신청 · 확정 · 하우스룰 =================
// 테이블: match_requests (match-setup.sql)
//  - 채팅 대화창의 "룸메 매칭 신청" 버튼으로 신청 → 받은 사람이 채팅 탭에서 수락하면 룸메 확정
//  - 확정되면 하우스룰 탭에 서로의 매칭 카드가 뜸 (하우스룰 내용은 다음 단계)
// 의존: auth.js 의 sb, script.js 의 currentUser·myPost·cardHtml·showToast, posts.js 의 fetchPostById·fetchMyPost,
//       messages.js 의 peerTitles·refreshMessages

const MATCH_REQ_TABLE = 'match_requests';
const snapshotCache = new Map();   // 확정 카드 복사본 (user_id → 행). 답안 보기에서 카드가 없을 때 씀

// ---------- 데이터 ----------

// 나와 관련된 신청 전부 (보낸 것 + 받은 것, 최신순)
async function fetchMyRequests(myId) {
  const { data, error } = await sb.from(MATCH_REQ_TABLE).select('*')
    .or(`from_id.eq.${myId},to_id.eq.${myId}`)
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data;
}

// 내가 확정된 룸메 신청 (없으면 null)
async function fetchAcceptedMatch(myId) {
  const rows = await fetchMyRequests(myId);
  return rows.find(r => r.status === 'accepted') ?? null;
}

async function sendMatchRequest(myId, toId) {
  // 상대가 "다시 신청 못하게" 막아 둔 경우 (거절할 때 체크한 것)
  const { data: blocked, error: bErr } = await sb.from(MATCH_REQ_TABLE).select('id')
    .eq('from_id', myId).eq('to_id', toId).eq('blocked', true).limit(1);
  if (bErr) throw bErr;
  if (blocked?.length) throw new Error('이 사람에게는 다시 신청할 수 없어요.');
  const { error } = await sb.from(MATCH_REQ_TABLE).insert({ from_id: myId, to_id: toId });
  if (error) throw error;
}

async function respondMatchRequest(id, accept, block = false) {
  const { error } = await sb.from(MATCH_REQ_TABLE).update({ status: accept ? 'accepted' : 'rejected', blocked: !accept && block }).eq('id', id);
  if (error) throw error;
}

async function cancelMatchRequest(id) {
  const { error } = await sb.from(MATCH_REQ_TABLE).update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

// ---------- 채팅 탭: 대기 중인 신청 카드 ----------

async function renderMatchRequests() {
  const box = document.getElementById('match-requests');
  if (!box) return;
  if (!currentUser) { box.innerHTML = ''; return; }
  try {
    const rows = (await fetchMyRequests(currentUser.id)).filter(r => r.status === 'pending');
    if (!rows.length) { box.innerHTML = ''; return; }
    const peerOf = r => r.from_id === currentUser.id ? r.to_id : r.from_id;
    const titles = await peerTitles([...new Set(rows.map(peerOf))]);
    box.innerHTML = rows.map(r => {
      const title = esc(titles.get(peerOf(r)) ?? '(글이 삭제된 사용자)');
      if (r.from_id === currentUser.id) {
        return `<div class="bg-white border border-dashed border-red-300 rounded-2xl p-4 flex items-center gap-3">
          <div class="min-w-0 flex-1"><p class="font-bold text-slate-800 truncate">${title}</p>
          <p class="text-xs text-slate-500 mt-0.5">룸메 신청을 보냈어요. 응답을 기다리는 중</p></div>
          <button onclick="onCancelMatch(${Number(r.id)})" class="text-xs text-slate-500 underline shrink-0">신청 취소</button></div>`;
      }
      return `<div class="bg-white border border-red-300 rounded-2xl p-4 space-y-2">
          <p class="text-xs font-bold text-red-600">룸메 매칭 신청이 왔어요</p>
          <p class="font-bold text-slate-800 truncate">${title}</p>
          <div class="flex gap-2">
            <button onclick="onRespondMatch(${Number(r.id)}, true)" class="flex-1 py-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-500 text-white text-sm font-bold">수락</button>
            <button onclick="onRespondMatch(${Number(r.id)}, false)" class="flex-1 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold">거절</button>
          </div></div>`;
    }).join('');
  } catch (e) {
    console.error('[matches] 신청 목록 실패:', e.message);
    box.innerHTML = '';
  }
}

// 거절 팝업: "다시 신청 못하게 하기" 체크박스 (기본: 체크 안 됨). 취소하면 null
function khuRejectDialog() {
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
        <div class="px-5 py-5 space-y-4">
          <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">이 룸메 신청을 거절할까요?</p>
          <label class="flex items-start gap-2.5 cursor-pointer">
            <input id="khu-reject-block" type="checkbox" class="mt-0.5 w-4 h-4 accent-red-600">
            <span class="text-sm text-slate-700"><span class="font-bold">다시 신청하지 못하게 하기</span>
              <span class="block text-xs text-slate-400 mt-0.5">체크하면 이 사람은 나에게 룸메 신청을 다시 보낼 수 없어요.</span></span>
          </label>
        </div>
        <div class="px-5 pb-5 flex gap-2">
          <button data-r="0" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition">취소</button>
          <button data-r="1" class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition">거절</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="0"]').onclick = () => { wrap.remove(); resolve(null); };
    wrap.querySelector('[data-r="1"]').onclick = () => {
      const block = wrap.querySelector('#khu-reject-block').checked;
      wrap.remove();
      resolve({ block });
    };
  });
}

async function onRespondMatch(id, accept) {
  let block = false;
  if (accept) {
    if (!(await khuConfirm('룸메 신청을 수락할까요?\n수락하면 룸메가 확정돼요.', { okText: '수락' }))) return;
  } else {
    const r = await khuRejectDialog();
    if (!r) return;
    block = r.block;
  }
  try { await respondMatchRequest(id, accept, block); }
  catch (e) { return showToast(e.message || '처리하지 못했어요.'); }
  showToast(accept ? '룸메 매칭이 확정됐어요! 하우스룰 탭에서 서로의 카드를 볼 수 있어요.' : '신청을 거절했어요.');
  refreshMessages();
  if (msgPeer) renderThread(false);
}

async function onCancelMatch(id) {
  if (!(await khuConfirm('룸메 신청을 취소할까요?'))) return;
  try { await cancelMatchRequest(id); }
  catch (e) { return showToast(e.message || '취소하지 못했어요.'); }
  refreshMessages();
  if (msgPeer) renderThread(false);
}

// ---------- 대화창 안의 룸메 신청 표시: 받은 신청은 수락·거절, 보낸 신청은 취소 ----------
async function threadMatchNoticeHtml(peerId) {
  if (!currentUser || !peerId) return '';
  const rows = await fetchMyRequests(currentUser.id);
  const withPeer = rows.filter(r => r.from_id === peerId || r.to_id === peerId);
  const pending = withPeer.find(r => r.status === 'pending');
  if (pending && pending.to_id === currentUser.id) {
    return `<div class="bg-white border border-red-300 rounded-2xl p-4 space-y-2">
        <p class="text-xs font-bold text-red-600">룸메 매칭 신청이 왔어요</p>
        <div class="flex gap-2">
          <button onclick="onRespondMatch(${Number(pending.id)}, true)" class="flex-1 py-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-500 text-white text-sm font-bold shadow-sm hover:shadow-lg hover:brightness-110 transition">수락</button>
          <button onclick="onRespondMatch(${Number(pending.id)}, false)" class="flex-1 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 hover:text-slate-900 transition">거절</button>
        </div></div>`;
  }
  if (pending && pending.from_id === currentUser.id) {
    return `<div class="bg-white border border-dashed border-red-300 rounded-2xl p-4 flex items-center gap-3">
        <p class="flex-1 text-xs text-slate-600">룸메 신청을 보냈어요. 응답을 기다리는 중이에요.</p>
        <button onclick="onCancelMatch(${Number(pending.id)})" class="text-xs text-slate-500 underline shrink-0">신청 취소</button></div>`;
  }
  if (withPeer.some(r => r.status === 'accepted')) {
    return '<div class="bg-red-50 border border-red-100 rounded-2xl p-3 text-xs font-bold text-red-600 text-center">룸메가 확정됐어요 🎉</div>';
  }
  return '';
}

// ---------- 대화창 상단 버튼: 상대와의 상태에 따라 바뀜 ----------

async function refreshThreadMatchBtn(peerId) {
  const btn = document.getElementById('thread-match-btn');
  if (!btn || !currentUser || !peerId) return;
  btn.dataset.peer = peerId;
  let rows;
  try { rows = await fetchMyRequests(currentUser.id); }
  catch { btn.textContent = '불러오기 실패'; btn.disabled = true; return; }

  const withPeer = rows.filter(r => r.from_id === peerId || r.to_id === peerId);
  const pending = withPeer.find(r => r.status === 'pending');
  const confirmedOther = rows.some(r => r.status === 'accepted');

  btn.dataset.action = 'send'; btn.dataset.req = '';
  btn.disabled = false;
  if (withPeer.some(r => r.status === 'accepted')) { btn.textContent = '룸메 확정 ✓'; btn.disabled = true; }
  else if (confirmedOther) { btn.textContent = '이미 룸메가 있어요'; btn.disabled = true; }
  else if (pending && pending.from_id === currentUser.id) { btn.textContent = '신청 취소'; btn.dataset.action = 'cancel'; btn.dataset.req = pending.id; }
  else if (pending) { btn.textContent = '받은 신청 확인'; btn.dataset.action = 'check'; btn.dataset.req = pending.id; }
  else { btn.textContent = '룸메 매칭 신청'; }
}

async function onThreadMatchClick() {
  const btn = document.getElementById('thread-match-btn');
  if (!btn || btn.disabled || !currentUser) return;
  const peer = btn.dataset.peer;
  const action = btn.dataset.action;
  if (action === 'send') {
    if (!(await requirePublishedCard())) return;
    if (!(await khuConfirm('이 사람에게 룸메 매칭을 신청할까요?\n상대가 수락하면 룸메가 확정돼요.'))) return;
    try { await sendMatchRequest(currentUser.id, peer); showToast('룸메 매칭 신청을 보냈어요.'); }
    catch (e) { return showToast(e.message || '신청하지 못했어요.'); }
  } else if (action === 'cancel') {
    try { await cancelMatchRequest(Number(btn.dataset.req)); showToast('신청을 취소했어요.'); }
    catch (e) { return showToast(e.message || '취소하지 못했어요.'); }
  } else if (action === 'check') {
    return showToast('이 대화창 위의 신청 카드에서 수락하거나 거절할 수 있어요.');
  }
  await refreshThreadMatchBtn(peer);
  refreshMessages();
}

// ---------- 확정 해제 ----------

async function releaseMatchRequest(id) {
  const { error } = await sb.from(MATCH_REQ_TABLE).update({ status: 'ended' }).eq('id', id);
  if (error) throw error;
}

async function onReleaseMatch(id) {
  if (!(await khuConfirm('룸메 확정을 해제할까요?\n확정된 기록은 지워지고, 두 사람 모두 다시 룸메 신청을 할 수 있어요.\n카드는 다시 게시되어 목록에 올라가요.'))) return;
  try { await releaseMatchRequest(id); }
  catch (e) { return showToast(e.message || '해제하지 못했어요.'); }
  showToast('룸메 확정을 해제했어요.');
  refreshMessages();
  renderHouseRule();
}

// ---------- 하우스룰 탭: 확정된 룸메의 카드 (확정 때 복사해 둔 데이터) ----------

// 확정 카드 복사본 (match_snapshots). 카드가 삭제되었거나 보관되어도 남아 있음
async function fetchSnapshots(matchId) {
  const { data, error } = await sb.from('match_snapshots').select('*').eq('match_id', matchId);
  if (error) throw error;
  return data;
}

// ---------- 하우스룰 칸 (본격적인 하우스룰 입력 전 틀) ----------
// 2열(나·룸메)로 보이는 항목: 기상·취침, 샤워. 나머지는 드롭다운(답 선택지만)
const HOUSE_GROUPS = [
  { title: '생활 리듬', items: [
    { kind: 'pair', names: ['wake_time', 'sleep_time'], label: '기상 시간 · 취침 시간' },
    { kind: 'pair', names: ['shower_time'], label: '샤워 시간' },
  ] },
  { title: '환경 및 생활 방식', items: [
    { kind: 'select', name: 'media_style', label: '미디어 시청 방식' },
    { kind: 'select', name: 'call_style', label: '통화 방식' },
    { kind: 'select', name: 'light_pref', label: '취침 시간 조명' },
    { kind: 'select', name: 'indoor_eating', label: '취식 허용 범위' },
  ] },
  { title: '청소 및 청결', items: [
    { kind: 'select', name: 'clean_style', label: '공용 공간 청소 주기' },
    { kind: 'select', name: 'tidy_level', label: '개인 공간 청소 주기' },
    { kind: 'select', name: 'trash_style', label: '쓰레기 청소 주기' },
    { kind: 'select', name: 'ventilation', label: '환기 주기' },
  ] },
  { title: '사생활', items: [
    { kind: 'select', name: 'smoking', label: '담배' },
    { kind: 'select', name: 'drinking', label: '음주' },
  ] },
];
const HOUSE_PAIR_LABEL = { wake_time: '기상', sleep_time: '취침', shower_time: '샤워' };

// 스키마에서 질문 정의 찾기 (그룹 안까지)
function houseFieldDef(name) {
  let found = null;
  const walk = fields => (fields || []).forEach(f => {
    if (found) return;
    if (f.name === name) found = f;
    else if (f.type === 'group') walk(f.fields);
  });
  PROFILE_SCHEMA.filter(sec => sectionScope(sec) === 'me').forEach(sec => walk(sec.fields));
  return found;
}

// 답 선택지만 보여 주는 드롭다운 (다른 서식과 같은 comboHtml 사용)
function houseSelectHtml(name, value = '') {
  const def = houseFieldDef(name);
  return comboHtml({ name: '', options: def?.options || [], value, placeholder: '선택해 주세요', hiddenAttr: `data-house="${esc(name)}"` });
}

// 저장 / 실시간 공유 (house_rule_items: 칸 하나당 한 줄)
let houseMatchId = null, houseChannel = null, houseChannelMatch = null;

async function fetchHouseItems(matchId) {
  const { data, error } = await sb.from('house_rule_items').select('field, answer').eq('match_id', matchId);
  if (error) throw error;
  return Object.fromEntries((data || []).map(r => [r.field, r.answer]));
}

async function saveHouseItem(matchId, field, answer) {
  if (!answer || !currentUser) return;
  try {
    const { error } = await sb.from('house_rule_items').upsert(
      { match_id: matchId, field, answer, updated_by: currentUser.id, updated_at: new Date().toISOString() },
      { onConflict: 'match_id,field' });
    if (error) throw error;
  } catch (e) {
    console.error('[matches] 하우스룰 저장 실패:', e.message);
    khuAlert('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  renderHouseRule();
}

// 드롭다운을 고르면 저장 (이벤트 위임: 다시 그려져도 동작)
document.addEventListener('change', e => {
  if (!e.target.classList?.contains('khu-combo-input')) return;
  const hidden = e.target.closest('.khu-combo')?.querySelector('input[data-house]');
  if (!hidden || !houseMatchId) return;
  saveHouseItem(houseMatchId, hidden.dataset.house, hidden.value);
});

// 자동 합의 답안
// 허용 범위(rm_*)의 가장 높은 단계 = 그 칸에서 받아 줄 수 있는 마지막 단계 (상관없음 = 마지막)
// 합의 답 = 두 사람의 허용 범위 중 더 좁은 쪽의 단계 (둘 다 받아 줄 수 있는 가장 넓은 답)
// 한쪽의 답이 상대의 허용 범위를 넘으면 '협의가 필요해요'를 남김
function houseEval(name, mine, theirs) {
  const def = houseFieldDef(name);
  const list = (RM_OVERRIDE[name]?.options || def?.options || []).map(op => op.value);
  const idx = v => (v === undefined || v === null || v === '') ? -1 : list.indexOf(v);
  const tolMax = t => {
    if (t === 'any') return list.length - 1;
    const vals = [].concat(t ?? []).filter(Boolean);
    if (!vals.length) return -1;
    return Math.max(...vals.map(v => v === 'any' ? list.length - 1 : list.indexOf(v)));
  };
  const myA = idx(mine[name]), theirA = idx(theirs[name]);
  const myT = tolMax(mine['rm_' + name]), theirT = tolMax(theirs['rm_' + name]);
  if (myA < 0 || theirA < 0 || myT < 0 || theirT < 0) return { value: '', conflict: false };
  const agreed = Math.min(myT, theirT);
  return { value: list[agreed], conflict: myA > theirT || theirA > myT };
}

function houseCellHtml(tag, text) {
  return `<div class="rounded-xl bg-gradient-to-br from-red-50 to-orange-50 px-3 py-2.5">
    <p class="text-[10px] font-black khu-grad-text">${tag}</p>
    <p class="text-sm font-bold text-slate-800 mt-0.5">${text}</p></div>`;
}

async function renderHouseRule() {
  const box = document.getElementById('houserule-body');
  if (!box) return;
  if (!currentUser) { box.innerHTML = '<p class="text-center text-sm text-slate-400 py-20">로그인하면 확정된 룸메이트를 볼 수 있어요.</p>'; return; }
  try {
    const m = await fetchAcceptedMatch(currentUser.id);
    if (!m) {
      box.innerHTML = '<p class="text-center text-sm text-slate-400 py-20">아직 확정된 룸메이트가 없어요.<br>채팅 탭에서 상대에게 룸메 매칭을 신청해 보세요.</p>';
      return;
    }
    const snaps = await fetchSnapshots(m.id);
    let saved = {};
    try { saved = await fetchHouseItems(m.id); }
    catch (e) { console.warn('[matches] 하우스룰 답 불러오기 실패 (SQL 실행 여부 확인):', e.message); }
    houseMatchId = m.id;
    // 상대가 고치면 바로 반영되도록 구독 (같은 신청이면 한 번만)
    if (houseChannelMatch !== m.id) {
      if (houseChannel) sb.removeChannel(houseChannel);
      houseChannelMatch = m.id;
      try {
        houseChannel = sb.channel('house-rule-' + m.id).on('postgres_changes',
          { event: '*', schema: 'public', table: 'house_rule_items', filter: `match_id=eq.${m.id}` },
          () => renderHouseRule()).subscribe();
      } catch (e) { console.warn('[matches] 실시간 구독 실패:', e.message); }
    }
    snaps.forEach(r => snapshotCache.set(r.owner_id, r));
    const mineRow = snaps.find(r => r.owner_id === currentUser.id);
    const partnerRow = snaps.find(r => r.owner_id !== currentUser.id);
    if (!mineRow || !partnerRow) {
      box.innerHTML = '<p class="text-center text-sm text-rose-500 py-20">확정 기록이 부족해요. 룸메 확정을 다시 해 주세요.</p>';
      return;
    }
    const mine = { gender: mineRow.gender, dorm_period: mineRow.dorm_period, ...(mineRow.answers || {}) };
    const theirs = { gender: partnerRow.gender, dorm_period: partnerRow.dorm_period, ...(partnerRow.answers || {}) };
    const show = (obj, n) => (obj[n] === undefined || obj[n] === null || obj[n] === '') ? '미응답' : esc(valueText(n, obj[n]));
    // 위쪽 카드: 기본 5개 정보만 + 카드 자세히 보기 (누르면 전체 카드 팝업)
    const basicCard = r => {
      const items = [r.gender, r.dorm_period, r.dept, r.student_id ? `${r.student_id}학번` : '', r.birth_year ? `${r.birth_year}년생` : '']
        .filter(Boolean);
      return `<div class="flex flex-col h-full p-4">
        <div class="flex flex-wrap gap-1.5 text-xs font-semibold text-slate-700">
          ${items.map(t => `<span class="px-2 py-0.5 bg-slate-100 rounded">${esc(t)}</span>`).join('')}
        </div>
        <button onclick="openViewModal('${esc(r.owner_id)}')" class="mt-auto pt-3 text-left text-xs font-bold text-red-600 hover:underline">카드 자세히 보기 →</button>
      </div>`;
    };
    const topBox = (title, r) => `<div class="rounded-3xl bg-white border border-orange-100 shadow-sm overflow-hidden min-w-0">
        <div class="px-4 py-2.5 bg-gradient-to-r from-red-600 via-rose-500 to-orange-400 text-white">
          <p class="text-sm font-black">${title}</p>
        </div>
        ${basicCard(r)}
      </div>`;

    const itemHtml = it => {
      if (it.kind === 'pair') {
        const line = obj => it.names.map(n => `${HOUSE_PAIR_LABEL[n]} ${show(obj, n)}`).join(' · ');
        return `<div>
          <p class="text-xs font-bold text-slate-600 mb-1.5">${esc(it.label)}</p>
          <div class="grid grid-cols-2 gap-2">${houseCellHtml('나', line(mine))}${houseCellHtml('룸메', line(theirs))}</div>
        </div>`;
      }
      // 저장된 답이 있으면 그 답, 없으면 자동 합의 답. 저장된 답이 생기면 '협의' 표시는 접음
      const r = houseEval(it.name, mine, theirs);
      const hasSaved = saved[it.name] !== undefined;
      return `<div>
        <p class="text-xs font-bold text-slate-600 mb-1.5">${esc(it.label)}</p>
        ${houseSelectHtml(it.name, hasSaved ? saved[it.name] : r.value)}
        ${r.conflict && !hasSaved ? '<p class="text-[11px] font-bold text-rose-500 mt-1.5 px-0.5">협의가 필요해요</p>' : ''}
      </div>`;
    };

    box.innerHTML = `
      <div class="space-y-5 text-left">
        <div class="grid grid-cols-2 gap-3 items-stretch">
          ${topBox('내 카드', mineRow)}
          ${topBox('룸메 카드', partnerRow)}
        </div>
        ${HOUSE_GROUPS.map(g => `
          <div class="rounded-3xl bg-white border border-orange-100 shadow-sm overflow-hidden">
            <div class="px-4 py-2.5 bg-gradient-to-r from-red-600 via-rose-500 to-orange-400 text-white">
              <p class="text-sm font-black">${esc(g.title)}</p>
            </div>
            <div class="p-4 space-y-4">${g.items.map(itemHtml).join('')}</div>
          </div>`).join('')}
        <div class="pt-2 text-center">
          <button onclick="onReleaseMatch(${Number(m.id)})" class="text-xs text-slate-500 underline hover:text-red-600">룸메 확정 해제</button>
        </div>
      </div>`;
  } catch (e) {
    console.error('[matches] 하우스룰 실패:', e.message);
    box.innerHTML = '<p class="text-center text-sm text-rose-500 py-20">하우스룰을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>';
  }
}