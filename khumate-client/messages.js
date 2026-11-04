// ================= 쪽지 (1:1 메시지) · 채팅 탭 메시지함 =================
// 테이블: messages (messages-setup.sql). 상대 이름은 상대 룸메 글 제목으로 보여 줌 (아이디는 공개하지 않음)
// 의존: auth.js 의 sb, script.js 의 currentUser, profile-form.js 의 esc, posts.js 의 POSTS_TABLE
// 새 쪽지 확인: 30초마다 + 탭으로 돌아올 때. (실시간 알림은 나중에)

const MSG_TABLE = 'messages';
const MSG_POLL_MS = 30000;
const MSG_MAX_LEN = 300;

// ---------- 데이터 ----------

// 쪽지 보내기 (내용 검사 후 저장)
async function sendMessage(myId, toId, body) {
  const text = String(body ?? '').trim();
  if (!text) throw new Error('내용을 입력해 주세요.');
  if (text.length > MSG_MAX_LEN) throw new Error(`${MSG_MAX_LEN}자 이하로 써 주세요.`);
  const { error } = await sb.from(MSG_TABLE).insert({ from_id: myId, to_id: toId, body: text });
  if (error) throw error;
}

// 상대 한 명과 주고받은 쪽지 (오래된 순)
async function fetchThread(myId, peerId) {
  const { data, error } = await sb.from(MSG_TABLE).select('*')
    .or(`and(from_id.eq.${myId},to_id.eq.${peerId}),and(from_id.eq.${peerId},to_id.eq.${myId})`)
    .order('created_at', { ascending: true }).limit(300);
  if (error) throw error;
  return data;
}

// 상대 아이디 → 룸메 글 제목 (글이 없으면 맵에 없음)
// 상대 카드 정보 한 줄: 성별 / 거주 기간 / 학번 / 년생 / 학과
const cardInfoLine = p => p
  ? [p.gender, p.dorm_period, p.student_id ? `${p.student_id}학번` : '', p.birth_year ? `${p.birth_year}년생` : '', p.dept].filter(Boolean).join(' / ')
  : '(카드가 없는 사용자)';
// 채팅 목록 제목: 게시글 제목 대신 카드 정보 한 줄
async function peerTitles(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await sb.from(POSTS_TABLE).select('user_id,gender,dorm_period,student_id,birth_year,dept').in('user_id', ids);
  if (error) throw error;
  data.forEach(r => map.set(r.user_id, cardInfoLine(r)));
  return map;
}

// 메시지함: 최근 쪽지 500개를 상대별로 묶음 (최신 대화가 위로)
async function fetchInbox(myId) {
  const { data, error } = await sb.from(MSG_TABLE).select('*')
    .or(`from_id.eq.${myId},to_id.eq.${myId}`)
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  const map = new Map();
  for (const m of data) {
    const peer = m.from_id === myId ? m.to_id : m.from_id;
    if (!map.has(peer)) map.set(peer, { peer, last: m, unread: 0 });
    if (m.to_id === myId && !m.read_at) map.get(peer).unread++;
  }
  const convs = [...map.values()];
  const titles = await peerTitles(convs.map(c => c.peer));
  convs.forEach(c => { c.title = titles.get(c.peer) ?? '(글이 삭제된 사용자)'; });
  return convs;
}

// 안 읽은 쪽지 수 + 받은 룸메 매칭 신청(대기 중) 수 (헤더 뱃지용)
async function fetchUnreadCount(myId) {
  const { count, error } = await sb.from(MSG_TABLE).select('id', { count: 'exact', head: true })
    .eq('to_id', myId).is('read_at', null);
  if (error) throw error;
  const req = await sb.from('match_requests').select('id', { count: 'exact', head: true })
    .eq('to_id', myId).eq('status', 'pending');
  if (req.error) throw req.error;
  return (count ?? 0) + (req.count ?? 0);
}

// 상대가 보낸 쪽지를 모두 읽음 처리
async function markThreadRead(myId, peerId) {
  const { error } = await sb.from(MSG_TABLE).update({ read_at: new Date().toISOString() })
    .eq('to_id', myId).eq('from_id', peerId).is('read_at', null);
  if (error) throw error;
}

// ---------- 화면 ----------

let msgPeer = null;      // 지금 열려 있는 대화 상대 아이디
let msgPeerTitle = '';   // 대화창 제목 (상대 글 제목)

const timeLabel = iso => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 헤더 뱃지 + (메시지함 탭이 열려 있으면) 목록 갱신
async function refreshMessages() {
  const badge = document.getElementById('chat-badge');
  if (!currentUser) { badge?.classList.add('hidden'); return; }
  try {
    const n = await fetchUnreadCount(currentUser.id);
    if (badge) { badge.textContent = n > 9 ? '9+' : n; badge.classList.toggle('hidden', n === 0); }
  } catch (e) { console.error('[messages] 뱃지 갱신 실패:', e.message); }
  if (!document.getElementById('content-chatting')?.classList.contains('hidden')) renderInbox();
}

// 메시지함 목록 그리기
async function renderInbox() {
  const list = document.getElementById('inbox-list');
  if (!list) return;
  if (!currentUser) { list.innerHTML = '<p class="text-center text-sm text-slate-400 py-10">로그인하면 받은 쪽지를 볼 수 있어요.</p>'; return; }
  try {
    const convs = await fetchInbox(currentUser.id);
    // 나에게 온 룸메 신청이 대기 중인 상대 (그 채팅방을 따로 표시)
    const incoming = new Set((await fetchMyRequests(currentUser.id).catch(() => []))
      .filter(r => r.status === 'pending' && r.to_id === currentUser.id).map(r => r.from_id));
    if (!convs.length) { list.innerHTML = '<p class="text-center text-sm text-slate-400 py-10">아직 주고받은 쪽지가 없어요.<br>룸메 글의 답안 보기에서 쪽지를 보내 보세요.</p>'; return; }
    list.innerHTML = convs.map(c => {
      const mine = c.last.from_id === currentUser.id;
      const preview = (mine ? '나: ' : '') + c.last.body;
      return `
        <button data-peer="${esc(c.peer)}" data-title="${esc(c.title)}" onclick="openThreadFromInbox(this)" class="w-full text-left rounded-2xl p-4 shadow-sm hover:shadow-md transition flex items-center gap-3 ${incoming.has(c.peer) ? 'bg-rose-50/50 border border-red-200' : 'bg-white border border-slate-200'}">
          <div class="min-w-0 flex-1">
            ${incoming.has(c.peer) ? '<span class="inline-block mb-1 px-2 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-bold">룸메 신청이 왔어요</span>' : ''}
            <p class="font-bold text-slate-800 truncate">${esc(c.title)}</p>
            <p class="text-xs text-slate-500 truncate mt-0.5">${esc(preview)}</p>
          </div>
          <div class="text-right shrink-0 space-y-1">
            <p class="text-[10px] text-slate-400">${timeLabel(c.last.created_at)}</p>
            ${c.unread ? `<span class="inline-block px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">${c.unread}</span>` : ''}
          </div>
        </button>`;
    }).join('');
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="text-center text-sm text-rose-500 py-10">메시지함을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>';
  }
}

function openThreadFromInbox(btn) { openThread(btn.dataset.peer, btn.dataset.title); }

// 대화창 제목: 상대 카드의 기본 정보 (글 제목 대신)
async function setThreadTitle(peerId) {
  const el = document.getElementById('thread-title');
  try {
    const p = await fetchPostById(peerId);
    el.textContent = p
      ? [p.gender, p.dorm_period, p.student_id ? `${p.student_id}학번` : '', p.birth_year ? `${p.birth_year}년생` : '', p.dept].filter(Boolean).join(' / ')
      : '(카드가 없는 사용자)';
  } catch { el.textContent = '쪽지'; }
}

// 대화창 열기 (열면 바로 읽음 처리)
async function openThread(peerId, title) {
  if (!currentUser || !peerId || peerId === currentUser.id) return;
  msgPeer = peerId;
  msgPeerTitle = title || '쪽지';
  setThreadTitle(peerId);   // 제목: 성별 / 거주 기간 / 학번 / 년생 / 학과
  document.getElementById('thread-input').value = '';
  document.getElementById('thread-modal').classList.remove('hidden');
  refreshThreadMatchBtn(peerId);   // 대화창 상단 '룸메 매칭 신청' 버튼 상태 (matches.js)
  await renderThread(true);
}

// 대화 내용 그리기 (scrollToEnd: 맨 아래로)
async function renderThread(scrollToEnd = false) {
  const body = document.getElementById('thread-body');
  if (!msgPeer || !body) return;
  try {
    const rows = await fetchThread(currentUser.id, msgPeer);
    const notice = await threadMatchNoticeHtml(msgPeer).catch(() => '');   // 룸메 신청 표시 (matches.js)
    // 같은 사람이 같은 분에 보낸 연속 메시지는 묶어서, 시간·읽음 표시는 묶음의 마지막에만 붙임
    const minuteKey = x => Math.floor(new Date(x.created_at).getTime() / 60000);
    body.innerHTML = notice + (rows.length
      ? rows.map((m, idx) => {
          const mine = m.from_id === currentUser.id;
          const prev = rows[idx - 1], next = rows[idx + 1];
          const sameAsPrev = !!prev && prev.from_id === m.from_id && minuteKey(prev) === minuteKey(m);
          const sameAsNext = !!next && next.from_id === m.from_id && minuteKey(next) === minuteKey(m);
          // 안읽은 내 메시지만 말풍선 왼쪽 가운데에 빨간 1 표시
          const unreadMark = mine && !m.read_at ? '<span class="shrink-0 text-[10px] font-bold text-red-500">1</span>' : '';
          const meta = sameAsNext ? '' : `<p class="text-[10px] text-slate-400 mt-0.5 ${mine ? 'text-right' : ''}">${timeLabel(m.created_at)}</p>`;
          return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}" style="${sameAsPrev ? 'margin-top:2px' : ''}">
            <div class="max-w-[75%] w-fit flex flex-col ${mine ? 'items-end' : 'items-start'}">
              <div class="flex items-center gap-1.5 max-w-full">
                ${unreadMark}
                <div class="w-fit max-w-full min-w-0 px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${mine ? 'bg-red-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}">${esc(m.body)}</div>
              </div>
              ${meta}
            </div>
          </div>`;
        }).join('')
      : '<p class="text-center text-sm text-slate-400 py-10">첫 쪽지를 보내 보세요.</p>');
    await markThreadRead(currentUser.id, msgPeer);
    if (scrollToEnd) body.scrollTop = body.scrollHeight;
    refreshMessages();   // 읽음 처리 후 뱃지 갱신
  } catch (e) {
    console.error(e);
    body.innerHTML = '<p class="text-center text-sm text-rose-500 py-10">쪽지를 불러오지 못했어요.</p>';
  }
}

// 보내기 버튼 / Enter
async function sendThreadMessage() {
  const input = document.getElementById('thread-input');
  const btn = document.getElementById('thread-send');
  if (!msgPeer || !currentUser) return;
  if (!(await requirePublishedCard())) return;
  btn.disabled = true;
  try {
    await sendMessage(currentUser.id, msgPeer, input.value);
    input.value = '';
    await renderThread(true);
  } catch (e) {
    showToast(e.message || '쪽지를 보내지 못했어요.');
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

function closeThread() {
  document.getElementById('thread-modal')?.classList.add('hidden');
  msgPeer = null;
  refreshMessages();
}

document.addEventListener('keydown', e => {
  if (e.target?.id === 'thread-input' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendThreadMessage(); }
  if (e.key === 'Escape' && msgPeer) closeThread();
});

// 주기적으로 새 쪽지 확인 + 창으로 돌아오면 바로 확인
setInterval(() => { if (currentUser) refreshMessages(); }, MSG_POLL_MS);
window.addEventListener('focus', () => { if (currentUser) refreshMessages(); });