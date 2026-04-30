<template>
  <div class="ufb-app">
    <header class="ufb-topbar">
      <div>
        <p class="ufb-topbar__eyebrow">通用悬浮球</p>
        <p class="ufb-topbar__status" :class="{ 'is-dirty': dirty }">
          <span class="ufb-status-dot" />
          {{ dirty ? '有未保存改动' : '已保存' }} · {{ statusMessage }}
        </p>
      </div>
      <div class="ufb-topbar__actions">
        <button class="ufb-icon-btn ufb-icon-btn--ghost" type="button" title="重载" aria-label="重载" @click="reloadDraft">↻</button>
        <button class="ufb-icon-btn ufb-icon-btn--primary" type="button" :title="dirty ? '保存变更' : '重新保存'" :aria-label="dirty ? '保存变更' : '重新保存'" @click="saveAll">✓</button>
        <button class="ufb-icon-btn ufb-icon-btn--danger" type="button" title="关闭" aria-label="关闭" @click="props.onClose">✕</button>
      </div>
    </header>

    <div class="ufb-layout">
      <aside class="ufb-sidebar">
        <button
          v-for="entry in navEntries"
          :key="entry.id"
          class="ufb-nav"
          :class="{ 'is-active': currentView === entry.id }"
          type="button"
          @click="currentView = entry.id"
        >
          <span class="ufb-nav__title">{{ entry.title }}</span>
        </button>
      </aside>

      <main class="ufb-main">
        <section v-if="currentView === 'content'" class="ufb-section">
          <div class="ufb-section__head ufb-section__head--toolbar">
            <select v-model="currentId" class="ufb-input ufb-toolbar-select">
              <option v-for="item in orderedItems" :key="item.id" :value="item.id">
                {{ formatBallOptionLabel(item) }}
              </option>
            </select>
            <div class="ufb-inline-actions">
              <button class="ufb-btn ufb-btn--primary" type="button" @click="addBall">新建</button>
              <button class="ufb-btn ufb-btn--danger" type="button" :disabled="orderedItems.length <= 1" @click="deleteCurrentBall">
                删除当前
              </button>
            </div>
          </div>

          <div v-if="currentItem" class="ufb-form">
            <label class="ufb-field">
              <span>名称</span>
              <input :value="currentItem.name" type="text" class="ufb-input" placeholder="悬浮球名称" @input="updateCurrentName(($event.target as HTMLInputElement).value)" />
            </label>

            <div class="ufb-field">
              <span>启用</span>
              <button
                class="ufb-switch"
                :class="{ 'is-on': currentItem.status === 'active' }"
                type="button"
                :aria-pressed="currentItem.status === 'active'"
                @click="updateCurrentEnabled(currentItem.status !== 'active')"
              >
                <span class="ufb-switch__track">
                  <span class="ufb-switch__thumb" />
                </span>
                <span class="ufb-switch__text">{{ currentItem.status === 'active' ? '启用' : '停用' }}</span>
              </button>
            </div>

            <label class="ufb-field ufb-field--stack">
              <span>网页代码</span>
              <textarea
                :value="currentItem.webCode"
                class="ufb-textarea ufb-textarea--grow"
                placeholder="输入 HTML"
                @input="updateCurrentWebCode(($event.target as HTMLTextAreaElement).value)"
              />
            </label>
          </div>
        </section>

        <section v-else-if="currentView === 'appearance'" class="ufb-section">
          <div v-if="currentItem" class="ufb-form">
            <label class="ufb-field">
              <span>当前悬浮球</span>
              <select v-model="currentId" class="ufb-input">
                <option v-for="item in orderedItems" :key="item.id" :value="item.id">
                  {{ formatBallOptionLabel(item) }}
                </option>
              </select>
            </label>

            <label class="ufb-field">
              <span>大小</span>
              <div class="ufb-range-row">
                <input
                  :value="currentItem.floatingBall.size"
                  class="ufb-range"
                  type="range"
                  :min="props.api.ballMinSize"
                  :max="props.api.ballMaxSize"
                  step="1"
                  @input="updateCurrentSize(($event.target as HTMLInputElement).value)"
                />
                <input
                  :value="currentItem.floatingBall.size"
                  class="ufb-input ufb-input--small"
                  type="number"
                  :min="props.api.ballMinSize"
                  :max="props.api.ballMaxSize"
                  step="1"
                  @input="updateCurrentSize(($event.target as HTMLInputElement).value)"
                />
              </div>
            </label>

            <label class="ufb-field">
              <span>文字</span>
              <input
                :value="currentItem.floatingBall.text"
                type="text"
                class="ufb-input"
                placeholder="可留空"
                @input="updateCurrentText(($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="ufb-field">
              <span>图标</span>
              <input
                :value="currentItem.floatingBall.icon"
                type="text"
                class="ufb-input"
                placeholder="可留空"
                @input="updateCurrentIcon(($event.target as HTMLInputElement).value)"
              />
            </label>

            <div class="ufb-field">
              <span>图标预设</span>
              <div class="ufb-presets">
                <button
                  v-for="icon in props.api.defaultIconPresets"
                  :key="icon"
                  class="ufb-chip"
                  :class="{ 'is-active': currentItem.floatingBall.icon === icon }"
                  type="button"
                  @click="updateCurrentIcon(icon)"
                >
                  {{ icon }}
                </button>
              </div>
            </div>

            <label class="ufb-field">
              <span>颜色</span>
              <div class="ufb-color-row">
                <input :value="currentItem.floatingBall.color" class="ufb-color" type="color" @input="updateCurrentColor(($event.target as HTMLInputElement).value)" />
                <input
                  :value="currentItem.floatingBall.color"
                  type="text"
                  class="ufb-input"
                  :placeholder="props.api.ballDefaultColor"
                  @input="updateCurrentColor(($event.target as HTMLInputElement).value)"
                />
              </div>
            </label>

            <div class="ufb-field">
              <span>颜色预设</span>
              <div class="ufb-presets">
                <button
                  v-for="color in props.api.defaultColorPresets"
                  :key="color"
                  class="ufb-chip ufb-chip--color"
                  :class="{ 'is-active': currentItem.floatingBall.color?.toLowerCase() === color.toLowerCase() }"
                  :style="{ '--chip-color': color }"
                  type="button"
                  @click="updateCurrentColor(color)"
                />
              </div>
            </div>

            <div class="ufb-field">
              <span>位置</span>
              <div class="ufb-inline-actions">
                <button class="ufb-btn" type="button" @click="resetCurrentPosition">重置</button>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="currentView === 'rules'" class="ufb-section ufb-section--rules">
          <div class="ufb-rules">
            <div class="ufb-rules__main">
              <label class="ufb-field">
                <span>当前悬浮球</span>
                <select v-model="currentId" class="ufb-input">
                  <option v-for="item in orderedItems" :key="item.id" :value="item.id">
                    {{ formatBallOptionLabel(item) }}
                  </option>
                </select>
              </label>

              <div v-if="currentItem" class="ufb-field">
                <span>来源模式</span>
                <div class="ufb-inline-actions">
                  <button
                    class="ufb-btn"
                    :class="{ 'ufb-btn--primary': currentItem.contentSource.mode === 'custom_html' }"
                    type="button"
                    @click="switchToCustomHtml"
                  >
                    自定义网页
                  </button>
                  <button
                    class="ufb-btn"
                    :class="{ 'ufb-btn--primary': currentItem.contentSource.mode === 'message_rules' }"
                    type="button"
                    @click="switchToMessageRules"
                  >
                    消息层规则
                  </button>
                </div>
              </div>

              <template v-if="messageSource">
                <label class="ufb-field">
                  <span>目标楼层</span>
                  <input
                    :value="messageSource.messageTarget"
                    type="text"
                    class="ufb-input"
                    :placeholder="props.api.defaultMessageTarget"
                    @input="updateMessageTarget(($event.target as HTMLInputElement).value)"
                  />
                </label>

                <div class="ufb-inline-actions">
                  <button class="ufb-btn ufb-btn--primary" type="button" @click="addRule">
                    新增规则
                  </button>
                </div>
                <div class="ufb-import-panel">
                  <div class="ufb-inline-actions">
                    <button class="ufb-btn" type="button" :disabled="tavernRegexOptions.length === 0" @click="selectAllTavernRegexes">全选</button>
                    <button class="ufb-btn" type="button" :disabled="selectedTavernRegexIds.length === 0" @click="clearSelectedTavernRegexes">清空</button>
                    <button class="ufb-btn" type="button" :disabled="selectedTavernRegexIds.length === 0" @click="importTavernRegex">
                      导入 {{ selectedTavernRegexIds.length || '' }}
                    </button>
                  </div>
                  <div v-if="tavernRegexOptions.length === 0" class="ufb-empty">
                    没有可导入的酒馆正则
                  </div>
                  <div v-else class="ufb-import-groups">
                    <section v-for="group in groupedTavernRegexOptions" :key="group.scope" class="ufb-import-group">
                      <button class="ufb-import-group__head" type="button" @click="toggleImportGroupCollapsed(group.scope)">
                        <span class="ufb-import-group__title">{{ group.title }}</span>
                        <span class="ufb-import-group__toggle">{{ isImportGroupCollapsed(group.scope) ? '展开' : '收起' }}</span>
                      </button>
                      <div v-if="!isImportGroupCollapsed(group.scope)" class="ufb-check-list">
                        <label v-for="regex in group.items" :key="regex.id" class="ufb-check-item">
                          <input
                            type="checkbox"
                            :checked="isTavernRegexSelected(regex.id)"
                            @change="toggleTavernRegexSelection(regex.id)"
                          />
                          <span>{{ regex.label }}</span>
                        </label>
                      </div>
                    </section>
                  </div>
                </div>

                <div v-if="messageSource.rules.length === 0" class="ufb-empty">
                  暂无规则
                </div>

                <div
                  v-for="(rule, index) in messageSource.rules"
                  :key="rule.id"
                  class="ufb-rule"
                  :class="{ 'is-disabled': !rule.enabled, 'is-collapsed': isRuleCollapsed(rule.id) }"
                >
                  <div class="ufb-rule__head" :class="{ 'is-collapsed': isRuleCollapsed(rule.id) }">
                    <div class="ufb-rule__summary">
                      <div class="ufb-rule__title">{{ rule.name?.trim() || `规则 ${Number(index) + 1}` }}</div>
                      <div v-if="!isRuleCollapsed(rule.id)" class="ufb-rule__meta">{{ props.api.getRuleModeLabel(rule.mode) }} · {{ rule.enabled ? '已启用' : '已停用' }}</div>
                    </div>
                    <div class="ufb-inline-actions">
                      <button class="ufb-btn" type="button" @click="toggleRuleCollapsed(rule.id)">{{ isRuleCollapsed(rule.id) ? '展开' : '收起' }}</button>
                      <template v-if="!isRuleCollapsed(rule.id)">
                        <button class="ufb-btn" type="button" @click="toggleRuleEnabled(Number(index))">{{ rule.enabled ? '停用' : '启用' }}</button>
                        <button class="ufb-btn" type="button" :disabled="Number(index) === 0" @click="moveRule(Number(index), -1)">上移</button>
                        <button class="ufb-btn" type="button" :disabled="Number(index) >= messageSource.rules.length - 1" @click="moveRule(Number(index), 1)">下移</button>
                        <button class="ufb-btn ufb-btn--danger" type="button" @click="removeRule(Number(index))">删除</button>
                      </template>
                    </div>
                  </div>

                  <div v-if="!isRuleCollapsed(rule.id)" class="ufb-grid">
                    <label class="ufb-field">
                      <span>名称</span>
                      <input :value="rule.name" type="text" class="ufb-input" @input="updateRuleField(Number(index), 'name', ($event.target as HTMLInputElement).value)" />
                    </label>

                    <label class="ufb-field">
                      <span>模式</span>
                      <select :value="rule.mode" class="ufb-input" @change="updateRuleField(Number(index), 'mode', ($event.target as HTMLSelectElement).value)">
                        <option value="extract_first">提取首个</option>
                        <option value="extract_all">提取全部</option>
                        <option value="replace">替换</option>
                      </select>
                    </label>

                    <label class="ufb-field">
                      <span>Flags</span>
                      <input :value="rule.flags" type="text" class="ufb-input" placeholder="gi" @input="updateRuleField(Number(index), 'flags', ($event.target as HTMLInputElement).value)" />
                    </label>

                    <label class="ufb-field ufb-field--span">
                      <span>正则</span>
                      <textarea
                        :value="rule.pattern"
                        class="ufb-textarea"
                        placeholder="输入正则"
                        @input="updateRuleField(Number(index), 'pattern', ($event.target as HTMLTextAreaElement).value)"
                      />
                    </label>

                    <label class="ufb-field ufb-field--span">
                      <span>Replacement</span>
                      <textarea
                        :value="rule.replacement"
                        class="ufb-textarea"
                        placeholder="可留空"
                        @input="updateRuleField(Number(index), 'replacement', ($event.target as HTMLTextAreaElement).value)"
                      />
                    </label>
                  </div>
                </div>
              </template>
            </div>

            <div class="ufb-rules__preview">
              <div class="ufb-rules__preview-head">即时预览结果</div>
              <div class="ufb-rules__preview-body">
                <template v-if="previewState.kind === 'placeholder'">
                  <div class="ufb-placeholder">
                    <strong>{{ previewState.title }}</strong>
                    <p>{{ previewState.description }}</p>
                  </div>
                </template>

                <template v-else>
                  <div class="ufb-segment">
                    <div class="ufb-segment__title">{{ previewState.summary }}</div>
                    <div v-if="previewState.warning" class="ufb-segment__meta">{{ previewState.warning }}</div>
                  </div>
                  <div class="ufb-segment-list">
                    <div v-for="segment in previewState.segments" :key="segment.key" class="ufb-segment">
                      <div class="ufb-segment__title">{{ segment.title }}</div>
                      <div class="ufb-segment__meta">{{ segment.meta }}</div>
                      <pre>{{ segment.content }}</pre>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watchEffect } from 'vue';

type ManagerApi = {
  readData: () => any;
  saveData: (data: any) => any;
  renderBalls: () => void;
  showToast: (level: string, message: string) => void;
  getOrderedItems: (data: any) => any[];
  getNextBallName: (data: any) => string;
  getStatusLabel: (status: string) => string;
  getOutputModeLabel: (mode: string) => string;
  getRuleModeLabel: (mode: string) => string;
  createBallItem: (partial?: any) => any;
  createRegexRule: (partial?: any) => any;
  listTavernRegexTemplates: () => any[];
  createRuleFromTavernRegex: (id: string) => any | null;
  executeMessageRules: (contentSource: any) => any;
  parsePreviewUrl: (value: string) => { ok: boolean; value?: string; error?: string };
  defaultMessageTarget: string;
  defaultIconPresets: string[];
  defaultColorPresets: string[];
  ballMinSize: number;
  ballMaxSize: number;
  ballDefaultColor: string;
};

const props = defineProps<{
  api: ManagerApi;
  onClose: () => void;
}>();

const navEntries = [
  { id: 'content', title: '网页代码' },
  { id: 'appearance', title: '悬浮球设置' },
  { id: 'rules', title: '消息来源与规则' },
] as const;

function cloneDraft<T>(value: T): T {
  const rawValue = typeof value === 'object' && value !== null ? toRaw(value) : value;
  if (typeof structuredClone === 'function') {
    return structuredClone(rawValue);
  }
  return JSON.parse(JSON.stringify(rawValue)) as T;
}

const currentView = ref<(typeof navEntries)[number]['id']>('content');
const draft = ref(cloneDraft(props.api.readData()));
const currentId = ref<string>(draft.value.activeId || draft.value.order?.[0] || '');
const dirty = ref(false);
const statusMessage = ref('已加载当前悬浮球配置');

const orderedItems = computed(() => props.api.getOrderedItems(draft.value));
const currentItem = computed<any | null>(() => draft.value.items?.[currentId.value] ?? null);

function setDirty(message: string) {
  dirty.value = true;
  statusMessage.value = message;
}

function setClean(message: string) {
  dirty.value = false;
  statusMessage.value = message;
}

function withCurrentItem(mutator: (item: any) => void, message = '已修改当前悬浮球配置，记得保存') {
  if (!currentItem.value) {
    return;
  }
  mutator(currentItem.value);
  setDirty(message);
}

function syncCurrentId() {
  if (draft.value.order?.includes(currentId.value)) {
    draft.value.activeId = currentId.value;
    return;
  }
  currentId.value = draft.value.order?.[0] ?? '';
  draft.value.activeId = currentId.value;
}

function reloadDraft() {
  draft.value = cloneDraft(props.api.readData());
  currentId.value = draft.value.activeId || draft.value.order?.[0] || '';
  syncCurrentId();
  setClean('已重载当前悬浮球配置');
  props.api.showToast('info', '已重载当前悬浮球配置');
}

function saveAll() {
  try {
    syncCurrentId();
    const normalized = props.api.saveData(cloneDraft(draft.value));
    draft.value = cloneDraft(normalized);
    currentId.value = draft.value.activeId || draft.value.order?.[0] || '';
    props.api.renderBalls();
    setClean('已保存并刷新悬浮球');
    props.api.showToast('success', '悬浮球管理已保存');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusMessage.value = `保存失败：${message}`;
    props.api.showToast('error', `悬浮球保存失败：${message}`);
  }
}

function addBall() {
  const item = props.api.createBallItem({
    name: props.api.getNextBallName(draft.value),
    status: 'active',
  });
  draft.value.items[item.id] = item;
  draft.value.order.push(item.id);
  currentId.value = item.id;
  syncCurrentId();
  setDirty(`已新增 ${item.name || '悬浮球'}，记得保存`);
}

function deleteCurrentBall() {
  if (draft.value.order.length <= 1 || !currentItem.value) {
    props.api.showToast('warning', '至少保留一个悬浮球');
    return;
  }
  const deleteIndex = draft.value.order.findIndex((id: string) => id === currentId.value);
  delete draft.value.items[currentId.value];
  draft.value.order = draft.value.order.filter((id: string) => id !== currentId.value);
  currentId.value = draft.value.order[Math.min(deleteIndex, draft.value.order.length - 1)] ?? '';
  syncCurrentId();
  setDirty('已删除当前悬浮球，记得保存');
}

function resetCurrentPosition() {
  withCurrentItem(item => {
    item.floatingBall.left = -1;
    item.floatingBall.top = -1;
  }, '已重置悬浮球位置，记得保存');
  props.api.showToast('info', '当前悬浮球位置会在保存后自动重新排布');
}

function ensureMessageSource(item: any) {
  if (!item) return null;
  if (item.contentSource?.mode !== 'message_rules') {
    item.contentSource = {
      mode: 'message_rules',
      messageTarget: props.api.defaultMessageTarget,
      outputMode: 'html',
      rules: [],
    };
  } else {
    item.contentSource.outputMode = 'html';
  }
  return item.contentSource;
}

function withMessageSource(mutator: (source: any) => void, message = '已修改规则链，记得保存') {
  const source = messageSource.value;
  if (!source) {
    return;
  }
  mutator(source);
  setDirty(message);
}

function normalizeSize(value: string | number): number {
  const fallback = currentItem.value?.floatingBall?.size ?? props.api.ballMinSize;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(props.api.ballMaxSize, Math.max(props.api.ballMinSize, Math.round(parsed)));
}

function updateCurrentName(value: string) {
  withCurrentItem(item => {
    item.name = value;
  }, '已修改悬浮球名称，记得保存');
}

function updateCurrentStatus(value: string) {
  withCurrentItem(item => {
    item.status = value;
  }, `已切换状态为 ${props.api.getStatusLabel(value)}`);
}

function updateCurrentEnabled(enabled: boolean) {
  updateCurrentStatus(enabled ? 'active' : 'hidden');
  saveAll();
}

function updateCurrentWebCode(value: string) {
  withCurrentItem(item => {
    item.webCode = value;
  }, '已修改网页代码，记得保存');
}

function updateCurrentSize(value: string | number) {
  withCurrentItem(item => {
    item.floatingBall.size = normalizeSize(value);
  }, '已修改悬浮球大小，记得保存');
}

function updateCurrentText(value: string) {
  withCurrentItem(item => {
    item.floatingBall.text = value;
  }, '已修改悬浮球文字，记得保存');
}

function updateCurrentIcon(value: string) {
  withCurrentItem(item => {
    item.floatingBall.icon = value;
  }, '已修改悬浮球图标，记得保存');
}

function updateCurrentColor(value: string) {
  withCurrentItem(item => {
    item.floatingBall.color = value;
  }, '已修改悬浮球颜色，记得保存');
}

function formatBallOptionLabel(item: any) {
  return `${item.name?.trim() || '未命名悬浮球'} · ${props.api.getStatusLabel(item.status)}`;
}

function switchToCustomHtml() {
  withCurrentItem(item => {
    item.contentSource = { mode: 'custom_html' };
  }, '已切换为自定义网页模式，记得保存');
}

function switchToMessageRules() {
  withCurrentItem(item => {
    ensureMessageSource(item);
  }, '已切换为消息层规则模式，记得保存');
}

const messageSource = computed(() => {
  if (!currentItem.value || currentItem.value.contentSource?.mode !== 'message_rules') {
    return null;
  }
  if (currentItem.value.contentSource.outputMode !== 'html') {
    currentItem.value.contentSource.outputMode = 'html';
  }
  return currentItem.value.contentSource;
});

const tavernRegexOptions = computed(() => props.api.listTavernRegexTemplates());
const selectedTavernRegexIds = ref<string[]>([]);
const collapsedRuleIds = ref<string[]>([]);
const collapsedImportGroupScopes = ref<string[]>([]);
const tavernRegexScopeOrder = ['character', 'preset', 'global'] as const;

const groupedTavernRegexOptions = computed(() =>
  tavernRegexScopeOrder
    .map(scope => ({
      scope,
      title: scope === 'character' ? '局部正则' : scope === 'preset' ? '预设正则' : '全局正则',
      items: tavernRegexOptions.value.filter(option => option.scope === scope),
    }))
    .filter(group => group.items.length > 0),
);

watchEffect(() => {
  const validIds = new Set(tavernRegexOptions.value.map(option => option.id));
  const nextSelectedIds = selectedTavernRegexIds.value.filter(id => validIds.has(id));
  if (nextSelectedIds.length !== selectedTavernRegexIds.value.length) {
    selectedTavernRegexIds.value = nextSelectedIds;
  }
});

watchEffect(() => {
  const validRuleIds = new Set((messageSource.value?.rules ?? []).map((rule: any) => rule.id));
  const nextCollapsedIds = collapsedRuleIds.value.filter(id => validRuleIds.has(id));
  if (nextCollapsedIds.length !== collapsedRuleIds.value.length) {
    collapsedRuleIds.value = nextCollapsedIds;
  }
});

watchEffect(() => {
  const validScopes = new Set(groupedTavernRegexOptions.value.map(group => group.scope));
  const nextCollapsedScopes = collapsedImportGroupScopes.value.filter(scope => validScopes.has(scope));
  if (nextCollapsedScopes.length !== collapsedImportGroupScopes.value.length) {
    collapsedImportGroupScopes.value = nextCollapsedScopes;
  }
});

function updateMessageTarget(value: string) {
  withMessageSource(source => {
    source.messageTarget = value;
  }, '已修改目标楼层，记得保存');
}

function addRule() {
  withMessageSource(source => {
    source.rules.push(props.api.createRegexRule());
  }, '已新增规则，记得保存');
}

function importTavernRegex() {
  if (selectedTavernRegexIds.value.length === 0) {
    props.api.showToast('warning', '没有可导入的酒馆正则');
    return;
  }

  const rules = selectedTavernRegexIds.value
    .map(id => props.api.createRuleFromTavernRegex(id))
    .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));

  if (rules.length === 0) {
    props.api.showToast('error', '导入酒馆正则失败');
    return;
  }

  withMessageSource(source => {
    source.rules.push(...rules);
  }, `已导入 ${rules.length} 条酒馆正则`);
  collapsedRuleIds.value = Array.from(new Set([...collapsedRuleIds.value, ...rules.map(rule => rule.id)]));
  props.api.showToast('success', `已导入 ${rules.length} 条酒馆正则`);
}

function isTavernRegexSelected(id: string) {
  return selectedTavernRegexIds.value.includes(id);
}

function toggleTavernRegexSelection(id: string) {
  if (isTavernRegexSelected(id)) {
    selectedTavernRegexIds.value = selectedTavernRegexIds.value.filter(currentId => currentId !== id);
    return;
  }
  selectedTavernRegexIds.value = [...selectedTavernRegexIds.value, id];
}

function selectAllTavernRegexes() {
  selectedTavernRegexIds.value = tavernRegexOptions.value.map(option => option.id);
}

function clearSelectedTavernRegexes() {
  selectedTavernRegexIds.value = [];
}

function isImportGroupCollapsed(scope: string) {
  return collapsedImportGroupScopes.value.includes(scope);
}

function toggleImportGroupCollapsed(scope: string) {
  if (isImportGroupCollapsed(scope)) {
    collapsedImportGroupScopes.value = collapsedImportGroupScopes.value.filter(currentScope => currentScope !== scope);
    return;
  }
  collapsedImportGroupScopes.value = [...collapsedImportGroupScopes.value, scope];
}

function isRuleCollapsed(ruleId: string) {
  return collapsedRuleIds.value.includes(ruleId);
}

function toggleRuleCollapsed(ruleId: string) {
  if (isRuleCollapsed(ruleId)) {
    collapsedRuleIds.value = collapsedRuleIds.value.filter(id => id !== ruleId);
    return;
  }
  collapsedRuleIds.value = [...collapsedRuleIds.value, ruleId];
}

function moveRule(index: number, offset: number) {
  withMessageSource(source => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= source.rules.length) return;
    const [rule] = source.rules.splice(index, 1);
    source.rules.splice(nextIndex, 0, rule);
  }, '已调整规则顺序，记得保存');
}

function removeRule(index: number) {
  withMessageSource(source => {
    source.rules.splice(index, 1);
  }, '已删除规则，记得保存');
}

function toggleRuleEnabled(index: number) {
  withMessageSource(source => {
    const rule = source.rules[index];
    if (!rule) return;
    rule.enabled = !rule.enabled;
  }, '已切换规则启用状态，记得保存');
}

function updateRuleField(index: number, key: 'name' | 'mode' | 'flags' | 'pattern' | 'replacement', value: string) {
  withMessageSource(source => {
    const rule = source.rules[index];
    if (!rule) return;
    rule[key] = value;
  }, '已修改规则内容，记得保存');
}

const previewState = computed(() => {
  const item = currentItem.value;
  if (!item) {
    return {
      kind: 'placeholder' as const,
      title: '未找到悬浮球',
      description: '没有可编辑项',
    };
  }

  if (item.contentSource?.mode !== 'message_rules') {
    return {
      kind: 'placeholder' as const,
      title: '当前为自定义网页',
      description: item.webCode?.trim() ? '规则预览已隐藏' : '未配置网页代码',
    };
  }

  const result = props.api.executeMessageRules(item.contentSource);
  if (!result.ok) {
    return {
      kind: 'placeholder' as const,
      title: '规则执行失败',
      description: result.error,
    };
  }

  if (!result.segments.length) {
    return {
      kind: 'placeholder' as const,
      title: '没有可预览的结果',
      description: result.warnings?.[0] ?? '暂无结果',
    };
  }

  return {
    kind: 'segments' as const,
    summary: `目标楼层 ${result.messageTarget} · 消息 ID ${result.messageId} · ${result.segments.length} 段结果`,
    warning: result.warnings?.[0] ?? '',
    segments: result.segments.map((segment: string, index: number) => {
      return {
        key: `${index}-${segment.slice(0, 16)}`,
        title: `片段 ${index + 1}`,
        meta: `${segment.length} 个字符`,
        content: segment.length > 1200 ? `${segment.slice(0, 1200)}…` : segment,
      };
    }),
  };
});
</script>

<style scoped>
.ufb-app{
  height:100vh;
  display:flex;
  flex-direction:column;
  color:#f8fafc;
  background:
    radial-gradient(circle at top left, rgba(43, 108, 176, 0.35), transparent 32%),
    radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.25), transparent 28%),
    linear-gradient(180deg, #09111f 0%, #0f172a 100%);
  font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
}
.ufb-topbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:20px 24px 16px;
  border-bottom:1px solid rgba(255,255,255,0.08);
}
.ufb-topbar__status{
  display:flex;
  align-items:center;
  gap:8px;
  margin:10px 0 0;
  font-size:13px;
  color:#bfdbfe;
}
.ufb-topbar__status.is-dirty{
  color:#fde68a;
}
.ufb-topbar__eyebrow{
  margin:0;
  font-size:12px;
  letter-spacing:0.14em;
  text-transform:uppercase;
  color:#93c5fd;
}
.ufb-status-dot{
  width:8px;
  height:8px;
  border-radius:999px;
  background:currentColor;
  opacity:0.9;
}
.ufb-topbar__actions{
  display:flex;
  align-items:center;
  gap:10px;
}
.ufb-icon-btn{
  width:42px;
  height:42px;
  border:none;
  border-radius:14px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  font-size:20px;
  line-height:1;
  color:#e2e8f0;
  background:rgba(255,255,255,0.08);
}
.ufb-icon-btn--ghost{
  background:transparent;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);
}
.ufb-icon-btn--primary{
  color:#eff6ff;
  background:linear-gradient(135deg, #2563eb, #0f766e);
}
.ufb-icon-btn--danger{
  color:#fff;
  background:rgba(239,68,68,0.24);
}
.ufb-layout{
  flex:1 1 auto;
  min-height:0;
  display:grid;
  grid-template-columns:240px minmax(0, 1fr);
}
.ufb-sidebar{
  padding:20px 16px;
  border-right:1px solid rgba(255,255,255,0.08);
  display:flex;
  flex-direction:column;
  gap:10px;
}
.ufb-nav{
  border:none;
  border-radius:16px;
  padding:14px 16px;
  text-align:left;
  cursor:pointer;
  color:#e2e8f0;
  background:rgba(255,255,255,0.04);
}
.ufb-nav.is-active{
  background:linear-gradient(135deg, rgba(37,99,235,0.42), rgba(20,184,166,0.32));
  box-shadow:inset 0 0 0 1px rgba(147,197,253,0.35);
}
.ufb-nav__title{
  display:block;
  font-size:14px;
  font-weight:700;
}
.ufb-nav__desc{
  display:block;
  margin-top:6px;
  font-size:12px;
  line-height:1.5;
  color:#bfd3ea;
}
.ufb-main{
  min-width:0;
  min-height:0;
  overflow:auto;
  padding:24px;
}
.ufb-section{
  display:flex;
  flex-direction:column;
  gap:18px;
}
.ufb-section--rules{
  min-height:0;
}
.ufb-section__head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
}
.ufb-section__head--toolbar{
  flex-wrap:wrap;
}
.ufb-split{
  display:grid;
  grid-template-columns:280px minmax(0, 1fr);
  gap:16px;
  min-height:0;
}
.ufb-ball-list,
.ufb-form,
.ufb-rules__main,
.ufb-rules__preview{
  border-radius:22px;
  background:rgba(255,255,255,0.04);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.05);
}
.ufb-ball-list{
  padding:14px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
.ufb-ball-item{
  width:100%;
  border:none;
  border-radius:16px;
  padding:14px;
  text-align:left;
  cursor:pointer;
  color:#e2e8f0;
  background:rgba(255,255,255,0.03);
}
.ufb-ball-item.is-active{
  background:rgba(59,130,246,0.22);
  box-shadow:inset 0 0 0 1px rgba(147,197,253,0.32);
}
.ufb-ball-item__title{
  font-size:14px;
  font-weight:700;
}
.ufb-ball-item__meta{
  margin-top:8px;
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  font-size:12px;
  color:#bfd3ea;
}
.ufb-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:52px;
  height:24px;
  padding:0 10px;
  border-radius:999px;
  color:#f8fafc;
  background:rgba(255,255,255,0.12);
}
.ufb-form,
.ufb-rules__main{
  padding:18px;
  display:flex;
  flex-direction:column;
  gap:14px;
}
.ufb-field{
  display:grid;
  grid-template-columns:120px minmax(0, 1fr);
  align-items:center;
  gap:12px;
}
.ufb-field span{
  font-size:13px;
  font-weight:700;
  color:#dbeafe;
}
.ufb-field > :not(span){
  min-width:0;
}
.ufb-field--stack{
  grid-template-columns:minmax(0, 1fr);
  align-items:stretch;
}
.ufb-input,
.ufb-textarea,
.ufb-range{
  width:100%;
  box-sizing:border-box;
}
.ufb-input,
.ufb-textarea{
  border:none;
  border-radius:14px;
  padding:12px 14px;
  color:#f8fafc;
  background:rgba(2,6,23,0.6);
  outline:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.06);
}
.ufb-textarea{
  min-height:108px;
  resize:vertical;
}
.ufb-textarea--grow{
  min-height:320px;
}
.ufb-input--small{
  width:96px;
}
.ufb-toolbar-select{
  flex:1 1 320px;
  max-width:520px;
}
.ufb-inline-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.ufb-switch{
  display:inline-flex;
  align-items:center;
  gap:12px;
  min-height:40px;
  cursor:pointer;
}
.ufb-switch input{
  position:absolute;
  opacity:0;
  pointer-events:none;
}
.ufb-switch__track{
  position:relative;
  width:50px;
  height:28px;
  border-radius:999px;
  flex:0 0 auto;
  background:rgba(148,163,184,0.35);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);
  transition:background 0.2s ease;
}
.ufb-switch__thumb{
  position:absolute;
  top:3px;
  left:3px;
  width:22px;
  height:22px;
  border-radius:50%;
  background:#fff;
  box-shadow:0 4px 10px rgba(15,23,42,0.35);
  transition:transform 0.2s ease;
}
.ufb-switch input:checked + .ufb-switch__track{
  background:linear-gradient(135deg, #2563eb, #0f766e);
}
.ufb-switch input:checked + .ufb-switch__track .ufb-switch__thumb{
  transform:translateX(22px);
}
.ufb-switch__text{
  font-size:13px;
  font-weight:700;
  color:#e2e8f0;
}
.ufb-btn{
  min-width:86px;
  height:40px;
  border:none;
  border-radius:14px;
  padding:0 14px;
  cursor:pointer;
  color:#e2e8f0;
  background:rgba(255,255,255,0.08);
}
.ufb-btn:disabled{
  opacity:0.45;
  cursor:not-allowed;
}
.ufb-btn--primary{
  color:#eff6ff;
  background:linear-gradient(135deg, #2563eb, #0f766e);
}
.ufb-btn--ghost{
  background:transparent;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08);
}
.ufb-btn--danger{
  background:rgba(239,68,68,0.18);
  color:#fecaca;
}
.ufb-range-row,
.ufb-color-row{
  display:flex;
  align-items:center;
  gap:12px;
}
.ufb-import-panel{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.ufb-import-groups{
  display:flex;
  flex-direction:column;
  gap:12px;
}
.ufb-import-group{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.ufb-import-group__head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  width:100%;
  border:none;
  border-radius:14px;
  padding:10px 12px;
  cursor:pointer;
  color:#e2e8f0;
  background:rgba(255,255,255,0.04);
}
.ufb-import-group__title{
  font-size:13px;
  font-weight:700;
  color:#dbeafe;
}
.ufb-import-group__toggle{
  flex:0 0 auto;
  font-size:12px;
  color:#bfd3ea;
}
.ufb-check-list{
  display:flex;
  flex-direction:column;
  gap:8px;
  max-height:240px;
  overflow:auto;
  padding:4px;
  border-radius:16px;
  background:rgba(2,6,23,0.32);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.04);
}
.ufb-check-item{
  display:flex;
  align-items:flex-start;
  gap:10px;
  padding:10px 12px;
  border-radius:12px;
  cursor:pointer;
  color:#e2e8f0;
  background:rgba(255,255,255,0.03);
}
.ufb-check-item input{
  margin-top:2px;
  flex:0 0 auto;
}
.ufb-check-item span{
  font-size:13px;
  line-height:1.5;
}
.ufb-range{
  accent-color:#38bdf8;
}
.ufb-color{
  width:56px;
  height:40px;
  border:none;
  border-radius:12px;
  overflow:hidden;
  background:none;
}
.ufb-presets{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.ufb-chip{
  min-width:42px;
  height:42px;
  border:none;
  border-radius:14px;
  cursor:pointer;
  color:#f8fafc;
  background:rgba(255,255,255,0.07);
}
.ufb-chip.is-active{
  box-shadow:inset 0 0 0 2px rgba(147,197,253,0.58);
}
.ufb-chip--color{
  background:var(--chip-color);
}
.ufb-rules{
  flex:1 1 auto;
  min-height:0;
  display:grid;
  grid-template-columns:minmax(0, 1fr) 340px;
  gap:16px;
  align-items:stretch;
}
.ufb-rules__main{
  min-height:0;
  overflow:auto;
  -webkit-overflow-scrolling:touch;
}
.ufb-rules__preview{
  overflow:hidden;
  display:flex;
  flex-direction:column;
}
.ufb-rules__preview-head{
  padding:16px 18px;
  font-size:14px;
  font-weight:700;
  border-bottom:1px solid rgba(255,255,255,0.06);
}
.ufb-rules__preview-body{
  flex:1 1 auto;
  min-height:0;
  overflow:auto;
  padding:16px 18px;
}
.ufb-rule{
  border-radius:18px;
  padding:14px;
  background:rgba(2,6,23,0.42);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.05);
}
.ufb-rule.is-disabled{
  opacity:0.7;
}
.ufb-rule + .ufb-rule{
  margin-top:12px;
}
.ufb-rule__head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}
.ufb-rule__head.is-collapsed{
  align-items:center;
  margin-bottom:0;
}
.ufb-rule__summary{
  min-width:0;
}
.ufb-rule__title{
  font-size:14px;
  font-weight:700;
}
.ufb-rule__meta,
.ufb-hint,
.ufb-empty,
.ufb-segment__meta{
  color:#bfd3ea;
  font-size:12px;
  line-height:1.6;
}
.ufb-grid{
  display:grid;
  grid-template-columns:repeat(2, minmax(0, 1fr));
  gap:12px;
}
.ufb-field--span{
  grid-column:1 / -1;
}
.ufb-placeholder{
  min-height:180px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  text-align:center;
}
.ufb-placeholder strong{
  font-size:16px;
}
.ufb-placeholder p{
  margin:10px 0 0;
  line-height:1.7;
  color:#bfd3ea;
  white-space:pre-wrap;
}
.ufb-segment-list{
  display:flex;
  flex-direction:column;
  gap:10px;
  margin-top:10px;
}
.ufb-segment{
  border-radius:16px;
  padding:12px 14px;
  background:rgba(2,6,23,0.42);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.05);
}
.ufb-segment__title{
  font-size:13px;
  font-weight:700;
  margin-bottom:6px;
}
.ufb-segment pre{
  margin:8px 0 0;
  white-space:pre-wrap;
  word-break:break-word;
  font-size:12px;
  line-height:1.6;
  color:#e2e8f0;
}
@media (max-width: 980px){
  .ufb-layout{
    grid-template-columns:1fr;
  }
  .ufb-sidebar{
    border-right:none;
    border-bottom:1px solid rgba(255,255,255,0.08);
    flex-direction:row;
    overflow:auto;
  }
  .ufb-split,
  .ufb-rules{
    grid-template-columns:1fr;
  }
  .ufb-field{
    grid-template-columns:88px minmax(0, 1fr);
    align-items:flex-start;
  }
  .ufb-field--stack{
    grid-template-columns:minmax(0, 1fr);
  }
  .ufb-range-row,
  .ufb-color-row{
    flex-wrap:wrap;
  }
}
</style>
