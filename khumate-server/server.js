const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase 클라이언트 초기화
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 1. 서버 실행 확인용 라우트
app.get('/', (req, res) => {
  if (req.url === '/favicon.ico') {
    return res.status(204).end();
  }
  res.send('Khumate 서버가 정상적으로 실행 중입니다!');
});

// 2. 조건에 맞는 룸메이트 게시글 목록 가져오기 API (성별, 거주기간 동일 조건 필터링)
app.get('/api/posts', async (req, res) => {
  const { gender, dorm_period } = req.query;

  let query = supabase.from('posts').select('*');

  // 사용자의 성별과 거주기간이 전달되면 동일한 조건의 데이터만 필터링
  if (gender) query = query.eq('gender', gender);
  if (dorm_period) query = query.eq('dorm_period', dorm_period);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 3. 새로운 게시글 및 프로필 등록 API
app.post('/api/posts', async (req, res) => {
  const newPost = req.body;

  const { data, error } = await supabase
    .from('posts')
    .insert([newPost]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true, data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});