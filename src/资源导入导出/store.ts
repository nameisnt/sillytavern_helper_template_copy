import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import type {
  CategoryId,
  ConflictStrategy,
  DuplicateFilter,
  DuplicateSource,
  ImportEntry,
  SortKey,
  SortOrder,
  StatusFilter,
  TavernResourceMatch,
} from './types';
import { CATEGORY_LIST, categorizeType } from './types';

type FileSystemDirectoryHandleLike = {
  entries: () => AsyncIterableIterator<[string, { kind: 'file' | 'directory' }]>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};
type FileSystemFileHandleLike = {
  getFile?: () => Promise<File>;
  createWritable: (options?: { keepExistingData?: boolean }) => Promise<{
    write: (data: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type DuplicateGroup = {
  id: string;
  source: Exclude<DuplicateSource, 'none'>;
  compareKey: string;
  label: string;
  entries: ImportEntry[];
  tavernMatches: TavernResourceMatch[];
  warnings: string[];
};

type ResultDialogItem = {
  id: string;
  displayName: string;
  type: string;
  path?: string;
  status: 'error' | 'skipped';
  reason: string;
};

type ResultDialogState = {
  visible: boolean;
  title: string;
  success: number;
  failed: number;
  skipped: number;
  items: ResultDialogItem[];
};

type PreflightDialogState = {
  visible: boolean;
  title: string;
  itemIds: string[];
  warnings: Array<{ id: string; displayName: string; messages: string[] }>;
};

type DeleteConfirmState = {
  visible: boolean;
  title: string;
  itemIds: string[];
  paths: string[];
};

type CharacterDeleteConfirmState = {
  visible: boolean;
  target: TavernResourceMatch | null;
};

type TavernResourceIndex = Map<string, TavernResourceMatch[]>;

async function readDirHandle(
  handle: FileSystemDirectoryHandleLike,
  path: string,
  files: Map<string, File>,
  options?: { shouldContinue?: () => boolean; yieldEvery?: number },
) {
  let counter = 0;
  const yieldEvery = Math.max(10, Math.floor(options?.yieldEvery ?? 50));

  for await (const [name, entry] of handle.entries()) {
    if (options?.shouldContinue && !options.shouldContinue()) return;

    counter++;
    if (counter % yieldEvery === 0) await new Promise<void>(r => setTimeout(r, 0));

    const fullPath = path ? `${path}/${name}` : name;
    if (entry.kind === 'file') {
      const file = await (entry as any).getFile();
      files.set(fullPath, file);
    } else {
      await readDirHandle(entry as any, fullPath, files, options);
    }
  }
}

function pickFolderLegacy(files: Map<string, File>): Promise<void> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = () => {
      for (const file of input.files!) {
        const parts = file.webkitRelativePath.split('/');
        parts.shift();
        files.set(parts.join('/'), file);
      }
      resolve();
    };
    input.oncancel = () => resolve();
    input.click();
  });
}

function findExistingScript(trees: ScriptTree[], name: string): Script | null {
  for (const tree of trees) {
    if (tree.type === 'script' && tree.name === name) return tree;
    if (tree.type === 'folder') {
      const found = tree.scripts.find(s => s.name === name);
      if (found) return found;
    }
  }
  return null;
}

function stripExt(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

function normalizePath(path: string) {
  const parts = path.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function resolveRelativePath(baseFilePath: string, relative: string) {
  const baseDir = baseFilePath.includes('/') ? baseFilePath.slice(0, baseFilePath.lastIndexOf('/')) : '';
  const joined = baseDir ? `${baseDir}/${relative}` : relative;
  return normalizePath(joined);
}

function guessTypeByFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png' || ext === 'webp') return 'character';
  if (ext === 'jsonl') return 'chat';
  if (ext === 'css') return 'theme';
  if (ext === 'js' || ext === 'ts') return 'script';
  if (ext === 'json') return 'auto_json';
  return 'unknown';
}

function guessTypeByPath(path: string): string {
  const p = path.toLowerCase();
  if (/(^|\/)(预设|preset)(\/|$)/i.test(p)) return 'preset';
  if (/(^|\/)(世界书|worldbook)(\/|$)/i.test(p)) return 'worldbook';
  if (/(^|\/)(正则|regex)(\/|$)/i.test(p)) return 'regex';
  if (/(^|\/)(聊天|chat)(\/|$)/i.test(p)) return 'chat';
  if (/(^|\/)(脚本|script)(\/|$)/i.test(p)) return 'script';
  if (/(^|\/)(美化|theme)(\/|$)/i.test(p)) return 'theme';
  if (/(^|\/)(背景|background|backgrounds)(\/|$)/i.test(p)) return 'background';
  if (/(^|\/)(角色|character)(\/|$)/i.test(p)) return 'character';
  const filename = path.split('/').pop() || path;
  return guessTypeByFilename(filename);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function objHasAnyKey(obj: Record<string, unknown>, keys: string[]) {
  return keys.some(k => Object.prototype.hasOwnProperty.call(obj, k));
}

function looksLikeWorldbook(data: unknown) {
  if (!isPlainObject(data)) return false;
  const maybeArray = (k: string) => Array.isArray((data as Record<string, unknown>)[k]);
  if (maybeArray('world_info') || maybeArray('entries')) return true;
  if (isPlainObject((data as Record<string, unknown>).world_info)) return true;
  return false;
}

function looksLikeChat(data: unknown) {
  const looksLikeMessage = (v: unknown) =>
    isPlainObject(v) &&
    objHasAnyKey(v, ['mes', 'message', 'text', 'content']) &&
    objHasAnyKey(v, ['name', 'role', 'sender']);

  if (Array.isArray(data) && data.length > 0) return looksLikeMessage(data[0]);
  if (isPlainObject(data) && Array.isArray((data as Record<string, unknown>).messages)) {
    const messages = (data as Record<string, unknown>).messages as unknown[];
    if (messages.length > 0) return looksLikeMessage(messages[0]);
  }
  return false;
}

function looksLikeRegex(data: unknown) {
  const looksLikeRule = (v: unknown) =>
    isPlainObject(v) &&
    objHasAnyKey(v, [
      'find_regex',
      'replace_string',
      'regex',
      'pattern',
      'replacement',
      // legacy SillyTavern regex json
      'findRegex',
      'replaceString',
      'scriptName',
    ]);

  if (Array.isArray(data) && data.length > 0) return looksLikeRule(data[0]);
  if (isPlainObject(data) && Array.isArray((data as Record<string, unknown>).regex)) {
    const regex = (data as Record<string, unknown>).regex as unknown[];
    if (regex.length > 0) return looksLikeRule(regex[0]);
  }
  return false;
}

function looksLikePresetPrompt(value: unknown) {
  return isPlainObject(value) && objHasAnyKey(value, ['id', 'name', 'enabled']);
}

function looksLikeHelperPreset(data: unknown): data is Preset {
  if (!isPlainObject(data)) return false;

  const settings = (data as Record<string, unknown>).settings;
  const prompts = (data as Record<string, unknown>).prompts;
  const promptsUnused = (data as Record<string, unknown>).prompts_unused;
  if (!isPlainObject(settings) || !Array.isArray(prompts) || !Array.isArray(promptsUnused)) return false;

  return (
    objHasAnyKey(settings, ['temperature', 'top_p', 'top_k', 'min_p', 'max_context', 'max_completion_tokens', 'should_stream']) &&
    prompts.every(looksLikePresetPrompt) &&
    promptsUnused.every(looksLikePresetPrompt)
  );
}

function looksLikePreset(data: unknown) {
  if (looksLikeHelperPreset(data)) return true;
  if (!isPlainObject(data)) return false;
  return objHasAnyKey(data, [
    'temperature',
    'top_p',
    'top_k',
    'min_p',
    'repetition_penalty',
    'max_context',
    'max_tokens',
    'sampler_order',
    'prompt',
    'system_prompt',
    'instruct',
  ]);
}

async function resolveAutoJsonType(file: File): Promise<string> {
  try {
    const maxParseSize = 2 * 1024 * 1024;
    if (file.size > maxParseSize) {
      const head = await file.slice(0, 200 * 1024).text();
      if (/"world_info"\s*:/.test(head) || /"entries"\s*:/.test(head)) return 'worldbook';
      if (
        /"find_regex"\s*:/.test(head) ||
        /"replace_string"\s*:/.test(head) ||
        /"replacement"\s*:/.test(head) ||
        /"findRegex"\s*:/.test(head) ||
        /"replaceString"\s*:/.test(head) ||
        /"scriptName"\s*:/.test(head)
      )
        return 'regex';
      if (/"messages"\s*:/.test(head) || /"mes"\s*:/.test(head) || /"role"\s*:/.test(head)) return 'chat';
      if (/"temperature"\s*:/.test(head) || /"top_p"\s*:/.test(head) || /"sampler_order"\s*:/.test(head))
        return 'preset';
      return 'unknown';
    }

    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (looksLikeWorldbook(parsed)) return 'worldbook';
    if (looksLikeRegex(parsed)) return 'regex';
    if (looksLikeChat(parsed)) return 'chat';
    if (looksLikePreset(parsed)) return 'preset';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function importPresetFromText(importName: string, text: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (looksLikeHelperPreset(parsed)) {
      if (importName === 'in_use') {
        await replacePreset('in_use', parsed, { render: 'immediate' });
      } else {
        await createOrReplacePreset(importName, parsed);
      }
      return;
    }
  } catch {
    // 非 JSON 或旧版原始预设格式，回退到酒馆原生导入
  }

  const ok = await importRawPreset(importName, text);
  if (!ok) throw new Error('导入预设返回失败');
}

function upsertParentStyleTag(name: string, css: string) {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const parentDoc = parentWin?.document || document;

  const attr = 'data-tavern-helper-theme';
  const selector = `style[${attr}="${CSS.escape(name)}"]`;
  const existing = parentDoc.querySelector(selector) as HTMLStyleElement | null;
  const style = existing || parentDoc.createElement('style');
  style.setAttribute(attr, name);
  style.textContent = css;
  if (!existing) parentDoc.head.appendChild(style);
}

function replaceCssAssetUrls(css: string, baseFilePath: string, files: Map<string, File>) {
  const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  return css.replace(urlRegex, (full, quote: string, rawUrl: string) => {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return full;
    if (/^(data:|https?:|blob:)/i.test(trimmed)) return full;
    if (/^#/.test(trimmed)) return full;

    const resolvedPath = resolveRelativePath(baseFilePath, trimmed);
    const file = files.get(resolvedPath);
    if (!file) return full;
    const blobUrl = URL.createObjectURL(file);
    const q = quote || '"';
    return `url(${q}${blobUrl}${q})`;
  });
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function normalizeCompareText(value: string) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildResourceMapKey(type: string, compareKey: string) {
  return `${categorizeType(type)}::${normalizeCompareText(compareKey)}`;
}

function getEntryLabel(entry: Pick<ImportEntry, 'recognizedName' | 'displayName' | 'path'>) {
  return String(entry.recognizedName || entry.displayName || entry.path || '未命名').trim();
}

function getEntryCompareBase(entry: Pick<ImportEntry, 'type' | 'recognizedName' | 'displayName' | 'path' | 'name' | 'extensionId'>) {
  if (entry.type === 'extension_url') {
    return normalizeCompareText(String(entry.extensionId || entry.path || entry.displayName || '').trim());
  }
  if (entry.type === 'chat') {
    return normalizeCompareText(String(entry.path || entry.displayName || '').trim());
  }
  if (entry.type === 'character') {
    return normalizeCompareText(String(entry.recognizedName || entry.displayName || entry.name || '').trim());
  }
  return normalizeCompareText(String(entry.recognizedName || entry.displayName || entry.name || entry.path || '').trim());
}

function getDuplicateRank(source?: DuplicateSource) {
  if (source === 'mixed') return 3;
  if (source === 'tavern') return 2;
  if (source === 'folder') return 1;
  return 0;
}

function getStatusRank(status: ImportEntry['status']) {
  if (status === 'error') return 3;
  if (status === 'skipped') return 2;
  if (status === 'success') return 1;
  return 0;
}

function pushUniqueWarning(target: string[], message: string) {
  const clean = String(message || '').trim();
  if (!clean || target.includes(clean)) return;
  target.push(clean);
}

function extractCharacterNameFromData(data: unknown): string {
  if (!isPlainObject(data)) return '';
  const obj = data as Record<string, unknown>;
  const keys = ['name', 'char_name', 'character_name', 'characterName'];
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (isPlainObject(obj.data)) {
    const nested = extractCharacterNameFromData(obj.data);
    if (nested) return nested;
  }
  if (isPlainObject(obj.character)) {
    const nested = extractCharacterNameFromData(obj.character);
    if (nested) return nested;
  }
  if (isPlainObject(obj.spec)) {
    const nested = extractCharacterNameFromData(obj.spec);
    if (nested) return nested;
  }
  return '';
}

function decodeBase64Utf8(value: string): string {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function extractCharacterJsonFromBinary(text: string): string {
  const base64Matches = text.match(/chara(?:\x00|\\u0000)?([A-Za-z0-9+/=]{120,})/g) || [];
  for (const raw of base64Matches) {
    const match = raw.match(/([A-Za-z0-9+/=]{120,})/);
    if (!match) continue;
    const decoded = decodeBase64Utf8(match[1]);
    if (decoded.startsWith('{') || decoded.startsWith('[')) return decoded;
  }

  const markers = ['"spec":"chara_card_v2"', '"spec_v2"', '"char_name"', '"creator_notes"'];
  const markerIndex = markers.map(marker => text.indexOf(marker)).find(idx => idx !== -1) ?? -1;
  if (markerIndex !== -1) {
    const start = text.lastIndexOf('{', markerIndex);
    const end = text.indexOf('}', markerIndex);
    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, Math.min(text.length, end + 1));
    }
  }

  return '';
}

async function detectCharacterCardName(file: File, fallback: string): Promise<{ name: string; warnings: string[] }> {
  const warnings: string[] = [];
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.json')) {
    const parsed = safeParseJson(await file.text());
    const name = extractCharacterNameFromData(parsed);
    if (name) return { name, warnings };
    pushUniqueWarning(warnings, '角色卡未读到卡内名，只能按文件名比对');
    return { name: fallback, warnings };
  }

  if (lower.endsWith('.png') || lower.endsWith('.webp')) {
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('latin1').decode(new Uint8Array(buffer));
      const jsonText = extractCharacterJsonFromBinary(text);
      const parsed = jsonText ? safeParseJson(jsonText) : null;
      const name = extractCharacterNameFromData(parsed);
      if (name) return { name, warnings };
    } catch {
      // ignore
    }
    pushUniqueWarning(warnings, '角色卡未读到卡内名，只能按文件名比对');
    return { name: fallback, warnings };
  }

  pushUniqueWarning(warnings, '角色卡未读到卡内名，只能按文件名比对');
  return { name: fallback, warnings };
}

function sanitizeFilenamePart(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned.slice(0, 80) || 'theme';
}

function guessUiThemeNameFromJson(text: string, fallback: string) {
  const parsed = safeParseJson(text);
  if (isPlainObject(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const name = obj.name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    const themeName = obj.themeName;
    if (typeof themeName === 'string' && themeName.trim()) return themeName.trim();
  }
  return fallback;
}

function scoreUiThemeImportInput(input: HTMLInputElement, doc: Document) {
  const meta = `${input.id} ${input.name} ${input.className}`.toLowerCase();
  const accept = (input.getAttribute('accept') || '').toLowerCase();
  let score = 0;
  if (meta.includes('theme')) score += 6;
  if (meta.includes('ui')) score += 2;
  if (meta.includes('import') || meta.includes('upload')) score += 2;
  if (accept.includes('json')) score += 3;

  if (input.id) {
    const label = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    const labelText = (label?.textContent || '').toLowerCase();
    if (labelText.includes('theme') || labelText.includes('ui')) score += 2;
    if (labelText.includes('主题')) score += 2;
    if (labelText.includes('导入') || labelText.includes('import')) score += 2;
  }

  return score;
}

function findUiThemeImportInput(doc: Document): HTMLInputElement | null {
  const inputs = Array.from(doc.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
  let best: { input: HTMLInputElement; score: number } | null = null;
  for (const input of inputs) {
    const score = scoreUiThemeImportInput(input, doc);
    if (!best || score > best.score) best = { input, score };
  }
  if (!best || best.score < 6) return null;
  return best.input;
}

function tryImportUiThemeJsonToTavern(file: File) {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const parentDoc = parentWin?.document || document;

  const input = findUiThemeImportInput(parentDoc);
  if (!input) return false;

  const dt = new DataTransfer();
  dt.items.add(file);
  try {
    input.files = dt.files;
  } catch {
    return false;
  }

  // 避免重复触发：部分酒馆/插件同时监听原生 change 与 jQuery change
  try {
    const $ = (parentWin as any)?.$;
    if (typeof $ === 'function' && $(input)?.trigger) {
      $(input).trigger('change');
    } else {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

function getTavernRequestHeaders(options?: { omitContentType?: boolean }) {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const hostWin = (parentWin as any) || (window as any);
  const st = hostWin?.SillyTavern;

  let ctx: any = null;
  if (st && typeof st.getContext === 'function') {
    try {
      ctx = st.getContext();
    } catch {
      ctx = null;
    }
  }
  if (!ctx) ctx = st;
  if (!ctx?.getRequestHeaders) return undefined;

  let raw: Record<string, string>;
  try {
    raw =
      ctx.getRequestHeaders.length >= 1
        ? (ctx.getRequestHeaders(options) as Record<string, string>)
        : (ctx.getRequestHeaders() as Record<string, string>);
  } catch {
    return undefined;
  }

  const headers = { ...(raw || {}) };
  if (options?.omitContentType) delete headers['Content-Type'];
  return headers;
}

function getTavernContext() {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const hostWin = (parentWin as any) || (window as any);
  const st = hostWin?.SillyTavern;

  if (st && typeof st.getContext === 'function') {
    try {
      const ctx = st.getContext();
      if (ctx) return ctx;
    } catch {
      // ignore
    }
  }
  return st || null;
}

function refreshBackgroundsView() {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const win = (parentWin as any) || (window as any);
  try {
    if (typeof win.renderBackgroundsView === 'function') win.renderBackgroundsView();
  } catch {
    // ignore
  }
}

async function refreshBackgroundsAfterUpload() {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const win = (parentWin as any) || (window as any);

  // 参考 Folder-Manager：尝试调用 backgrounds.js 的 getBackgrounds() 以刷新缓存
  try {
    const realm: any = parentWin || window;
    const nativeImport = typeof realm.Function === 'function' ? realm.Function('u', 'return import(u)') : null;
    if (nativeImport) {
      const mod = await nativeImport('/backgrounds.js');
      if (mod && typeof mod.getBackgrounds === 'function') await mod.getBackgrounds();
    }
  } catch {
    // ignore
  }

  try {
    if (typeof win.renderBackgroundsView === 'function') win.renderBackgroundsView();
  } catch {
    // ignore
  }
}

async function refreshWorldInfoAfterImport() {
  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const win = (parentWin as any) || (window as any);
  const ctx: any = getTavernContext();

  // 参考 Folder-Manager：调用原生 updateWorldInfoList 同步 world_names 与 DOM
  try {
    if (ctx && typeof ctx.updateWorldInfoList === 'function') await ctx.updateWorldInfoList();
  } catch {
    // ignore
  }

  // 若存在原生渲染函数，尝试刷新世界书视图（仅在打开世界书设置页时可见）
  try {
    if (typeof win.renderWorldInfoView === 'function') await win.renderWorldInfoView();
  } catch {
    // ignore
  }
}

function sanitizeFilename(name: string) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'unnamed').slice(0, 120);
}

async function ensureDir(root: FileSystemDirectoryHandleLike, dirName: string) {
  return root.getDirectoryHandle(dirName, { create: true });
}

async function getDirHandleByPath(root: FileSystemDirectoryHandleLike, dirPath: string) {
  let current = root;
  const parts = normalizePath(dirPath).split('/').filter(Boolean);
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: false });
  }
  return current;
}

async function removeFileByPath(root: FileSystemDirectoryHandleLike, relativePath: string) {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error('删除失败：无效的文件路径');
  const parent = parts.length > 0 ? await getDirHandleByPath(root, parts.join('/')) : root;
  if (typeof parent.removeEntry !== 'function') {
    throw new Error('当前目录句柄不支持删除文件');
  }
  await parent.removeEntry(fileName, { recursive: false });
}

async function tryGetFile(dir: FileSystemDirectoryHandleLike, filename: string): Promise<File | null> {
  try {
    const fileHandle = await dir.getFileHandle(filename, { create: false });
    if (typeof fileHandle.getFile !== 'function') return null;
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

async function writeTextFile(dir: FileSystemDirectoryHandleLike, filename: string, text: string) {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  await writable.write(text);
  await writable.close();
}

async function writeBlobFile(dir: FileSystemDirectoryHandleLike, filename: string, blob: Blob) {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  await writable.write(blob);
  await writable.close();
}

function parseExtensionBlocks(text: string) {
  return text
    .split(/\r?\n\s*---\s*\r?\n/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseExtensionTxtBlock(block: string) {
  const lines = block.split(/\r?\n/);
  const takeValue = (keys: string[]) => {
    for (const rawKey of keys) {
      const key = rawKey.toLowerCase();
      for (const line of lines) {
        const t = line.trim();
        const m = t.match(/^([^:：]+)\s*[:：]\s*(.*)$/);
        if (!m) continue;
        if (m[1].trim().toLowerCase() === key) return (m[2] || '').trim();
      }
    }
    return '';
  };

  const id = takeValue(['拓展id', '扩展id', '拓展ID', '扩展ID']);
  const name = takeValue(['拓展名', '扩展名']);

  const urls: string[] = [];
  const urlTags: string[] = [];

  const foreignUrl = takeValue(['国外url', '国外URL', '海外url', '海外URL']);
  const domesticUrl = takeValue(['国内url', '国内URL']);
  if (domesticUrl) {
    urls.push(domesticUrl);
    urlTags.push('国内');
  }
  if (foreignUrl) {
    urls.push(foreignUrl);
    urlTags.push('国外');
  }

  if (urls.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      const urlMatch = t.match(/^url\s*(?:（[^）]*）)?\s*[:：]\s*(.*)$/i);
      if (!urlMatch) continue;

      const keyLineRegex = /^(拓展id|扩展id|拓展名|扩展名|功能|拓展功能|扩展功能|url)\s*[:：]/i;
      const rest = (urlMatch[1] || '').trim();
      if (rest) urls.push(...rest.split(/\s+/).filter(Boolean));

      for (let j = i + 1; j < lines.length && urls.length < 2; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (keyLineRegex.test(next)) break;
        urls.push(next);
      }

      break;
    }
  }

  let desc = '';
  for (let k = 0; k < lines.length; k++) {
    const t = lines[k].trim();
    if (/^(功能|拓展功能|扩展功能)\s*[:：]/i.test(t)) {
      desc = t.replace(/^(功能|拓展功能|扩展功能)\s*[:：]/i, '').trim();
      const tail = lines.slice(k + 1).join('\n').trim();
      if (tail) desc = desc ? `${desc}\n${tail}` : tail;
      break;
    }
  }

  const cleanUrls = urls.filter(Boolean).slice(0, 2);
  const cleanTags = urlTags.slice(0, cleanUrls.length);
  return { id, name, urls: cleanUrls, urlTags: cleanTags, desc };
}

export const useImportStore = defineStore('resource-importer', () => {
  const rootPicked = ref(false);
  const rootDirHandle = ref<FileSystemDirectoryHandleLike | null>(null);
  const flowMode = ref<'choose' | 'import' | 'export'>('choose');
  const exportConflictStrategy = ref<'overwrite' | 'skip'>('overwrite');
  const exportLoading = ref(false);
  const importLoading = ref(false);
  const extensionUrlLoadingIds = ref(new Set<string>());
  const exportSessionToken = ref(0);
  const importSessionToken = ref(0);
  const characterExportFormat = ref<'png' | 'json'>('png');
  const scriptExportFormat = ref<'js' | 'ts'>('js');

  let helperPluginIndexCache: any | null = null;
  const helperPluginUrlCache = new Map<string, { url: string; name?: string }>();
  let extensionDiscoverCache: Map<string, 'local' | 'global'> | null = null;
  let extensionDiscoverCacheAt = 0;
  const extensionVersionCache = new Map<string, { url: string; name?: string; branch?: string }>();

  const filesMap = ref(new Map<string, File>());
  const entries = ref<ImportEntry[]>([]);
  const selectedCategory = ref<CategoryId>('all');
  const searchQuery = ref('');
  const sortKey = ref<SortKey>('default');
  const sortOrder = ref<SortOrder>('asc');
  const statusFilter = ref<StatusFilter>('all');
  const duplicateFilter = ref<DuplicateFilter>('all');
  const conflictStrategy = ref<ConflictStrategy>('skip');
  const isProcessing = ref(false);
  const hasSource = computed(() => entries.value.length > 0);
  const hasRoot = computed(() => rootPicked.value);
  const isChooseMode = computed(() => flowMode.value === 'choose');
  const isImportMode = computed(() => flowMode.value === 'import');
  const isExportMode = computed(() => flowMode.value === 'export');
  const canDeleteSourceFiles = computed(() => !!rootDirHandle.value);
  const showDuplicatePanel = ref(false);
  const duplicatePanelSource = ref<Exclude<DuplicateSource, 'none'>>('mixed');
  const resultDialog = reactive<ResultDialogState>({
    visible: false,
    title: '',
    success: 0,
    failed: 0,
    skipped: 0,
    items: [],
  });
  const preflightDialog = reactive<PreflightDialogState>({
    visible: false,
    title: '',
    itemIds: [],
    warnings: [],
  });
  const deleteConfirmDialog = reactive<DeleteConfirmState>({
    visible: false,
    title: '',
    itemIds: [],
    paths: [],
  });
  const characterDeleteConfirm = reactive<CharacterDeleteConfirmState>({
    visible: false,
    target: null,
  });
  const tavernResourceIndex = ref<TavernResourceIndex>(new Map());

  const stats = reactive({ success: 0, failed: 0, skipped: 0, pending: 0 });

  const categories = computed(() => {
    const counts: Record<string, number> = Object.fromEntries(CATEGORY_LIST.map(c => [c.id, 0]));
    for (const entry of entries.value) {
      counts.all++;
      const cat = categorizeType(entry.type);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return CATEGORY_LIST.map(c => ({ ...c, count: counts[c.id] || 0 }));
  });

  type ImportTreeNode = { key: string; depth: number; label: string; prefix: string; count: number };

  const importTreeNodes = computed<ImportTreeNode[]>(() => {
    if (!isImportMode.value) return [];

    type Folder = {
      name: string;
      prefix: string;
      children: Map<string, Folder>;
      fileCount: number;
    };

    const root: Folder = { name: '', prefix: '', children: new Map(), fileCount: 0 };

    for (const entry of entries.value) {
      const path = String(entry.path || '').replace(/\\/g, '/').trim();
      if (!path) continue;
      const parts = path.split('/').filter(Boolean);
      if (parts.length === 0) continue;

      let node = root;
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        prefix = prefix ? `${prefix}/${seg}` : seg;
        let child = node.children.get(seg);
        if (!child) {
          child = { name: seg, prefix, children: new Map(), fileCount: 0 };
          node.children.set(seg, child);
        }
        node = child;
      }
      node.fileCount++;
    }

    const countSubtree = (folder: Folder): number => {
      let count = folder.fileCount;
      for (const child of folder.children.values()) count += countSubtree(child);
      return count;
    };

    const flat: ImportTreeNode[] = [];

    const walk = (folder: Folder, depth: number) => {
      const children = Array.from(folder.children.values()).sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        flat.push({ key: `folder:${child.prefix}`, depth, label: child.name, prefix: child.prefix, count: countSubtree(child) });
        walk(child, depth + 1);
      }
    };

    walk(root, 1);
    return flat;
  });

  const allDuplicateGroups = computed<DuplicateGroup[]>(() => {
    const map = new Map<string, DuplicateGroup>();
    for (const entry of entries.value) {
      if (!entry.duplicateGroupId || !entry.duplicateSource || entry.duplicateSource === 'none') continue;
      const existing = map.get(entry.duplicateGroupId);
      if (existing) {
        existing.entries.push(entry);
        for (const warning of entry.warnings || []) pushUniqueWarning(existing.warnings, warning);
        continue;
      }
      map.set(entry.duplicateGroupId, {
        id: entry.duplicateGroupId,
        source: entry.duplicateSource,
        compareKey: entry.compareKey || '',
        label: getEntryLabel(entry),
        entries: [entry],
        tavernMatches: [...(entry.tavernMatches || [])],
        warnings: [...(entry.warnings || [])],
      });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  });

  const duplicateGroupCounts = computed(() => {
    const counts = {
      mixed: 0,
      tavern: 0,
      folder: 0,
    };
    for (const group of allDuplicateGroups.value) counts[group.source]++;
    return counts;
  });

  const duplicatePanelSourceResolved = computed<Exclude<DuplicateSource, 'none'>>(() => {
    if (duplicateGroupCounts.value[duplicatePanelSource.value] > 0) return duplicatePanelSource.value;
    return (['mixed', 'tavern', 'folder'] as const).find(key => duplicateGroupCounts.value[key] > 0) || 'mixed';
  });

  const duplicatePanelOptions = computed(() => [
    { value: 'mixed' as const, label: '酒馆内和资源文件重复', count: duplicateGroupCounts.value.mixed },
    { value: 'tavern' as const, label: '酒馆内的重复', count: duplicateGroupCounts.value.tavern },
    { value: 'folder' as const, label: '资源文件的重复', count: duplicateGroupCounts.value.folder },
  ]);

  const duplicateGroups = computed<DuplicateGroup[]>(() =>
    allDuplicateGroups.value.filter(group => group.source === duplicatePanelSourceResolved.value),
  );

  const duplicateEntryCount = computed(() => entries.value.filter(entry => entry.duplicateSource && entry.duplicateSource !== 'none').length);

  const filteredEntries = computed(() => {
    let list = entries.value;
    if (selectedCategory.value !== 'all') {
      list = list.filter(e => categorizeType(e.type) === selectedCategory.value);
    }
    if (selectedPathPrefix.value) {
      const prefix = selectedPathPrefix.value.endsWith('/') ? selectedPathPrefix.value : `${selectedPathPrefix.value}/`;
      list = list.filter(e => (e.path || '').startsWith(prefix));
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      list = list.filter(
        e =>
          e.displayName.toLowerCase().includes(q) ||
          (e.recognizedName || '').toLowerCase().includes(q) ||
          (e.name || '').toLowerCase().includes(q) ||
          (e.path || '').toLowerCase().includes(q) ||
          (e.extensionId || '').toLowerCase().includes(q),
      );
    }
    if (statusFilter.value !== 'all') {
      list = list.filter(e => e.status === statusFilter.value);
    }
    if (duplicateFilter.value === 'duplicate') {
      list = list.filter(e => e.duplicateSource && e.duplicateSource !== 'none');
    } else if (duplicateFilter.value === 'normal') {
      list = list.filter(e => !e.duplicateSource || e.duplicateSource === 'none');
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      const direction = sortOrder.value === 'desc' ? -1 : 1;
      if (sortKey.value === 'default') return 0;
      if (sortKey.value === 'duplicate') {
        const diff = getDuplicateRank(a.duplicateSource) - getDuplicateRank(b.duplicateSource);
        if (diff !== 0) return diff * direction;
      }
      if (sortKey.value === 'status') {
        const diff = getStatusRank(a.status) - getStatusRank(b.status);
        if (diff !== 0) return diff * direction;
      }
      if (sortKey.value === 'type') {
        const diff = a.type.localeCompare(b.type, 'zh-CN');
        if (diff !== 0) return diff * direction;
      }
      if (sortKey.value === 'path') {
        const diff = String(a.path || '').localeCompare(String(b.path || ''), 'zh-CN');
        if (diff !== 0) return diff * direction;
      }
      const aName = getEntryLabel(a);
      const bName = getEntryLabel(b);
      return aName.localeCompare(bName, 'zh-CN') * direction;
    });
    return sorted;
  });

  const selectedIds = ref(new Set<string>());
  const selectedPathPrefix = ref('');

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  function selectAll() {
    selectedIds.value = new Set(filteredEntries.value.map(e => e.id));
  }

  function deselectAll() {
    selectedIds.value = new Set();
  }

  function setCategory(cat: CategoryId) {
    selectedCategory.value = cat;
    selectedPathPrefix.value = '';
  }

  function setPathPrefix(prefix: string) {
    selectedPathPrefix.value = String(prefix || '').trim();
  }

  function clearPathPrefix() {
    selectedPathPrefix.value = '';
  }

  function selectTreeFolder(prefix: string) {
    selectedPathPrefix.value = String(prefix || '').trim();
    selectedIds.value = new Set();
  }

  function setSort(next: SortKey) {
    if (sortKey.value === next && next !== 'default') {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey.value = next;
    if (next === 'default') sortOrder.value = 'asc';
  }

  function setStatusFilter(next: StatusFilter) {
    statusFilter.value = next;
  }

  function setDuplicateFilter(next: DuplicateFilter) {
    duplicateFilter.value = next;
  }

  function closeResultDialog() {
    resultDialog.visible = false;
    resultDialog.title = '';
    resultDialog.success = 0;
    resultDialog.failed = 0;
    resultDialog.skipped = 0;
    resultDialog.items = [];
  }

  function closePreflightDialog() {
    preflightDialog.visible = false;
    preflightDialog.title = '';
    preflightDialog.itemIds = [];
    preflightDialog.warnings = [];
  }

  function closeDeleteConfirmDialog() {
    deleteConfirmDialog.visible = false;
    deleteConfirmDialog.title = '';
    deleteConfirmDialog.itemIds = [];
    deleteConfirmDialog.paths = [];
  }

  function closeCharacterDeleteConfirm() {
    characterDeleteConfirm.visible = false;
    characterDeleteConfirm.target = null;
  }

  function removeEntriesFromList(ids: string[]) {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    entries.value = entries.value.filter(entry => !idSet.has(entry.id));
    selectedIds.value = new Set(Array.from(selectedIds.value).filter(id => !idSet.has(id)));
    if (flowMode.value === 'import') analyzeDuplicates(entries.value);
    updateStats();
  }

  function removeEntryFromList(id: string) {
    removeEntriesFromList([id]);
  }

  function removeSelectedFromList() {
    removeEntriesFromList(Array.from(selectedIds.value));
  }

  function updateStats() {
    stats.success = entries.value.filter(e => e.status === 'success').length;
    stats.failed = entries.value.filter(e => e.status === 'error').length;
    stats.skipped = entries.value.filter(e => e.status === 'skipped').length;
    stats.pending = entries.value.filter(e => e.status === 'pending').length;
  }

  function resetItems() {
    for (const entry of entries.value) {
      entry.status = 'pending';
      entry.errorMessage = undefined;
    }
    selectedIds.value = new Set();
    selectedPathPrefix.value = '';
    closeResultDialog();
    closePreflightDialog();
    updateStats();
  }

  function clearAll() {
    exportSessionToken.value++;
    importSessionToken.value++;
    rootPicked.value = false;
    rootDirHandle.value = null;
    flowMode.value = 'choose';
    exportConflictStrategy.value = 'overwrite';
    exportLoading.value = false;
    importLoading.value = false;
    extensionUrlLoadingIds.value = new Set();
    characterExportFormat.value = 'png';
    scriptExportFormat.value = 'js';
    filesMap.value = new Map();
    entries.value = [];
    selectedIds.value = new Set();
    selectedCategory.value = 'all';
    searchQuery.value = '';
    sortKey.value = 'default';
    sortOrder.value = 'asc';
    statusFilter.value = 'all';
    duplicateFilter.value = 'all';
    selectedPathPrefix.value = '';
    showDuplicatePanel.value = false;
    duplicatePanelSource.value = 'mixed';
    isProcessing.value = false;
    tavernResourceIndex.value = new Map();
    closeResultDialog();
    closePreflightDialog();
    closeDeleteConfirmDialog();
    closeCharacterDeleteConfirm();
    stats.success = 0;
    stats.failed = 0;
    stats.skipped = 0;
    stats.pending = 0;
  }

  async function refreshTavernResourceIndex() {
    const next: TavernResourceIndex = new Map();
    const addMatch = (match: TavernResourceMatch) => {
      const key = buildResourceMapKey(match.type, match.compareKey);
      const list = next.get(key) || [];
      list.push(match);
      next.set(key, list);
    };

    try {
      const names = typeof getPresetNames === 'function' ? getPresetNames() : [];
      for (const name of names.filter(Boolean)) {
        addMatch({
          id: `preset:${name}`,
          type: 'preset',
          name,
          path: name,
          compareKey: normalizeCompareText(name),
          canDelete: true,
        });
      }
    } catch (e) {
      console.warn('[资源导入器] 读取预设索引失败', e);
    }

    try {
      const names = typeof getWorldbookNames === 'function' ? getWorldbookNames() : [];
      for (const name of names.filter(Boolean)) {
        addMatch({
          id: `worldbook:${name}`,
          type: 'worldbook',
          name,
          path: name,
          compareKey: normalizeCompareText(name),
          canDelete: true,
        });
      }
    } catch (e) {
      console.warn('[资源导入器] 读取世界书索引失败', e);
    }

    try {
      const chars = Array.isArray((SillyTavern as any)?.characters) ? (SillyTavern as any).characters : [];
      for (const ch of chars) {
        const name = String(ch?.name || '').trim();
        const avatar = String(ch?.avatar || '').trim();
        if (!name) continue;
        addMatch({
          id: `character:${avatar || name}`,
          type: 'character',
          name,
          path: avatar,
          detail: avatar,
          compareKey: normalizeCompareText(name),
          canDelete: true,
          meta: { avatar },
        });
      }
    } catch (e) {
      console.warn('[资源导入器] 读取角色卡索引失败', e);
    }

    try {
      const regexes = typeof getTavernRegexes === 'function' ? getTavernRegexes({ type: 'global' }) : [];
      for (const regex of Array.isArray(regexes) ? regexes : []) {
        const name = String((regex as any)?.script_name || '').trim();
        const id = String((regex as any)?.id || '').trim();
        if (!name) continue;
        addMatch({
          id: `regex:${id || name}`,
          type: 'regex',
          name,
          path: id || name,
          compareKey: normalizeCompareText(name),
          canDelete: true,
        });
      }
    } catch (e) {
      console.warn('[资源导入器] 读取正则索引失败', e);
    }

    try {
      const trees = typeof getScriptTrees === 'function' ? getScriptTrees({ type: 'global' }) : [];
      const names = new Set<string>();
      for (const tree of Array.isArray(trees) ? trees : []) {
        if ((tree as any).type === 'script') names.add(String((tree as any).name || '').trim());
        if ((tree as any).type === 'folder' && Array.isArray((tree as any).scripts)) {
          for (const script of (tree as any).scripts) names.add(String(script?.name || '').trim());
        }
      }
      for (const name of Array.from(names).filter(Boolean)) {
        addMatch({
          id: `script:${name}`,
          type: 'script',
          name,
          path: name,
          compareKey: normalizeCompareText(name),
          canDelete: true,
        });
      }
    } catch (e) {
      console.warn('[资源导入器] 读取脚本索引失败', e);
    }

    try {
      const headers = getTavernRequestHeaders();
      if (headers) {
        const resp = await fetch('/api/settings/get', { method: 'POST', headers, body: JSON.stringify({}) });
        if (resp.ok) {
          const payload = await resp.json().catch(() => null);
          const themes = Array.isArray(payload?.themes) ? payload.themes : [];
          for (const theme of themes) {
            const name = String((typeof theme === 'object' ? (theme as any)?.name : theme) || '').trim();
            if (!name) continue;
            addMatch({
              id: `theme:${name}`,
              type: 'theme',
              name,
              path: name,
              compareKey: normalizeCompareText(name),
              canDelete: true,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[资源导入器] 读取主题索引失败', e);
    }

    try {
      const headers = getTavernRequestHeaders();
      if (headers) {
        const resp = await fetch('/api/backgrounds/all', { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-cache' });
        if (resp.ok) {
          const payload = await resp.json().catch(() => null);
          const candidates = [
            (payload as any)?.images,
            (payload as any)?.backgrounds,
            (payload as any)?.files,
            (payload as any)?.data?.images,
            (payload as any)?.data?.backgrounds,
          ];
          const list = (candidates.find(x => Array.isArray(x)) as any[] | undefined) || [];
          for (const raw of list) {
            const name = String(
              typeof raw === 'string'
                ? raw
                : raw?.name ?? raw?.file ?? raw?.filename ?? raw?.file_name ?? raw?.path ?? raw?.url ?? '',
            ).trim();
            if (!name) continue;
            addMatch({
              id: `background:${name}`,
              type: 'background',
              name: name.split('/').pop() || name,
              path: name,
              compareKey: normalizeCompareText(name.split('/').pop() || name),
              canDelete: true,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[资源导入器] 读取背景索引失败', e);
    }

    try {
      const collected = new Set<string>();
      const headers = getTavernRequestHeaders();
      if (headers) {
        const resp = await fetch('/api/extensions/discover', { method: 'GET', headers, cache: 'no-cache' });
        if (resp.ok) {
          const discovered = await resp.json().catch(() => null);
          for (const item of Array.isArray(discovered) ? discovered : []) {
            const fullName = String((item as any)?.name || '').trim();
            if (!fullName.startsWith('third-party/')) continue;
            const name = fullName.slice('third-party/'.length).trim();
            if (!name || collected.has(name)) continue;
            collected.add(name);
            addMatch({
              id: `extension_url:${name}`,
              type: 'extension_url',
              name,
              path: name,
              compareKey: normalizeCompareText(name),
              canDelete: true,
              meta: { extensionId: name },
            });
          }
        }
      }
      const extSettings = (SillyTavern as any)?.extensionSettings;
      const ids = extSettings && typeof extSettings === 'object' ? Object.keys(extSettings) : [];
      for (const id of ids.map(x => String(x || '').trim()).filter(Boolean)) {
        if (collected.has(id)) continue;
        const type = typeof getExtensionType === 'function' ? getExtensionType(id) : null;
        if (!type || type === 'system') continue;
        addMatch({
          id: `extension_url:${id}`,
          type: 'extension_url',
          name: id,
          path: id,
          compareKey: normalizeCompareText(id),
          canDelete: true,
          meta: { extensionId: id },
        });
      }
    } catch (e) {
      console.warn('[资源导入器] 读取扩展索引失败', e);
    }

    tavernResourceIndex.value = next;
  }

  function analyzeDuplicates(list = entries.value) {
    const grouped = new Map<string, ImportEntry[]>();
    for (const entry of list) {
      entry.duplicateSource = 'none';
      entry.duplicateGroupId = undefined;
      entry.duplicateCount = 0;
      entry.duplicateReason = undefined;
      entry.tavernMatches = [];
      const compareKey = String(entry.compareKey || '').trim();
      if (!compareKey) continue;
      const mapKey = buildResourceMapKey(entry.type, compareKey);
      const bucket = grouped.get(mapKey) || [];
      bucket.push(entry);
      grouped.set(mapKey, bucket);
    }

    for (const [mapKey, bucket] of grouped.entries()) {
      const sample = bucket[0];
      const tavernMatches =
        sample.type !== 'chat' && sample.type !== 'extension_url' ? [...(tavernResourceIndex.value.get(mapKey) || [])] : [];
      const hasFolderDup = bucket.length > 1;
      const hasTavernDup = tavernMatches.length > 0;
      for (const entry of bucket) {
        entry.tavernMatches = tavernMatches;
        entry.duplicateCount = bucket.length + tavernMatches.length;
        if (hasFolderDup && hasTavernDup) {
          entry.duplicateSource = 'mixed';
          entry.duplicateReason = '源文件与酒馆内均存在重复';
        } else if (hasFolderDup) {
          entry.duplicateSource = 'folder';
          entry.duplicateReason = '源文件夹内存在重复';
        } else if (hasTavernDup) {
          entry.duplicateSource = 'tavern';
          entry.duplicateReason = '酒馆内已存在同名资源';
        } else {
          entry.duplicateSource = 'none';
          entry.duplicateCount = 0;
        }
        if (entry.duplicateSource !== 'none') {
          entry.duplicateGroupId = `${sample.type}:${sample.compareKey}`;
        }
      }
    }
  }

  async function enrichImportEntries(list = entries.value) {
    for (const entry of list) {
      const warnings: string[] = [];
      let recognizedName = String(entry.displayName || entry.name || entry.path || '').trim();
      if (entry.type === 'character' && entry.file) {
        const detected = await detectCharacterCardName(entry.file, recognizedName || stripExt(entry.file.name));
        recognizedName = detected.name;
        for (const warning of detected.warnings) pushUniqueWarning(warnings, warning);
      }
      entry.recognizedName = recognizedName || entry.displayName;
      entry.compareKey = getEntryCompareBase({
        type: entry.type,
        recognizedName: entry.recognizedName,
        displayName: entry.displayName,
        path: entry.path,
        name: entry.name,
        extensionId: entry.extensionId,
      });
      entry.warnings = warnings;
      entry.canDeleteSourceFile = !!rootDirHandle.value && !!entry.path && !!entry.file;
      entry.sourceDeletePath = entry.path;
      entry.sourceDeleteReason =
        entry.canDeleteSourceFile || !entry.file
          ? undefined
          : '当前来源不是可写目录句柄，不能直接删除源文件';
    }
    analyzeDuplicates(entries.value);
  }

  async function refreshEntryAnalysis(id?: string) {
    if (flowMode.value !== 'import') return;
    const targets = id ? entries.value.filter(entry => entry.id === id) : entries.value;
    await enrichImportEntries(targets);
  }

  async function parseFolder(token: number) {
    const files = filesMap.value;
    const now = Date.now();
    const next: ImportEntry[] = [];
    const shouldContinue = () => token === importSessionToken.value;
    const yieldEvery = 50;

    const extensionMetaPaths = new Set<string>();
    let extensionIndex = 0;
    let counter = 0;
    for (const [path, file] of files) {
      if (!shouldContinue()) return;
      counter++;
      if (counter % yieldEvery === 0) await new Promise<void>(r => setTimeout(r, 0));
      if (!path.toLowerCase().endsWith('.txt')) continue;
      const head = await file.slice(0, 120 * 1024).text();
      if (!shouldContinue()) return;
      if (!/(拓展id|扩展id)\s*[:：]/i.test(head) || !/(国外url|国内url|url)\s*(?:（[^）]*）)?\s*[:：]/i.test(head))
        continue;

      const text = file.size > 1024 * 1024 ? await file.slice(0, 1024 * 1024).text() : await file.text();
      if (!shouldContinue()) return;
      const blocks = parseExtensionBlocks(text);
      const parsed = blocks
        .map(parseExtensionTxtBlock)
        .filter(b => (b.id || b.name) && b.urls.length > 0);
      if (parsed.length === 0) continue;

      extensionMetaPaths.add(path);
      for (const ext of parsed) {
        const displayName = ext.name || ext.id || `扩展 ${extensionIndex + 1}`;
        next.push({
          id: `ext-${now}-${extensionIndex++}`,
          type: 'extension_url',
          name: displayName,
          displayName,
          path: `${path}${ext.id ? `#${ext.id}` : ''}`,
          url: ext.urls[0],
          urls: ext.urls,
          urlTags: ext.urlTags,
          extensionId: ext.id,
          extensionName: ext.name,
          extensionDesc: ext.desc,
          existsInFolder: true,
          status: 'pending' as const,
        });
      }
    }

    let fileIndex = 0;
    let fileCounter = 0;
    for (const [path, file] of files) {
      if (!shouldContinue()) return;
      fileCounter++;
      if (fileCounter % yieldEvery === 0) await new Promise<void>(r => setTimeout(r, 0));
      if (extensionMetaPaths.has(path)) continue;
      if (/^resource-pack\.(yaml|yml|json)$/i.test(path)) continue;
      const filename = path.split('/').pop() || path;
      const displayName = stripExt(filename);
      next.push({
        id: `file-${now}-${fileIndex++}`,
        type: guessTypeByPath(path),
        path,
        name: displayName,
        displayName,
        file,
        existsInFolder: true,
        status: 'pending' as const,
      });
    }

    if (!shouldContinue()) return;
    entries.value = next;
    await enrichImportEntries(entries.value);
    selectedIds.value = new Set();
    if (flowMode.value === 'import') toastr.success(`已读取文件夹：共 ${entries.value.length} 条`);
    updateStats();
  }

  async function pickRootDir() {
    clearAll();

    const picker = (window as any).showDirectoryPicker as undefined | ((options?: any) => Promise<any>);
    if (picker) {
      try {
        const handle = (await picker({ mode: 'readwrite' })) as FileSystemDirectoryHandleLike;
        rootDirHandle.value = handle;
        rootPicked.value = true;
        flowMode.value = 'choose';
        return;
      } catch {
        // fall through to legacy picker
      }
    }

    const files = new Map<string, File>();
    await pickFolderLegacy(files);
    if (files.size === 0) return;
    filesMap.value = files;
    rootPicked.value = true;
    flowMode.value = 'choose';
  }

  async function pickFolder() {
    await pickRootDir();
  }

  function backToChoose() {
    exportSessionToken.value++;
    importSessionToken.value++;
    entries.value = [];
    selectedIds.value = new Set();
    selectedCategory.value = 'all';
    searchQuery.value = '';
    sortKey.value = 'default';
    sortOrder.value = 'asc';
    statusFilter.value = 'all';
    duplicateFilter.value = 'all';
    selectedPathPrefix.value = '';
    showDuplicatePanel.value = false;
    duplicatePanelSource.value = 'mixed';
    isProcessing.value = false;
    exportLoading.value = false;
    importLoading.value = false;
    extensionUrlLoadingIds.value = new Set();
    characterExportFormat.value = 'png';
    scriptExportFormat.value = 'js';
    tavernResourceIndex.value = new Map();
    closeResultDialog();
    closePreflightDialog();
    closeDeleteConfirmDialog();
    closeCharacterDeleteConfirm();
    stats.success = 0;
    stats.failed = 0;
    stats.skipped = 0;
    stats.pending = 0;
    flowMode.value = 'choose';
  }

  function onClose() {
    // 关闭面板时中断可能还在进行的目录读取/解析，避免“退出后过一会儿才提示已加载”
    exportSessionToken.value++;
    importSessionToken.value++;
    exportLoading.value = false;
    importLoading.value = false;
    extensionUrlLoadingIds.value = new Set();
    closePreflightDialog();
    closeDeleteConfirmDialog();
    closeCharacterDeleteConfirm();
  }

  async function startImport() {
    if (!rootPicked.value) {
      await pickRootDir();
      if (!rootPicked.value) return;
    }

    const token = ++importSessionToken.value;
    importLoading.value = true;
    try {
      if (rootDirHandle.value) {
        const files = new Map<string, File>();
        await readDirHandle(rootDirHandle.value, '', files, { shouldContinue: () => token === importSessionToken.value });
        if (token !== importSessionToken.value) return;
        filesMap.value = files;
      }

      if (filesMap.value.size === 0) {
        toastr.error('未读取到任何文件：请重新选择用于导入的资源文件夹');
        return;
      }

      flowMode.value = 'import';
      selectedPathPrefix.value = '';
      await refreshTavernResourceIndex();
      if (entries.value.length === 0) await parseFolder(token);
      else await enrichImportEntries(entries.value);
    } finally {
      if (token === importSessionToken.value) importLoading.value = false;
    }
  }

  async function loadExportEntries() {
    const now = Date.now();
    let exportIndex = 0;
    const next: ImportEntry[] = [];

    const addEntry = (entry: Omit<ImportEntry, 'id' | 'status' | 'existsInFolder'>) => {
      next.push({
        ...entry,
        id: `exp-${now}-${exportIndex++}`,
        existsInFolder: true,
        status: 'pending' as const,
      });
    };

    // 预设（包含 in_use）
    try {
      const presetNames = (typeof getPresetNames === 'function' ? getPresetNames() : []).filter(Boolean);
      for (const name of presetNames) {
        addEntry({ type: 'preset', path: name, name, displayName: name });
      }
      addEntry({ type: 'preset', path: 'in_use', name: 'in_use', displayName: 'in_use' });
    } catch (e) {
      console.warn('[资源导出] 读取预设列表失败', e);
    }

    // 世界书
    try {
      const worldNames = (typeof getWorldbookNames === 'function' ? getWorldbookNames() : []).filter(Boolean);
      for (const name of worldNames) {
        addEntry({ type: 'worldbook', path: name, name, displayName: name });
      }
    } catch (e) {
      console.warn('[资源导出] 读取世界书列表失败', e);
    }

    // 角色卡
    try {
      const chars = Array.isArray((SillyTavern as any)?.characters) ? (SillyTavern as any).characters : [];
      for (const ch of chars) {
        const name = String(ch?.name || '').trim();
        const avatar = String(ch?.avatar || '').trim();
        if (!name || !avatar) continue;
        addEntry({ type: 'character', path: avatar, name, displayName: name });
      }
    } catch (e) {
      console.warn('[资源导出] 读取角色卡列表失败', e);
    }

    // 全局正则（逐条）
    try {
      const regexes = typeof getTavernRegexes === 'function' ? getTavernRegexes({ type: 'global' }) : [];
      for (const r of Array.isArray(regexes) ? regexes : []) {
        const id = String((r as any)?.id || '').trim();
        const scriptName = String((r as any)?.script_name || '').trim();
        if (!id || !scriptName) continue;
        addEntry({ type: 'regex', path: id, name: scriptName, displayName: scriptName });
      }
    } catch (e) {
      console.warn('[资源导出] 读取正则列表失败', e);
    }

    // 脚本（全局）
    try {
      const trees = typeof getScriptTrees === 'function' ? getScriptTrees({ type: 'global' }) : [];
      const names: string[] = [];
      for (const tree of Array.isArray(trees) ? trees : []) {
        if ((tree as any).type === 'script') names.push(String((tree as any).name || '').trim());
        if ((tree as any).type === 'folder' && Array.isArray((tree as any).scripts)) {
          for (const s of (tree as any).scripts) names.push(String(s?.name || '').trim());
        }
      }
      for (const name of Array.from(new Set(names)).filter(Boolean)) {
        addEntry({ type: 'script', path: name, name, displayName: name });
      }
    } catch (e) {
      console.warn('[资源导出] 读取脚本列表失败', e);
    }

    // 主题（美化）
    let settingsPayload: any = null;
    try {
      const headers = getTavernRequestHeaders();
      if (headers) {
        const resp = await fetch('/api/settings/get', { method: 'POST', headers, body: JSON.stringify({}) });
        if (resp.ok) settingsPayload = await resp.json();
      }
    } catch (e) {
      console.warn('[资源导出] 获取 settings 失败', e);
    }
    try {
      const themes = Array.isArray(settingsPayload?.themes) ? settingsPayload.themes : [];
      for (const theme of themes) {
        const themeName = String((typeof theme === 'object' ? (theme as any)?.name : theme) || '').trim();
        if (!themeName) continue;
        addEntry({ type: 'theme', path: themeName, name: themeName, displayName: themeName });
      }
    } catch (e) {
      console.warn('[资源导出] 读取主题列表失败', e);
    }

    // 背景图
    try {
      const normalizeBgName = (x: any) => {
        if (typeof x === 'string') return x.trim();
        if (!x || typeof x !== 'object') return String(x || '').trim();
        const obj: any = x;
        return String(
          obj.name ?? obj.file ?? obj.filename ?? obj.file_name ?? obj.path ?? obj.url ?? obj.href ?? obj.src ?? '',
        ).trim();
      };
      const collectNames = () => {
        const parentWin = window.parent && window.parent !== window ? window.parent : null;
        const win = (parentWin as any) || (window as any);
        const raw = typeof win.getBackgroundNames === 'function' ? win.getBackgroundNames() : [];
        const list = Array.isArray(raw) ? raw : [];
        return Array.from(new Set(list.map(normalizeBgName).filter(Boolean)));
      };

      let names = collectNames();

      if (names.length === 0) {
        try {
          const parentWin = window.parent && window.parent !== window ? window.parent : null;
          const realm: any = parentWin || window;
          const nativeImport = typeof realm.Function === 'function' ? realm.Function('u', 'return import(u)') : null;
          if (nativeImport) {
            const mod = await nativeImport('/backgrounds.js');
            if (mod && typeof mod.getBackgrounds === 'function') await mod.getBackgrounds();
          }
        } catch {
          // ignore
        }
        names = collectNames();
      }

      if (names.length === 0) {
        const headers = getTavernRequestHeaders();
        if (headers) {
          const resp = await fetch('/api/backgrounds/all', { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-cache' });
          if (resp.ok) {
            const payload = await resp.json().catch(() => null);
            const candidates = [
              (payload as any)?.images,
              (payload as any)?.backgrounds,
              (payload as any)?.files,
              (payload as any)?.data?.images,
              (payload as any)?.data?.backgrounds,
            ];
            const list = candidates.find(x => Array.isArray(x)) as any[] | undefined;
            if (list) names = Array.from(new Set(list.map(normalizeBgName).filter(Boolean)));
          }
        }
      }

      for (const bg of names) {
        addEntry({ type: 'background', path: bg, name: bg, displayName: bg.split('/').pop() || bg });
      }
    } catch (e) {
      console.warn('[资源导出] 读取背景列表失败', e);
    }

    // 聊天（按角色列出）
    try {
      const headers = getTavernRequestHeaders();
      const chars = Array.isArray((SillyTavern as any)?.characters) ? (SillyTavern as any).characters : [];
      if (headers) {
        for (const ch of chars) {
          const charName = String(ch?.name || '').trim();
          const avatar = String(ch?.avatar || '').trim();
          if (!charName || !avatar) continue;

          try {
            const resp = await fetch('/api/characters/chats', {
              method: 'POST',
              headers,
              body: JSON.stringify({ avatar_url: avatar }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data && typeof data === 'object' && (data as any).error === true) continue;
            const chats = Object.values(data || {}) as any[];
            const ordered = chats
              .filter(Boolean)
              .sort((a, b) => String(a?.file_name || '').localeCompare(String(b?.file_name || '')))
              .reverse();

            for (const chat of ordered) {
              const fileNameFull = String(chat?.file_name || '').trim();
              if (!fileNameFull.endsWith('.jsonl')) continue;
              const chatName = fileNameFull.replace(/\.jsonl$/i, '');
              const displayName = `${charName}/${chatName}`;
              addEntry({ type: 'chat', path: `${avatar}::${chatName}`, name: charName, displayName });
            }
          } catch (e) {
            console.warn('[资源导出] 读取聊天列表失败', charName, e);
          }
        }
      }
    } catch (e) {
      console.warn('[资源导出] 枚举聊天失败', e);
    }

    // 扩展 URL（优先 discover 枚举 third-party，回退到 extensionSettings）
    try {
      const collected = new Set<string>();

      try {
        const headers = getTavernRequestHeaders();
        if (headers) {
          const resp = await fetch('/api/extensions/discover', { method: 'GET', headers, cache: 'no-cache' });
          if (resp.ok) {
            const discovered = await resp.json().catch(() => null);
            const list = Array.isArray(discovered) ? discovered : [];
            for (const x of list) {
              const name = String((x as any)?.name || '').trim();
              if (!name.startsWith('third-party/')) continue;
              const folder = name.slice('third-party/'.length).trim();
              if (!folder) continue;
              if (collected.has(folder)) continue;
              collected.add(folder);
              addEntry({ type: 'extension_url', path: folder, name: folder, displayName: folder, url: '' });
            }
          }
        }
      } catch {
        // ignore
      }

      const extSettings = (SillyTavern as any)?.extensionSettings;
      const ids = extSettings && typeof extSettings === 'object' ? Object.keys(extSettings) : [];
      for (const rawId of ids.map(x => String(x || '').trim()).filter(Boolean)) {
        if (collected.has(rawId)) continue;
        const type = typeof getExtensionType === 'function' ? getExtensionType(rawId) : null;
        if (type === null) continue;
        if (type === 'system') continue;
        collected.add(rawId);
        addEntry({ type: 'extension_url', path: rawId, name: rawId, displayName: rawId, url: '' });
      }
    } catch (e) {
      console.warn('[资源导出] 枚举扩展失败', e);
    }

    for (const entry of next) {
      entry.recognizedName = entry.displayName;
      entry.compareKey = getEntryCompareBase(entry);
      entry.duplicateSource = 'none';
      entry.duplicateCount = 0;
      entry.warnings = [];
      entry.canDeleteSourceFile = false;
      entry.sourceDeletePath = undefined;
      entry.sourceDeleteReason = '导出模式没有源文件可删';
    }

    entries.value = next;
    selectedIds.value = new Set();
    selectedCategory.value = 'all';
    searchQuery.value = '';
    sortKey.value = 'default';
    sortOrder.value = 'asc';
    statusFilter.value = 'all';
    duplicateFilter.value = 'all';
    updateStats();
  }

  async function startExport() {
    if (!rootPicked.value) {
      await pickRootDir();
      if (!rootPicked.value) return;
    }
    if (!rootDirHandle.value) {
      toastr.error('当前浏览器不支持导出：请使用支持目录选择（showDirectoryPicker）的浏览器');
      return;
    }

    const token = ++exportSessionToken.value;

    flowMode.value = 'export';
    exportLoading.value = true;
    try {
      await loadExportEntries();
    } finally {
      exportLoading.value = false;
    }

    // 后台预取扩展 remote URL（可能需要时间）
    void prefetchExtensionUrls(token);
  }

  function collectObjects(value: any, depth: number, out: any[]) {
    if (!value || depth <= 0) return;
    if (Array.isArray(value)) {
      for (const v of value) collectObjects(v, depth - 1, out);
      return;
    }
    if (typeof value === 'object') {
      out.push(value);
      for (const v of Object.values(value)) collectObjects(v, depth - 1, out);
    }
  }

  function extractId(obj: any) {
    return String(obj?.id ?? obj?.extension_id ?? obj?.extensionId ?? obj?.extension ?? '').trim();
  }

  function extractName(obj: any) {
    return String(obj?.name ?? obj?.displayName ?? obj?.title ?? '').trim();
  }

  function extractUrl(obj: any) {
    const candidates = [obj?.url, obj?.repo, obj?.repoUrl, obj?.repo_url, obj?.remote, obj?.remote_url, obj?.git, obj?.git_url];
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (/^https?:\/\//i.test(s)) return s;
    }
    return '';
  }

  async function loadHelperPluginIndex(): Promise<any | null> {
    if (helperPluginIndexCache !== null) return helperPluginIndexCache;

    const helperId = typeof getTavernHelperExtensionId === 'function' ? String(getTavernHelperExtensionId() || '').trim() : '';
    if (!helperId) {
      helperPluginIndexCache = null;
      return null;
    }

    const base = `/scripts/extensions/third-party/${encodeURIComponent(helperId)}`;
    const candidates = [`${base}/脚本-插件.json`, `${base}/插件.json`, `${base}/plugin.json`];

    for (const url of candidates) {
      try {
        const resp = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-cache' });
        if (!resp.ok) continue;
        const data = await resp.json();
        helperPluginIndexCache = data;
        return data;
      } catch {
        // ignore
      }
    }

    helperPluginIndexCache = null;
    return null;
  }

  async function getExtensionUrlFromHelperPluginJson(extensionId: string) {
    const id = String(extensionId || '').trim();
    if (!id) return null;
    if (helperPluginUrlCache.has(id)) return helperPluginUrlCache.get(id)!;

    const index = await loadHelperPluginIndex();
    if (!index) return null;

    try {
      const direct = (index as any)[id];
      if (typeof direct === 'string' && /^https?:\/\//i.test(direct.trim())) {
        const hit = { url: direct.trim() };
        helperPluginUrlCache.set(id, hit);
        return hit;
      }
      if (direct && typeof direct === 'object') {
        const u = extractUrl(direct);
        if (u) {
          const hit = { url: u, name: extractName(direct) || undefined };
          helperPluginUrlCache.set(id, hit);
          return hit;
        }
      }
    } catch {
      // ignore
    }

    const objs: any[] = [];
    collectObjects(index, 4, objs);
    for (const obj of objs) {
      const objId = extractId(obj);
      if (!objId || objId !== id) continue;
      const u = extractUrl(obj);
      if (!u) continue;
      const hit = { url: u, name: extractName(obj) || undefined };
      helperPluginUrlCache.set(id, hit);
      return hit;
    }

    return null;
  }

  async function loadExtensionDiscoverMap() {
    const ttlMs = 3 * 60 * 1000;
    if (extensionDiscoverCache && Date.now() - extensionDiscoverCacheAt < ttlMs) return extensionDiscoverCache;

    const headers = getTavernRequestHeaders();
    if (!headers) return null;

    try {
      const resp = await fetch('/api/extensions/discover', { method: 'GET', headers, cache: 'no-cache' });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      const list = Array.isArray(data) ? data : [];

      const map = new Map<string, 'local' | 'global'>();
      for (const item of list) {
        const name = String((item as any)?.name || '').trim();
        if (!name.startsWith('third-party/')) continue;
        const folder = name.slice('third-party/'.length).trim();
        if (!folder) continue;
        const type = String((item as any)?.type || '').trim().toLowerCase();
        map.set(folder, type === 'global' ? 'global' : 'local');
      }

      extensionDiscoverCache = map;
      extensionDiscoverCacheAt = Date.now();
      return map;
    } catch {
      return null;
    }
  }

  async function getExtensionRemoteUrlViaApiVersion(extensionId: string, scope?: 'local' | 'global') {
    const cleanId = String(extensionId || '').trim();
    if (!cleanId) return null;
    if (extensionVersionCache.has(cleanId)) {
      const cached = extensionVersionCache.get(cleanId)!;
      if (cached.url) return { url: cached.url, name: cached.name, source: 'api_version' as const };
    }

    const headers = getTavernRequestHeaders();
    if (!headers) return null;
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';

    try {
      const resp = await fetch('/api/extensions/version', {
        method: 'POST',
        headers,
        body: JSON.stringify({ extensionName: cleanId, global: scope === 'global' }),
        cache: 'no-cache',
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      const remoteUrl = String((data as any)?.remoteUrl ?? (data as any)?.remote_url ?? '').trim();
      const branch = String((data as any)?.currentBranchName ?? (data as any)?.current_branch_name ?? '').trim();
      const name = String((data as any)?.displayName ?? (data as any)?.name ?? '').trim() || undefined;
      if (!remoteUrl) return null;
      extensionVersionCache.set(cleanId, { url: remoteUrl, name, branch });
      return { url: remoteUrl, name, source: 'api_version' as const };
    } catch {
      return null;
    }
  }

  async function getExtensionRemoteUrl(extensionId: string) {
    const cleanId = String(extensionId || '').trim();

    // 官方接口：/api/extensions/version（可能较慢，但最可靠）
    let scope: 'local' | 'global' | undefined;
    const extType = typeof getExtensionType === 'function' ? getExtensionType(cleanId) : null;
    if (extType === 'global') scope = 'global';
    if (extType === 'local') scope = 'local';
    if (!scope) {
      const discoverMap = await loadExtensionDiscoverMap();
      scope = discoverMap?.get(cleanId);
    }
    const apiHit = await getExtensionRemoteUrlViaApiVersion(cleanId, scope);
    if (apiHit?.url) return apiHit;

    const helperHit = await getExtensionUrlFromHelperPluginJson(extensionId);
    if (helperHit?.url) return { url: helperHit.url, name: helperHit.name, source: 'helper_plugin' as const };

    if (cleanId) {
      const base = `/scripts/extensions/third-party/${encodeURIComponent(cleanId)}`;
      const tryReadUrl = (obj: any) => {
        const candidates: any[] = [];
        if (obj && typeof obj === 'object') {
          candidates.push(obj.homepage, obj.url, obj.remote_url, obj.repo, obj.repo_url);
          const repo = (obj as any).repository;
          if (typeof repo === 'string') candidates.push(repo);
          if (repo && typeof repo === 'object') candidates.push(repo.url, repo.web, repo.href);
          const bugs = (obj as any).bugs;
          if (typeof bugs === 'string') candidates.push(bugs);
          if (bugs && typeof bugs === 'object') candidates.push(bugs.url);
        }
        for (const c of candidates) {
          const s = String(c ?? '').trim();
          if (/^https?:\/\//i.test(s)) return s;
        }
        return '';
      };
      const tryFetchJson = async (filename: string) => {
        try {
          const resp = await fetch(`${base}/${filename}?t=${Date.now()}`, { cache: 'no-cache' });
          if (!resp.ok) return null;
          return await resp.json();
        } catch {
          return null;
        }
      };

      const manifest = await tryFetchJson('manifest.json');
      const manifestUrl = tryReadUrl(manifest);
      if (manifestUrl) return { url: manifestUrl, name: extractName(manifest) || undefined, source: 'manifest' as const };

      const pkg = await tryFetchJson('package.json');
      const pkgUrl = tryReadUrl(pkg);
      if (pkgUrl) return { url: pkgUrl, name: extractName(pkg) || undefined, source: 'package' as const };
    }

    let info: any = null;
    try {
      info = typeof getExtensionInstallationInfo === 'function' ? await getExtensionInstallationInfo(extensionId) : null;
    } catch {
      info = null;
    }
    const remoteUrl = String(info?.remote_url || '').trim();
    if (!remoteUrl) return null;
    return { url: remoteUrl, name: undefined, source: 'installation' as const };
  }

  async function prefetchExtensionUrls(token: number) {
    if (token !== exportSessionToken.value) return;
    if (!isExportMode.value) return;

    const list = entries.value.filter(e => e.type === 'extension_url' && String(e.path || '').trim().length > 0);
    if (list.length === 0) return;

    const concurrency = 4;
    let cursor = 0;

    const runOne = async () => {
      while (cursor < list.length) {
        const item = list[cursor++];
        if (token !== exportSessionToken.value) return;
        const id = String(item.path || '').trim();
        if (!id) continue;

        let extType = typeof getExtensionType === 'function' ? getExtensionType(id) : null;
        if (extType === 'system') {
          item.status = 'skipped';
          item.errorMessage = '系统扩展不提供 URL';
          continue;
        }
        if (extType === null) {
          const discoverMap = await loadExtensionDiscoverMap();
          if (!discoverMap?.has(id)) {
            item.status = 'skipped';
            item.errorMessage = '扩展未安装或不可识别';
            continue;
          }
          extType = discoverMap.get(id) || null;
        }

        const loading = new Set(extensionUrlLoadingIds.value);
        loading.add(item.id);
        extensionUrlLoadingIds.value = loading;

        try {
          const hit = await getExtensionRemoteUrl(id);
          if (token !== exportSessionToken.value) return;
          if (hit?.url) {
            item.url = hit.url;
            item.errorMessage = undefined;
          } else {
            item.errorMessage = '未能获取 URL（可能是本地安装或无远程仓库）';
          }
        } finally {
          const next = new Set(extensionUrlLoadingIds.value);
          next.delete(item.id);
          extensionUrlLoadingIds.value = next;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => runOne()));
  }

  function shouldSkipIfExists() {
    return exportConflictStrategy.value === 'skip';
  }

  async function exportPreset(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '预设');
    const name = String(item.path || item.displayName || '').trim();
    const filename = `${sanitizeFilename(name)}.json`;
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }
    const preset = getPreset(name as any);
    await writeTextFile(dir, filename, JSON.stringify(preset, null, 2));
  }

  async function exportWorldbook(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '世界书');
    const name = String(item.path || item.displayName || '').trim();
    const filename = `${sanitizeFilename(name)}.json`;
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }

    const headers = getTavernRequestHeaders();
    if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
    const resp = await fetch('/api/worldinfo/get', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name }),
    });
    if (!resp.ok) throw new Error(`获取世界书失败: HTTP ${resp.status}`);
    const data = await resp.json();
    await writeTextFile(dir, filename, JSON.stringify(data, null, 2));
  }

  async function exportCharacter(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '角色卡');
    const avatar = String(item.path || '').trim();
    if (!avatar) throw new Error('角色卡缺少 avatar');

    const display = sanitizeFilename(String(item.displayName || '').trim());
    const avatarLeaf = avatar.split('/').pop() || avatar;
    const avatarNoExt = stripExt(avatarLeaf);
    const avatarClean = sanitizeFilename(avatarLeaf);
    const avatarNoExtClean = sanitizeFilename(avatarNoExt);

    const collapseRepeatedPrefix = (prefix: string, name: string) => {
      if (!prefix) return name;
      let out = String(name || '');
      const mark = `${prefix}__`;
      while (out.startsWith(mark)) out = out.slice(mark.length);
      return out;
    };

    const isDupName = display && (avatarNoExtClean === display || avatarClean === display);
    const suffixNoExt = collapseRepeatedPrefix(display, avatarNoExtClean);
    const suffixFull = collapseRepeatedPrefix(display, avatarClean);
    const avatarAlreadyPrefixed = display && (avatarNoExtClean.startsWith(`${display}__`) || avatarClean.startsWith(`${display}__`));

    if (characterExportFormat.value === 'json') {
      const filename = isDupName ? `${display}.json` : avatarAlreadyPrefixed ? `${suffixNoExt}.json` : `${display}__${suffixNoExt}.json`;
      if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
        item.status = 'skipped';
        item.errorMessage = '文件已存在，已跳过';
        return;
      }

      const chars = Array.isArray((SillyTavern as any)?.characters) ? (SillyTavern as any).characters : [];
      const found = chars.find((c: any) => String(c?.avatar || '').trim() === avatar);
      const raw = String(found?.json_data || '').trim();
      if (!raw) throw new Error('无法获取角色卡 JSON 数据（json_data 为空）');

      try {
        const parsed = JSON.parse(raw) as unknown;
        await writeTextFile(dir, filename, JSON.stringify(parsed, null, 2));
      } catch {
        await writeTextFile(dir, filename, raw);
      }

      return;
    }

    const hasPng = avatarLeaf.toLowerCase().endsWith('.png');
    const filename = isDupName ? `${display}.png` : avatarAlreadyPrefixed ? `${suffixFull}${hasPng ? '' : '.png'}` : `${display}__${suffixFull}${hasPng ? '' : '.png'}`;
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }

    const headers = getTavernRequestHeaders();
    if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
    const resp = await fetch('/api/characters/export', {
      method: 'POST',
      headers,
      body: JSON.stringify({ format: 'png', avatar_url: avatar }),
      cache: 'no-cache',
    });
    if (!resp.ok) throw new Error(`导出角色卡失败: HTTP ${resp.status}`);
    const blob = await resp.blob();
    await writeBlobFile(dir, filename, blob);
  }

  async function exportRegex(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '正则');
    const id = String(item.path || '').trim();
    if (!id) throw new Error('正则缺少 id');
    const filename = `${sanitizeFilename(item.displayName)}__${sanitizeFilename(id)}.json`;
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }

    const regexes = typeof getTavernRegexes === 'function' ? getTavernRegexes({ type: 'global' }) : [];
    const regex = (Array.isArray(regexes) ? regexes : []).find((r: any) => String(r?.id || '').trim() === id);
    if (!regex) throw new Error('找不到该正则条目（可能已被删除）');

    const legacy = (() => {
      const r: any = regex as any;
      const placement: number[] = [];
      const src = r?.source || {};
      if (src?.user_input) placement.push(1);
      if (src?.ai_output) placement.push(2);
      if (src?.slash_command) placement.push(3);
      if (src?.world_info) placement.push(5);
      if (src?.reasoning) placement.push(6);

      const dst = r?.destination || {};
      const display = Boolean(dst?.display);
      const prompt = Boolean(dst?.prompt);
      const promptOnly = prompt && !display;
      const markdownOnly = display && !prompt;

      return {
        id: String(r?.id || '').trim(),
        scriptName: String(r?.script_name || '').trim() || String(item.displayName || '').trim() || String(r?.id || '').trim(),
        findRegex: String(r?.find_regex ?? ''),
        replaceString: String(r?.replace_string ?? ''),
        trimStrings: Array.isArray(r?.trim_strings) ? r.trim_strings : [],
        placement,
        disabled: r?.enabled === false,
        markdownOnly,
        promptOnly,
        runOnEdit: Boolean(r?.run_on_edit),
        substituteRegex: Number.isFinite(Number(r?.substituteRegex)) ? Number(r?.substituteRegex) : 0,
        minDepth: r?.min_depth ?? null,
        maxDepth: r?.max_depth ?? null,
      };
    })();

    // 与酒馆/Folder-Manager 的正则导出格式保持一致（camelCase）
    await writeTextFile(dir, filename, JSON.stringify(legacy, null, 2));
  }

  function findScriptByName(name: string): Script | null {
    const trees = getScriptTrees({ type: 'global' });
    for (const tree of trees) {
      if (tree.type === 'script' && tree.name === name) return tree;
      if (tree.type === 'folder') {
        const found = tree.scripts.find(s => s.name === name);
        if (found) return found;
      }
    }
    return null;
  }

  async function exportScript(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '脚本');
    const name = String(item.path || item.displayName || '').trim();
    const filename = `${sanitizeFilename(name)}.${scriptExportFormat.value}`;
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }

    const script = findScriptByName(name);
    if (!script) throw new Error('找不到该脚本（可能已被删除或重命名）');
    await writeTextFile(dir, filename, String((script as any).content || ''));
  }

  async function exportTheme(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '美化');
    const name = String(item.path || item.displayName || '').trim();
    const filename = `${sanitizeFilename(name)}.json`;
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }

    const headers = getTavernRequestHeaders();
    if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
    const resp = await fetch('/api/settings/get', { method: 'POST', headers, body: JSON.stringify({}) });
    if (!resp.ok) throw new Error(`获取主题数据失败: HTTP ${resp.status}`);
    const settingsData = await resp.json();
    const allThemes = Array.isArray(settingsData?.themes) ? settingsData.themes : [];
    const themeData = allThemes.find((t: any) => (typeof t === 'object' ? t?.name : t) === name);
    if (!themeData || typeof themeData !== 'object') throw new Error('找不到主题数据（仅支持导出对象型主题）');
    await writeTextFile(dir, filename, JSON.stringify(themeData, null, 2));
  }

  async function exportBackgroundFile(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');
    const dir = await ensureDir(root, '背景图');
    const bgfile = String(item.path || '').trim();
    if (!bgfile) throw new Error('背景缺少文件名');
    const filename = sanitizeFilename(bgfile.split('/').pop() || bgfile);
    if (shouldSkipIfExists() && (await tryGetFile(dir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }

    const resp = await fetch(`/backgrounds/${encodeURIComponent(bgfile)}`);
    if (!resp.ok) throw new Error(`导出背景失败: HTTP ${resp.status}`);
    const blob = await resp.blob();
    await writeBlobFile(dir, filename, blob);
  }

  async function exportChat(item: ImportEntry) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');

    const raw = String(item.path || '').trim();
    const [avatar, chatName] = raw.split('::');
    if (!avatar || !chatName) throw new Error('聊天条目缺少 avatar 或 chatName');

    const headers = getTavernRequestHeaders();
    if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');

    const body = {
      is_group: false,
      avatar_url: avatar,
      file: `${chatName}.jsonl`,
      exportfilename: `${chatName}.jsonl`,
      format: 'jsonl',
    };
    const response = await fetch('/api/chats/export', {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`导出聊天失败: ${String(data?.message || `HTTP ${response.status}`)}`);
    const result = data?.result;
    if (typeof result !== 'string') throw new Error('导出聊天返回格式异常');

    let blob: Blob;
    if (result.startsWith('data:')) {
      blob = await (await fetch(result)).blob();
    } else {
      blob = new Blob([result], { type: 'text/plain' });
    }

    const chatRoot = await ensureDir(root, '聊天');
    const charDirName = sanitizeFilename(String(item.name || '角色').trim());
    const charDir = await ensureDir(chatRoot, charDirName);
    const filename = `${sanitizeFilename(chatName)}.jsonl`;
    if (shouldSkipIfExists() && (await tryGetFile(charDir, filename))) {
      item.status = 'skipped';
      item.errorMessage = '文件已存在，已跳过';
      return;
    }
    await writeBlobFile(charDir, filename, blob);
  }

  function buildExtensionBlock(ext: { id: string; name: string; url: string }) {
    return [`拓展ID: ${ext.id}`, `拓展名: ${ext.name}`, `URL: ${ext.url}`].join('\n').trim();
  }

  async function exportExtensionTxt(items: ImportEntry[]) {
    const root = rootDirHandle.value;
    if (!root) throw new Error('未选择导出目录');

    const extDir = await ensureDir(root, '拓展');

    // 兼容旧位置：根目录下的 拓展.txt
    const legacyFile = await tryGetFile(root, '拓展.txt');
    const legacyText = legacyFile ? await legacyFile.text() : '';

    const existingFile = await tryGetFile(extDir, '拓展.txt');
    const existingText = existingFile ? await existingFile.text() : legacyText;
    const existingBlocks = existingText ? parseExtensionBlocks(existingText) : [];
    const existingParsed = existingBlocks
      .map(parseExtensionTxtBlock)
      .filter(b => (b.id || '').trim() || (b.urls?.[0] || '').trim());

    const seen = new Set<string>();
    for (const b of existingParsed) {
      const id = String(b.id || '').trim();
      if (id) seen.add(`id:${id}`);
      for (const u of b.urls || []) {
        const url = String(u || '').trim();
        if (url) seen.add(`url:${url}`);
      }
    }

    const newBlocks: string[] = [];
    for (const item of items) {
      const id = String(item.path || item.displayName || '').trim();
      if (!id) {
        item.status = 'error';
        item.errorMessage = '扩展 id 缺失';
        continue;
      }

      let remoteUrl = String(item.url || '').trim();
      let helperName: string | undefined;
      if (!remoteUrl) {
        const hit = await getExtensionRemoteUrl(id);
        remoteUrl = String(hit?.url || '').trim();
        helperName = hit?.name;
        if (remoteUrl) item.url = remoteUrl;
      }
      if (!remoteUrl) {
        item.status = 'skipped';
        item.errorMessage = '无法获取远程URL（可能是系统扩展或本地安装）';
        continue;
      }

      const key = `id:${id}`;
      if (seen.has(key) || seen.has(`url:${remoteUrl}`)) {
        item.status = 'skipped';
        item.errorMessage = '已存在于 拓展.txt，已跳过';
        continue;
      }

      let extName = String(helperName || '').trim() || id;
      if (extName === id) {
        try {
          const last = remoteUrl.replace(/\/+$/, '').split('/').pop() || '';
          extName = (last || id).replace(/\.git$/i, '') || id;
        } catch {
          extName = id;
        }
      }

      newBlocks.push(buildExtensionBlock({ id, name: extName, url: remoteUrl }));
      seen.add(key);
      seen.add(`url:${remoteUrl}`);
      item.status = 'success';
      item.errorMessage = undefined;
    }

    if (newBlocks.length === 0) return;

    const combinedBlocks = [...existingBlocks, ...newBlocks].filter(Boolean).map(s => s.trim()).filter(Boolean);
    const output = combinedBlocks.join('\n---\n') + '\n';
    await writeTextFile(extDir, '拓展.txt', output);
  }

  async function exportSingle(item: ImportEntry) {
    if (item.status === 'success') return;
    if (item.status !== 'pending') {
      item.status = 'pending';
      item.errorMessage = undefined;
    }

    if (!rootDirHandle.value) throw new Error('未选择导出目录');

    try {
      if (item.type === 'extension_url') {
        await exportExtensionTxt([item]);
        updateStats();
        return;
      }

      switch (item.type) {
        case 'preset':
          await exportPreset(item);
          break;
        case 'worldbook':
          await exportWorldbook(item);
          break;
        case 'character':
          await exportCharacter(item);
          break;
        case 'regex':
          await exportRegex(item);
          break;
        case 'script':
          await exportScript(item);
          break;
        case 'theme':
          await exportTheme(item);
          break;
        case 'background':
          await exportBackgroundFile(item);
          break;
        case 'chat':
          await exportChat(item);
          break;
        default:
          item.status = 'skipped';
          item.errorMessage = '不支持的导出类型';
          updateStats();
          return;
      }

      if (item.status !== 'skipped') {
        item.status = 'success';
        item.errorMessage = undefined;
      }
    } catch (error) {
      item.status = 'error';
      item.errorMessage = error instanceof Error ? error.message : String(error);
    }

    updateStats();
  }

  async function exportSelected() {
    if (isProcessing.value) return;
    if (!isExportMode.value) return;
    isProcessing.value = true;
    try {
      const targets = entries.value.filter(e => selectedIds.value.has(e.id) && e.status === 'pending');
      const ext = targets.filter(t => t.type === 'extension_url');
      const others = targets.filter(t => t.type !== 'extension_url');
      if (ext.length > 0) {
        await exportExtensionTxt(ext);
        updateStats();
      }
      for (const item of others) await exportSingle(item);
      selectedIds.value = new Set();
      buildOperationResult('导出结果', targets);
    } finally {
      isProcessing.value = false;
    }
  }

  async function exportAll() {
    if (isProcessing.value) return;
    if (!isExportMode.value) return;
    isProcessing.value = true;
    try {
      const ext = entries.value.filter(e => e.status === 'pending' && e.type === 'extension_url');
      const others = entries.value.filter(e => e.status === 'pending' && e.type !== 'extension_url');
      const targets = [...ext, ...others];
      if (ext.length > 0) {
        await exportExtensionTxt(ext);
        updateStats();
      }
      for (const item of others) await exportSingle(item);
      buildOperationResult('导出结果', targets);
    } finally {
      isProcessing.value = false;
    }
  }

  async function exportAllWithConfirm() {
    const ok = window.confirm(
      '将导出“资源导入导出”当前列表中的所有条目（不受左侧目录筛选/分类/搜索影响）。\n\n这不是“仅导出你当前点选的某个目录”的全部文件。\n\n确认继续？',
    );
    if (!ok) return;
    await exportAll();
  }

  async function importSingle(item: ImportEntry) {
    if (item.status === 'success') return;
    if (item.status !== 'pending') {
      item.status = 'pending';
      item.errorMessage = undefined;
    }

    if (item.type === 'extension_url') {
      item.status = 'skipped';
      item.errorMessage = '扩展条目仅用于复制 URL';
      updateStats();
      return;
    }

    if (!item.type || item.type === 'unknown') {
      item.status = 'error';
      item.errorMessage = '无法根据所在文件夹识别类型';
      updateStats();
      return;
    }

    if (item.type === 'auto_json') {
      if (!item.file) {
        item.status = 'error';
        item.errorMessage = '缺少 JSON 文件';
        updateStats();
        return;
      }
      const resolved = await resolveAutoJsonType(item.file);
      if (resolved === 'unknown') {
        item.status = 'error';
        item.errorMessage =
          item.file.size > 2 * 1024 * 1024
            ? '文件较大，自动识别可能不准确，请放到对应文件夹后再导入'
            : '无法自动识别此 JSON 类型，请放到对应文件夹后再导入';
        updateStats();
        return;
      }
      item.type = resolved;
    }

    if (item.type === 'resource' || categorizeType(item.type) === 'resource') {
      item.status = 'skipped';
      item.errorMessage = '资源类型仅展示，不导入';
      updateStats();
      return;
    }

    if (categorizeType(item.type) === 'unsupported') {
      item.status = 'skipped';
      item.errorMessage = '不支持的资源类型';
      updateStats();
      return;
    }

    if (item.path && !item.file) {
      item.status = 'error';
      item.errorMessage = `文件 "${item.path}" 未在所选文件夹中找到`;
      updateStats();
      return;
    }

    const importName = getEntryLabel(item);

    try {
      if (item.type === 'character' && item.file) {
        const beforeSigs = new Set<string>();
        let beforeLen = 0;
        try {
          const chars = Array.isArray((SillyTavern as any)?.characters) ? (SillyTavern as any).characters : [];
          beforeLen = chars.length;
          for (const ch of chars) {
            const n = String(ch?.name || '').trim();
            const a = String(ch?.avatar || '').trim();
            if (n || a) beforeSigs.add(`${n}::${a}`);
          }
        } catch {
          // ignore
        }

        try {
          const resp = await importRawCharacter(importName, item.file);
          // 某些版本可能返回非 ok 但实际导入成功；此处以“是否可见”为准
          if (resp && typeof (resp as any).ok === 'boolean' && (resp as any).ok === false) {
            item.errorMessage = `导入角色卡返回 HTTP ${(resp as any).status ?? 'unknown'}（若已实际导入可忽略）`;
          }
        } catch (e) {
          // 兼容：有时内部抛错但角色已导入/已更新
          await new Promise<void>(r => setTimeout(r, 250));
          let existsNow = false;
          try {
            const chars = Array.isArray((SillyTavern as any)?.characters) ? (SillyTavern as any).characters : [];
            if (beforeLen > 0 && chars.length > beforeLen) existsNow = true;
            for (const ch of chars) {
              const n = String(ch?.name || '').trim();
              const a = String(ch?.avatar || '').trim();
              const sig = `${n}::${a}`;
              if (!beforeSigs.has(sig)) existsNow = true;
            }
          } catch {
            existsNow = false;
          }

          if (!existsNow) throw e;
          item.errorMessage = `导入角色卡报告失败但已检测到角色存在（可忽略）：${e instanceof Error ? e.message : String(e)}`;
        }

        item.status = 'success';
      } else if (item.type === 'theme' && item.file) {
        await importTheme(item);
        item.status = 'success';
      } else if (item.file) {
        const text = await item.file.text();
        switch (item.type) {
          case 'preset': {
            await importPresetFromText(importName, text);
            break;
          }
          case 'worldbook': {
            const resp = await importRawWorldbook(importName, text);

            // 兼容：某些版本可能返回 undefined/非 Response
            const isResponseLike = resp && typeof (resp as any).ok === 'boolean' && typeof (resp as any).status === 'number';
            if (isResponseLike) {
              if (!(resp as any).ok) {
                let msg = `导入世界书失败: HTTP ${(resp as any).status ?? 'unknown'}`;
                try {
                  const data = await (resp as any).json();
                  if (data?.message) msg = `导入世界书失败: ${String(data.message)}`;
                } catch {
                  // ignore
                }
                throw new Error(msg);
              }
              await refreshWorldInfoAfterImport();
              break;
            }

            // 回退：直接调用 SillyTavern 的 worldinfo/import（参考 Folder-Manager 实现）
            const headers = getTavernRequestHeaders({ omitContentType: true });
            if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
            const formData = new FormData();
            const file = new File([text], `${sanitizeFilename(importName)}.json`, { type: 'application/json' });
            formData.append('avatar', file);

            const r2 = await fetch('/api/worldinfo/import', {
              method: 'POST',
              headers,
              body: formData,
              cache: 'no-cache',
            });
            if (!r2.ok) throw new Error(`导入世界书失败: HTTP ${r2.status}`);
            const data2 = await r2.json().catch(() => null);
            if (!data2?.name) throw new Error('导入世界书失败: 服务器未返回世界书名称');
            await refreshWorldInfoAfterImport();
            break;
          }
          case 'regex': {
            const r = importRawTavernRegex(importName, text);
            if (!r) throw new Error('导入正则返回失败');
            break;
          }
          case 'chat': {
            await importRawChat(importName, text);
            break;
          }
          case 'script': {
            await importScriptToGlobal(item);
            break;
          }
          case 'theme': {
            await importTheme(item);
            break;
          }
          case 'background': {
            await importBackground(item);
            break;
          }
        }
        item.status = 'success';
      }
    } catch (error) {
      item.status = 'error';
      item.errorMessage = error instanceof Error ? error.message : String(error);
    }

    updateStats();
  }

  async function importScriptToGlobal(item: ImportEntry) {
    const trees = getScriptTrees({ type: 'global' });
    const cleanName = getEntryLabel(item).replace(/\.\w+$/, '');
    const existing = findExistingScript(trees, cleanName);

    let finalName = cleanName;
    if (existing) {
      if (conflictStrategy.value === 'skip') {
        item.status = 'skipped';
        item.errorMessage = `脚本 "${cleanName}" 已存在，已跳过`;
        return;
      }
      if (conflictStrategy.value === 'rename') {
        let counter = 1;
        while (findExistingScript(trees, `${cleanName} (${counter})`)) {
          counter++;
        }
        finalName = `${cleanName} (${counter})`;
      }
    }

    const content = await item.file!.text();
    const scriptEntry: Script = {
      type: 'script',
      enabled: false,
      name: finalName,
      id: `${finalName}-${Date.now()}`,
      content,
      info: '从文件夹导入',
      button: { enabled: true, buttons: [] },
      data: {},
    };

    if (existing && conflictStrategy.value === 'overwrite') {
      for (let i = 0; i < trees.length; i++) {
        if (trees[i].type === 'script' && trees[i].name === cleanName) {
          trees[i] = scriptEntry;
          break;
        }
        if (trees[i].type === 'folder') {
          const idx = trees[i].scripts.findIndex(s => s.name === cleanName);
          if (idx !== -1) {
            trees[i].scripts[idx] = scriptEntry;
            break;
          }
        }
      }
    } else {
      trees.push(scriptEntry);
    }

    replaceScriptTrees(trees, { type: 'global' });
    item.status = 'success';
  }

  async function importTheme(item: ImportEntry) {
    const file = item.file;
    if (!file) throw new Error('主题文件缺失');

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const looksJson = ext === 'json' || /json/i.test(file.type || '');
    const looksCss = ext === 'css' || /css/i.test(file.type || '');

    const raw = await file.text();
    const trimmed = raw.trim();
    const isLikelyJson = looksJson || (!looksCss && (trimmed.startsWith('{') || trimmed.startsWith('[')));

    if (isLikelyJson) {
      const themeName = guessUiThemeNameFromJson(raw, item.displayName);
      const themeFile = new File([raw], `${sanitizeFilenamePart(themeName)}.json`, { type: 'application/json' });
      const ok = tryImportUiThemeJsonToTavern(themeFile);
      if (!ok) {
        throw new Error('未找到酒馆的 UI 主题导入控件，请在酒馆设置-主题中手动导入该 JSON');
      }
      toastr.success(`UI 主题 "${themeName}" 已导入`);
      return;
    }

    const css = replaceCssAssetUrls(raw, item.path || file.name, filesMap.value);
    upsertParentStyleTag(item.displayName, css);
    toastr.success(`主题 "${item.displayName}" 已应用（本次会话有效）`);
  }

  async function importBackground(item: ImportEntry) {
    const file = item.file;
    if (!file) throw new Error('背景图文件缺失');

    const headers = getTavernRequestHeaders({ omitContentType: true });
    const csrf =
      (headers as any)?.['X-CSRF-TOKEN'] ||
      (headers as any)?.['x-csrf-token'] ||
      Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'x-csrf-token')?.[1];
    if (!csrf) throw new Error('无法获取酒馆请求头（X-CSRF-TOKEN），请刷新酒馆后重试');

    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch('/api/backgrounds/upload', {
      method: 'POST',
      headers,
      body: formData,
      cache: 'no-cache',
    });
    if (!response.ok) {
      throw new Error(`导入背景失败: HTTP ${response.status}`);
    }

    await refreshBackgroundsAfterUpload();
    toastr.success(`背景图 "${item.displayName}" 已导入`);
  }

  function buildOperationResult(title: string, targets: ImportEntry[]) {
    resultDialog.visible = true;
    resultDialog.title = title;
    resultDialog.success = targets.filter(item => item.status === 'success').length;
    resultDialog.failed = targets.filter(item => item.status === 'error').length;
    resultDialog.skipped = targets.filter(item => item.status === 'skipped').length;
    resultDialog.items = targets
      .filter(item => item.status === 'error' || item.status === 'skipped')
      .map(item => ({
        id: item.id,
        displayName: getEntryLabel(item),
        type: item.type,
        path: item.path,
        status: item.status as 'error' | 'skipped',
        reason: item.errorMessage || (item.status === 'skipped' ? '已跳过' : '执行失败'),
      }));
  }

  function collectPreflightWarnings(targets: ImportEntry[]) {
    return targets
      .map(item => {
        const messages: string[] = [];
        if (item.duplicateSource && item.duplicateSource !== 'none') {
          pushUniqueWarning(messages, item.duplicateReason || '检测到重复资源');
        }
        for (const warning of item.warnings || []) pushUniqueWarning(messages, warning);
        return messages.length > 0 ? { id: item.id, displayName: getEntryLabel(item), messages } : null;
      })
      .filter(Boolean) as Array<{ id: string; displayName: string; messages: string[] }>;
  }

  function requestImportPreflight(targets: ImportEntry[], title: string) {
    const warnings = collectPreflightWarnings(targets);
    if (warnings.length === 0) return false;
    preflightDialog.visible = true;
    preflightDialog.title = title;
    preflightDialog.itemIds = targets.map(item => item.id);
    preflightDialog.warnings = warnings;
    return true;
  }

  async function continueImportFromPreflight() {
    const ids = new Set(preflightDialog.itemIds);
    closePreflightDialog();
    if (ids.size === 0) return;
    await runImportBatch(Array.from(ids), '导入结果');
  }

  async function runImportBatch(ids: string[], resultTitle: string) {
    if (isProcessing.value) return;
    isProcessing.value = true;
    try {
      const idSet = new Set(ids);
      const targets = entries.value.filter(e => idSet.has(e.id) && e.status === 'pending');
      for (const item of targets) await importSingle(item);
      selectedIds.value = new Set();
      await refreshTavernResourceIndex();
      analyzeDuplicates(entries.value);
      buildOperationResult(resultTitle, targets);
    } finally {
      isProcessing.value = false;
    }
  }

  function createTavernMatchFromEntry(item: ImportEntry): TavernResourceMatch {
    return {
      id: item.id,
      type: item.type,
      name: getEntryLabel(item),
      path: item.path,
      compareKey: String(item.compareKey || ''),
      canDelete: true,
      meta:
        item.type === 'character'
          ? { avatar: String(item.path || '').trim() }
          : item.type === 'extension_url'
            ? { extensionId: String(item.path || item.extensionId || '').trim() }
            : undefined,
    };
  }

  async function deleteTavernResource(match: TavernResourceMatch, options?: { deleteChats?: boolean }) {
    const name = String(match.name || '').trim();
    if (!name && match.type !== 'background' && match.type !== 'extension_url') {
      throw new Error('删除失败：缺少资源名称');
    }

    switch (match.type) {
      case 'preset': {
        const ok = await deletePreset(name as Exclude<string, 'in_use'>);
        if (!ok) throw new Error('删除预设失败');
        break;
      }
      case 'worldbook': {
        const ok = await deleteWorldbook(name);
        if (!ok) throw new Error('删除世界书失败');
        break;
      }
      case 'character': {
        const ok = await deleteCharacter(name, { delete_chats: Boolean(options?.deleteChats) });
        if (!ok) throw new Error('删除角色卡失败');
        break;
      }
      case 'regex': {
        const regexes = typeof getTavernRegexes === 'function' ? getTavernRegexes({ type: 'global' }) : [];
        const remaining = (Array.isArray(regexes) ? regexes : []).filter(r => String((r as any)?.id || '').trim() !== String(match.path || '').trim());
        await replaceTavernRegexes(remaining as any, { type: 'global' });
        break;
      }
      case 'script': {
        const trees = getScriptTrees({ type: 'global' });
        const nextTrees = trees
          .map(tree => {
            if (tree.type === 'script') return tree.name === name ? null : tree;
            return {
              ...tree,
              scripts: tree.scripts.filter(script => script.name !== name),
            };
          })
          .filter(Boolean) as ScriptTree[];
        replaceScriptTrees(nextTrees, { type: 'global' });
        break;
      }
      case 'theme': {
        const headers = getTavernRequestHeaders();
        if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
        const resp = await fetch('/api/themes/delete', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name }),
        });
        if (!resp.ok) throw new Error(`删除主题失败: HTTP ${resp.status}`);
        break;
      }
      case 'background': {
        const headers = getTavernRequestHeaders();
        if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
        const resp = await fetch('/api/backgrounds/delete', {
          method: 'POST',
          headers,
          body: JSON.stringify({ bg: String(match.path || name) }),
        });
        if (!resp.ok) throw new Error(`删除背景失败: HTTP ${resp.status}`);
        break;
      }
      case 'chat': {
        const headers = getTavernRequestHeaders();
        if (!headers) throw new Error('无法获取酒馆请求头，请刷新酒馆后重试');
        const avatar = String(match.meta?.avatar || '').trim();
        const chatName = String(match.meta?.chatName || name).trim();
        const resp = await fetch('/api/chats/delete', {
          method: 'POST',
          headers,
          body: JSON.stringify({ chatfile: `${chatName}.jsonl`, avatar_url: avatar }),
        });
        if (!resp.ok) throw new Error(`删除聊天失败: HTTP ${resp.status}`);
        break;
      }
      case 'extension_url': {
        const extId = String(match.meta?.extensionId || match.path || name).trim();
        const resp = await uninstallExtension(extId);
        if (!resp.ok) throw new Error(`卸载扩展失败: HTTP ${resp.status}`);
        break;
      }
      default:
        throw new Error('当前类型暂不支持删除酒馆资源');
    }
  }

  async function deleteTavernMatch(match: TavernResourceMatch, options?: { deleteChats?: boolean }) {
    try {
      await deleteTavernResource(match, options);
      if (match.type === 'background') await refreshBackgroundsView();
      await refreshTavernResourceIndex();
      if (isExportMode.value) await loadExportEntries();
      if (isImportMode.value) analyzeDuplicates(entries.value);
      toastr.success(`已删除酒馆内资源：${match.name}`);
    } catch (error) {
      toastr.error(error instanceof Error ? error.message : String(error));
    } finally {
      closeCharacterDeleteConfirm();
    }
  }

  function requestDeleteTavernMatch(match: TavernResourceMatch) {
    if (match.type === 'character') {
      characterDeleteConfirm.target = match;
      characterDeleteConfirm.visible = true;
      return;
    }
    void deleteTavernMatch(match);
  }

  function deleteTavernForEntry(item: ImportEntry) {
    void requestDeleteTavernMatch(createTavernMatchFromEntry(item));
  }

  function requestDeleteSourceEntries(ids: string[], title = '删除源文件确认') {
    const targets = entries.value.filter(entry => ids.includes(entry.id) && entry.canDeleteSourceFile && entry.sourceDeletePath);
    if (targets.length === 0) {
      toastr.warning('当前没有可删除的源文件');
      return;
    }
    deleteConfirmDialog.visible = true;
    deleteConfirmDialog.title = title;
    deleteConfirmDialog.itemIds = targets.map(item => item.id);
    deleteConfirmDialog.paths = targets.map(item => String(item.sourceDeletePath || item.path || '')).slice(0, 8);
  }

  function requestDeleteSourceEntry(id: string) {
    requestDeleteSourceEntries([id], '删除源文件确认');
  }

  function requestDeleteSelectedSourceFiles() {
    requestDeleteSourceEntries(Array.from(selectedIds.value), '删除选中源文件确认');
  }

  async function confirmDeleteSourceEntries() {
    const root = rootDirHandle.value;
    if (!root) {
      closeDeleteConfirmDialog();
      toastr.error('当前来源不是可写目录句柄，不能直接删除源文件');
      return;
    }

    const ids = new Set(deleteConfirmDialog.itemIds);
    closeDeleteConfirmDialog();
    const removedIds: string[] = [];
    let failed = 0;
    for (const item of entries.value) {
      if (!ids.has(item.id) || !item.sourceDeletePath) continue;
      try {
        await removeFileByPath(root, item.sourceDeletePath);
        filesMap.value.delete(String(item.sourceDeletePath || ''));
        removedIds.push(item.id);
      } catch (error) {
        failed++;
        console.warn('[资源导入器] 删除源文件失败', item.sourceDeletePath, error);
      }
    }
    if (removedIds.length > 0) removeEntriesFromList(removedIds);
    if (removedIds.length > 0) toastr.success(`已删除 ${removedIds.length} 个源文件`);
    if (failed > 0) toastr.warning(`${failed} 个源文件删除失败`);
  }

  async function importSelected() {
    const targets = entries.value.filter(e => selectedIds.value.has(e.id) && e.status === 'pending');
    if (targets.length === 0) return;
    if (requestImportPreflight(targets, '导入前提醒')) return;
    await runImportBatch(
      targets.map(item => item.id),
      '导入结果',
    );
  }

  async function importAll() {
    const targets = entries.value.filter(item => item.status === 'pending');
    if (targets.length === 0) return;
    if (requestImportPreflight(targets, '导入前提醒')) return;
    await runImportBatch(
      targets.map(item => item.id),
      '导入结果',
    );
  }

  async function importAllWithConfirm() {
    const ok = window.confirm(
      '将导入“资源导入导出”当前列表中的所有条目（不受左侧目录筛选/搜索影响）。\n\n这不是“仅导入你当前点选的某个目录”的全部文件。\n\n确认继续？',
    );
    if (!ok) return;
    await importAll();
  }

  function setTypeForSelection(nextType: string) {
    if (!nextType) return;
    const ids = selectedIds.value.size > 0 ? selectedIds.value : new Set(filteredEntries.value.map(e => e.id));
    for (const entry of entries.value) {
      if (!ids.has(entry.id)) continue;
      if (entry.type === 'extension_url') continue;
      entry.type = nextType;
      if (entry.status === 'error' && entry.errorMessage?.includes('类型')) {
        entry.status = 'pending';
        entry.errorMessage = undefined;
      }
    }
    void enrichImportEntries(entries.value.filter(entry => ids.has(entry.id)));
    updateStats();
  }

  return {
    rootPicked,
    rootDirHandle,
    flowMode,
    exportConflictStrategy,
    exportLoading,
    importLoading,
    extensionUrlLoadingIds,
    characterExportFormat,
    scriptExportFormat,
    hasRoot,
    isChooseMode,
    isImportMode,
    isExportMode,
    filesMap,
    entries,
    selectedCategory,
    searchQuery,
    sortKey,
    sortOrder,
    statusFilter,
    duplicateFilter,
    selectedPathPrefix,
    conflictStrategy,
    isProcessing,
    canDeleteSourceFiles,
    showDuplicatePanel,
    duplicatePanelSource,
    duplicatePanelSourceResolved,
    duplicatePanelOptions,
    resultDialog,
    preflightDialog,
    deleteConfirmDialog,
    characterDeleteConfirm,
    hasSource,
    stats,
    categories,
    importTreeNodes,
    duplicateGroups,
    duplicateEntryCount,
    filteredEntries,
    selectedIds,
    toggleSelect,
    selectAll,
    deselectAll,
    setCategory,
    setSort,
    setStatusFilter,
    setDuplicateFilter,
    setPathPrefix,
    clearPathPrefix,
    selectTreeFolder,
    removeEntryFromList,
    removeSelectedFromList,
    clearAll,
    pickRootDir,
    pickFolder,
    backToChoose,
    onClose,
    startImport,
    startExport,
    importSingle,
    importSelected,
    importAll,
    exportSingle,
    exportSelected,
    exportAll,
    exportAllWithConfirm,
    resetItems,
    setTypeForSelection,
    refreshEntryAnalysis,
    closeResultDialog,
    closePreflightDialog,
    closeDeleteConfirmDialog,
    closeCharacterDeleteConfirm,
    continueImportFromPreflight,
    requestDeleteSourceEntry,
    requestDeleteSelectedSourceFiles,
    confirmDeleteSourceEntries,
    requestDeleteTavernMatch,
    deleteTavernForEntry,
    deleteTavernMatch,
    updateStats,
    importAllWithConfirm,
  };
});
