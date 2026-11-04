// Vercel 진입점: Express 앱을 khumate-server 에서 가져옴
// (Vercel 이 Express 진입 파일을 찾을 수 있도록 express 를 직접 불러옴)
require('express');
module.exports = require('./khumate-server/server.js');