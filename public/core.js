export const STORAGE_KEY = 'kanjitest:data:v1';
export const CATEGORIES = ['all', 'N5', 'N4', 'N3', 'bookmark', 'custom'];

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

const emptyState = () => ({ version: 1, customWords: [], bookmarkIds: [] });

export function validateState(input, builtins) {
  if (!input || input.version !== 1 || !Array.isArray(input.customWords) || !Array.isArray(input.bookmarkIds)) {
    throw new Error('資料格式或版本不正確。');
  }
  if (input.customWords.length > 5000 || input.bookmarkIds.length > 6000) throw new Error('資料筆數超過上限。');
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
  return { version: 1, customWords, bookmarkIds };
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
  exportData() { return this.readOnly && this.rawData !== null ? this.rawData : JSON.stringify(this.state, null, 2); }
  importData(input) {
    const incoming = validateState(input, this.builtins);
    const merged = new Map(this.state.customWords.map((word) => [word.id, word]));
    for (const word of incoming.customWords) {
      const existing = merged.get(word.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(word)) throw new Error('匯入檔與現有單字 ID 衝突，請先核對資料。');
      merged.set(word.id, word);
    }
    this.save({ version: 1, customWords: [...merged.values()], bookmarkIds: [...new Set([...this.state.bookmarkIds, ...incoming.bookmarkIds])] });
  }
}
