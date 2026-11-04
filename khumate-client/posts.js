// ================= 룸메이트 글 (Supabase DB) =================
// 테이블: roommate_posts (posts-setup.sql, match-setup.sql) — 사용자 1명당 글 1개
// 카드 상태 status: draft(임시저장) · published(게시, 목록에 뜸) · archived(보관, 데이터만 남기고 목록에서 숨김)
// 의존: auth.js 의 sb (Supabase 클라이언트), profile-schema.js 의 SCHEMA_VERSION

const POSTS_TABLE = 'roommate_posts';

// 목록 카드에 필요한 컬럼만 (answers 같은 큰 데이터는 제외)
const LIST_COLUMNS = 'user_id,title,gender,dorm_period,dept,student_id,birth_year,schema_version,updated_at';
// 로그인 안 한 사용자용: DB 권한(guest-browse-setup.sql)에서 허용한 열만 (학번·출생년도 제외)
const GUEST_LIST_COLUMNS = 'user_id,title,gender,dorm_period,dept,schema_version,updated_at';

// 내 글 1개 (없으면 null)
async function fetchMyPost(userId) {
  const { data, error } = await sb.from(POSTS_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// 글 하나 (답안 보기용). 로그인한 사용자는 누구 글이든 읽을 수 있음(RLS)
async function fetchPostById(userId) {
  const { data, error } = await sb.from(POSTS_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// 매칭 후보: 같은 성별 + 같은 거주 기간 + 현재 질문지로 답한 글 (조건은 DB가 걸러 줌, 인덱스 사용)
async function fetchCandidates(me) {
  const { data, error } = await sb.from(POSTS_TABLE).select('*')
    .eq('status', 'published')
    .eq('gender', me.gender).eq('dorm_period', me.dorm_period)
    .gte('schema_version', SCHEMA_VERSION).neq('user_id', me.user_id)
    .order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data;
}

// 둘러보기용 (내 글이 없을 때): 최근 수정순 100개, 가벼운 컬럼만
async function fetchBrowsePosts(columns = LIST_COLUMNS) {
  const { data, error } = await sb.from(POSTS_TABLE).select(columns)
    .eq('status', 'published')
    .order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
}

// 내 글 저장: 없으면 새로 올리고, 있으면 덮어씀 (user_id가 같으면 같은 글)
async function savePost(row) {
  const { error } = await sb.from(POSTS_TABLE).upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

async function deletePost(userId) {
  const { error } = await sb.from(POSTS_TABLE).delete().eq('user_id', userId);
  if (error) throw error;
}

// 내 카드 상태 바꾸기 (임시저장·게시·보관). 데이터는 그대로 두고 status 만 바꿈
async function setPostStatus(userId, status) {
  const { error } = await sb.from(POSTS_TABLE).update({ status }).eq('user_id', userId);
  if (error) throw error;
}