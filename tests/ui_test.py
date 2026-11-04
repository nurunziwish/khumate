# python3 tests/ui_test.py — 가짜 Supabase 로 화면 동작을 검증 (필수 입력 / 매칭 정렬 / 불필요한 재조회 없음)
# Tailwind·Supabase CDN 은 네트워크 없이도 돌도록 스텁으로 대체합니다. (레이아웃 모양이 아니라 "동작"만 검증)
import json, subprocess, time, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'khumate-client')
PORT = 8123

base = dict(gender='남성', dorm_period='한 학기', dept='컴퓨터공학과', student_id='24', birth_year='2005',
  wake_time='08:00', sleep_time='23:30', room_stay='medium', stay_days=['월','화','수'], weekend_home='sometimes',
  shower_duration='15', noise_sensitivity=3, snoring='none', media_style='earphone', call_style='short_quiet',
  alarm_style='once', light_pref='dim_ok', temp_sensitivity=3, smell_sensitivity=3, clean_style='often', clean_freq=1,
  tidy_level='normal', trash_style='regular', ventilation='sometimes', hanger='none', indoor_eating='snack', fridge='none',
  roommate_relation=3, guest_overnight='no', smoking='none', smoking_mate='no',
  drinking='rarely', hobby=['러닝','독서'], shower_time=['morning'], college='공과대학')
def post(uid, title, up, v=2, g='남성', d='한 학기', **ans):
    a = {**base, **ans}
    return dict(user_id=uid, title=title, gender=g, dorm_period=d, dept=a['dept'], student_id=a['student_id'],
                birth_year=a['birth_year'], answers=a, schema_version=v, updated_at=up)
EXT = dict(wake_time='12:00', sleep_time='04:00', room_stay='low', weekend_home='often', noise_sensitivity=5, snoring='often',
           media_style='speaker_free', call_style='free', light_pref='bright_ok', temp_sensitivity=1, smell_sensitivity=5,
           clean_style='as_needed', tidy_level='relaxed', indoor_eating='meal', roommate_relation=5,
           guest_overnight='free', drinking='often', birth_year='2001')
ROWS = [
  post('u_twin',  'TWIN',   '2026-10-10T00:00:00Z', wake_time='08:30'),
  post('u_mid',   'MID',    '2026-10-12T00:00:00Z', tidy_level='relaxed', clean_style='as_needed', sleep_time='02:00'),
  post('u_far',   'FAR',    '2026-10-11T00:00:00Z', **EXT),
  post('u_smoke', 'SMOKER', '2026-10-13T00:00:00Z', smoking='cigarette', smoking_mate='any'),
  post('u_girl',  'GIRL',   '2026-10-14T00:00:00Z', g='여성', gender='여성'),
  post('u_year',  'YEAR',   '2026-10-14T00:00:00Z', d='연간(1년)', dorm_period='연간(1년)'),
  post('u_old',   'OLDVER', '2026-10-14T00:00:00Z', v=0),
]

STUB_SB = """
(function(){
  const rows = window.__ROWS; const log = window.__LOG = [];
  let session = window.__LOGGED_IN ? {user:{id:'me', email:'me@khu.ac.kr'}} : null;
  let cbs = [];
  const auth = {
    onAuthStateChange(cb){ cbs.push(cb); setTimeout(()=>cb('INITIAL_SESSION', session), 0); return {data:{subscription:{}}}; },
    getSession(){ return Promise.resolve({data:{session}}); },
    signOut(){ session=null; cbs.forEach(cb=>cb('SIGNED_OUT', null)); return Promise.resolve({}); },
    // 가짜 계정 저장소: 이메일 → 비밀번호. confirm email 이 꺼진 Supabase 처럼 가입하면 바로 세션을 돌려줌
    signUp({email, password}){
      const users = window.__USERS = window.__USERS || {};
      (window.__AUTHCALLS = window.__AUTHCALLS || []).push(['signUp', email]);
      if (users[email]) return Promise.resolve({data:{user:null, session:null}, error:{message:'User already registered'}});
      users[email] = password;
      session = {user:{id:'u_'+email, email}};
      setTimeout(()=>cbs.forEach(cb=>cb('SIGNED_IN', session)), 0);
      return Promise.resolve({data:{user:session.user, session}, error:null});
    },
    signInWithPassword({email, password}){
      const users = window.__USERS = window.__USERS || {};
      (window.__AUTHCALLS = window.__AUTHCALLS || []).push(['signIn', email]);
      if (users[email] !== password) return Promise.resolve({data:{}, error:{message:'Invalid login credentials'}});
      session = {user:{id:'u_'+email, email}};
      setTimeout(()=>cbs.forEach(cb=>cb('SIGNED_IN', session)), 0);
      return Promise.resolve({data:{user:session.user, session}, error:null});
    },
  };
  window.__fire = ev => cbs.forEach(cb => cb(ev, session));
  function from(table){
    const q = {f:[], desc:[], op:'select', single:false};
    const b = {
      select(c){ q.cols=c; return b; },
      eq(k,v){ q.f.push(r=>r[k]===v); q.desc.push('eq:'+k+'='+v); return b; },
      neq(k,v){ q.f.push(r=>r[k]!==v); q.desc.push('neq:'+k+'='+v); return b; },
      gte(k,v){ q.f.push(r=>r[k]>=v); q.desc.push('gte:'+k+'='+v); return b; },
      order(k,o){ q.ord=[k,!o||o.ascending!==false]; return b; },
      limit(n){ q.lim=n; return b; },
      maybeSingle(){ q.single=true; return b; },
      upsert(row){ q.op='upsert'; q.row=row; return b; },
      delete(){ q.op='delete'; return b; },
      then(res, rej){
        log.push({table, op:q.op, cols:q.cols, filters:q.desc, row:q.row});
        try {
          let out;
          if (q.op==='upsert'){ const i=rows.findIndex(r=>r.user_id===q.row.user_id); const now={...q.row, updated_at:new Date().toISOString()};
            if(i>=0) rows[i]={...rows[i],...now}; else rows.push(now); out={data:null,error:null}; }
          else if (q.op==='delete'){ for(let i=rows.length-1;i>=0;i--) if(q.f.every(f=>f(rows[i]))) rows.splice(i,1); out={data:null,error:null}; }
          else {
            let r = rows.filter(x=>q.f.every(f=>f(x)));
            if(q.ord) r.sort((a,b)=> (String(a[q.ord[0]])<String(b[q.ord[0]])?-1:1)*(q.ord[1]?1:-1));
            if(q.lim) r=r.slice(0,q.lim);
            if(q.cols && q.cols!=='*'){ const cs=q.cols.split(','); r=r.map(x=>Object.fromEntries(cs.map(c=>[c,x[c]]))); }
            out = {data: q.single ? (r[0]??null) : JSON.parse(JSON.stringify(r)), error:null};
          }
          Promise.resolve(out).then(res, rej);
        } catch(e){ Promise.reject(e).then(res, rej); }
      }
    };
    return b;
  }
  window.supabase = { createClient: () => ({ auth, from }) };
})();
"""
TAILWIND_STUB = "document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'.hidden{display:none!important}'}));"

FILL_JS = """
(a) => {
  const m = document.getElementById('profile-modal');
  const click = el => el.dispatchEvent(new MouseEvent('click', {bubbles:true}));
  for (const [k, v] of Object.entries(a)) {
    const radios = m.querySelectorAll(`input[type=radio][name="${k}"]`);
    const checks = m.querySelectorAll(`input[type=checkbox][name="${k}"]`);
    const named = m.querySelector(`input[name="${k}"]`);
    const tagBox = m.querySelector(`.khu-tags[data-tags-name="${k}"]`);
    if (tagBox) { tagBox.querySelectorAll('[data-tag-remove]').forEach(b => b.click()); v.forEach(t => addTag(tagBox, t)); continue; }
    if (radios.length) { [...radios].find(r => r.value === v).click(); }
    else if (checks.length) { v.forEach(x => { const c=[...checks].find(c=>c.value===x); if(!c.checked) c.click(); }); }
    else if (named && named.type === 'range') { named.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); named.value = v; named.dispatchEvent(new Event('input',{bubbles:true})); }
    else if (named && named.closest('[data-time-picker]')) {
      const [h, mi] = v.split(':'); const box = named.closest('[data-time-picker]');
      [['h',h],['m',mi]].forEach(([p,val]) => { const combo = box.querySelector(`[data-part="${p}"]`).closest('.khu-combo'); click(combo.querySelector(`li[data-v="${val}"]`)); });
    }
    else if (named && named.type === 'hidden') {   // select / combo
      const combo = named.closest('.khu-combo'); const li = combo.querySelector(`li[data-v="${v}"]`);
      if (li) click(li); else { const t = combo.querySelector('.khu-combo-input'); t.value = v; t.dispatchEvent(new Event('input',{bubbles:true})); }
    }
    else if (named) { named.value = v; named.dispatchEvent(new Event('input',{bubbles:true})); }
  }
}
"""

def titles(page):
    return page.eval_on_selector_all('#card-list-container h3', 'els => els.map(e => e.textContent.trim())')
def badges(page):
    return page.eval_on_selector_all('#card-list-container .ml-auto', 'els => els.map(e => e.textContent.trim()).filter(t => t.includes("매칭률"))')

ok = 0
def check(cond, msg):
    global ok
    if not cond:
        print('  ✗ FAIL:', msg); raise SystemExit(1)
    ok += 1; print('  ✓', msg)

server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def new_page(rows, logged_in=True):
            ctx = browser.new_context(viewport={'width': 480, 'height': 900})
            page = ctx.new_page()
            errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
            dialogs = []; page.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))
            def route(r):
                u = r.request.url
                if u.endswith('/supabase-config.js'):
                    r.fulfill(content_type='application/javascript', body='const SUPABASE_URL="http://x";const SUPABASE_ANON_KEY="k";const LOGIN_EMAIL_DOMAIN="khumate.app";')
                elif 'supabase-js' in u: r.fulfill(content_type='application/javascript', body=STUB_SB)
                elif 'tailwindcss' in u: r.fulfill(content_type='application/javascript', body=TAILWIND_STUB)
                elif u.startswith(f'http://localhost:{PORT}'): r.continue_()
                else: r.abort()
            page.route('**/*', route)
            page.add_init_script(f'window.__ROWS = {json.dumps(rows, ensure_ascii=False)}; window.__LOGGED_IN = {str(logged_in).lower()};')
            page.goto(f'http://localhost:{PORT}/index.html')
            page.wait_for_function('document.getElementById("card-list-container").querySelector("h3, p:not(.py-10)") || document.getElementById("card-list-container").innerText.includes("로그인")', timeout=5000)
            return page, errors, dialogs

        print('\n[시나리오 1] 내 글이 없는 로그인 사용자')
        page, errors, dialogs = new_page([dict(r) for r in ROWS])
        page.wait_for_timeout(300)
        check('내 정보를 작성하면' in page.inner_text('#card-list-container'), '안내 배너 표시')
        check(len(titles(page)) == 7, f'둘러보기: 전체 {len(titles(page))}개 카드')
        log = page.evaluate('window.__LOG')
        check(sum(1 for l in log if l['cols'] == '*') == 1, '내 글 조회 1번만 (인증 이벤트 중복 로딩 없음)')
        check(any(l['cols'] and 'answers' not in l['cols'] for l in log), '둘러보기는 answers 없이 가벼운 컬럼만 조회')
        n0 = len(log); page.evaluate('window.__fire("TOKEN_REFRESHED")'); page.evaluate('window.__fire("SIGNED_IN")'); page.wait_for_timeout(200)
        check(len(page.evaluate('window.__LOG')) == n0, '토큰 갱신/탭 복귀 이벤트에서 재조회 안 함')
        check('opacity-40' in page.get_attribute('#sort-match', 'class'), '내 글 없으면 매칭순 버튼 비활성 표시')

        print('\n[시나리오 2] 필수 입력 검사')
        page.evaluate('openProfileEdit()')
        check(page.evaluate('document.querySelectorAll("#profile-modal input[type=radio]:checked").length') == 0, '라디오 기본 선택 없음')
        check(page.evaluate('[...document.querySelectorAll("#profile-modal .khu-slider")].every(s => s.classList.contains("khu-unset"))'), '슬라이더 전부 미응답 상태')
        page.evaluate('document.querySelector("#profile-modal button[onclick=\'confirmPublish()\']").click()')
        check(any('아직 답하지 않은 항목' in d for d in dialogs), '빈 폼 게시 시 안내 알림')
        check(page.evaluate('document.getElementById("confirm-modal").classList.contains("hidden")'), '확인 모달은 열리지 않음')
        check(page.evaluate('document.querySelectorAll("#profile-modal .khu-missing").length') > 5, '빈 항목 강조 표시')

        print('\n[시나리오 2-2] 저장하기(임시 저장) → 다시 열면 복원, 목록/DB는 그대로')
        n_up = len([l for l in page.evaluate('window.__LOG') if l['op'] == 'upsert'])
        page.evaluate(FILL_JS, {'gender': '여성', 'sleep_time': '22:00', 'temp_sensitivity': 2, 'hobby': ['축구']})
        page.fill('#post-title', '임시 제목')
        page.evaluate('document.querySelector("#profile-modal button[onclick=\'saveDraft()\']").click()')
        check(page.evaluate('document.getElementById("profile-modal").classList.contains("hidden")'), '저장하기 → 모달 닫힘')
        check('임시 저장했어요' in page.inner_text('#khu-toast'), '안내 문구 표시')
        check(len([l for l in page.evaluate('window.__LOG') if l['op'] == 'upsert']) == n_up, 'DB에는 아무것도 올라가지 않음')
        check(page.evaluate('localStorage.getItem("khumate-draft:me")') is not None, '브라우저에 임시 저장됨')
        page.evaluate('openProfileEdit()')
        check(page.evaluate('document.querySelector("#profile-modal input[name=gender]:checked")?.value') == '여성', '성별 복원')
        check(page.evaluate('document.querySelector("#profile-modal input[name=sleep_time]").value') == '22:00', '취침 시간 복원')
        check(page.evaluate('document.querySelector("#profile-modal input[name=temp_sensitivity]").dataset.touched') == '1', '건드린 슬라이더는 응답 상태로 복원')
        check(page.evaluate('document.querySelector("#profile-modal input[name=noise_sensitivity]").dataset.touched') == '0', '안 건드린 슬라이더는 미응답 그대로')
        check(page.evaluate('document.querySelectorAll("#profile-modal input[name=clean_freq]:checked").length') == 0, '안 고른 라디오는 비어 있음')
        check(page.input_value('#post-title') == '임시 제목' and page.evaluate('document.querySelector("#profile-modal input[name=hobby]").value') == '["축구"]', '제목·취미 복원')

        answers_wo_noise = {k: v for k, v in base.items() if k != 'noise_sensitivity'}
        page.evaluate(FILL_JS, answers_wo_noise)
        dialogs.clear()
        page.evaluate('document.querySelector("#profile-modal button[onclick=\'confirmPublish()\']").click()')
        check(len(dialogs) == 1 and '소음 민감도' in dialogs[0], f'슬라이더 하나만 안 건드려도 걸림: {dialogs[:1]}')
        page.evaluate('document.querySelector("#profile-modal input[name=noise_sensitivity]").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))')
        dialogs.clear()
        page.evaluate('document.querySelector("#profile-modal button[onclick=\'confirmPublish()\']").click()')
        check(not dialogs and not page.evaluate('document.getElementById("confirm-modal").classList.contains("hidden")'), '손잡이를 그대로 눌러도(가운데 값) 답변으로 인정 → 확인 모달 열림')

        print('\n[시나리오 2-3] 취미 태그 입력 (검색·직접 추가·삭제)')
        page.click('#profile-modal .khu-tags-input')
        check(page.is_visible('#profile-modal .khu-tag-list'), '입력칸을 누르면 추천 목록이 뜸')
        page.fill('#profile-modal .khu-tags-input', '요')
        check('요리' in page.inner_text('#profile-modal .khu-tag-list') and '요가' in page.inner_text('#profile-modal .khu-tag-list'), '검색하면 목록이 걸러짐')
        page.fill('#profile-modal .khu-tags-input', '러')
        check('러닝' not in page.inner_text('#profile-modal .khu-tag-list'), '이미 고른 취미(러닝)는 목록에서 빠짐')
        page.fill('#profile-modal .khu-tags-input', '요리'); page.press('#profile-modal .khu-tags-input', 'Enter')
        check(page.evaluate('JSON.parse(document.querySelector("#profile-modal input[name=hobby]").value)').count('요리') == 1, 'Enter 로 태그 추가')
        check(page.is_visible('#profile-modal .khu-tags-chips [data-tag-remove="요리"]'), '추가된 태그에 × 버튼이 있음')
        page.fill('#profile-modal .khu-tags-input', '요리'); page.press('#profile-modal .khu-tags-input', 'Enter')
        check('이미 추가' in page.inner_text('#profile-modal .khu-tags-msg'), '중복 태그는 막음')
        page.fill('#profile-modal .khu-tags-input', '나만의취미'); page.press('#profile-modal .khu-tags-input', 'Enter')
        check('나만의취미' in page.evaluate('document.querySelector("#profile-modal input[name=hobby]").value'), '목록에 없는 취미도 직접 추가됨')
        page.fill('#profile-modal .khu-tags-input', 'a' * 11); page.press('#profile-modal .khu-tags-input', 'Enter')
        check('10자 이하' in page.inner_text('#profile-modal .khu-tags-msg'), '10자 넘는 태그는 막음')
        page.click('#profile-modal [data-tag-remove="요리"]')
        check('요리' not in page.evaluate('document.querySelector("#profile-modal input[name=hobby]").value'), '× 로 태그 삭제')
        page.click('#profile-modal h3')
        check(not page.is_visible('#profile-modal .khu-tag-list'), '바깥을 누르면 추천 목록이 닫힘')

        print('\n[시나리오 3] 게시 → 매칭 목록')
        page.evaluate('executePublish()'); page.wait_for_timeout(500)
        check(page.evaluate('localStorage.getItem("khumate-draft:me")') is None, '게시 성공 후 임시 저장 삭제')
        up = [l for l in page.evaluate('window.__LOG') if l['op'] == 'upsert'][-1]['row']
        check(up['schema_version'] == 2 and up['answers']['noise_sensitivity'] == 3 and up['answers']['wake_time'] == '08:00', 'schema_version=1, 슬라이더/시간 값 저장')
        check(up['student_id'] == '24' and up['birth_year'] == '2005' and up['dept'] == '컴퓨터공학과', '기본 프로필 컬럼 저장')
        q = [l for l in page.evaluate('window.__LOG') if l['cols'] == '*' and 'eq:gender=남성' in l['filters']]
        check(q and 'eq:dorm_period=한 학기' in q[-1]['filters'] and 'gte:schema_version=2' in q[-1]['filters'], '후보 조회에 성별·거주기간·질문지 버전 조건이 DB 쿼리로 들어감')
        t = titles(page)
        print('     화면 순서:', t, badges(page))
        check(t[0] != 'GIRL' and 'GIRL' not in t and 'YEAR' not in t and 'OLDVER' not in t, '다른 성별/거주기간/이전 질문지 글은 목록에서 제외')
        check(sorted(t[1:]) == sorted(['TWIN', 'MID', 'FAR', 'SMOKER']) and len(t) == 5, '내 글 + 후보 4명')
        scores = [int(b.split('매칭률')[1].strip().rstrip('%')) for b in badges(page)]
        check(scores == sorted(scores, reverse=True), f'매칭률 내림차순: {scores}')
        check(t[1] == 'TWIN' and t[-1] in ('FAR', 'SMOKER'), '비슷한 사람이 1등')
        check('⚠' in page.eval_on_selector_all('#card-list-container .ml-auto', 'els => els.map(e=>e.textContent).join("|")'), '흡연 충돌 카드에 ⚠ 표시')
        check('관련순' in page.inner_text('#sort-match') and '최신순' in page.inner_text('#sort-latest'), '정렬 버튼 이름: 최신순 · 관련순')
        check('흡연 조건 충돌' not in page.inner_text('#card-list-container'), '카드에는 점수 배지만 표시')

        print('\n[시나리오 3-2] 카드 클릭 → 읽기 전용 답안 보기')
        page.click('#card-list-container [data-uid="me"]'); page.wait_for_timeout(300)
        check(page.is_visible('#view-modal'), '내 카드도 눌러서 답안 보기가 열림')
        check(page.is_disabled('#view-msg-btn'), '내 글이면 쪽지 버튼 비활성화')
        check(page.evaluate('document.querySelectorAll("#view-sections input:not([disabled])").length') == 0, '내 글도 읽기 전용')
        page.click('#view-modal button:has-text("닫기")'); page.wait_for_timeout(100)
        page.click('#card-list-container [data-uid="u_twin"]'); page.wait_for_timeout(300)
        check(page.is_visible('#view-modal'), '카드를 누르면 답안 보기 모달이 뜸')
        check(page.is_enabled('#view-msg-btn'), '다른 사람 글이면 쪽지 버튼 활성화')
        page.click('#view-msg-btn'); page.wait_for_timeout(100)
        check('준비 중' in page.inner_text('body'), '쪽지 버튼은 아직 준비 중 안내만')
        check(page.inner_text('#view-title') == 'TWIN', '글 제목 표시')
        check('학번' in page.inner_text('#view-meta') and '남성' in page.inner_text('#view-meta'), '메타 정보(성별·학번 등) 표시')
        check(page.evaluate('document.querySelectorAll("#view-sections > div").length') == page.evaluate('PROFILE_SCHEMA.length'), '내 정보 수정 폼과 같은 섹션 구성')
        check(page.evaluate('document.querySelector("#view-sections input[name=gender]:checked")?.value') == '남성', '답안 값 표시 (성별)')
        check(page.evaluate('document.querySelector("#view-sections input[name=sleep_time]").value') == '23:30', '답안 값 표시 (취침 시간)')
        check(page.evaluate('document.querySelector("#view-sections input[name=noise_sensitivity]").dataset.touched') == '1', '답한 슬라이더는 응답 상태로 표시')
        check(page.evaluate('[...document.querySelectorAll("#view-sections input, #view-sections select, #view-sections button")].every(el => el.disabled)'), '모든 입력칸 비활성화')
        page.evaluate('document.querySelector("#view-sections input[name=gender][value=\\"여성\\"]").click()')
        check(page.evaluate('document.querySelector("#view-sections input[name=gender]:checked")?.value') == '남성', '읽기 전용: 값을 바꿀 수 없음')
        check(page.evaluate('document.getElementById("profile-modal").classList.contains("hidden")'), '내 정보 수정 모달은 열리지 않음 (별도 창)')
        page.click('#view-modal button:has-text("닫기")'); page.wait_for_timeout(100)
        check(not page.is_visible('#view-modal'), '닫기 버튼으로 닫힘')
        page.click('#card-list-container [data-uid="u_far"]'); page.wait_for_timeout(200)
        check(page.evaluate('document.getElementById("view-sections").querySelectorAll("input").length') > 0, '둘러보기 카드도 열림')
        page.keyboard.press('Escape'); page.wait_for_timeout(100)
        check(not page.is_visible('#view-modal'), 'Esc 키로 닫힘')
        check(not errors, f'자바스크립트 오류 없음 {errors}')

        print('\n[시나리오 3-3] AI 분석 버튼 (서버 응답을 가짜로 흉내)')
        def ai_route(route):
            route.fulfill(content_type='application/json', body=json.dumps({'results': [
                {'user_id': 'u_far', 'rule_score': 40, 'adjust': 10, 'final': 50, 'summary': '취미가 겹치는 편이에요', 'good': ['취미 겹침'], 'warn': []}
            ], 'warning': None}))
        page.route('**/api/match-ai', ai_route)
        check(page.is_visible('#ai-open-btn'), '관련순 목록에서 AI 정밀 분석 버튼 보임')
        page.click('#ai-open-btn'); page.wait_for_timeout(150)
        check(page.is_visible('#ai-modal'), 'AI 정밀 분석 팝업 열림')
        check('이렇게 분석해요' in page.inner_text('#ai-modal-body'), '분석 전 안내 문구')
        page.click('#ai-run-btn'); page.wait_for_timeout(400)
        body = page.inner_text('#ai-modal-body')
        check('취미가 겹치는 편이에요' in body and '50점' in body, 'AI 결과 카드에 최종 점수·설명 표시 (40+10=50)')
        check('다시 분석' in page.inner_text('#ai-run-btn'), '결과 후 버튼 문구 변경')
        check(page.is_visible('#card-list-container [data-uid="u_far"]'), '목록 카드는 그대로 유지')
        page.click('#ai-modal-body [onclick*="u_far"]'); page.wait_for_timeout(200)
        check(page.is_visible('#view-modal') and '취미가 겹치는 편이에요' in page.inner_text('#view-ai'), 'AI 카드 클릭 시 답안 보기에 설명 표시')
        page.keyboard.press('Escape'); page.wait_for_timeout(100)
        check(not page.is_visible('#view-modal') and page.is_visible('#ai-modal'), 'Esc 는 위 창(답안 보기)만 닫음')
        page.keyboard.press('Escape'); page.wait_for_timeout(100)
        check(not page.is_visible('#ai-modal'), 'Esc 한 번 더 누르면 AI 팝업 닫힘')
        page.unroute('**/api/match-ai')

        print('\n[시나리오 4] 다시 열면 저장한 답안으로 채워짐 / 삭제')
        page.evaluate('openProfileEdit()')
        check(page.evaluate('document.querySelector("#profile-modal input[name=gender]:checked")?.value') == '남성', '성별 복원')
        check(page.evaluate('document.querySelector("#profile-modal input[name=sleep_time]").value') == '23:30', '시간 복원')
        check(page.evaluate('document.querySelector("#profile-modal input[name=noise_sensitivity]").dataset.touched') == '1', '슬라이더 응답 상태 복원')
        page.fill('#post-title', '수정 중인 제목')
        page.evaluate('document.querySelector("#profile-modal button[onclick=\'saveDraft()\']").click()')
        n_up2 = len([l for l in page.evaluate('window.__LOG') if l['op'] == 'upsert'])
        page.evaluate('openProfileEdit()')
        check(page.input_value('#post-title') == '수정 중인 제목', '게시된 글이 있어도 임시 저장 내용이 우선 복원')
        check(n_up2 == len([l for l in page.evaluate('window.__LOG') if l['op'] == 'upsert']), '임시 저장은 게시된 글을 수정하지 않음')
        page.evaluate('closeProfileEdit()')
        page.evaluate('window.confirm = () => true'); page.evaluate('removeMyPost()'); page.wait_for_timeout(300)
        check('내 정보를 작성하면' in page.inner_text('#card-list-container'), '삭제 후 다시 둘러보기 모드')
        check(not errors, f'자바스크립트 오류 없음 {errors}')

        print('\n[시나리오 5] 이전 버전(v0) 글을 가진 사용자')
        old_me = post('me', 'MY OLD', '2026-10-01T00:00:00Z', v=0)
        page, errors, dialogs = new_page([old_me] + [dict(r) for r in ROWS])
        page.wait_for_timeout(300)
        check('질문지가 새로워졌어요' in page.inner_text('#card-list-container'), '업데이트 안내 배너')
        page.evaluate('openProfileEdit()')
        check(page.evaluate('document.querySelectorAll("#profile-modal input[type=radio]:checked").length') == 0, '예전 기본값은 채우지 않고 빈 폼으로 시작')
        check(not errors, f'자바스크립트 오류 없음 {errors}')

        print('\n[시나리오 6] 로그아웃 상태')
        page, errors, dialogs = new_page([dict(r) for r in ROWS], logged_in=False)
        check('로그인하면 룸메이트 글을 볼 수 있어요' in page.inner_text('#card-list-container'), '로그인 안내')

        print('\n[시나리오 7] 아이디/비밀번호 가입·로그인 (메일 인증 없음)')
        msg = lambda: page.inner_text('#auth-msg')
        def signup(i, pw, pw2=None):
            page.fill('#signup-id', i); page.fill('#signup-pw', pw); page.fill('#signup-pw2', pw if pw2 is None else pw2)
            page.evaluate('signUp()'); page.wait_for_timeout(250)
        page.evaluate("openAuthModal('signup')")
        check(page.evaluate('document.getElementById("auth-view-code")') is None, '인증코드 화면이 없음')
        signup('ab', 'password1');            check('4~20자' in msg(), f'너무 짧은 아이디 거부: {msg()}')
        signup('한글아이디', 'password1');      check('4~20자' in msg(), '한글 아이디 거부')
        signup('na_ryeon1', 'short');          check('8자 이상' in msg(), '짧은 비밀번호 거부')
        signup('na_ryeon1', 'password1', 'x'); check('일치하지' in msg(), '비밀번호 확인 불일치 거부')
        check(page.evaluate('window.__AUTHCALLS') is None, '검사에 걸리면 서버 호출 안 함')
        signup('Na_Ryeon1', 'password1')   # 대문자는 소문자로 바뀜
        check(page.evaluate('window.__AUTHCALLS[0][1]') == 'na_ryeon1@khumate.app', '아이디가 내부 메일 주소(소문자)로 변환되어 가입')
        check(page.evaluate('document.getElementById("auth-modal").classList.contains("hidden")'), '가입 즉시 로그인되어 모달 닫힘 (인증 단계 없음)')
        page.wait_for_timeout(300)
        check(page.inner_text('#auth-btn') == '로그아웃' and 'na_ryeon1' in page.get_attribute('#auth-btn', 'title'), '헤더에 로그아웃/아이디 표시')
        page.evaluate('logout()'); page.wait_for_timeout(300)
        page.evaluate("openAuthModal('signup')"); signup('na_ryeon1', 'password1')
        check('이미 사용 중인 아이디' in msg(), '중복 아이디 안내')
        page.evaluate("showAuthView('login')")
        page.fill('#login-id', 'na_ryeon1'); page.fill('#login-pw', 'wrongpass'); page.evaluate('login()'); page.wait_for_timeout(250)
        check('맞지 않아요' in msg(), '틀린 비밀번호 안내')
        page.fill('#login-pw', 'password1'); page.press('#login-pw', 'Enter'); page.wait_for_timeout(300)
        check(page.inner_text('#auth-btn') == '로그아웃', 'Enter 키로 로그인 성공')
        check(not errors, f'자바스크립트 오류 없음 {errors}')
        browser.close()
finally:
    server.terminate()
print(f'\n{ok} checks passed')
