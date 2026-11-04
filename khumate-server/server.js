// KHUMATE 서버
// 1) khumate-client 폴더의 화면 파일을 보여준다
// 2) .env 의 Supabase 공개 설정을 브라우저에 전달한다 (/supabase-config.js)
// 3) (선택) AI 분석 API: POST /api/match-ai  — 로그인한 사용자의 상위 20명을 AI로 보정·설명
//    AI 설정(CHATBOT_*)이 없으면 규칙 점수만 사용합니다. 로그인·메일 처리는 브라우저가 Supabase와 직접 합니다.

require('dotenv').config();
const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const matching = require('../khumate-client/matching.js');
const { SCHEMA_VERSION } = require('../khumate-client/profile-schema.js');
const ai = require('./ai.js');

const { SUPABASE_URL, SUPABASE_ANON_KEY, PORT = 3000 } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ .env 파일에 SUPABASE_URL 과 SUPABASE_ANON_KEY 를 적어 주세요. (.env.example 참고)');
  process.exit(1);
}

const CHATBOT = { baseUrl: process.env.CHATBOT_BASE_URL, apiKey: process.env.CHATBOT_API_KEY, model: process.env.CHATBOT_MODEL };
const AI_ENABLED = Boolean(CHATBOT.baseUrl && CHATBOT.apiKey && CHATBOT.model);
const TOP_N = 20;          // AI 정밀 분석 대상 (규칙 점수 상위 N명)
const AI_CHUNK = 20;       // AI 한 번에 보내는 사람 수 (TOP_N 이 20이면 한 번만 호출)
const aiLimit = new ai.RateLimiter(10, 60 * 60 * 1000);   // 사람당 1시간에 10번

const sameTime = (a, b) => new Date(a).getTime() === new Date(b).getTime();

const app = express();
app.use(express.json({ limit: '10kb' }));

// 브라우저용 설정 파일 (공개 키만 내보냄. service_role 키는 절대 쓰지 마세요)
app.get('/supabase-config.js', (req, res) => {
  res.type('application/javascript').send(
    `const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};\n` +
    `const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};\n` +
    `const LOGIN_EMAIL_DOMAIN = ${JSON.stringify(process.env.LOGIN_EMAIL_DOMAIN || 'khumate.app')};\n`
  );
});

// AI 분석 API
app.post('/api/match-ai', async (req, res) => {
  try {
    // 1) 로그인 확인: 브라우저가 보낸 토큰으로 사용자를 확인하고, 이후 DB 조회도 그 사용자 권한(RLS)으로만 함
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: '로그인이 필요해요.' });
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
    const uid = userData.user.id;

    if (!aiLimit.allow(uid)) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요. (1시간에 10번까지 가능)' });

    // 2) 내 글 확인 (최신 질문지로 올린 글만)
    const { data: me } = await sb.from('roommate_posts').select('*').eq('user_id', uid).maybeSingle();
    if (!me || (me.schema_version ?? 0) < SCHEMA_VERSION) {
      return res.status(400).json({ error: '최신 질문지로 글을 올린 뒤 이용할 수 있어요.' });
    }

    // 3) 같은 성별·같은 거주 기간 후보 → 규칙 점수 → 상위 20명
    const { data: candidates, error: candErr } = await sb.from('roommate_posts').select('*')
      .eq('gender', me.gender).eq('dorm_period', me.dorm_period)
      .gte('schema_version', SCHEMA_VERSION).neq('user_id', uid).limit(500);
    if (candErr) throw candErr;
    const top = matching.rankMatches(me, candidates || [], SCHEMA_VERSION).slice(0, TOP_N);
    if (!top.length) return res.json({ results: [], warning: null });

    // 4) 캐시 확인: 내 글과 상대 글이 둘 다 그대로일 때만 캐시 사용
    const byId = new Map(top.map(r => [r.post.user_id, r]));
    const { data: cached } = await sb.from('match_ai').select('*')
      .eq('viewer_id', uid).in('target_id', [...byId.keys()]);
    const fresh = new Map();
    for (const c of cached || []) {
      const r = byId.get(c.target_id);
      if (r && sameTime(c.viewer_updated, me.updated_at) && sameTime(c.target_updated, r.post.updated_at) && (c.prompt_ver ?? 1) >= ai.AI_PROMPT_VERSION) fresh.set(c.target_id, c);
    }

    // 5) 캐시에 없는 사람만 AI에 나눠서 물어봄 (20명씩 순서대로, 한 묶음이 실패해도 앞 결과는 살림)
    const missing = top.filter(r => !fresh.has(r.post.user_id));
    let warning = null;
    if (missing.length && !AI_ENABLED) {
      warning = 'AI 설정이 아직 없어서 규칙 점수만 보여드려요.';
    } else {
      for (let i = 0; i < missing.length; i += AI_CHUNK) {
        const chunk = missing.slice(i, i + AI_CHUNK);
        try {
          const text = await ai.callChatbot(CHATBOT, ai.buildMessages(me, chunk));
          const parsed = ai.parseAiResults(text, chunk.map(r => r.post.user_id));
          const rows = parsed.map(p => ({
            viewer_id: uid,
            target_id: p.user_id,
            viewer_updated: me.updated_at,
            target_updated: byId.get(p.user_id).post.updated_at,
            adjust: p.adjust, summary: p.summary, analysis: p.analysis, good: p.good, warn: p.warn, talk: p.talk,
            prompt_ver: ai.AI_PROMPT_VERSION,
          }));
          if (rows.length) {
            const { error: upErr } = await sb.from('match_ai').upsert(rows, { onConflict: 'viewer_id,target_id' });
            if (upErr) console.error('[match-ai] 캐시 저장 실패:', upErr.message);
            rows.forEach(r => fresh.set(r.target_id, r));
          }
        } catch (e) {
          console.error('[match-ai] AI 호출 실패:', e.message);
          warning = 'AI 분석 일부가 실패해서 가능한 결과만 보여드려요. 잠시 후 다시 시도해 주세요.';
          break;   // 이후 묶음은 건너뜀 (같은 원인으로 또 실패할 가능성이 큼)
        }
      }
    }

        // 6) 결과: AI 분석이 있으면 규칙 점수 + AI 보정, 없으면 규칙 점수만 (목록은 항상 표시)
    const results = top.map(r => {
      const c = fresh.get(r.post.user_id);
      const ruleScore = r.match.score;
      return {
        user_id: r.post.user_id,
        rule_score: ruleScore,
        adjust: c ? c.adjust : 0,
        final: c ? ai.finalScore(ruleScore, c.adjust) : ruleScore,
        summary: c ? c.summary : '',
        analysis: c?.analysis || '',
        good: c?.good || [],
        warn: c?.warn || [],
        talk: c?.talk || [],
        ai: Boolean(c),   // AI 분석이 있는지 (없으면 팝업에서 안내 문구)
      };
    });
    
    res.json({ results, warning });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
  }
});

// 화면 파일 제공
app.use(express.static(path.join(__dirname, '..', 'khumate-client')));

// 로컬에서 직접 실행할 때만 포트를 열고, Vercel 같은 곳에서는 app 을 함수로 넘겨 씀
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
    console.log(AI_ENABLED ? '🤖 AI 분석 사용 가능' : 'ℹ️ AI 설정이 없어서 규칙 점수만 사용합니다. (CHATBOT_* 설정 시 AI 사용)');
  });
}

module.exports = app;