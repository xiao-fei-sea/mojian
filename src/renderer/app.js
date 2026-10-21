'use strict';

const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js/lib/common');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const nodePath = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const api = window.api;

/* ═══════════════════ 常量 ═══════════════════ */

const LS = {
  theme: 'mojian.theme',
  mode: 'mojian.mode',
  fs: 'mojian.fontsize',
  split: 'mojian.split',
  autosave: 'mojian.autosave',
  pinned: 'mojian.pinned',
  onboarded: 'mojian.onboarded'
};

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

const SHORTCUT_GROUPS = [
  ['文件', [
    ['新建文档', ['Ctrl', 'N']],
    ['打开文件', ['Ctrl', 'O']],
    ['保存', ['Ctrl', 'S']],
    ['另存为', ['Ctrl', 'Shift', 'S']],
    ['关闭当前文档', ['Ctrl', 'W']],
    ['导出 HTML', ['Ctrl', 'Shift', 'E']],
    ['打印 / 导出 PDF', ['Ctrl', 'P']]
  ]],
  ['视图', [
    ['切换文档标签', ['Ctrl', 'Tab']],
    ['分栏 / 单栏切换', ['Ctrl', '\\']],
    ['纯预览', ['Ctrl', 'Shift', 'P']],
    ['切换深浅主题', ['Ctrl', 'Shift', 'D']],
    ['放大 / 缩小字号', ['Ctrl', 'Shift', '+/-']],
    ['全屏', ['F11']],
    ['快捷键说明', ['F1']]
  ]],
  ['格式', [
    ['加粗', ['Ctrl', 'B']],
    ['斜体', ['Ctrl', 'I']],
    ['行内代码', ['Ctrl', '`']],
    ['链接', ['Ctrl', 'K']],
    ['标题 1-6', ['Ctrl', '1-6']],
    ['正文', ['Ctrl', '0']],
    ['引用', ['Ctrl', 'Shift', 'Q']],
    ['代码块', ['Ctrl', 'Shift', 'C']],
    ['无序列表', ['Ctrl', 'Shift', 'U']],
    ['有序列表', ['Ctrl', 'Shift', 'O']],
    ['任务列表', ['Ctrl', 'Shift', 'T']],
    ['表格', ['Ctrl', 'T']],
    ['分割线', ['Ctrl', 'Shift', 'R']],
    ['删除当前块', ['Ctrl', 'Shift', 'K']]
  ]],
  ['编辑', [
    ['查找', ['Ctrl', 'F']],
    ['替换', ['Ctrl', 'H']],
    ['撤销 / 重做', ['Ctrl', 'Z / Y']],
    ['缩进 / 反缩进', ['Tab / Shift+Tab']],
    ['关闭浮层', ['Esc']]
  ]]
];

const TOUR_STEPS = [
  {
    target: null,
    title: '欢迎使用墨笺',
    body: '它像记事本一样简单：直接在排版好的文字上输入，保存时自动写成 Markdown（.md）文件。下面用几步带你认识它。'
  },
  {
    target: '#preview',
    title: '直接在正文里写',
    body: '不用记语法。点一下正文就能像 txt 一样打字，标题、加粗、列表、表格会自动排版；左侧源码也会同步更新。'
  },
  {
    target: '[data-tour="format"]',
    title: '一键排版',
    body: '选中文字后点「加粗」「标题」「列表」等按钮即可。也可用 Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+1~6 标题。'
  },
  {
    target: '[data-tour="file"]',
    title: '保存与打开',
    body: 'Ctrl+S 保存到原文件，Ctrl+Shift+S 另存为，Ctrl+O 打开本地 .md。也可以把文件直接拖进窗口。'
  },
  {
    target: '#modeSwitch',
    title: '三种视图',
    body: '分栏：左边源码、右边可直接编辑；单栏：整页专注写作；预览：只读排版检查。'
  },
  {
    target: null,
    title: '随时都在',
    body: '按 F1 查看全部快捷键；Ctrl+N 会新开一个标签（不会覆盖当前文档），Ctrl+Tab 可在标签间切换；在「更多 → 新手引导」可以重看这段引导。现在就开始写吧。'
  }
];

/* ═══════════════════ 状态 ═══════════════════ */

const state = {
  text: '',
  filePath: null,
  dirty: false,
  mode: 'split',
  theme: 'light',
  fontSize: 15,
  split: 50,
  autoSave: false,
  pinned: false,
  docs: [],
  activeId: null,
  lastFocus: 'source',
  previewRange: null
};

/* ═══════════════════ DOM ═══════════════════ */

const $ = (id) => document.getElementById(id);
const el = {
  root: document.documentElement,
  docTitle: $('docTitle'),
  dirtyDot: $('dirtyDot'),
  btnMin: $('btnMin'),
  btnMax: $('btnMax'),
  btnClose: $('btnClose'),
  toolbar: document.querySelector('.toolbar'),
  modeSwitch: $('modeSwitch'),
  tabs: $('tabs'),
  tabAdd: $('tabAdd'),
  emptyState: $('emptyState'),
  esNew: $('esNew'),
  esOpen: $('esOpen'),
  workspace: $('workspace'),
  paneSource: document.querySelector('.pane-source'),
  editor: $('editor'),
  splitter: $('splitter'),
  preview: $('preview'),
  previewScroll: $('previewScroll'),
  sbPos: $('sbPos'),
  sbSel: $('sbSel'),
  sbWords: $('sbWords'),
  sbChars: $('sbChars'),
  sbSave: $('sbSave'),
  findbar: $('findbar'),
  tableBar: $('tableBar'),

  findInput: $('findInput'),
  replaceInput: $('replaceInput'),
  findCount: $('findCount'),
  popup: $('popup'),
  modalMask: $('modalMask'),
  modalBox: $('modalBox'),
  dropOverlay: $('dropOverlay'),
  toastWrap: $('toastWrap'),
  tour: $('tour'),
  tourDim: $('tourDim'),
  tourSpot: $('tourSpot'),
  tourCard: document.querySelector('.tour-card'),
  tourStep: $('tourStep'),
  tourTitle: $('tourTitle'),
  tourBody: $('tourBody'),
  tourPrev: $('tourPrev'),
  tourNext: $('tourNext'),
  tourSkip: $('tourSkip')
};

/* ═══════════════════ Markdown ═══════════════════ */

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: false,
  highlight(str, lang) {
    const cls = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : '';
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code${cls}>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch { /* 忽略，退回纯文本 */ }
    }
    return `<pre class="hljs"><code${cls}>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});

const escapeHtml = (str) => md.utils.escapeHtml(str);

/* ---------- HTML → Markdown（预览直接编辑后回写源码） ---------- */

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined'
});
turndown.use(gfm);
// 代码块保留语言标注
const fencedCodeOf = (node) => {
  const code = node.firstChild;
  const cls = (code && code.getAttribute && code.getAttribute('class')) || '';
  const m = /language-([\w+#.-]+)/.exec(cls);
  const lang = m ? m[1] : '';
  const text = code ? codeTextOf(code).replace(/\n+$/, '') : '';
  return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
};
turndown.addRule('fencedCodeLang', {
  filter: (node) => node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
  replacement: (_content, node) => fencedCodeOf(node)
});
// 空的 <pre><code> 会被 turndown 判为 blank 并整块丢弃，这里必须补回空围栏
turndown.rules.blankRule = {
  replacement: (content, node) =>
    node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE'
      ? fencedCodeOf(node)
      : turndown.options.blankReplacement(content, node)
};
// 图片：DOM 里是绝对路径（file:），写回 Markdown 时转回文档内的相对路径
turndown.addRule('image', {
  filter: 'img',
  replacement: (_content, node) => {
    const src = relImageSrc(node.getAttribute('src') || '');
    if (!src) return '';
    const alt = node.getAttribute('alt') || '';
    const title = node.getAttribute('title');
    return `![${alt}](${src}${title ? ` "${title}"` : ''})`;
  }
});

function htmlToMarkdown(html) {
  try {
    // 零宽空格只是编辑期的光标锚点（如空表格单元格），不能写进 Markdown
    return turndown.turndown(html.split('\u200b').join(''));
  } catch {
    return state.text;
  }
}

/* ---------- 图片路径：Markdown 里存相对路径，DOM 里用绝对路径显示 ---------- */

const isAbsoluteSrc = (src) => /^(https?:|data:|blob:|mailto:|file:)/i.test(src);

function docDir() {
  return state.filePath ? nodePath.dirname(state.filePath) : null;
}

function absImageSrc(src) {
  if (!src || isAbsoluteSrc(src)) return src;
  const dir = docDir();
  if (!dir) return src;
  try {
    return pathToFileURL(nodePath.resolve(dir, decodeURI(src))).href;
  } catch {
    return src;
  }
}

function relImageSrc(src) {
  if (!src || !/^file:/i.test(src)) return src;
  const dir = docDir();
  if (!dir) return src;
  try {
    const rel = nodePath.relative(dir, fileURLToPath(src));
    if (!rel || rel.startsWith('..') || nodePath.isAbsolute(rel)) return src;
    return rel.split(nodePath.sep).join('/');
  } catch {
    return src;
  }
}

/** 把容器里相对路径的图片换成可加载的绝对路径 */
function resolveImagesIn(root) {
  root.querySelectorAll('img').forEach((img) => {
    const raw = img.getAttribute('src') || '';
    const abs = absImageSrc(raw);
    if (abs !== raw) img.setAttribute('src', abs);
  });
}

function resolvePreviewImages() {
  resolveImagesIn(el.preview);
}

/* ═══════════════════ 工具函数 ═══════════════════ */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function basename(p) {
  if (!p) return '';
  return p.split(/[\\/]/).pop() || p;
}

function countWords(text) {
  const cjk = (text.match(CJK_RE) || []).length;
  const rest = text.replace(CJK_RE, ' ');
  const words = (rest.match(/[A-Za-z0-9_][A-Za-z0-9_'’.-]*/g) || []).length;
  return cjk + words;
}

function toast(message, ms = 1800) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  el.toastWrap.appendChild(node);
  setTimeout(() => node.remove(), ms);
}

/* ═══════════════════ 预览渲染与双向同步 ═══════════════════ */

let previewRenderTimer = null;
let previewSerializeTimer = null;

function isPreviewFocused() {
  return document.activeElement === el.preview;
}

function updateEmptyFlag() {
  const hasMedia = !!el.preview.querySelector('img, hr, pre, blockquote, table, ul, ol');
  el.preview.dataset.empty = String(el.preview.textContent.trim() === '' && !hasMedia);
}

function renderPreview(force = false) {
  if (!force && isPreviewFocused()) return;
  clearTimeout(previewRenderTimer);
  el.preview.innerHTML = md.render(state.text);
  resolvePreviewImages();
  normalizeCodeBlocks();
  updateEmptyFlag();
  rebuildFindHighlights();
}

function schedulePreview() {
  clearTimeout(previewRenderTimer);
  previewRenderTimer = setTimeout(() => renderPreview(false), 140);
}

/** 把预览区（可直接编辑）序列化回 Markdown，写回 state 与源码框 */
function serializePreview() {
  state.text = htmlToMarkdown(el.preview.innerHTML);
  el.editor.value = state.text;
  updateEmptyFlag();
  updateStatus();
  scheduleAutoSave();
}

function flushPreviewEdit() {
  if (!previewSerializeTimer) return;
  clearTimeout(previewSerializeTimer);
  previewSerializeTimer = null;
  serializePreview();
}

function onPreviewInput() {
  markDirty();
  clearTimeout(previewSerializeTimer);
  previewSerializeTimer = setTimeout(serializePreview, 180);
}

/* ═══════════════════ 状态同步 ═══════════════════ */

function updateTitle() {
  // 未打开文件时，左上角显示应用名（墨笺）
  const name = state.filePath ? basename(state.filePath) : '墨笺';
  el.docTitle.textContent = name;
  el.docTitle.title = state.filePath ? state.filePath : '未保存的新文档';
  document.title = state.filePath
    ? `${name}${state.dirty ? ' •' : ''} — 墨笺`
    : `墨笺${state.dirty ? ' •' : ''}`;
  renderTabs();
  updateEmptyState();
}

/** 没有任何标签时，用引导层提示用户新建或打开 */
function updateEmptyState() {
  const empty = state.docs.length === 0;
  el.emptyState.hidden = !empty;
  if (empty) el.preview.contentEditable = 'false';
  else el.preview.contentEditable = state.mode === 'preview' ? 'false' : 'true';
}

function markDirty() {
  if (!activeDoc()) return;
  if (state.dirty) return;
  state.dirty = true;
  el.dirtyDot.classList.add('on');
  updateTitle();
  el.sbSave.textContent = '未保存';
  el.sbSave.classList.remove('saving');
}

function clearDirty() {
  state.dirty = false;
  el.dirtyDot.classList.remove('on');
  updateTitle();
}

function updateStatus() {
  if (state.mode === 'split') {
    const pos = el.editor.selectionStart;
    const before = el.editor.value.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    el.sbPos.textContent = `行 ${line}，列 ${col}`;
    const sel = Math.abs(el.editor.selectionEnd - el.editor.selectionStart);
    el.sbSel.textContent = sel > 0 ? `已选 ${sel} 字符` : '';
  } else {
    el.sbPos.textContent = '';
    el.sbSel.textContent = '';
  }
  el.sbChars.textContent = `${[...state.text].length} 字符`;
  el.sbWords.textContent = `${countWords(state.text)} 字`;
}

function setText(text, { filePath, dirty = false } = {}) {
  flushPreviewEdit();
  state.text = text;
  if (filePath !== undefined) state.filePath = filePath;
  el.editor.value = text;
  el.editor.scrollTop = 0;
  renderPreview(true);
  updateStatus();
  updateTitle();
  if (dirty) markDirty();
  else clearDirty();
  el.previewScroll.scrollTop = 0;
}

/* ═══════════════════ 多文档（标签页） ═══════════════════ */

let docSeq = 0;

/** 取当前未使用的「未命名」序号，关闭后可以复用，不会一直往上加 */
function nextUntitled() {
  const used = new Set();
  state.docs.forEach((d) => {
    if (!docPathOf(d)) used.add(d.untitled);
  });
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function activeDoc() {
  return state.docs.find((d) => d.id === state.activeId) || null;
}

function docPathOf(d) {
  return d.id === state.activeId ? state.filePath : d.filePath;
}

function docName(d) {
  const fp = docPathOf(d);
  return fp ? basename(fp) : `未命名 ${d.untitled}`;
}

function docDirtyOf(d) {
  return d.id === state.activeId ? state.dirty : !!d.dirty;
}

/** 把当前编辑内容与视图状态写回所属标签 */
function tabSnapshot() {
  const d = activeDoc();
  if (!d) return;
  d.text = state.text;
  d.filePath = state.filePath;
  d.dirty = state.dirty;
  d.caret = el.editor.selectionStart;
  d.scrollTop = el.editor.scrollTop;
  d.previewScrollTop = el.previewScroll.scrollTop;
}

function renderTabs() {
  el.tabs.innerHTML = state.docs
    .map((d) => {
      const active = d.id === state.activeId;
      const cls = `tab${active ? ' active' : ''}${docDirtyOf(d) ? ' dirty' : ''}`;
      const path = docPathOf(d) || '未保存的新文档';
      return (
        `<div class="${cls}" data-id="${d.id}" title="${escapeHtml(path)}">` +
        `<span class="tab-dot"></span>` +
        `<span class="tab-name">${escapeHtml(docName(d))}</span>` +
        `<span class="tab-close" data-close="${d.id}" title="关闭">` +
        `<svg viewBox="0 0 16 16"><path d="M4.6 4.6 11.4 11.4"/><path d="M11.4 4.6 4.6 11.4"/></svg>` +
        `</span></div>`
      );
    })
    .join('');
  const activeEl = el.tabs.querySelector('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function activateDoc(id) {
  if (id === state.activeId) return;
  flushPreviewEdit();
  tabSnapshot();
  const doc = state.docs.find((d) => d.id === id);
  if (!doc) return;
  state.activeId = id;
  setText(doc.text, { filePath: doc.filePath, dirty: doc.dirty });
  const caret = Math.min(doc.caret || 0, doc.text.length);
  el.editor.setSelectionRange(caret, caret);
  el.editor.scrollTop = doc.scrollTop || 0;
  el.previewScroll.scrollTop = doc.previewScrollTop || 0;
  updateStatus();
}

/** 新建一个标签（不覆盖当前文档） */
function createDoc({ filePath = null, text = '', activate = true } = {}) {
  flushPreviewEdit();
  tabSnapshot();
  const doc = {
    id: ++docSeq,
    untitled: nextUntitled(),
    filePath,
    text,
    dirty: false,
    caret: 0,
    scrollTop: 0,
    previewScrollTop: 0
  };
  state.docs.push(doc);
  if (activate) {
    state.activeId = null;
    activateDoc(doc.id);
  } else {
    renderTabs();
  }
  return doc;
}

function findDocByPath(filePath) {
  if (!filePath) return null;
  const key = String(filePath).toLowerCase().replace(/\//g, '\\');
  tabSnapshot();
  return (
    state.docs.find((d) => {
      const p = d.id === state.activeId ? state.filePath : d.filePath;
      return p && String(p).toLowerCase().replace(/\//g, '\\') === key;
    }) || null
  );
}

function cycleTab(step) {
  if (state.docs.length < 2) return;
  const idx = state.docs.findIndex((d) => d.id === state.activeId);
  if (idx < 0) return;
  const next = state.docs[(idx + step + state.docs.length) % state.docs.length];
  if (next) activateDoc(next.id);
}

async function closeTab(id) {
  const doc = state.docs.find((d) => d.id === id);
  if (!doc) return;
  if (id === state.activeId) flushPreviewEdit();
  tabSnapshot();

  if (docDirtyOf(doc)) {
    const choice = await api.confirm({
      title: '关闭文档',
      message: `「${docName(doc)}」还有未保存的更改，关闭前要保存吗？`,
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2
    });
    if (choice === 2) return;
    if (choice === 0) {
      activateDoc(id);
      if (!(await saveDocument(false))) return;
    }
  }

  const idx = state.docs.findIndex((d) => d.id === id);
  state.docs.splice(idx, 1);

  if (!state.docs.length) {
    showEmptyState();
    return;
  }
  if (id === state.activeId) {
    state.activeId = null;
    activateDoc(state.docs[Math.min(idx, state.docs.length - 1)].id);
  } else {
    renderTabs();
  }
}

/** 所有标签都关掉了：清空编辑区，显示「新建 / 打开」引导 */
function showEmptyState() {
  state.docs = [];
  state.activeId = null;
  state.filePath = null;
  state.text = '';
  state.dirty = false;
  el.editor.value = '';
  el.preview.innerHTML = '';
  el.editor.scrollTop = 0;
  el.previewScroll.scrollTop = 0;
  el.dirtyDot.classList.remove('on');
  el.sbSave.textContent = '未保存';
  el.sbSave.classList.remove('saving');
  updateTitle();
  updateStatus();
}

/** 关闭窗口前：检查所有标签的未保存更改 */
async function handleAppClose() {
  flushPreviewEdit();
  tabSnapshot();
  const dirtyDocs = state.docs.filter((d) => docDirtyOf(d));
  if (!dirtyDocs.length) {
    api.confirmClose();
    return;
  }
  const names = dirtyDocs.map((d) => `「${docName(d)}」`).join('、');
  const choice = await api.confirm({
    title: '未保存的更改',
    message: `有 ${dirtyDocs.length} 个文档还有未保存的更改：${names}\n关闭前要全部保存吗？`,
    buttons: ['全部保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2
  });
  if (choice === 2) return;
  if (choice === 1) {
    api.confirmClose();
    return;
  }
  for (const doc of dirtyDocs) {
    activateDoc(doc.id);
    if (!(await saveDocument(false))) return;
  }
  api.confirmClose();
}

function setMode(mode) {
  flushPreviewEdit();
  state.mode = mode;
  localStorage.setItem(LS.mode, mode);
  el.workspace.dataset.mode = mode;
  el.modeSwitch.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.mode === mode));
  });
  el.editor.value = state.text;
  el.preview.contentEditable = mode === 'preview' ? 'false' : 'true';
  updateEmptyState();
  el.preview.classList.toggle('readonly', mode === 'preview');
  renderPreview(true);
  el.previewScroll.scrollTop = 0;
  updateStatus();
}

function applyTheme() {
  el.root.dataset.theme = state.theme;
  localStorage.setItem(LS.theme, state.theme);
}

function applyFontSize() {
  el.root.style.setProperty('--editor-fs', state.fontSize + 'px');
  localStorage.setItem(LS.fs, String(state.fontSize));
}

function applySplit() {
  el.paneSource.style.width = state.split + '%';
}

/* ═══════════════════ 格式化（源码 / 预览 双通道） ═══════════════════ */

/** 当前该把格式操作施加到哪个编辑面 */
function usePreviewEdits() {
  if (state.mode !== 'split') return state.mode !== 'preview';
  if (state.lastFocus === 'preview') return true;
  return isPreviewFocused();
}

function insertText(ta, text) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.focus();
  if (!document.execCommand('insertText', false, text)) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/* ---------- 源码通道 ---------- */

function wrapSelection(before, after = before, placeholder = '') {
  const ta = el.editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;
  const selected = value.slice(start, end) || placeholder;
  insertText(ta, before + selected + after);
  const pos = ta.selectionStart;
  if (!value.slice(start, end) && placeholder) {
    ta.setSelectionRange(pos - after.length - placeholder.length, pos - after.length);
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyLineTransform(fn) {
  const ta = el.editor;
  const value = ta.value;
  const selStart = ta.selectionStart;
  const selEnd = ta.selectionEnd;
  const start = value.lastIndexOf('\n', selStart - 1) + 1;
  let end = value.indexOf('\n', selEnd);
  if (end === -1) end = value.length;

  const lines = value.slice(start, end).split('\n');
  const out = fn(lines);
  if (out === null) return;

  const caret = start + out.join('\n').length;
  ta.focus();
  ta.setSelectionRange(start, end);
  insertText(ta, out.join('\n'));
  ta.setSelectionRange(caret, caret);
}

function toggleHeading(level) {
  applyLineTransform((lines) => {
    return lines.map((l) => {
      const stripped = l.replace(/^\s{0,3}#{1,6}\s+/, '');
      if (level === 0) return stripped;
      return '#'.repeat(level) + ' ' + stripped;
    });
  });
}

function togglePrefix(kind) {
  const patterns = {
    ul: /^(\s*)[-*+]\s+/,
    ol: /^(\s*)\d+\.\s+/,
    task: /^(\s*)[-*+]\s+\[[ xX]\]\s+/,
    quote: /^(\s*)>\s?/
  };
  applyLineTransform((lines) => {
    const re = patterns[kind];
    const solid = lines.filter((l) => l.trim() !== '');
    const hasAll = solid.length > 0 && solid.every((l) => re.test(l));
    return lines.map((l, i) => {
      if (l.trim() === '') return l;
      if (hasAll) return l.replace(re, '$1');
      const indent = (l.match(/^(\s*)/) || ['', ''])[1];
      const body = l.replace(re, '$1').replace(/^\s+/, '');
      if (kind === 'ol') return `${indent}${i + 1}. ${body}`;
      if (kind === 'ul') return `${indent}- ${body}`;
      if (kind === 'task') return `${indent}- [ ] ${body}`;
      return `${indent}> ${body}`;
    });
  });
}

function insertBlockCode() {
  const ta = el.editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;
  const selected = value.slice(start, end);
  const needsNewline = start > 0 && value[start - 1] !== '\n';
  const insert = `${needsNewline ? '\n' : ''}\`\`\`\n${selected}\n\`\`\`\n`;
  ta.focus();
  ta.setSelectionRange(start, end);
  insertText(ta, insert);
  if (!selected) {
    const pos = ta.selectionStart - 5;
    ta.setSelectionRange(pos, pos);
  }
}

function insertLink() {
  const ta = el.editor;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end) || '链接文字';
  insertText(ta, `[${selected}](https://)`);
  const pos = ta.selectionStart - 1;
  ta.setSelectionRange(pos - 8, pos);
}

function insertTable() {
  const ta = el.editor;
  const need = ta.selectionStart > 0 && ta.value[ta.selectionStart - 1] !== '\n' ? '\n' : '';
  insertText(
    ta,
    `${need}| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n`
  );
}

/* ---------- 表格：光标所在表格的增删行列 ---------- */

/** 光标所在的预览表格单元格（不在表格内返回 null） */
function previewTableCtx() {
  if (state.mode === 'preview') return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  if (!node || !node.closest || !el.preview.contains(node)) return null;
  const cell = node.closest('td, th');
  const row = cell && cell.parentElement;
  const table = cell && cell.closest('table');
  if (!row || !table) return null;
  return {
    table,
    row,
    header: row.parentElement && row.parentElement.nodeName === 'THEAD',
    col: Array.prototype.indexOf.call(row.children, cell)
  };
}

/** 新单元格里放一个零宽空格作光标锚点（写回 Markdown 时会被滤掉） */
function makeTableCell(header) {
  const cell = document.createElement(header ? 'th' : 'td');
  cell.appendChild(document.createTextNode(ZWSP));
  return cell;
}

/** 把光标放进某个单元格的开头 */
function focusTableCell(cell) {
  if (!cell) return;
  if (!cell.firstChild) cell.appendChild(document.createTextNode(ZWSP));
  const r = document.createRange();
  r.selectNodeContents(cell);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  state.previewRange = r.cloneRange();
}

/** 在当前单元格所在的表格里增删行列 */
function tableOp(kind) {
  const ctx = previewTableCtx();
  if (!ctx) return;
  const { table, row, header, col } = ctx;
  const width = row.children.length;

  if (kind === 'addRow') {
    const tr = document.createElement('tr');
    for (let i = 0; i < width; i++) tr.appendChild(makeTableCell(false));
    if (header) {
      // 表头下方加的是正文行
      let body = table.querySelector('tbody');
      if (!body) {
        body = document.createElement('tbody');
        table.appendChild(body);
      }
      body.insertBefore(tr, body.firstChild);
    } else {
      row.after(tr);
    }
    focusTableCell(tr.children[Math.min(col, width - 1)]);
  } else if (kind === 'delRow') {
    if (header) {
      toast('表头行不能删除');
      return;
    }
    const body = row.parentElement;
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    if (!body.children.length) {
      // 只有表头的表格在 Markdown 里不成立，整表删掉
      table.remove();
      updateTableBar();
      onPreviewInput();
      return;
    }
    focusTableCell(next && next.children[Math.min(col, next.children.length - 1)]);
  } else if (kind === 'addCol') {
    table.querySelectorAll('tr').forEach((tr) => {
      const at = tr.children[col];
      const cell = makeTableCell(tr.parentElement.nodeName === 'THEAD');
      if (at) at.after(cell);
      else tr.appendChild(cell);
    });
    focusTableCell(row.children[col + 1]);
  } else if (kind === 'delCol') {
    if (width <= 1) {
      toast('至少要保留一列');
      return;
    }
    table.querySelectorAll('tr').forEach((tr) => {
      const cell = tr.children[col];
      if (cell) cell.remove();
    });
    focusTableCell(row.children[Math.min(col, width - 2)]);
  }

  updateTableBar();
  onPreviewInput();
}

let tableBarTimer = 0;

/** 合并高频的选区 / 滚动事件，避免每次触发都强制排版 */
function queueTableBar() {
  if (tableBarTimer) return;
  tableBarTimer = setTimeout(() => {
    tableBarTimer = 0;
    updateTableBar();
  }, 60);
}

/** 依据光标位置显示 / 隐藏表格浮动工具条 */
function updateTableBar() {
  const ctx = previewTableCtx();
  if (!ctx) {
    el.tableBar.hidden = true;
    return;
  }
  el.tableBar.querySelector('[data-table="delRow"]').disabled = ctx.header;
  el.tableBar.querySelector('[data-table="delCol"]').disabled = ctx.row.children.length <= 1;
  el.tableBar.hidden = false;

  const rect = ctx.table.getBoundingClientRect();
  const bar = el.tableBar;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - bar.offsetWidth - 8);
  let top = rect.top - bar.offsetHeight - 6;
  if (top < 8) top = Math.min(rect.bottom + 6, window.innerHeight - bar.offsetHeight - 8);
  bar.style.left = left + 'px';
  bar.style.top = top + 'px';
}

function bindTableBar() {
  // 按下按钮时不要抢走预览区选区，否则取不到当前单元格
  el.tableBar.addEventListener('mousedown', (e) => e.preventDefault());
  el.tableBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-table]');
    if (btn && !btn.disabled) tableOp(btn.dataset.table);
  });
  document.addEventListener('selectionchange', queueTableBar);
  el.previewScroll.addEventListener('scroll', queueTableBar, { passive: true });
  window.addEventListener('resize', queueTableBar);
}

function insertHr() {
  const ta = el.editor;
  const need = ta.selectionStart > 0 && ta.value[ta.selectionStart - 1] !== '\n' ? '\n' : '';
  insertText(ta, `${need}---\n`);
}

/* ---------- 预览通道 ---------- */

function withPreviewSelection(fn) {
  el.preview.focus();
  const sel = window.getSelection();
  if (state.previewRange) {
    sel.removeAllRanges();
    sel.addRange(state.previewRange);
  }
  fn();
  state.previewRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  onPreviewInput();
}

/** 光标所在的 <pre>（仅当光标落在预览区代码块内） */
function previewPreAtCaret() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  if (!node || !el.preview.contains(node)) return null;
  return node.closest('pre');
}

/** 把光标移到某节点的内容开头 */
function caretAtStart(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  state.previewRange = range.cloneRange();
}

/**
 * 离开代码块：块后补一个空段落并把光标移进去；
 * 空代码块则整体移除，避免留下无法落光标的空 <pre>。
 */
function exitCodeBlock(pre) {
  const code = pre.firstChild && pre.firstChild.nodeName === 'CODE' ? pre.firstChild : null;
  if (code) {
    stripZwsp(code);
    stripTrailingBreaks(code);
  }
  const isEmpty = !code || !(code.textContent || '').trim();
  const p = document.createElement('p');
  p.innerHTML = '<br>';
  if (isEmpty) pre.replaceWith(p);
  else pre.after(p);
  caretAtStart(p);
}

const ZWSP = '\u200b';

/** 在代码块里插入一个软换行（<br>）。
 *  不能用 execCommand('insertText', '\n')：它会把 <code> 拆成多个兄弟节点，序列化时只取到第一块；
 *  也不能把 '\n' 写进文本节点，或在 <br> 后面挂一个空文本节点：块末尾的空节点会被浏览器忽略，
 *  光标被并回上一行，接着打字就落到换行前面。
 *  这里用 <br> 表示换行，并在其后挂一个零宽空格（ZWSP）承载新行的光标——ZWSP 有内容，
 *  不会被忽略，序列化时再过滤掉，不进入 Markdown。 */
function insertNewlineInCode() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);
  const line = document.createTextNode(ZWSP);
  br.after(line);
  const r = document.createRange();
  r.setStart(line, 1);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  state.previewRange = r.cloneRange();
}

/** 把节点（含后代）转成纯文本：<br> 还原为 '\n'，并滤掉承载光标的零宽空格 */
function codeTextOf(node) {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.data;
    else if (c.nodeName === 'BR') out += '\n';
    else out += codeTextOf(c);
  }
  return out.split(ZWSP).join('');
}

/** 去掉代码块里所有零宽空格（只剩 ZWSP 的文本节点直接删掉） */
function stripZwsp(code) {
  for (const c of [...code.childNodes]) {
    if (c.nodeType === 3) {
      if (!c.data.includes(ZWSP)) continue;
      const d = c.data.split(ZWSP).join('');
      if (d) c.data = d;
      else c.remove();
    } else if (c.nodeName !== 'BR') {
      stripZwsp(c);
    }
  }
}

/** 去掉代码块末尾的空行标记（<br> 及只含 ZWSP 的文本节点） */
function stripTrailingBreaks(code) {
  for (let last = code.lastChild; last; last = code.lastChild) {
    if (last.nodeName === 'BR' || (last.nodeType === 3 && last.data.split(ZWSP).join('') === '')) code.removeChild(last);
    else break;
  }
}

/** 空代码块：既没有实际内容，也没有换行标记 */
function isBlankCode(code) {
  return codeTextOf(code).trim() === '' && !code.querySelector('br');
}

/** 空代码块需要一个零宽空格作光标锚点：否则光标无法落进空块，打字会落在 <pre> 上 */
function ensureCodeAnchor(code) {
  if (!code.firstChild && isBlankCode(code)) code.appendChild(document.createTextNode(ZWSP));
}

/** 刷新空代码块标记（块外「代码」提示据此显示，随输入实时更新） */
function refreshBlankFlags() {
  el.preview.querySelectorAll('pre > code').forEach((code) => {
    if (isBlankCode(code)) code.dataset.blank = 'true';
    else code.removeAttribute('data-blank');
  });
}

/** 把节点里文本的 '\n' 拆成 <br>，保留原有元素结构（如高亮用的 <span>） */
function newlineToBr(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) {
      if (!child.data.includes('\n')) continue;
      const frag = document.createDocumentFragment();
      child.data.split('\n').forEach((part, i) => {
        if (i) frag.appendChild(document.createElement('br'));
        if (part) frag.appendChild(document.createTextNode(part));
      });
      child.replaceWith(frag);
    } else if (child.nodeName !== 'BR') {
      newlineToBr(child);
    }
  }
}

/**
 * 渲染后统一代码块内的换行表示：把 markdown-it 产出的 '\n' 文本改成 <br>，
 * 并去掉末尾空行。这样编辑时换行只用 <br> 一种表示，光标（含末尾位置）始终可用。
 */
function normalizeCodeBlocks() {
  el.preview.querySelectorAll('pre > code').forEach((code) => {
    stripZwsp(code);
    newlineToBr(code);
    stripTrailingBreaks(code);
    ensureCodeAnchor(code);
  });
  refreshBlankFlags();
  // 相邻代码块之间补一个空段落，保证光标能落进两者之间、可在其间插入内容
  el.preview.querySelectorAll('pre').forEach((pre) => {
    const prev = pre.previousElementSibling;
    if (prev && prev.nodeName === 'PRE') {
      const gap = document.createElement('p');
      gap.innerHTML = '<br>';
      pre.before(gap);
    }
  });
}

/** 光标所在的最外层块（#preview 的直接子元素），没有则返回 null */
function topLevelBlock(node) {
  let n = node && node.nodeType === 3 ? node.parentElement : node;
  while (n && n.parentNode && n.parentNode !== el.preview) n = n.parentNode;
  return n && n.parentNode === el.preview ? n : null;
}

/** 节点里是否还有可见内容（承载光标的零宽空格不算） */
function hasContent(node) {
  if (!node) return false;
  const text = node.textContent.split(ZWSP).join('');
  return Boolean(text.trim() || node.querySelector('img, table, hr, pre, input'));
}

/**
 * 在预览区光标处插入代码块。
 * 不用 execCommand('insertHTML')：光标在段落里时，它会把块级标签压扁成行内 <span>。
 * 这里手动拆开光标所在的最外层块，把 <pre><code> 作为兄弟节点插进去。
 */
function insertCodeBlockInPreview(text) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) range.deleteContents(); // 选中的文字已作为 text 取走，从文档中删掉
  const top = topLevelBlock(range.startContainer);
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (text) {
    code.textContent = text;
    newlineToBr(code);
  } else {
    // 空块：内容留空（「代码」提示显示在块外），只放一个零宽空格作光标锚点
    code.dataset.blank = 'true';
  }
  pre.appendChild(code);

  let after = null;
  if (top) {
    const tail = range.cloneRange();
    tail.selectNodeContents(top);
    tail.setStart(range.endContainer, range.endOffset);
    after = tail.extractContents(); // 光标之后的内容留在身后成为新块
    top.after(pre);
    if (!hasContent(top)) top.remove();
  } else {
    range.deleteContents();
    range.insertNode(pre);
  }

  if (hasContent(after)) {
    pre.after(after);
  } else {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    pre.after(p);
  }

  // 代码块不能直接相邻：相邻的 <pre> 之间补一个空段落，否则光标无法落进两者之间
  if (pre.previousElementSibling && pre.previousElementSibling.nodeName === 'PRE') {
    const gap = document.createElement('p');
    gap.innerHTML = '<br>';
    pre.before(gap);
  }
  if (pre.nextElementSibling && pre.nextElementSibling.nodeName === 'PRE') {
    const gap = document.createElement('p');
    gap.innerHTML = '<br>';
    pre.after(gap);
  }

  ensureCodeAnchor(code);
  const r = document.createRange();
  r.selectNodeContents(code);
  // 有选中文本 → 光标落到代码末尾；空块 → 光标落到块内锚点之后，可直接输入
  r.collapse(Boolean(text));
  sel.removeAllRanges();
  sel.addRange(r);
}

function formatInPreview(action, arg) {
  withPreviewSelection(() => {
    const sel = window.getSelection();
    switch (action) {
      case 'bold':
        document.execCommand('bold');
        break;
      case 'italic':
        document.execCommand('italic');
        break;
      case 'code': {
        const text = sel.toString() || 'code';
        document.execCommand('insertHTML', false, `<code>${escapeHtml(text)}</code>&nbsp;`);
        break;
      }
      case 'link': {
        const text = sel.toString() || '链接文字';
        document.execCommand('insertHTML', false, `<a href="https://">${escapeHtml(text)}</a>&nbsp;`);
        break;
      }
      case 'quote':
        document.execCommand('formatBlock', false, 'blockquote');
        break;
      case 'codeblock': {
        const text = sel.toString();
        // 已经在代码块里：先退出，避免把新代码块嵌进 <pre> 里
        const cur = previewPreAtCaret();
        if (cur) exitCodeBlock(cur);
        insertCodeBlockInPreview(text);
        break;
      }
      case 'ul':
        document.execCommand('insertUnorderedList');
        break;
      case 'ol':
        document.execCommand('insertOrderedList');
        break;
      case 'task':
        document.execCommand('insertUnorderedList');
        break;
      case 'hr':
        document.execCommand('insertHorizontalRule');
        break;
      case 'table':
        document.execCommand(
          'insertHTML',
          false,
          '<table><thead><tr><th>列 1</th><th>列 2</th><th>列 3</th></tr></thead>' +
            '<tbody><tr><td>内容</td><td>内容</td><td>内容</td></tr></tbody></table><p><br></p>'
        );
        break;
      case 'heading':
        document.execCommand('formatBlock', false, arg === 0 ? 'p' : 'h' + arg);
        break;
      default:
        break;
    }
  });
}

function previewDeleteBlock() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  const block = node && node.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table');
  if (block && el.preview.contains(block)) block.remove();
  else sel.deleteFromDocument();
  onPreviewInput();
}

/* ---------- 统一入口 ---------- */

const SOURCE_FORMAT = {
  bold: () => wrapSelection('**', '**', '加粗文字'),
  italic: () => wrapSelection('*', '*', '斜体文字'),
  code: () => wrapSelection('`', '`', 'code'),
  link: insertLink,
  quote: () => togglePrefix('quote'),
  codeblock: insertBlockCode,
  ul: () => togglePrefix('ul'),
  ol: () => togglePrefix('ol'),
  task: () => togglePrefix('task'),
  table: insertTable,
  hr: insertHr
};

function formatAction(action, arg) {
  if (state.mode === 'preview') {
    toast('预览模式下不可编辑，可按 Ctrl+\\ 切到可编辑视图');
    return;
  }
  if (usePreviewEdits()) {
    formatInPreview(action, arg);
    return;
  }
  if (action === 'heading') {
    toggleHeading(arg);
    return;
  }
  const fn = SOURCE_FORMAT[action];
  if (fn) fn();
}

function deleteBlockAction() {
  if (usePreviewEdits()) previewDeleteBlock();
  else applyLineTransform((lines) => (lines.length ? [''] : null));
}

/* ═══════════════════ 文件操作 ═══════════════════ */

function suggestName(ext) {
  const doc = activeDoc();
  const base = state.filePath
    ? basename(state.filePath).replace(/\.[^.]+$/, '')
    : doc
      ? `未命名 ${doc.untitled}`
      : '未命名';
  return base + ext;
}

function focusActiveSurface() {
  if (state.mode === 'split') el.editor.focus();
  else if (state.mode !== 'preview') el.preview.focus();
}

/** 新建：在当前文档后面再加一个标签，不覆盖原文档 */
function newDocument() {
  createDoc({});
  focusActiveSurface();
  toast('已新建文档');
}

async function openDocument() {
  const res = await api.openDialog();
  if (!res || res.canceled) return;
  if (res.error) {
    toast('打开失败：' + res.error, 2600);
    return;
  }
  loadDocument(res.filePath, res.content);
}

/** 打开文件：已打开的切过去，否则新开一个标签 */
function loadDocument(filePath, content) {
  const existing = findDocByPath(filePath);
  if (existing) {
    activateDoc(existing.id);
    focusActiveSurface();
    toast(`已切到 ${basename(filePath)}`);
    return;
  }
  createDoc({ filePath, text: content });
  focusActiveSurface();
  toast(`已打开 ${basename(filePath)}`);
}

async function saveDocument(saveAs = false) {
  flushPreviewEdit();
  if (!state.filePath || saveAs) {
    const res = await api.saveFileAs(state.text, suggestName('.md'));
    if (!res || res.canceled) return false;
    if (!res.ok) {
      toast('保存失败：' + res.error, 2600);
      return false;
    }
    state.filePath = res.filePath;
  } else {
    const res = await api.saveFile(state.filePath, state.text);
    if (!res.ok) {
      toast('保存失败：' + res.error, 2600);
      return false;
    }
  }
  clearDirty();
  updateTitle();
  el.sbSave.textContent = '已保存';
  el.sbSave.classList.add('saving');
  setTimeout(() => {
    el.sbSave.classList.remove('saving');
    if (!state.dirty) el.sbSave.textContent = '已保存';
  }, 1200);
  toast('已保存');
  return true;
}

let autoSaveTimer = null;
function scheduleAutoSave() {
  if (!state.autoSave || !state.filePath) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveDocument(), 2500);
}

/* ═══════════════════ 图片插入 ═══════════════════ */

const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

function imageFilesFrom(dt) {
  const out = [];
  if (!dt) return out;
  if (dt.items && dt.items.length) {
    Array.from(dt.items).forEach((it) => {
      if (it.kind === 'file' && /^image\//i.test(it.type || '')) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    });
  }
  if (!out.length && dt.files) {
    Array.from(dt.files).forEach((f) => {
      if (/^image\//i.test(f.type || '') || IMAGE_FILE_RE.test(f.name || '')) out.push(f);
    });
  }
  return out;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 剪贴板/拖入的图片 → 主进程可识别的描述 */
async function collectImageItems(files) {
  const items = [];
  for (const file of files) {
    const abs = api.pathForFile(file);
    if (abs) items.push({ path: abs });
    else if (file) items.push({ dataUrl: await fileToDataUrl(file), name: file.name || '' });
  }
  return items;
}

function insertImageMarkdown(rel, name) {
  const alt = String(name || '图片').replace(/\.[^.]+$/, '') || '图片';
  if (usePreviewEdits()) {
    withPreviewSelection(() => {
      document.execCommand(
        'insertHTML',
        false,
        `<img src="${escapeHtml(absImageSrc(rel))}" alt="${escapeHtml(alt)}"><p><br></p>`
      );
    });
    resolvePreviewImages();
    return;
  }
  const ta = el.editor;
  const needNl = ta.selectionStart > 0 && ta.value[ta.selectionStart - 1] !== '\n' ? '\n' : '';
  insertText(ta, `${needNl}![${alt}](${rel})\n`);
}

let imageBusy = false;

async function insertImages(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return;
  if (!activeDoc()) {
    toast('请先新建或打开一个文档', 1800);
    return;
  }
  if (state.mode === 'preview') {
    toast('预览模式下不可编辑，可按 Ctrl+\\ 切到可编辑视图');
    return;
  }
  if (imageBusy) return;
  imageBusy = true;
  try {
    if (!state.filePath) {
      const choice = await api.confirm({
        title: '插入图片',
        message: '图片会复制到文档同目录的 assets 文件夹，需要先保存当前文档。是否现在保存？',
        buttons: ['保存文档', '取消'],
        defaultId: 0,
        cancelId: 1
      });
      if (choice !== 0) return;
      if (!(await saveDocument(true))) return;
    }
    const res = await api.importImages({ docPath: state.filePath, items: list });
    if (!res || !res.ok) {
      toast('插入图片失败：' + ((res && res.error) || '未知错误'), 2600);
      return;
    }
    if (!res.files.length) {
      toast('没有可插入的图片', 2000);
      return;
    }
    res.files.forEach((f) => insertImageMarkdown(f.rel, f.name));
    flushPreviewEdit();
    toast(res.files.length > 1 ? `已插入 ${res.files.length} 张图片` : '已插入图片', 1600);
  } catch (err) {
    toast('插入图片失败：' + err.message, 2600);
  } finally {
    imageBusy = false;
  }
}

async function pickAndInsertImages() {
  if (state.mode === 'preview') {
    toast('预览模式下不可编辑，可按 Ctrl+\\ 切到可编辑视图');
    return;
  }
  const res = await api.pickImages();
  if (!res || res.canceled || !res.files || !res.files.length) return;
  await insertImages(res.files.map((p) => ({ path: p })));
}

async function insertImageFiles(files) {
  if (!files || !files.length) return false;
  await insertImages(await collectImageItems(files));
  return true;
}

/* ═══════════════════ 窗口钉住 ═══════════════════ */

function applyPin() {
  api.setAlwaysOnTop(state.pinned);
  const btn = el.toolbar.querySelector('.tool-btn[data-action="pin"]');
  if (btn) btn.classList.toggle('on', state.pinned);
}

function togglePin() {
  state.pinned = !state.pinned;
  applyPin();
  localStorage.setItem(LS.pinned, state.pinned ? '1' : '0');
  toast(state.pinned ? '已钉住窗口' : '已取消钉住', 1200);
}

async function exportHtml() {
  flushPreviewEdit();
  const holder = document.createElement('div');
  holder.innerHTML = md.render(state.text);
  resolveImagesIn(holder);
  const body = holder.innerHTML;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${state.filePath ? basename(state.filePath) : '未命名'}</title>
<style>
  body { max-width: 760px; margin: 0 auto; padding: 48px 24px 120px; background: #fff; color: #1c1f23;
         font-family: "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
         font-size: 16px; line-height: 1.8; }
  h1, h2, h3, h4, h5, h6 { font-weight: 650; line-height: 1.35; margin: 1.5em 0 .6em; }
  h1 { font-size: 1.7em; border-bottom: 1px solid #ebedf0; padding-bottom: .3em; }
  h2 { font-size: 1.34em; border-bottom: 1px solid #ebedf0; padding-bottom: .26em; }
  a { color: #5856eb; text-decoration: none; }
  code { font-family: Consolas, "JetBrains Mono", monospace; font-size: .86em; background: #f6f7f9;
         color: #d6336c; padding: .16em .42em; border-radius: 5px; }
  pre { background: #f6f7f9; border: 1px solid #ebedf0; border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; color: #1c1f23; padding: 0; font-size: .85em; line-height: 1.65; }
  blockquote { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 3px solid #5856eb; color: #5f6672; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #dcdfe4; padding: .48em .78em; text-align: left; }
  th { background: #f6f7f9; }
  img { max-width: 100%; border-radius: 10px; }
  hr { border: none; border-top: 1px solid #dcdfe4; margin: 1.9em 0; }
  .hljs-comment { color: #6e7781; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-name, .hljs-tag { color: #cf222e; }
  .hljs-string, .hljs-regexp { color: #0a3069; }
  .hljs-number, .hljs-literal, .hljs-built_in, .hljs-attr { color: #0550ae; }
  .hljs-title, .hljs-section, .hljs-function { color: #8250df; }
  .hljs-variable, .hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta { color: #953800; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  const res = await api.exportHtml(html, suggestName('.html'));
  if (!res || res.canceled) return;
  if (!res.ok) {
    toast('导出失败：' + res.error, 2600);
    return;
  }
  toast('已导出 HTML');
}

/* ═══════════════════ 查找与替换 ═══════════════════ */

let findMatches = [];        // 源码模式：每处匹配的起始下标
let previewRanges = [];      // 预览区：每处匹配的 Range（用来高亮和定位）
let previewMatchIdx = -1;    // 当前定位在第几处

/* 用 CSS Custom Highlight API 高亮匹配：不改动 DOM，也就不会影响编辑与回写 */
const HL_OK = typeof Highlight === 'function' && typeof CSS !== 'undefined' && !!CSS.highlights;
if (HL_OK) {
  CSS.highlights.set('find-all', new Highlight());
  CSS.highlights.set('find-cur', new Highlight());
}

function clearFindHighlights() {
  if (!HL_OK) return;
  CSS.highlights.get('find-all').clear();
  CSS.highlights.get('find-cur').clear();
}

function paintFindHighlights() {
  if (!HL_OK) return;
  const all = CSS.highlights.get('find-all');
  const cur = CSS.highlights.get('find-cur');
  all.clear();
  cur.clear();
  previewRanges.forEach((r) => all.add(r));
  const r = previewRanges[previewMatchIdx];
  if (r) cur.add(r);
}

function findScope() {
  return usePreviewEdits() ? 'preview' : 'source';
}

function openFind(withReplace) {
  el.findbar.hidden = false;
  el.findbar.classList.toggle('collapsed', !withReplace);
  el.findInput.focus();
  el.findInput.select();
  if (el.findInput.value) refreshFindMatches({ jump: true });
}

function closeFind() {
  el.findbar.hidden = true;
  findMatches = [];
  previewRanges = [];
  previewMatchIdx = -1;
  clearFindHighlights();
  if (state.mode === 'split') el.editor.focus();
  else if (state.mode !== 'preview') el.preview.focus();
}

function textNodesIn(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function computePreviewRanges(q) {
  const needle = q.toLowerCase();
  const ranges = [];
  textNodesIn(el.preview).forEach((node) => {
    const hay = node.nodeValue.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + needle.length);
      ranges.push(r);
      i = hay.indexOf(needle, i + Math.max(needle.length, 1));
    }
  });
  return ranges;
}

function computeSourceMatches(q) {
  const hay = el.editor.value.toLowerCase();
  const needle = q.toLowerCase();
  const out = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + Math.max(needle.length, 1));
  }
  return out;
}

/** 把预览区里某一处匹配滚动到可视区域中间（按匹配自身的矩形，长段落也能准确定位） */
function scrollPreviewToRange(range) {
  if (!range) return;
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.height && !rect.width)) return;
  const box = el.previewScroll.getBoundingClientRect();
  el.previewScroll.scrollTop += (rect.top + rect.height / 2) - (box.top + box.height / 2);
}

/** 重新检索所有匹配，并可选地直接跳到第一处 */
function refreshFindMatches({ jump = false } = {}) {
  const q = el.findInput.value;
  previewRanges = q ? computePreviewRanges(q) : [];
  const sourceScope = findScope() === 'source';
  findMatches = sourceScope && q ? computeSourceMatches(q) : [];
  previewMatchIdx = previewRanges.length ? 0 : -1;

  const range = previewRanges[previewMatchIdx];
  if (range) {
    state.previewRange = range.cloneRange();
    if (jump) scrollPreviewToRange(range);
  }
  if (jump && sourceScope && findMatches.length) {
    const ta = el.editor;
    ta.setSelectionRange(findMatches[0], findMatches[0] + q.length);
  }
  paintFindHighlights();
  updateFindLabel();
}

/** 预览区重新渲染后重建高亮（Range 会随 DOM 一起失效） */
function rebuildFindHighlights() {
  if (el.findbar.hidden) return;
  const q = el.findInput.value;
  if (!q) return;
  previewRanges = computePreviewRanges(q);
  if (previewMatchIdx >= previewRanges.length) previewMatchIdx = previewRanges.length - 1;
  paintFindHighlights();
  updateFindLabel();
}

function updateFindLabel() {
  if (!previewRanges.length) {
    el.findCount.textContent = '0/0';
    return;
  }
  el.findCount.textContent = `${previewMatchIdx + 1}/${previewRanges.length}`;
}

function scrollTextareaToCaret(ta) {
  const before = ta.value.slice(0, ta.selectionStart);
  const line = before.split('\n').length;
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24;
  ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2);
}

/** 把第 idx 处匹配设为当前定位（循环滚动） */
function focusMatch(idx) {
  const n = previewRanges.length;
  if (!n) return;
  previewMatchIdx = ((idx % n) + n) % n;
  const range = previewRanges[previewMatchIdx];
  if (range) {
    state.previewRange = range.cloneRange();
    scrollPreviewToRange(range);
  }
  paintFindHighlights();
  updateFindLabel();
}

function findStep(backward) {
  const q = el.findInput.value;
  if (!q) return;
  if (!previewRanges.length) {
    toast('没有找到匹配内容');
    return;
  }

  // 定位在预览区（三个视图下都可见），源码模式再同步选中源码里的同一处
  focusMatch(previewMatchIdx < 0 ? 0 : previewMatchIdx + (backward ? -1 : 1));

  if (findScope() === 'source') {
    const pos = findMatches[previewMatchIdx];
    if (pos !== undefined) {
      const ta = el.editor;
      ta.setSelectionRange(pos, pos + q.length);
      scrollTextareaToCaret(ta);
    }
  }
}

function replaceCurrent() {
  const q = el.findInput.value;
  if (!q) return;

  if (findScope() === 'preview') {
    // 直接替换当前高亮的那一处，然后自动跳到下一处
    const r = previewRanges[previewMatchIdx];
    if (!r) {
      findStep(false);
      return;
    }
    const keep = previewMatchIdx;
    r.deleteContents();
    r.insertNode(document.createTextNode(el.replaceInput.value));
    onPreviewInput();
    refreshFindMatches();
    if (previewRanges.length) focusMatch(Math.min(keep, previewRanges.length - 1));
    return;
  }

  const ta = el.editor;
  if (!q || !ta.value.slice(ta.selectionStart, ta.selectionEnd).toLowerCase().includes(q.toLowerCase())) {
    findStep(false);
    return;
  }
  insertText(ta, el.replaceInput.value);
  state.text = el.editor.value;
  schedulePreview();
  markDirty();
  updateStatus();
  findStep(false);
}

function replaceAll() {
  flushPreviewEdit();
  const q = el.findInput.value;
  if (!q) return;
  const re = new RegExp(escapeRegExp(q), 'gi');
  const count = (state.text.match(re) || []).length;
  if (!count) {
    toast('没有找到匹配内容');
    return;
  }
  state.text = state.text.replace(re, () => el.replaceInput.value);
  el.editor.value = state.text;
  renderPreview(true);
  markDirty();
  updateStatus();
  refreshFindMatches();
  toast(`已替换 ${count} 处`);
}

/* ═══════════════════ 弹出菜单与模态 ═══════════════════ */

let popupCleanup = null;

function hidePopup() {
  el.popup.hidden = true;
  if (popupCleanup) {
    popupCleanup();
    popupCleanup = null;
  }
}

function showPopup(anchor, items) {
  hidePopup();
  el.popup.innerHTML = '';

  items.forEach((item) => {
    if (item.type === 'sep') {
      const d = document.createElement('div');
      d.className = 'popup-sep';
      el.popup.appendChild(d);
      return;
    }
    if (item.type === 'head') {
      const d = document.createElement('div');
      d.className = 'popup-head';
      d.textContent = item.label;
      el.popup.appendChild(d);
      return;
    }
    const row = document.createElement('div');
    row.className = 'popup-item' + (item.selected ? ' sel' : '');
    if (item.checked) {
      const c = document.createElement('span');
      c.className = 'check';
      c.textContent = '✓';
      row.appendChild(c);
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    row.appendChild(label);
    if (item.key) {
      const k = document.createElement('span');
      k.className = 'key';
      k.textContent = item.key;
      row.appendChild(k);
    }
    row.addEventListener('click', () => {
      hidePopup();
      if (item.onClick) item.onClick();
    });
    el.popup.appendChild(row);
  });

  el.popup.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const w = el.popup.offsetWidth;
  const h = el.popup.offsetHeight;
  let left = rect.right - w;
  if (left < 8) left = 8;
  let top = rect.bottom + 7;
  if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 7);
  el.popup.style.left = left + 'px';
  el.popup.style.top = top + 'px';

  setTimeout(() => {
    const onDocDown = (e) => {
      if (!el.popup.contains(e.target) && e.target !== anchor) hidePopup();
    };
    document.addEventListener('mousedown', onDocDown, true);
    popupCleanup = () => document.removeEventListener('mousedown', onDocDown, true);
  }, 0);
}

function closeModal() {
  el.modalMask.hidden = true;
  el.modalBox.innerHTML = '';
}

function openModal(builder) {
  el.modalBox.innerHTML = '';
  builder(el.modalBox);
  el.modalMask.hidden = false;
}

function showShortcuts() {
  openModal((box) => {
    const h2 = document.createElement('h2');
    h2.textContent = '键盘快捷键';
    const sub = document.createElement('p');
    sub.className = 'modal-sub';
    sub.textContent = '所有操作都可以用键盘完成';
    box.append(h2, sub);

    SHORTCUT_GROUPS.forEach(([title, list]) => {
      const h3 = document.createElement('h3');
      h3.textContent = title;
      box.appendChild(h3);
      const grid = document.createElement('div');
      grid.className = 'kbd-list';
      list.forEach(([name, keys]) => {
        const item = document.createElement('div');
        item.className = 'kbd-item';
        const span = document.createElement('span');
        span.textContent = name;
        const keysEl = document.createElement('span');
        keysEl.className = 'keys';
        keys.forEach((k) => {
          const kb = document.createElement('kbd');
          kb.textContent = k;
          keysEl.appendChild(kb);
        });
        item.append(span, keysEl);
        grid.appendChild(item);
      });
      box.appendChild(grid);
    });

    const close = document.createElement('button');
    close.className = 'modal-close';
    close.textContent = '关闭';
    close.addEventListener('click', closeModal);
    box.appendChild(close);
  });
}

function showAbout() {
  openModal((box) => {
    const h2 = document.createElement('h2');
    h2.textContent = '墨笺';
    const sub = document.createElement('p');
    sub.className = 'modal-sub';
    sub.textContent = '简约的本地 Markdown 编辑器 · 版本 1.0.0';
    const p = document.createElement('p');
    p.style.fontSize = '13px';
    p.style.color = 'var(--text-2)';
    p.style.lineHeight = '1.85';
    p.innerHTML =
      '完全离线运行，不会上传任何内容。<br>' +
      '直接在排版好的正文上编辑，保存时自动写成 Markdown。<br>' +
      '基于 Electron + markdown-it 构建，支持表格、代码高亮。<br><br>' +
      '文件菜单：<kbd>Ctrl</kbd> <kbd>N</kbd> 新建 · <kbd>Ctrl</kbd> <kbd>O</kbd> 打开 · <kbd>Ctrl</kbd> <kbd>S</kbd> 保存';
    const close = document.createElement('button');
    close.className = 'modal-close';
    close.textContent = '关闭';
    close.addEventListener('click', closeModal);
    box.append(h2, sub, p, close);
  });
}

/* ═══════════════════ 新手引导 ═══════════════════ */

let tourIndex = 0;

function showTour() {
  tourIndex = 0;
  el.tour.hidden = false;
  renderTourStep();
}

function closeTour() {
  el.tour.hidden = true;
  localStorage.setItem(LS.onboarded, '1');
}

function renderTourStep() {
  const step = TOUR_STEPS[tourIndex];
  el.tourStep.textContent = `第 ${tourIndex + 1} / ${TOUR_STEPS.length} 步`;
  el.tourTitle.textContent = step.title;
  el.tourBody.textContent = step.body;
  el.tourPrev.style.display = tourIndex === 0 ? 'none' : '';
  el.tourNext.textContent = tourIndex === TOUR_STEPS.length - 1 ? '开始使用' : '下一步';
  positionTour(step);
}

function positionTour(step) {
  const card = el.tourCard;
  const cw = card.offsetWidth || 336;
  const ch = card.offsetHeight || 180;
  const target = step.target ? document.querySelector(step.target) : null;
  const fill = { left: 0, top: 0, width: 0, height: 0 };

  if (target) {
    const pad = 6;
    const r = target.getBoundingClientRect();
    el.tourSpot.hidden = false;
    el.tourDim.hidden = true;
    fill.left = r.left - pad;
    fill.top = r.top - pad;
    fill.width = r.width + pad * 2;
    fill.height = r.height + pad * 2;
    Object.assign(el.tourSpot.style, {
      left: `${fill.left}px`,
      top: `${fill.top}px`,
      width: `${fill.width}px`,
      height: `${fill.height}px`
    });
    let top = r.bottom + 14;
    let left = r.left;
    if (top + ch > window.innerHeight - 12) {
      top = r.top - ch - 14 >= 12
        ? r.top - ch - 14
        : Math.round((window.innerHeight - ch) / 2);
    }
    if (left + cw > window.innerWidth - 12) left = window.innerWidth - cw - 12;
    card.style.left = `${Math.max(12, left)}px`;
    card.style.top = `${top}px`;
  } else {
    el.tourSpot.hidden = true;
    el.tourDim.hidden = false;
    card.style.left = `${Math.max(12, (window.innerWidth - cw) / 2)}px`;
    card.style.top = `${Math.round(window.innerHeight * 0.34)}px`;
  }
}

function bindTour() {
  el.tourNext.addEventListener('click', () => {
    if (tourIndex === TOUR_STEPS.length - 1) {
      closeTour();
      focusActiveSurface();
      return;
    }
    tourIndex++;
    renderTourStep();
  });
  el.tourPrev.addEventListener('click', () => {
    if (tourIndex === 0) return;
    tourIndex--;
    renderTourStep();
  });
  el.tourSkip.addEventListener('click', () => {
    closeTour();
    focusActiveSurface();
  });
  window.addEventListener('resize', () => {
    if (!el.tour.hidden) positionTour(TOUR_STEPS[tourIndex]);
  });
}

function tourVisible() {
  return !el.tour.hidden;
}

/* ═══════════════════ 工具栏 ═══════════════════ */

function bindToolbar() {
  // 没有打开的文档时，菜单里需要文档的项直接跳过
  const withDoc = (fn) => () => { if (activeDoc()) fn(); };

  document.querySelectorAll('.tool-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;

      // 空状态下只保留「新建 / 打开 / 钉住 / 主题 / 更多」
      if (!activeDoc() && !['new', 'open', 'pin', 'theme', 'menu'].includes(action)) return;

      if (action === 'new') return newDocument();
      if (action === 'open') return openDocument();
      if (action === 'save') return saveDocument(false);
      if (action === 'find') return openFind(false);
      if (action === 'image') return pickAndInsertImages();
      if (action === 'pin') return togglePin();
      if (action === 'theme') {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        applyTheme();
        return;
      }
      if (action === 'heading-menu') {
        return showPopup(btn, [
          { type: 'head', label: '标题级别' },
          ...[1, 2, 3, 4, 5, 6].map((lv) => ({
            label: `标题 ${lv}`,
            key: `Ctrl+${lv}`,
            onClick: () => formatAction('heading', lv)
          })),
          { type: 'sep' },
          { label: '正文（取消标题）', key: 'Ctrl+0', onClick: () => formatAction('heading', 0) }
        ]);
      }
      if (action === 'list-menu') {
        return showPopup(btn, [
          { label: '无序列表', key: 'Ctrl+Shift+U', onClick: () => formatAction('ul') },
          { label: '有序列表', key: 'Ctrl+Shift+O', onClick: () => formatAction('ol') },
          { label: '任务列表', key: 'Ctrl+Shift+T', onClick: () => formatAction('task') }
        ]);
      }
      if (action === 'menu') {
        return showPopup(btn, [
          { label: '另存为…', key: 'Ctrl+Shift+S', onClick: withDoc(() => saveDocument(true)) },
          { label: '导出 HTML…', key: 'Ctrl+Shift+E', onClick: withDoc(exportHtml) },
          { label: '打印 / 导出 PDF', key: 'Ctrl+P', onClick: withDoc(() => api.print()) },
          ...(state.filePath
            ? [{ label: '在文件夹中显示', onClick: () => api.revealInFolder(state.filePath) }]
            : []),
          { type: 'sep' },
          {
            label: '自动保存',
            checked: state.autoSave,
            onClick: () => {
              state.autoSave = !state.autoSave;
              localStorage.setItem(LS.autosave, state.autoSave ? '1' : '0');
              toast(state.autoSave ? '已开启自动保存' : '已关闭自动保存');
              if (state.autoSave) scheduleAutoSave();
            }
          },
          { type: 'sep' },
          { label: '新手引导', onClick: showTour },
          { label: '快捷键说明', key: 'F1', onClick: showShortcuts },
          { label: '关于墨笺', onClick: showAbout }
        ]);
      }

      if (action === 'pin') return;
      formatAction(action);
    });
  });

  el.modeSwitch.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
}

/* ═══════════════════ 快捷键 ═══════════════════ */

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;

    if (key === 'Escape') {
      if (tourVisible()) return closeTour();
      if (!el.modalMask.hidden) return closeModal();
      if (!el.findbar.hidden) return closeFind();
      if (!el.popup.hidden) return hidePopup();
      return;
    }

    if (tourVisible()) {
      if (key === 'ArrowRight' || key === 'Enter') {
        e.preventDefault();
        return el.tourNext.click();
      }
      if (key === 'ArrowLeft') {
        e.preventDefault();
        return el.tourPrev.click();
      }
      return;
    }

    if (key === 'F1') {
      e.preventDefault();
      return showShortcuts();
    }
    if (key === 'F11') {
      e.preventDefault();
      return api.toggleFullScreen();
    }

    // Ctrl+Tab / Ctrl+Shift+Tab 切换标签
    if (mod && key === 'Tab') {
      e.preventDefault();
      return cycleTab(e.shiftKey ? -1 : 1);
    }

    // 没有任何打开的文档时，只响应新建 / 打开
    if (!activeDoc()) {
      if (mod && lower === 'n') { e.preventDefault(); return newDocument(); }
      if (mod && lower === 'o') { e.preventDefault(); return openDocument(); }
      return;
    }

    if (mod && e.shiftKey) {
      switch (lower) {
        case 's': e.preventDefault(); return saveDocument(true);
        case 'e': e.preventDefault(); return exportHtml();
        case 'd':
          e.preventDefault();
          state.theme = state.theme === 'light' ? 'dark' : 'light';
          return applyTheme();
        case 'p': e.preventDefault(); return setMode('preview');
        case 'q': e.preventDefault(); return formatAction('quote');
        case 'c': e.preventDefault(); return formatAction('codeblock');
        case 'u': e.preventDefault(); return formatAction('ul');
        case 'o': e.preventDefault(); return formatAction('ol');
        case 't': e.preventDefault(); return formatAction('task');
        case 'k': e.preventDefault(); return deleteBlockAction();
        case 'r': e.preventDefault(); return formatAction('hr');
        case '+':
        case '=':
          e.preventDefault();
          state.fontSize = clamp(state.fontSize + 1, 12, 22);
          return applyFontSize();
        case '-':
        case '_':
          e.preventDefault();
          state.fontSize = clamp(state.fontSize - 1, 12, 22);
          return applyFontSize();
        default: break;
      }
      return;
    }

    if (mod) {
      if (lower === 'n') { e.preventDefault(); return newDocument(); }
      if (lower === 'o') { e.preventDefault(); return openDocument(); }
      if (lower === 's') { e.preventDefault(); return saveDocument(false); }
      if (lower === 'w') {
        e.preventDefault();
        if (state.activeId) return closeTab(state.activeId);
        return;
      }
      if (lower === 'b') { e.preventDefault(); return formatAction('bold'); }
      if (lower === 'i') { e.preventDefault(); return formatAction('italic'); }
      if (lower === 'k') { e.preventDefault(); return formatAction('link'); }
      if (lower === 'f') { e.preventDefault(); return openFind(false); }
      if (lower === 'h') { e.preventDefault(); return openFind(true); }
      if (lower === 'p') { e.preventDefault(); return api.print(); }
      if (lower === '\\') { e.preventDefault(); return setMode(state.mode === 'split' ? 'wysiwyg' : 'split'); }
      if (key === '`') { e.preventDefault(); return formatAction('code'); }
      if (key === 't') { e.preventDefault(); return formatAction('table'); }
      if (/^[0-6]$/.test(key)) { e.preventDefault(); return formatAction('heading', Number(key)); }
    }

    if (openFindActive() && key === 'Enter') {
      e.preventDefault();
      return findStep(e.shiftKey);
    }
  });
}

function openFindActive() {
  return !el.findbar.hidden && document.activeElement === el.findInput;
}

/* ═══════════════════ 编辑面事件 ═══════════════════ */

function bindEditor() {
  el.editor.addEventListener('input', () => {
    state.text = el.editor.value;
    markDirty();
    updateStatus();
    scheduleAutoSave();
    schedulePreview();
  });

  el.editor.addEventListener('keyup', updateStatus);
  el.editor.addEventListener('click', updateStatus);
  el.editor.addEventListener('focus', () => { state.lastFocus = 'source'; });

  el.editor.addEventListener('paste', (e) => {
    const files = imageFilesFrom(e.clipboardData);
    if (files.length) {
      e.preventDefault();
      insertImageFiles(files);
    }
  });

  el.editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (e.shiftKey) {
      const value = el.editor.value;
      const start = el.editor.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (value.slice(lineStart, lineStart + 2) === '  ') {
        el.editor.setRangeText('', lineStart, lineStart + 2, 'end');
        el.editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      insertText(el.editor, '  ');
    }
  });

  // 预览区：可直接编辑
  el.preview.addEventListener('input', () => {
    refreshBlankFlags();
    onPreviewInput();
  });
  el.preview.addEventListener('focus', () => { state.lastFocus = 'preview'; });
  el.preview.addEventListener('blur', flushPreviewEdit);
  el.preview.addEventListener('paste', (e) => {
    const files = imageFilesFrom(e.clipboardData);
    if (files.length) {
      e.preventDefault();
      insertImageFiles(files);
      return;
    }
    setTimeout(onPreviewInput, 0);
  });

  // 空代码块（除了零宽空格锚点没有任何内容）点不进去，点击时主动把光标放进 code 内
  el.preview.addEventListener('mousedown', (e) => {
    const pre = e.target && e.target.closest ? e.target.closest('pre') : null;
    const code = pre && pre.firstChild;
    if (!code || code.nodeName !== 'CODE' || !isBlankCode(code)) return;
    e.preventDefault();
    el.preview.focus();
    ensureCodeAnchor(code);
    caretAtStart(code);
  });

  // 代码块内的回车：真实换行；在当前空行上回车则退出代码块。
  // 走 beforeinput（回车/换行最终都由这个编辑命令落地），避免 <code> 被拆成多块。
  el.preview.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertParagraph' && e.inputType !== 'insertLineBreak') return;
    const pre = previewPreAtCaret();
    if (!pre) return; // 普通段落保持浏览器默认行为
    e.preventDefault();
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    const before = document.createRange();
    before.selectNodeContents(pre);
    before.setEnd(range.endContainer, range.endOffset);
    const beforeText = codeTextOf(before.cloneContents());
    const after = document.createRange();
    after.selectNodeContents(pre);
    after.setStart(range.endContainer, range.endOffset);
    const atEnd = codeTextOf(after.cloneContents()) === '';
    const onBlankLine = /^[ \t]*$/.test(beforeText.slice(beforeText.lastIndexOf('\n') + 1));
    // 刚插入、还没输入内容、也没有换行标记的空代码块：回车不应把它变回段落
    const bareBlock = codeTextOf(pre).trim() === '' && !pre.querySelector('br');
    if (bareBlock) {
      // 空代码块里的回车不做事，避免刚插入的块被直接变成段落
    } else if (atEnd && onBlankLine && e.inputType === 'insertParagraph') {
      exitCodeBlock(pre);
    } else {
      insertNewlineInCode();
    }
    onPreviewInput();
  });

  el.preview.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const pre = previewPreAtCaret();
    if (pre && e.key === 'Escape') {
      e.preventDefault();
      exitCodeBlock(pre);
      onPreviewInput();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (pre) document.execCommand('insertText', false, '    '); // 代码块内用真实空格
      else document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
      onPreviewInput();
    }
  });

  el.editor.addEventListener('scroll', () => syncScroll(el.editor, el.previewScroll));
  el.previewScroll.addEventListener('scroll', () => syncScroll(el.previewScroll, el.editor));

  // 记录预览区中的选区，供工具栏格式化使用
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel.rangeCount && el.preview.contains(sel.anchorNode)) {
      state.previewRange = sel.getRangeAt(0).cloneRange();
    }
  });
}

let scrollLock = false;
function syncScroll(from, to) {
  if (scrollLock || state.mode !== 'split') return;
  scrollLock = true;
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  const ratio = fromMax > 0 ? from.scrollTop / fromMax : 0;
  to.scrollTop = ratio * toMax;
  requestAnimationFrame(() => { scrollLock = false; });
}

function bindSplitter() {
  el.splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = el.workspace.getBoundingClientRect();
    el.splitter.classList.add('dragging');
    const onMove = (ev) => {
      state.split = clamp(((ev.clientX - rect.left) / rect.width) * 100, 16, 84);
      applySplit();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.splitter.classList.remove('dragging');
      localStorage.setItem(LS.split, String(Math.round(state.split)));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/* ═══════════════════ 查找面板事件 ═══════════════════ */

function bindFindbar() {
  $('findNext').addEventListener('click', () => findStep(false));
  $('findPrev').addEventListener('click', () => findStep(true));
  $('findClose').addEventListener('click', closeFind);
  $('replaceOne').addEventListener('click', replaceCurrent);
  $('replaceAll').addEventListener('click', replaceAll);
  $('toggleReplace').addEventListener('click', () => {
    el.findbar.classList.toggle('collapsed');
  });
  el.findInput.addEventListener('input', (e) => {
    if (e.isComposing) return; // 输入法组词过程中不跳
    refreshFindMatches({ jump: true });
  });
  // 中文等输入法提交组词后不一定补发 input 事件，只靠上面的监听会继续按旧词检索，
  // 因此组词结束时也刷新一次
  el.findInput.addEventListener('compositionend', () => {
    refreshFindMatches({ jump: true });
  });
  el.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findStep(e.shiftKey);
    }
  });
}

/* ═══════════════════ 拖放打开 ═══════════════════ */

function bindDragDrop() {
  let depth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer.types || []).includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    el.dropOverlay.hidden = false;
  });

  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.dropOverlay.hidden = true;
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    el.dropOverlay.hidden = true;
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length) return;

    // 全是图片 → 作为图片插入文档
    const images = imageFilesFrom(e.dataTransfer);
    if (images.length === files.length) {
      await insertImageFiles(images);
      return;
    }

    const file = files.find((f) => !images.includes(f));
    const filePath = file && api.pathForFile(file);
    if (!filePath) return;
    const res = await api.readFile(filePath);
    if (!res.ok) {
      toast('打开失败：' + res.error, 2600);
      return;
    }
    loadDocument(res.filePath, res.content);
  });
}

/* ═══════════════════ 标签栏事件 ═══════════════════ */

function bindTabs() {
  el.tabAdd.addEventListener('click', () => newDocument());
  el.esNew.addEventListener('click', () => newDocument());
  el.esOpen.addEventListener('click', () => openDocument());

  el.tabs.addEventListener('click', (e) => {
    const closeEl = e.target.closest('.tab-close');
    if (closeEl) {
      e.stopPropagation();
      closeTab(Number(closeEl.dataset.close));
      return;
    }
    const tabEl = e.target.closest('.tab');
    if (tabEl) activateDoc(Number(tabEl.dataset.id));
  });

  // 中键关闭
  el.tabs.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const tabEl = e.target.closest('.tab');
    if (tabEl) {
      e.preventDefault();
      closeTab(Number(tabEl.dataset.id));
    }
  });
}

/* ═══════════════════ 窗口与主进程通信 ═══════════════════ */

function bindWindow() {
  el.btnMin.addEventListener('click', () => api.minimize());
  el.btnMax.addEventListener('click', () => api.toggleMaximize());
  el.btnClose.addEventListener('click', () => api.closeWindow());

  el.modalMask.addEventListener('mousedown', (e) => {
    if (e.target === el.modalMask) closeModal();
  });

  api.on('file:load', ({ filePath, content }) => {
    loadDocument(filePath, content);
  });

  api.on('app:query-close', () => {
    handleAppClose();
  });
}

/* ═══════════════════ 启动 ═══════════════════ */

function loadPrefs() {
  state.theme = localStorage.getItem(LS.theme) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  state.mode = localStorage.getItem(LS.mode) || 'split';
  state.fontSize = Number(localStorage.getItem(LS.fs)) || 15;
  state.split = Number(localStorage.getItem(LS.split)) || 50;
  state.autoSave = localStorage.getItem(LS.autosave) === '1';
  state.pinned = localStorage.getItem(LS.pinned) === '1';
}

function boot() {
  loadPrefs();
  applyTheme();
  applyFontSize();
  applySplit();

  bindToolbar();
  bindShortcuts();
  bindEditor();
  bindSplitter();
  bindFindbar();
  bindTableBar();

  bindDragDrop();
  bindWindow();
  bindTabs();
  bindTour();

  // 打开即为一个空白文档（标签页模型，新建不会覆盖它）
  createDoc({});
  setMode(state.mode);
  applyPin();
  updateStatus();

  if (!localStorage.getItem(LS.onboarded)) {
    setTimeout(showTour, 260);
  }
}

boot();
