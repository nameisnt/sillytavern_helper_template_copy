<template>
  <div class="overlay" tabindex="0" @click.self="handleClose" @keydown.escape="handleClose">
    <div class="panel">
      <header class="panel-header">
        <h2>资源导入导出</h2>
        <button class="btn-close" title="关闭" @click="handleClose">✕</button>
      </header>

      <div v-if="!store.hasRoot" class="panel-empty">
        <p>请选择资源文件夹，然后选择导入或导出</p>
        <div class="empty-actions">
          <button class="btn-primary btn-lg" @click="store.pickRootDir()">选择文件夹</button>
        </div>
      </div>

      <div v-else-if="store.isChooseMode" class="panel-empty">
        <p>
          已选择文件夹<template v-if="(store.rootDirHandle as any)?.name">：<code>{{ (store.rootDirHandle as any)?.name }}</code></template>
        </p>
        <div class="empty-actions">
          <button class="btn-primary btn-lg" :disabled="store.importLoading" @click="store.startImport()">
            {{ store.importLoading ? '读取中…' : '进入导入' }}
          </button>
          <button
            class="btn-primary btn-lg"
            :disabled="!store.rootDirHandle"
            :title="store.rootDirHandle ? '' : '该浏览器未获得可写目录句柄，无法导出'"
            @click="store.startExport()"
          >
            进入导出
          </button>
          <button class="btn-sm" @click="store.pickRootDir()">重新选择文件夹</button>
        </div>
        <p v-if="!store.rootDirHandle" class="choose-hint">提示：导出需要支持 <code>showDirectoryPicker</code> 的浏览器</p>
      </div>

      <template v-else>
        <div class="panel-body">
          <aside class="sidebar sidebar--desktop">
            <div class="sidebar-section">
              <button class="btn-folder" @click="store.backToChoose()">返回选择</button>
              <button class="btn-folder" @click="store.pickRootDir()">重新选择文件夹</button>
              <button v-if="store.isImportMode" class="btn-folder btn-folder-danger" @click="store.clearAll()">
                清空并退出
              </button>
            </div>
            <div class="manifest-info">
              <div class="manifest-name">{{ store.isExportMode ? '文件夹导出' : '文件夹导入' }}</div>
              <div class="manifest-version">{{ store.entries.length }} 个条目</div>
            </div>

            <div v-if="store.isImportMode" class="folder-tree">
              <div class="folder-tree-title">
                <span>目录</span>
                <button v-if="store.selectedPathPrefix" class="folder-tree-clear" @click="store.clearPathPrefix()">
                  显示全部
                </button>
              </div>
              <div class="folder-tree-list">
                <button
                  v-for="node in store.importTreeNodes"
                  :key="node.key"
                  :class="[
                    'folder-tree-node',
                    node.prefix === store.selectedPathPrefix ? 'active' : '',
                  ]"
                  :style="{ paddingLeft: `${10 + node.depth * 12}px` }"
                  @click="store.selectTreeFolder(node.prefix)"
                >
                  <span class="node-label">{{ node.label }}</span>
                  <span class="node-count">{{ node.count }}</span>
                </button>
              </div>
            </div>

            <nav v-if="!store.isImportMode" class="category-nav">
              <button
                v-for="cat in store.categories"
                :key="cat.id"
                :class="['category-btn', { active: store.selectedCategory === cat.id }]"
                @click="store.setCategory(cat.id)"
              >
                <span class="category-label">{{ cat.label }}</span>
                <span :class="['category-badge', { 'badge-zero': cat.count === 0 }]">{{ cat.count }}</span>
              </button>
            </nav>
          </aside>

          <div
            v-if="sidebarOpen"
            class="sidebar-drawer-backdrop"
            role="presentation"
            @click="closeSidebar()"
          >
            <aside class="sidebar sidebar--drawer" @click.stop>
              <div class="sidebar-section">
                <button class="btn-folder" @click="(store.backToChoose(), closeSidebar())">返回选择</button>
                <button class="btn-folder" @click="(store.pickRootDir(), closeSidebar())">重新选择文件夹</button>
                <button
                  v-if="store.isImportMode"
                  class="btn-folder btn-folder-danger"
                  @click="(store.clearAll(), closeSidebar())"
                >
                  清空并退出
                </button>
              </div>
              <div class="manifest-info">
                <div class="manifest-name">{{ store.isExportMode ? '文件夹导出' : '文件夹导入' }}</div>
                <div class="manifest-version">{{ store.entries.length }} 个条目</div>
              </div>

              <div v-if="store.isImportMode" class="folder-tree">
                <div class="folder-tree-title">
                  <span>目录</span>
                  <button
                    v-if="store.selectedPathPrefix"
                    class="folder-tree-clear"
                    @click="store.clearPathPrefix()"
                  >
                    显示全部
                  </button>
                </div>
                <div class="folder-tree-list">
                  <button
                    v-for="node in store.importTreeNodes"
                    :key="node.key"
                    :class="[
                      'folder-tree-node',
                      node.prefix === store.selectedPathPrefix ? 'active' : '',
                    ]"
                    :style="{ paddingLeft: `${10 + node.depth * 12}px` }"
                    @click="(store.selectTreeFolder(node.prefix), closeSidebar())"
                  >
                    <span class="node-label">{{ node.label }}</span>
                    <span class="node-count">{{ node.count }}</span>
                  </button>
                </div>
              </div>

              <nav v-if="!store.isImportMode" class="category-nav">
                <button
                  v-for="cat in store.categories"
                  :key="cat.id"
                  :class="['category-btn', { active: store.selectedCategory === cat.id }]"
                  @click="(store.setCategory(cat.id), closeSidebar())"
                >
                  <span class="category-label">{{ cat.label }}</span>
                  <span :class="['category-badge', { 'badge-zero': cat.count === 0 }]">{{ cat.count }}</span>
                </button>
              </nav>
            </aside>
          </div>

          <main class="content">
            <div v-if="store.importLoading || store.exportLoading" class="loading-bar" aria-hidden="true"></div>
            <div class="toolbar">
              <button class="btn-sm hamburger-btn" type="button" @click="openSidebar()" aria-label="打开菜单">
                ☰
              </button>
              <div class="search-box">
                <span class="search-icon">🔍</span>
                <input
                  v-model="store.searchQuery"
                  type="text"
                  placeholder="搜索名称/路径..."
                  class="search-input"
                />
              </div>
              <div class="toolbar-actions">
                <select :value="store.sortKey" class="bulk-type" @change="store.setSort(($event.target as HTMLSelectElement).value as any)">
                  <option value="default">原顺序</option>
                  <option value="name">名称排序</option>
                  <option value="type">类型排序</option>
                  <option value="path">路径排序</option>
                  <option value="status">状态排序</option>
                  <option value="duplicate">重复优先</option>
                </select>
                <select :value="store.statusFilter" class="bulk-type" @change="store.setStatusFilter(($event.target as HTMLSelectElement).value as any)">
                  <option value="all">全部状态</option>
                  <option value="pending">待处理</option>
                  <option value="success">成功</option>
                  <option value="error">失败</option>
                  <option value="skipped">跳过</option>
                </select>
                <select
                  :value="store.duplicateFilter"
                  class="bulk-type"
                  @change="store.setDuplicateFilter(($event.target as HTMLSelectElement).value as any)"
                >
                  <option value="all">全部重复</option>
                  <option value="duplicate">仅重复</option>
                  <option value="normal">仅非重复</option>
                </select>
                <button
                  v-if="store.isImportMode"
                  class="btn-sm"
                  :class="{ 'btn-sm-active': store.showDuplicatePanel }"
                  @click="store.showDuplicatePanel = !store.showDuplicatePanel"
                >
                  重复项 ({{ store.duplicateEntryCount }})
                </button>
                <button class="btn-sm" @click="store.selectAll()">全选</button>
                <button class="btn-sm" @click="store.deselectAll()">取消全选</button>
                <button
                  v-if="store.isImportMode"
                  class="btn-sm btn-sm-danger"
                  :disabled="store.selectedIds.size === 0 || !store.canDeleteSourceFiles"
                  :title="store.canDeleteSourceFiles ? '删除选中的源文件' : '当前来源不是可写目录句柄，不能删除源文件'"
                  @click="store.requestDeleteSelectedSourceFiles()"
                >
                  删除源文件
                </button>
              </div>
            </div>

            <div v-if="store.importLoading || store.exportLoading" class="loading-overlay" role="status" aria-live="polite">
              <div class="spinner"></div>
              <div class="loading-text">{{ store.importLoading ? '正在读取并解析文件夹…' : '正在加载…' }}</div>
            </div>

            <div v-if="store.isImportMode" class="conflict-row">
              <span class="conflict-label">脚本同名冲突:</span>
              <select v-model="store.conflictStrategy" class="conflict-select">
                <option value="skip">跳过</option>
                <option value="overwrite">覆盖</option>
                <option value="rename">重命名</option>
              </select>
              <span v-if="store.duplicateEntryCount > 0" class="stat stat-skipped">检测到重复 {{ store.duplicateEntryCount }}</span>
            </div>
            <div v-else class="conflict-row">
              <span class="conflict-label">同名文件:</span>
              <select v-model="store.exportConflictStrategy" class="conflict-select">
                <option value="overwrite">覆盖</option>
                <option value="skip">跳过</option>
              </select>
              <span class="conflict-label">角色卡:</span>
              <select v-model="store.characterExportFormat" class="conflict-select">
                <option value="png">PNG</option>
                <option value="json">JSON</option>
              </select>
              <span class="conflict-label">脚本:</span>
              <select v-model="store.scriptExportFormat" class="conflict-select">
                <option value="js">JS</option>
                <option value="ts">TS</option>
              </select>
              <span v-if="store.exportLoading" class="stat stat-processing">加载中...</span>
            </div>

            <div v-if="store.isImportMode && store.showDuplicatePanel" class="duplicate-panel">
              <div class="duplicate-panel-header">
                <div class="duplicate-panel-title">
                  <strong>重复项处理</strong>
                  <span class="duplicate-panel-subtitle">按你选中的重复来源分组显示，方便集中处理</span>
                </div>
                <div class="duplicate-panel-controls">
                  <div class="duplicate-filter-tabs">
                    <button
                      v-for="option in store.duplicatePanelOptions"
                      :key="option.value"
                      :class="['btn-sm', store.duplicatePanelSourceResolved === option.value ? 'btn-sm-active' : '']"
                      @click="store.duplicatePanelSource = option.value"
                    >
                      {{ option.label }} ({{ option.count }})
                    </button>
                  </div>
                  <button class="btn-sm" @click="store.showDuplicatePanel = false">收起</button>
                </div>
              </div>
              <div v-if="store.duplicateGroups.length === 0" class="duplicate-empty">当前分组没有重复项</div>
              <div v-else class="duplicate-groups">
                <div v-for="group in store.duplicateGroups" :key="group.id" class="duplicate-group">
                  <div class="duplicate-group-title">
                    <span>{{ group.label }}</span>
                    <span class="duplicate-group-key">{{ group.compareKey }}</span>
                  </div>
                  <div v-if="group.warnings.length > 0" class="duplicate-warning-list">
                    <div v-for="warning in group.warnings" :key="warning" class="duplicate-warning">{{ warning }}</div>
                  </div>
                  <div class="duplicate-section">
                    <div class="duplicate-section-label">本次导入</div>
                    <div v-for="entry in group.entries" :key="entry.id" class="duplicate-row">
                      <div class="duplicate-row-info">
                        <div class="duplicate-row-name">{{ entry.displayName }}</div>
                        <div class="duplicate-row-meta">{{ entry.path }}</div>
                      </div>
                      <div class="duplicate-row-actions">
                        <button class="btn-sm" @click="store.toggleSelect(entry.id)">
                          {{ store.selectedIds.has(entry.id) ? '取消' : '勾选' }}
                        </button>
                        <button
                          class="btn-sm btn-sm-danger"
                          :disabled="!entry.canDeleteSourceFile"
                          :title="entry.sourceDeleteReason || '删除源文件'"
                          @click="store.requestDeleteSourceEntry(entry.id)"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                  <div v-if="group.tavernMatches.length > 0" class="duplicate-section">
                    <div class="duplicate-section-label">酒馆内已有</div>
                    <div v-for="match in group.tavernMatches" :key="match.id" class="duplicate-row duplicate-row--match">
                      <div class="duplicate-row-info">
                        <div class="duplicate-row-name">{{ match.name }}</div>
                        <div class="duplicate-row-meta">{{ typeLabel(match.type) }}<span v-if="match.path"> · {{ match.path }}</span></div>
                      </div>
                      <div class="duplicate-row-actions">
                        <button class="btn-sm btn-sm-danger" title="删除酒馆资源" @click="store.requestDeleteTavernMatch(match)">删除</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="item-list">
              <div
                v-for="item in store.filteredEntries"
                :key="item.id"
                :class="['item-card', `item-${item.status}`, item.duplicateSource && item.duplicateSource !== 'none' ? 'item-duplicate' : '']"
              >
                <label class="item-checkbox">
                  <input
                    type="checkbox"
                    :checked="store.selectedIds.has(item.id)"
                    @change="store.toggleSelect(item.id)"
                  />
                </label>
                <div class="item-info">
                  <div class="item-name">
                    {{ item.displayName }}
                    <span v-if="item.recognizedName && item.recognizedName !== item.displayName" class="item-name-alt">
                      → {{ item.recognizedName }}
                    </span>
                  </div>
                  <div class="item-secondary-row">
                    <div class="item-meta">
                      <template v-if="item.type === 'extension_url'">
                        <span class="item-type">{{ typeLabel(item.type) }}</span>
                        <span
                          v-if="store.isImportMode && (item.urls?.length || 0) > 1"
                          class="item-url"
                          :title="(item.urls || []).join('\\n')"
                        >
                          URL×{{ item.urls?.length }}
                        </span>
                        <span
                          v-else-if="store.isExportMode"
                          class="item-url"
                          title="导出时会自动读取扩展远程URL并写入拓展.txt"
                        >
                          拓展.txt
                        </span>
                      </template>
                      <template v-else>
                        <span
                          :class="['item-type', { 'item-type-unknown': item.type === 'unknown' || !item.type }]"
                          :title="store.isImportMode ? '根据所在文件夹自动识别类型' : typeLabel(item.type)"
                        >
                          {{ typeLabel(item.type) }}
                        </span>
                      </template>
                      <span v-if="item.path" class="item-path" :title="item.path">{{ item.path }}</span>
                      <span
                        v-if="item.duplicateSource && item.duplicateSource !== 'none'"
                        class="item-badge item-badge-duplicate"
                        :title="item.duplicateReason"
                      >
                        {{ duplicateSourceLabel(item.duplicateSource) }}
                      </span>
                      <span
                        v-for="warning in item.warnings || []"
                        :key="warning"
                        class="item-badge item-badge-warning"
                        :title="warning"
                      >
                        预警
                      </span>
                      <span
                        v-if="store.isExportMode && item.type === 'extension_url'"
                        :class="['item-url', { 'item-url-muted': !item.url || store.extensionUrlLoadingIds.has(item.id) }]"
                        :title="item.url || '尚未获取到扩展URL'"
                      >
                        {{
                          store.extensionUrlLoadingIds.has(item.id)
                            ? 'URL获取中…'
                            : item.url
                              ? 'URL已获取'
                              : 'URL缺失'
                        }}
                      </span>
                      <span v-if="store.isImportMode && item.url && item.type === 'extension_url'" class="item-url" :title="item.url">URL</span>
                    </div>
                    <div class="item-actions">
                      <template v-if="item.type === 'extension_url' && store.isImportMode">
                        <button
                          v-if="(item.urls?.length || 0) <= 1"
                          class="btn-action btn-copy"
                          @click="copyUrl(item, 'all')"
                        >复制URL</button>
                        <template v-else>
                          <button class="btn-action btn-copy" @click="copyUrl(item, 0)">
                            复制{{ urlTag(item, 0) }}
                          </button>
                          <button class="btn-action btn-copy" @click="copyUrl(item, 1)">
                            复制{{ urlTag(item, 1) }}
                          </button>
                          <button class="btn-action btn-copy btn-copy-all" @click="copyUrl(item, 'all')">复制全部</button>
                        </template>
                      </template>
                      <template v-if="store.isExportMode">
                        <button
                          class="btn-action btn-import"
                          :disabled="store.exportLoading"
                          @click="store.exportSingle(item)"
                        >
                          {{ item.status === 'error' ? '重试导出' : item.type === 'extension_url' ? '写入拓展.txt' : '导出' }}
                        </button>
                        <button class="btn-action btn-danger" title="删除酒馆资源" @click="store.deleteTavernForEntry(item)">删除</button>
                      </template>
                      <template v-else-if="canImport(item)">
                        <button class="btn-action btn-import" @click="store.importSingle(item)">
                          {{ item.status === 'error' ? '重试' : item.type === 'theme' ? '安装' : '导入' }}
                        </button>
                      </template>
                      <span
                        v-else-if="!item.existsInFolder"
                        class="file-missing"
                        title="文件未在所选文件夹中找到"
                      >文件缺失</span>
                      <span
                        v-else-if="item.status !== 'success' && (item.type === 'unknown' || !item.type)"
                        class="file-missing"
                        title="无法根据所在文件夹识别资源类型"
                      >无法识别</span>
                      <button
                        v-if="store.isImportMode"
                        class="btn-action btn-danger"
                        :disabled="!item.canDeleteSourceFile"
                        :title="item.sourceDeleteReason || '删除源文件'"
                        @click="store.requestDeleteSourceEntry(item.id)"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
                <div v-if="item.status !== 'pending'" class="item-status-area">
                  <span v-if="item.status === 'success'" class="status-success" title="导入成功">✓</span>
                  <span v-else-if="item.status === 'error'" class="status-error" :title="item.errorMessage">✗</span>
                  <span v-else-if="item.status === 'skipped'" class="status-skipped" :title="item.errorMessage">⏭</span>
                </div>
                <div v-if="item.errorMessage" class="item-error-msg">{{ item.errorMessage }}</div>
              </div>
              <div v-if="store.filteredEntries.length === 0" class="empty-state">
                <p>没有匹配的条目</p>
              </div>
            </div>

            <div class="bottom-bar">
              <div class="bottom-left">
                <template v-if="store.isExportMode">
                  <button
                    class="btn-primary"
                    :disabled="store.selectedIds.size === 0 || store.isProcessing || store.exportLoading"
                    @click="store.exportSelected()"
                  >
                    导出选中 ({{ store.selectedIds.size }})
                  </button>
                  <button
                    class="btn-primary"
                    :disabled="store.isProcessing || store.exportLoading"
                    @click="store.exportAllWithConfirm()"
                  >
                    全部导出
                  </button>
                </template>
                <template v-else>
                  <button
                    class="btn-primary"
                    :disabled="store.selectedIds.size === 0 || store.isProcessing"
                    @click="store.importSelected()"
                  >
                    导入选中 ({{ store.selectedIds.size }})
                  </button>
                  <button class="btn-primary" :disabled="store.isProcessing" @click="store.importAllWithConfirm()">
                    全部导入
                  </button>
                </template>
                <button
                  v-if="store.isImportMode"
                  class="btn-sm btn-sm-danger"
                  :disabled="store.selectedIds.size === 0 || !store.canDeleteSourceFiles"
                  @click="store.requestDeleteSelectedSourceFiles()"
                >
                  删除选中源文件
                </button>
              </div>
              <div class="bottom-right">
                <span v-if="store.stats.success > 0" class="stat stat-success">成功 {{ store.stats.success }}</span>
                <span v-if="store.stats.failed > 0" class="stat stat-error">失败 {{ store.stats.failed }}</span>
                <span v-if="store.stats.skipped > 0" class="stat stat-skipped">跳过 {{ store.stats.skipped }}</span>
                <span v-if="store.isProcessing" class="stat stat-processing">处理中...</span>
              </div>
            </div>
          </main>
        </div>
      </template>
    </div>

    <div v-if="store.resultDialog.visible" class="dialog-mask">
      <div class="dialog-card">
        <div class="dialog-header">
          <h3>{{ store.resultDialog.title }}</h3>
          <button class="btn-close" @click="store.closeResultDialog()">✕</button>
        </div>
        <div class="dialog-summary">
          <span class="stat stat-success">成功 {{ store.resultDialog.success }}</span>
          <span class="stat stat-error">失败 {{ store.resultDialog.failed }}</span>
          <span class="stat stat-skipped">跳过 {{ store.resultDialog.skipped }}</span>
        </div>
        <div v-if="store.resultDialog.items.length === 0" class="dialog-empty">本次没有失败或跳过的条目。</div>
        <div v-else class="dialog-list">
          <div v-for="row in store.resultDialog.items" :key="row.id" class="dialog-row">
            <div class="dialog-row-main">
              <strong>{{ row.displayName }}</strong>
              <span>{{ typeLabel(row.type) }}</span>
            </div>
            <div v-if="row.path" class="dialog-row-path">{{ row.path }}</div>
            <div class="dialog-row-reason">{{ row.reason }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.preflightDialog.visible" class="dialog-mask">
      <div class="dialog-card">
        <div class="dialog-header">
          <h3>{{ store.preflightDialog.title }}</h3>
          <button class="btn-close" @click="store.closePreflightDialog()">✕</button>
        </div>
        <div class="dialog-summary dialog-summary--stack">检测到以下重复或预警，建议先处理后再导入：</div>
        <div class="dialog-list">
          <div v-for="row in store.preflightDialog.warnings" :key="row.id" class="dialog-row">
            <div class="dialog-row-main">
              <strong>{{ row.displayName }}</strong>
            </div>
            <div v-for="message in row.messages" :key="message" class="dialog-row-reason">{{ message }}</div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-sm" @click="store.closePreflightDialog()">返回处理</button>
          <button class="btn-primary" @click="store.continueImportFromPreflight()">继续导入</button>
        </div>
      </div>
    </div>

    <div v-if="store.deleteConfirmDialog.visible" class="dialog-mask">
      <div class="dialog-card">
        <div class="dialog-header">
          <h3>{{ store.deleteConfirmDialog.title }}</h3>
          <button class="btn-close" @click="store.closeDeleteConfirmDialog()">✕</button>
        </div>
        <div class="dialog-summary dialog-summary--stack">
          这是删除源文件夹里的实际文件，删除后不会自动恢复到任务列表。
        </div>
        <div class="dialog-summary dialog-summary--stack">共 {{ store.deleteConfirmDialog.itemIds.length }} 个文件：</div>
        <div class="dialog-list">
          <div v-for="path in store.deleteConfirmDialog.paths" :key="path" class="dialog-row">
            <div class="dialog-row-path">{{ path }}</div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-sm" @click="store.closeDeleteConfirmDialog()">取消</button>
          <button class="btn-primary btn-primary-danger" @click="store.confirmDeleteSourceEntries()">确认删除</button>
        </div>
      </div>
    </div>

    <div v-if="store.characterDeleteConfirm.visible && store.characterDeleteConfirm.target" class="dialog-mask">
      <div class="dialog-card dialog-card-sm">
        <div class="dialog-header">
          <h3>删除角色卡</h3>
          <button class="btn-close" @click="store.closeCharacterDeleteConfirm()">✕</button>
        </div>
        <div class="dialog-summary dialog-summary--stack">
          删除角色卡“{{ store.characterDeleteConfirm.target.name }}”时，是否连聊天记录一起删除？
        </div>
        <div class="dialog-actions">
          <button class="btn-sm" @click="deleteCharacterTarget(false)">
            只删角色卡
          </button>
          <button class="btn-primary btn-primary-danger" @click="deleteCharacterTarget(true)">
            连聊天一起删
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useImportStore } from './store';
import { categorizeType, getTypeLabel } from './types';

const emit = defineEmits<{ close: [] }>();
const store = useImportStore();
const sidebarOpen = ref(false);

function handleClose() {
  store.onClose();
  emit('close');
}

function openSidebar() {
  sidebarOpen.value = true;
}
function closeSidebar() {
  sidebarOpen.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') handleClose();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function typeLabel(type: string) {
  return getTypeLabel(type);
}

function duplicateSourceLabel(source?: string) {
  if (source === 'mixed') return '源内+酒馆重复';
  if (source === 'tavern') return '酒馆已存在';
  if (source === 'folder') return '源内重复';
  return '';
}

function canImport(item: { status: string; type: string; existsInFolder: boolean; url?: string; file?: File }) {
  if (!store.isImportMode) return false;
  if (item.status === 'success') return false;
  if (item.type === 'extension_url') return false;
  if (!item.type || item.type === 'unknown') return false;
  if (item.type === 'auto_json') return !!item.file;
  if (item.type === 'resource' || categorizeType(item.type) === 'resource') return false;
  if (categorizeType(item.type) === 'unsupported') return false;
  return item.existsInFolder || !!item.url;
}

function deleteCharacterTarget(deleteChats: boolean) {
  const target = store.characterDeleteConfirm.target;
  if (!target) return;
  void store.deleteTavernMatch(target, { deleteChats });
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  return ok;
}

function fallbackCopyIn(targetDocument: Document, text: string) {
  const textarea = targetDocument.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  targetDocument.body.appendChild(textarea);
  (textarea as HTMLTextAreaElement).focus();
  (textarea as HTMLTextAreaElement).select();
  const ok = targetDocument.execCommand('copy');
  textarea.remove();
  return ok;
}

function urlLabel(url?: string) {
  if (!url) return 'URL';
  const u = url.toLowerCase();
  if (u.includes('github.com')) return 'GitHub';
  return '国内';
}

function urlTag(item: { urlTags?: string[]; urls?: string[] }, index: 0 | 1) {
  const tag = item.urlTags?.[index];
  if (tag) return tag;
  return urlLabel(item.urls?.[index]);
}

async function copyUrl(item: { url?: string; urls?: string[]; urlTags?: string[] }, which: 'all' | 0 | 1) {
  const urlsAll = (item.urls && item.urls.length > 0 ? item.urls : item.url ? [item.url] : []).filter(Boolean);
  if (urlsAll.length === 0) return;

  const urls = which === 'all' ? urlsAll : [urlsAll[which]].filter(Boolean);
  const text = urls.join('\n');
  const tagIndex = which === 'all' ? 0 : which;

  const parentWin = window.parent && window.parent !== window ? window.parent : null;
  const parentDoc = parentWin?.document || null;

  try {
    if (parentDoc && fallbackCopyIn(parentDoc, text)) {
      toastr.success(
        `已复制${which === 'all' ? '' : ` ${urlTag(item as { urlTags?: string[]; urls?: string[] }, tagIndex)}`} URL${urls.length > 1 ? `×${urls.length}` : ''}`,
      );
      (item as { status?: string; errorMessage?: string }).status = 'success';
      (item as { status?: string; errorMessage?: string }).errorMessage = undefined;
      store.updateStats();
      return;
    }

    if (parentWin?.navigator?.clipboard?.writeText) {
      await parentWin.navigator.clipboard.writeText(text);
      toastr.success(
        `已复制${which === 'all' ? '' : ` ${urlTag(item as { urlTags?: string[]; urls?: string[] }, tagIndex)}`} URL${urls.length > 1 ? `×${urls.length}` : ''}`,
      );
      (item as { status?: string; errorMessage?: string }).status = 'success';
      (item as { status?: string; errorMessage?: string }).errorMessage = undefined;
      store.updateStats();
      return;
    }

    if (fallbackCopy(text)) {
      toastr.success(
        `已复制${which === 'all' ? '' : ` ${urlTag(item as { urlTags?: string[]; urls?: string[] }, tagIndex)}`} URL${urls.length > 1 ? `×${urls.length}` : ''}`,
      );
      (item as { status?: string; errorMessage?: string }).status = 'success';
      (item as { status?: string; errorMessage?: string }).errorMessage = undefined;
      store.updateStats();
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toastr.success(
        `已复制${which === 'all' ? '' : ` ${urlTag(item as { urlTags?: string[]; urls?: string[] }, tagIndex)}`} URL${urls.length > 1 ? `×${urls.length}` : ''}`,
      );
      (item as { status?: string; errorMessage?: string }).status = 'success';
      (item as { status?: string; errorMessage?: string }).errorMessage = undefined;
      store.updateStats();
      return;
    }

    window.prompt('复制下面内容（Ctrl+C）', text);
    toastr.info('已弹出复制框');
  } catch (error) {
    window.prompt('复制下面内容（Ctrl+C）', text);
    toastr.error(`自动复制失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #1f2937;
}

.panel {
  display: flex;
  flex-direction: column;
  width: 92vw;
  max-width: 1100px;
  height: 88vh;
  max-height: 800px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.panel-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.btn-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}
.btn-close:hover {
  background: #f3f4f6;
  color: #111;
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  color: #6b7280;
}
.panel-empty code {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}
.choose-hint {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}
.empty-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.panel-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 180px;
  flex-shrink: 0;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sidebar-section {
  padding: 10px;
}
.sidebar--drawer {
  width: min(78vw, 320px);
  height: 100%;
  max-height: none;
  border-right: 1px solid #e5e7eb;
  border-radius: 0;
}

.sidebar-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000002;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
}

.sidebar--drawer {
  background: #f9fafb;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.hamburger-btn {
  display: none;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .sidebar--desktop {
    display: none;
  }
  .hamburger-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    font-size: 18px;
    line-height: 1;
  }
}
.manifest-info {
  padding: 6px 12px 10px;
  border-bottom: 1px solid #e5e7eb;
}
.manifest-name {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.manifest-version {
  font-size: 11px;
  color: #6b7280;
}

.folder-tree {
  padding: 8px 6px;
  border-bottom: 1px solid #e5e7eb;
}
.folder-tree-title {
  padding: 0 6px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.folder-tree-clear {
  border: none;
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
}
.folder-tree-clear:hover {
  background: #e5e7eb;
}
.folder-tree-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.folder-tree-node {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  color: #374151;
  border-radius: 6px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.folder-tree-node:hover {
  background: #e5e7eb;
}
.folder-tree-node.active {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 600;
}
.node-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-count {
  flex-shrink: 0;
  font-size: 10px;
  background: #e5e7eb;
  color: #4b5563;
  border-radius: 10px;
  padding: 1px 6px;
}

.category-nav {
  flex: 1;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.category-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  text-align: left;
  transition: background 0.15s;
}
.category-btn:hover {
  background: #e5e7eb;
}
.category-btn.active {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 600;
}
.category-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-badge {
  flex-shrink: 0;
  min-width: 20px;
  text-align: center;
  font-size: 11px;
  background: #e5e7eb;
  color: #4b5563;
  border-radius: 10px;
  padding: 1px 6px;
  margin-left: 6px;
}
.category-badge.badge-zero {
  background: #f3f4f6;
  color: #9ca3af;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.loading-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent 0%, #2d6cdf 50%, transparent 100%);
  background-size: 180% 100%;
  animation: loading-bar-move 1.1s linear infinite;
  z-index: 5;
}

@keyframes loading-bar-move {
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: 180% 0;
  }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.65);
  z-index: 4;
  pointer-events: none;
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgba(45, 108, 223, 0.25);
  border-top-color: rgba(45, 108, 223, 0.95);
  animation: spinner-rot 0.85s linear infinite;
}

@keyframes spinner-rot {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 13px;
  color: #374151;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 0 10px;
  min-width: 140px;
}
.search-icon {
  font-size: 14px;
  margin-right: 6px;
}
.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 7px 0;
  font-size: 13px;
  outline: none;
}
.toolbar-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.bulk-type {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
}

.conflict-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  font-size: 12px;
}
.conflict-label {
  color: #6b7280;
  white-space: nowrap;
}
.conflict-select {
  padding: 3px 8px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
}

.item-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
}
.item-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 6px;
  transition: border-color 0.15s;
  flex-wrap: wrap;
}
.item-card:hover {
  border-color: #93c5fd;
}
.item-card.item-success {
  border-color: #86efac;
  background: #f0fdf4;
}
.item-card.item-error {
  border-color: #fca5a5;
  background: #fef2f2;
}
.item-card.item-skipped {
  border-color: #fde68a;
  background: #fffbeb;
}
.item-card.item-duplicate {
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.45);
}

.item-checkbox {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.item-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item-name {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-name-alt {
  color: #2563eb;
  font-weight: 500;
}
.item-secondary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.item-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #6b7280;
  margin-top: 1px;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}
.item-type {
  background: #e5e7eb;
  padding: 0 5px;
  border-radius: 3px;
}
.item-type-unknown {
  background: #fee2e2;
  color: #b91c1c;
}
.item-badge {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 18px;
}
.item-badge-duplicate {
  background: #fef3c7;
  color: #92400e;
}
.item-badge-warning {
  background: #fee2e2;
  color: #b91c1c;
}
.item-path, .item-url {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-url-muted {
  color: #9ca3af;
}

.item-status-area {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  font-size: 14px;
}
.status-success { color: #16a34a; font-weight: 700; }
.status-error { color: #dc2626; font-weight: 700; }
.status-skipped { color: #d97706; font-weight: 700; }
.status-pending { color: #d1d5db; }

.item-error-msg {
  width: 100%;
  font-size: 11px;
  color: #dc2626;
  padding: 2px 0 0 26px;
}

.item-actions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.btn-action {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-import {
  background: #2563eb;
  color: #fff;
}
.btn-import:hover {
  background: #1d4ed8;
}
.btn-danger {
  background: #dc2626;
  color: #fff;
}
.btn-danger:hover {
  background: #b91c1c;
}
.btn-muted {
  background: #f3f4f6;
  color: #374151;
}
.btn-muted:hover {
  background: #e5e7eb;
}
.btn-copy {
  background: #6b7280;
  color: #fff;
}
.btn-copy:hover {
  background: #4b5563;
}
.btn-copy.btn-copy-all {
  background: #374151;
}
.btn-copy.btn-copy-all:hover {
  background: #111827;
}
.file-missing {
  font-size: 11px;
  color: #ef4444;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #9ca3af;
}

.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}
.bottom-left {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.bottom-right {
  display: flex;
  gap: 10px;
  font-size: 13px;
}
.stat-success { color: #16a34a; }
.stat-error { color: #dc2626; }
.stat-skipped { color: #d97706; }
.stat-processing { color: #6b7280; font-style: italic; }

.btn-primary {
  padding: 7px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #2563eb;
  color: #fff;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-lg {
  padding: 10px 24px;
  font-size: 15px;
}
.btn-sm {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}
.btn-sm:hover {
  background: #f3f4f6;
}
.btn-sm-active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}
.btn-sm-danger {
  color: #b91c1c;
  border-color: #fecaca;
}
.btn-sm-danger:hover:not(:disabled) {
  background: #fef2f2;
}
.btn-folder {
  width: 100%;
  padding: 7px 10px;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  color: #2563eb;
}
.btn-folder:hover {
  background: #eff6ff;
}
.btn-folder.btn-folder-danger {
  color: #dc2626;
  border-color: #fecaca;
}
.btn-folder.btn-folder-danger:hover {
  background: #fef2f2;
}

.duplicate-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  max-height: min(42vh, 420px);
  border-bottom: 1px solid #e5e7eb;
  background: #fffaf0;
  padding: 10px 14px;
  overflow: hidden;
}
.duplicate-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.duplicate-panel-title {
  min-width: 0;
}
.duplicate-panel-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.duplicate-filter-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.duplicate-panel-subtitle {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}
.duplicate-empty {
  padding: 14px 0 4px;
  color: #6b7280;
  font-size: 13px;
}
.duplicate-groups {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
  margin-top: 10px;
  overflow-y: auto;
  padding-right: 2px;
}
.duplicate-group {
  border: 1px solid #fed7aa;
  background: #fff;
  border-radius: 10px;
  padding: 10px;
}
.duplicate-group-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}
.duplicate-group-key {
  color: #9ca3af;
  font-size: 11px;
}
.duplicate-warning-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.duplicate-warning {
  font-size: 11px;
  color: #b91c1c;
  background: #fee2e2;
  border-radius: 999px;
  padding: 2px 8px;
}
.duplicate-section {
  margin-top: 10px;
}
.duplicate-section-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.duplicate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px dashed #e5e7eb;
}
.duplicate-row:first-of-type {
  border-top: none;
}
.duplicate-row-info {
  min-width: 0;
  flex: 1;
}
.duplicate-row-name {
  font-size: 13px;
  font-weight: 600;
}
.duplicate-row-meta {
  font-size: 11px;
  color: #6b7280;
  word-break: break-all;
}
.duplicate-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.dialog-mask {
  position: absolute;
  inset: 0;
  z-index: 1000003;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.dialog-card {
  width: min(720px, 100%);
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
}
.dialog-card-sm {
  width: min(520px, 100%);
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.dialog-header h3 {
  margin: 0;
  font-size: 15px;
}
.dialog-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px 0;
}
.dialog-summary--stack {
  display: block;
}
.dialog-empty {
  padding: 18px 16px 20px;
  color: #6b7280;
}
.dialog-list {
  overflow: auto;
  padding: 12px 16px 16px;
}
.dialog-row {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.dialog-row-main {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.dialog-row-main span {
  font-size: 11px;
  color: #6b7280;
}
.dialog-row-path {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
  word-break: break-all;
}
.dialog-row-reason {
  margin-top: 6px;
  font-size: 12px;
  color: #374151;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
  flex-wrap: wrap;
}
.btn-primary-danger {
  background: #dc2626;
}
.btn-primary-danger:hover:not(:disabled) {
  background: #b91c1c;
}

@media (max-width: 768px) {
  .duplicate-panel {
    max-height: 48vh;
  }
  .duplicate-panel-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .duplicate-panel-controls {
    width: 100%;
    justify-content: flex-start;
  }
  .duplicate-filter-tabs {
    width: 100%;
    justify-content: flex-start;
  }
  .toolbar {
    align-items: stretch;
    gap: 8px;
  }
  .search-box {
    flex: 1 1 calc(100% - 42px);
    min-width: 0;
  }
  .toolbar-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .toolbar-actions .bulk-type,
  .toolbar-actions .btn-sm {
    width: 100%;
    padding: 6px 8px;
  }
  .conflict-row {
    flex-wrap: wrap;
  }
  .item-card {
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
  }
  .item-info {
    flex: 1 1 calc(100% - 34px);
  }
  .item-name {
    white-space: normal;
    word-break: break-all;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .item-secondary-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }
  .item-meta {
    flex-wrap: nowrap;
    gap: 6px;
    overflow: hidden;
  }
  .item-path, .item-url {
    max-width: none;
    min-width: 0;
    flex: 1 1 auto;
  }
  .item-status-area {
    width: auto;
    margin-left: auto;
  }
  .item-error-msg {
    padding-left: 0;
  }
  .item-actions {
    width: auto;
  }
  .btn-action {
    font-size: 11px;
    white-space: nowrap;
  }
  .bottom-left, .bottom-right {
    width: 100%;
  }
  .duplicate-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .duplicate-row-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .panel {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    border-radius: 0;
  }
  .sidebar {
    width: 130px;
  }
  .item-path, .item-url {
    max-width: none;
  }
}
</style>
