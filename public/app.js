import { STORAGE_KEY, CATEGORIES, LocalRepository, checkAnswer, isKanaOnly } from './core.js';

const $ = (selector) => document.querySelector(selector);
const builtins = JSON.parse($('#builtin-words').textContent);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let repository = new LocalRepository(builtins, storage);
// If browser storage is unavailable, a round still works for this tab only.
const memoryStorage = () => ({ raw: null, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } });
let practice = repository.readOnly ? new LocalRepository(builtins, memoryStorage()) : repository;
let current = null;
let lastResult = null;
let category = 'all';
let activeRequest = null;
let checking = false;
let composing = false, compositionEndAt = -Infinity;
const tablePages = { bookmark: 0, custom: 0, history: 0, round: 0 };
let detailPages = [], detailPage = 0;

function renderDetail() {
  $('#word-detail').textContent = detailPages[detailPage];
  $('#word-page').textContent = `${detailPage + 1} / ${detailPages.length}`;
  $('#word-prev').disabled = detailPage === 0;
  $('#word-next').disabled = detailPage === detailPages.length - 1;
}
function openDetail(word) {
  const text = `單字：${word.question}\n讀音：${word.answer}\n中文解釋：${word.explanation || '—'}`;
  const characters = Array.from(text);
  detailPages = [];
  for (let i = 0; i < characters.length; i += 160) detailPages.push(characters.slice(i, i + 160).join(''));
  detailPage = 0;
  renderDetail();
  $('#word-dialog').showModal();
}

function showNotice(message, isError = false) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle('error', isError);
}
function errorMessage(error) {
  if (error.name === 'QuotaExceededError') return '本機儲存空間不足，資料尚未儲存。請先匯出備份並整理瀏覽器空間。';
  if (error.name === 'SecurityError') return '瀏覽器不允許儲存網站資料，請檢查網站儲存權限。';
  return error.message || '操作失敗，請再試一次。';
}
function mutate(action, message) {
  try { action(); showNotice(message); updateCounts(); renderRoute(); return true; }
  catch (error) { showNotice(errorMessage(error), true); return false; }
}
function updateCounts() {
  $('#bookmark-count').textContent = repository.state.bookmarkIds.length;
  $('#custom-count').textContent = repository.state.customWords.length;
  $('#create-custom-button').disabled = repository.readOnly;
  $('#import-data').disabled = repository.readOnly;
  const error = $('#storage-error');
  error.hidden = !repository.readOnly;
  error.textContent = repository.readOnly ? '無法讀取本機儲存資料。原有內容未被覆寫；仍可練習內建題庫，請先檢查瀏覽器儲存權限或資料格式。' : '';
}
function pool() { return repository.wordsIn(category); }
function renderQuiz() {
  const words = pool();
  const round = practice.state.round;
  const completed = round && (round.finished || round.position === round.words.length);
  $('#quiz-setup').hidden = !!round;
  $('#round-play').hidden = !round || completed;
  $('#round-summary').hidden = !completed;
  $('#pool-count').textContent = `${words.length} 個單字`;
  for (const radio of document.querySelectorAll('input[name="category"]')) radio.checked = radio.value === category;
  $('#start-quiz').disabled = !words.length;
  if (!round) { current = null; lastResult = null; return; }
  if (completed) {
    current = null;
    lastResult = null;
    const correct = round.results.filter(item => item.correct).length;
    $('#round-score').textContent = round.results.length ? `正確率 ${(correct / round.results.length * 100).toFixed(1)}%` : '正確率 —';
    $('#round-totals').textContent = `${round.finished && round.position < round.words.length ? '提前結束 · ' : ''}${round.review ? '錯題複習 · ' : ''}${round.category === 'all' ? '全部' : round.category === 'bookmark' ? '我的書籤' : round.category === 'custom' ? '自訂單字' : round.category} · 已答 ${round.results.length} / ${round.words.length} 題 · 正確 ${correct} · 錯誤 ${round.results.length - correct}`;
    $('#retry-wrong').disabled = !round.results.some((item, index) => !item.correct && !isKanaOnly(round.words[index].question));
    $('#round-empty').hidden = round.results.length > 0;
    renderHistory('round');
    return;
  }
  const next = round.words[round.position];
  if (current?.id !== next.id) $('#yourAnswer').value = '';
  current = next;
  lastResult = round.results.at(-1) ?? null;
  $('#round-progress').textContent = `${round.review ? '錯題複習 · ' : ''}第 ${round.position + 1} / ${round.words.length} 題`;
  $('#question').textContent = current?.question || '尚無單字';
  $('#question').title = current?.question || '';
  $('#question-category').textContent = current?.category === 'custom' ? '自訂單字' : current?.category || '';
  $('#empty-quiz').hidden = !!current;
  $('#answer-form').hidden = !current;
  $('#yourAnswer').disabled = checking;
  $('#last-result').hidden = !lastResult;
  if (lastResult) {
    $('#solution').textContent = lastResult.correct ? '正解！' : '再記住一次';
    $('#solution').className = lastResult.correct ? 'correct' : 'incorrect';
    $('#lastQuestion').textContent = lastResult.question;
    $('#lastAnswer').textContent = lastResult.answer;
    $('#yourLastAnswer').textContent = lastResult.submitted;
    $('#lastExplanation').textContent = lastResult.explanation || '—';
  }
}

function startRound({ review = false, words, count = Number($('#round-count').value), selectedCategory = category } = {}) {
  cancelCheck();
  try {
    practice.startRound(selectedCategory, count, { review, words });
    category = selectedCategory;
    history.replaceState(null, '', `/quiz?category=${encodeURIComponent(category)}`);
    tablePages.round = 0;
    $('#yourAnswer').value = '';
    showNotice(repository.readOnly ? '本輪僅在此分頁暫存，重新整理後無法保留。' : '');
    renderRoute();
    $('#yourAnswer').focus();
  } catch (error) { showNotice(errorMessage(error), true); }
}
function returnToSetup() {
  cancelCheck();
  try {
    const round = practice.state.round;
    if (round) { category = round.category; $('#round-count').value = round.requestedCount; }
    practice.clearRound();
    showNotice('');
    renderRoute();
  } catch (error) { showNotice(errorMessage(error), true); }
}
function renderTable(kind) {
  const isBookmark = kind === 'bookmark';
  const words = isBookmark ? repository.bookmarks : repository.customWords;
  const filter = $(`#${kind}-filter`).value.trim().toLocaleLowerCase();
  const visible = words.filter((word) => [word.category, word.question, word.answer, word.explanation].some((text) => text.toLocaleLowerCase().includes(filter)));
  const tbody = $(`#${kind}-table tbody`);
  // Reserve space for the heading, filters, table header and page controls.
  const available = document.querySelector('main').getBoundingClientRect().bottom - $(`#${kind}-table`).parentElement.getBoundingClientRect().top - 110;
  const pageSize = Math.max(1, Math.floor(available / (innerWidth <= 650 ? 88 : 72)));
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  tablePages[kind] = Math.min(tablePages[kind], pageCount - 1);
  tbody.replaceChildren();
  for (const word of visible.slice(tablePages[kind] * pageSize, (tablePages[kind] + 1) * pageSize)) {
    const row = document.createElement('tr');
    const fields = isBookmark ? [word.category === 'custom' ? '自訂' : word.category, word.question, word.answer, word.explanation] : [word.question, word.answer, word.explanation];
    for (const [index, text] of fields.entries()) {
      const cell = document.createElement('td');
      cell.dataset.label = (isBookmark ? ['分類', '單字', '讀音', '中文解釋'] : ['單字', '讀音', '中文解釋'])[index];
      const content = document.createElement(index === (isBookmark ? 1 : 0) ? 'button' : 'span');
      content.textContent = text || '—';
      content.title = text;
      content.className = 'cell-content';
      if (content.tagName === 'BUTTON') {
        content.type = 'button';
        content.classList.add('word-link');
        content.setAttribute('aria-label', `單字詳細：${word.question}`);
        content.addEventListener('click', () => openDetail(word));
      }
      cell.append(content);
      row.append(cell);
    }
    const cell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'delete-button';
    button.textContent = isBookmark ? '移除' : '刪除';
    button.setAttribute('aria-label', `${isBookmark ? '移除書籤' : '刪除單字'}：${word.question}`);
    button.disabled = repository.readOnly;
    button.addEventListener('click', () => mutate(() => isBookmark ? repository.deleteBookmark(word.id) : repository.deleteCustom(word.id), isBookmark ? '已移除書籤。' : '已刪除單字及其書籤。'));
    cell.append(button);
    row.append(cell);
    tbody.append(row);
  }
  const empty = $(`#${kind}-empty`);
  empty.hidden = visible.length > 0;
  empty.textContent = words.length ? '沒有符合搜尋的單字。' : isBookmark ? '還沒有書籤。答題後可以把想複習的單字加入這裡。' : '還沒有自訂單字。點「新增單字」建立自己的題庫。';
  $(`#${kind}-table`).hidden = !visible.length;
  $(`#${kind}-pagination`).hidden = !visible.length;
  $(`#${kind}-page`).textContent = `${tablePages[kind] + 1} / ${pageCount} · ${visible.length} 筆`;
  $(`#${kind}-prev`).disabled = tablePages[kind] === 0;
  $(`#${kind}-next`).disabled = tablePages[kind] === pageCount - 1;
}
function renderHistory(kind = 'history') {
  const history = kind === 'round' ? practice.state.round.results : repository.history;
  if (kind === 'history') $('#history-summary').textContent = `${history.length} 題 · 正確 ${history.filter(item => item.correct).length}`;
  const available = document.querySelector('main').getBoundingClientRect().bottom - $(`#${kind}-table`).parentElement.getBoundingClientRect().top - 110;
  const pageSize = Math.max(1, Math.floor(available / (innerWidth <= 650 ? 144 : 72)));
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize));
  tablePages[kind] = Math.min(tablePages[kind], pageCount - 1);
  const tbody = $(`#${kind}-table tbody`);
  tbody.replaceChildren();
  for (const [offset, item] of history.slice(tablePages[kind] * pageSize, (tablePages[kind] + 1) * pageSize).entries()) {
    const row = document.createElement('tr');
    const date = new Date(item.answeredAt);
    const time = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const fields = [kind === 'round' ? `${tablePages[kind] * pageSize + offset + 1}` : time, item.question, item.correct ? '正確' : '錯誤', item.submitted, item.answer];
    for (const [index, text] of fields.entries()) {
      const cell = document.createElement('td');
      const content = document.createElement(index === 1 ? 'button' : 'span');
      content.className = 'cell-content';
      content.textContent = text;
      content.title = index === 0 ? date.toLocaleString('zh-TW') : text;
      if (index === 1) {
        content.type = 'button';
        content.classList.add('word-link');
        content.setAttribute('aria-label', `歷史單字詳細：${item.question}`);
        content.addEventListener('click', () => openDetail(item));
      }
      if (index === 2) cell.className = item.correct ? 'history-correct' : 'history-incorrect';
      cell.append(content);
      row.append(cell);
    }
    const cell = document.createElement('td');
    const button = document.createElement('button');
    const bookmarked = repository.hasBookmark(item.wordId);
    const missing = !repository.getWord(item.wordId);
    button.type = 'button';
    button.className = 'history-bookmark secondary';
    button.textContent = missing ? '單字已刪除' : bookmarked ? '已加入書籤' : '加入書籤';
    button.disabled = missing || bookmarked || repository.readOnly;
    button.setAttribute('aria-label', `歷史加入書籤：${item.question}`);
    button.addEventListener('click', () => mutate(() => repository.addBookmark(item.wordId), '已加入書籤。'));
    cell.append(button);
    row.append(cell);
    tbody.append(row);
  }
  if (kind === 'history') $('#history-empty').hidden = !!history.length;
  $(`#${kind}-table`).hidden = !history.length;
  $(`#${kind}-pagination`).hidden = !history.length;
  $(`#${kind}-page`).textContent = `${tablePages[kind] + 1} / ${pageCount} · ${history.length} 題`;
  $(`#${kind}-prev`).disabled = tablePages[kind] === 0;
  $(`#${kind}-next`).disabled = tablePages[kind] === pageCount - 1;
}
function renderRoute() {
  const path = location.pathname.replace(/\/$/u, '') || '/quiz';
  const view = path === '/bookmarks' ? 'bookmarks' : path === '/words' ? 'words' : path === '/history' ? 'history' : 'quiz';
  const queryCategory = new URLSearchParams(location.search).get('category');
  if (view === 'quiz') {
    category = CATEGORIES.includes(queryCategory) ? queryCategory : practice.state.round?.category ?? category;
    if (practice.state.round && category !== practice.state.round.category) {
      try { practice.clearRound(); } catch (error) { category = practice.state.round.category; showNotice(errorMessage(error), true); }
    }
  }
  for (const name of ['quiz', 'bookmarks', 'words', 'history']) $(`#${name}-view`).hidden = view !== name;
  for (const link of document.querySelectorAll('nav a[data-view]')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (view === 'quiz') renderQuiz();
  else if (view === 'history') renderHistory();
  else renderTable(view === 'bookmarks' ? 'bookmark' : 'custom');
  document.title = view === 'quiz' ? '日文單字測驗' : `${view === 'bookmarks' ? '我的書籤' : view === 'history' ? '答題歷史' : '自訂單字'}｜日文單字測驗`;
}
function cancelCheck() {
  activeRequest?.abort();
  activeRequest = null;
  checking = false;
}
function navigate(href) {
  cancelCheck();
  history.pushState(null, '', href);
  showNotice('');
  renderRoute();
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !['/quiz', '/bookmarks', '/words', '/history'].includes(url.pathname)) return;
  event.preventDefault();
  navigate(url.pathname + url.search);
});
window.addEventListener('popstate', () => { cancelCheck(); renderRoute(); });
$('#category').addEventListener('change', (event) => {
  if (event.target.name === 'category') navigate(`/quiz?category=${encodeURIComponent(event.target.value)}`);
});
function normalizeCount() {
  const field = $('#round-count');
  const count = Number(field.value);
  field.value = Number.isFinite(count) ? Math.max(1, Math.min(100, Math.floor(count))) : 10;
}
$('#round-count').addEventListener('input', event => { if (Number(event.target.value) > 100) event.target.value = 100; });
$('#round-count').addEventListener('blur', normalizeCount);
$('#quiz-setup').addEventListener('submit', event => { event.preventDefault(); startRound(); });
$('#reselect-round').addEventListener('click', returnToSetup);
$('#change-setup').addEventListener('click', () => {
  cancelCheck();
  try { practice.endRound(); showNotice(''); renderQuiz(); }
  catch (error) { showNotice(errorMessage(error), true); }
});
$('#retry-wrong').addEventListener('click', () => {
  const round = practice.state.round;
  const wrongIds = new Set(round.results.filter(item => !item.correct).map(item => item.wordId));
  const words = round.words.filter(word => wrongIds.has(word.id));
  startRound({ review: true, words, count: round.requestedCount, selectedCategory: round.category });
});
$('#another-round').addEventListener('click', () => {
  const round = practice.state.round;
  startRound({ count: round.requestedCount, selectedCategory: round.category });
});
$('#yourAnswer').addEventListener('compositionstart', () => { composing = true; });
$('#yourAnswer').addEventListener('compositionend', () => { composing = false; compositionEndAt = performance.now(); });
$('#yourAnswer').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing || composing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat && !checking && performance.now() - compositionEndAt >= 80) $('#answer-form').requestSubmit();
});
$('#answer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!current || checking || composing || performance.now() - compositionEndAt < 80) return;
  const answer = $('#yourAnswer').value.trim();
  if (!answer) return;
  const word = current;
  const controller = new AbortController();
  activeRequest = controller;
  checking = true;
  renderQuiz();
  let timer;
  try {
    let result;
    if (word.category === 'custom') result = checkAnswer(word, answer);
    else {
      timer = setTimeout(() => controller.abort('timeout'), 5000);
      try {
        const response = await fetch('/api/answer-checks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wordId: word.id, answer }), signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || '答案檢查失敗。');
        result = payload.data;
      } catch (error) {
        if (activeRequest !== controller) return;
        if (error instanceof TypeError || controller.signal.reason === 'timeout') {
          result = checkAnswer(word, answer);
          showNotice('連線暫時不可用，已使用內建題庫在本機核對答案。');
        } else throw error;
      }
    }
    if (activeRequest !== controller) return;
    // Local canonical grading is the same as the stateless API; save all changes atomically.
    practice.recordAttempt(word, answer);
    lastResult = result;
    updateCounts();
  } catch (error) { if (activeRequest === controller) showNotice(errorMessage(error), true); }
  finally {
    clearTimeout(timer);
    if (activeRequest === controller) {
      activeRequest = null;
      checking = false;
      renderQuiz();
      if (!$('#round-play').hidden) $('#yourAnswer').focus();
    }
  }
});
for (const kind of ['bookmark', 'custom']) {
  $(`#${kind}-filter`).addEventListener('input', () => { tablePages[kind] = 0; renderTable(kind); });
  for (const [direction, change] of [['prev', -1], ['next', 1]]) $(`#${kind}-${direction}`).addEventListener('click', () => { tablePages[kind] += change; renderTable(kind); });
}
window.addEventListener('resize', renderRoute);
for (const kind of ['history', 'round']) for (const [direction, change] of [['prev', -1], ['next', 1]]) $('#' + kind + '-' + direction).addEventListener('click', () => { tablePages[kind] += change; renderHistory(kind); });
function selectSettingsTab(name) {
  for (const panel of ['practice', 'source']) {
    const selected = panel === name;
    $('#settings-' + panel).hidden = !selected;
    $('#settings-' + panel + '-tab').setAttribute('aria-selected', String(selected));
    $('#settings-' + panel + '-tab').tabIndex = selected ? 0 : -1;
  }
}
for (const name of ['practice', 'source']) {
  const tab = $('#settings-' + name + '-tab');
  tab.addEventListener('click', () => selectSettingsTab(name));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'practice' : event.key === 'End' ? 'source' : name === 'practice' ? 'source' : 'practice';
    selectSettingsTab(next);
    $('#settings-' + next + '-tab').focus();
  });
}
$('#open-settings').addEventListener('click', () => { selectSettingsTab('practice'); updateCounts(); $('#settings-dialog').showModal(); });
$('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
for (const dialog of document.querySelectorAll('dialog')) {
  let pointerOutside = false;
  const outside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => { pointerOutside = outside(event); });
  dialog.addEventListener('pointercancel', () => { pointerOutside = false; });
  dialog.addEventListener('close', () => { pointerOutside = false; });
  dialog.addEventListener('click', (event) => {
    if (pointerOutside && outside(event)) dialog.close();
    pointerOutside = false;
  });
}
$('#close-word').addEventListener('click', () => $('#word-dialog').close());
$('#word-prev').addEventListener('click', () => { detailPage--; renderDetail(); });
$('#word-next').addEventListener('click', () => { detailPage++; renderDetail(); });
$('#create-custom-button').addEventListener('click', () => {
  $('#custom-form').reset();
  $('#custom-error').hidden = true;
  $('#custom-dialog').showModal();
  $('#custom-question').focus();
});
$('#close-dialog').addEventListener('click', () => $('#custom-dialog').close());
$('#custom-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const word = repository.addCustom(Object.fromEntries(new FormData(event.target)));
    $('#custom-dialog').close();
    updateCounts();
    renderRoute();
    showNotice(`已儲存「${word.question}」。`);
  } catch (error) { $('#custom-error').textContent = errorMessage(error); $('#custom-error').hidden = false; }
});
$('#export-data').addEventListener('click', () => {
  const blob = new Blob([repository.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kanjitest-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('備份檔不可超過 2 MB。');
    const input = JSON.parse(await file.text());
    $('#settings-dialog').close();
    mutate(() => {
      repository.importData(input);
      if (repository.state.round && !$('#quiz-view').hidden) history.replaceState(null, '', `/quiz?category=${encodeURIComponent(repository.state.round.category)}`);
    }, '已合併匯入備份，原有單字與書籤已保留。');
  } catch (error) { $('#settings-dialog').close(); showNotice(errorMessage(error), true); }
  finally { event.target.value = ''; }
});
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  cancelCheck();
  repository = new LocalRepository(builtins, storage);
  practice = repository.readOnly ? new LocalRepository(builtins, memoryStorage()) : repository;
  updateCounts();
  renderRoute();
});
updateCounts();
renderRoute();
