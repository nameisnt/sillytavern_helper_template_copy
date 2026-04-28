export const CATEGORY_LIST = [
  { id: 'all', label: '全部' },
  { id: 'preset', label: '预设' },
  { id: 'worldbook', label: '世界书' },
  { id: 'character', label: '角色卡' },
  { id: 'regex', label: '正则' },
  { id: 'chat', label: '聊天' },
  { id: 'script', label: '脚本' },
  { id: 'background', label: '背景图' },
  { id: 'resource', label: '资源' },
  { id: 'theme', label: '美化' },
  { id: 'extension_url', label: '扩展URL' },
  { id: 'unsupported', label: '未支持' },
] as const;

export type CategoryId = (typeof CATEGORY_LIST)[number]['id'];

export interface ManifestItem {
  type: string;
  path?: string;
  url?: string;
  name?: string;
}

export interface Manifest {
  name?: string;
  version?: string;
  items: ManifestItem[];
}

export type ImportStatus = 'pending' | 'success' | 'error' | 'skipped';
export type ConflictStrategy = 'skip' | 'overwrite' | 'rename';
export type DuplicateSource = 'none' | 'folder' | 'tavern' | 'mixed';
export type DuplicateFilter = 'all' | 'duplicate' | 'normal';
export type SortKey = 'default' | 'name' | 'type' | 'path' | 'status' | 'duplicate';
export type SortOrder = 'asc' | 'desc';
export type StatusFilter = 'all' | ImportStatus;

export interface TavernResourceMatch {
  id: string;
  type: string;
  name: string;
  path?: string;
  compareKey: string;
  detail?: string;
  canDelete?: boolean;
  meta?: {
    avatar?: string;
    chatName?: string;
    extensionId?: string;
  };
}

export interface ImportEntry extends ManifestItem {
  id: string;
  displayName: string;
  file?: File;
  existsInFolder: boolean;
  status: ImportStatus;
  errorMessage?: string;
  fromManifest?: boolean;
  urls?: string[];
  urlTags?: string[];
  extensionId?: string;
  extensionName?: string;
  extensionDesc?: string;
  recognizedName?: string;
  compareKey?: string;
  duplicateSource?: DuplicateSource;
  duplicateGroupId?: string;
  duplicateCount?: number;
  duplicateReason?: string;
  tavernMatches?: TavernResourceMatch[];
  warnings?: string[];
  canDeleteSourceFile?: boolean;
  sourceDeletePath?: string;
  sourceDeleteReason?: string;
}

export function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    unknown: '请选择类型',
    auto_json: '自动识别(JSON)',
    preset: '预设',
    worldbook: '世界书',
    character: '角色卡',
    regex: '正则',
    chat: '聊天',
    script: '脚本',
    background: '背景图',
    resource: '资源',
    theme: '美化',
    extension_url: '扩展URL',
  };
  return map[type] || type;
}

export function categorizeType(type: string): CategoryId {
  const known = ['preset', 'worldbook', 'character', 'regex', 'chat', 'script', 'theme', 'background'];
  if (known.includes(type)) return type as CategoryId;
  if (type === 'extension_url') return 'extension_url';
  if (['image', 'audio', 'video', 'resource'].includes(type)) return 'resource';
  return 'unsupported';
}
