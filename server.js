const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'questionnaire_secret_key_2025',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

// ========== 加载人员信息 ==========
const personnelFile = path.join(__dirname, 'personnel.json');
let personnelMap = new Map();
try {
  const data = fs.readFileSync(personnelFile, 'utf8');
  const personnelList = JSON.parse(data);
  for (const p of personnelList) {
    personnelMap.set(p.employeeId, { name: p.name, employeeId: p.employeeId });
  }
  console.log(`已加载人员信息，共 ${personnelMap.size} 人`);
} catch (err) {
  console.error('读取 personnel.json 失败:', err.message);
  process.exit(1);
}

// ========== 加载题库 ==========
const questionsFile = path.join(__dirname, 'questions.json');
let questions = [];
let TOTAL_POINTS = 0;
try {
  const qData = fs.readFileSync(questionsFile, 'utf8');
  const qJson = JSON.parse(qData);
  questions = qJson.questions;
  TOTAL_POINTS = questions.reduce((sum, q) => sum + q.points, 0);
  console.log(`已加载题库，共 ${questions.length} 题，总分 ${TOTAL_POINTS}`);
} catch (err) {
  console.error('读取 questions.json 失败:', err.message);
  process.exit(1);
}

// ========== 数据库初始化（不重置） ==========
const db = new Database('questionnaire.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS results (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    answers_json TEXT,
    score INTEGER DEFAULT 0,
    submit_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('数据库表 results 已就绪');

// ========== API 路由 ==========
app.post('/api/login', (req, res) => {
  const { name, employeeId } = req.body;
  const user = personnelMap.get(employeeId);
  if (!user || user.name !== name) {
    return res.status(401).json({ success: false, message: '姓名或工号不匹配' });
  }
  req.session.employeeId = employeeId;
  req.session.userName = name;

  const stmt = db.prepare('SELECT submit_count, score FROM results WHERE employee_id = ?');
  let record = stmt.get(employeeId);
  if (!record) {
    db.prepare(`INSERT INTO results (employee_id, name, answers_json, score, submit_count) VALUES (?, ?, NULL, 0, 0)`).run(employeeId, name);
    record = { submit_count: 0, score: 0 };
  }
  res.json({
    success: true,
    user: { name, employeeId },
    submitCount: record.submit_count,
    remainingAttempts: Math.max(0, 2 - record.submit_count)
  });
});

app.get('/api/questions', (req, res) => {
  const publicQuestions = questions.map(q => ({
    id: q.id, type: q.type, text: q.text, options: q.options, points: q.points
  }));
  res.json({ success: true, questions: publicQuestions, totalPoints: TOTAL_POINTS });
});

app.get('/api/check-submit-limit', (req, res) => {
  if (!req.session.employeeId) return res.status(401).json({ success: false, message: '未登录' });
  const stmt = db.prepare('SELECT submit_count FROM results WHERE employee_id = ?');
  const result = stmt.get(req.session.employeeId);
  const submitCount = result ? result.submit_count : 0;
  res.json({ success: true, submitCount, remainingAttempts: Math.max(0, 2 - submitCount) });
});

// 提交答卷（关键修改）
app.post('/api/submit', (req, res) => {
  if (!req.session.employeeId) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  const employeeId = req.session.employeeId;
  const userName = req.session.userName;
  const userAnswers = req.body.answers;

  const stmt = db.prepare('SELECT submit_count, score, answers_json FROM results WHERE employee_id = ?');
  let record = stmt.get(employeeId);
  if (!record) {
    db.prepare(`INSERT INTO results (employee_id, name, answers_json, score, submit_count) VALUES (?, ?, NULL, 0, 0)`).run(employeeId, userName);
    record = { submit_count: 0, score: 0, answers_json: null };
  }

  if (record.submit_count >= 2) {
    return res.status(403).json({ success: false, message: '您已经用完两次答题机会，无法再次提交。' });
  }

  // 评分（内部计算，不直接返回对错）
  let newScore = 0;
  const resultsDetail = []; // 用于存储本次提交的明细（含标准答案，但返回时可能过滤）
  for (const q of questions) {
    const userAnswer = userAnswers[q.id];
    let isCorrect = false;
    if (q.type === 'single' || q.type === 'judge') {
      isCorrect = (userAnswer && userAnswer === q.answer);
    } else if (q.type === 'multi') {
      if (userAnswer && Array.isArray(userAnswer) && userAnswer.length === q.answer.length) {
        const sortedUser = [...userAnswer].sort();
        const sortedCorrect = [...q.answer].sort();
        isCorrect = sortedUser.every((v, i) => v === sortedCorrect[i]);
      }
    }
    const earnedPoints = isCorrect ? q.points : 0;
    newScore += earnedPoints;

    resultsDetail.push({
      id: q.id,
      text: q.text,
      type: q.type,
      userAnswer: (q.type === 'multi' && userAnswer) ? userAnswer.sort().join(',') : (userAnswer || '(未作答)'),
      correctAnswer: (q.type === 'multi') ? q.answer.sort().join(',') : q.answer,
      isCorrect: isCorrect,
      earnedPoints: earnedPoints,
      maxPoints: q.points
    });
  }

  const newSubmitCount = record.submit_count + 1;
  let finalAnswersJson = null;
  let finalScore = record.score;

  // 保留最高分逻辑
  if (newSubmitCount === 1) {
    finalAnswersJson = JSON.stringify(userAnswers);
    finalScore = newScore;
  } else if (newSubmitCount === 2) {
    if (newScore > record.score) {
      finalAnswersJson = JSON.stringify(userAnswers);
      finalScore = newScore;
    } else {
      finalAnswersJson = record.answers_json;
      finalScore = record.score;
    }
  }

  const updateStmt = db.prepare(`
    UPDATE results SET answers_json = ?, score = ?, submit_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = ?
  `);
  updateStmt.run(finalAnswersJson, finalScore, newSubmitCount, employeeId);

  const newRecord = stmt.get(employeeId);
  const remaining = Math.max(0, 2 - newRecord.submit_count);
  const showAnswers = (newRecord.submit_count === 2); // 只有两次机会都用完才显示答案

  let responseDetails = null;
  if (showAnswers) {
    // 第二次提交后，返回完整的对错明细
    responseDetails = resultsDetail;
  } else {
    // 第一次提交后，只返回用户答案，不透露正确性
    responseDetails = resultsDetail.map(r => ({
      id: r.id,
      text: r.text,
      type: r.type,
      userAnswer: r.userAnswer
    }));
  }

  res.json({
    success: true,
    totalScore: newRecord.score,
    totalPoints: TOTAL_POINTS,
    showAnswers: showAnswers,
    details: responseDetails,
    submitCount: newRecord.submit_count,
    remainingAttempts: remaining
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`问卷系统启动 http://localhost:${PORT}`);
});