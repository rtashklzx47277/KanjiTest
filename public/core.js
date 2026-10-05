export const STORAGE_KEY = 'kanjitest:data:v1';
export const CATEGORIES = ['all', 'N5', 'N4', 'N3', 'N2', 'N1', 'bookmark', 'custom'];

export function normalizeAnswer(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, '')
    .replace(/[\u30a1-\u30f6]/gu, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
}

export function checkAnswer(word, input) {
  const submitted = input.trim();
  if (!submitted) throw new Error('請輸入答案。');
  const expected = word.answer.split(/[/／、,;；]/u).map(normalizeAnswer);
  return {
    wordId: word.id, question: word.question, answer: word.answer,
    explanation: word.explanation, submitted,
    correct: expected.includes(normalizeAnswer(submitted)),
  };
}

export function selectQuestion(words, previousId, random = Math.random) {
  if (!words.length) return null;
  const candidates = words.length > 1 ? words.filter((word) => word.id !== previousId) : words;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

export function questionWeight(stats = { correct: 0, wrong: 0 }) {
  const errorRate = (stats.wrong + 1) / (stats.correct + stats.wrong + 2);
  return 0.25 + 1.75 * errorRate;
}

// Weighted sampling without replacement: each draw removes its selected word.
export function selectRound(words, count, wordStats = {}, random = Math.random) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('題數須為 1 至 100 的整數。');
  const candidates = [...new Map(words.map(word => [word.id, word])).values()]
    .map(word => ({ word, weight: questionWeight(wordStats[word.id]) }));
  const selected = [];
  while (candidates.length && selected.length < count) {
    let ticket = Math.min(1 - Number.EPSILON, Math.max(0, random())) * candidates.reduce((sum, item) => sum + item.weight, 0);
    let index = 0;
    while (index < candidates.length - 1 && ticket >= candidates[index].weight) ticket -= candidates[index++].weight;
    selected.push(candidates.splice(index, 1)[0].word);
  }
  return selected;
}

export function validateCustomWord(input) {
  if (!input || typeof input !== 'object') throw new Error('自訂單字格式不正確。');
  const word = {};
  for (const [field, label, limit] of [['question', '單字', 200], ['answer', '讀音', 200], ['explanation', '中文解釋', 500]]) {
    if (typeof input[field] !== 'string' || !input[field].trim()) throw new Error(`請填寫${label}。`);
    word[field] = input[field].trim();
    if (word[field].length > limit) throw new Error(`${label}長度不可超過 ${limit} 字。`);
  }
  return word;
}

const emptyState = () => ({ version: 1, customWords: [], bookmarkIds: [], settings: { autoBookmarkWrong: false }, history: [], wordStats: {}, round: null });

function validateHistory(history = [], limit = 50) {
  if (!Array.isArray(history) || history.length > limit) throw new Error(`答題歷史格式不正確，最多保存 ${limit} 題。`);
  const ids = new Set();
  return history.map((item) => {
    if (!item || typeof item.id !== 'string' || !/^attempt:[a-zA-Z0-9-]{1,80}$/u.test(item.id) || ids.has(item.id)
      || typeof item.wordId !== 'string' || !/^(builtin:\d+|jmdict:\d+|custom:[a-zA-Z0-9-]{1,80})$/u.test(item.wordId)
      || !['N1', 'N2', 'N3', 'N4', 'N5', 'custom'].includes(item.category)
      || typeof item.correct !== 'boolean' || typeof item.answeredAt !== 'string' || !Number.isFinite(Date.parse(item.answeredAt))) {
      throw new Error('答題歷史內容不正確。');
    }
    ids.add(item.id);
    const clean = { id: item.id, wordId: item.wordId, category: item.category, correct: item.correct, answeredAt: new Date(item.answeredAt).toISOString() };
    for (const [key, limit] of [['question', 200], ['answer', 200], ['submitted', 200], ['explanation', 1000]]) {
      if (typeof item[key] !== 'string' || item[key].length > limit || (key !== 'explanation' && !item[key].trim())) throw new Error('答題歷史文字格式不正確。');
      clean[key] = item[key];
    }
    return clean;
  });
}

const validWordId = id => typeof id === 'string' && /^(builtin:\d+|jmdict:\d+|custom:[a-zA-Z0-9-]{1,80})$/u.test(id);
function validateStats(input, history) {
  if (input === undefined) {
    const stats = {};
    for (const item of history) {
      const entry = stats[item.wordId] ??= { correct: 0, wrong: 0 };
      entry[item.correct ? 'correct' : 'wrong']++;
    }
    return stats;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 20000) throw new Error('單字統計格式不正確。');
  const stats = {};
  for (const [id, value] of Object.entries(input)) {
    if (!validWordId(id) || !value || ![value.correct, value.wrong].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e9)) throw new Error('單字統計內容不正確。');
    stats[id] = { correct: value.correct, wrong: value.wrong };
  }
  return stats;
}

function validateRound(round) {
  if (round === undefined || round === null) return null;
  if (!round || !CATEGORIES.includes(round.category) || typeof round.review !== 'boolean'
    || !Number.isInteger(round.requestedCount) || round.requestedCount < 1 || round.requestedCount > 100
    || !Array.isArray(round.words) || !round.words.length || round.words.length > round.requestedCount
    || !Number.isInteger(round.position) || round.position < 0 || round.position > round.words.length) throw new Error('本輪測驗格式不正確。');
  const ids = new Set();
  const words = round.words.map(word => {
    if (!validWordId(word?.id) || ids.has(word.id) || !['N1', 'N2', 'N3', 'N4', 'N5', 'custom'].includes(word.category)) throw new Error('本輪單字格式不正確。');
    ids.add(word.id);
    // Built-in explanations may be blank or longer than custom input limits.
    for (const key of ['question', 'answer', 'explanation']) if (typeof word[key] !== 'string' || word[key].length > (key === 'explanation' ? 1000 : 200) || (key !== 'explanation' && !word[key].trim())) throw new Error('本輪單字文字不正確。');
    return { id: word.id, category: word.category, question: word.question, answer: word.answer, explanation: word.explanation };
  });
  const results = validateHistory(round.results, 100);
  if (results.length < round.position || results.length > Math.min(round.position + 1, words.length)
    || results.some((item, index) => item.wordId !== words[index].id || item.question !== words[index].question || item.answer !== words[index].answer || item.correct !== checkAnswer(words[index], item.submitted).correct)) throw new Error('本輪答題紀錄與進度不一致。');
  return { category: round.category, requestedCount: round.requestedCount, review: round.review, words, position: round.position, results };
}

export function validateState(input, builtins) {
  if (!input || input.version !== 1 || !Array.isArray(input.customWords) || !Array.isArray(input.bookmarkIds)) {
    throw new Error('資料格式或版本不正確。');
  }
  if (input.customWords.length > 5000 || input.bookmarkIds.length > builtins.length + 5000) throw new Error('資料筆數超過上限。');
  const knownIds = new Set(builtins.map((word) => word.id));
  const customWords = input.customWords.map((word) => {
    if (typeof word?.id !== 'string' || !/^custom:[a-zA-Z0-9-]{1,80}$/u.test(word.id) || knownIds.has(word.id)) {
      throw new Error('自訂單字 ID 不正確或重複。');
    }
    knownIds.add(word.id);
    return { id: word.id, category: 'custom', ...validateCustomWord(word) };
  });
  const bookmarkIds = [...new Set(input.bookmarkIds)];
  if (bookmarkIds.some((id) => typeof id !== 'string' || !knownIds.has(id))) throw new Error('書籤包含不存在的單字。');
  if (input.settings !== undefined && (!input.settings || typeof input.settings.autoBookmarkWrong !== 'boolean')) throw new Error('練習設定格式不正確。');
  const history = validateHistory(input.history);
  return { version: 1, customWords, bookmarkIds, settings: { autoBookmarkWrong: input.settings?.autoBookmarkWrong ?? false }, history,
    wordStats: validateStats(input.wordStats, history), round: validateRound(input.round) };
}

export class LocalRepository {
  constructor(builtins, storage, { readOnly = false } = {}) {
    this.builtins = builtins;
    this.storage = storage;
    this.readOnly = readOnly;
    this.state = emptyState();
    this.loadError = null;
    this.rawData = null;
    if (readOnly) return;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      this.rawData = raw;
      if (raw !== null) this.state = validateState(JSON.parse(raw), builtins);
    } catch (error) {
      this.readOnly = true;
      this.loadError = error;
    }
  }

  get allWords() { return [...this.builtins, ...this.state.customWords]; }
  get customWords() { return [...this.state.customWords].reverse(); }
  get history() { return [...this.state.history]; }
  get bookmarks() {
    const words = new Map(this.allWords.map((word) => [word.id, word]));
    return [...this.state.bookmarkIds].reverse().map((id) => words.get(id));
  }
  getWord(id) { return this.allWords.find((word) => word.id === id); }
  hasBookmark(id) { return this.state.bookmarkIds.includes(id); }
  wordsIn(category) {
    if (!CATEGORIES.includes(category)) throw new Error('不存在的題目分類。');
    if (category === 'bookmark') return this.bookmarks;
    if (category === 'custom') return this.customWords;
    if (category === 'all') return this.allWords;
    return this.builtins.filter((word) => word.category === category);
  }

  save(nextState) {
    if (this.readOnly) throw new Error('目前無法寫入本機資料；請確認瀏覽器儲存權限與現有資料。');
    const cleanState = validateState(nextState, this.builtins);
    // Commit in memory only after browser persistence succeeds.
    this.storage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
    this.state = cleanState;
  }
  addCustom(input, id = `custom:${globalThis.crypto.randomUUID()}`) {
    const word = { id, category: 'custom', ...validateCustomWord(input) };
    this.save({ ...this.state, customWords: [...this.state.customWords, word] });
    return word;
  }
  deleteCustom(id) {
    if (!this.state.customWords.some((word) => word.id === id)) throw new Error('找不到這個自訂單字。');
    this.save({ ...this.state, customWords: this.state.customWords.filter((word) => word.id !== id), bookmarkIds: this.state.bookmarkIds.filter((bookmarkId) => bookmarkId !== id) });
  }
  addBookmark(id) {
    if (!this.getWord(id)) throw new Error('找不到這個單字。');
    if (this.hasBookmark(id)) return false;
    this.save({ ...this.state, bookmarkIds: [...this.state.bookmarkIds, id] });
    return true;
  }
  deleteBookmark(id) {
    this.save({ ...this.state, bookmarkIds: this.state.bookmarkIds.filter((bookmarkId) => bookmarkId !== id) });
  }
  setAutoBookmarkWrong(enabled) {
    this.save({ ...this.state, settings: { autoBookmarkWrong: enabled } });
  }
  startRound(category, count, { words, review = false, random = Math.random } = {}) {
    if (!CATEGORIES.includes(category)) throw new Error('不存在的題目分類。');
    const selected = selectRound(words ?? this.wordsIn(category), count, this.state.wordStats, random);
    if (!selected.length) throw new Error('這個分類還沒有單字。');
    this.save({ ...this.state, round: { category, requestedCount: count, review, words: selected, position: 0, results: [] } });
  }
  advanceRound() {
    const round = this.state.round;
    if (!round || round.position >= round.words.length || round.results.length !== round.position + 1) throw new Error('請先完成這一題。');
    this.save({ ...this.state, round: { ...round, position: round.position + 1 } });
  }
  clearRound() { this.save({ ...this.state, round: null }); }
  recordAttempt(word, submitted, { id = `attempt:${globalThis.crypto.randomUUID()}`, answeredAt = new Date().toISOString() } = {}) {
    const result = checkAnswer(word, submitted);
    const attempt = { id, answeredAt, category: word.category, ...result };
    const bookmarkIds = this.state.settings.autoBookmarkWrong && !result.correct && this.getWord(word.id) && !this.hasBookmark(word.id)
      ? [...this.state.bookmarkIds, word.id] : this.state.bookmarkIds;
    // Save the attempt and automatic bookmark together; failed storage changes neither.
    const stats = this.state.wordStats[word.id] ?? { correct: 0, wrong: 0 };
    const wordStats = { ...this.state.wordStats, [word.id]: { ...stats, [result.correct ? 'correct' : 'wrong']: stats[result.correct ? 'correct' : 'wrong'] + 1 } };
    let round = this.state.round;
    if (round && round.position < round.words.length) {
      if (round.words[round.position].id !== word.id || round.results.length !== round.position) throw new Error('這一題已完成或測驗進度已改變。');
      round = { ...round, results: [...round.results, attempt] };
    }
    this.save({ ...this.state, history: [attempt, ...this.state.history].slice(0, 50), bookmarkIds, wordStats, round });
    return attempt;
  }
  exportData() { return this.readOnly && this.rawData !== null ? this.rawData : JSON.stringify(this.state, null, 2); }
  importData(input) {
    const incoming = validateState(input, this.builtins);
    const merged = new Map(this.state.customWords.map((word) => [word.id, word]));
    for (const word of incoming.customWords) {
      const existing = merged.get(word.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(word)) throw new Error('匯入檔與現有單字 ID 衝突，請先核對資料。');
      merged.set(word.id, word);
    }
    const history = new Map(this.state.history.map((item) => [item.id, item]));
    for (const item of incoming.history) {
      const existing = history.get(item.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(item)) throw new Error('匯入檔與現有答題歷史 ID 衝突。');
      history.set(item.id, item);
    }
    const wordStats = { ...this.state.wordStats };
    for (const [id, stats] of Object.entries(incoming.wordStats)) {
      const existing = wordStats[id] ?? { correct: 0, wrong: 0 };
      // Counters are backup snapshots, not increments; importing twice must not inflate them.
      wordStats[id] = { correct: Math.max(existing.correct, stats.correct), wrong: Math.max(existing.wrong, stats.wrong) };
    }
    this.save({ version: 1, customWords: [...merged.values()], bookmarkIds: [...new Set([...this.state.bookmarkIds, ...incoming.bookmarkIds])],
      settings: input.settings === undefined ? this.state.settings : incoming.settings,
      history: [...history.values()].sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt)).slice(0, 50), wordStats,
      round: this.state.round ?? incoming.round });
  }
}
