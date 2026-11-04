// ================= 내 정보 수정 모달 - 폼 렌더링 / 값 수집 =================
// 항목 정의: profile-schema.js (PROFILE_SCHEMA)

// 공통 Tailwind 클래스
const CLS = {
  input:    'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500',
  gridBtn:  'radio-box flex items-center justify-center py-2 px-1 bg-white border border-slate-300 rounded-lg text-xs font-medium cursor-pointer transition hover:border-red-400',
  listBtn:  'radio-box flex items-center gap-2.5 p-2.5 bg-white border border-slate-300 rounded-lg text-xs cursor-pointer transition hover:border-red-400',
  bare:     'w-full bg-transparent px-1 py-2 text-sm font-bold text-center focus:outline-none cursor-pointer',
  label:    'block text-sm font-bold text-slate-700 mb-2 pl-2 border-l-[3px] border-red-300',
  subLabel: 'block text-xs font-semibold text-slate-500 mb-1.5',
  hint:     'text-[11px] text-slate-400 mt-1.5 px-0.5',
  list:     'khu-list hidden absolute z-30 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-36 overflow-y-auto text-xs mt-1',
  listItem: 'p-2 hover:bg-red-50 hover:text-red-600 cursor-pointer border-b border-slate-100 last:border-none',
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 공통 부품 ----------

// 옵션 1개 (radio / checkbox 공용). asList: 칸 전체가 목록 서식이면 설명이 없는 선택지(상관없음 등)도 목록으로
function optionHtml(f, opt, type, asList = false) {
  const on = type === 'radio' ? f.default === opt.value : (f.default || []).includes(opt.value);
  const inline = type === 'checkbox' && !asList;   // 중복 선택은 설명이 있어도 가로(격자) 서식 유지
  const list = asList || (opt.desc && !inline);
  const input = `<input type="${type}" name="${f.name}" value="${esc(opt.value)}" class="accent-red-600 ${list ? '' : 'mr-1'}" ${on ? 'checked' : ''}>`;
  // 선택지 이름은 항상 굵게, 뒤의 설명 괄호만 얇게 (격자·세로목록·단일/복수 선택 모두 같은 서식)
  const name = `<b>${esc(opt.label)}</b>`;
  if (!list) return `<label class="${CLS.gridBtn}">${input} ${name}${opt.desc ? ` <span class="font-normal">(${esc(opt.desc)})</span>` : ''}</label>`;
  return `<label class="${CLS.listBtn}">${input}<span>${name}${opt.desc ? ` <span class="font-normal">(${esc(opt.desc)})</span>` : ''}</span></label>`;
}

// 칸 개수와 한 줄 개수로 격자 열 수 (남는 칸이 한 줄에 외롭게 붙지 않도록 줄을 고르게 나눔)
function gridCols(f) {
  const n = f.options.length, c = f.cols || n;
  return Math.ceil(n / Math.ceil(n / c));
}

// 선택지 묶음 (radio / checkbox 공용 서식). exclusive: 이 값을 고르면 나머지가 풀리는 선택지 (원하는 룸메 '상관없음')
// f._kids: 특정 선택지를 골랐을 때 그 선택지 바로 밑에 열리는 하위 질문들 [{ value, html }]
function choiceHtml(f, type) {
  const kids = f._kids || [];
  const isList = f.list || (type !== 'checkbox' && f.options.some(opt => opt.desc));   // list: 긴 문장이 있으면 세로 목록 (중복 선택은 설명이 있어도 가로)
  const nestOf = value => kids.filter(k => k.value === value).map(k =>
    `<div class="khu-nest hidden" data-when-name="${esc(f.name)}" data-when-value="${esc(k.value)}">${k.html}</div>`).join('');
  if (isList) {
    // 세로 목록: 하위 질문은 해당 선택지 바로 밑
    return `<div class="space-y-2" ${f.exclusive ? `data-excl="${esc(f.exclusive)}"` : ''}>${f.options.map(opt => optionHtml(f, opt, type, true) + nestOf(opt.value)).join('')}</div>`;
  }
  // 가로(격자): 하위 질문은 줄 전체 밑에 한 번에 (선택지 사이에 끼지 않음)
  const row = `<div class="grid grid-cols-${gridCols(f)} gap-2" ${f.exclusive ? `data-excl="${esc(f.exclusive)}"` : ''}>${f.options.map(opt => optionHtml(f, opt, type, false)).join('')}</div>`;
  return kids.length ? `<div>${row}${kids.map(k => `<div class="khu-nest hidden" data-when-name="${esc(f.name)}" data-when-value="${esc(k.value)}">${k.html}</div>`).join('')}</div>` : row;
}

// 눈금 글자 줄 (ticks 슬라이더): 눈금 위치마다 점 + 이름
const tickLabelsHtml = ticks => `<div class="khu-tick-row khu-tick-steps" style="margin-top:14px">${ticks.map((t, i) =>
  `<div class="khu-tick" style="left:calc(8px + (100% - 16px) * ${i / (ticks.length - 1)})"><i></i><span>${esc(t)}</span></div>`).join('')}</div>`;

// 드롭다운 (단과대 서식 공통)  searchable: 검색·직접입력 허용 / 아니면 선택 전용
function comboHtml({ name, options, value = '', placeholder = '', searchable = false, center = false, bare = false, hiddenAttr = '', dependsOn = '' }) {
  const label = options.find(opt => opt.value === value)?.label ?? value;
  const items = options.map(opt => `<li class="${CLS.listItem}" data-v="${esc(opt.value)}" data-l="${esc(opt.label)}" data-g="${esc(opt.group || '')}">${esc(opt.label)}</li>`).join('');
  return `
    <div class="khu-combo relative ${bare ? 'khu-bare' : ''}" ${dependsOn ? `data-depends="${esc(dependsOn)}"` : ''}>
      <input type="hidden" ${name ? `name="${name}"` : ''} ${hiddenAttr} value="${esc(value)}">
      <input type="text" class="khu-combo-input ${bare ? CLS.bare : CLS.input + ' pr-7'} ${center ? 'text-center' : ''} ${searchable ? '' : 'cursor-pointer'}"
             value="${esc(label)}" placeholder="${esc(placeholder)}" autocomplete="off" ${searchable ? '' : 'readonly'}>
      <ul class="${CLS.list}">${items}<li class="p-2 text-slate-400 text-center hidden" data-empty>검색 결과가 없습니다</li></ul>
    </div>`;
}

// ---------- 타입별 입력 UI ----------
const FIELD_RENDERERS = {
  radio:    f => choiceHtml(f, 'radio'),
  checkbox: f => choiceHtml(f, 'checkbox'),
  range(f) {
    if (f.ticks) f = { ...f, min: 0, max: f.ticks.length - 1 };   // ticks: 눈금마다 이름이 있는 단계 슬라이더 (값은 0부터의 단계 번호)
    const [left, mid, right] = f.ends || [];
    // 기본값이 없으면 가운데에 흐리게 놓고, 사용자가 건드려야(touched) 답변으로 인정
    const answered = f.default !== undefined && f.default !== null && f.default !== '';
    const val = answered ? f.default : Math.round((f.min + f.max) / 2);
    const pct = ((val - f.min) / (f.max - f.min)) * 100;
    const ticks = Array.from({ length: f.max - f.min + 1 }, () => '<i></i>').join('');
    return `
      <div class="khu-slider ${answered ? '' : 'khu-unset'}">
        <input type="range" name="${f.name}" min="${f.min}" max="${f.max}" step="1" value="${val}" data-touched="${answered ? 1 : 0}" style="--pct:${pct}%">
        ${f.ticks || f.steps ? '' : `<div class="khu-ticks">${ticks}</div>`}
      </div>
      ${f.ticks ? tickLabelsHtml(f.ticks) : f.steps ? tickLabelsHtml(f.steps) : `<div class="flex justify-between text-[11px] font-semibold text-slate-500 px-0.5 mt-1">
        <span>${left}</span><span class="text-slate-400">${mid}</span><span>${right}</span>
      </div>`}
      ${answered ? '' : '<p class="khu-unset-hint text-[11px] text-slate-400 mt-1 px-0.5">슬라이더를 움직이거나 눌러서 선택해 주세요.</p>'}`;
  },
  select: f => comboHtml({ name: f.name, options: f.options, value: f.default, placeholder: f.placeholder }),
  combo:  f => comboHtml({ name: f.name, options: f.options, value: f.default, placeholder: f.placeholder, searchable: true, dependsOn: f.dependsOn }),
  time(f) {
    const [h0 = '', m0 = ''] = (f.default || '').split(':');
    const pad = n => String(n).padStart(2, '0');
    const [spanStart, spanEnd] = f.span || [0, 23];
    const spanHours = [];
    if (f.span) for (let x = spanStart; ; x = (x + 1) % 24) { spanHours.push(x); if (x === spanEnd) break; }
    const hourOpts = (f.span ? spanHours : Array.from({ length: 24 }, (_, i) => i)).map(i => o(pad(i), pad(i)));
    const minOpts = Array.from({ length: 12 }, (_, i) => o(pad(i * 5), pad(i * 5)));
    const part = (key, opts, cur, ph) => comboHtml({ options: opts, value: cur, bare: true, placeholder: ph, hiddenAttr: `data-part="${key}"` });
    // 범위가 있으면 시간은 범위 안에서만 고르고, 범위 끝 시각은 분을 00으로 고정 (syncTimeSpan)
    const spanAttr = f.span ? `data-span-start="${spanStart}" data-span-end="${spanEnd}"` : '';
    return `
      <div class="khu-time flex items-center bg-white border border-slate-300 rounded-lg px-2 focus-within:ring-2 focus-within:ring-red-500" data-time-picker ${spanAttr}>
        <input type="hidden" name="${f.name}" value="${esc(f.default || '')}">
        <div class="flex-1 min-w-0">${part('h', hourOpts, h0, '시')}</div>
        <span class="font-black text-slate-400 text-base px-1">:</span>
        <div class="flex-1 min-w-0">${part('m', minOpts, m0, '분')}</div>
      </div>`;
  },
  number(f) {
    // digits 가 있으면 숫자만, 정해진 자리 수까지만 (예: 학번 2자리, 출생년도 4자리). 자리가 안 맞으면 아래에 안내
    return `
      <div class="${f.digits ? 'khu-digits-wrap' : ''}">
        <div class="relative flex items-center">
          <input type="text" inputmode="numeric" name="${f.name}" ${f.digits ? `data-digits="${f.digits}" maxlength="${f.digits}"` : ''} value="${esc(f.default)}" placeholder="${esc(f.placeholder)}" class="${CLS.input} pr-12">
          ${f.suffix ? `<span class="absolute right-3 text-xs text-slate-400 font-bold pointer-events-none">${f.suffix}</span>` : ''}
        </div>
        ${f.digits ? '<p class="khu-digits-msg text-[11px] text-red-500 mt-1 px-0.5"></p>' : ''}
      </div>`;
  },
  text(f) {
    return `<input type="text" name="${f.name}" maxlength="${f.maxLength || 100}" value="${esc(f.default)}" placeholder="${esc(f.placeholder)}" class="${CLS.input}">`;
  },
  // 여러 줄 글 (자기소개 등)
  textarea(f) {
    return `<textarea name="${f.name}" maxlength="${f.maxLength || 300}" rows="5" placeholder="${esc(f.placeholder)}" class="${CLS.input} resize-y">${esc(f.default ?? '')}</textarea>`;
  },
  // 태그 입력: 검색 드롭다운 + Enter 로 직접 추가 + × 로 삭제 (값은 배열로 저장)
  tags(f) {
    const label = JSON.stringify((f.options || []).map(o => o.label));
    const html = `
      <div class="khu-tags" data-tags-name="${f.name}" data-max="${f.max || 10}" data-maxlen="${f.maxLength || 10}" data-options="${esc(label)}" data-custom="${f.custom === false ? 0 : 1}" data-plain="${f.plain ? 1 : 0}" data-any-default="${f.anyDefault ? 1 : 0}" ${f.grouped ? 'data-grouped="1"' : ''} ${f.cats ? `data-cats="${esc(JSON.stringify(f.cats))}"` : ''} data-groups="${esc(JSON.stringify(Object.fromEntries((f.options || []).filter(x => x.group).map(x => [x.label, x.group]))))}">
        <input type="hidden" name="${f.name}" value="${esc(JSON.stringify(Array.isArray(f.default) ? f.default : []))}">
        ${f.chipsBelow || f.chipsOutside ? (f.clearable && !f.chipsOutside ? `<div class="flex justify-end mb-1.5"><button type="button" data-tag-clear="${f.name}" class="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-red-600 underline underline-offset-2">전체 삭제</button></div>` : '') : (f.clearable ? `<div class="flex items-start gap-2 mb-2"><div class="khu-tags-chips flex flex-wrap gap-1.5 flex-1 min-w-0"></div><button type="button" data-tag-clear="${f.name}" class="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-red-600 underline underline-offset-2">전체 삭제</button></div>` : '<div class="khu-tags-chips flex flex-wrap gap-1.5 mb-2"></div>')}
        <div class="relative khu-tags-wrap">
          <input type="text" class="khu-tags-input ${f.plain ? 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400' : CLS.input}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">
          <ul class="khu-tag-list hidden absolute z-30 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto text-xs mt-1"></ul>
        </div>
        ${f.chipsBelow ? '<div class="khu-tags-chips flex flex-wrap gap-1.5 mt-2"></div>' : ''}
        <p class="khu-tags-msg text-[11px] text-red-500 mt-1 px-0.5 empty:hidden"></p>   <!-- 안내가 있을 때만 줄을 차지 -->
      </div>`;   // 힌트는 inputHtml 이 한 번만 그림 (여기서 또 그리면 두 번 뜸)
    // boxed: 단과대·학과처럼 흰 박스로 감쌈
    return f.boxed ? `<div class="rounded-xl border border-slate-200 bg-white p-3">${html}</div>` : html;
  },
  // 원하는 룸메 기본 정보: 나와 같은 값으로 고정 (답을 받지 않음)
  // 내 정보의 답을 그대로 따라가는 칸: 나의 성향과 같은 선택지 서식이지만 고정 (syncLinked 가 내 답에 맞춰 체크하고 잠금)
  fixed: f => `<div data-fixed-src="${esc(f.source || '')}" class="pointer-events-none">${choiceHtml(f, f.multi ? 'checkbox' : 'radio')}</div>`,

  // 범위 슬라이더 (절대 값): 나의 성향 슬라이더와 같은 눈금(점)·끝 글자 서식, 양 끝 손잡이 2개
  dual(f) {
    if (f.ticks) f = { ...f, min: 0, max: f.ticks.length - 1 };   // ticks: 눈금마다 이름이 있는 범위 슬라이더
    const cur = normRange(f.default);
    const center = Math.round((f.min + f.max) / 2);   // 답하기 전에는 가운데에서 시작 (학번·나이처럼)
    const lo = cur ? cur.lo : center, hi = cur ? cur.hi : center;
    const [left, mid, right] = f.ends || [];
    const dots = Array.from({ length: f.max - f.min + 1 }, () => '<i></i>').join('');
    return `
      <div class="khu-span ${cur ? '' : 'khu-unset'}" data-span data-min="${f.min}" data-max="${f.max}">
        <input type="hidden" name="${f.name}" value="${esc(JSON.stringify(cur))}" data-touched="${cur ? 1 : 0}">
        <div class="khu-dual">
          <div class="khu-dual-track"></div>
          <div class="khu-span-fill" style="${spanFillStyle(lo, hi, f.min, f.max)}"></div>
          <input type="range" data-end="lo" min="${f.min}" max="${f.max}" step="1" value="${lo}">
          <input type="range" data-end="hi" min="${f.min}" max="${f.max}" step="1" value="${hi}">
        </div>
        ${f.ticks ? tickLabelsHtml(f.ticks) : f.steps ? tickLabelsHtml(f.steps) : `<div class="khu-ticks">${dots}</div>
        <div class="flex justify-between text-[11px] font-semibold text-slate-500 px-0.5 mt-1">
          <span>${left}</span><span class="text-slate-400">${mid}</span><span>${right}</span>
        </div>`}
        ${cur ? '' : '<p class="khu-unset-hint text-[11px] text-slate-400 mt-1 px-0.5">양 끝을 움직여 범위를 골라 주세요.</p>'}
      </div>`;
  },

  // 학번·나이 범위: 가운데(0)가 내 값, 양 끝 손잡이 2개를 -3 ~ +3 사이에서 지정 (답하기 전에는 미응답)
  span(f) {
    const cur = normRange(f.default);
    const lo = cur ? cur.lo : 0, hi = cur ? cur.hi : 0;
    const ticks = f.ticks.map((t, i) => {
      const pos = f.flip ? 1 - i / (f.ticks.length - 1) : i / (f.ticks.length - 1);   // flip: 왼쪽이 큰 값(+)이 되도록 거울 배치
      const left = `calc(8px + (100% - 16px) * ${pos})`;
      // 눈금 글자는 내 값(syncLinked)을 기준으로 채움: 가운데 = 내 값, 나머지 = 내 값 ± 차이 (끝칸은 이하/이상)
      const label = `<span class="${i === 3 ? 'khu-mine' : ''}" data-off="${i - 3}" data-src="${esc(f.source || '')}" data-digits="${f.srcDigits || ''}" data-short="${f.short ? 1 : 0}" data-default="${esc(t)}">${t}</span>`;
      return `<div class="khu-tick" style="left:${left}"><i></i>${label}</div>`;
    }).join('');
    return `
      <div class="khu-span ${cur ? '' : 'khu-unset'}" data-span data-flip="${f.flip ? 1 : 0}">
        <input type="hidden" name="${f.name}" value="${esc(JSON.stringify(cur))}" data-touched="${cur ? 1 : 0}">
        <div class="khu-dual" ${f.flip ? 'style="direction:rtl"' : ''}>
          <div class="khu-dual-track"></div>
          <div class="khu-span-fill" style="${spanFillStyle(lo, hi, -3, 3, !!f.flip)}"></div>
          <input type="range" data-end="lo" min="-3" max="3" step="1" value="${lo}">
          <input type="range" data-end="hi" min="-3" max="3" step="1" value="${hi}">
        </div>
        <div class="khu-tick-row">${ticks}</div>
        ${cur ? '' : '<p class="khu-unset-hint text-[11px] text-slate-400 mt-1 px-0.5">양 끝을 움직여 범위를 골라 주세요.</p>'}
      </div>`;
  },

  // 시간 범위: [시작 ~ 끝], 시간만 고름 (분 없음), 각 드롭다운에 '상관없음'
  hourrange(f) {
    const cur = f.default && typeof f.default === 'object' ? f.default : null;
    const pad = n => String(n).padStart(2, '0');
    const [spanStart, spanEnd] = f.span || [0, 23];
    const spanHours = [];
    for (let h = spanStart; ; h = (h + 1) % 24) { spanHours.push(h); if (h === spanEnd) break; }
    const hours = spanHours.map(h => o(pad(h), `${pad(h)}시`));   // 범위 자체가 정해져 있어서 상관없음은 없음
    const part = (key, v, ph) => comboHtml({ options: hours, value: v ?? '', placeholder: ph, bare: true, center: true, hiddenAttr: `data-part="${key}"` });
    // 내 성향의 시간 칸과 같은 박스 서식: [ 시작시간 ~ 끝시간 ] 한 박스
    return `
      <div class="khu-time flex items-center bg-white border border-slate-300 rounded-lg px-2 focus-within:ring-2 focus-within:ring-red-500" data-hour-range data-span-start="${spanStart}" data-span-end="${spanEnd}">
        <input type="hidden" name="${f.name}" value="${esc(cur ? JSON.stringify(cur) : '')}">
        <div class="flex-1 min-w-0">${part('from', cur?.from, '시작시간')}</div>
        <span class="font-black text-slate-400 text-base px-1">~</span>
        <div class="flex-1 min-w-0">${part('to', cur?.to, '끝시간')}</div>
      </div>`;
  },

  placeholder(f) {
    return `<div class="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-xs text-slate-400" data-slot="${f.name}">${f.text || '준비 중'}</div>`;
  },
};

// 하위 질문(under)을 부모 질문의 선택지 밑에 넣을 수 있도록 부모에게 _kids 를 붙여 줌
const withKids = (sub, siblings) => {
  const kids = siblings.filter(k => k.under && k.when.name === sub.name).map(k => ({ value: k.when.value, html: inputHtml(k) }));
  return kids.length ? { ...sub, _kids: kids } : sub;
};

// 입력 1개 (소라벨 + 입력 + 힌트)
const inputHtml = f => `
  ${f.sublabel ? `<span class="${CLS.subLabel}">${f.sublabel}</span>` : ''}
  ${FIELD_RENDERERS[f.type](f)}
  ${f.hint ? `<p class="${CLS.hint}">${f.hint}</p>` : ''}`;

// 항목 1개: 단일 or 묶음(group)
function fieldHtml(f) {
  const span = f.half && !f.when ? '' : 'col-span-2';   // 조건부 항목은 한 줄 전체로
  const condCls = f.when ? 'hidden' : '';
  const condAttr = f.when ? `data-when-name="${esc(f.when.name)}" data-when-value="${esc(f.when.value)}"` : '';
  // 묶음 안에서 태그 줄을 칸 아래 넓게 펼침 (chipsOutside). 전체 삭제 버튼 포함
  const outside = f.type === 'group'
    ? f.fields.filter(s => s.chipsOutside).map(s => `
        <div class="flex items-start gap-2 ${f.boxed ? 'mt-3' : 'mt-2'}">
          <div class="khu-tags-chips flex flex-wrap gap-1.5 flex-1 min-w-0" data-chips-for="${s.name}"></div>
          <button type="button" data-tag-clear="${s.name}" class="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-red-600 underline underline-offset-2">전체 삭제</button>
        </div>`).join('')
    : '';
  const grid = f.type === 'group'
    ? `<div class="grid ${f.grid || `grid-cols-${f.fields.filter(s => !s.under).length}`} gap-3">${f.fields.filter(s => !s.under).map(sub0 => { const sub = withKids(sub0, f.fields); return `<div class="min-w-0 ${sub.when ? 'hidden' : ''}" ${sub.when ? `data-when-name="${esc(sub.when.name)}" data-when-value="${esc(sub.when.value)}"` : ''}>${inputHtml(sub)}</div>`; }).join('')}</div>`
    : '';
  const body = f.type === 'group'
    ? `${f.boxed
        ? `<div class="rounded-xl border border-slate-200 bg-white p-3">${grid}${outside}</div>`
        : `${grid}${outside}`}
       ${f.hint ? `<p class="${CLS.hint}">${f.hint}</p>` : ''}`
    : inputHtml(f);
  const names = f.type === 'group' ? f.fields.map(sub => sub.name).join(' ') : f.name;
  return `<div class="${span} ${condCls}" ${condAttr} data-fields="${names}"><label class="${CLS.label}">${f.label}</label>${body}</div>`;
}

// 카테고리 블록 (번호는 1부터)
function sectionHtml(section, index) {
  return `
    <div class="space-y-4" id="section-${section.id}">
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-full bg-red-100 text-red-600 font-bold text-xs flex items-center justify-center">${index + 1}</span>
        <h4 class="font-bold text-base text-slate-800">${section.title}</h4>
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
        ${section.fields.map(fieldHtml).join('')}
      </div>
    </div>`;
}

// 범위 슬라이더의 저장값 {lo, hi} 를 객체로 정리 (없거나 깨졌으면 null = 미응답)
function normRange(v) {
  let o = v;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
  return o && typeof o === 'object' && Number.isFinite(Number(o.lo)) && Number.isFinite(Number(o.hi)) ? { lo: Number(o.lo), hi: Number(o.hi) } : null;
}

// 저장된 답안(values)을 각 항목의 기본값으로 덮어씌운 설문 정의 만들기
const withValues = (fields, v) => fields.map(f =>
  f.type === 'group' ? { ...f, fields: withValues(f.fields, v) }
  : v[f.name] !== undefined ? { ...f, default: v[f.name] } : f);

// 섹션이 속한 탭 (scope 생략 = 'me')
const sectionScope = s => s.scope || 'me';

// 현재 보고 있는 탭
let activeProfileTab = 'me';

// values: 이전에 저장한 답안 { name: value } (없으면 기본값)
// data-tabs="1" 인 컨테이너는 탭별 패널로 나누고, data-target 이 이 컨테이너인 탭 줄(data-tab-bar)을 씀
// 수정 모달(profile-sections)과 답안 보기 모달(view-sections)이 각각 자기 탭 줄을 가짐
function renderProfileSections(values = {}, containerId = 'profile-sections') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const tabbed = container.dataset.tabs === '1';
  container.innerHTML = PROFILE_TABS.map(tab => {
    const secs = PROFILE_SCHEMA.filter(s => sectionScope(s) === tab.id);
    const body = secs.map((s, j) => sectionHtml({ ...s, fields: withValues(s.fields, values) }, j)).join('');
    return `<div data-panel="${tab.id}" class="space-y-6">${body}</div>`;
  }).join('');
  hydrateTags(container);
  syncTimeSpans(container);
  syncLinked(container);
  syncConditional(container);
  refreshDependentOptions(container);
  // 답안 보기(view-sections)는 읽기 전용: 취미 등 태그 목록은 처음부터 닫아 둠 (열린 상태로 보이던 문제)
  if (containerId === 'view-sections') container.querySelectorAll('.khu-tag-list').forEach(ul => ul.classList.add('hidden'));
  if (tabbed) {
    const bar = document.querySelector(`[data-tab-bar][data-target="${containerId}"]`);
    if (bar) renderProfileTabs(bar);
    // 수정 모달은 마지막으로 보던 탭, 답안 보기는 항상 첫 탭부터
    showProfileTab(containerId === 'profile-sections' ? activeProfileTab : 'me', containerId);
  }
}

// 탭 버튼 그리기 (수정 모달에서만 답한 개수를 같이 표시)
function renderProfileTabs(bar) {
  const withCount = bar.dataset.target === 'profile-sections';
  bar.innerHTML = PROFILE_TABS.map(t => `
    <button type="button" data-profile-tab="${t.id}" class="py-2.5 rounded-xl text-sm font-bold border transition">
      ${!withCount && t.id === 'me' ? '정보' : t.label} ${withCount ? `<span data-count="${t.id}" class="text-xs font-semibold opacity-80"></span>` : ''}
    </button>`).join('');
}

// 탭 전환: 해당 대상(targetId)의 패널만 보이게 하고 버튼 강조
// 탭별 스크롤 위치: 나의 성향 / 원하는 룸메 각각 기억해서, 탭을 바꾸면 그 탭의 위치로
const profileScrollMemo = { me: 0, roommate: 0 };
const profileScroller = () => document.getElementById('profile-scroll');
profileScroller()?.addEventListener('scroll', e => { profileScrollMemo[activeProfileTab] = e.target.scrollTop; });

function showProfileTab(id, targetId = 'profile-sections') {
  const isEdit = targetId === 'profile-sections';
  const scroller = profileScroller();
  // 탭을 바꾸기 전에 지금 탭의 위치를 저장 (패널을 숨기면 위치가 줄어들 수 있어서 먼저)
  if (isEdit && scroller && activeProfileTab !== id) profileScrollMemo[activeProfileTab] = scroller.scrollTop;
  if (isEdit) activeProfileTab = id;
  document.querySelectorAll(`#${targetId} [data-panel]`).forEach(p => p.classList.toggle('hidden', p.dataset.panel !== id));
  if (targetId === 'view-sections' && typeof relayoutViewCompare === 'function') relayoutViewCompare();   // 탭을 바꾸면 점 위치를 다시 잡음
  if (isEdit && scroller) scroller.scrollTop = profileScrollMemo[id] || 0;
  document.querySelectorAll(`[data-tab-bar][data-target="${targetId}"] [data-profile-tab]`).forEach(b => {
    const on = b.dataset.profileTab === id;
    b.className = `py-2.5 rounded-xl text-sm font-bold border transition ${on ? 'bg-red-600 border-red-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-red-300'}`;
  });
  if (isEdit) updateTabCounts();
}

// 탭에 속한 필수 항목 이름 목록 (선택 항목·안내 칸 제외)
function requiredNamesOfTab(id, profile = {}) {
  return PROFILE_SCHEMA.filter(s => sectionScope(s) === id)
    .flatMap(s => s.fields.flatMap(f => f.type === 'group' ? f.fields : [f]))
    .filter(f => !isStatic(f) && !f.optional && !(f.when && !condOk(f.when, profile)))
    .map(f => f.name);
}

// 각 탭의 "답한 항목 / 전체 필수 항목" 표시
function updateTabCounts() {
  if (!document.getElementById('profile-tabs') || !document.getElementById('profile-modal')) return;
  const profile = collectProfile();
  const missing = new Set(findMissing(profile).map(m => m.name));
  PROFILE_TABS.forEach(t => {
    const names = requiredNamesOfTab(t.id, profile);
    const done = names.filter(n => !missing.has(n)).length;
    const el = document.querySelector(`[data-count="${t.id}"]`);
    if (el) el.textContent = `${done}/${names.length}`;
  });
}

// 항목 이름이 속한 탭 (검사에서 빈 항목이 있는 탭으로 옮길 때 사용)
function scopeOfField(name) {
  const sec = PROFILE_SCHEMA.find(s => s.fields.flatMap(f => f.type === 'group' ? f.fields.map(x => x.name) : [f.name]).includes(name));
  return sec ? sectionScope(sec) : 'me';
}

// ---------- 값 수집: { name: value } (키는 snake_case) ----------
const plainLabel = t => String(t ?? '').replace(/\s*\[추가\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
const allFields = () => PROFILE_SCHEMA.flatMap(s => s.fields).flatMap(f =>
  f.type === 'group' ? f.fields.map(sub => ({ ...sub, label: `${plainLabel(f.label)} ${sub.sublabel || ''}`.trim() })) : [{ ...f, label: plainLabel(f.label) }]);

// 값을 받지 않는 칸 (안내용 placeholder, 고정 표시)
const isStatic = f => f.type === 'placeholder' || f.type === 'fixed';

function collectProfile() {
  const scope = document.getElementById('profile-modal');
  const q = (f, tag = 'input') => scope.querySelector(`${tag}[name="${f.name}"]`);
  const read = {
    tags:     f => JSON.parse(q(f).value || '[]'),
    radio:    f => scope.querySelector(`input[name="${f.name}"]:checked`)?.value ?? null,
    checkbox: f => [...scope.querySelectorAll(`input[name="${f.name}"]:checked`)].map(el => el.value),
    range:    f => (q(f).dataset.touched === '1' ? Number(q(f).value) : null),   // 안 건드렸으면 미응답
    span:     f => (q(f).dataset.touched === '1' && q(f).value ? JSON.parse(q(f).value) : null),   // 안 건드렸으면 미응답
    dual:     f => (q(f).dataset.touched === '1' && q(f).value ? JSON.parse(q(f).value) : null),   // 범위 슬라이더(절대값)도 같은 규칙
    hourrange: f => (q(f).value ? JSON.parse(q(f).value) : null),
  };
  const result = {};
  allFields().forEach(f => {
    if (isStatic(f) || f.transient) return;   // transient: 화면에서만 쓰고 저장하지 않음 (단과대)
    const raw = (q(f) || q(f, 'textarea')).value.trim();
    result[f.name] = read[f.type] ? read[f.type](f) : (f.digits && raw.length !== f.digits ? '' : raw);
  });
  // 조건이 안 맞아 숨은 항목은 답하지 않은 것으로 저장
  allFields().forEach(f => { if (f.when && !isStatic(f) && !f.transient && !condOk(f.when, result)) result[f.name] = Array.isArray(result[f.name]) ? [] : null; });
  return result;
}

// ---------- 필수 입력 검사 ----------
const isEmptyAnswer = v => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

// 비어 있는 필수 항목 목록 [{ name, label }]  (optional: true 와 placeholder 는 제외)
function findMissing(profile) {
  // 자리 수가 정해진 칸(학번 2자리, 출생년도 4자리)은 정해진 수가 아니면 빈 것으로 봄
  return allFields().filter(f => !isStatic(f) && !f.optional && !(f.when && !condOk(f.when, profile))
      && (isEmptyAnswer(profile[f.name]) || (f.digits && String(profile[f.name]).length !== f.digits)))
                    .map(f => ({ name: f.name, label: f.label }));
}

// 빨간 테두리: 답을 채운 항목은 입력 직후 바로 지움 (입력 값이 반영된 뒤 검사하려고 0ms 뒤에 실행)
// 한 번 빨간 테두리를 띄운 뒤에는 계속 지켜봄: 답하면 지우고, 다시 비우면 다시 띄움
let missingWatch = false;
function resetMissingWatch() { missingWatch = false; }
function refreshMissingMarks() {
  const scope = document.getElementById('profile-modal');
  if (!scope || !missingWatch) return;
  const missing = new Set(findMissing(collectProfile()).map(m => m.name));
  scope.querySelectorAll('[data-fields]').forEach(el => {
    const names = (el.dataset.fields || '').split(/\s+/).filter(Boolean);
    el.classList.toggle('khu-missing', names.some(n => missing.has(n)));
  });
}
['input', 'change', 'click', 'pointerup', 'keyup'].forEach(type =>
  document.addEventListener(type, () => setTimeout(refreshMissingMarks, 0)));

// 첫 번째 빈 항목으로 스크롤하고 잠깐 빨갛게 표시
function highlightMissing(missing) {
  missingWatch = true;
  const scope = document.getElementById('profile-modal');
  scope.querySelectorAll('.khu-missing').forEach(el => el.classList.remove('khu-missing'));
  const boxes = missing.map(m => scope.querySelector(`[data-fields~="${m.name}"]`)).filter(Boolean);
  boxes.forEach(el => el.classList.add('khu-missing'));
  boxes[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- 이벤트 (이벤트 위임: 폼이 다시 그려져도 동작) ----------

// 드롭다운 열기/선택/닫기
function openCombo(combo, keyword = '') {
  const ul = combo.querySelector('.khu-list');
  let shown = 0;
  ul.querySelectorAll('li[data-v]').forEach(li => {
    const hit = !li.dataset.off && li.dataset.l.toLowerCase().includes(keyword.toLowerCase());
    li.classList.toggle('hidden', !hit);
    shown += hit;
  });
  ul.querySelector('[data-empty]').classList.toggle('hidden', shown > 0);
  ul.classList.remove('hidden');
}

document.addEventListener('click', e => {
  const combo = e.target.closest('.khu-combo');
  document.querySelectorAll('.khu-list:not(.hidden)').forEach(ul => { if (ul.parentElement !== combo) ul.classList.add('hidden'); });
  if (!combo) return;

  const li = e.target.closest('li[data-v]');
  if (li) {
    combo.querySelector('.khu-combo-input').value = li.dataset.l;
    combo.querySelector('input[type=hidden]').value = li.dataset.v;
    combo.querySelector('.khu-list').classList.add('hidden');
    combo.querySelector('.khu-combo-input').dispatchEvent(new Event('change', { bubbles: true }));
  } else if (e.target.matches('.khu-combo-input')) {
    // 칸을 누를 때마다 열림/닫힘 전환 (화살표도 같은 칸이라 함께 동작)
    const ul = combo.querySelector('.khu-list');
    if (ul.classList.contains('hidden')) openCombo(combo); else ul.classList.add('hidden');
  }
});

// 나의 정보: 학과를 고르면 그 학과가 속한 단과대가 자동으로 채워짐 (학과 목록의 data-g = 단과대)
document.addEventListener('change', e => {
  const text = e.target;
  if (!text.matches?.('.khu-combo[data-depends] .khu-combo-input')) return;
  const combo = text.closest('.khu-combo');
  const li = combo.querySelector(`.khu-list li[data-v="${CSS.escape(combo.querySelector('input[type=hidden]').value)}"]`);
  const college = li?.dataset.g;
  if (!college) return;
  const collegeCombo = (combo.closest('#profile-sections, #view-sections') || document).querySelector(`input[name="${combo.dataset.depends}"]`)?.closest('.khu-combo');
  if (!collegeCombo) return;
  const cur = collegeCombo.querySelector('input[type=hidden]');
  if (cur.value === college) return;
  const cli = collegeCombo.querySelector(`.khu-list li[data-v="${CSS.escape(college)}"]`);
  cur.value = college;
  collegeCombo.querySelector('.khu-combo-input').value = cli?.dataset.l ?? college;
  collegeCombo.querySelector('.khu-combo-input').dispatchEvent(new Event('change', { bubbles: true }));
});
document.addEventListener('input', e => {
  const el = e.target;
  // 검색형 드롭다운: 입력값 필터링 + 직접 입력값 저장
  if (el.matches?.('.khu-combo-input:not([readonly])')) {
    const combo = el.closest('.khu-combo');
    combo.querySelector('input[type=hidden]').value = el.value;
    openCombo(combo, el.value);
  }
  // 슬라이더 채움 비율
  if (el.matches?.('.khu-slider input[type=range]')) {
    el.style.setProperty('--pct', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
    markTouched(el);
  }
});

// 슬라이더를 눌렀거나(손잡이를 그대로 누르는 경우 포함) 키보드로 조작하면 "답변함"
function markTouched(el) {
  el.dataset.touched = '1';
  const wrap = el.closest('.khu-slider');
  wrap?.classList.remove('khu-unset');
  wrap?.closest('[data-fields]')?.classList.remove('khu-missing');
  wrap?.parentElement?.querySelector('.khu-unset-hint')?.remove();
}
document.addEventListener('pointerdown', e => { if (e.target.matches?.('.khu-slider input[type=range]')) markTouched(e.target); });
document.addEventListener('keydown', e => { if (e.target.matches?.('.khu-slider input[type=range]')) markTouched(e.target); });

// 시간 선택기: 시/분 → hidden(HH:MM)
document.addEventListener('change', e => {
  const box = e.target.closest?.('[data-time-picker]');
  if (!box) return;
  const v = key => box.querySelector(`[data-part="${key}"]`).value;
  // 시와 분을 둘 다 골라야 값이 생김 (하나만 고르면 아직 미응답)
  syncTimeSpan(box);
});

// 학번·나이 범위: 값(-3~3)을 막대 위 위치로 (손잡이 중심과 맞도록 양끝 8px 안쪽 기준)
function spanFillStyle(lo, hi, min = -3, max = 3, flip = false) {
  const x = v => (v - min) / (max - min);
  const at = p => `calc(8px + (100% - 16px) * ${p})`;
  if (flip) return `left:${at(1 - x(Math.max(lo, hi)))};right:${at(x(Math.min(lo, hi)))}`;   // 거울 배치 (값은 그대로)
  return `left:${at(x(Math.min(lo, hi)))};right:${at(1 - x(Math.max(lo, hi)))}`;
}

// 원하는 룸메 칸에 내 정보 값 연결: 고정 칸(성별·거주 기간)과 학번·나이 범위의 "내 값" 라벨
// 단과대 연결: 칸에 고른 단과대 목록 (null = 제한 없음: 안 골랐거나 '상관없음')
function selectedColleges(scope, src) {
  const tagBox = scope.querySelector(`.khu-tags[data-tags-name="${src}"]`);
  if (tagBox) {
    const v = tagsOf(tagBox);
    return !v.length || v.includes('상관없음') ? null : v;
  }
  const v = scope.querySelector(`input[name="${src}"]`)?.value;
  return v ? [v] : null;
}

// 학과 칸(드롭다운·태그)을 고른 단과대에 맞게 거름. 맞지 않는 값은 지움
function tagVisible(box, label) {
  const scope = box.closest('#profile-sections, #view-sections');
  const groups = scope && box.dataset.depends ? selectedColleges(scope, box.dataset.depends) : null;
  const g = JSON.parse(box.dataset.groups || '{}')[label];
  return !groups || !g || groups.includes(g);
}
function refreshDependentOptions(scope) {
  if (!scope) return;
  scope.querySelectorAll('.khu-combo[data-depends]').forEach(combo => {
    const groups = selectedColleges(scope, combo.dataset.depends);
    const lis = [...combo.querySelectorAll('li[data-v]')];
    lis.forEach(li => {
      const off = !!groups && !!li.dataset.g && !groups.includes(li.dataset.g);
      li.dataset.off = off ? '1' : '';
      li.classList.toggle('hidden', off);
    });
    // 목록이 열려 있으면 입력한 검색어 기준으로 다시 거름 (안 그러면 검색에서 빠진 과가 전부 다시 보임)
    if (!combo.querySelector('.khu-list').classList.contains('hidden')) openCombo(combo, combo.querySelector('.khu-combo-input').value);
    const hidden = combo.querySelector('input[type=hidden]'), text = combo.querySelector('.khu-combo-input');
    const cur = lis.find(li => li.dataset.v === hidden.value);
    if (cur && cur.dataset.off) { hidden.value = ''; text.value = ''; hidden.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  // 학과 칸: 단과대 드롭다운에서 고른 단과대 (저장하지 않음)
  const college = scope.querySelector('input[name="rm_college"]')?.value || '';
  scope.querySelectorAll('.khu-tags[data-grouped]').forEach(box => {
    if (box.dataset.college !== college) { box.dataset.college = college; filterTagList(box, box.querySelector('.khu-tags-input').value); }
  });
  scope.querySelectorAll('.khu-tags[data-depends]').forEach(box => {
    const tags = tagsOf(box);
    const keep = tags.filter(t => tagVisible(box, t));
    if (keep.length !== tags.length) setTags(box, keep);
  });
}
// 단과대를 바꾸면 학과 목록을 다시 거름
document.addEventListener('change', e => {
  const scope = e.target.closest?.('#profile-sections, #view-sections');
  if (scope) refreshDependentOptions(scope);
});

// 학번(2자리)·출생년도(4자리): 숫자 이외는 지우고 자리 수를 넘지 않게
document.addEventListener('input', e => {
  const d = e.target.dataset?.digits;
  if (!d || !e.target.matches('input[data-digits]')) return;
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, Number(d));
  if (e.target.value.length === Number(d)) digitsMsg(e.target, '');   // 자리 수를 채우면 안내 지움
});
// 칸에서 나갈 때: 자리 수가 안 맞으면 빨간 안내 (값은 비어 있는 것으로 취급)
function digitsMsg(el, text) {
  el.closest('.khu-digits-wrap')?.querySelector('.khu-digits-msg') && (el.closest('.khu-digits-wrap').querySelector('.khu-digits-msg').textContent = text);
  el.classList.toggle('border-red-400', !!text);
}
document.addEventListener('focusout', e => {
  const d = e.target.dataset?.digits;
  if (!d || !e.target.matches('input[data-digits]')) return;
  const v = e.target.value;
  digitsMsg(e.target, v && v.length !== Number(d) ? `숫자 ${d}자리로 입력해 주세요.` : '');
});

// 조건부 항목: 부모 답이 맞으면 보이고, 아니면 숨김
function syncConditional(scope) {
  if (!scope) return;
  scope.querySelectorAll('[data-when-name]').forEach(el => {
    const on = [...scope.querySelectorAll(`input[name="${el.dataset.whenName}"]:checked`)].some(i => i.value === el.dataset.whenValue);
    el.classList.toggle('hidden', !on);
  });
}
// 저장 값 기준으로 조건이 맞는지 (맞지 않으면 빈 값으로 취급)
const condOk = (when, res) => { const v = res[when.name]; return Array.isArray(v) ? v.includes(when.value) : v === when.value; };

function syncLinked(scope) {
  if (!scope) return;
  scope.querySelectorAll('[data-fixed-src]').forEach(box => {
    const vals = [...scope.querySelectorAll(`input[name="${box.dataset.fixedSrc}"]:checked`)].map(i => i.value);
    box.querySelectorAll('input[type=radio], input[type=checkbox]').forEach(r => { r.checked = vals.includes(r.value); r.disabled = true; });
  });
  scope.querySelectorAll('span[data-off][data-src]').forEach(el => {   // 눈금 칸만 (학과 목록의 li[data-off] 는 건드리지 않음)
    const raw = scope.querySelector(`input[name="${el.dataset.src}"]`)?.value.trim() ?? '';
    const off = Number(el.dataset.off);
    if (!raw || raw.length !== Number(el.dataset.digits)) { el.textContent = el.dataset.default; return; }
    const n = Number(raw) + off;
    const num = el.dataset.short === '1' ? String(n % 100).padStart(2, '0') : String(n);   // 출생년도는 뒤 두 자리만
    const leftEnd = el.closest('[data-span]')?.dataset.flip === '1' ? 3 : -3;   // 왼쪽 끝은 항상 '이하', 오른쪽 끝은 '이상'
    el.textContent = `${num}${off === leftEnd ? ' 이하' : off === -leftEnd ? ' 이상' : ''}`;
  });
}
['input', 'change'].forEach(type => document.addEventListener(type, e => {
  const scope = e.target.closest?.('#profile-modal');
  if (scope) { syncLinked(scope); syncConditional(scope); }
}));

// 체크박스 배타 선택: '상관없음'을 고르면 나머지가 풀리고, 다른 것을 고르면 '상관없음'이 풀림
document.addEventListener('change', e => {
  const el = e.target;
  if (!el.matches?.('input[type=checkbox]') || !el.checked) return;
  const wrap = el.closest('[data-excl]');
  if (!wrap) return;
  const ex = wrap.dataset.excl;
  wrap.querySelectorAll('input[type=checkbox]').forEach(c => {
    if (c !== el && (el.value === ex || c.value === ex)) c.checked = false;
  });
});

// 범위 슬라이더 값 반영 (lo > hi 가 되면 움직인 쪽이 아닌 쪽을 밀어 줌)
function updateSpan(box) {
  if (!box) return;
  const lo = box.querySelector('[data-end="lo"]'), hi = box.querySelector('[data-end="hi"]');
  const a = Math.min(Number(lo.value), Number(hi.value)), b = Math.max(Number(lo.value), Number(hi.value));
  const hidden = box.querySelector('input[name]');
  hidden.value = JSON.stringify({ lo: a, hi: b });
  hidden.dataset.touched = '1';
  box.querySelector('.khu-span-fill').setAttribute('style', spanFillStyle(a, b, Number(box.dataset.min ?? -3), Number(box.dataset.max ?? 3), box.dataset.flip === '1'));
  box.classList.remove('khu-unset');
  box.querySelector('.khu-unset-hint')?.remove();
  box.closest('[data-fields]')?.classList.remove('khu-missing');
}
document.addEventListener('input', e => {
  if (e.target.matches?.('.khu-span input[type=range]')) updateSpan(e.target.closest('[data-span]'));
});
document.addEventListener('pointerdown', e => {
  if (e.target.matches?.('.khu-span input[type=range]')) updateSpan(e.target.closest('[data-span]'));
});

// 시각 칸(기상·취침 등): 범위 끝 시각을 고르면 분은 00 만 고를 수 있게 고정, 값은 HH:MM 으로 저장
function syncTimeSpan(box) {
  const hPart = box.querySelector('[data-part="h"]'), mPart = box.querySelector('[data-part="m"]');
  if (!hPart || !mPart) return;
  const mCombo = mPart.closest('.khu-combo');
  const end = box.dataset.spanEnd !== undefined ? Number(box.dataset.spanEnd) : null;
  const isEnd = end !== null && hPart.value !== '' && Number(hPart.value) === end;
  mCombo.querySelectorAll('li[data-v]').forEach(li => {
    const off = isEnd && li.dataset.v !== '00';
    li.dataset.off = off ? '1' : '';
    li.classList.toggle('hidden', off);
  });
  if (isEnd && mPart.value !== '00') { mPart.value = '00'; mCombo.querySelector('.khu-combo-input').value = '00'; }
  box.querySelector('input[name]').value = hPart.value && mPart.value ? `${hPart.value}:${mPart.value}` : '';
}
function syncTimeSpans(scope) { scope.querySelectorAll('[data-time-picker]').forEach(syncTimeSpan); }

// 시간 범위: 시작·끝을 둘 다 고르면 값이 생김
function updateHourRange(box) {
  const v = key => box.querySelector(`[data-part="${key}"]`).value;
  let from = v('from'), to = v('to');
  // 끝 시간은 범위 안에서 시작 시간 뒤에서만 고르게 (자정 넘김 범위는 시작→끝 순서로 계산)
  const s = Number(box.dataset.spanStart ?? 0);
  const pos = h => (h - s + 24) % 24;
  if (from && to && from !== 'any' && to !== 'any' && pos(Number(to)) < pos(Number(from))) {
    const toCombo = box.querySelector('[data-part="to"]').closest('.khu-combo');
    toCombo.querySelector('[data-part="to"]').value = '';
    toCombo.querySelector('.khu-combo-input').value = '';
    showToast('끝 시간은 시작 시간 뒤에서 골라 주세요.');
    to = '';
  }
  box.querySelector('input[name]').value = from && to ? JSON.stringify({ from, to }) : '';
  box.closest('[data-fields]')?.classList.remove('khu-missing');
}
document.addEventListener('change', e => {
  const box = e.target.closest?.('[data-hour-range]');
  if (box) updateHourRange(box);
});

// ---------- 취미 태그 입력 동작 ----------
const tagsOf = box => JSON.parse(box.querySelector('input[type=hidden]').value || '[]');

// 태그 칩 그리기 (× 버튼 포함)
function setTags(box, tags) {
  if (box.dataset.grouped) {   // 학과: 누른 순서가 아니라 드롭다운 순서(단과대 순서)로
    const order = JSON.parse(box.dataset.options || '[]');
    const at = x => (order.indexOf(x) < 0 ? 9999 : order.indexOf(x));
    tags = [...tags].sort((a, b) => at(a) - at(b));
  }
  box.querySelector('input[type=hidden]').value = JSON.stringify(tags);
  const plain = box.dataset.plain === '1';   // 중립 스타일: # 없이 회색 칩
  // 태그 줄: 박스 안에 있거나, 묶음 전체 아래(data-chips-for)에 있음
  const chipsEl = box.querySelector('.khu-tags-chips')
    || box.closest('[data-fields]')?.querySelector(`[data-chips-for="${box.dataset.tagsName}"]`);
  const chip = t => plain
    ? `<span class="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold">${esc(t)}` +
      `<button type="button" data-tag-remove="${esc(t)}" class="w-4 h-4 rounded-full hover:bg-slate-300 text-slate-500 font-bold leading-none" aria-label="${esc(t)} 삭제">×</button></span>`
    : `<span class="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-xs font-semibold">#${esc(t)}` +
      `<button type="button" data-tag-remove="${esc(t)}" class="w-4 h-4 rounded-full hover:bg-red-200 text-red-500 font-bold leading-none" aria-label="${esc(t)} 삭제">×</button></span>`;
  // 학과 칸: 아무것도 안 고르면 '상관없음'만 보임 (× 없음, 지울 수 없음). 상관없음 = 모든 단과대 (학과 조건 없음)
  chipsEl.innerHTML = !tags.length && box.dataset.anyDefault === '1'
    ? '<span class="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-xs font-semibold">상관없음</span>'
    : tags.map(chip).join('');
}

function hydrateTags(scope) {
  scope.querySelectorAll('.khu-tags').forEach(box => setTags(box, tagsOf(box)));
}

// 목록 그리기. grouped(학과): 검색어가 없으면 단과대 목록부터, 단과대를 고르면 그 학과만 (고른 학과엔 ✓)
// 그 밖(취미 등): 검색어와 맞는 항목 + 직접 추가
function filterTagList(box, keyword) {
  const ul = box.querySelector('.khu-tag-list');
  const all = JSON.parse(box.dataset.options || '[]');
  const groups = JSON.parse(box.dataset.groups || '{}');
  const selected = tagsOf(box);
  const selectedLc = selected.map(x => x.toLowerCase());
  const raw = keyword.trim(), k = raw.toLowerCase();
  const hover = box.dataset.plain === '1' ? 'hover:bg-slate-100' : 'hover:bg-red-50 hover:text-red-600';
  const row = 'p-2 cursor-pointer border-b border-slate-100 last:border-none';
  let html = '';

  if (box.dataset.cats && !k) {   // 카테고리 목록: 제목을 누르면 펼쳐지고 접힘
    const open = openCatsOf(box);
    html = JSON.parse(box.dataset.cats).map(c => {
      const items = all.filter(o => groups[o] === c);
      const n = items.filter(o => selectedLc.includes(o.toLowerCase())).length;
      const head = `<li data-cat="${esc(c)}" class="${row} ${hover} flex items-center justify-between font-semibold text-slate-700">
          <span>${open.has(c) ? '▾' : '▸'} ${esc(c)}</span>
          <span class="text-[11px] font-normal text-slate-400">${n ? `${n}개 선택 · ` : ''}${items.length}개</span></li>`;
      const body = open.has(c) ? items.map(o => {
        const on = selectedLc.includes(o.toLowerCase());
        return `<li data-tag="${esc(o)}" class="${row} pl-6 ${on ? 'bg-red-50 text-red-600 font-semibold' : hover}">${on ? '✓ ' : ''}${esc(o)}</li>`;
      }).join('') : '';
      return head + body;
    }).join('');
  } else {
    // 단과대를 골랐으면(검색어가 없을 때) 맨 위에 '전체 추가', 그 단과대 학과만 보임
    const picked = box.dataset.grouped && !k ? box.dataset.college : '';
    if (picked) html += `<li data-college-all="${esc(picked)}" class="${row} text-red-600 font-semibold hover:bg-red-50">“${esc(picked)}” 소속 학과 전체 추가 (상관없음)</li>`;
    // 취미 등 일반 목록은 고른 항목을 목록에서 뺌 / 학과(grouped)는 ✓ 로 남겨 둠
    const items = all.filter(o => o !== '상관없음' && (box.dataset.grouped || !selectedLc.includes(o.toLowerCase()))
      && (!k || o.toLowerCase().includes(k)) && (!picked || groups[o] === picked));
    html += items.slice(0, box.dataset.grouped ? 999 : 30).map(o => {
      const on = selectedLc.includes(o.toLowerCase());
      return `<li data-tag="${esc(o)}" class="${row} ${on ? 'bg-red-50 text-red-600 font-semibold' : hover}">${on ? '✓ ' : ''}${esc(o)}</li>`;
    }).join('');
    const exists = all.some(o => o.toLowerCase() === k) || selectedLc.includes(k);
    // 목록 전용(custom="0")이면 직접 추가 줄을 보이지 않음
    if (raw && !exists && box.dataset.custom !== '0') html += `<li data-tag="${esc(raw)}" class="p-2 text-red-600 font-semibold cursor-pointer hover:bg-red-50">“${esc(raw)}” 직접 추가</li>`;
    if (!html) html = '<li class="p-2 text-slate-400 text-center">' + (box.dataset.custom === '0' ? '검색 결과가 없어요.' : '검색 결과가 없어요. 직접 입력해서 추가해 보세요.') + '</li>';
  }
  ul.innerHTML = html;
  ul.classList.remove('hidden');
}

// 카테고리 펼침 상태 (칸마다 따로)
const openCatSets = new WeakMap();
const openCatsOf = box => { if (!openCatSets.has(box)) openCatSets.set(box, new Set()); return openCatSets.get(box); };

// 단과대 전체 추가: 소속 학과를 한꺼번에 넣음 (최대 개수 안에서)
function addCollegeAll(box, college) {
  const groups = JSON.parse(box.dataset.groups || '{}');
  const all = JSON.parse(box.dataset.options || '[]');
  const max = Number(box.dataset.max);
  const tags = tagsOf(box);
  const add = all.filter(o => groups[o] === college && !tags.includes(o));
  const room = max - tags.length;
  if (!add.length) return;
  setTags(box, [...tags, ...add.slice(0, Math.max(room, 0))]);
  box.querySelector('.khu-tags-msg').textContent = add.length > room ? `최대 ${max}개까지라 ${Math.max(room, 0)}개만 추가했어요.` : '';
  filterTagList(box, '');
}

// × 버튼이 있는 태그 줄에서 입력 칸 찾기 (학과 태그 줄은 박스 밖, 묶음 아래에 있을 수 있음)
function tagBoxOf(el) {
  return el.closest('.khu-tags')
    || el.closest('[data-fields]')?.querySelector(`.khu-tags[data-tags-name="${el.closest('[data-chips-for]')?.dataset.chipsFor}"]`);
}

// 태그 추가 (정리: 공백 줄이기, 앞의 # 제거, 소문자화 / 검사: 길이·중복·개수)
function addTag(box, raw) {
  const max = Number(box.dataset.max), maxLen = Number(box.dataset.maxlen);
  const input = box.querySelector('.khu-tags-input'), msg = box.querySelector('.khu-tags-msg');
  const t = String(raw ?? '').trim().replace(/\s+/g, ' ').replace(/^#+/, '').toLowerCase();
  const say = text => { msg.textContent = text; };
  if (!t) return say('');
  if (box.dataset.custom === '0' && !JSON.parse(box.dataset.options || '[]').some(o => o.toLowerCase() === t)) return say('목록에서 골라 주세요.');
  const tags = tagsOf(box);
  if (t.length > maxLen) return say(`태그는 ${maxLen}자 이하로 써 주세요.`);
  if (tags.some(x => x.toLowerCase() === t)) return say('이미 추가된 태그예요.');
  if (tags.length >= max) return say(`태그는 최대 ${max}개까지 추가할 수 있어요.`);
  const canon = box.dataset.grouped ? (JSON.parse(box.dataset.options || '[]').find(o => o.toLowerCase() === t) ?? t) : t;
  setTags(box, [...tags, canon]);
  refreshDependentOptions(box.closest('#profile-sections, #view-sections'));
  // 학과: 검색어와 목록을 그대로 둬서, 방금 고른 과가 ✓ 로 보이게 함 (전체 목록으로 바뀌지 않게)
  if (box.dataset.grouped) { filterTagList(box, input.value); } else { input.value = ''; box.querySelector('.khu-tag-list').classList.add('hidden'); }
  say('');
}

function removeTag(box, tag) {
  setTags(box, tagsOf(box).filter(x => x !== tag));
  box.querySelector('.khu-tags-msg').textContent = '';
  refreshDependentOptions(box.closest('#profile-sections, #view-sections'));
  if (box.dataset.grouped && !box.querySelector('.khu-tag-list').classList.contains('hidden')) filterTagList(box, box.querySelector('.khu-tags-input').value);
}

// 태그 전체 삭제 (× 버튼 줄의 '전체 삭제')
function clearTags(box) {
  setTags(box, []);
  box.querySelector('.khu-tags-msg').textContent = '';
  refreshDependentOptions(box.closest('#profile-sections, #view-sections'));
  box.querySelector('.khu-tag-list').classList.add('hidden');   // 전체 삭제 후에는 목록을 열지 않음 (학과 목록은 단과대 묶음부터 보여서 열리면 단과대 목록처럼 보임)
}

document.addEventListener('focusin', e => {
  if (!e.target.matches?.('.khu-tags-input')) return;
  filterTagList(e.target.closest('.khu-tags'), e.target.value);
});
document.addEventListener('input', e => {
  if (!e.target.matches?.('.khu-tags-input')) return;
  filterTagList(e.target.closest('.khu-tags'), e.target.value);
});
document.addEventListener('keydown', e => {
  if (!e.target.matches?.('.khu-tags-input')) return;
  const box = e.target.closest('.khu-tags');
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(box, e.target.value.replace(/,$/, ''));
  } else if (e.key === 'Backspace' && !e.target.value && box.dataset.grouped !== '1') {   // 학과 칸은 × 버튼으로만 지움
    const tags = tagsOf(box);
    if (tags.length) removeTag(box, tags[tags.length - 1]);
  }
});
// 입력칸을 다시 누르면 추천 목록 닫기 (누르기 전에 열려 있었는지 기록해 둠)
let tagListWasOpen = false;
document.addEventListener('pointerdown', e => {
  if (!e.target.matches?.('.khu-tags-input')) return;
  tagListWasOpen = !e.target.closest('.khu-tags').querySelector('.khu-tag-list').classList.contains('hidden');
}, true);
document.addEventListener('click', e => {
  // 입력칸(화살표 포함)을 누를 때마다 열기/닫기 토글 — 이미 포커스된 칸은 focusin 이 안 일어나므로 여기서 직접 연다
  if (e.target.matches?.('.khu-tags-input')) {
    const box = e.target.closest('.khu-tags');
    if (tagListWasOpen) box.querySelector('.khu-tag-list').classList.add('hidden');
    else filterTagList(box, e.target.value);
    tagListWasOpen = false;
    return;
  }
  const rm = e.target.closest?.('[data-tag-remove]');
  if (rm) return removeTag(tagBoxOf(rm), rm.dataset.tagRemove);
  const clr = e.target.closest?.('[data-tag-clear]');
  if (clr) return clearTags(clr.closest('[data-fields]').querySelector(`.khu-tags[data-tags-name="${clr.dataset.tagClear}"]`));
  // 카테고리 제목: 펼치기 / 접기
  const cat = e.target.closest?.('.khu-tag-list li[data-cat]');
  if (cat) {
    const box = cat.closest('.khu-tags'), open = openCatsOf(box), c = cat.dataset.cat;
    open.has(c) ? open.delete(c) : open.add(c);
    return filterTagList(box, box.querySelector('.khu-tags-input').value);
  }
  // 단과대 전체 추가
  const all = e.target.closest?.('.khu-tag-list li[data-college-all]');
  if (all) return addCollegeAll(all.closest('.khu-tags'), all.dataset.collegeAll);
  // 목록의 학과: 아직 안 고른 것은 추가, 고른 것(✓)은 누르면 빠짐
  const li = e.target.closest?.('.khu-tag-list li[data-tag]');
  if (li) {
    const box = li.closest('.khu-tags');
    return tagsOf(box).includes(li.dataset.tag) ? removeTag(box, li.dataset.tag) : addTag(box, li.dataset.tag);
  }
  // 태그 입력 바깥을 누르면 추천 목록 닫기
  if (!e.target.closest?.('.khu-tags')) document.querySelectorAll('.khu-tag-list').forEach(ul => ul.classList.add('hidden'));
});


// ---------- 탭 버튼 클릭 / 답변할 때마다 진행률 갱신 ----------
document.addEventListener('click', e => {
  const tab = e.target.closest?.('[data-profile-tab]');
  if (tab) return showProfileTab(tab.dataset.profileTab, tab.closest('[data-tab-bar]').dataset.target);
  if (e.target.closest?.('#profile-modal')) setTimeout(updateTabCounts, 0);   // 클릭으로 값이 바뀐 뒤 계산
});
['input', 'change'].forEach(type => document.addEventListener(type, e => {
  if (e.target.closest?.('#profile-modal')) setTimeout(updateTabCounts, 0);
}));