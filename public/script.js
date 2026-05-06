// 全局变量
let questionsData = [];
let totalPoints = 100;
let currentUser = null;
let remainingAttempts = 2;      // 剩余提交次数
let submitCount = 0;            // 已提交次数

// DOM 元素
const loginSection = document.getElementById('login-section');
const questionnaireSection = document.getElementById('questionnaire-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const userNameSpan = document.getElementById('user-name-display');
const userIdSpan = document.getElementById('user-id-display');
const attemptInfoDiv = document.getElementById('attempt-info');
const form = document.getElementById('questionnaire-form');
const questionsContainer = document.getElementById('questions-container');
const resultContainer = document.getElementById('result-container');
const scoreValueSpan = document.getElementById('score-value');
const resultDetailsDiv = document.getElementById('result-details');
const resetBtn = document.getElementById('reset-btn');
const backToFormBtn = document.getElementById('back-to-form');
const submitCountInfo = document.getElementById('submit-count-info');

// ========== 登录处理 ==========
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('login-name').value.trim();
    const employeeId = document.getElementById('login-employee-id').value.trim();

    if (!name || !employeeId) {
        showLoginError('请填写姓名和工号');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, employeeId })
        });
        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            submitCount = data.submitCount;
            remainingAttempts = data.remainingAttempts;
            // 显示问卷界面
            loginSection.style.display = 'none';
            questionnaireSection.style.display = 'block';
            userNameSpan.textContent = currentUser.name;
            userIdSpan.textContent = currentUser.employeeId;
            updateAttemptDisplay();

            // 加载题目
            await loadQuestions();
        } else {
            showLoginError(data.message);
        }
    } catch (err) {
        showLoginError('网络错误，请重试');
    }
});

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
    setTimeout(() => {
        loginError.style.display = 'none';
    }, 3000);
}

// 更新剩余次数显示
function updateAttemptDisplay() {
    if (remainingAttempts === 2) {
        attemptInfoDiv.innerHTML = '✅ 您有 <strong>两次</strong> 答题机会（可再提交一次覆盖结果）';
    } else if (remainingAttempts === 1) {
        attemptInfoDiv.innerHTML = '⚠️ 您已提交过一次，还剩 <strong>一次</strong> 答题机会（本次将覆盖上次结果）';
    } else {
        attemptInfoDiv.innerHTML = '❌ 您已用完两次答题机会，无法再次提交。<br>如需查看结果，请重新登录。';
        // 禁用提交按钮
        const submitBtn = document.querySelector('.submit-btn');
        if (submitBtn) submitBtn.disabled = true;
    }
}

// 登出
logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    // 重置界面
    loginSection.style.display = 'block';
    questionnaireSection.style.display = 'none';
    loginForm.reset();
    loginError.style.display = 'none';
    currentUser = null;
    // 清空问卷内容
    questionsContainer.innerHTML = '';
    resultContainer.style.display = 'none';
    form.style.display = 'block';
});

// ========== 加载题目（同前，略作调整） ==========
async function loadQuestions() {
    try {
        const response = await fetch('/api/questions');
        const data = await response.json();
        if (data.success) {
            questionsData = data.questions;
            totalPoints = data.totalPoints;
            renderQuestions(questionsData);
        } else {
            questionsContainer.innerHTML = '<div class="loading">加载失败，请刷新</div>';
        }
    } catch (error) {
        console.error(error);
        questionsContainer.innerHTML = '<div class="loading">网络错误</div>';
    }
}

function renderQuestions(questions) {
    if (!questions || questions.length === 0) return;
    let html = '';
    const optionLetters = ['A', 'B', 'C', 'D'];
    questions.forEach(q => {
        let optionsHtml = '';
        if (q.type === 'single') {
            optionsHtml = q.options.map((opt, idx) => {
                const letter = optionLetters[idx];
                return `<div class="option-item"><input type="radio" name="q_${q.id}" value="${letter}" id="q_${q.id}_${letter}"><label for="q_${q.id}_${letter}"><strong>${letter}.</strong> ${escapeHtml(opt)}</label></div>`;
            }).join('');
        } else if (q.type === 'multi') {
            optionsHtml = q.options.map((opt, idx) => {
                const letter = optionLetters[idx];
                return `<div class="option-item"><input type="checkbox" name="q_${q.id}" value="${letter}" id="q_${q.id}_${letter}"><label for="q_${q.id}_${letter}"><strong>${letter}.</strong> ${escapeHtml(opt)}</label></div>`;
            }).join('');
        } else if (q.type === 'judge') {
            optionsHtml = `<div class="option-item"><input type="radio" name="q_${q.id}" value="T" id="q_${q.id}_T"><label for="q_${q.id}_T"><strong>✓ 正确</strong></label></div>
                           <div class="option-item"><input type="radio" name="q_${q.id}" value="F" id="q_${q.id}_F"><label for="q_${q.id}_F"><strong>✗ 错误</strong></label></div>`;
        }
        const typeText = { single: '单选题', multi: '多选题', judge: '判断题' };
        html += `<div class="question-card ${q.type}" data-id="${q.id}">
                    <div class="question-title">
                        <span class="q-number">第 ${q.id} 题</span>
                        <span class="q-type">${typeText[q.type]}</span>
                        <span class="q-points">${q.points}分</span>
                    </div>
                    <div class="question-text">${escapeHtml(q.text)}</div>
                    <div class="options">${optionsHtml}</div>
                </div>`;
    });
    questionsContainer.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// 收集答案
function collectAnswers() {
    const answers = {};
    for (const q of questionsData) {
        const elements = document.getElementsByName(`q_${q.id}`);
        if (!elements.length) continue;
        if (q.type === 'single' || q.type === 'judge') {
            let selected = null;
            for (const el of elements) {
                if (el.checked) { selected = el.value; break; }
            }
            answers[q.id] = selected;
        } else if (q.type === 'multi') {
            const selected = [];
            for (const el of elements) {
                if (el.checked) selected.push(el.value);
            }
            answers[q.id] = selected.length ? selected : null;
        }
    }
    return answers;
}

// 重置答案
function resetAllAnswers() {
    for (const q of questionsData) {
        const elements = document.getElementsByName(`q_${q.id}`);
        for (const el of elements) {
            if (el.type === 'radio' || el.type === 'checkbox') el.checked = false;
        }
    }
}

// 提交问卷
async function submitQuestionnaire(event) {
    event.preventDefault();

    if (remainingAttempts <= 0) {
        alert('您已经没有答题机会了！');
        return;
    }

    const userAnswers = collectAnswers();
    // 可选：未作答提醒
    let unanswered = 0;
    for (const q of questionsData) {
        const ans = userAnswers[q.id];
        if (!ans || (Array.isArray(ans) && ans.length === 0)) unanswered++;
    }
    if (unanswered > 0 && !confirm(`还有 ${unanswered} 题未作答，确定提交吗？`)) return;

    const submitBtn = document.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = '提交中...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: userAnswers })
        });
        const data = await response.json();
        if (data.success) {
            // 更新剩余次数
            remainingAttempts = data.remainingAttempts;
            submitCount = data.submitCount;
            updateAttemptDisplay();

            // 显示结果
            displayResults(data);
            form.style.display = 'none';
            resultContainer.style.display = 'block';
            if (submitCountInfo) {
                submitCountInfo.innerHTML = `您已提交 ${submitCount} 次，剩余 ${remainingAttempts} 次机会。`;
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert(data.message || '提交失败');
            if (data.message && data.message.includes('两次答题机会')) {
                updateAttemptDisplay();
            }
        }
    } catch (err) {
        alert('网络错误，提交失败');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = (remainingAttempts <= 0);
    }
}

function displayResults(data) {
  const { totalScore, totalPoints, showAnswers, details, submitCount, remainingAttempts } = data;
  scoreValueSpan.textContent = totalScore;

  let detailsHtml = '';
  if (!showAnswers) {
    // 第一次提交：仅显示提示信息
    detailsHtml = `
      <div class="info-message">
        <p>✅ 您已提交第 ${submitCount} 次答卷，得分 ${totalScore} 分。</p>
        <p>⚠️ 您还有 ${remainingAttempts} 次答题机会。</p>
        <p>📘 本次不显示正确答案。请您再次提交后，将可以查看标准答案及详细分析。</p>
      </div>
    `;
  } else {
    // 第二次提交：显示所有详细答案对比
    detailsHtml = details.map(item => {
      const statusClass = item.isCorrect ? 'correct' : 'wrong';
      const statusBadge = item.isCorrect ? '<span class="correct-badge">✓ 正确</span>' : '<span class="wrong-badge">✗ 错误</span>';
      let userAnswerDisplay = item.userAnswer;
      let correctAnswerDisplay = item.correctAnswer;
      if (item.type === 'multi') {
        if (userAnswerDisplay !== '(未作答)') userAnswerDisplay = `[${userAnswerDisplay}]`;
        correctAnswerDisplay = `[${correctAnswerDisplay}]`;
      }
      return `
        <div class="result-item ${statusClass}">
          <div class="result-header-line">
            <span>第 ${item.id} 题</span>
            <span>${statusBadge} (${item.earnedPoints}/${item.maxPoints}分)</span>
          </div>
          <div class="result-question">📝 ${escapeHtml(item.text)}</div>
          <div class="result-answer">
            <div><strong>您的答案：</strong> ${escapeHtml(userAnswerDisplay)}</div>
            <div><strong>标准答案：</strong> ${escapeHtml(correctAnswerDisplay)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  resultDetailsDiv.innerHTML = detailsHtml;
  // 更新剩余次数显示
  if (submitCountInfo) {
    submitCountInfo.innerHTML = `您已提交 ${submitCount} 次，剩余 ${remainingAttempts} 次机会。`;
  }
  // 如果剩余次数为0，禁用提交按钮（前端已做，但再次确保）
  if (remainingAttempts === 0) {
    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) submitBtn.disabled = true;
  }
}

function backToForm() {
    resetAllAnswers();
    form.style.display = 'block';
    resultContainer.style.display = 'none';
    form.scrollIntoView({ behavior: 'smooth' });
}

// 绑定事件
form.addEventListener('submit', submitQuestionnaire);
resetBtn.addEventListener('click', resetAllAnswers);
backToFormBtn.addEventListener('click', backToForm);