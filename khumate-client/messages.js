// ================= 쪽지 (1:1 메시지) · 채팅 탭 메시지함 =================
// 테이블: messages (messages-setup.sql). 상대 이름은 상대 룸메 글 제목으로 보여 줌 (아이디는 공개하지 않음)
// 의존: auth.js 의 sb, script.js 의 currentUser, profile-form.js 의 esc, posts.js 의 POSTS_TABLE
// 실시간: Supabase Realtime(postgres_changes)으로 새 쪽지·읽음·룸메 신청을 바로 반영.
//         연결이 끊기면 60초마다 확인하는 방식으로 자동 보완. (realtime-setup.sql 적용 필요)

const MSG_TABLE = 'messages';
const HIDE_TABLE = 'thread_hides';   // 채팅방 삭제 기록 (message-hide-setup.sql)
const MSG_POLL_MS = 60000;
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

// 내가 삭제한 채팅방 기준 시각 (삭제 시점 이전 쪽지는 내 화면에서 숨김)
async function fetchHides(myId) {
  const { data, error } = await sb.from(HIDE_TABLE).select('peer_id,hidden_at').eq('user_id', myId);
  if (error) throw error;
  return new Map(data.map(r => [r.peer_id, new Date(r.hidden_at).getTime()]));
}
const isHidden = (hides, peer, iso) => hides.has(peer) && new Date(iso).getTime() <= hides.get(peer);

// 채팅방 삭제 (내 화면에서만. 서버 시각을 기준으로 기록)
async function deleteThread(peerId) {
  const { error } = await sb.rpc('hide_thread', { peer: peerId });
  if (error) throw error;
}

// 상대 한 명과 주고받은 쪽지 (오래된 순, 내가 삭제한 시점 이전 것은 제외)
async function fetchThread(myId, peerId) {
  const { data, error } = await sb.from(MSG_TABLE).select('*')
    .or(`and(from_id.eq.${myId},to_id.eq.${peerId}),and(from_id.eq.${peerId},to_id.eq.${myId})`)
    .order('created_at', { ascending: true }).limit(300);
  if (error) throw error;
  const hides = await fetchHides(myId);
  return data.filter(m => !isHidden(hides, peerId, m.created_at));
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
  const hides = await fetchHides(myId);
  const map = new Map();
  for (const m of data) {
    const peer = m.from_id === myId ? m.to_id : m.from_id;
    if (isHidden(hides, peer, m.created_at)) continue;   // 내가 삭제한 채팅방의 옛 쪽지
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
  const { data, error } = await sb.from(MSG_TABLE).select('from_id,created_at')
    .eq('to_id', myId).is('read_at', null);
  if (error) throw error;
  const hides = await fetchHides(myId);
  const count = data.filter(m => !isHidden(hides, m.from_id, m.created_at)).length;
  const req = await sb.from('match_requests').select('id', { count: 'exact', head: true })
    .eq('to_id', myId).eq('status', 'pending');
  if (req.error) throw req.error;
  return count + (req.count ?? 0);
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
  ensureRealtime();
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
      const isIncoming = incoming.has(c.peer);
      return `
        <div class="relative rounded-2xl shadow-sm hover:shadow-md transition ${isIncoming ? 'bg-rose-50/50 border border-red-200' : 'bg-white border border-slate-200'}">
          <button data-peer="${esc(c.peer)}" data-title="${esc(c.title)}" onclick="openThreadFromInbox(this)" class="w-full text-left p-4 pr-14 rounded-2xl">
            ${isIncoming ? '<span class="inline-block mb-1 px-2 py-0.5 rounded-md bg-red-100 text-red-600 text-[10px] font-bold">룸메 신청이 왔어요</span>' : ''}
            <div class="flex items-center gap-2 min-w-0">
              <p class="font-bold text-slate-800 truncate flex-1">${esc(c.title)}</p>
              ${c.unread ? `<span class="shrink-0 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">${c.unread}</span>` : ''}
            </div>
            <p class="text-xs text-slate-500 truncate mt-0.5">${esc(preview)}</p>
            <p class="text-[10px] text-slate-400 mt-1.5">${timeLabel(c.last.created_at)}</p>
          </button>
          <button type="button" title="채팅방 삭제" aria-label="채팅방 삭제" data-peer="${esc(c.peer)}" onclick="deleteThreadFromInbox(this)" class="absolute top-3 right-3 w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>`;
    }).join('');
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="text-center text-sm text-rose-500 py-10">메시지함을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>';
  }
}

function openThreadFromInbox(btn) { openThread(btn.dataset.peer, btn.dataset.title); }

// 쓰레기통 버튼: 내 화면에서만 채팅방 삭제 (상대 화면에는 그대로 남음)
async function deleteThreadFromInbox(btn) {
  const peer = btn.dataset.peer;
  if (!peer || !currentUser) return;
  const ok = await khuConfirm('이 채팅방을 삭제할까요?\n내 화면에서만 사라지고, 상대방 화면에는 그대로 남아요. 이후 새 쪽지가 오면 새 대화로 다시 보여요.', { okText: '삭제' });
  if (!ok) return;
  try {
    await deleteThread(peer);
    if (msgPeer === peer) closeThread();
    renderInbox();
    refreshMessages();
  } catch (e) {
    console.error(e);
    showToast('채팅방을 삭제하지 못했어요.');
  }
}

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

// ---------- 실시간 반영 ----------

let msgChannel = null;        // Supabase Realtime 채널
let msgChannelUser = null;    // 채널을 연 사용자 아이디
let msgRtTimer = null;

// 변화가 여러 번 와도 한 번만 그리도록 잠깐 모아서 처리
// 열린 대화와 관련된 변화면 대화창도 다시 그림 (맨 아래에 있었으면 맨 아래 유지)
function scheduleRealtimeRefresh(peerId) {
  clearTimeout(msgRtTimer);
  msgRtTimer = setTimeout(async () => {
    refreshMessages();
    if (msgPeer && (!peerId || peerId === msgPeer)) {
      const body = document.getElementById('thread-body');
      const nearBottom = body ? body.scrollHeight - body.scrollTop - body.clientHeight < 80 : false;
      await renderThread(nearBottom);
    }
  }, 150);
}

// 로그인한 사용자 기준으로 채널 연결 (이미 연결돼 있으면 아무 일도 안 함)
function ensureRealtime() {
  if (!currentUser || typeof sb === 'undefined' || !sb.channel) return;
  if (msgChannel && msgChannelUser === currentUser.id) return;
  if (msgChannel) { sb.removeChannel(msgChannel); msgChannel = null; }

  const me = currentUser.id;
  const peerOf = r => (r && (r.from_id === me ? r.to_id : r.from_id)) || null;
  msgChannelUser = me;
  msgChannel = sb.channel(`khu-inbox-${me}`)
    // 내가 받는 쪽지 (새 쪽지, 상대가 읽음 처리한 것 포함)
    .on('postgres_changes', { event: '*', schema: 'public', table: MSG_TABLE, filter: `to_id=eq.${me}` },
      p => scheduleRealtimeRefresh(peerOf(p.new ?? p.old)))
    // 내가 보낸 쪽지 (다른 기기·탭에서 보낸 것, 상대가 읽은 표시)
    .on('postgres_changes', { event: '*', schema: 'public', table: MSG_TABLE, filter: `from_id=eq.${me}` },
      p => scheduleRealtimeRefresh(peerOf(p.new ?? p.old)))
    // 룸메 신청 (받은 것)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests', filter: `to_id=eq.${me}` },
      p => { scheduleRealtimeRefresh(peerOf(p.new ?? p.old)); window.dispatchEvent(new CustomEvent('khu:match-changed')); })
    // 룸메 신청 (보낸 것)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests', filter: `from_id=eq.${me}` },
      p => { scheduleRealtimeRefresh(peerOf(p.new ?? p.old)); window.dispatchEvent(new CustomEvent('khu:match-changed')); })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') scheduleRealtimeRefresh();   // 연결 직후 한 번 맞춤
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[messages] 실시간 연결 실패, 주기 확인으로 대체');
    });
}

// 주기적 확인(연결 끊김 대비) + 창으로 돌아오면 바로 확인
setInterval(() => { if (currentUser) refreshMessages(); }, MSG_POLL_MS);
window.addEventListener('focus', () => { if (currentUser) refreshMessages(); });