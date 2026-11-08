// ================= 룸메이트 매칭 점수 =================
// 순수 계산 파일입니다. (화면/DB 코드 없음 → 브라우저와 node 테스트 양쪽에서 같은 코드로 동작)
//
// 생각의 틀
//   내가 "원하는 룸메" 탭에서 고른 허용 범위(rm_*)에 상대의 나의 성향 답이 얼마나 들어가는지를 봅니다.
//   - 허용선(단계 선택)·범위(슬라이더)·포함 여부(체크)마다 "안이면 1, 밖이면 거리만큼 완만하게 감점"
//   - 상대도 같은 방식으로 나를 봄 → 두 방향을 합침 (한쪽만 맞는 것보다 양쪽 다 맞는 쪽이 높음)
//   - 내가 원하는 룸메 조건을 안 적었으면 두 사람의 성향끼리 얼마나 비슷한지로 대신함
//
// 흐름
//   1) 하드 필터 : 같은 성별 + 같은 거주 기간만 후보
//   2) 항목별 점수 : DIMENSIONS 각각 0~1 → 가중 평균 → 0~100
//   3) 흡연 충돌 : 점수 × 0.4
//
// 두 사람 a, b 의 점수는 순서와 무관합니다 (score(a,b) === score(b,a)).
// 질문을 바꾸면 DIMENSIONS 만 고치면 됩니다. (checkMatchCoverage() 가 빠진 질문을 알려 줌)

const MATCH_CONFLICT_FACTOR = 0.4;   // 흡연 충돌 시 점수 배율
const MATCH_MIN_WEIGHT = 40;         // 비교한 항목의 가중치 합이 이보다 작으면 점수를 내지 않음

// ---------- 작은 도구들 ----------
const clamp01 = x => Math.max(0, Math.min(1, x));
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// 두 방향을 합침: 평균을 주되, 한쪽이라도 안 맞으면 그만큼 깎음
// 한쪽만 기대가 크게 어긋나도 평균에 묻히지 않도록 최솟값 쪽 가중을 높임
const mutual = (x, y) => 0.4 * (x + y) / 2 + 0.6 * Math.min(x, y);

// 순서가 있는 선택지 (양 끝 0점): 칸 차이만큼 감점
const ordinal = order => (a, b) => {
  const i = order.indexOf(a), j = order.indexOf(b);
  return i < 0 || j < 0 ? null : 1 - Math.abs(i - j) / (order.length - 1);
};

// 허용선 선택: order 는 엄격 → 느슨 순서. pick 까지는 전부 괜찮고(1), 그 밖은 칸 수만큼 완만히 감점
const strictFit = (order, pick, value) => {
  const t = order.indexOf(pick), r = order.indexOf(value);
  if (t < 0 || r < 0) return null;
  return r <= t ? 1 : clamp01(1 - (r - t) / (order.length - 1));
};

// 정도 맞추기: 고른 선택지(여러 개면 그중 가장 가까운 것)와 얼마나 가까운지. 가까울수록 1, 칸마다 절반씩 감점
const nearestFit = order => (picks, value) => {
  const r = order.indexOf(value);
  const ps = (Array.isArray(picks) ? picks : [picks]).map(p => order.indexOf(p)).filter(i => i >= 0);
  if (r < 0 || !ps.length) return null;
  return Math.max(...ps.map(p => 1 - Math.abs(p - r) / (order.length - 1)));
};
// 숫자 범위 [lo, hi] 안이면 1, 밖이면 거리만큼 감점 (span: 범위의 폭). open 이면 -3 이하 / 3 이상 은 끝까지 허용
const rangeFit = (lo, hi, v, span, open = false) => {
  if (!isNum(v) || !isNum(lo) || !isNum(hi)) return null;
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  const lowOpen = open && a <= -3, highOpen = open && b >= 3;
  if (v >= a && v <= b) return 1;
  if (v < a) return lowOpen ? 1 : clamp01(1 - (a - v) / span);
  return highOpen ? 1 : clamp01(1 - (v - b) / span);
};

// 1~5 슬라이더: 차이 4 → 0점
const scale5 = key => (a, b) => (isNum(a[key]) && isNum(b[key])) ? 1 - Math.abs(a[key] - b[key]) / 4 : null;

// 두 값의 조합표 (순서 무관)
const pairTable = (table, fallback = null) => (x, y) => {
  if (!x || !y) return null;
  const v = table[`${x}|${y}`] ?? table[`${y}|${x}`];
  return v ?? fallback;
};

const jaccard = (x, y) => {
  if (!Array.isArray(x) || !Array.isArray(y) || (!x.length && !y.length)) return null;
  const A = new Set(x), B = new Set(y);
  const inter = [...A].filter(v => B.has(v)).length;
  return inter / (A.size + B.size - inter);
};

// 'HH:MM' → 분
const toMin = t => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const circDist = (x, y) => { const d = Math.abs(x - y); return Math.min(d, 1440 - d); };

// 취침·기상 시간: 안이면 1, 밖이면 가장 가까운 끝까지 거리 / 3시간 (자정을 넘기는 범위도 처리)
const timeWindowFit = (win, t) => {
  if (!win || t === null) return null;
  const [a, b] = win;
  const inside = a <= b ? (t >= a && t <= b) : (t >= a || t <= b);
  if (inside) return 1;
  return clamp01(1 - Math.min(circDist(t, a), circDist(t, b)) / 180);
};
// 상대 값(hourrange {from,to}): 'any' 가 있으면 조건 없음
// def: 그 항목의 전체 범위 [시작시, 끝시] (기상 5~12, 취침 21~4). 상관없음 끝은 이 범위의 끝으로 봄
const hourWin = (w, def) => {
  if (!w || typeof w !== 'object') return null;   // 아직 고르지 않음
  const pick = (v, d) => (v === 'any' || v === undefined || v === null || v === '' ? d : Number(v)) * 60;
  return [pick(w.from, def[0]), pick(w.to, def[1])];
};
const timeSim = key => (a, b) => {
  const x = toMin(a[key]), y = toMin(b[key]);
  if (x === null || y === null) return null;
  return clamp01(1 - circDist(x, y) / 180);
};

// ---------- 공구·공유 궁합 (물건 한 개) ----------
// 둘 다 있으면 중복(dup점), 있는 쪽이 공유 가능하면 1, 둘 다 없으면 공구 의사가 같을수록 높음
const shareSim = (a, b, key, dup) => {
  const x = a[key], y = b[key];
  if (!x || !y) return null;
  if (x === 'own' && y === 'own') return dup;
  if (x === 'none' && y === 'none') {
    const p = a[key + '_buy'], q = b[key + '_buy'];
    return !p || !q ? .8 : p === q ? 1 : .6;
  }
  const owner = x === 'own' ? a : b, wanter = x === 'own' ? b : a;   // 한 명만 있음
  const lend = owner[key + '_lend'], buy = wanter[key + '_buy'];
  if (lend === 'yes') return 1;
  if (lend === 'no') return buy === 'yes' ? .5 : .8;
  return .8;
};

// ---------- 청소·쓰레기 주기 ----------
// 빈도 위치 (0 필요할 때 · 1 격주 · 2 주 1회 · 3 주 2~3회 · 4 격일 · 5 바로바로(매일))
// 슬라이더 눈금 번호 → 빈도 위치 (FREQ_TICKS: 0 격주 · 1 주 1회 · 2 주 2-3회 · 3 격일)
const FREQ_POS = [1, 2, 3, 4];
const freqPos = v => (isNum(v) && FREQ_POS[v] !== undefined) ? FREQ_POS[v] : null;
// 범위 슬라이더(lo~hi 눈금)가 덮는 빈도 위치 구간
const freqWindow = win => {
  const ps = [];
  for (let i = win.lo; i <= win.hi; i++) if (FREQ_POS[i] !== undefined) ps.push(FREQ_POS[i]);
  return ps.length ? [Math.min(...ps), Math.max(...ps)] : null;
};
const CLEAN_ORDER = ['daily', 'often', 'as_needed'];   // 엄격 → 느슨 (원하는 룸메 청소 허용)
const cleanPos = x => x.clean_style === 'daily' ? 5 : x.clean_style === 'as_needed' ? 0 : freqPos(x.clean_freq);
const cleanPref = (me, other) => {
  const style = strictFit(CLEAN_ORDER, me.rm_clean_style, other.clean_style);
  if (style === null) return null;
  // '주기적으로'를 허용한 경우, 상대가 주기적·필요할 때면 주기 범위도 본다. 바로바로는 더 자주라 항상 괜찮음
  const win = me.rm_clean_freq;
  const w = win && isNum(win.lo) && isNum(win.hi) ? freqWindow(win) : null;
  if (me.rm_clean_style === 'often' && (other.clean_style === 'often' || other.clean_style === 'as_needed') && w && cleanPos(other) !== null) {
    return Math.min(style, rangeFit(w[0], w[1], cleanPos(other), 2));
  }
  return style;
};
const cleanSim = (a, b) => {
  const i = cleanPos(a), j = cleanPos(b);
  return i === null || j === null ? null : 1 - Math.abs(i - j) / 5;
};

const TRASH_ORDER = ['immediate', 'regular', 'full'];   // 엄격 → 느슨 (다 찼을 때 = 가장 느슨)
const trashPref = (me, other) => {
  const style = strictFit(TRASH_ORDER, me.rm_trash_style, other.trash_style);
  if (style === null) return null;
  const win = me.rm_trash_freq;
  const w = win && isNum(win.lo) && isNum(win.hi) ? freqWindow(win) : null;
  if (me.rm_trash_style === 'regular' && other.trash_style === 'regular' && w && freqPos(other.trash_freq) !== null) {
    return Math.min(style, rangeFit(w[0], w[1], freqPos(other.trash_freq), 2));
  }
  return style;
};

// ---------- 취향 의견을 한쪽 방향으로 재는 도구 ----------
const stayPref = (me, other) => {
  const pick = [].concat(me.rm_stay_days ?? []);
  const days = Array.isArray(other.stay_days) ? other.stay_days : [];
  if (!pick.length || !days.length) return null;
  if (pick.includes('weekend')) return 1;                         // 주말까지 괜찮음
  return days.some(d => d === '토' || d === '일') ? .3 : 1;      // 평일만 원함
};
const showerPref = (me, other) => {
  const pick = [].concat(me.rm_shower_time ?? []);
  const slots = Array.isArray(other.shower_time) ? other.shower_time : [];
  if (!pick.length || !slots.length) return null;
  return slots.some(s => pick.includes(s)) ? 1 : .3;
};
// 샤워 소요 시간: 내가 고른 룸메 소요 시간 이하면 1 (40분 이상 = 상관없음). 넘으면 초과분만큼 완만히 감점
const durPref = (me, o) => {
  const lim = me.rm_shower_duration, v = o.shower_duration;
  if (lim === undefined || lim === null || lim === '' || v === undefined || v === null || v === '') return null;
  if (String(lim) === '40') return 1;
  const over = Number(v) - Number(lim);
  return over <= 0 ? 1 : clamp01(1 - over / 15);
};
const hobbyOverlap = (a, b) => {
  const norm = arr => new Set((Array.isArray(arr) ? arr : []).map(x => String(x).trim().toLowerCase()).filter(Boolean));
  const A = norm(a.hobby), B = norm(b.hobby);
  if (!A.size || !B.size) return null;   // 취미는 선택 항목이라, 비어 있으면 감점 없이 제외
  const inter = [...A].filter(x => B.has(x)).length;
  return Math.min(1, inter / 2);         // 1개 겹치면 0.5, 2개 이상이면 1
};
const deptPref = (me, other) => {
  const pick = [].concat(me.rm_dept ?? []);
  if (pick.includes('상관없음') || !pick.length || !other.dept) return null;   // 상관없음 = 모든 단과대를 원함 → 학과 조건 없음
  return pick.includes(other.dept) ? 1 : .3;
};
// 이 사람이 '나의 나이·학번 차이' 범위: 상대 - 나 (범위 -3 / +3 은 끝까지 허용)
const yearDiffPref = (key, field) => (me, other) => {
  const win = me[key];
  if (!win || !isNum(win.lo) || !isNum(win.hi)) return null;
  const x = Number(other[field]), y = Number(me[field]);
  if (!(x > 0 && y > 0)) return null;
  return rangeFit(win.lo, win.hi, x - y, 3, true);
};
const ageSim = (a, b) => {
  const x = Number(a.birth_year), y = Number(b.birth_year);
  return (x > 1900 && y > 1900) ? clamp01(1 - Math.abs(x - y) * 0.22) : null;   // 1살 0.78 · 3살 0.34 · 5살 이상 0
};

// ---------- 교차 항목: 내 민감도 vs 상대가 내는 소음/냄새 ----------
//   예) 소음에 예민한 A + 코골이가 잦고 방에서 통화가 많은 B → 낮은 점수
const weightedAvg = (pairs) => {
  let s = 0, w = 0;
  pairs.forEach(([v, wt]) => { if (v !== undefined && v !== null) { s += v * wt; w += wt; } });
  return w ? s / w : null;
};
const noiseEmission = x => weightedAvg([
  [{ none: 0, sometimes: .5, often: 1 }[x.snoring], .35],
  [{ earphone: 0, speaker_low: .4, speaker_free: 1 }[x.media_style], .25],
  [{ outside: 0, short_quiet: .3, free: 1 }[x.call_style], .25],
  [{ silent: 0, once: .2, multi: .6 }[x.alarm_style], .15],
]);
const smellEmission = x => weightedAvg([
  [{ none: 0, snack: .4, meal: 1 }[x.indoor_eating], .7],
  [{ immediate: 0, regular: .5, full: 1 }[x.trash_style], .3],
]);
const crossOneWay = (sens, emission) => (isNum(sens) && emission !== null) ? 1 - ((sens - 1) / 4) * emission : null;
const crossBoth = (sensKey, emitFn) => (a, b) => {
  const ab = crossOneWay(a[sensKey], emitFn(b)), ba = crossOneWay(b[sensKey], emitFn(a));
  if (ab === null || ba === null) return null;
  return 0.5 * Math.min(ab, ba) + 0.5 * (ab + ba) / 2;
};

// 공동 물건 공유 의사 (당번제·쓰레기통): 둘 다 쓰는지, 순서/당번 방식이 같은지
const sameSet = (x, y) => {
  if (!Array.isArray(x) || !Array.isArray(y)) return null;
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return .4;
  return x.join() === y.join() ? 1 : .5;
};
const binSim = (a, b) => {
  const ya = (a.shared_bin || []).includes('yes'), yb = (b.shared_bin || []).includes('yes');
  if (!ya && !yb) return 1;
  if (ya !== yb) return .4;
  return sameSet(a.trash_rotation, b.trash_rotation) ?? 1;   // 같이 쓰면 당번 방식도 맞는지
};

// ---------- 항목 목록 (가중치 = 중요도. 비교할 수 없는 항목은 자동으로 빠짐) ----------
// pref(me, other): 내가 원하는 룸메 조건으로 상대를 본 점수 (0~1). 조건을 안 적었으면 null
// sim(a, b): 두 사람의 성향끼리 비슷한지 (대칭). pref 가 null 일 때 대신 씀
// ---------- 생활 리듬·환기 궁합 (교차 항목) ----------
// 규칙 1: 취침~기상 사이를 "잠든 시간"으로 보고 10분 단위로 나눔. 한쪽만 자고 있는 시간(엇갈림)이 적을수록 높음
const sleepMask = (sleepT, wakeT) => {
  const s = toMin(sleepT), w = toMin(wakeT);
  if (s === null || w === null) return null;
  const len = (w - s + 1440) % 1440;
  return Array.from({ length: 144 }, (_, i) => len > 0 && ((i * 10 - s + 1440) % 1440) < len);
};
const rhythmSim = (a, b) => {
  const ma = sleepMask(a.sleep_time, a.wake_time), mb = sleepMask(b.sleep_time, b.wake_time);
  if (!ma || !mb) return null;
  const diff = ma.reduce((n, v, i) => n + (v !== mb[i] ? 1 : 0), 0);
  return clamp01(1 - 2 * diff / 144);   // 엇갈림 50%면 0, 완전히 같으면 1
};

// 규칙 5: 추위를 많이 타는 사람(온도 민감도 1~2, 눈금 왼쪽)은 자주 환기하는 룸메와 충돌. 더위 쪽은 환기가 도움이 됨
const ventEmission = x => ({ often: 1, sometimes: .5, rarely: 0 }[x.ventilation] ?? null);
const coldness = x => isNum(x.temp_sensitivity) ? clamp01((3 - x.temp_sensitivity) / 2) : null;   // 1=추위 많이 탐 → 1, 3=보통 → 0
const coldVentOneWay = (cold, emit) => (cold === null || emit === null) ? null : 1 - cold * emit;
const coldVentSim = (a, b) => {
  const ab = coldVentOneWay(coldness(a), ventEmission(b)), ba = coldVentOneWay(coldness(b), ventEmission(a));
  if (ab === null || ba === null) return null;
  return 0.5 * Math.min(ab, ba) + 0.5 * (ab + ba) / 2;
};

// weight: 숫자 또는 (me) => 숫자
const DIMENSIONS = [
  // ① 생활 리듬
  { key: 'sleep_time', label: '취침 시간', weight: 8, uses: ['sleep_time', 'rm_sleep_time'],
    pref: (me, o) => timeWindowFit(hourWin(me.rm_sleep_time, [21, 4]), toMin(o.sleep_time)), sim: timeSim('sleep_time') },
  { key: 'wake_time', label: '기상 시간', weight: 7, uses: ['wake_time', 'rm_wake_time'],
    pref: (me, o) => timeWindowFit(hourWin(me.rm_wake_time, [5, 12]), toMin(o.wake_time)), sim: timeSim('wake_time') },
  { key: 'rhythm', label: '생활 리듬 겹침', weight: 5, uses: ['sleep_time', 'wake_time'], sim: rhythmSim },
  { key: 'room_stay', label: '재실 패턴', weight: 4, uses: ['room_stay', 'rm_room_stay'],
    pref: (me, o) => strictFit(['low', 'medium', 'high'], me.rm_room_stay, o.room_stay), sim: ordinal(['high', 'medium', 'low']) },
  { key: 'stay_days', label: '상주 요일', weight: 3, uses: ['stay_days', 'rm_stay_days'],
    pref: stayPref, sim: (a, b) => jaccard(a.stay_days, b.stay_days) },
  { key: 'shower', label: '샤워 시간대', weight: 2, uses: ['shower_time', 'rm_shower_time'], pref: showerPref },
  { key: 'shower_duration', label: '샤워 소요 시간', weight: 2, uses: ['shower_duration', 'rm_shower_duration'], pref: durPref },

  // ② 소음·환경
  { key: 'noise_sens', label: '소음 민감도', weight: 4, uses: ['noise_sensitivity', 'rm_noise_sensitivity'],
    pref: (me, o) => me.rm_noise_sensitivity ? rangeFit(me.rm_noise_sensitivity.lo, me.rm_noise_sensitivity.hi, o.noise_sensitivity, 4) : null,
    sim: scale5('noise_sensitivity') },
  { key: 'snoring', label: '코골이', weight: 4, uses: ['snoring', 'rm_snoring'],
    pref: (me, o) => strictFit(['none', 'sometimes', 'often'], me.rm_snoring, o.snoring), sim: ordinal(['none', 'sometimes', 'often']) },
  { key: 'media', label: '음악·영상 소리', weight: 4, uses: ['media_style', 'rm_media_style'],
    pref: (me, o) => strictFit(['earphone', 'speaker_low', 'speaker_free'], me.rm_media_style, o.media_style), neutral: 1 },
  { key: 'call', label: '통화', weight: 3, uses: ['call_style', 'rm_call_style'],
    pref: (me, o) => strictFit(['outside', 'short_quiet', 'free'], me.rm_call_style, o.call_style), sim: ordinal(['outside', 'short_quiet', 'free']) },
  { key: 'alarm', label: '기상 알람', weight: 2, uses: ['alarm_style', 'rm_alarm_style'],
    pref: (me, o) => strictFit(['silent', 'once', 'multi'], me.rm_alarm_style, o.alarm_style), sim: ordinal(['silent', 'once', 'multi']) },
  { key: 'noise_cross', label: '소음 궁합', weight: 2, uses: ['noise_sensitivity', 'snoring', 'media_style', 'call_style', 'alarm_style'],
    sim: crossBoth('noise_sensitivity', noiseEmission) },
  { key: 'light', label: '취침 조명', weight: 4, uses: ['light_pref', 'rm_light_pref'],
    pref: (me, o) => strictFit(['dark', 'dim_ok', 'bright_ok'], me.rm_light_pref, o.light_pref), neutral: 1 },
  { key: 'temp', label: '온도 민감도', weight: 4, uses: ['temp_sensitivity', 'rm_temp_sensitivity'],
    pref: (me, o) => me.rm_temp_sensitivity ? rangeFit(me.rm_temp_sensitivity.lo, me.rm_temp_sensitivity.hi, o.temp_sensitivity, 4) : null,
    sim: scale5('temp_sensitivity') },
  { key: 'smell_sens', label: '냄새 민감도', weight: 2, uses: ['smell_sensitivity', 'rm_smell_sensitivity'],
    pref: (me, o) => me.rm_smell_sensitivity ? rangeFit(me.rm_smell_sensitivity.lo, me.rm_smell_sensitivity.hi, o.smell_sensitivity, 4) : null,
    sim: scale5('smell_sensitivity') },
  { key: 'indoor', label: '실내 취식', weight: 2, uses: ['indoor_eating', 'rm_indoor_eating'],
    pref: (me, o) => strictFit(['none', 'snack', 'meal'], me.rm_indoor_eating, o.indoor_eating), sim: ordinal(['none', 'snack', 'meal']) },
  { key: 'smell_cross', label: '냄새 궁합', weight: 1, uses: ['smell_sensitivity', 'indoor_eating', 'trash_style'],
    sim: crossBoth('smell_sensitivity', smellEmission) },

  // ③ 청결·정리
  { key: 'clean', label: '청소 주기', weight: 9, uses: ['clean_style', 'clean_freq', 'rm_clean_style', 'rm_clean_freq'],
    pref: cleanPref, sim: cleanSim },
  { key: 'tidy', label: '정리 습관', weight: 6, uses: ['tidy_level', 'rm_tidy_level'],
    pref: (me, o) => strictFit(['neat', 'normal', 'relaxed'], me.rm_tidy_level, o.tidy_level), sim: ordinal(['neat', 'normal', 'relaxed']) },
  { key: 'ventilation', label: '환기', weight: 2, uses: ['ventilation', 'rm_ventilation'],
    pref: (me, o) => strictFit(['rarely', 'sometimes', 'often'], me.rm_ventilation, o.ventilation), sim: ordinal(['rarely', 'sometimes', 'often']) },
  { key: 'cold_vent', label: '환기·온도 궁합', weight: 2, uses: ['ventilation', 'temp_sensitivity'], sim: coldVentSim },
  { key: 'trash', label: '쓰레기 처리', weight: 4, uses: ['trash_style', 'trash_freq', 'rm_trash_style', 'rm_trash_freq'],
    pref: trashPref, sim: (a, b) => (a.trash_style && a.trash_style === b.trash_style) ? 1 : pairTable({ 'immediate|regular': .7, 'regular|full': .6, 'immediate|full': .3 })(a.trash_style, b.trash_style) },
  { key: 'bin', label: '쓰레기통 공유', weight: 2, uses: ['shared_bin', 'trash_rotation', 'rm_shared_bin', 'rm_trash_rotation'], sim: binSim },
  { key: 'rotation', label: '당번제', weight: 2, uses: ['rotation', 'rm_rotation'], sim: (a, b) => sameSet(a.rotation, b.rotation) },
  { key: 'hanger', label: '행거 공유', weight: 3, uses: ['hanger', 'hanger_buy', 'hanger_lend', 'rm_hanger', 'rm_hanger_buy', 'rm_hanger_lend'],
    sim: (a, b) => shareSim(a, b, 'hanger', .6) },
  { key: 'fridge', label: '냉장고 공유', weight: 3, uses: ['fridge', 'fridge_buy', 'fridge_lend', 'rm_fridge', 'rm_fridge_buy', 'rm_fridge_lend'],
    sim: (a, b) => shareSim(a, b, 'fridge', .5) },

  // ④ 사생활·관계·기타
  { key: 'relation', label: '선호하는 관계', weight: 6, uses: ['roommate_relation', 'rm_roommate_relation'],
    pref: (me, o) => me.rm_roommate_relation ? rangeFit(me.rm_roommate_relation.lo, me.rm_roommate_relation.hi, o.roommate_relation, 4) : null,
    sim: scale5('roommate_relation') },
  { key: 'drinking', label: '음주', weight: 3, uses: ['drinking', 'rm_drinking'],
    pref: (me, o) => strictFit(['none', 'rarely', 'weekly', 'often'], me.rm_drinking, o.drinking), sim: ordinal(['none', 'rarely', 'weekly', 'often']) },
  { key: 'age', label: '나이 차이', weight: 3, uses: ['birth_year', 'rm_birth_range'], pref: yearDiffPref('rm_birth_range', 'birth_year'), sim: ageSim },
  { key: 'student', label: '학번 차이', weight: 2, uses: ['student_id', 'rm_student_range'], pref: yearDiffPref('rm_student_range', 'student_id') },
  { key: 'hobby', label: '겹치는 취미', weight: me => me.rm_hobby === 'similar' ? 4 : 2, uses: ['hobby', 'rm_hobby'], sim: hobbyOverlap },
  { key: 'dept', label: '원하는 학과', weight: 1, uses: ['dept', 'rm_dept'], pref: deptPref },
];

// 점수에는 직접 쓰이지 않는 질문 (이유를 같이 적어 둠)
const MATCH_IGNORED = {
  gender: '하드 필터', dorm_period: '하드 필터', rm_fixed_gender: '고정 칸 (저장 안 함)', rm_fixed_dorm: '고정 칸 (저장 안 함)',
  college: '참고 정보', rm_college: '단과대 선택 (저장 안 함)',
  smoking: '흡연 충돌 규칙', rm_smoking: '흡연 충돌 규칙',
  student_id: '학번 차이 항목에서 사용', birth_year: '나이 차이 항목에서 사용',
  intro: '자기소개 글 (점수 규칙에는 안 씀, AI 분석에서만 참고)',
};
const MATCH_RULES = DIMENSIONS;   // 이전 이름과 호환

// ---------- 하드 규칙 ----------
// 원하는 룸메 흡연(rm_smoking, 복수 선택 가능): 상관없음이 없고 상대의 흡연 여부가 고른 항목에 없으면 충돌
// 답하지 않았으면(undefined) 조건 없음으로 봄
const wantsSmoking = (me, other) => {
  const want = [].concat(me.rm_smoking ?? []).filter(Boolean);
  return want.length > 0 && !want.includes('any') && !want.includes(other.smoking);
};
const smokingConflict = (a, b) => wantsSmoking(a, b) || wantsSmoking(b, a);

// 같은 성별 + 같은 거주 기간 (post 는 DB 행: gender, dorm_period 컬럼 사용)
const canMatch = (me, other) =>
  me.user_id !== other.user_id && me.gender === other.gender && me.dorm_period === other.dorm_period;

// ---------- 점수 계산 ----------
// 한 항목의 값: 두 방향(내가 본 상대, 상대가 본 나)을 합침
//  - 그 방향에 원하는 룸메 조건(pref)이 있으면 그 점수
//  - 상대 쪽에만 조건이 있으면, 이쪽은 가리는 게 없으니 중립(NEUTRAL)
//  - 둘 다 조건이 없으면 두 사람의 성향끼리 비슷한지(sim)
const NEUTRAL = 0.8;
const isVal = v => v !== null && v !== undefined && !Number.isNaN(v);
// 룸메 답에 '상관없음'(any)이 있으면 그 항목은 모든 경우를 허용하는 것으로 1점
const anyPick = (ans, d) => (d.uses || []).some(k => /^rm_/.test(k) && [].concat(ans[k] ?? []).some(v => v === 'any' || v === '상관없음'));
const dimValue = (d, a, b) => {
  const pa = anyPick(a, d) ? 1 : d.pref ? d.pref(a, b) : null;
  const pb = anyPick(b, d) ? 1 : d.pref ? d.pref(b, a) : null;
  const sym = d.sim ? d.sim(a, b) : null;
  const neu = d.neutral ?? NEUTRAL;
  const x = isVal(pa) ? pa : isVal(pb) ? neu : sym;
  const y = isVal(pb) ? pb : isVal(pa) ? neu : (d.sim ? d.sim(b, a) : null);
  if (!isVal(x)) return isVal(y) ? y : null;
  if (!isVal(y)) return x;
  return mutual(x, y);
};

// a, b: answers 객체. 반환: { score(0~100), conflict, good[], warn[], compared(비교한 항목 수) } 또는 null(비교할 항목 부족)
function matchScore(a, b) {
  let sum = 0, wsum = 0;
  const items = [];
  for (const d of DIMENSIONS) {
    const v = dimValue(d, a, b);
    if (v === null) continue;
    // 가중치가 한쪽 답에만 의존하면 순서에 따라 점수가 달라지므로 두 쪽 중 큰 값을 씀 (대칭 보장)
    const w = typeof d.weight === 'function' ? Math.max(d.weight(a), d.weight(b)) : d.weight;
    sum += w * v; wsum += w;
    items.push({ key: d.key, label: d.label, weight: w, sim: v });
  }
  if (wsum < MATCH_MIN_WEIGHT) return null;

  const conflict = smokingConflict(a, b);
  const raw = (sum / wsum) * (conflict ? MATCH_CONFLICT_FACTOR : 1);

  // 이유: 잘 맞는 점(0.9↑, 가중치 큰 순 3개) / 확인할 점(0.4↓, 손해 큰 순 2개) + 흡연 충돌
  const good = items.filter(i => i.sim >= 0.9).sort((x, y) => y.weight - x.weight).slice(0, 3).map(i => i.label);
  const warn = items.filter(i => i.sim <= 0.4).sort((x, y) => y.weight * (1 - y.sim) - x.weight * (1 - x.sim)).slice(0, 2).map(i => i.label);
  if (conflict) warn.unshift('흡연 조건 충돌');
  return { score: Math.round(raw * 100), conflict, good, warn, compared: items.length };
}

// ---------- 목록 만들기 ----------
// me: 내 글(DB 행) 또는 null / posts: 후보 글들(DB 행)
// 반환: 점수 내림차순(동점이면 최근 수정 먼저)  [{ post, match }]
function rankMatches(me, posts, currentVersion) {
  if (!me) return [];
  return posts
    .filter(p => canMatch(me, p) && (p.schema_version ?? 0) >= currentVersion)
    .map(p => ({ post: p, match: matchScore(me.answers || {}, p.answers || {}) }))
    .filter(x => x.match)   // 비교할 수 있는 항목이 너무 적은 글은 제외
    .sort((x, y) => y.match.score - x.match.score || String(y.post.updated_at).localeCompare(String(x.post.updated_at)));
}

// 설문(PROFILE_SCHEMA)에 새 질문이 생겼는데 매칭 규칙에 없으면 콘솔에 알려 줌 (질문 추가 시 깜빡 방지)
function checkMatchCoverage(schema) {
  const known = new Set([...DIMENSIONS.flatMap(d => d.uses), ...Object.keys(MATCH_IGNORED)]);
  const names = schema.flatMap(s => s.fields).flatMap(f => f.type === 'group' ? f.fields : [f])
    .flatMap(f => [f, ...(f.options || []).filter(o => o.sub).map(o => o.sub)]).map(f => f.name).filter(Boolean);
  const missing = [...new Set(names)].filter(n => !known.has(n));
  if (missing.length) console.warn('[matching] 매칭 규칙에 없는 질문:', missing.join(', '), '→ matching.js 의 DIMENSIONS 에 추가하세요.');
  return missing;
}

// ---------- 카드 지문: 매칭에 쓰이는 내용(성별·거주 기간·학과·답변)이 바뀌었는지 확인용 ----------
// 수정 시각·제목은 뺌 (내용이 같으면 시각이 바뀌어도 같은 지문). 서버와 화면이 같은 계산을 써야 해서 여기 한 곳에 둠
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// 키 순서와 상관없이 같은 문자열이 나오도록 정렬
function canonicalJson(v) {
  if (Array.isArray(v)) return v.map(canonicalJson);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => (o[k] = canonicalJson(v[k]), o), {});
  return v;
}
function cardFingerprint(post) {
  if (!post) return null;
  return cyrb53(JSON.stringify(canonicalJson({
    gender: post.gender ?? null, dorm_period: post.dorm_period ?? null, dept: post.dept ?? null, answers: post.answers ?? {},
  })));
}

if (typeof module !== 'undefined') module.exports = { cardFingerprint, cyrb53, MATCH_RULES, DIMENSIONS, MATCH_IGNORED, matchScore, rankMatches, canMatch, checkMatchCoverage, smokingConflict, MATCH_CONFLICT_FACTOR };

// 카드 보기에서 내 답과 비교: 항목마다 내 허용 범위 안인지, 상대 허용 범위 안인지, 항목 점수
function matchBreakdown(a, b) {
  const rangeOf = p => !isVal(p) ? '조건 없음' : p >= 0.999 ? '범위 안' : `범위 밖 (${Math.round(p * 100)}%)`;
  return DIMENSIONS.map(d => {
    const v = dimValue(d, a, b);
    if (!isVal(v)) return null;
    const key = d.uses[0];
    const pa = anyPick(a, d) ? 1 : d.pref ? d.pref(a, b) : null, pb = anyPick(b, d) ? 1 : d.pref ? d.pref(b, a) : null;
    return { label: d.label, key, mine: a[key], theirs: b[key], mineRange: rangeOf(pa), theirsRange: rangeOf(pb), score: Math.round(v * 100) };
  }).filter(Boolean);
}