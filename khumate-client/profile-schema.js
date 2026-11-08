// ================= 내 정보 수정 모달 - 항목 정의 =================
// 항목을 추가/수정/삭제할 때는 이 파일만 고치면 됩니다. (화면 렌더링은 profile-form.js)
//
// ■ 단일 항목: { name, label, type, default?, hint?, half? }
//   radio    : options[{value,label,desc?}], cols?   (desc 있으면 세로 목록)
//   checkbox : options[{value,label}], cols?, default: []   → 배열로 저장
//   range    : min, max, ends[왼쪽, 가운데, 오른쪽]            → 숫자로 저장
//   select   : options[{value,label}]                          → 드롭다운 (단과대 서식)
//   combo    : options[{value,label}]                          → 검색 + 직접 입력 가능한 드롭다운
//   time     : 시 : 분 한 박스 드롭다운, 'HH:MM' 문자열로 저장
//   number   : suffix?(오른쪽 단위), placeholder?
//   text     : placeholder?, maxLength?
//   placeholder : 추후 구현 자리(저장 안 함)
//   half: true → 절반 너비
//
// ■ 기본값(default)은 쓰지 않습니다. 매칭에서 "답한 것"과 "기본값 그대로"를 구분할 수 없기 때문입니다.
//   모든 항목은 필수이고, 비워도 되는 항목만 optional: true 를 붙입니다. (checkbox 는 1개 이상 선택)
//
// ■ 묶음 항목 (큰 라벨 아래 소라벨로 나뉨):
//   { type:'group', label, fields:[{ sublabel, name, type, ... }, ...], grid? }
//   grid: 칸 비율 (예: 'grid-cols-[1.5fr_1fr]'), 생략하면 동일 비율
//

// 질문지 버전: 질문을 추가/삭제/변경하면 올리세요. 매칭은 현재 버전으로 답한 글끼리만 비교합니다.
// (DB의 roommate_posts.schema_version 에 저장됨)
const SCHEMA_VERSION = 14;   // v14: 온도 민감도 눈금 왼쪽을 '추위'로 바꿈 (값 1=추위 많이 탐, 5=더위 많이 탐). 예전 글은 다시 게시해야 매칭에 참여. v13: 청소·쓰레기 주기 슬라이더(선택지 밑), 쓰레기통 공유·당번제 O/X, 분리수거·친구 초대·공용 물품 삭제, 냉장고·행거 공구/공유 의사, 기타→사생활 통합. v12: 청소 방식(빈도 조건부)·당번제/쓰레기통 공유, 쓰레기 빈도·분리수거 조건부, 룸메 요일·샤워 선택지 정리. v11: 민감도·대인관계 룸메 슬라이더를 가운데에서 시작하는 범위 슬라이더로. v10: 민감도 룸메 범위를 절대 1~5 범위 슬라이더(나의 성향과 같은 눈금)로. v9: 기상 알람 3가지(없음·무음/한 번에/여러 번)·룸메 허용 범위, 민감도 3종 룸메 범위 슬라이더. v8: 허용 범위 질문은 가장 넓은 단계를 글로 씀 (상관없음 없음). v7: 허용 범위 질문 11개 단일 선택. v6: 조명 허용 범위. v5: 흡연 본인 하나, 외부인 숙박 삭제, 냄새 민감도 위치, 룸메 복수 선택·시간 범위

const o = (value, label, desc) => ({ value, label, desc });
const list = arr => arr.map(v => o(v, v));
// 하위 질문: 부모 질문(parentName)에서 value 를 골랐을 때 그 선택지 바로 밑에 열림 (group 안에서 사용)
const under = (parentName, value, f) => ({ ...f, under: true, when: { name: parentName, value } });
// 주기 슬라이더 눈금 (값은 0부터의 단계 번호: 0 격주 · 1 주 1회 · 2 주 2-3회 · 3 격일)
const FREQ_TICKS = ['격주', '주 1회', '주 2-3회', '격일'];

// 취미 추천 목록 (카테고리별. 드롭다운에서 카테고리를 펼쳐서 고름. 목록에 없는 취미는 직접 입력해서 추가 가능)
const HOBBY_GROUPS = [
  { name: '운동·스포츠', items: ['러닝', '헬스', '필라테스', '요가', '수영', '클라이밍', '자전거', '등산', '산책', '배드민턴', '테니스', '탁구', '볼링', '축구', '농구', '야구', '골프', '스케이트', '복싱', '댄스'] },
  { name: '문화·예술', items: ['영화', '드라마', '웹툰', '애니메이션', '전시회', '공연', '뮤지컬', '콘서트', '음악 감상', '악기 연주', '노래', '그림', '사진', '글쓰기', '캘리그라피', '공예'] },
  { name: '게임·IT', items: ['PC 게임', '모바일 게임', '콘솔 게임', '보드게임', '코딩', '영상 편집', '3D 모델링', '유튜브', 'e스포츠 관람'] },
  { name: '음식·카페', items: ['요리', '베이킹', '맛집 탐방', '카페 투어', '디저트', '커피', '차 마시기', '와인', '술 한잔'] },
  { name: '여행·아웃도어', items: ['국내 여행', '해외 여행', '캠핑', '드라이브', '낚시', '피크닉', '당일치기'] },
  { name: '일상·취향', items: ['독서', '쇼핑', '패션', '뷰티', '인테리어', '식물 가꾸기', '반려동물', '청소·정리', '수면', '명상', '봉사활동', '덕질'] },
  { name: '공부·자기계발', items: ['공부', '외국어', '자격증', '재테크', '스터디', '독서 모임', '일기 쓰기'] },
  { name: '사람·모임', items: ['친구 만나기', '동아리', '모임 활동', '혼자만의 시간', '수다', '홈파티'] },
];
const HOBBY_OPTIONS = HOBBY_GROUPS.flatMap(g => g.items.map(v => ({ value: v, label: v, group: g.name })));

// 단과대·학과 목록 (나의 성향 드롭다운 / 원하는 룸메 중복 선택에서 같이 씀)
// 단과대 → 소속 학과 (단과대를 고르면 그 단과대 학과만 학과 목록에 보임)
const DEPT_MAP = {
  '공과대학': ['기계공학부', '산업경영공학과', '원자력공학과', '화학공학과', '신소재공학과', '사회기반시스템공학과', '건축공학과', '환경학 및 환경공학과', '건축학과'],
  '전자정보대학': ['전자공학과', '반도체공학과', '생체의공학과'],
  '소프트웨어융합대학': ['컴퓨터공학과', '인공지능학과', '소프트웨어융합학과'],
  '응용과학대학': ['응용수학과', '응용물리학과', '응용화학과', '우주과학과'],
  '생명과학대학': ['유전생명공학과', '식품생명공학과', '융합바이오·신소재공학과', '스마트팜과학과'],
  '국제대학': ['국제학과', '아시아학과'],
  '외국어대학': ['프랑스어학과', '스페인어학과', '러시아어학과', '중국어학과', '일본어학과', '한국어학과', '글로벌커뮤니케이션학부'],
  '예술·디자인대학': ['도예학과', '산업디자인학과', '시각디자인학과', '환경조경디자인학과', '디지털콘텐츠학과', '의류디자인학과', '연극영화학과', 'PostModern음악학과'],
  '체육대학': ['체육학과', '스포츠지도학과', '스포츠의학과', '골프산업학과', '태권도학과'],
  '자유전공학부': ['자유전공학부'],
};
const COLLEGES = Object.keys(DEPT_MAP);
// 학과 선택지: group = 소속 단과대 (드롭다운 필터에 씀)
const DEPT_OPTIONS = Object.entries(DEPT_MAP).flatMap(([c, ds]) => ds.map(d => ({ value: d, label: d, group: c })));
// 학번·나이 범위 눈금: 가운데(0)가 내 값
// 학번: 왼쪽이 +3 (숫자가 큰 쪽) → '+3학번 이하', 오른쪽 끝 '-3학번 이상' (거울 배치 flip)
const SPAN_TICKS_ID = ['-3학번 이상', '-2학번', '-1학번', '내 값', '+1학번', '+2학번', '+3학번 이하'];
// 나이: 내 값이 없을 땐 '살'(나이 차이)이라 왼쪽이 -3살 이하, 오른쪽이 +3살 이상 (거울 배치 flip).
// 내 값이 있으면 년생 숫자로 바뀌며 왼쪽이 가장 큰 년생(어림)·'이하'
const SPAN_TICKS_AGE = ['+3살 이상', '+2살', '+1살', '내 값', '-1살', '-2살', '-3살 이하'];   // 배열 순서 = 값 -3 → +3

const PROFILE_SCHEMA = [
  {
    id: 'basic',
    title: '기본 정보',
    fields: [
      { name: 'gender', label: '성별', type: 'radio', cols: 2, options: list(['남성', '여성']) },
      { name: 'dorm_period', label: '기숙사 거주 기간', type: 'radio', cols: 3, options: list(['한 학기', '반년', '연간(1년)']) },
      { name: 'college', label: '단과대학', type: 'combo', half: true, optional: true, placeholder: '단과대 검색', 
        options: list(COLLEGES) },
      { name: 'dept', label: '학과', type: 'combo', half: true, placeholder: '학과 검색', 
        dependsOn: 'college', options: DEPT_OPTIONS },
      { name: 'student_id', label: '학번 (숫자 2자리)', type: 'number', half: true, digits: 2, placeholder: '예: 24', suffix: '학번' },
      { name: 'birth_year', label: '나이 (출생년도 4자리)', type: 'number', half: true, digits: 4, placeholder: '예: 2005', suffix: '년' },
    ],
  },
  {
    id: 'lifestyle',
    title: '생활 패턴',
    fields: [
      {
        type: 'group', label: '수면 시간',
        fields: [
          { name: 'wake_time',  sublabel: '기상', type: 'time', span: [5, 12] },
          { name: 'sleep_time', sublabel: '취침', type: 'time', span: [21, 4] },
        ],
      },
      {
        name: 'room_stay', label: '방에 머무는 정도 (재실율)', type: 'radio', 
        options: [
          o('high', '방콕형', '수업 시간 외 대부분 방에 있음'),
          o('medium', '반반형', '적당히 외출하고 적당히 들어옴'),
          o('low', '외출형', '도서관/약속 등으로 주로 밖에 있음'),
        ],
      },
      {
        name: 'stay_days', label: '주로 상주하는 요일 (중복 선택)', type: 'checkbox', cols: 7, default: [],
        options: list(['월', '화', '수', '목', '금', '토', '일']),
        hint: '기숙사 방에 주로 머무르는 요일을 모두 골라 주세요.',
      },
      {
        type: 'group', label: '샤워', grid: 'grid-cols-[1.5fr_1fr]',
        fields: [
          { name: 'shower_time', sublabel: '시간대 (중복 선택)', type: 'checkbox', cols: 3, default: [],
            options: [o('morning', '아침'), o('evening', '저녁')] },
          { name: 'shower_duration', sublabel: '소요 시간', type: 'select', placeholder: '선택',
            options: [o('5', '5분 이내'), o('10', '10분'), o('15', '15분'), o('20', '20분'), o('30', '30분'), o('40', '40분 이상')] },
        ],
      },
    ],
  },
  {
    id: 'noise_env',
    title: '소음 및 환경',
    fields: [
      {
        name: 'noise_sensitivity', label: '소음 민감도', type: 'range', min: 1, max: 5, 
        ends: ['둔감', '보통', '예민'],
        steps: ['많이 둔감', '둔감', '보통', '예민', '많이 예민'],
        hint: "잠귀가 밝거나 작은 소리에도 집중이 깨지면 '예민' 쪽으로 옮겨 주세요.",
      },
      {
        name: 'snoring', label: '코골이·이갈이', type: 'radio', cols: 3,
        options: [o('none', '없음'), o('sometimes', '가끔'), o('often', '자주')],
      },
      {
        name: 'alarm_style', label: '기상 알람', type: 'radio', cols: 3,
        options: [o('silent', '없음·무음'), o('once', '한 번에 기상'), o('multi', '여러 번 맞춤')],
      },
      {
        name: 'media_style', label: '음악·영상 시청 방식', type: 'radio', 
        options: [
          o('earphone', '이어폰·헤드폰', '항상 개인 기기로만 들어요'),
          o('speaker_low', '작은 스피커', '낮에는 작게 틀 수 있어요'),
          o('speaker_free', '스피커 자유', '룸메이트가 괜찮다면 편하게 틀어요'),
        ],
      },
      {
        name: 'call_style', label: '통화', type: 'radio', 
        options: [
          o('outside', '밖에서 통화', '복도·라운지에서 받아요'),
          o('short_quiet', '짧게·조용히', '방에서 하되 짧고 작게 해요'),
          o('free', '방에서 자유롭게', '통화·화상 통화가 잦아요'),
        ],
      },
      {
        name: 'light_pref', label: '조명 (취침 시간대)', type: 'radio', 
        options: [
          o('dark', '완전 소등', '불빛이 조금이라도 있으면 잠들기 어려워요'),
          o('dim_ok', '은은한 조명', '스탠드나 책상등 정도를 켜요'),
          o('bright_ok', '완전 점등', '불을 켜고 자는 편이에요'),
        ],
      },
      {
        name: 'temp_sensitivity', label: '온도 민감도', type: 'range', min: 1, max: 5, 
        ends: ['추위 많이 탐', '보통', '더위 많이 탐'],
        steps: ['추위 많이 탐', '추위 탐', '보통', '더위 탐', '더위 많이 탐'],
        hint: '냉난방 세기와 환기, 이불 두께 같은 취향을 맞출 때 참고돼요.',
      },
    ],
  },
  {
    id: 'cleanliness',
    title: '청결 및 정리',
    fields: [
      // 큰 카테고리 '공용 공간 청소' 아래 소주제 (샤워와 같은 서식). 주기는 선택지 바로 밑에 열림
      {
        type: 'group', label: '공용 공간 청소', grid: 'grid-cols-1',
        fields: [
          { name: 'clean_style', sublabel: '청소 방식', type: 'radio', list: true,
            options: [o('as_needed', '필요할 때 청소', '더러워 졌을 때만 해요'), o('often', '주기적으로 청소', '주기적으로 청소해요'), o('daily', '바로바로 청소', '항상 깔끔하게 유지해요')] },
          under('clean_style', 'often', { name: 'clean_freq', sublabel: '청소 주기', type: 'range', ticks: FREQ_TICKS }),
          { name: 'rotation', sublabel: '당번제', type: 'checkbox', cols: 2, default: [],
            options: [o('ordered', 'O', '순서대로'), o('free', 'X', '각자 알아서')] },
        ],
      },
      {
        name: 'tidy_level', label: '개인 공간 정리', type: 'radio', 
        options: [
          o('relaxed', '편하게', '물건이 나와 있어도 크게 신경 쓰지 않아요'),
          o('normal', '적당히', '어느 정도 어질러져도 주기적으로 치워요'),
          o('neat', '항상 정돈', '책상·침대 주변을 늘 깔끔하게 유지해요'),
        ],
      },
      // 큰 카테고리 '쓰레기 처리' 아래 소주제
      {
        type: 'group', label: '쓰레기 처리', grid: 'grid-cols-1',
        fields: [
          { name: 'trash_style', sublabel: '처리 방식', type: 'radio', list: true,
            options: [o('full', '다 찼을 때 비움', '쓰레기가 다 찼을 때만 비워요'), o('regular', '모아서 주기적으로', '일정 주기로 모아서 비워요'), o('immediate', '바로바로 비움', '날마다 바로 비워요')] },
          under('trash_style', 'regular', { name: 'trash_freq', sublabel: '비우는 주기', type: 'range', ticks: FREQ_TICKS }),
          { name: 'shared_bin', sublabel: '쓰레기통 공유', type: 'checkbox', cols: 2, default: [],
            options: [o('yes', 'O', '공유함'), o('no', 'X', '공유 안 함')] },
          { name: 'trash_rotation', sublabel: '쓰레기 당번제', type: 'checkbox', cols: 2, default: [], when: { name: 'shared_bin', value: 'yes' },
            options: [o('ordered', 'O', '순서대로'), o('free', 'X', '각자 알아서')] },
        ],
      },
      {
        name: 'smell_sensitivity', label: '냄새 민감도', type: 'range', min: 1, max: 5,
        ends: ['둔감', '보통', '예민'],
        steps: ['많이 둔감', '둔감', '보통', '예민', '많이 예민'],
      },
      {
        name: 'ventilation', label: '환기', type: 'radio', 
        options: [
          o('rarely', '거의 안 함', '창문을 잘 열지 않는 편이에요'),
          o('sometimes', '가끔 환기', '하루 한두 번 정도 열어요'),
          o('often', '자주 환기', '하루에 여러 번 창문을 열어요'),
        ],
      },
      {
        type: 'group', label: '행거 여부', grid: 'grid-cols-1',
        fields: [
          { name: 'hanger', type: 'radio', options: [o('none', '없음'), o('own', '있음')] },
          under('hanger', 'none', { name: 'hanger_buy', sublabel: '공구 의사', type: 'radio', cols: 2, options: [o('yes', 'O', '있음'), o('no', 'X', '없음')] }),
          under('hanger', 'own', { name: 'hanger_lend', sublabel: '공유 의사', type: 'radio', cols: 2, options: [o('yes', 'O', '가능'), o('no', 'X', '불가')] }),
        ],
      },
    ],
  },
  {
    id: 'eating',
    title: '취식',
    fields: [
      {
        name: 'indoor_eating', label: '실내 취식', type: 'radio', 
        options: [
          o('none', '안 먹음', '방 안에서는 먹지 않아요'),
          o('snack', '간식·음료만', '냄새가 약한 간단한 음식만 먹어요'),
          o('meal', '식사·배달음식', '냄새가 나는 음식도 방에서 먹어요'),
        ],
      },
      {
        type: 'group', label: '냉장고', grid: 'grid-cols-1',
        fields: [
          { name: 'fridge', type: 'radio', options: [o('none', '없음'), o('own', '있음')] },
          under('fridge', 'none', { name: 'fridge_buy', sublabel: '공구 의사', type: 'radio', cols: 2, options: [o('yes', 'O', '있음'), o('no', 'X', '없음')] }),
          under('fridge', 'own', { name: 'fridge_lend', sublabel: '공유 의사', type: 'radio', cols: 2, options: [o('yes', 'O', '가능'), o('no', 'X', '불가')] }),
        ],
      },
    ],
  },
  {
    id: 'social',
    title: '사생활 및 대인관계',
    fields: [
      {
        name: 'roommate_relation', label: '룸메이트와의 선호 관계', type: 'range', min: 1, max: 5, 
        ends: ['각자 생활', '적당히', '친구처럼'],
        steps: ['각자 생활', '가벼운 인사', '적당히', '자주 어울림', '친구처럼'],
      },
      {
        name: 'smoking', label: '흡연 여부', type: 'radio', cols: 3,
        options: [o('none', '비흡연'), o('vape', '전자담배'), o('cigarette', '일반 담배')],
      },
      {
        name: 'drinking', label: '음주 빈도', type: 'radio', cols: 2,
        options: [o('none', '안 마심'), o('rarely', '월 1~2회'), o('weekly', '주 1~2회'), o('often', '주 3회 이상')],
      },
      {
        name: 'hobby', label: '취미', type: 'tags', optional: true, maxLength: 10, max: 10,
        placeholder: '검색하거나 직접 입력 후 Enter (최대 10개)', hint: '목록에 없으면 직접 입력해서 추가할 수 있어요. 태그는 하나당 10자 이하.',
        options: HOBBY_OPTIONS, cats: HOBBY_GROUPS.map(g => g.name), grouped: true, boxed: true, clearable: true,
      },
    ],
  },
];

// '원하는 룸메' 탭
// 1) 기본 정보: 성별·거주 기간은 나와 같게 고정, 단과대·학과는 여러 개 고를 수 있고, 학번·나이는 나와의 차이 범위
// 2) 나머지: 나의 성향 질문을 복제(저장 이름 앞에 rm_). 선택지에는 '상관없음'을 넣고, 일부 질문은 형식을 바꿈
const RM_BASIC = {
  id: 'rm_basic', title: '기본 정보', scope: 'roommate',
  fields: [
    { name: 'rm_fixed_gender', label: '성별', type: 'fixed', source: 'gender', cols: 2, options: list(['남성', '여성']) },
    { name: 'rm_fixed_dorm', label: '기숙사 거주 기간', type: 'fixed', source: 'dorm_period', cols: 3, options: list(['한 학기', '반년', '연간(1년)']) },
    // 단과대는 드롭다운으로만 고르고 저장·태그 표시는 하지 않음 (transient). 고른 단과대의 학과를 학과 칸에서 한꺼번에 넣을 수 있음
    { type: 'group', label: '단과대·학과 (중복 선택)', grid: 'grid-cols-2', boxed: true,
      hint: '단과대를 고르면 그 소속 학과를 한꺼번에 넣을 수 있어요. 단과대 선택은 저장되지 않아요.',
      fields: [
        { name: 'rm_college', sublabel: '단과대', type: 'combo', optional: true, transient: true, placeholder: '단과대 선택', options: list(COLLEGES) },
        { name: 'rm_dept', sublabel: '학과', type: 'tags', plain: true, custom: false, max: 999, maxLength: 20, chipsOutside: true, grouped: true, anyDefault: true, optional: true,
          placeholder: '학과를 검색하거나 골라 주세요', default: [], options: DEPT_OPTIONS },
      ] },
    { name: 'rm_student_range', label: '학번 범위 (나와의 차이)', type: 'span', ticks: SPAN_TICKS_ID, flip: true, source: 'student_id', srcDigits: 2 },
    { name: 'rm_birth_range', label: '나이 범위 (나와의 차이)', type: 'span', ticks: SPAN_TICKS_AGE, flip: true, source: 'birth_year', srcDigits: 4, short: true },
  ],
};

// 나의 성향 질문을 룸메 질문으로 바꾸는 규칙
const RM_OVERRIDE = {
  wake_time:  { type: 'hourrange', span: [5, 12] },   // 기상 시간 범위: 05시~12시 안에서 고름
  sleep_time: { type: 'hourrange', span: [21, 4] },   // 취침 시간 범위: 21시~04시 안에서 고름 (자정 넘김)
  stay_days:  { cols: 2, label: '주로 상주하는 요일', options: [o('weekday', '평일만'), o('weekend', '주말까지')] },   // 중복 선택
  shower_time: { noAny: true, options: [o('morning', '아침'), o('evening', '저녁')] },   // 불규칙·상관없음 삭제
  smoking:    { label: '흡연 여부' },
  hobby:      { type: 'radio', optional: false, cols: 2, options: [o('any', '상관없음'), o('similar', '비슷한 취미')] },
  // 허용 범위 질문: 룸메가 이 행동을 어디까지 괜찮게 여기는지 한 단계만 고름 (단일 선택, 상관없음 = 가장 넓은 범위)
  light_pref: { type: 'radio', noAny: true, list: true, label: '조명 허용 범위 (취침 시간대)', options: [
    o('dark', '완전 소등만 괜찮아요', '룸메이트의 불빛도 없어야 해요'),
    o('dim_ok', '은은한 조명까지 괜찮아요', '스탠드·책상등 정도는 괜찮아요'),
    o('bright_ok', '밝아도 괜찮아요', '불이 켜져 있어도 잘 자요'),
  ] },
};
// 허용 범위 질문들 (원하는 룸메): 룸메가 이 행동을 어디까지 괜찮게 여기는지 한 단계 고르기 (단일 선택)
// 가장 넓은 단계까지 글로 씀 (상관없음으로 뭉뚱그리지 않음). 값은 나의 성향과 같게 유지해서 나중에 매칭에 연결
const TOLERANCE = {
  room_stay:     { label: '방에 머무는 정도 허용 범위', opts: [['low', '외출형만 괜찮아요', '주로 밖에 있는 룸메이트'], ['medium', '반반형까지 괜찮아요', '적당히 외출하고 들어오는 룸메이트'], ['high', '방콕형도 괜찮아요', '수업 외 대부분 방에 있어도 괜찮아요']] },
  media_style:   { label: '음악·영상 소리 허용 범위', opts: [['earphone', '이어폰·헤드폰만 괜찮아요', '스피커 소리는 힘들어요'], ['speaker_low', '작은 스피커까지 괜찮아요', '낮에 작게 트는 정도'], ['speaker_free', '스피커를 자유롭게 틀어도 괜찮아요']] },
  call_style:    { label: '통화 허용 범위', opts: [['outside', '밖에서 하는 통화만 괜찮아요', '방 안 통화는 힘들어요'], ['short_quiet', '짧고 조용한 통화까지 괜찮아요', '방에서 짧게 하는 정도'], ['free', '방에서 자유롭게 통화해도 괜찮아요']] },
  snoring:       { label: '코골이·이갈이 허용 범위 [추가]', opts: [['none', '없어야 해요'], ['sometimes', '가끔은 괜찮아요'], ['often', '자주 있어도 괜찮아요']] },
  clean_style:   { label: '공용 공간 청소 허용 방식', opts: [['as_needed', '필요할 때만 해도 괜찮아요'], ['often', '주기적으로 청소해주세요'], ['daily', '바로바로 청소해주세요']] },
  trash_style:   { label: '쓰레기 처리 허용 방식', opts: [['full', '다 찼을 때 비워도 괜찮아요'], ['regular', '모아서 주기적으로 비워도 괜찮아요'], ['immediate', '바로바로 비워주세요']] },
  tidy_level:    { label: '개인 공간 정리 허용 범위', opts: [['relaxed', '물건이 나와 있어도 괜찮아요'], ['normal', '어느 정도 어질러져도 괜찮아요'], ['neat', '항상 정돈된 편만 괜찮아요']] },
  ventilation:   { label: '환기 허용 범위', opts: [['rarely', '거의 안 하면 좋겠어요'], ['sometimes', '가끔 환기까지 괜찮아요'], ['often', '자주 환기해도 괜찮아요']] },
  drinking:      { label: '음주 빈도 허용 범위', opts: [['none', '안 마시는 편만 괜찮아요'], ['rarely', '월 1~2회까지 괜찮아요'], ['weekly', '주 1~2회까지 괜찮아요'], ['often', '주 3회 이상 마셔도 괜찮아요']] },
  indoor_eating: { label: '실내 취식 허용 범위', opts: [['none', '방에서 안 먹는 편만 괜찮아요'], ['snack', '간식·음료까지 괜찮아요'], ['meal', '식사·배달음식도 괜찮아요']] },
  alarm_style:   { label: '기상 알람 허용 범위 [추가]', opts: [['silent', '알람 없이 무음만 괜찮아요'], ['once', '한 번에 끝나는 알람까지 괜찮아요'], ['multi', '여러 번 울리는 알람도 괜찮아요']] },
};
for (const [name, t] of Object.entries(TOLERANCE)) {
  RM_OVERRIDE[name] = { type: 'radio', noAny: true, list: true, label: t.label, options: t.opts.map(([v, l, d]) => o(v, l, d)) };
}
// 민감도 슬라이더: 나의 민감도 값(1~5)을 가운데로 두고 양 끝을 -3~+3 범위로 지정 (학번·나이 범위와 같은 서식)
// 민감도 범위 슬라이더: 나의 성향과 같은 1~5 눈금·끝 글자, 룸메가 괜찮은 민감도 범위를 양 끝으로 지정
const SENS_ENDS = { noise_sensitivity: ['둔감', '보통', '예민'], temp_sensitivity: ['추위 많이 탐', '보통', '더위 많이 탐'], smell_sensitivity: ['둔감', '보통', '예민'] };
const SENS_STEPS = { noise_sensitivity: ['많이 둔감', '둔감', '보통', '예민', '많이 예민'], temp_sensitivity: ['추위 많이 탐', '추위 탐', '보통', '더위 탐', '더위 많이 탐'], smell_sensitivity: ['많이 둔감', '둔감', '보통', '예민', '많이 예민'] };
for (const [name, label] of [['noise_sensitivity', '소음 민감도 허용 범위'], ['temp_sensitivity', '온도 민감도 허용 범위'], ['smell_sensitivity', '냄새 민감도 허용 범위']]) {
  RM_OVERRIDE[name] = { type: 'dual', label, min: 1, max: 5, ends: SENS_ENDS[name], steps: SENS_STEPS[name] };
}
// 원하는 대인관계: 룸메가 어느 정도 관계를 원하는지 범위로 지정 (나의 성향 눈금과 같음, 가운데에서 시작)
RM_OVERRIDE.roommate_relation = { type: 'dual', label: '룸메이트와의 선호 관계 범위', min: 1, max: 5, ends: ['각자 생활', '적당히', '친구처럼'], steps: ['각자 생활', '가벼운 인사', '적당히', '자주 어울림', '친구처럼'] };
// 조건부 룸메 항목: 조건(when)은 룸메 탭 안의 답을 봄 (rm_ 이름), 공유 항목은 내 답을 봄
// 공구·공유 의사: 룸메 탭에서도 '상관없음' 없이 O/X 성격의 선택지만
['hanger_buy', 'hanger_lend', 'fridge_buy', 'fridge_lend'].forEach(name => { RM_OVERRIDE[name] = { noAny: true }; });
RM_OVERRIDE.clean_freq = { type: 'dual', ticks: FREQ_TICKS, sublabel: '허용하는 청소 주기 범위', when: { name: 'rm_clean_style', value: 'often' } };
RM_OVERRIDE.rotation = { type: 'fixed', multi: true, source: 'rotation', label: '당번제', cols: 2,
  options: [o('ordered', 'O (순서대로)'), o('free', 'X (각자 알아서)')] };
RM_OVERRIDE.shared_bin = { type: 'fixed', multi: true, source: 'shared_bin', sublabel: '쓰레기통 공유', cols: 2,
  options: [o('yes', 'O', '공유함'), o('no', 'X', '공유 안 함')] };
RM_OVERRIDE.trash_freq = { type: 'dual', ticks: FREQ_TICKS, sublabel: '허용하는 비움 주기 범위', when: { name: 'rm_trash_style', value: 'regular' } };
RM_OVERRIDE.trash_rotation = { type: 'fixed', multi: true, source: 'trash_rotation', sublabel: '쓰레기 당번제', cols: 2, when: { name: 'shared_bin', value: 'yes' },
  options: [o('ordered', 'O', '순서대로'), o('free', 'X', '각자 알아서')] };
// 룸메 샤워 소요 시간: 40분 이상은 사실상 상관없음
RM_OVERRIDE.shower_duration = { options: [o('5', '5분 이내'), o('10', '10분'), o('15', '15분'), o('20', '20분'), o('30', '30분'), o('40', '40분 이상(상관없음)')] };
// 룸메 탭에는 '상관없음'을 자동으로 붙이지 않음 (필요한 칸은 RM_OVERRIDE 의 options 에 직접 any 를 넣음: 현재 취미만)
const withAny = f => f;
// 원하는 룸메 칸: 이름에 rm_ 를 붙이고, 1개 고르기(radio)는 여러 개 고를 수 있게 바꿈 (서식은 그대로)
// 체크박스는 '상관없음'을 고르면 나머지가 풀리고, 다른 걸 고르면 '상관없음'이 풀림 (exclusive)
const toRoommate = fields => fields.map(f => {
  if (f.type === 'group') return { ...f, fields: toRoommate(f.fields) };
  const ov = RM_OVERRIDE[f.name] || {};
  let g = withAny({ ...f, ...ov, name: 'rm_' + f.name });
  if (f.when && !ov.when) g = { ...g, when: { ...f.when, name: 'rm_' + f.when.name } };   // 하위 질문: 룸메 탭의 부모 답을 봄
  if (g.type === 'radio' && !ov.type) g = { ...g, type: 'checkbox', default: [] };
  if (g.type === 'checkbox') g = { ...g, exclusive: 'any' };
  return g;
});

const ROOMMATE_SECTIONS = [
  RM_BASIC,
  ...PROFILE_SCHEMA.filter(s => s.id !== 'basic').map(s => ({ ...s, id: 'rm_' + s.id, scope: 'roommate', fields: toRoommate(s.fields) })),
];
PROFILE_SCHEMA.push(...ROOMMATE_SECTIONS);

// 맨 마지막 항목: 자기소개 글 (나의 설문 탭에만 있음, 룸메 탭에는 만들지 않으려고 위에서 만든 뒤에 붙임)
// 점수 규칙에는 쓰지 않고, AI 분석에서만 참고함. 답안이 바뀌면 AI 캐시도 자동으로 다시 계산됨 (글 수정 시각 기준)
PROFILE_SCHEMA.push({
  id: 'intro',
  title: '자기소개',
  fields: [
    { name: 'intro', label: '소개글', type: 'textarea', optional: true, maxLength: 300,
      placeholder: '생활 습관, 성격, 룸메에게 바라는 점 등을 자유롭게 적어 주세요.',
      hint: '연락처·계정 등 개인정보는 적지 마세요. 최대 300자.' },
  ],
});

// 모달 탭 정의 (섹션의 scope 와 맞춰짐)
const PROFILE_TABS = [
  { id: 'me', label: '내 정보' },
  { id: 'roommate', label: '원하는 룸메' },
];

if (typeof module !== 'undefined') module.exports = { PROFILE_SCHEMA, SCHEMA_VERSION };