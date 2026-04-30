export {};

import { createApp } from 'vue';
import { createScriptIdIframe, teleportStyle } from '@util/script';
import App from './App.vue';

type ToastLevel = 'success' | 'info' | 'warning' | 'error';
type BallStatus = 'active' | 'hidden';
type RegexRuleMode = 'extract_first' | 'extract_all' | 'replace';
type FloatingBallOutputMode = 'html' | 'text' | 'url';

type FloatingBallSettings = {
  left: number;
  top: number;
  text: string;
  icon: string;
  color: string;
  size: number;
};

type RegexRule = {
  id: string;
  name: string;
  enabled: boolean;
  mode: RegexRuleMode;
  pattern: string;
  flags: string;
  replacement: string;
};

type TavernRegexTemplate = {
  id: string;
  name: string;
  label: string;
  scope: 'global' | 'character' | 'preset';
  enabled: boolean;
  pattern: string;
  flags: string;
  replacement: string;
};

type FloatingBallContentSource =
  | {
      mode: 'custom_html';
    }
  | {
      mode: 'message_rules';
      messageTarget: string;
      outputMode: FloatingBallOutputMode;
      rules: RegexRule[];
    };

type FloatingBallItem = {
  id: string;
  name: string;
  status: BallStatus;
  webCode: string;
  floatingBall: FloatingBallSettings;
  contentSource: FloatingBallContentSource;
};

type ScriptData = {
  activeId: string;
  order: string[];
  items: Record<string, FloatingBallItem>;
};

type ViewportSize = {
  width: number;
  height: number;
};

type Point = {
  left: number;
  top: number;
};

type OverlayHandle = {
  overlay: HTMLDivElement;
  panel: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement | null;
  close: () => void;
};

type PreviewTabItem =
  | {
      key: string;
      label: string;
      kind: 'html' | 'text' | 'url';
      content: string;
    }
  | {
      key: string;
      label: string;
      kind: 'error';
      content: string;
    };

type PreviewSizeMessage = {
  __th_ufb: 'size';
  scriptId: string;
  width?: number;
  height?: number;
  vw?: number;
  vh?: number;
};

type DragState = {
  ballId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type MessageRulesSuccessResult = {
  ok: true;
  messageTarget: string;
  messageId: number;
  rawMessage: string;
  segments: string[];
  warnings: string[];
};

type MessageRulesFailureResult = {
  ok: false;
  messageTarget: string;
  error: string;
};

type MessageRulesResult = MessageRulesSuccessResult | MessageRulesFailureResult;

declare global {
  interface Window {
    __th_ufb_bridge__?: {
      Mvu?: unknown;
    };
    Mvu?: unknown;
  }
}

const SCRIPT_NAME = '通用悬浮球';
// Script button name must match the event key used by Tavern Helper (`getButtonEvent(name)`).
// Using the script name keeps "delete button + re-enable script" behavior predictable in the script library UI.
const MANAGER_BUTTON_NAME = SCRIPT_NAME;
const SCRIPT_ID = getScriptId();
const SCRIPT_VARIABLE_SCOPE = { type: 'script', script_id: SCRIPT_ID } as const;
const ROOT_CLASS = 'th-ufb-root';
const BALL_CLASS = 'th-ufb-ball';
const OVERLAY_CLASS = 'th-ufb-overlay';
const PANEL_CLASS = 'th-ufb-panel';
const PANEL_HEADER_CLASS = 'th-ufb-panel__header';
const PANEL_BODY_CLASS = 'th-ufb-panel__body';
const PANEL_FOOTER_CLASS = 'th-ufb-panel__footer';
const BUTTON_CLASS = 'th-ufb-btn';
const PRIMARY_BUTTON_CLASS = 'th-ufb-btn--primary';
const GHOST_BUTTON_CLASS = 'th-ufb-btn--ghost';
const PREVIEW_PANEL_CLASS = 'th-ufb-panel--preview';
const SIZE_MESSAGE_FLAG = 'size';
const BALL_MIN_SIZE = 28;
const BALL_MAX_SIZE = 120;
const BALL_DEFAULT_SIZE = 44;
const BALL_DEFAULT_COLOR = '#7c5cff';
const BALL_DEFAULT_TEXT = '网页';
const DEFAULT_MESSAGE_TARGET = '-1';
const BALL_PADDING = 10;
const BALL_DEFAULT_MARGIN = 14;
const BALL_STACK_GAP = 12;
const DRAG_THRESHOLD = 6;
const PREVIEW_MIN_WIDTH = 280;
const PREVIEW_MAX_WIDTH = 980;
const PREVIEW_MIN_HEIGHT = 160;
const DEFAULT_ICON_PRESETS = ['🌐', '🖥️', '📁', '🛒', '🗺️', '📜', '⚙️', '⭐', '💬', '🔔', '📌', '❤️'];
const DEFAULT_COLOR_PRESETS = ['#7c5cff', '#4d7dff', '#34d399', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6', '#10b981', '#f97316', '#64748b', '#111827'];

const DEFAULT_FLOATING_BALL: FloatingBallSettings = {
  left: -1,
  top: -1,
  text: BALL_DEFAULT_TEXT,
  icon: '',
  color: BALL_DEFAULT_COLOR,
  size: BALL_DEFAULT_SIZE,
};

const DEFAULT_REGEX_RULE: RegexRule = {
  id: '',
  name: '新规则',
  enabled: true,
  mode: 'extract_first',
  pattern: '',
  flags: '',
  replacement: '',
};

const DEFAULT_CONTENT_SOURCE: FloatingBallContentSource = {
  mode: 'custom_html',
};

const FloatingBallSchema = z.object({
  left: z.number().default(DEFAULT_FLOATING_BALL.left),
  top: z.number().default(DEFAULT_FLOATING_BALL.top),
  text: z.string().default(DEFAULT_FLOATING_BALL.text),
  icon: z.string().default(DEFAULT_FLOATING_BALL.icon),
  color: z.string().default(DEFAULT_FLOATING_BALL.color),
  size: z.number().int().default(DEFAULT_FLOATING_BALL.size),
});

const RegexRuleSchema = z
  .object({
    id: z.string().default(''),
    name: z.string().default(DEFAULT_REGEX_RULE.name),
    enabled: z.boolean().default(DEFAULT_REGEX_RULE.enabled),
    mode: z.enum(['extract_first', 'extract_all', 'replace']).default(DEFAULT_REGEX_RULE.mode),
    pattern: z.string().default(DEFAULT_REGEX_RULE.pattern),
    flags: z.string().default(DEFAULT_REGEX_RULE.flags),
    replacement: z.string().default(DEFAULT_REGEX_RULE.replacement),
  })
  .prefault({});

const LegacyScriptDataSchema = z
  .object({
    webCode: z.string().default(''),
    floatingBall: FloatingBallSchema.default(DEFAULT_FLOATING_BALL),
  })
  .prefault({});

const ScriptDataSchema = z
  .object({
    activeId: z.string().default(''),
    order: z.array(z.string()).default([]),
    items: z.record(z.string(), z.any()).default({}),
  })
  .prefault({});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneData<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value);
}

function createBallId(): string {
  return `ball-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createRegexRule(partial?: Partial<RegexRule>): RegexRule {
  const parsed = RegexRuleSchema.parse(partial ?? {});
  return {
    id: String(parsed.id ?? '').trim() || createRuleId(),
    name: String(parsed.name ?? DEFAULT_REGEX_RULE.name),
    enabled: Boolean(parsed.enabled),
    mode: parsed.mode,
    pattern: String(parsed.pattern ?? ''),
    flags: String(parsed.flags ?? ''),
    replacement: String(parsed.replacement ?? ''),
  };
}

function normalizeRegexRule(value: unknown): RegexRule {
  return createRegexRule(_.isPlainObject(value) ? (value as Partial<RegexRule>) : {});
}

function parseStoredRegexPattern(value: string): Pick<TavernRegexTemplate, 'pattern' | 'flags'> {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^\/([\s\S]*)\/([a-z]*)$/);
  if (!match) {
    return {
      pattern: raw,
      flags: '',
    };
  }
  return {
    pattern: match[1] ?? '',
    flags: match[2] ?? '',
  };
}

function getTavernRegexScopeLabel(scope: TavernRegexTemplate['scope']): string {
  if (scope === 'character') {
    return '局部';
  }
  if (scope === 'preset') {
    return '预设';
  }
  return '全局';
}

function listTavernRegexTemplates(): TavernRegexTemplate[] {
  const templates: TavernRegexTemplate[] = [];
  const appendTemplates = (scope: TavernRegexTemplate['scope'], option: TavernRegexOption) => {
    try {
      const regexes = typeof getTavernRegexes === 'function' ? getTavernRegexes(option) : [];
      for (const [index, regex] of (Array.isArray(regexes) ? regexes : []).entries()) {
        const name = String(regex?.script_name || '').trim() || `正则 ${index + 1}`;
        const id = String(regex?.id || '').trim() || `${scope}-${index}`;
        const parsed = parseStoredRegexPattern(String(regex?.find_regex ?? ''));
        const scopeLabel = getTavernRegexScopeLabel(scope);
        templates.push({
          id: `${scope}:${id}`,
          name: `[${scopeLabel}] ${name}`,
          label: `${scopeLabel} · ${name}${regex?.enabled === false ? ' · 已停用' : ''}`,
          scope,
          enabled: regex?.enabled !== false,
          pattern: parsed.pattern,
          flags: parsed.flags,
          replacement: String(regex?.replace_string ?? ''),
        });
      }
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] list tavern regexes failed (${scope})`, error);
    }
  };

  appendTemplates('global', { type: 'global' });
  appendTemplates('character', { type: 'character', name: 'current' });
  appendTemplates('preset', { type: 'preset', name: 'in_use' });
  return templates;
}

function createRuleFromTavernRegex(templateId: string): RegexRule | null {
  const template = listTavernRegexTemplates().find(item => item.id === templateId);
  if (!template) {
    return null;
  }
  return createRegexRule({
    name: template.name,
    mode: 'replace',
    pattern: template.pattern,
    flags: template.flags,
    replacement: template.replacement,
  });
}

function createDefaultMessageRulesSource(): Extract<FloatingBallContentSource, { mode: 'message_rules' }> {
  return {
    mode: 'message_rules',
    messageTarget: DEFAULT_MESSAGE_TARGET,
    outputMode: 'html',
    rules: [],
  };
}

function normalizeContentSource(value: unknown): FloatingBallContentSource {
  const raw = (_.isPlainObject(value) ? value : {}) as Record<string, unknown>;
  if (raw.mode !== 'message_rules') {
    return cloneData(DEFAULT_CONTENT_SOURCE);
  }

  const rules = Array.isArray(raw.rules) ? raw.rules.map((rule: unknown) => normalizeRegexRule(rule)) : [];
  const outputMode: FloatingBallOutputMode =
    raw.outputMode === 'text' || raw.outputMode === 'url' || raw.outputMode === 'html' ? raw.outputMode : 'html';

  return {
    mode: 'message_rules',
    messageTarget: String(raw.messageTarget ?? DEFAULT_MESSAGE_TARGET),
    outputMode,
    rules,
  };
}

function getStatusLabel(status: BallStatus): string {
  if (status === 'active') {
    return '启用';
  }
  return '停用';
}

function getOutputModeLabel(outputMode: FloatingBallOutputMode): string {
  if (outputMode === 'text') {
    return '文本';
  }
  if (outputMode === 'url') {
    return 'URL';
  }
  return 'HTML';
}

function getRuleModeLabel(mode: RegexRuleMode): string {
  if (mode === 'extract_all') {
    return '提取全部';
  }
  if (mode === 'replace') {
    return '替换';
  }
  return '提取首个';
}

function getItemContentSummary(item: FloatingBallItem): string {
  if (item.contentSource.mode === 'message_rules') {
    const enabledRules = item.contentSource.rules.filter(rule => rule.enabled).length;
    return `消息规则 · ${item.contentSource.messageTarget || DEFAULT_MESSAGE_TARGET} · ${getOutputModeLabel(item.contentSource.outputMode)} · ${enabledRules}/${item.contentSource.rules.length} 条启用`;
  }
  return item.webCode.trim() ? '自定义网页 · 已配置网页' : '自定义网页 · 未配置网页';
}

function truncatePreviewText(value: string, limit = 160): string {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

function isValidMessageTarget(value: string): boolean {
  return /^-?\d+$/.test(String(value ?? '').trim());
}

function buildRegex(rule: RegexRule, forceGlobal = false): RegExp {
  const rawFlags = String(rule.flags ?? '');
  const flags = forceGlobal && !rawFlags.includes('g') ? `${rawFlags}g` : rawFlags;
  return new RegExp(rule.pattern, flags);
}

function applyExtractReplacement(match: RegExpExecArray, source: string, replacement: string): string {
  if (!replacement) {
    return match[0] ?? '';
  }

  const groups = match.groups ?? {};
  return replacement.replace(/\$(\$|&|`|'|[0-9]{1,2}|<[^>]+>)/g, (_, token: string) => {
    if (token === '$') {
      return '$';
    }
    if (token === '&') {
      return match[0] ?? '';
    }
    if (token === '`') {
      return source.slice(0, match.index ?? 0);
    }
    if (token === "'") {
      return source.slice((match.index ?? 0) + (match[0]?.length ?? 0));
    }
    if (/^\d{1,2}$/.test(token)) {
      const groupValue = match[Number(token)];
      return groupValue ?? '';
    }
    if (token.startsWith('<') && token.endsWith('>')) {
      return groups[token.slice(1, -1)] ?? '';
    }
    return `$${token}`;
  });
}

function executeMessageRules(contentSource: Extract<FloatingBallContentSource, { mode: 'message_rules' }>): MessageRulesResult {
  const messageTarget = String(contentSource.messageTarget ?? '').trim();
  if (!messageTarget) {
    return { ok: false, messageTarget, error: '请填写目标楼层。' };
  }
  if (!isValidMessageTarget(messageTarget)) {
    return { ok: false, messageTarget, error: `目标楼层格式无效：${messageTarget}` };
  }

  let message: ChatMessage | undefined;
  try {
    message = getChatMessages(messageTarget)[0];
  } catch (error) {
    return {
      ok: false,
      messageTarget,
      error: `读取目标楼层失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!message) {
    return { ok: false, messageTarget, error: `未找到目标楼层 ${messageTarget}。` };
  }

  const rawMessage = String(message.message ?? '');
  let segments = [rawMessage];
  const warnings: string[] = [];
  const enabledRules = contentSource.rules.filter(rule => rule.enabled);
  if (!rawMessage) {
    warnings.push('目标楼层原始消息为空。');
  }

  if (contentSource.outputMode === 'html' && enabledRules.length === 0) {
    try {
      const renderedHtml = retrieveDisplayedMessage(message.message_id).html()?.trim() ?? '';
      const fallbackHtml = formatAsDisplayedMessage(rawMessage, { message_id: message.message_id }).trim();
      const html = renderedHtml || fallbackHtml;
      if (html) {
        segments = [html];
      } else if (!rawMessage) {
        segments = [];
      }
    } catch (error) {
      warnings.push(`读取楼层显示内容失败，已回退到原始消息：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const rule of enabledRules) {
    try {
      if (rule.mode === 'replace') {
        const regex = buildRegex(rule);
        segments = segments.map(segment => segment.replace(regex, rule.replacement));
        continue;
      }

      if (segments.length === 0) {
        continue;
      }

      if (rule.mode === 'extract_first') {
        const regex = buildRegex(rule);
        const nextSegments: string[] = [];
        for (const segment of segments) {
          regex.lastIndex = 0;
          const match = regex.exec(segment);
          if (!match) {
            continue;
          }
          nextSegments.push(applyExtractReplacement(match, segment, rule.replacement));
        }
        segments = nextSegments;
        continue;
      }

      const regex = buildRegex(rule, true);
      const nextSegments: string[] = [];
      for (const segment of segments) {
        regex.lastIndex = 0;
        let match = regex.exec(segment);
        while (match) {
          nextSegments.push(applyExtractReplacement(match, segment, rule.replacement));
          if (match[0] === '') {
            regex.lastIndex += 1;
          }
          match = regex.exec(segment);
        }
      }
      segments = nextSegments;
    } catch (error) {
      return {
        ok: false,
        messageTarget,
        error: `规则“${rule.name.trim() || '未命名规则'}”执行失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    ok: true,
    messageTarget,
    messageId: message.message_id,
    rawMessage,
    segments,
    warnings,
  };
}

function parsePreviewUrl(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { ok: false, error: 'URL 结果为空。' };
  }
  if (raw.startsWith('data:')) {
    return { ok: true, value: raw };
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { ok: true, value: parsed.toString() };
    }
    return { ok: false, error: `URL 协议不受支持：${parsed.protocol}` };
  } catch {
    return { ok: false, error: `URL 无效：${truncatePreviewText(raw, 60)}` };
  }
}

function buildPreviewTabItems(outputMode: FloatingBallOutputMode, segments: string[]): PreviewTabItem[] {
  if (outputMode === 'url') {
    return segments.map((segment, index) => {
      const parsed = parsePreviewUrl(segment);
      return parsed.ok
        ? { key: `url-${index}`, label: `URL ${index + 1}`, kind: 'url', content: parsed.value }
        : { key: `url-${index}`, label: `URL ${index + 1}`, kind: 'error', content: parsed.error };
    });
  }

  return segments.map((segment, index) => {
    const shouldRenderAsText = outputMode === 'text' || (outputMode === 'html' && !looksLikeHtmlMarkup(segment));
    return {
      key: `${outputMode}-${index}`,
      label: `${shouldRenderAsText ? '文本' : '片段'} ${index + 1}`,
      kind: shouldRenderAsText ? 'text' : outputMode,
      content: segment,
    };
  });
}

function getOrderedItems(data: ScriptData): FloatingBallItem[] {
  return data.order.map(id => data.items[id]).filter((item): item is FloatingBallItem => Boolean(item));
}

function getVisibleItems(data: ScriptData): FloatingBallItem[] {
  return getOrderedItems(data).filter(item => item.status === 'active');
}

function getNextBallName(data: ScriptData): string {
  const names = new Set(getOrderedItems(data).map(item => item.name.trim()).filter(Boolean));
  let index = 1;
  while (names.has(`悬浮球 ${index}`)) {
    index += 1;
  }
  return `悬浮球 ${index}`;
}

function normalizeFloatingBall(value: unknown): FloatingBallSettings {
  const parsed = FloatingBallSchema.parse(value);
  const text = String(parsed.text ?? '').trim();
  const icon = String(parsed.icon ?? '').trim();
  const color = String(parsed.color ?? '').trim();

  return {
    left: Number.isFinite(parsed.left) ? parsed.left : DEFAULT_FLOATING_BALL.left,
    top: Number.isFinite(parsed.top) ? parsed.top : DEFAULT_FLOATING_BALL.top,
    text,
    icon,
    color: isHexColor(color) ? color : BALL_DEFAULT_COLOR,
    size: Number.isInteger(parsed.size) && parsed.size >= BALL_MIN_SIZE && parsed.size <= BALL_MAX_SIZE ? parsed.size : BALL_DEFAULT_SIZE,
  };
}

function createBallItem(partial?: Partial<FloatingBallItem> & { id?: string; name?: string }): FloatingBallItem {
  const id = String(partial?.id ?? createBallId()).trim() || createBallId();
  const name = String(partial?.name ?? BALL_DEFAULT_TEXT).trim() || BALL_DEFAULT_TEXT;
  const status = partial?.status === 'hidden' ? partial.status : 'active';

  return {
    id,
    name,
    status,
    webCode: String(partial?.webCode ?? ''),
    floatingBall: normalizeFloatingBall(partial?.floatingBall ?? DEFAULT_FLOATING_BALL),
    contentSource: normalizeContentSource(partial?.contentSource),
  };
}

function normalizeBallItem(value: unknown, fallbackId: string, fallbackName: string): FloatingBallItem {
  const raw = (_.isPlainObject(value) ? value : {}) as Record<string, unknown>;
  return createBallItem({
    id: String(raw.id ?? fallbackId).trim() || fallbackId,
    name: String(raw.name ?? fallbackName).trim() || fallbackName,
    status: raw.status === 'hidden' || raw.status === 'archived' ? 'hidden' : 'active',
    webCode: String(raw.webCode ?? ''),
    floatingBall: raw.floatingBall as FloatingBallSettings | undefined,
    contentSource: raw.contentSource as FloatingBallContentSource | undefined,
  });
}

function normalizeScriptData(value: unknown): ScriptData {
  const isLegacyShape =
    _.isPlainObject(value) &&
    !_.has(value, 'items') &&
    (_.has(value, 'webCode') || _.has(value, 'floatingBall'));

  if (isLegacyShape) {
    const legacy = LegacyScriptDataSchema.parse(value);
    const item = createBallItem({
      id: 'default',
      name: BALL_DEFAULT_TEXT,
      status: 'active',
      webCode: legacy.webCode,
      floatingBall: legacy.floatingBall,
    });
    return {
      activeId: item.id,
      order: [item.id],
      items: { [item.id]: item },
    };
  }

  const parsed = ScriptDataSchema.parse(value);
  const itemIds = new Set<string>();
  const items: Record<string, FloatingBallItem> = {};
  const order: string[] = [];

  for (const key of parsed.order) {
    const normalizedId = String(key ?? '').trim();
    if (!normalizedId || itemIds.has(normalizedId) || !_.has(parsed.items, normalizedId)) {
      continue;
    }
    const item = normalizeBallItem(parsed.items[normalizedId], normalizedId, normalizedId);
    itemIds.add(item.id);
    items[item.id] = item;
    order.push(item.id);
  }

  for (const [rawId, rawValue] of Object.entries(parsed.items)) {
    const normalizedId = String(rawId ?? '').trim();
    if (!normalizedId || itemIds.has(normalizedId)) {
      continue;
    }
    const item = normalizeBallItem(rawValue, normalizedId, normalizedId);
    itemIds.add(item.id);
    items[item.id] = item;
    order.push(item.id);
  }

  if (order.length === 0) {
    const item = createBallItem({
      id: 'default',
      name: BALL_DEFAULT_TEXT,
      status: 'active',
    });
    items[item.id] = item;
    order.push(item.id);
  }

  const activeId = order.includes(parsed.activeId) ? parsed.activeId : order[0];
  return { activeId, order, items };
}

function readScriptData(): ScriptData {
  return normalizeScriptData(getVariables(SCRIPT_VARIABLE_SCOPE));
}

function persistScriptData(data: ScriptData): ScriptData {
  const normalized = normalizeScriptData(data);
  replaceVariables(cloneData(normalized), SCRIPT_VARIABLE_SCOPE);
  return normalized;
}

function updateScriptData(updater: (draft: ScriptData) => ScriptData | void): ScriptData {
  const draft = cloneData(readScriptData());
  const updated = updater(draft) ?? draft;
  return persistScriptData(updated);
}

function showToast(level: ToastLevel, message: string): void {
  try {
    toastr[level](message);
  } catch {
    console.info(`[${SCRIPT_NAME}] ${message}`);
  }
}

function withErrorToast<TArgs extends unknown[]>(handler: (...args: TArgs) => void): (...args: TArgs) => void {
  return (...args: TArgs) => {
    try {
      handler(...args);
    } catch (error) {
      console.error(`[${SCRIPT_NAME}] handler error`, error);
      showToast('error', `${SCRIPT_NAME}发生错误：${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

function syncManagerButton(): boolean {
  try {
    if (typeof appendInexistentScriptButtons === 'function') {
      appendInexistentScriptButtons([{ name: MANAGER_BUTTON_NAME, visible: true }]);
      return true;
    }
  } catch (error) {
    console.warn(`[${SCRIPT_NAME}] appendInexistentScriptButtons failed`, error);
  }

  return false;
}

function parseColorToRgba(value: string): { r: number; g: number; b: number; a: number } | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const rgbaMatch = normalized.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgbaMatch) {
    const [r, g, b, a = '1'] = rgbaMatch.slice(1);
    const values = [Number(r), Number(g), Number(b), Number(a)];
    if (values.some(item => !Number.isFinite(item))) {
      return null;
    }
    return {
      r: clamp(values[0], 0, 255),
      g: clamp(values[1], 0, 255),
      b: clamp(values[2], 0, 255),
      a: clamp(values[3], 0, 1),
    };
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) {
    return null;
  }

  const rawHex = hexMatch[1];
  const hex = rawHex.length === 3 ? rawHex.split('').map(char => `${char}${char}`).join('') : rawHex;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: 1,
  };
}

function getRelativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function resolveDocumentBackground(documentNode: Document): { r: number; g: number; b: number } {
  const candidates = [documentNode.body, documentNode.documentElement];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const color = parseColorToRgba(getComputedStyle(candidate).backgroundColor);
    if (color && color.a > 0.02) {
      return { r: color.r, g: color.g, b: color.b };
    }
  }

  return { r: 18, g: 20, b: 30 };
}

function applyModalColorScheme(panel: HTMLElement, documentNode: Document): void {
  if (getRelativeLuminance(resolveDocumentBackground(documentNode)) > 0.65) {
    panel.style.setProperty('--th-ufb-input-bg', '#ffffff');
    panel.style.setProperty('--th-ufb-input-fg', '#0f172a');
    panel.style.setProperty('--th-ufb-input-ph', 'rgba(15,23,42,0.45)');
    panel.style.setProperty('--th-ufb-color-scheme', 'light');
    return;
  }

  panel.style.setProperty('--th-ufb-input-bg', '#0b0f19');
  panel.style.setProperty('--th-ufb-input-fg', '#ffffff');
  panel.style.setProperty('--th-ufb-input-ph', 'rgba(255,255,255,0.55)');
  panel.style.setProperty('--th-ufb-color-scheme', 'dark');
}

function getViewportSize(targetWindow: Window): ViewportSize {
  return {
    width: Math.max(0, Math.floor(targetWindow.innerWidth || 0)),
    height: Math.max(0, Math.floor(targetWindow.innerHeight || 0)),
  };
}

function looksLikeHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(value) || /<!doctype|<!--/i.test(value);
}

function getDefaultBallPosition(targetWindow: Window, size: number, visibleIndex = 0): Point {
  const { width, height } = getViewportSize(targetWindow);
  const offset = visibleIndex * (size + BALL_STACK_GAP);
  return {
    left: Math.max(BALL_DEFAULT_MARGIN, width - size - BALL_DEFAULT_MARGIN),
    top: Math.max(BALL_DEFAULT_MARGIN, height - size - BALL_DEFAULT_MARGIN - offset),
  };
}

function constrainBallPosition(targetWindow: Window, left: number, top: number, size: number): Point {
  const { width, height } = getViewportSize(targetWindow);
  return {
    left: clamp(left, BALL_PADDING, Math.max(BALL_PADDING, width - size - BALL_PADDING)),
    top: clamp(top, BALL_PADDING, Math.max(BALL_PADDING, height - size - BALL_PADDING)),
  };
}

function buildPreviewBridgeScript(scriptId: string): string {
  return `
<script>
  (function () {
    try {
      const parentWin = window.parent;
      if (!parentWin) return;

      window.parentWin = parentWin;
      window.parentDoc = parentWin.document;

      if (parentWin.$ && !window.$) window.$ = parentWin.$;
      if (parentWin._ && !window._) window._ = parentWin._;
      if (parentWin.toastr && !window.toastr) window.toastr = parentWin.toastr;

      const thBridge = parentWin.__th_ufb_bridge__ || null;
      const mvu = thBridge && thBridge.Mvu ? thBridge.Mvu : parentWin.Mvu;
      if (mvu && !window.Mvu) window.Mvu = mvu;

      if (!window.getLatestMvuData) {
        window.getLatestMvuData = function () {
          try {
            return window.Mvu ? window.Mvu.getMvuData({ type: 'message', message_id: 'latest' }) : null;
          } catch (error) {
            console.warn('[${SCRIPT_NAME}] getLatestMvuData failed', error);
            return null;
          }
        };
      }

      if (!window.getLatestMvuStatData) {
        window.getLatestMvuStatData = function () {
          const data = window.getLatestMvuData ? window.getLatestMvuData() : null;
          return data && data.stat_data ? data.stat_data : {};
        };
      }

      if (!window.MVU) {
        window.MVU = {
          data: function () {
            return window.getLatestMvuData ? window.getLatestMvuData() : null;
          },
          stat: function () {
            return window.getLatestMvuStatData ? window.getLatestMvuStatData() : {};
          },
        };
      }

      if (!window.__th_ufb_reportSize) {
        window.__th_ufb_reportSize = function () {
          try {
            const doc = document;
            const de = doc.documentElement;
            const body = doc.body;
            const scrollWidth = Math.max(
              de ? de.scrollWidth : 0,
              body ? body.scrollWidth : 0,
              de ? de.offsetWidth : 0,
              body ? body.offsetWidth : 0,
              de ? de.clientWidth : 0
            );
            const scrollHeight = Math.max(
              de ? de.scrollHeight : 0,
              body ? body.scrollHeight : 0,
              de ? de.offsetHeight : 0,
              body ? body.offsetHeight : 0,
              de ? de.clientHeight : 0
            );

            parentWin.postMessage(
              {
                __th_ufb: '${SIZE_MESSAGE_FLAG}',
                scriptId: ${JSON.stringify(scriptId)},
                width: scrollWidth,
                height: scrollHeight,
                vw: de ? de.clientWidth : 0,
                vh: de ? de.clientHeight : 0
              },
              '*'
            );
          } catch {}
        };

        const schedule = function () {
          try {
            window.__th_ufb_reportSize();
          } catch {}
          try {
            parentWin.requestAnimationFrame(function () {
              try {
                window.__th_ufb_reportSize();
              } catch {}
            });
          } catch {}
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', schedule, { once: true });
        } else {
          schedule();
        }

        try {
          const observer = new MutationObserver(schedule);
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
          });
        } catch {}

        try {
          window.addEventListener('resize', schedule);
          window.addEventListener('load', schedule, { once: true });
          setTimeout(schedule, 50);
          setTimeout(schedule, 200);
          setTimeout(schedule, 600);
          setTimeout(schedule, 1200);
        } catch {}
      }

      const tavernHelper = parentWin.TavernHelper;
      if (tavernHelper && typeof tavernHelper === 'object') {
        window.TavernHelper = tavernHelper;
        for (const key of Object.keys(tavernHelper)) {
          if (!(key in window) && typeof tavernHelper[key] === 'function') {
            window[key] = tavernHelper[key].bind(tavernHelper);
          }
        }
      }

      if (!window.ST) {
        window.ST = {
          win: parentWin,
          doc: parentWin.document,
          $: parentWin.$,
          _: parentWin._,
          toastr: parentWin.toastr,
          qs: function (selector, root) {
            return (root || parentWin.document).querySelector(selector);
          },
          qsa: function (selector, root) {
            return Array.from((root || parentWin.document).querySelectorAll(selector));
          },
          create: function (tag) {
            return parentWin.document.createElement(tag);
          }
        };
      }
    } catch (error) {
      console.warn('[${SCRIPT_NAME}] bridge init failed', error);
    }
  })();
</script>`.trim();
}

function injectPreviewBridge(html: string): string {
  const code = String(html ?? '').trim();
  if (!code) {
    return '';
  }

  const bridgeBaseStyle = '<style>html,body{margin:0;min-height:100%;background:transparent !important;}</style>';
  const bridgeScript = buildPreviewBridgeScript(SCRIPT_ID);

  const hasHtmlTag = /<\s*html[\s>]/i.test(code);
  const hasHeadOpenTag = /<\s*head[\s>]/i.test(code);
  const hasHeadCloseTag = /<\s*\/\s*head\s*>/i.test(code);

  if (hasHtmlTag && hasHeadOpenTag && hasHeadCloseTag) {
    return code.replace(/<\s*head[\s>][\s\S]*?>/i, match => `${match}\n${bridgeBaseStyle}\n${bridgeScript}\n`);
  }

  if (hasHtmlTag) {
    return code.replace(
      /<\s*html[\s>][\s\S]*?>/i,
      match => `${match}\n<head>\n${bridgeBaseStyle}\n${bridgeScript}\n</head>\n`,
    );
  }

  return [
    '<!doctype html>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <base target="_blank" />',
    '    <title>预览</title>',
    `    ${bridgeBaseStyle}`,
    `    ${bridgeScript}`,
    '  </head>',
    '  <body>',
    code,
    '  </body>',
    '</html>',
  ].join('\n');
}

function injectRulePreviewBridge(html: string): string {
  const code = String(html ?? '').trim();
  if (!code) {
    return '';
  }

  const looksLikeFullDoc = /<!doctype/i.test(code) || /<\s*html[\s>]/i.test(code) || /<\s*head[\s>]/i.test(code);
  if (looksLikeFullDoc) {
    return injectPreviewBridge(code);
  }

  const fragmentStyle = `
<style>
  .th-ufb-rule-fragment{
    white-space:pre-wrap;
    word-break:break-word;
  }
</style>
`.trim();

  const wrapped = `<div class="th-ufb-rule-fragment">${code}</div>`;

  return injectPreviewBridge(
    ['<!doctype html>', '<html>', '  <head>', '    <meta charset="utf-8" />', `    ${fragmentStyle}`, '  </head>', '  <body>', wrapped, '  </body>', '</html>'].join(
      '\n',
    ),
  );
}

class UniversalFloatingBallApp {
  private readonly hostWindow = window.parent ?? window;
  private readonly hostDocument = this.hostWindow.document ?? document;
  private readonly ballElements = new Map<string, HTMLButtonElement>();
  private root: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private currentModal: OverlayHandle | null = null;
  private cleanupBridgeTimer: (() => void) | null = null;
  private dragState: DragState | null = null;
  private suppressedClickBallId: string | null = null;
  private isPreviewManuallyResized = false;
  private managerApp: ReturnType<typeof createApp> | null = null;
  private managerIframe: JQuery<HTMLIFrameElement> | null = null;
  private managerStyleDestroy: (() => void) | null = null;
  private managerPanicClose: JQuery<HTMLButtonElement> | null = null;
  private managerButtonSyncTimeouts: number[] = [];

  async init(): Promise<void> {
    this.bindGlobalEvents();
    this.startManagerButtonSync();
    this.mountRoot();
    this.mountStyle();
    this.renderBalls();
    showToast('success', `${SCRIPT_NAME}脚本已加载`);
    void this.initializeMvuBridge().catch(error => {
      console.warn(`[${SCRIPT_NAME}] initializeMvuBridge failed`, error);
    });
  }

  destroy(): void {
    this.closeCurrentModal();
    this.closeManagerApp();
    this.cleanupBridgeTimer?.();
    this.cleanupBridgeTimer = null;
    this.stopManagerButtonSync();
    this.hostWindow.removeEventListener('resize', this.handleWindowResize);
    this.hostWindow.removeEventListener('pointermove', this.handleBallPointerMove);
    this.hostWindow.removeEventListener('pointerup', this.handleBallPointerUp);
    this.hostWindow.removeEventListener('pointercancel', this.handleBallPointerUp);

    for (const button of this.ballElements.values()) {
      button.remove();
    }
    this.ballElements.clear();
    this.styleElement?.remove();
    this.styleElement = null;
    this.root?.remove();
    this.root = null;
  }

  private async initializeMvuBridge(): Promise<void> {
    const bridgeWindow = this.hostWindow;
    bridgeWindow.__th_ufb_bridge__ ??= {};

    const syncBridge = () => {
      if (window.Mvu) {
        bridgeWindow.__th_ufb_bridge__!.Mvu = window.Mvu;
        return true;
      }
      return false;
    };

    try {
      await Promise.race([
        waitGlobalInitialized('Mvu'),
        new Promise(resolve => {
          this.hostWindow.setTimeout(resolve, 2500);
        }),
      ]);
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] waitGlobalInitialized('Mvu') failed`, error);
    }

    if (syncBridge()) {
      return;
    }

    let attempts = 0;
    const timer = this.hostWindow.setInterval(() => {
      attempts += 1;
      if (syncBridge() || attempts >= 40) {
        this.hostWindow.clearInterval(timer);
      }
    }, 250);
    this.cleanupBridgeTimer = () => this.hostWindow.clearInterval(timer);
  }

  private mountRoot(): void {
    const body = this.hostDocument.body;
    if (!body) {
      throw new Error('未找到页面 body。');
    }

    this.root = this.hostDocument.createElement('div');
    this.root.className = ROOT_CLASS;
    this.root.setAttribute('script_id', SCRIPT_ID);
    body.append(this.root);
  }

  private mountStyle(): void {
    const head = this.hostDocument.head ?? this.hostDocument.getElementsByTagName('head')[0];
    if (!head) {
      throw new Error('未找到页面 head。');
    }

    this.styleElement = this.hostDocument.createElement('style');
    this.styleElement.setAttribute('script_id', SCRIPT_ID);
    this.styleElement.textContent = `
.${ROOT_CLASS}{position:fixed;left:0;top:0;z-index:2147482000;pointer-events:none}
.${BALL_CLASS}{
  position:fixed;
  width:var(--th-ufb-size);
  height:var(--th-ufb-size);
  border:none;
  border-radius:999px;
  cursor:pointer;
  pointer-events:auto;
  touch-action:none;
  -webkit-user-select:none;
  user-select:none;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:2px;
  flex-direction:column;
  color:#fff;
  font-weight:800;
  letter-spacing:0.06em;
  box-shadow:0 14px 30px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3);
  background:
    radial-gradient(circle at 28% 24%, rgba(255,255,255,0.95), rgba(255,255,255,0) 36%),
    linear-gradient(145deg, var(--th-ufb-c1) 0%, var(--th-ufb-c2) 45%, var(--th-ufb-c3) 100%);
}
.${BALL_CLASS}:active{transform:scale(0.96)}
.${BALL_CLASS} .th-ufb-ball__shine{
  position:absolute;
  inset:calc(var(--th-ufb-size) * 0.11);
  border:0.5px solid rgba(255,255,255,0.34);
  border-radius:inherit;
  opacity:0.95;
}
.${BALL_CLASS} .th-ufb-ball__icon{
  position:relative;
  font-size:calc(var(--th-ufb-size) * 0.42);
  line-height:1;
  text-shadow:0 2px 10px rgba(0,0,0,0.22);
}
.${BALL_CLASS} .th-ufb-ball__label{
  position:relative;
  font-size:calc(var(--th-ufb-size) * 0.32);
  text-shadow:0 2px 10px rgba(0,0,0,0.22);
}

.${OVERLAY_CLASS}{
  position:fixed;
  inset:0;
  z-index:2147482500;
  pointer-events:auto;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:18px;
  padding-top:calc(env(safe-area-inset-top, 0px) + 18px);
  padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 18px);
  box-sizing:border-box;
  background:rgba(15,18,29,0.46);
}
.${PANEL_CLASS}{
  width:min(960px, calc(100vw - 28px));
  height:min(760px, calc(100svh - 28px), calc(100dvh - 28px));
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border-radius:20px;
  border:0.5px solid rgba(255,255,255,0.14);
  background:rgba(18,20,30,0.88);
  backdrop-filter:blur(10px);
  color:#fff;
  box-shadow:0 30px 80px rgba(0,0,0,0.32);
}
.${PREVIEW_PANEL_CLASS}{
  width:min(96vw, 980px);
  height:auto;
  max-height:min(calc(100svh - 72px), calc(100dvh - 72px));
  position:relative;
  border:none;
  background:transparent;
  backdrop-filter:none;
  box-shadow:none;
}
.${PANEL_HEADER_CLASS}{
  flex:0 0 auto;
  padding:12px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  box-sizing:border-box;
}
.${PANEL_HEADER_CLASS} .th-ufb-title{
  font-size:15px;
  font-weight:700;
  opacity:0.95;
}
.${PANEL_BODY_CLASS}{
  flex:1 1 auto;
  min-height:0;
  padding:12px 14px;
  box-sizing:border-box;
  overflow:auto;
}
.${PREVIEW_PANEL_CLASS} .${PANEL_BODY_CLASS}{
  padding:0;
  background:transparent;
  overflow:auto;
  -webkit-overflow-scrolling:touch;
}
.${PANEL_FOOTER_CLASS}{
  flex:0 0 auto;
  padding:12px 14px;
  display:flex;
  gap:10px;
  justify-content:flex-end;
  border-top:0.5px solid rgba(255,255,255,0.12);
  box-sizing:border-box;
}
.th-ufb-iframe{
  display:block;
  width:100%;
  height:100%;
  border:none;
  border-radius:0;
  background:transparent;
}
.th-ufb-resize-handle{
  position:absolute;
  right:8px;
  bottom:8px;
  width:18px;
  height:18px;
  cursor:nwse-resize;
  opacity:0.6;
  border-right:2px solid rgba(255,255,255,0.55);
  border-bottom:2px solid rgba(255,255,255,0.55);
  border-radius:2px;
  pointer-events:auto;
}
.th-ufb-resize-handle:active{opacity:0.9}

.th-ufb-textarea{
  width:100%;
  height:100%;
  resize:none;
  border-radius:14px;
  border:0.5px solid rgba(255,255,255,0.16);
  background:var(--th-ufb-input-bg, #0b0f19) !important;
  color:var(--th-ufb-input-fg, #ffffff) !important;
  -webkit-text-fill-color:var(--th-ufb-input-fg, #ffffff);
  caret-color:var(--th-ufb-input-fg, #ffffff);
  color-scheme:var(--th-ufb-color-scheme, dark);
  font-weight:520;
  padding:12px;
  box-sizing:border-box;
  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size:13px;
  line-height:1.45;
  outline:none;
}
.th-ufb-textarea::placeholder{color:var(--th-ufb-input-ph, rgba(255,255,255,0.55))}
.th-ufb-textarea:focus{border-color:rgba(124,92,255,0.8);box-shadow:0 0 0 3px rgba(124,92,255,0.18)}
.th-ufb-row{display:flex;align-items:center;gap:10px}
.th-ufb-row + .th-ufb-row{margin-top:12px}
.th-ufb-label{font-size:13px;opacity:0.9;min-width:84px}
.th-ufb-input,.th-ufb-select{
  height:40px;
  border-radius:12px;
  border:0.5px solid rgba(255,255,255,0.16);
  background:var(--th-ufb-input-bg, #0b0f19) !important;
  color:var(--th-ufb-input-fg, #ffffff) !important;
  -webkit-text-fill-color:var(--th-ufb-input-fg, #ffffff);
  caret-color:var(--th-ufb-input-fg, #ffffff);
  color-scheme:var(--th-ufb-color-scheme, dark);
  font-weight:520;
  padding:0 12px;
  box-sizing:border-box;
  outline:none;
}
.th-ufb-input::placeholder{color:var(--th-ufb-input-ph, rgba(255,255,255,0.55))}
.th-ufb-input:focus,.th-ufb-select:focus{border-color:rgba(124,92,255,0.8);box-shadow:0 0 0 3px rgba(124,92,255,0.18)}
.th-ufb-range{flex:1 1 auto;min-width:140px}
.th-ufb-hint{font-size:12px;opacity:0.7;margin-top:10px;line-height:1.35}
.th-ufb-color{
  width:46px;
  height:40px;
  border-radius:12px;
  border:0.5px solid rgba(255,255,255,0.16);
  background:transparent;
  padding:0;
  overflow:hidden;
}
.th-ufb-color::-webkit-color-swatch-wrapper{padding:0}
.th-ufb-color::-webkit-color-swatch{border:none}
.th-ufb-presets{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:8px;
}
.th-ufb-preset{
  min-width:40px;
  height:40px;
  border-radius:12px;
  border:0.5px solid rgba(255,255,255,0.16);
  background:rgba(255,255,255,0.06);
  color:#fff;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size:22px;
  line-height:1;
  padding:0 10px;
}
.th-ufb-preset.is-active{
  box-shadow:inset 0 0 0 2px rgba(255,255,255,0.85);
  background:rgba(124,92,255,0.24);
}
.th-ufb-preset--color{
  min-width:40px;
  width:40px;
  padding:0;
  position:relative;
}
.th-ufb-preset--color::after{
  content:'';
  position:absolute;
  inset:7px;
  border-radius:999px;
  background:var(--th-ufb-preset-color);
  box-shadow:0 0 0 1px rgba(255,255,255,0.2) inset;
}
.${BUTTON_CLASS}{
  min-width:84px;
  height:38px;
  border-radius:12px;
  border:0.5px solid rgba(255,255,255,0.16);
  background:rgba(255,255,255,0.08);
  color:#fff;
  cursor:pointer;
  font-size:13px;
  font-weight:650;
}
.${BUTTON_CLASS}:active{transform:scale(0.98)}
.${PRIMARY_BUTTON_CLASS}{background:linear-gradient(145deg,#7c5cff 0%,#4d7dff 100%);border-color:transparent}
.${GHOST_BUTTON_CLASS}{background:transparent}

.th-ufb-status{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:58px;
  height:26px;
  padding:0 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:700;
  color:#fff;
  border:1px solid rgba(255,255,255,0.14);
}
.th-ufb-status--active{background:rgba(52,211,153,0.18);color:#bbf7d0}
.th-ufb-status--hidden{background:rgba(245,158,11,0.18);color:#fde68a}

.th-ufb-manager{
  display:grid;
  grid-template-columns:260px minmax(0,1fr);
  gap:14px;
  height:100%;
  min-height:0;
}
.th-ufb-manager__sidebar,.th-ufb-manager__main{
  min-height:0;
  border-radius:16px;
  border:0.5px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.04);
}
.th-ufb-manager__sidebar{
  display:flex;
  flex-direction:column;
  overflow:hidden;
}
.th-ufb-manager__sidebar-head{
  padding:12px;
  display:flex;
  gap:8px;
  border-bottom:0.5px solid rgba(255,255,255,0.1);
}
.th-ufb-manager__list{
  flex:1 1 auto;
  min-height:0;
  overflow:auto;
  padding:10px;
}
.th-ufb-manager__section + .th-ufb-manager__section{margin-top:12px}
.th-ufb-manager__section-title{
  font-size:12px;
  font-weight:800;
  letter-spacing:0.08em;
  opacity:0.65;
  padding:2px 8px 8px;
}
.th-ufb-manager__item{
  width:100%;
  border:none;
  background:transparent;
  color:#fff;
  cursor:pointer;
  text-align:left;
  padding:12px;
  border-radius:14px;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.th-ufb-manager__item + .th-ufb-manager__item{margin-top:8px}
.th-ufb-manager__item.is-active{
  background:rgba(124,92,255,0.2);
  box-shadow:inset 0 0 0 1px rgba(124,92,255,0.45);
}
.th-ufb-manager__item-name{
  font-size:14px;
  font-weight:700;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.th-ufb-manager__item-meta{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.th-ufb-manager__item-note{
  font-size:12px;
  opacity:0.72;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.th-ufb-manager__main{
  display:flex;
  flex-direction:column;
  min-height:0;
  padding:14px;
  box-sizing:border-box;
}
.th-ufb-manager__toolbar{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:center;
  margin-bottom:12px;
}
.th-ufb-manager__toolbar .th-ufb-input{
  flex:1 1 220px;
}
.th-ufb-manager__status-actions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.th-ufb-manager__status-actions .${BUTTON_CLASS}{
  min-width:72px;
}
.th-ufb-manager__danger{
  background:rgba(239,68,68,0.14);
  color:#fecaca;
  border-color:rgba(239,68,68,0.3);
}
.th-ufb-manager__danger:disabled{
  opacity:0.45;
  cursor:not-allowed;
}
.th-ufb-manager__editor{
  flex:1 1 auto;
  min-height:320px;
}
.th-ufb-manager__editor .th-ufb-textarea{
  height:100%;
}
.th-ufb-manager__empty{
  flex:1 1 auto;
  min-height:0;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
  opacity:0.72;
}

.th-ufb-rules{
  display:grid;
  grid-template-columns:minmax(0, 1fr) minmax(280px, 360px);
  gap:14px;
  height:100%;
  min-height:0;
}
.th-ufb-rules__main,.th-ufb-rules__preview{
  min-height:0;
  border-radius:16px;
  border:0.5px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.04);
}
.th-ufb-rules__main{
  display:flex;
  flex-direction:column;
  padding:14px;
  box-sizing:border-box;
  overflow:auto;
}
.th-ufb-rules__preview{
  display:flex;
  flex-direction:column;
  overflow:hidden;
}
.th-ufb-rules__preview-head{
  padding:12px 14px;
  border-bottom:0.5px solid rgba(255,255,255,0.1);
  font-size:13px;
  font-weight:700;
}
.th-ufb-rules__preview-body{
  flex:1 1 auto;
  min-height:0;
  overflow:auto;
  padding:12px 14px;
}
.th-ufb-mode-switch{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.th-ufb-mode-switch .${BUTTON_CLASS}{
  min-width:112px;
}
.th-ufb-rules__section{
  margin-top:14px;
}
.th-ufb-rules__section.is-hidden{
  display:none;
}
.th-ufb-rules__toolbar{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}
.th-ufb-rule-list{
  display:flex;
  flex-direction:column;
  gap:12px;
  margin-top:12px;
}
.th-ufb-rule-card{
  border-radius:14px;
  border:0.5px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.05);
  padding:12px;
}
.th-ufb-rule-card.is-disabled{
  opacity:0.68;
}
.th-ufb-rule-card__head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
  margin-bottom:10px;
}
.th-ufb-rule-card__title{
  font-size:13px;
  font-weight:700;
}
.th-ufb-rule-card__meta{
  font-size:11px;
  opacity:0.68;
  margin-top:3px;
}
.th-ufb-rule-card__actions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  justify-content:flex-end;
}
.th-ufb-rule-card__actions .${BUTTON_CLASS}{
  min-width:56px;
  height:34px;
  padding:0 10px;
}
.th-ufb-rule-grid{
  display:grid;
  grid-template-columns:repeat(2, minmax(0, 1fr));
  gap:10px;
}
.th-ufb-rule-field{
  min-width:0;
}
.th-ufb-rule-field.is-span-2{
  grid-column:1 / -1;
}
.th-ufb-rule-field .th-ufb-label{
  display:block;
  min-width:0;
  margin-bottom:6px;
}
.th-ufb-rule-field .th-ufb-input,
.th-ufb-rule-field .th-ufb-select{
  width:100%;
}
.th-ufb-rule-field .th-ufb-textarea{
  min-height:96px;
  height:96px;
}
.th-ufb-preview-shell{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.th-ufb-preview-card{
  border-radius:16px;
  border:0.5px solid rgba(255,255,255,0.1);
  background:rgba(7,10,18,0.9);
  overflow:hidden;
  color:#fff;
}
.th-ufb-preview-placeholder{
  min-height:180px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:28px 24px;
  box-sizing:border-box;
  text-align:center;
  color:#e2e8f0;
}
.th-ufb-preview-placeholder strong{
  font-size:15px;
}
.th-ufb-preview-placeholder p{
  margin:10px 0 0;
  max-width:560px;
  line-height:1.6;
  opacity:0.8;
  white-space:pre-wrap;
  word-break:break-word;
}
.th-ufb-preview-tabs{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.th-ufb-preview-tab{
  min-width:72px;
  height:34px;
  padding:0 12px;
  border:none;
  border-radius:999px;
  background:rgba(255,255,255,0.08);
  color:#fff;
  cursor:pointer;
  font-size:12px;
  font-weight:650;
}
.th-ufb-preview-tab.is-active{
  background:linear-gradient(145deg,#7c5cff 0%,#4d7dff 100%);
}
.th-ufb-preview-text{
  margin:0;
  min-height:240px;
  padding:14px;
  white-space:pre-wrap;
  word-break:break-word;
  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size:13px;
  line-height:1.55;
  color:#fff;
  background:rgba(11,15,25,0.92);
}
.th-ufb-preview-rendered{
  min-height:240px;
  padding:14px;
  box-sizing:border-box;
  background:rgba(11,15,25,0.96);
  color:#fff;
  overflow:auto;
  -webkit-overflow-scrolling:touch;
}
.th-ufb-preview-rendered .mes_text{
  max-width:none;
  width:auto;
  color:#fff;
}
.th-ufb-preview-rendered .mes_text,
.th-ufb-preview-rendered .mes_text p,
.th-ufb-preview-rendered .mes_text span,
.th-ufb-preview-rendered .mes_text div,
.th-ufb-preview-rendered .mes_text li,
.th-ufb-preview-rendered .mes_text blockquote{
  color:#fff !important;
}
.th-ufb-segment-list{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.th-ufb-segment{
  border-radius:12px;
  border:0.5px solid rgba(255,255,255,0.1);
  background:rgba(11,15,25,0.6);
  padding:10px 12px;
}
.th-ufb-segment__title{
  font-size:12px;
  font-weight:700;
  margin-bottom:6px;
}
.th-ufb-segment__meta{
  font-size:11px;
  opacity:0.68;
  margin-bottom:6px;
}
.th-ufb-segment pre{
  margin:0;
  white-space:pre-wrap;
  word-break:break-word;
  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size:12px;
  line-height:1.5;
  color:#e2e8f0;
}

@media (max-width: 768px){
  .${OVERLAY_CLASS}{
    align-items:flex-start;
    padding:14px;
    padding-top:calc(env(safe-area-inset-top, 0px) + 28px);
    padding-bottom:calc(env(safe-area-inset-bottom, 0px) + 14px);
  }
  .${PANEL_CLASS}{
    width:95vw;
    height:min(760px, calc(100svh - 52px), calc(100dvh - 52px));
  }
  .${PREVIEW_PANEL_CLASS}{
    width:96vw;
    max-height:min(calc(100svh - 52px), calc(100dvh - 52px));
  }
  .${BUTTON_CLASS}{
    height:40px;
    min-width:88px;
  }
  .th-ufb-manager{
    grid-template-columns:1fr;
    grid-template-rows:220px minmax(0,1fr);
  }
  .th-ufb-rules{
    grid-template-columns:1fr;
  }
  .th-ufb-rule-grid{
    grid-template-columns:1fr;
  }
  .th-ufb-rule-field.is-span-2{
    grid-column:auto;
  }
}
`.trim();
    head.append(this.styleElement);
  }

  private bindGlobalEvents(): void {
    const openManager = withErrorToast(() => {
      syncManagerButton();
      this.openManagerApp();
    });
    syncManagerButton();
    // Tavern Helper uses the button name as the event key, so keep it paired with the created button.
    eventOn(getButtonEvent(MANAGER_BUTTON_NAME), openManager);
    this.hostWindow.addEventListener('resize', this.handleWindowResize);
  }

  private startManagerButtonSync(): void {
    this.stopManagerButtonSync();
    const sync = () => {
      syncManagerButton();
    };
    sync();
    this.managerButtonSyncTimeouts = [0, 300, 1000, 3000].map(delay => this.hostWindow.setTimeout(sync, delay));
  }

  private stopManagerButtonSync(): void {
    for (const timer of this.managerButtonSyncTimeouts) {
      this.hostWindow.clearTimeout(timer);
    }
    this.managerButtonSyncTimeouts = [];
  }

  private readonly handleWindowResize = () => {
    this.renderBalls();
  };

  private renderBalls(): void {
    if (!this.root) {
      return;
    }

    const data = readScriptData();
    const draft = cloneData(data);
    const visibleItems = getVisibleItems(draft);
    const visibleIds = new Set(visibleItems.map(item => item.id));
    let hasChanges = false;

    for (const [ballId, button] of this.ballElements.entries()) {
      if (!visibleIds.has(ballId)) {
        button.remove();
        this.ballElements.delete(ballId);
      }
    }

    visibleItems.forEach((item, index) => {
      if (item.floatingBall.left === -1 || item.floatingBall.top === -1) {
        const point = constrainBallPosition(
          this.hostWindow,
          getDefaultBallPosition(this.hostWindow, item.floatingBall.size, index).left,
          getDefaultBallPosition(this.hostWindow, item.floatingBall.size, index).top,
          item.floatingBall.size,
        );
        draft.items[item.id].floatingBall.left = point.left;
        draft.items[item.id].floatingBall.top = point.top;
        item = draft.items[item.id];
        hasChanges = true;
      }

      const constrained = constrainBallPosition(
        this.hostWindow,
        item.floatingBall.left,
        item.floatingBall.top,
        item.floatingBall.size,
      );
      if (constrained.left !== item.floatingBall.left || constrained.top !== item.floatingBall.top) {
        draft.items[item.id].floatingBall.left = constrained.left;
        draft.items[item.id].floatingBall.top = constrained.top;
        item = draft.items[item.id];
        hasChanges = true;
      }

      const button = this.ensureBallButton(item.id);
      this.applyBallAppearance(button, item);
      this.setBallPosition(button, item.floatingBall.left, item.floatingBall.top);
    });

    if (hasChanges) {
      persistScriptData(draft);
    }
  }

  private ensureBallButton(ballId: string): HTMLButtonElement {
    const existing = this.ballElements.get(ballId);
    if (existing) {
      return existing;
    }

    if (!this.root) {
      throw new Error('悬浮球根节点未初始化。');
    }

    const button = this.hostDocument.createElement('button');
    button.type = 'button';
    button.className = BALL_CLASS;
    button.dataset.ballId = ballId;
    button.innerHTML = `
      <span class="th-ufb-ball__shine"></span>
      <span class="th-ufb-ball__icon"></span>
      <span class="th-ufb-ball__label"></span>
    `.trim();

    button.addEventListener('pointerdown', withErrorToast(event => this.startBallDrag(ballId, button, event)));
    button.addEventListener(
      'click',
      withErrorToast(() => {
        if (this.suppressedClickBallId === ballId) {
          this.suppressedClickBallId = null;
          return;
        }
        this.openPreview(ballId);
      }),
    );

    this.root.append(button);
    this.ballElements.set(ballId, button);
    return button;
  }

  private applyBallAppearance(button: HTMLButtonElement, item: FloatingBallItem): void {
    const icon = button.querySelector('.th-ufb-ball__icon') as HTMLSpanElement | null;
    const label = button.querySelector('.th-ufb-ball__label') as HTMLSpanElement | null;
    const { size, text, icon: iconText, color } = item.floatingBall;

    button.style.setProperty('--th-ufb-size', `${size}px`);
    button.style.setProperty('--th-ufb-c1', color);
    button.style.setProperty('--th-ufb-c2', color);
    button.style.setProperty('--th-ufb-c3', '#34d399');
    if (icon) {
      icon.textContent = iconText;
      icon.style.display = iconText ? 'block' : 'none';
    }
    if (label) {
      label.textContent = text;
      label.style.display = label.textContent ? 'block' : 'none';
    }
  }

  private setBallPosition(button: HTMLButtonElement, left: number, top: number): void {
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  }

  private startBallDrag(ballId: string, button: HTMLButtonElement, event: PointerEvent): void {
    event.preventDefault();
    const rect = button.getBoundingClientRect();
    this.dragState = {
      ballId,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }

    this.hostWindow.addEventListener('pointermove', this.handleBallPointerMove);
    this.hostWindow.addEventListener('pointerup', this.handleBallPointerUp);
    this.hostWindow.addEventListener('pointercancel', this.handleBallPointerUp);
  }

  private readonly handleBallPointerMove = (event: PointerEvent) => {
    const dragState = this.dragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const button = this.ballElements.get(dragState.ballId);
    const item = readScriptData().items[dragState.ballId];
    if (!button || !item) {
      return;
    }

    if (
      !dragState.moved &&
      (Math.abs(event.clientX - dragState.startX) > DRAG_THRESHOLD ||
        Math.abs(event.clientY - dragState.startY) > DRAG_THRESHOLD)
    ) {
      dragState.moved = true;
    }

    const point = constrainBallPosition(
      this.hostWindow,
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY,
      item.floatingBall.size,
    );

    this.setBallPosition(button, point.left, point.top);
  };

  private readonly handleBallPointerUp = (event: PointerEvent) => {
    const dragState = this.dragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.moved) {
      const button = this.ballElements.get(dragState.ballId);
      if (button) {
        const left = Number.parseFloat(button.style.left || '0') || 0;
        const top = Number.parseFloat(button.style.top || '0') || 0;
        updateScriptData(draft => {
          if (draft.items[dragState.ballId]) {
            draft.items[dragState.ballId].floatingBall.left = left;
            draft.items[dragState.ballId].floatingBall.top = top;
          }
        });
      }
      this.suppressedClickBallId = dragState.ballId;
      this.hostWindow.setTimeout(() => {
        if (this.suppressedClickBallId === dragState.ballId) {
          this.suppressedClickBallId = null;
        }
      }, 0);
    }

    this.dragState = null;
    this.hostWindow.removeEventListener('pointermove', this.handleBallPointerMove);
    this.hostWindow.removeEventListener('pointerup', this.handleBallPointerUp);
    this.hostWindow.removeEventListener('pointercancel', this.handleBallPointerUp);
  };

  private closeCurrentModal(): void {
    this.currentModal?.close();
    this.currentModal = null;
    this.isPreviewManuallyResized = false;
  }

  private closeManagerApp(): void {
    if (this.managerApp) {
      this.managerApp.unmount();
      this.managerApp = null;
    }
    if (this.managerPanicClose) {
      this.managerPanicClose.remove();
      this.managerPanicClose = null;
    }
    if (this.managerIframe) {
      this.managerIframe.remove();
      this.managerIframe = null;
    }
    if (this.managerStyleDestroy) {
      this.managerStyleDestroy();
      this.managerStyleDestroy = null;
    }
  }

  private openManagerApp(): void {
    if (this.managerIframe) {
      const iframe = this.managerIframe[0];
      if (iframe?.isConnected) {
        return;
      }
      this.closeManagerApp();
    }

    syncManagerButton();
    this.closeCurrentModal();
    const api = {
      readData: () => cloneData(readScriptData()),
      saveData: (data: ScriptData) => persistScriptData(data),
      renderBalls: () => this.renderBalls(),
      showToast,
      getOrderedItems,
      getNextBallName,
      getStatusLabel,
      getOutputModeLabel,
      getRuleModeLabel,
      createBallItem,
      createRegexRule,
      listTavernRegexTemplates,
      createRuleFromTavernRegex,
      executeMessageRules,
      parsePreviewUrl,
      defaultMessageTarget: DEFAULT_MESSAGE_TARGET,
      defaultIconPresets: DEFAULT_ICON_PRESETS,
      defaultColorPresets: DEFAULT_COLOR_PRESETS,
      ballMinSize: BALL_MIN_SIZE,
      ballMaxSize: BALL_MAX_SIZE,
      ballDefaultColor: BALL_DEFAULT_COLOR,
      openLegacyContentModal: () => this.openManagerModal(),
      openLegacyAppearanceModal: () => this.openSettingsModal(),
      openLegacyRulesModal: () => this.openRulesModal(),
    };

    this.managerApp = createApp(App, {
      api,
      onClose: () => this.closeManagerApp(),
    });

    this.managerIframe = createScriptIdIframe()
      .appendTo('body')
      .css({
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        border: 'none',
        padding: 0,
        margin: 0,
      })
      .on('load', () => {
        try {
          const iframeDoc = this.managerIframe?.[0]?.contentDocument;
          const iframeBody = iframeDoc?.body;
          if (!iframeDoc || !iframeBody || !this.managerApp) {
            throw new Error('管理面板 iframe 尚未准备好。');
          }
          iframeBody.style.margin = '0';
          iframeBody.style.padding = '0';
          iframeBody.style.width = '100%';
          iframeBody.style.height = '100%';
          iframeBody.style.overflow = 'hidden';

          const { destroy } = teleportStyle(iframeDoc.head);
          this.managerStyleDestroy = destroy;
          this.managerApp.mount(iframeBody);
        } catch (error) {
          console.error(`[${SCRIPT_NAME}] manager app mount failed`, error);
          this.closeManagerApp();
          showToast('error', `悬浮球管理打开失败：${error instanceof Error ? error.message : String(error)}`);
        }
      });
  }

  private createOverlay(options: { title?: string; showFooter: boolean; showHeader?: boolean; onCloseExtra?: () => void }): OverlayHandle {
    const body = this.hostDocument.body;
    if (!body) {
      throw new Error('未找到页面 body。');
    }

    const overlay = this.hostDocument.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('script_id', SCRIPT_ID);

    const panel = this.hostDocument.createElement('div');
    panel.className = PANEL_CLASS;
    applyModalColorScheme(panel, this.hostDocument);

    if (options.showHeader !== false) {
      const header = this.hostDocument.createElement('div');
      header.className = PANEL_HEADER_CLASS;
      const title = this.hostDocument.createElement('div');
      title.className = 'th-ufb-title';
      title.textContent = options.title ?? '';
      header.append(title);
      panel.append(header);
    }

    const modalBody = this.hostDocument.createElement('div');
    modalBody.className = PANEL_BODY_CLASS;
    panel.append(modalBody);

    const footer = options.showFooter ? this.hostDocument.createElement('div') : null;
    if (footer) {
      footer.className = PANEL_FOOTER_CLASS;
      panel.append(footer);
    }

    overlay.append(panel);
    body.append(overlay);

    let isClosed = false;
    let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

    const close = () => {
      if (isClosed) {
        return;
      }
      isClosed = true;
      if (keydownHandler) {
        this.hostWindow.removeEventListener('keydown', keydownHandler, true);
        keydownHandler = null;
      }
      options.onCloseExtra?.();
      overlay.remove();
      if (this.currentModal?.overlay === overlay) {
        this.currentModal = null;
      }
    };

    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) {
        close();
      }
    });

    keydownHandler = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    this.hostWindow.addEventListener('keydown', keydownHandler, true);

    const handle: OverlayHandle = { overlay, panel, body: modalBody, footer, close };
    this.currentModal = handle;
    return handle;
  }

  private openManagerModal(): void {
    this.closeCurrentModal();
    const modal = this.createOverlay({ title: '悬浮球管理器', showFooter: true });
    const draft = cloneData(readScriptData());
    let currentId = draft.order.includes(draft.activeId) ? draft.activeId : draft.order[0];
    draft.activeId = currentId;

    const manager = this.hostDocument.createElement('div');
    manager.className = 'th-ufb-manager';
    const sidebar = this.hostDocument.createElement('div');
    sidebar.className = 'th-ufb-manager__sidebar';
    const sidebarHead = this.hostDocument.createElement('div');
    sidebarHead.className = 'th-ufb-manager__sidebar-head';
    const newButton = this.hostDocument.createElement('button');
    newButton.type = 'button';
    newButton.className = `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}`;
    newButton.textContent = '新建悬浮球';
    sidebarHead.append(newButton);
    const list = this.hostDocument.createElement('div');
    list.className = 'th-ufb-manager__list';
    sidebar.append(sidebarHead, list);

    const main = this.hostDocument.createElement('div');
    main.className = 'th-ufb-manager__main';
    const toolbar = this.hostDocument.createElement('div');
    toolbar.className = 'th-ufb-manager__toolbar';
    const nameInput = this.hostDocument.createElement('input');
    nameInput.className = 'th-ufb-input';
    nameInput.type = 'text';
    nameInput.placeholder = '悬浮球名称';
    const statusRow = this.hostDocument.createElement('div');
    statusRow.className = 'th-ufb-manager__status-actions';
    const activeButton = this.createStatusActionButton('启用', 'active');
    const hiddenButton = this.createStatusActionButton('停用', 'hidden');
    const deleteButton = this.hostDocument.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS} th-ufb-manager__danger`;
    deleteButton.textContent = '删除';
    statusRow.append(activeButton, hiddenButton, deleteButton);
    toolbar.append(nameInput, statusRow);

    const editor = this.hostDocument.createElement('div');
    editor.className = 'th-ufb-manager__editor';
    const textarea = this.hostDocument.createElement('textarea');
    textarea.className = 'th-ufb-textarea';
    textarea.placeholder = '在这里输入当前悬浮球对应的 HTML 代码...';
    editor.append(textarea);

    const hint = this.hostDocument.createElement('div');
    hint.className = 'th-ufb-hint';
    hint.textContent = '启用：显示悬浮球；停用：保留配置但不显示。';
    main.append(toolbar, editor, hint);
    manager.append(sidebar, main);
    modal.body.append(manager);

    const getCurrentItem = () => draft.items[currentId];

    const ensureCurrentId = () => {
      if (draft.order.includes(currentId)) {
        draft.activeId = currentId;
        return;
      }
      currentId = draft.order[0];
      draft.activeId = currentId;
    };

    const refreshStatusButtons = () => {
      const current = getCurrentItem();
      if (!current) {
        return;
      }
      const buttons: Array<[HTMLButtonElement, BallStatus]> = [
        [activeButton, 'active'],
        [hiddenButton, 'hidden'],
      ];
      for (const [button, status] of buttons) {
        button.className =
          current.status === status ? `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}` : `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
      }
      deleteButton.disabled = draft.order.length <= 1;
      deleteButton.title = draft.order.length <= 1 ? '至少保留一个悬浮球' : `删除“${current.name.trim() || '未命名悬浮球'}”`;
    };

    const refreshList = () => {
      list.replaceChildren();
      const groups: Array<{ status: BallStatus; title: string }> = [
        { status: 'active', title: '启用中' },
        { status: 'hidden', title: '已停用' },
      ];

      for (const group of groups) {
        const items = getOrderedItems(draft).filter(item => item.status === group.status);
        if (items.length === 0) {
          continue;
        }

        const section = this.hostDocument.createElement('div');
        section.className = 'th-ufb-manager__section';
        const title = this.hostDocument.createElement('div');
        title.className = 'th-ufb-manager__section-title';
        title.textContent = group.title;
        section.append(title);

        for (const item of items) {
          const itemButton = this.hostDocument.createElement('button');
          itemButton.type = 'button';
          itemButton.className = `th-ufb-manager__item${item.id === currentId ? ' is-active' : ''}`;
          itemButton.innerHTML = `
            <div class="th-ufb-manager__item-name">${_.escape(item.name.trim() || '未命名悬浮球')}</div>
            <div class="th-ufb-manager__item-meta">
              <span class="th-ufb-manager__item-note">${_.escape(getItemContentSummary(item))}</span>
              <span class="th-ufb-status th-ufb-status--${item.status}">${getStatusLabel(item.status)}</span>
            </div>
          `.trim();
          itemButton.addEventListener('click', () => {
            currentId = item.id;
            draft.activeId = currentId;
            syncCurrentItemToForm();
            refreshList();
          });
          section.append(itemButton);
        }

        list.append(section);
      }
    };

    const syncCurrentItemToForm = () => {
      ensureCurrentId();
      const current = getCurrentItem();
      if (!current) {
        return;
      }
      nameInput.value = current.name;
      textarea.value = current.webCode;
      refreshStatusButtons();
    };

    nameInput.addEventListener('input', () => {
      const current = getCurrentItem();
      if (!current) {
        return;
      }
      current.name = String(nameInput.value ?? '');
      refreshList();
    });

    textarea.addEventListener('input', () => {
      const current = getCurrentItem();
      if (!current) {
        return;
      }
      current.webCode = String(textarea.value ?? '');
      refreshList();
    });

    const bindStatusButton = (button: HTMLButtonElement, status: BallStatus) => {
      button.addEventListener('click', () => {
        const current = getCurrentItem();
        if (!current) {
          return;
        }
        current.status = status;
        refreshStatusButtons();
        refreshList();
      });
    };

    bindStatusButton(activeButton, 'active');
    bindStatusButton(hiddenButton, 'hidden');
    deleteButton.addEventListener('click', () => {
      if (draft.order.length <= 1) {
        showToast('warning', '至少保留一个悬浮球');
        return;
      }

      const deleteIndex = draft.order.findIndex(id => id === currentId);
      delete draft.items[currentId];
      draft.order = draft.order.filter(id => id !== currentId);
      currentId = draft.order[Math.min(deleteIndex, draft.order.length - 1)];
      draft.activeId = currentId;
      refreshList();
      syncCurrentItemToForm();
      showToast('info', '已删除当前悬浮球');
    });

    newButton.addEventListener('click', () => {
      const item = createBallItem({
        id: createBallId(),
        name: getNextBallName(draft),
        status: 'active',
      });
      draft.items[item.id] = item;
      draft.order.push(item.id);
      draft.activeId = item.id;
      currentId = item.id;
      refreshList();
      syncCurrentItemToForm();
      nameInput.focus();
      nameInput.select?.();
    });

    const cancelButton = this.hostDocument.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = BUTTON_CLASS;
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', modal.close);

    const saveButton = this.hostDocument.createElement('button');
    saveButton.type = 'button';
    saveButton.className = `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}`;
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', () => {
      const normalized = persistScriptData(draft);
      this.renderBalls();
      showToast('success', `已保存 ${getOrderedItems(normalized).length} 个悬浮球`);
      modal.close();
    });

    modal.footer?.append(cancelButton, saveButton);
    refreshList();
    syncCurrentItemToForm();
    nameInput.focus();
  }

  private createStatusActionButton(label: string, _status: BallStatus): HTMLButtonElement {
    const button = this.hostDocument.createElement('button');
    button.type = 'button';
    button.className = `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
    button.textContent = label;
    return button;
  }

  private openSettingsModal(): void {
    this.closeCurrentModal();
    const modal = this.createOverlay({ title: '悬浮球设置', showFooter: true });
    const draft = cloneData(readScriptData());
    let currentId = draft.order.includes(draft.activeId) ? draft.activeId : draft.order[0];
    draft.activeId = currentId;

    const currentSelectRow = this.hostDocument.createElement('div');
    currentSelectRow.className = 'th-ufb-row';
    const selectLabel = this.hostDocument.createElement('div');
    selectLabel.className = 'th-ufb-label';
    selectLabel.textContent = '当前悬浮球';
    const select = this.hostDocument.createElement('select');
    select.className = 'th-ufb-select';
    select.style.flex = '1 1 auto';
    currentSelectRow.append(selectLabel, select);

    const statusRow = this.hostDocument.createElement('div');
    statusRow.className = 'th-ufb-row';
    const statusLabel = this.hostDocument.createElement('div');
    statusLabel.className = 'th-ufb-label';
    statusLabel.textContent = '状态';
    const statusBadge = this.hostDocument.createElement('span');
    statusBadge.className = 'th-ufb-status';
    statusRow.append(statusLabel, statusBadge);

    const sizeRow = this.hostDocument.createElement('div');
    sizeRow.className = 'th-ufb-row';
    const sizeLabel = this.hostDocument.createElement('div');
    sizeLabel.className = 'th-ufb-label';
    sizeLabel.textContent = '大小(px)';
    const sizeRangeInput = this.hostDocument.createElement('input');
    sizeRangeInput.className = 'th-ufb-range';
    sizeRangeInput.type = 'range';
    sizeRangeInput.min = String(BALL_MIN_SIZE);
    sizeRangeInput.max = String(BALL_MAX_SIZE);
    sizeRangeInput.step = '1';
    const sizeNumberInput = this.hostDocument.createElement('input');
    sizeNumberInput.className = 'th-ufb-input';
    sizeNumberInput.type = 'number';
    sizeNumberInput.min = String(BALL_MIN_SIZE);
    sizeNumberInput.max = String(BALL_MAX_SIZE);
    sizeNumberInput.step = '1';
    sizeNumberInput.style.width = '110px';
    sizeRow.append(sizeLabel, sizeRangeInput, sizeNumberInput);

    const textRow = this.hostDocument.createElement('div');
    textRow.className = 'th-ufb-row';
    const textLabel = this.hostDocument.createElement('div');
    textLabel.className = 'th-ufb-label';
    textLabel.textContent = '文字';
    const textInput = this.hostDocument.createElement('input');
    textInput.className = 'th-ufb-input';
    textInput.type = 'text';
    textInput.placeholder = '留空则不显示文字';
    textInput.style.flex = '1 1 auto';
    textRow.append(textLabel, textInput);

    const iconRow = this.hostDocument.createElement('div');
    iconRow.className = 'th-ufb-row';
    const iconLabel = this.hostDocument.createElement('div');
    iconLabel.className = 'th-ufb-label';
    iconLabel.textContent = '图标';
    const iconInput = this.hostDocument.createElement('input');
    iconInput.className = 'th-ufb-input';
    iconInput.type = 'text';
    iconInput.placeholder = '例如：🌐 或 ★';
    iconInput.style.flex = '1 1 auto';
    iconRow.append(iconLabel, iconInput);
    const iconPresetRow = this.hostDocument.createElement('div');
    iconPresetRow.className = 'th-ufb-presets';

    const colorRow = this.hostDocument.createElement('div');
    colorRow.className = 'th-ufb-row';
    const colorLabel = this.hostDocument.createElement('div');
    colorLabel.className = 'th-ufb-label';
    colorLabel.textContent = '颜色';
    const colorPicker = this.hostDocument.createElement('input');
    colorPicker.className = 'th-ufb-color';
    colorPicker.type = 'color';
    const colorTextInput = this.hostDocument.createElement('input');
    colorTextInput.className = 'th-ufb-input';
    colorTextInput.type = 'text';
    colorTextInput.placeholder = BALL_DEFAULT_COLOR;
    colorTextInput.style.flex = '1 1 auto';
    colorRow.append(colorLabel, colorPicker, colorTextInput);
    const colorPresetRow = this.hostDocument.createElement('div');
    colorPresetRow.className = 'th-ufb-presets';

    const hint = this.hostDocument.createElement('div');
    hint.className = 'th-ufb-hint';
    hint.textContent = '文字和图标都支持留空。只留图标就是图标球，只留文字就是文字球，都留空时就是纯色球。位置仍然可以直接拖动悬浮球。若想重新自动排布，可用“重置位置”。';

    modal.body.append(currentSelectRow, statusRow, sizeRow, textRow, iconRow, iconPresetRow, colorRow, colorPresetRow, hint);

    const populateSelect = () => {
      select.replaceChildren();
      for (const item of getOrderedItems(draft)) {
        const option = this.hostDocument.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name.trim() || '未命名悬浮球'} · ${getStatusLabel(item.status)}`;
        select.append(option);
      }
      select.value = currentId;
    };

    const syncFormFromCurrent = () => {
      const current = draft.items[currentId];
      if (!current) {
        return;
      }
      const settings = current.floatingBall;
      statusBadge.className = `th-ufb-status th-ufb-status--${current.status}`;
      statusBadge.textContent = getStatusLabel(current.status);
      sizeRangeInput.value = String(settings.size);
      sizeNumberInput.value = String(settings.size);
      textInput.value = settings.text;
      iconInput.value = settings.icon;
      colorPicker.value = isHexColor(settings.color) ? settings.color : BALL_DEFAULT_COLOR;
      colorTextInput.value = colorPicker.value;
      refreshPresetState();
    };

    const refreshPresetState = () => {
      const currentIcon = String(iconInput.value ?? '').trim();
      for (const button of iconPresetRow.querySelectorAll<HTMLButtonElement>('.th-ufb-preset')) {
        button.classList.toggle('is-active', button.dataset.presetValue === currentIcon);
      }

      const currentColor = String(colorTextInput.value ?? '').trim().toLowerCase();
      for (const button of colorPresetRow.querySelectorAll<HTMLButtonElement>('.th-ufb-preset')) {
        button.classList.toggle('is-active', button.dataset.presetValue?.toLowerCase() === currentColor);
      }
    };

    for (const iconPreset of DEFAULT_ICON_PRESETS) {
      const presetButton = this.hostDocument.createElement('button');
      presetButton.type = 'button';
      presetButton.className = 'th-ufb-preset';
      presetButton.textContent = iconPreset;
      presetButton.dataset.presetValue = iconPreset;
      presetButton.title = `使用图标 ${iconPreset}`;
      presetButton.addEventListener('click', () => {
        updateCurrentBall(ball => {
          ball.floatingBall.icon = iconPreset;
        });
      });
      iconPresetRow.append(presetButton);
    }

    for (const colorPreset of DEFAULT_COLOR_PRESETS) {
      const presetButton = this.hostDocument.createElement('button');
      presetButton.type = 'button';
      presetButton.className = 'th-ufb-preset th-ufb-preset--color';
      presetButton.dataset.presetValue = colorPreset;
      presetButton.title = `使用颜色 ${colorPreset}`;
      presetButton.style.setProperty('--th-ufb-preset-color', colorPreset);
      presetButton.addEventListener('click', () => {
        updateCurrentBall(ball => {
          ball.floatingBall.color = colorPreset;
        });
      });
      colorPresetRow.append(presetButton);
    }

    select.addEventListener('change', () => {
      currentId = select.value;
      draft.activeId = currentId;
      syncFormFromCurrent();
    });

    const updateCurrentBall = (updater: (ball: FloatingBallItem) => void) => {
      const current = draft.items[currentId];
      if (!current) {
        return;
      }
      updater(current);
      populateSelect();
      syncFormFromCurrent();
    };

    const syncSizeInputs = (value: number) => {
      const size = clamp(Math.round(value), BALL_MIN_SIZE, BALL_MAX_SIZE);
      updateCurrentBall(ball => {
        ball.floatingBall.size = size;
      });
    };

    sizeRangeInput.addEventListener('input', () => syncSizeInputs(Number(sizeRangeInput.value)));
    sizeNumberInput.addEventListener('input', () => syncSizeInputs(Number(sizeNumberInput.value)));
    textInput.addEventListener('input', () => {
      const value = String(textInput.value ?? '');
      updateCurrentBall(ball => {
        ball.floatingBall.text = value;
      });
    });
    iconInput.addEventListener('input', () => {
      const value = String(iconInput.value ?? '');
      updateCurrentBall(ball => {
        ball.floatingBall.icon = value;
      });
    });
    colorPicker.addEventListener('input', () => {
      const value = String(colorPicker.value ?? BALL_DEFAULT_COLOR);
      updateCurrentBall(ball => {
        ball.floatingBall.color = value;
      });
    });
    colorTextInput.addEventListener('input', () => {
      const value = String(colorTextInput.value ?? '').trim();
      updateCurrentBall(ball => {
        ball.floatingBall.color = isHexColor(value) ? value : colorPicker.value;
      });
    });

    const cancelButton = this.hostDocument.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = BUTTON_CLASS;
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', modal.close);

    const resetPositionButton = this.hostDocument.createElement('button');
    resetPositionButton.type = 'button';
    resetPositionButton.className = `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
    resetPositionButton.textContent = '重置位置';
    resetPositionButton.addEventListener('click', () => {
      updateCurrentBall(ball => {
        ball.floatingBall.left = -1;
        ball.floatingBall.top = -1;
      });
      showToast('info', '当前悬浮球位置会在保存后自动重新排布');
    });

    const saveButton = this.hostDocument.createElement('button');
    saveButton.type = 'button';
    saveButton.className = `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}`;
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', () => {
      persistScriptData(draft);
      this.renderBalls();
      showToast('success', '悬浮球设置已保存');
      modal.close();
    });

    modal.footer?.append(cancelButton, resetPositionButton, saveButton);
    populateSelect();
    syncFormFromCurrent();
    select.focus();
  }

  private openRulesModal(): void {
    this.closeCurrentModal();
    const modal = this.createOverlay({ title: '消息来源与规则', showFooter: true });
    const draft = cloneData(readScriptData());
    let currentId = draft.order.includes(draft.activeId) ? draft.activeId : draft.order[0];
    draft.activeId = currentId;

    const root = this.hostDocument.createElement('div');
    root.className = 'th-ufb-rules';
    const main = this.hostDocument.createElement('div');
    main.className = 'th-ufb-rules__main';
    const preview = this.hostDocument.createElement('div');
    preview.className = 'th-ufb-rules__preview';
    const previewHead = this.hostDocument.createElement('div');
    previewHead.className = 'th-ufb-rules__preview-head';
    previewHead.textContent = '即时预览结果';
    const previewBody = this.hostDocument.createElement('div');
    previewBody.className = 'th-ufb-rules__preview-body';
    preview.append(previewHead, previewBody);
    root.append(main, preview);
    modal.body.append(root);

    const currentBallRow = this.hostDocument.createElement('div');
    currentBallRow.className = 'th-ufb-row';
    const currentBallLabel = this.hostDocument.createElement('div');
    currentBallLabel.className = 'th-ufb-label';
    currentBallLabel.textContent = '当前悬浮球';
    const currentBallSelect = this.hostDocument.createElement('select');
    currentBallSelect.className = 'th-ufb-select';
    currentBallSelect.style.flex = '1 1 auto';
    currentBallRow.append(currentBallLabel, currentBallSelect);

    const modeRow = this.hostDocument.createElement('div');
    modeRow.className = 'th-ufb-row';
    const modeLabel = this.hostDocument.createElement('div');
    modeLabel.className = 'th-ufb-label';
    modeLabel.textContent = '来源模式';
    const modeSwitch = this.hostDocument.createElement('div');
    modeSwitch.className = 'th-ufb-mode-switch';
    const customModeButton = this.hostDocument.createElement('button');
    customModeButton.type = 'button';
    customModeButton.className = `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
    customModeButton.textContent = '自定义网页';
    const messageModeButton = this.hostDocument.createElement('button');
    messageModeButton.type = 'button';
    messageModeButton.className = `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
    messageModeButton.textContent = '消息层规则';
    modeSwitch.append(customModeButton, messageModeButton);
    modeRow.append(modeLabel, modeSwitch);

    const customHint = this.hostDocument.createElement('div');
    customHint.className = 'th-ufb-hint';
    customHint.textContent = '当前球继续使用“输入网页代码”窗口里的 webCode 作为预览内容。切到“消息层规则”后，这里才会读取原始消息并执行规则链。';

    const messageSection = this.hostDocument.createElement('div');
    messageSection.className = 'th-ufb-rules__section';
    const targetRow = this.hostDocument.createElement('div');
    targetRow.className = 'th-ufb-row';
    const targetLabel = this.hostDocument.createElement('div');
    targetLabel.className = 'th-ufb-label';
    targetLabel.textContent = '目标楼层';
    const targetInput = this.hostDocument.createElement('input');
    targetInput.className = 'th-ufb-input';
    targetInput.type = 'text';
    targetInput.placeholder = DEFAULT_MESSAGE_TARGET;
    targetInput.style.flex = '1 1 auto';
    targetRow.append(targetLabel, targetInput);

    const outputRow = this.hostDocument.createElement('div');
    outputRow.className = 'th-ufb-row';
    const outputLabel = this.hostDocument.createElement('div');
    outputLabel.className = 'th-ufb-label';
    outputLabel.textContent = '输出模式';
    const outputSelect = this.hostDocument.createElement('select');
    outputSelect.className = 'th-ufb-select';
    outputSelect.style.flex = '1 1 auto';
    for (const [value, label] of [
      ['html', 'HTML'],
      ['text', '文本'],
      ['url', 'URL'],
    ] as const) {
      const option = this.hostDocument.createElement('option');
      option.value = value;
      option.textContent = label;
      outputSelect.append(option);
    }
    outputRow.append(outputLabel, outputSelect);

    const toolbar = this.hostDocument.createElement('div');
    toolbar.className = 'th-ufb-rules__toolbar';
    const addRuleButton = this.hostDocument.createElement('button');
    addRuleButton.type = 'button';
    addRuleButton.className = `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}`;
    addRuleButton.textContent = '新增规则';
    toolbar.append(addRuleButton);

    const sectionHint = this.hostDocument.createElement('div');
    sectionHint.className = 'th-ufb-hint';
    sectionHint.textContent = '规则按顺序逐条执行：提取首个 / 提取全部会改写段列表，替换会对现有每段做标准正则替换。关闭某条规则后会立即从规则链中跳过。';

    const ruleList = this.hostDocument.createElement('div');
    ruleList.className = 'th-ufb-rule-list';
    messageSection.append(targetRow, outputRow, toolbar, sectionHint, ruleList);

    main.append(currentBallRow, modeRow, customHint, messageSection);

    const getCurrentItem = () => draft.items[currentId];

    const ensureCurrentId = () => {
      if (draft.order.includes(currentId)) {
        draft.activeId = currentId;
        return;
      }
      currentId = draft.order[0];
      draft.activeId = currentId;
    };

    const ensureMessageSource = (): Extract<FloatingBallContentSource, { mode: 'message_rules' }> | null => {
      const current = getCurrentItem();
      if (!current) {
        return null;
      }
      if (current.contentSource.mode !== 'message_rules') {
        current.contentSource = createDefaultMessageRulesSource();
      }
      return current.contentSource;
    };

    const populateBallSelect = () => {
      currentBallSelect.replaceChildren();
      for (const item of getOrderedItems(draft)) {
        const option = this.hostDocument.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name.trim() || '未命名悬浮球'} · ${getStatusLabel(item.status)}`;
        currentBallSelect.append(option);
      }
      currentBallSelect.value = currentId;
    };

    const refreshModeButtons = () => {
      const current = getCurrentItem();
      const mode = current?.contentSource.mode ?? 'custom_html';
      customModeButton.className =
        mode === 'custom_html' ? `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}` : `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
      messageModeButton.className =
        mode === 'message_rules' ? `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}` : `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
    };

    const renderImmediatePreview = () => {
      previewBody.replaceChildren();
      const current = getCurrentItem();
      if (!current) {
        this.renderPreviewPlaceholder(previewBody, '未找到悬浮球', '当前没有可编辑的悬浮球配置。');
        return;
      }

      if (current.contentSource.mode !== 'message_rules') {
        this.renderPreviewPlaceholder(
          previewBody,
          '当前使用自定义网页',
          current.webCode.trim()
            ? '点击悬浮球时会继续走现有 webCode 预览逻辑。切换到“消息层规则”后，这里才会显示规则链处理结果。'
            : '当前球还没有配置 webCode。切换到“消息层规则”后，这里才会显示规则链处理结果。',
        );
        return;
      }

      const source = current.contentSource;
      const result = executeMessageRules(source);
      if (!result.ok) {
        this.renderPreviewPlaceholder(previewBody, '规则执行失败', result.error);
        return;
      }

      if (result.segments.length === 0) {
        this.renderPreviewPlaceholder(
          previewBody,
          '没有可预览的结果',
          result.warnings[0] ?? `目标楼层 ${result.messageTarget} 没有产出可用于 ${getOutputModeLabel(source.outputMode)} 预览的结果。`,
        );
        return;
      }

      const shell = this.hostDocument.createElement('div');
      shell.className = 'th-ufb-preview-shell';
      const summary = this.hostDocument.createElement('div');
      summary.className = 'th-ufb-hint';
      summary.textContent = `目标楼层 ${result.messageTarget} · 消息 ID ${result.messageId} · ${getOutputModeLabel(source.outputMode)} · ${result.segments.length} 段结果`;
      shell.append(summary);

      if (result.warnings.length > 0) {
        const warnings = this.hostDocument.createElement('div');
        warnings.className = 'th-ufb-hint';
        warnings.textContent = result.warnings.join(' ');
        shell.append(warnings);
      }

      const segments = this.hostDocument.createElement('div');
      segments.className = 'th-ufb-segment-list';
      result.segments.forEach((segment, index) => {
        const block = this.hostDocument.createElement('div');
        block.className = 'th-ufb-segment';
        const title = this.hostDocument.createElement('div');
        title.className = 'th-ufb-segment__title';
        title.textContent = `${source.outputMode === 'text' ? '文本' : source.outputMode === 'url' ? 'URL' : '片段'} ${index + 1}`;
        const meta = this.hostDocument.createElement('div');
        meta.className = 'th-ufb-segment__meta';
        if (source.outputMode === 'url') {
          const parsed = parsePreviewUrl(segment);
          meta.textContent = parsed.ok ? 'URL 可用于预览' : parsed.error;
        } else {
          meta.textContent = `${segment.length} 个字符`;
        }
        const pre = this.hostDocument.createElement('pre');
        pre.textContent = segment.length > 1200 ? `${segment.slice(0, 1200)}…` : segment;
        block.append(title, meta, pre);
        segments.append(block);
      });
      shell.append(segments);
      previewBody.append(shell);
    };

    const renderRules = () => {
      ruleList.replaceChildren();
      const current = getCurrentItem();
      if (!current || current.contentSource.mode !== 'message_rules') {
        return;
      }
      const source = current.contentSource;

      if (source.rules.length === 0) {
        const empty = this.hostDocument.createElement('div');
        empty.className = 'th-ufb-hint';
        empty.textContent = '当前还没有规则。你可以先新增一条提取规则，从目标楼层里抓取网页片段、文本或 URL。';
        ruleList.append(empty);
        return;
      }

      source.rules.forEach((rule, index) => {
        const card = this.hostDocument.createElement('div');
        card.className = `th-ufb-rule-card${rule.enabled ? '' : ' is-disabled'}`;

        const head = this.hostDocument.createElement('div');
        head.className = 'th-ufb-rule-card__head';
        const headInfo = this.hostDocument.createElement('div');
        const title = this.hostDocument.createElement('div');
        title.className = 'th-ufb-rule-card__title';
        title.textContent = rule.name.trim() || `规则 ${index + 1}`;
        const meta = this.hostDocument.createElement('div');
        meta.className = 'th-ufb-rule-card__meta';
        meta.textContent = `${getRuleModeLabel(rule.mode)} · ${rule.enabled ? '已启用' : '已停用'}`;
        headInfo.append(title, meta);

        const actions = this.hostDocument.createElement('div');
        actions.className = 'th-ufb-rule-card__actions';

        const toggleButton = this.hostDocument.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = BUTTON_CLASS;
        toggleButton.textContent = rule.enabled ? '停用' : '启用';
        toggleButton.addEventListener('click', () => {
          rule.enabled = !rule.enabled;
          renderRules();
          renderImmediatePreview();
        });

        const copyButton = this.hostDocument.createElement('button');
        copyButton.type = 'button';
        copyButton.className = BUTTON_CLASS;
        copyButton.textContent = '复制';
        copyButton.addEventListener('click', () => {
          source.rules.splice(index + 1, 0, createRegexRule({ ...rule, id: '' }));
          renderRules();
          renderImmediatePreview();
        });

        const upButton = this.hostDocument.createElement('button');
        upButton.type = 'button';
        upButton.className = BUTTON_CLASS;
        upButton.textContent = '上移';
        upButton.disabled = index === 0;
        upButton.addEventListener('click', () => {
          if (index === 0) {
            return;
          }
          const [currentRule] = source.rules.splice(index, 1);
          source.rules.splice(index - 1, 0, currentRule);
          renderRules();
          renderImmediatePreview();
        });

        const downButton = this.hostDocument.createElement('button');
        downButton.type = 'button';
        downButton.className = BUTTON_CLASS;
        downButton.textContent = '下移';
        downButton.disabled = index >= source.rules.length - 1;
        downButton.addEventListener('click', () => {
          if (index >= source.rules.length - 1) {
            return;
          }
          const [currentRule] = source.rules.splice(index, 1);
          source.rules.splice(index + 1, 0, currentRule);
          renderRules();
          renderImmediatePreview();
        });

        const deleteButton = this.hostDocument.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = `${BUTTON_CLASS} ${GHOST_BUTTON_CLASS}`;
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => {
          source.rules.splice(index, 1);
          renderRules();
          renderImmediatePreview();
        });

        actions.append(toggleButton, copyButton, upButton, downButton, deleteButton);
        head.append(headInfo, actions);

        const grid = this.hostDocument.createElement('div');
        grid.className = 'th-ufb-rule-grid';

        const nameField = this.hostDocument.createElement('div');
        nameField.className = 'th-ufb-rule-field';
        const nameLabel = this.hostDocument.createElement('label');
        nameLabel.className = 'th-ufb-label';
        nameLabel.textContent = '名称';
        const nameInput = this.hostDocument.createElement('input');
        nameInput.className = 'th-ufb-input';
        nameInput.type = 'text';
        nameInput.value = rule.name;
        nameInput.addEventListener('input', () => {
          rule.name = String(nameInput.value ?? '');
          title.textContent = rule.name.trim() || `规则 ${index + 1}`;
          renderImmediatePreview();
        });
        nameField.append(nameLabel, nameInput);

        const modeField = this.hostDocument.createElement('div');
        modeField.className = 'th-ufb-rule-field';
        const modeFieldLabel = this.hostDocument.createElement('label');
        modeFieldLabel.className = 'th-ufb-label';
        modeFieldLabel.textContent = '模式';
        const modeSelect = this.hostDocument.createElement('select');
        modeSelect.className = 'th-ufb-select';
        for (const [value, label] of [
          ['extract_first', '提取首个'],
          ['extract_all', '提取全部'],
          ['replace', '替换'],
        ] as const) {
          const option = this.hostDocument.createElement('option');
          option.value = value;
          option.textContent = label;
          modeSelect.append(option);
        }
        modeSelect.value = rule.mode;
        modeSelect.addEventListener('change', () => {
          rule.mode = modeSelect.value as RegexRuleMode;
          meta.textContent = `${getRuleModeLabel(rule.mode)} · ${rule.enabled ? '已启用' : '已停用'}`;
          renderImmediatePreview();
        });
        modeField.append(modeFieldLabel, modeSelect);

        const flagsField = this.hostDocument.createElement('div');
        flagsField.className = 'th-ufb-rule-field';
        const flagsLabel = this.hostDocument.createElement('label');
        flagsLabel.className = 'th-ufb-label';
        flagsLabel.textContent = 'Flags';
        const flagsInput = this.hostDocument.createElement('input');
        flagsInput.className = 'th-ufb-input';
        flagsInput.type = 'text';
        flagsInput.placeholder = '例如：gi';
        flagsInput.value = rule.flags;
        flagsInput.addEventListener('input', () => {
          rule.flags = String(flagsInput.value ?? '');
          renderImmediatePreview();
        });
        flagsField.append(flagsLabel, flagsInput);

        const patternField = this.hostDocument.createElement('div');
        patternField.className = 'th-ufb-rule-field is-span-2';
        const patternLabel = this.hostDocument.createElement('label');
        patternLabel.className = 'th-ufb-label';
        patternLabel.textContent = '正则';
        const patternInput = this.hostDocument.createElement('textarea');
        patternInput.className = 'th-ufb-textarea';
        patternInput.placeholder = '输入正则表达式正文，不需要首尾 /';
        patternInput.value = rule.pattern;
        patternInput.addEventListener('input', () => {
          rule.pattern = String(patternInput.value ?? '');
          renderImmediatePreview();
        });
        patternField.append(patternLabel, patternInput);

        const replacementField = this.hostDocument.createElement('div');
        replacementField.className = 'th-ufb-rule-field is-span-2';
        const replacementLabel = this.hostDocument.createElement('label');
        replacementLabel.className = 'th-ufb-label';
        replacementLabel.textContent = 'Replacement';
        const replacementInput = this.hostDocument.createElement('textarea');
        replacementInput.className = 'th-ufb-textarea';
        replacementInput.placeholder = '可留空。提取模式留空时默认输出完整匹配。';
        replacementInput.value = rule.replacement;
        replacementInput.addEventListener('input', () => {
          rule.replacement = String(replacementInput.value ?? '');
          renderImmediatePreview();
        });
        replacementField.append(replacementLabel, replacementInput);

        grid.append(nameField, modeField, flagsField, patternField, replacementField);
        card.append(head, grid);
        ruleList.append(card);
      });
    };

    const syncFormFromCurrent = () => {
      ensureCurrentId();
      populateBallSelect();
      const current = getCurrentItem();
      if (!current) {
        return;
      }

      refreshModeButtons();
      customHint.style.display = current.contentSource.mode === 'message_rules' ? 'none' : 'block';
      messageSection.classList.toggle('is-hidden', current.contentSource.mode !== 'message_rules');

      if (current.contentSource.mode === 'message_rules') {
        const source = current.contentSource;
        targetInput.value = source.messageTarget;
        outputSelect.value = source.outputMode;
      } else {
        targetInput.value = DEFAULT_MESSAGE_TARGET;
        outputSelect.value = 'html';
      }

      renderRules();
      renderImmediatePreview();
    };

    currentBallSelect.addEventListener('change', () => {
      currentId = currentBallSelect.value;
      draft.activeId = currentId;
      syncFormFromCurrent();
    });

    customModeButton.addEventListener('click', () => {
      const current = getCurrentItem();
      if (!current) {
        return;
      }
      current.contentSource = { mode: 'custom_html' };
      syncFormFromCurrent();
    });

    messageModeButton.addEventListener('click', () => {
      const source = ensureMessageSource();
      if (!source) {
        return;
      }
      source.messageTarget = source.messageTarget || DEFAULT_MESSAGE_TARGET;
      syncFormFromCurrent();
    });

    targetInput.addEventListener('input', () => {
      const source = ensureMessageSource();
      if (!source) {
        return;
      }
      source.messageTarget = String(targetInput.value ?? '');
      renderImmediatePreview();
    });

    outputSelect.addEventListener('change', () => {
      const source = ensureMessageSource();
      if (!source) {
        return;
      }
      source.outputMode = outputSelect.value as FloatingBallOutputMode;
      renderImmediatePreview();
    });

    addRuleButton.addEventListener('click', () => {
      const source = ensureMessageSource();
      if (!source) {
        return;
      }
      source.rules.push(createRegexRule());
      renderRules();
      renderImmediatePreview();
    });

    const cancelButton = this.hostDocument.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = BUTTON_CLASS;
    cancelButton.textContent = '取消';
    cancelButton.addEventListener('click', modal.close);

    const saveButton = this.hostDocument.createElement('button');
    saveButton.type = 'button';
    saveButton.className = `${BUTTON_CLASS} ${PRIMARY_BUTTON_CLASS}`;
    saveButton.textContent = '保存';
    saveButton.addEventListener('click', () => {
      persistScriptData(draft);
      this.renderBalls();
      showToast('success', '消息来源与规则已保存');
      modal.close();
    });

    modal.footer?.append(cancelButton, saveButton);
    syncFormFromCurrent();
    currentBallSelect.focus();
  }

  private createPreviewModal(onCloseExtra?: () => void): OverlayHandle {
    this.closeCurrentModal();
    this.isPreviewManuallyResized = false;
    const modal = this.createOverlay({
      title: undefined,
      showFooter: false,
      showHeader: false,
      onCloseExtra: () => {
        onCloseExtra?.();
        this.isPreviewManuallyResized = false;
      },
    });
    modal.panel.classList.add(PREVIEW_PANEL_CLASS);
    return modal;
  }

  private attachIframePreviewControls(
    modal: OverlayHandle,
    iframe: HTMLIFrameElement,
    options: { enableBridgeSizing: boolean },
  ): () => void {
    let removeMessageListener: (() => void) | null = null;
    let removeResizeListener: (() => void) | null = null;
    let removeLoadListener: (() => void) | null = null;

    const previewHeaderHeight = () => modal.panel.querySelector(`.${PANEL_HEADER_CLASS}`)?.clientHeight ?? 0;
    const resizeHandle = this.hostDocument.createElement('div');
    resizeHandle.className = 'th-ufb-resize-handle';
    modal.panel.append(resizeHandle);

    if (options.enableBridgeSizing) {
      const resizeFromMessage = (event: MessageEvent<PreviewSizeMessage>) => {
        const payload = event.data;
        if (!payload || payload.__th_ufb !== SIZE_MESSAGE_FLAG) {
          return;
        }
        if (payload.scriptId !== SCRIPT_ID || event.source !== iframe.contentWindow || this.isPreviewManuallyResized) {
          return;
        }

        const iframeHeight = Number(payload.height);
        const iframeWidth = Number(payload.width);
        const pageViewportWidth = Number(payload.vw);
        const { width: hostWidth, height: hostHeight } = getViewportSize(this.hostWindow);
        const maxWidth = Math.min(PREVIEW_MAX_WIDTH, Math.max(320, Math.floor(hostWidth * 0.96)));
        const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, hostHeight - previewHeaderHeight() - 120);

        if (Number.isFinite(iframeWidth) && iframeWidth > 0) {
          const nextWidth = clamp(
            Math.round(Math.max(iframeWidth, Number.isFinite(pageViewportWidth) ? pageViewportWidth : 0)),
            PREVIEW_MIN_WIDTH,
            maxWidth,
          );
          const currentWidth = modal.panel.getBoundingClientRect().width || 0;
          if (nextWidth > currentWidth + 1) {
            modal.panel.style.width = `${nextWidth}px`;
          }
        }

        if (Number.isFinite(iframeHeight) && iframeHeight > 0) {
          iframe.style.height = `${clamp(Math.round(iframeHeight), PREVIEW_MIN_HEIGHT, maxHeight)}px`;
        }
      };
      this.hostWindow.addEventListener('message', resizeFromMessage);
      removeMessageListener = () => this.hostWindow.removeEventListener('message', resizeFromMessage);
    }

    const handleLoad = () => {
      try {
        const iframeDocument = iframe.contentDocument;
        if (!iframeDocument) {
          return;
        }

        const documentElement = iframeDocument.documentElement;
        const body = iframeDocument.body;
        const iframeWidth = Math.max(
          documentElement?.scrollWidth ?? 0,
          body?.scrollWidth ?? 0,
          documentElement?.offsetWidth ?? 0,
          body?.offsetWidth ?? 0,
          documentElement?.clientWidth ?? 0,
        );
        const iframeHeight = Math.max(
          documentElement?.scrollHeight ?? 0,
          body?.scrollHeight ?? 0,
          documentElement?.offsetHeight ?? 0,
          body?.offsetHeight ?? 0,
          documentElement?.clientHeight ?? 0,
        );

        const { width: hostWidth, height: hostHeight } = getViewportSize(this.hostWindow);
        const maxWidth = Math.min(PREVIEW_MAX_WIDTH, Math.max(320, Math.floor(hostWidth * 0.96)));
        const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, hostHeight - previewHeaderHeight() - 120);

        if (Number.isFinite(iframeWidth) && iframeWidth > 0) {
          const nextWidth = clamp(Math.round(Math.max(iframeWidth, documentElement?.clientWidth ?? 0)), PREVIEW_MIN_WIDTH, maxWidth);
          const currentWidth = modal.panel.getBoundingClientRect().width || 0;
          if (!this.isPreviewManuallyResized && nextWidth > currentWidth + 1) {
            modal.panel.style.width = `${nextWidth}px`;
          }
        }

        if (Number.isFinite(iframeHeight) && iframeHeight > 0 && !this.isPreviewManuallyResized) {
          iframe.style.height = `${clamp(Math.round(iframeHeight), PREVIEW_MIN_HEIGHT, maxHeight)}px`;
        }
      } catch (error) {
        if (options.enableBridgeSizing) {
          console.warn(`[${SCRIPT_NAME}] preview initial sizing failed`, error);
        }
      }
    };
    iframe.addEventListener('load', handleLoad);
    removeLoadListener = () => iframe.removeEventListener('load', handleLoad);

    let isResizing = false;
    let activePointerId = -1;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const handleResizeMove = (event: PointerEvent) => {
      if (!isResizing || event.pointerId !== activePointerId) {
        return;
      }

      this.isPreviewManuallyResized = true;
      const { width: hostWidth, height: hostHeight } = getViewportSize(this.hostWindow);
      const maxWidth = Math.min(PREVIEW_MAX_WIDTH, Math.max(320, Math.floor(hostWidth * 0.96)));
      const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, hostHeight - previewHeaderHeight() - 120);
      const nextWidth = clamp(Math.round(startWidth + event.clientX - startX), PREVIEW_MIN_WIDTH, maxWidth);
      const nextHeight = clamp(Math.round(startHeight + event.clientY - startY), PREVIEW_MIN_HEIGHT, maxHeight);
      modal.panel.style.width = `${nextWidth}px`;
      iframe.style.height = `${nextHeight}px`;
    };

    const handleResizeEnd = (event: PointerEvent) => {
      if (!isResizing || event.pointerId !== activePointerId) {
        return;
      }

      isResizing = false;
      activePointerId = -1;
      this.hostWindow.removeEventListener('pointermove', handleResizeMove);
      this.hostWindow.removeEventListener('pointerup', handleResizeEnd);
      this.hostWindow.removeEventListener('pointercancel', handleResizeEnd);
    };

    resizeHandle.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.isPreviewManuallyResized = true;
      isResizing = true;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startWidth = modal.panel.getBoundingClientRect().width || 0;
      startHeight = iframe.getBoundingClientRect().height || PREVIEW_MIN_HEIGHT;

      try {
        resizeHandle.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }

      this.hostWindow.addEventListener('pointermove', handleResizeMove);
      this.hostWindow.addEventListener('pointerup', handleResizeEnd);
      this.hostWindow.addEventListener('pointercancel', handleResizeEnd);
    });

    removeResizeListener = () => {
      this.hostWindow.removeEventListener('pointermove', handleResizeMove);
      this.hostWindow.removeEventListener('pointerup', handleResizeEnd);
      this.hostWindow.removeEventListener('pointercancel', handleResizeEnd);
    };

    return () => {
      removeMessageListener?.();
      removeMessageListener = null;
      removeResizeListener?.();
      removeResizeListener = null;
      removeLoadListener?.();
      removeLoadListener = null;
      resizeHandle.remove();
    };
  }

  private renderPreviewPlaceholder(target: HTMLElement, title: string, description: string): void {
    const card = this.hostDocument.createElement('div');
    card.className = 'th-ufb-preview-card';
    const placeholder = this.hostDocument.createElement('div');
    placeholder.className = 'th-ufb-preview-placeholder';
    const strong = this.hostDocument.createElement('strong');
    strong.textContent = title;
    const text = this.hostDocument.createElement('p');
    text.textContent = description;
    placeholder.append(strong, text);
    card.append(placeholder);
    target.append(card);
  }

  private openCustomHtmlPreview(item: FloatingBallItem): void {
    const previewHtml = injectPreviewBridge(item.webCode);
    if (!previewHtml) {
      showToast('info', `“${item.name}”还没有输入网页代码。`);
      return;
    }

    let cleanupIframeControls: (() => void) | null = null;
    const modal = this.createPreviewModal(() => {
      cleanupIframeControls?.();
      cleanupIframeControls = null;
    });

    const iframe = this.hostDocument.createElement('iframe');
    iframe.className = 'th-ufb-iframe';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('srcdoc', previewHtml);
    iframe.style.height = '60svh';
    const contentCard = this.hostDocument.createElement('div');
    contentCard.className = 'th-ufb-preview-card';
    contentCard.append(iframe);
    modal.body.append(contentCard);

    cleanupIframeControls = this.attachIframePreviewControls(modal, iframe, { enableBridgeSizing: true });
  }

  private renderDisplayedMessagePreview(messageId: number, target: HTMLElement): boolean {
    try {
      const $displayed = retrieveDisplayedMessage(messageId);
      if (!$displayed.length) {
        return false;
      }

      const $clone = $displayed.clone(true, true);
      const wrapper = this.hostDocument.createElement('div');
      wrapper.className = 'th-ufb-preview-rendered';
      wrapper.append($clone[0]);
      target.append(wrapper);
      return true;
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] renderDisplayedMessagePreview failed`, error);
      return false;
    }
  }

  private openMessageRulesPreview(item: FloatingBallItem): void {
    if (item.contentSource.mode !== 'message_rules') {
      return;
    }

    const result = executeMessageRules(item.contentSource);
    let cleanupIframeControls: (() => void) | null = null;
    const modal = this.createPreviewModal(() => {
      cleanupIframeControls?.();
      cleanupIframeControls = null;
    });

    const shell = this.hostDocument.createElement('div');
    shell.className = 'th-ufb-preview-shell';
    modal.body.append(shell);

    if (!result.ok) {
      this.renderPreviewPlaceholder(shell, '规则执行失败', result.error);
      return;
    }

    if (result.segments.length === 0) {
      this.renderPreviewPlaceholder(
        shell,
        '没有可预览的结果',
        result.warnings[0] ??
          `目标楼层 ${result.messageTarget} 没有产出可用于 ${getOutputModeLabel(item.contentSource.outputMode)} 预览的结果。`,
      );
      return;
    }

    const tabs = buildPreviewTabItems(item.contentSource.outputMode, result.segments);
    const enabledRules = item.contentSource.rules.filter(rule => rule.enabled);
    const activeKey = { value: tabs[0]?.key ?? '' };
    const contentCard = this.hostDocument.createElement('div');
    contentCard.className = 'th-ufb-preview-card';
    shell.append(contentCard);

    const renderActiveTab = () => {
      cleanupIframeControls?.();
      cleanupIframeControls = null;
      contentCard.replaceChildren();
      const activeTab = tabs.find(tab => tab.key === activeKey.value) ?? tabs[0];
      if (!activeTab) {
        this.renderPreviewPlaceholder(contentCard, '没有可预览的结果', '当前没有可用的预览页签。');
        return;
      }

      if (activeTab.kind === 'text') {
        const pre = this.hostDocument.createElement('pre');
        pre.className = 'th-ufb-preview-text';
        pre.textContent = activeTab.content;
        contentCard.append(pre);
        return;
      }

      if (activeTab.kind === 'error') {
        const placeholder = this.hostDocument.createElement('div');
        placeholder.className = 'th-ufb-preview-placeholder';
        const strong = this.hostDocument.createElement('strong');
        strong.textContent = activeTab.label;
        const text = this.hostDocument.createElement('p');
        text.textContent = activeTab.content;
        placeholder.append(strong, text);
        contentCard.append(placeholder);
        return;
      }

      if (activeTab.kind === 'html' && enabledRules.length === 0 && this.renderDisplayedMessagePreview(result.messageId, contentCard)) {
        return;
      }

      const iframe = this.hostDocument.createElement('iframe');
      iframe.className = 'th-ufb-iframe';
      iframe.setAttribute('frameborder', '0');
      iframe.style.height = '60svh';
      if (activeTab.kind === 'html') {
        iframe.setAttribute('srcdoc', enabledRules.length > 0 ? injectRulePreviewBridge(activeTab.content) : injectPreviewBridge(activeTab.content));
      } else {
        iframe.setAttribute('src', activeTab.content);
      }
      contentCard.append(iframe);
      cleanupIframeControls = this.attachIframePreviewControls(modal, iframe, {
        enableBridgeSizing: activeTab.kind === 'html',
      });
    };

    if (tabs.length > 1) {
      const tabsRow = this.hostDocument.createElement('div');
      tabsRow.className = 'th-ufb-preview-tabs';
      tabs.forEach(tab => {
        const button = this.hostDocument.createElement('button');
        button.type = 'button';
        button.className = `th-ufb-preview-tab${tab.key === activeKey.value ? ' is-active' : ''}`;
        button.textContent = tab.label;
        button.dataset.tabKey = tab.key;
        button.addEventListener('click', () => {
          activeKey.value = tab.key;
          for (const currentButton of tabsRow.querySelectorAll<HTMLButtonElement>('.th-ufb-preview-tab')) {
            currentButton.classList.toggle('is-active', currentButton.dataset.tabKey === tab.key);
          }
          renderActiveTab();
        });
        tabsRow.append(button);
      });
      shell.prepend(tabsRow);
    }

    renderActiveTab();
  }

  private openPreview(ballId: string): void {
    const data = readScriptData();
    const item = data.items[ballId];
    if (!item) {
      showToast('warning', '未找到对应的悬浮球配置');
      return;
    }

    if (item.contentSource.mode === 'message_rules') {
      this.openMessageRulesPreview(item);
      return;
    }
    this.openCustomHtmlPreview(item);
  }
}

function runOnReady(handler: () => void): void {
  if (typeof $ === 'function') {
    $(() => handler());
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handler, { once: true });
    return;
  }
  handler();
}

runOnReady(() => {
  const app = new UniversalFloatingBallApp();
  void app.init().catch(error => {
    console.error(`[${SCRIPT_NAME}] init failed`, error);
    showToast('error', `${SCRIPT_NAME}初始化失败：${error instanceof Error ? error.message : String(error)}`);
  });

  if (typeof $ === 'function') {
    $(window).on('pagehide', () => app.destroy());
  } else {
    window.addEventListener('pagehide', () => app.destroy(), { once: true });
  }
});
