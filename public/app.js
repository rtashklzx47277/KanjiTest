import { STORAGE_KEY, CATEGORIES, LocalRepository, checkAnswer, selectQuestion } from './core.js';

const $ = (selector) => document.querySelector(selector);
const builtins = JSON.parse($('#builtin-words').textContent);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let repository = new LocalRepository(builtins, storage);
let current = null;
let lastResult = null;
let category = 'all';
let activeRequest = null;
let checking = false;
const tablePages = { bookmark: 0, custom: 0 };
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
function nextQuestion() {
  current = selectQuestion(pool(), current?.id);
  $('#yourAnswer').value = '';
}
function renderQuiz() {
  const words = pool();
  if (!current || !words.some((word) => word.id === current.id)) nextQuestion();
  $('#pool-count').textContent = `${words.length} 個單字`;
  for (const radio of document.querySelectorAll('input[name="category"]')) radio.checked = radio.value === category;
  $('#question').textContent = current?.question || '尚無單字';
  $('#question').title = current?.question || '';
  $('#question-category').textContent = current?.category === 'custom' ? '自訂單字' : current?.category || '';
  $('#empty-quiz').hidden = !!current;
  $('#answer-form').hidden = !current;
  $('#answer-submit').disabled = checking;
  $('#yourAnswer').disabled = checking;
  $('#last-result').hidden = !lastResult;
  if (lastResult) {
    $('#solution').textContent = lastResult.correct ? '正解！' : '再記住一次';
    $('#solution').className = lastResult.correct ? 'correct' : 'incorrect';
    $('#lastQuestion').textContent = lastResult.question;
    $('#lastAnswer').textContent = lastResult.answer;
    $('#yourLastAnswer').textContent = lastResult.submitted;
    $('#lastExplanation').textContent = lastResult.explanation || '—';
    const bookmarked = repository.hasBookmark(lastResult.wordId);
    const missing = !repository.getWord(lastResult.wordId);
    $('#add-bookmark-button').textContent = bookmarked ? '已加入書籤' : '加入書籤';
    $('#add-bookmark-button').disabled = bookmarked || missing || repository.readOnly;
  }
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
function renderRoute() {
  const path = location.pathname.replace(/\/$/u, '') || '/quiz';
  const view = path === '/bookmarks' ? 'bookmarks' : path === '/words' ? 'words' : 'quiz';
  const nextCategory = new URLSearchParams(location.search).get('category') || 'all';
  if (view === 'quiz' && category !== nextCategory) {
    category = CATEGORIES.includes(nextCategory) ? nextCategory : 'all';
    current = null;
  }
  for (const name of ['quiz', 'bookmarks', 'words']) $(`#${name}-view`).hidden = view !== name;
  for (const link of document.querySelectorAll('nav a[data-view]')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (view === 'quiz') renderQuiz();
  else renderTable(view === 'bookmarks' ? 'bookmark' : 'custom');
  document.title = view === 'quiz' ? '日文單字測驗' : `${view === 'bookmarks' ? '我的書籤' : '自訂單字'}｜日文單字測驗`;
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
  if (url.origin !== location.origin || !['/quiz', '/bookmarks', '/words'].includes(url.pathname)) return;
  event.preventDefault();
  navigate(url.pathname + url.search);
});
window.addEventListener('popstate', () => { cancelCheck(); renderRoute(); });
$('#category').addEventListener('change', (event) => {
  if (event.target.name === 'category') navigate(`/quiz?category=${encodeURIComponent(event.target.value)}`);
});
$('#answer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!current || checking) return;
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
    lastResult = result;
    nextQuestion();
  } catch (error) { if (activeRequest === controller) showNotice(errorMessage(error), true); }
  finally {
    clearTimeout(timer);
    if (activeRequest === controller) {
      activeRequest = null;
      checking = false;
      renderQuiz();
      $('#yourAnswer').focus();
    }
  }
});
$('#add-bookmark-button').addEventListener('click', () => {
  if (lastResult) mutate(() => repository.addBookmark(lastResult.wordId), '已加入書籤。');
});
for (const kind of ['bookmark', 'custom']) {
  $(`#${kind}-filter`).addEventListener('input', () => { tablePages[kind] = 0; renderTable(kind); });
  for (const [direction, change] of [['prev', -1], ['next', 1]]) $(`#${kind}-${direction}`).addEventListener('click', () => { tablePages[kind] += change; renderTable(kind); });
}
window.addEventListener('resize', renderRoute);
$('#open-settings').addEventListener('click', () => $('#settings-dialog').showModal());
$('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
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
    mutate(() => repository.importData(input), '已合併匯入備份，原有單字與書籤已保留。');
  } catch (error) { $('#settings-dialog').close(); showNotice(errorMessage(error), true); }
  finally { event.target.value = ''; }
});
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  cancelCheck();
  repository = new LocalRepository(builtins, storage);
  updateCounts();
  renderRoute();
});
updateCounts();
renderRoute();
