// node tests/matching.test.js  — 매칭 알고리즘 검증 (의존성 없음)
const assert = require('assert');
const fs = require('fs'), vm = require('vm'), path = require('path');
const M = require('../khumate-client/matching.js');

// 설문 스키마 로드 (브라우저 전역 스크립트라 vm 으로 실행)
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../khumate-client/profile-schema.js'), 'utf8'), ctx);
const SCHEMA = vm.runInContext('PROFILE_SCHEMA', ctx);

// 기준 프로필: 평범한 사람
const base = {
  gender: '남성', dorm_period: '한 학기', dept: '컴퓨터공학과', student_id: '24', birth_year: '2005',
  wake_time: '08:00', sleep_time: '23:30', room_stay: 'medium', stay_days: ['월', '화', '수'], weekend_home: 'sometimes',
  shower_duration: '15', noise_sensitivity: 3, snoring: 'none', media_style: 'earphone', call_style: 'short_quiet',
  alarm_style: 'once', light_pref: 'dim_ok', temp_sensitivity: 3, smell_sensitivity: 3,
  clean_style: 'often', clean_freq: 1, tidy_level: 'normal', trash_style: 'regular', ventilation: 'sometimes', hanger: 'none', hanger_buy: 'yes',
  indoor_eating: 'snack', fridge: 'none', fridge_buy: 'yes', roommate_relation: 3, guest_overnight: 'no',
  smoking: 'none', smoking_mate: 'no', drinking: 'rarely', hobby: ['러닝', '독서'],
};
const mk = o => ({ ...base, ...o });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('같은 사람끼리는 거의 만점 (서로 조금씩 소음·냄새를 내므로 교차 항목에서 약간 감점)', () => {
  const s = M.matchScore(base, base).score; assert.ok(s >= 95 && s <= 100, s);
  // 소음·냄새를 전혀 안 내는 두 사람은 정확히 100점
  const quiet = mk({ snoring: 'none', media_style: 'earphone', call_style: 'outside', alarm_style: 'vibrate', indoor_eating: 'none', trash_style: 'immediate' });
  assert.strictEqual(M.matchScore(quiet, quiet).score, 100);
});

t('대칭: score(a,b) === score(b,a) (랜덤 300쌍)', () => {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = () => {
    const x = {};
    SCHEMA.flatMap(s => s.fields).flatMap(f => f.type === 'group' ? f.fields : [f]).forEach(f => {
      if (f.type === 'radio') x[f.name] = pick(f.options).value;
      else if (f.type === 'checkbox') x[f.name] = f.options.filter(() => Math.random() < .4).map(o => o.value);
      else if (f.type === 'range') x[f.name] = 1 + Math.floor(Math.random() * 5);
      else if (f.type === 'select') x[f.name] = pick(f.options).value;
      else if (f.type === 'time') x[f.name] = `${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 12) * 5).padStart(2, '0')}`;
    });
    x.birth_year = String(2000 + Math.floor(Math.random() * 6)); x.hobby = pick([['러닝'], ['게임', '독서'], [], ['영화감상', '러닝']]);
    return x;
  };
  for (let i = 0; i < 300; i++) {
    const a = rnd(), b = rnd(), ab = M.matchScore(a, b), ba = M.matchScore(b, a);
    assert.strictEqual(ab?.score, ba?.score, JSON.stringify([a, b]));
    assert.ok(ab.score >= 0 && ab.score <= 100);
  }
});

t('자정을 넘기는 취침시간: 23:30 vs 00:30 은 1시간 차이로 계산', () => {
  const r = M.MATCH_RULES.find(r => r.key === 'sleep_time');
  assert.ok(Math.abs(r.sim({ sleep_time: '23:30' }, { sleep_time: '00:30' }) - (1 - 60 / 180)) < 1e-9);
  assert.strictEqual(r.sim({ sleep_time: '22:00' }, { sleep_time: '01:00' }), 0);   // 3시간 차
  assert.strictEqual(r.sim({ sleep_time: '23:00' }, { sleep_time: '23:00' }), 1);
});

t('흡연 충돌은 점수를 0.4배 하고 경고를 단다', () => {
  const smoker = mk({ smoking: 'cigarette' });
  const strict = mk({ smoking: 'none', rm_smoking: ['none'] });                 // 비흡연만 허용
  const ok = mk({ smoking: 'none', rm_smoking: ['none', 'vape', 'cigarette'] }); // 전부 허용
  const bad = M.matchScore(smoker, strict), good = M.matchScore(smoker, ok);
  assert.ok(bad.conflict && !good.conflict);
  assert.ok(Math.abs(bad.score - good.score * 0.4) <= 1, `${bad.score} vs ${good.score}`);
  assert.strictEqual(bad.warn[0], '흡연 조건 충돌');
  // 흡연자끼리(둘 다 불가 아님)는 충돌 아님
  assert.ok(!M.matchScore(smoker, mk({ smoking: 'vape', rm_smoking: ['none', 'vape', 'cigarette'] })).conflict);
  // 비흡연자 + "흡연 불가" 끼리는 충돌 아님
  assert.ok(!M.matchScore(strict, strict).conflict);
});

t('소음 교차 항목: 예민한 사람 + 소음 많은 상대 < 둔감한 사람 + 같은 상대', () => {
  const loud = mk({ snoring: 'often', media_style: 'speaker_free', call_style: 'free', alarm_style: 'multi', noise_sensitivity: 3 });
  const sensitive = mk({ noise_sensitivity: 5 }), tough = mk({ noise_sensitivity: 1 });
  const r = M.DIMENSIONS.find(d => d.key === 'noise_cross');
  assert.ok(r.sim(sensitive, loud) < 0.3, String(r.sim(sensitive, loud)));
  assert.ok(r.sim(tough, loud) > r.sim(sensitive, loud) + 0.3);
  // 둘 다 조용하면 민감도와 상관없이 만점
  const silent = { noise_sensitivity: 5, snoring: 'none', media_style: 'earphone', call_style: 'outside', alarm_style: 'vibrate' };
  assert.strictEqual(r.sim(mk(silent), mk(silent)), 1);
});

t('정반대 사람은 낮고, 비슷한 사람은 높다 (순위 확인)', () => {
  const twin = mk({ wake_time: '08:30', birth_year: '2005' });
  const opposite = mk({
    wake_time: '05:30', sleep_time: '03:00', room_stay: 'low', stay_days: ['토', '일'], weekend_home: 'often',
    noise_sensitivity: 5, snoring: 'often', media_style: 'speaker_free', call_style: 'free', alarm_style: 'multi',
    light_pref: 'bright_ok', temp_sensitivity: 1, smell_sensitivity: 5, clean_style: 'as_needed', tidy_level: 'relaxed',
    trash_style: 'rotation', ventilation: 'rarely', indoor_eating: 'meal', roommate_relation: 5,
    guest_overnight: 'free', drinking: 'often', birth_year: '2001', hobby: ['게임'],
  });
  const hi = M.matchScore(base, twin).score, lo = M.matchScore(base, opposite).score;
  console.log(`     비슷한 사람 ${hi}점 / 정반대 ${lo}점`);
  assert.ok(hi >= 90 && lo <= 50 && hi - lo >= 45);
});

t('진짜 양 극단(모든 항목 첫 선택지 vs 마지막 선택지)은 매우 낮다', () => {
  const ext = (end) => {
    const x = { birth_year: end ? '2001' : '2006', hobby: end ? ['게임'] : ['독서'], sleep_time: end ? '04:00' : '22:00', wake_time: end ? '12:00' : '06:00', shower_duration: end ? '40' : '5',
      stay_days: end ? ['토', '일'] : ['월', '화'], smoking: end ? 'cigarette' : 'none', smoking_mate: 'any' };
    SCHEMA.flatMap(s => s.fields).flatMap(f => f.type === 'group' ? f.fields : [f]).forEach(f => {
      if (f.type === 'radio' && !(f.name in x)) x[f.name] = f.options[end ? f.options.length - 1 : 0].value;
      if (f.type === 'range') x[f.name] = end ? 5 : 1;
    });
    return x;
  };
  const sc = M.matchScore(ext(0), ext(1)).score;
  console.log(`     양 극단 ${sc}점`);
  assert.ok(sc <= 25, sc);
});

t('하드 필터: 성별/거주 기간이 다르거나 본인이면 후보가 아님', () => {
  const me = { user_id: 'me', gender: '남성', dorm_period: '한 학기', answers: base, schema_version: 1 };
  const row = (id, g, d, v = 1) => ({ user_id: id, gender: g, dorm_period: d, answers: base, schema_version: v, updated_at: '2026-10-18' });
  const ranked = M.rankMatches(me, [row('a', '남성', '한 학기'), row('b', '여성', '한 학기'), row('c', '남성', '반년'), row('me', '남성', '한 학기'), row('d', '남성', '한 학기', 0)], 1);
  assert.deepStrictEqual(ranked.map(r => r.post.user_id), ['a']);
});

t('정렬: 점수 내림차순, 동점이면 최근 수정 먼저', () => {
  const me = { user_id: 'me', gender: '여성', dorm_period: '반년', answers: base, schema_version: 1 };
  const row = (id, a, up) => ({ user_id: id, gender: '여성', dorm_period: '반년', answers: a, schema_version: 1, updated_at: up });
  const r = M.rankMatches(me, [
    row('low', mk({ tidy_level: 'relaxed', clean_style: 'as_needed', sleep_time: '03:00' }), '2026-10-18T10:00'),
    row('old', base, '2026-10-01T00:00'), row('new', base, '2026-10-17T00:00'),
  ], 1);
  assert.deepStrictEqual(r.map(x => x.post.user_id), ['new', 'old', 'low']);
});

t('일부 항목만 답한 글(예: 선택 항목 취미 없음)도 점수 계산, 너무 적으면 null', () => {
  assert.ok(M.matchScore(base, mk({ hobby: [] })).score >= 95);
  assert.strictEqual(M.matchScore(base, { wake_time: '08:00' }), null);
});

// 점수는 가중 평균이라 가중치 합계 자체는 중요하지 않음. 모든 가중치가 양의 숫자 또는 (me) => 숫자 인지만 확인
t('가중치는 모두 양수 (숫자 또는 함수)', () => M.MATCH_RULES.forEach(r => assert.ok(typeof r.weight === 'function' || (typeof r.weight === 'number' && r.weight > 0), r.key)));

t('생활 리듬: 취침·기상이 같으면 엇갈림 0, 한쪽이 많이 엇갈리면 점수가 낮다', () => {
  const me = mk({ sleep_time: '23:00', wake_time: '07:00' });
  const same = M.matchScore(me, mk({ sleep_time: '23:00', wake_time: '07:00' })).score;
  const shifted = M.matchScore(me, mk({ sleep_time: '02:00', wake_time: '10:00' })).score;
  assert.ok(same > shifted + 3, `${same} ${shifted}`);
});

t('환기·온도: 추위를 많이 타는 사람은 자주 환기하는 룸메와 점수가 낮고, 더위 쪽은 영향이 없다', () => {
  const cold = M.matchScore(mk({ temp_sensitivity: 1 }), mk({ ventilation: 'often' })).score;     // 1 = 추위 많이 탐
  const coldOk = M.matchScore(mk({ temp_sensitivity: 1 }), mk({ ventilation: 'rarely' })).score;
  const hot = M.matchScore(mk({ temp_sensitivity: 5 }), mk({ ventilation: 'often' })).score;     // 5 = 더위 많이 탐
  assert.ok(coldOk > cold, `${coldOk} ${cold}`);
  assert.ok(hot >= cold, `${hot} ${cold}`);
});

t('비대칭: 한쪽만 원하는 룸메 조건을 못 맞추면 중립일 때보다 크게 깎인다', () => {
  const picky = M.matchScore(mk({ rm_clean_style: 'daily' }), mk({ clean_style: 'as_needed' })).score;
  const neutral = M.matchScore(mk({}), mk({ clean_style: 'as_needed' })).score;
  assert.ok(picky < neutral - 3, `${picky} ${neutral}`);
});

t('취미 가중치는 순서와 무관하게 같다 (한쪽만 비슷한 취미를 원해도 대칭)', () => {
  const a = mk({ rm_hobby: 'similar', hobby: ['러닝'] }), b = mk({ hobby: ['러닝'] });
  assert.strictEqual(M.matchScore(a, b).score, M.matchScore(b, a).score);
});

t('스키마의 모든 질문이 규칙 또는 제외 목록에 있다', () => assert.strictEqual(M.checkMatchCoverage(SCHEMA).length, 0));

console.log(`\n${n} tests passed`);
