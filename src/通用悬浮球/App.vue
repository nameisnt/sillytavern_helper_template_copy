<template>
  <div class="ufb-app">
    <header class="ufb-topbar">
      <div>
        <p class="ufb-topbar__eyebrow">通用悬浮球</p>
        <h1>悬浮球管理</h1>
        <p class="ufb-topbar__status" :class="{ 'is-dirty': dirty }">
          <span class="ufb-status-dot" />
          {{ dirty ? '有未保存改动' : '已保存' }} · {{ statusMessage }}
        </p>
      </div>
      <div class="ufb-topbar__actions">
        <button class="ufb-btn ufb-btn--ghost" type="button" @click="reloadDraft">重载</button>
        <button class="ufb-btn ufb-btn--primary" type="button" @click="saveAll">{{ dirty ? '保存变更' : '重新保存' }}</button>
        <button class="ufb-btn" type="button" @click="props.onClose">关闭</button>
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
          <span class="ufb-nav__desc">{{ entry.description }}</span>
        </button>
      </aside>

      <main class="ufb-main">
        <section v-if="currentView === 'home'" class="ufb-home">
          <button v-for="entry in navEntries.slice(1)" :key="entry.id" class="ufb-card" type="button" @click="currentView = entry.id">
            <strong>{{ entry.title }}</strong>
            <p>{{ entry.description }}</p>
          </button>
        </section>

        <section v-else-if="currentView === 'content'" class="ufb-section">
          <div class="ufb-section__head">
            <div>
              <h2>网页代码</h2>
              <p>管理多球、名称、状态和自定义网页代码。</p>
            </div>
            <div class="ufb-inline-actions">
              <button class="ufb-btn ufb-btn--primary" type="button" @click="addBall">新建悬浮球</button>
              <button class="ufb-btn ufb-btn--danger" type="button" :disabled="orderedItems.length <= 1" @click="deleteCurrentBall">
                删除当前球
              </button>
            </div>
          </div>

          <div class="ufb-split">
            <div class="ufb-ball-list">
              <button
                v-for="item in orderedItems"
                :key="item.id"
                class="ufb-ball-item"
                :class="{ 'is-active': item.id === currentId }"
                type="button"
                @click="currentId = item.id"
              >
                <div class="ufb-ball-item__title">{{ item.name?.trim() || '未命名悬浮球' }}</div>
                <div class="ufb-ball-item__meta">
                  <span class="ufb-badge">{{ props.api.getStatusLabel(item.status) }}</span>
                  <span>{{ getContentSummary(item) }}</span>
                </div>
              </button>
            </div>

            <div v-if="currentItem" class="ufb-form">
              <label class="ufb-field">
                <span>名称</span>
                <input :value="currentItem.name" type="text" class="ufb-input" placeholder="悬浮球名称" @input="updateCurrentName(($event.target as HTMLInputElement).value)" />
              </label>

              <div class="ufb-field">
                <span>状态</span>
                <div class="ufb-inline-actions">
                  <button
                    v-for="status in statusOptions"
                    :key="status.value"
                    class="ufb-btn"
                    :class="{ 'ufb-btn--primary': currentItem.status === status.value }"
                    type="button"
                    @click="updateCurrentStatus(status.value)"
                  >
                    {{ status.label }}
                  </button>
                </div>
              </div>

              <label class="ufb-field">
                <span>网页代码</span>
                <textarea
                  :value="currentItem.webCode"
                  class="ufb-textarea ufb-textarea--grow"
                  placeholder="在这里输入当前悬浮球对应的 HTML 代码..."
                  @input="updateCurrentWebCode(($event.target as HTMLTextAreaElement).value)"
                />
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="currentView === 'appearance'" class="ufb-section">
          <div class="ufb-section__head">
            <div>
              <h2>悬浮球设置</h2>
              <p>调整图标、文字、颜色、大小和默认位置。</p>
            </div>
          </div>

          <div v-if="currentItem" class="ufb-form">
            <label class="ufb-field">
              <span>当前悬浮球</span>
              <select v-model="currentId" class="ufb-input">
                <option v-for="item in orderedItems" :key="item.id" :value="item.id">
                  {{ item.name?.trim() || '未命名悬浮球' }} · {{ props.api.getStatusLabel(item.status) }}
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
                placeholder="留空则不显示文字"
                @input="updateCurrentText(($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="ufb-field">
              <span>图标</span>
              <input
                :value="currentItem.floatingBall.icon"
                type="text"
                class="ufb-input"
                placeholder="例如：🌐 或 ★"
                @input="updateCurrentIcon(($event.target as HTMLInputElement).value)"
              />
            </label>

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

            <div class="ufb-inline-actions">
              <button class="ufb-btn" type="button" @click="resetCurrentPosition">重置位置</button>
            </div>
          </div>
        </section>

        <section v-else-if="currentView === 'rules'" class="ufb-section">
          <div class="ufb-section__head">
            <div>
              <h2>消息来源与规则</h2>
              <p>切换内容来源，并为消息层模式配置规则链和即时预览。</p>
            </div>
          </div>

          <div class="ufb-rules">
            <div class="ufb-rules__main">
              <label class="ufb-field">
                <span>当前悬浮球</span>
                <select v-model="currentId" class="ufb-input">
                  <option v-for="item in orderedItems" :key="item.id" :value="item.id">
                    {{ item.name?.trim() || '未命名悬浮球' }} · {{ props.api.getStatusLabel(item.status) }}
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

              <p v-if="currentItem?.contentSource.mode === 'custom_html'" class="ufb-hint">
                当前球继续使用“网页代码”页里的 webCode 进行预览。切到“消息层规则”后，下面的规则链才会生效。
              </p>

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

                <label class="ufb-field">
                  <span>输出模式</span>
                  <select :value="messageSource.outputMode" class="ufb-input" @change="updateOutputMode(($event.target as HTMLSelectElement).value)">
                    <option value="html">HTML</option>
                    <option value="text">文本</option>
                    <option value="url">URL</option>
                  </select>
                </label>

                <div class="ufb-inline-actions">
                  <button class="ufb-btn ufb-btn--primary" type="button" @click="addRule">
                    新增规则
                  </button>
                </div>

                <div v-if="messageSource.rules.length === 0" class="ufb-empty">
                  当前还没有规则。你可以先新增一条提取规则，从目标楼层里抓取网页片段、文本或 URL。
                </div>

                <div v-for="(rule, index) in messageSource.rules" :key="rule.id" class="ufb-rule" :class="{ 'is-disabled': !rule.enabled }">
                  <div class="ufb-rule__head">
                    <div>
                      <div class="ufb-rule__title">{{ rule.name?.trim() || `规则 ${Number(index) + 1}` }}</div>
                      <div class="ufb-rule__meta">{{ props.api.getRuleModeLabel(rule.mode) }} · {{ rule.enabled ? '已启用' : '已停用' }}</div>
                    </div>
                    <div class="ufb-inline-actions">
                      <button class="ufb-btn" type="button" @click="toggleRuleEnabled(Number(index))">{{ rule.enabled ? '停用' : '启用' }}</button>
                      <button class="ufb-btn" type="button" @click="copyRule(Number(index))">复制</button>
                      <button class="ufb-btn" type="button" :disabled="Number(index) === 0" @click="moveRule(Number(index), -1)">上移</button>
                      <button class="ufb-btn" type="button" :disabled="Number(index) >= messageSource.rules.length - 1" @click="moveRule(Number(index), 1)">下移</button>
                      <button class="ufb-btn ufb-btn--danger" type="button" @click="removeRule(Number(index))">删除</button>
                    </div>
                  </div>

                  <div class="ufb-grid">
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
                      <input :value="rule.flags" type="text" class="ufb-input" placeholder="例如：gi" @input="updateRuleField(Number(index), 'flags', ($event.target as HTMLInputElement).value)" />
                    </label>

                    <label class="ufb-field ufb-field--span">
                      <span>正则</span>
                      <textarea
                        :value="rule.pattern"
                        class="ufb-textarea"
                        placeholder="输入正则表达式正文，不需要首尾 /"
                        @input="updateRuleField(Number(index), 'pattern', ($event.target as HTMLTextAreaElement).value)"
                      />
                    </label>

                    <label class="ufb-field ufb-field--span">
                      <span>Replacement</span>
                      <textarea
                        :value="rule.replacement"
                        class="ufb-textarea"
                        placeholder="可留空。提取模式留空时默认输出完整匹配。"
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
import { computed, ref } from 'vue';

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
  { id: 'home', title: '功能入口', description: '先看当前球概况，再进入具体配置页。' },
  { id: 'content', title: '网页代码', description: '管理多球、名称、状态和自定义网页代码。' },
  { id: 'appearance', title: '悬浮球设置', description: '调整图标、颜色、文字、大小和位置。' },
  { id: 'rules', title: '消息来源与规则', description: '切换内容来源，编辑规则链并查看即时结果。' },
] as const;

const statusOptions = [
  { value: 'active', label: '启用' },
  { value: 'hidden', label: '停用' },
  { value: 'archived', label: '归档' },
] as const;

function cloneDraft<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const currentView = ref<(typeof navEntries)[number]['id']>('home');
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
  syncCurrentId();
  const normalized = props.api.saveData(cloneDraft(draft.value));
  draft.value = cloneDraft(normalized);
  currentId.value = draft.value.activeId || draft.value.order?.[0] || '';
  props.api.renderBalls();
  setClean('已保存并刷新悬浮球');
  props.api.showToast('success', '悬浮球管理已保存');
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
  return currentItem.value.contentSource;
});

function updateMessageTarget(value: string) {
  withMessageSource(source => {
    source.messageTarget = value;
  }, '已修改目标楼层，记得保存');
}

function updateOutputMode(value: string) {
  if (value !== 'html' && value !== 'text' && value !== 'url') {
    return;
  }
  withMessageSource(source => {
    source.outputMode = value;
  }, `已切换输出模式为 ${props.api.getOutputModeLabel(value)}`);
}

function addRule() {
  withMessageSource(source => {
    source.rules.push(props.api.createRegexRule());
  }, '已新增规则，记得保存');
}

function moveRule(index: number, offset: number) {
  withMessageSource(source => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= source.rules.length) return;
    const [rule] = source.rules.splice(index, 1);
    source.rules.splice(nextIndex, 0, rule);
  }, '已调整规则顺序，记得保存');
}

function copyRule(index: number) {
  withMessageSource(source => {
    const rule = source.rules[index];
    if (!rule) return;
    source.rules.splice(index + 1, 0, props.api.createRegexRule({ ...rule, id: '' }));
  }, '已复制规则，记得保存');
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

function getContentSummary(item: any) {
  if (item.contentSource?.mode === 'message_rules') {
    const rules = Array.isArray(item.contentSource.rules) ? item.contentSource.rules : [];
    const enabledCount = rules.filter((rule: any) => rule.enabled).length;
    return `消息规则 · ${item.contentSource.messageTarget || props.api.defaultMessageTarget} · ${props.api.getOutputModeLabel(item.contentSource.outputMode)} · ${enabledCount}/${rules.length}`;
  }
  return item.webCode?.trim() ? '自定义网页 · 已配置网页' : '自定义网页 · 未配置网页';
}

const previewState = computed(() => {
  const item = currentItem.value;
  if (!item) {
    return {
      kind: 'placeholder' as const,
      title: '未找到悬浮球',
      description: '当前没有可编辑的悬浮球配置。',
    };
  }

  if (item.contentSource?.mode !== 'message_rules') {
    return {
      kind: 'placeholder' as const,
      title: '当前使用自定义网页',
      description: item.webCode?.trim()
        ? '点击悬浮球时会继续走现有 webCode 预览逻辑。切换到“消息层规则”后，这里才会显示规则链处理结果。'
        : '当前球还没有配置 webCode。切换到“消息层规则”后，这里才会显示规则链处理结果。',
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
      description:
        result.warnings?.[0] ??
        `目标楼层 ${result.messageTarget} 没有产出可用于 ${props.api.getOutputModeLabel(item.contentSource.outputMode)} 预览的结果。`,
    };
  }

  return {
    kind: 'segments' as const,
    summary: `目标楼层 ${result.messageTarget} · 消息 ID ${result.messageId} · ${props.api.getOutputModeLabel(item.contentSource.outputMode)} · ${result.segments.length} 段结果`,
    warning: result.warnings?.[0] ?? '',
    segments: result.segments.map((segment: string, index: number) => {
      const isUrl = item.contentSource.outputMode === 'url';
      const urlResult = isUrl ? props.api.parsePreviewUrl(segment) : null;
      return {
        key: `${index}-${segment.slice(0, 16)}`,
        title: `${item.contentSource.outputMode === 'text' ? '文本' : item.contentSource.outputMode === 'url' ? 'URL' : '片段'} ${index + 1}`,
        meta: isUrl ? (urlResult?.ok ? 'URL 可用于预览' : urlResult?.error ?? 'URL 无效') : `${segment.length} 个字符`,
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
.ufb-topbar h1{
  margin:2px 0 0;
  font-size:26px;
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
  flex-wrap:wrap;
  gap:10px;
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
.ufb-home{
  display:grid;
  grid-template-columns:repeat(3, minmax(0, 1fr));
  gap:16px;
}
.ufb-card{
  border:none;
  border-radius:22px;
  padding:24px;
  text-align:left;
  cursor:pointer;
  color:#e2e8f0;
  background:rgba(255,255,255,0.05);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,0.05);
}
.ufb-card strong{
  display:block;
  font-size:18px;
}
.ufb-card p{
  margin:10px 0 0;
  color:#bfd3ea;
  line-height:1.65;
}
.ufb-section{
  display:flex;
  flex-direction:column;
  gap:18px;
}
.ufb-section__head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
}
.ufb-section__head h2{
  margin:0;
  font-size:22px;
}
.ufb-section__head p{
  margin:6px 0 0;
  color:#bfd3ea;
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
  display:flex;
  flex-direction:column;
  gap:8px;
}
.ufb-field span{
  font-size:13px;
  font-weight:700;
  color:#dbeafe;
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
.ufb-inline-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
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
  display:grid;
  grid-template-columns:minmax(0, 1fr) 340px;
  gap:16px;
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
  .ufb-home,
  .ufb-split,
  .ufb-rules{
    grid-template-columns:1fr;
  }
}
</style>
