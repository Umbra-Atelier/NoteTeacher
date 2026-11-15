import { ExplorerFolderTab } from '../types';

const LEGACY_TAB_COOKIE_NAME = 'noteteacher_tabs_v1';
const TAB_COOKIE_NAME = 'noteteacher_tabs_v2';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface CookieTabItem {
  id: string;
  name: string;
  iconType: 'folder' | 'file';
  sourceType: 'local_handle' | 'local_path';
  pathBreadcrumb: string;
  accessState?: 'granted' | 'permission_required';
  isSingleFileTab?: boolean;
  lastKnownPath?: string;
  fileName?: string;
}

function readCookieRaw(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.substring(name.length + 1);
    }
  }
  return null;
}

/**
 * Reads document.cookie and extracts saved v2 local tab location metadata.
 */
export function getTabCookieState(): CookieTabItem[] | null {
  if (typeof document === 'undefined') return null;

  try {
    const rawVal = readCookieRaw(TAB_COOKIE_NAME);
    if (!rawVal) return null;
    const decoded = decodeURIComponent(rawVal);
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item) =>
            item &&
            (item.sourceType === 'local_handle' || item.sourceType === 'local_path')
        )
        .map((item) => ({
          id: String(item.id),
          name: String(item.name || 'Folder'),
          iconType: item.iconType === 'file' || item.isSingleFileTab ? 'file' : 'folder',
          sourceType: item.sourceType as 'local_handle' | 'local_path',
          pathBreadcrumb: String(item.pathBreadcrumb || '/Local Device'),
          accessState:
            item.accessState === 'granted' ? 'granted' : 'permission_required',
          isSingleFileTab: Boolean(item.isSingleFileTab),
          lastKnownPath: item.lastKnownPath ? String(item.lastKnownPath) : undefined,
          fileName: item.fileName ? String(item.fileName) : undefined,
        }));
    }
  } catch (err) {
    console.warn('Failed to parse tab cookie state:', err);
  }

  return null;
}

/**
 * Saves compact local tab location metadata to document.cookie with a 30-day expiry.
 */
export function setTabCookieState(tabs: ExplorerFolderTab[]): void {
  if (typeof document === 'undefined') return;

  try {
    const serializable: CookieTabItem[] = tabs.map((t) => ({
      id: t.id,
      name: t.name,
      iconType: t.iconType === 'file' || t.isSingleFileTab ? 'file' : 'folder',
      sourceType: t.sourceType,
      pathBreadcrumb: t.pathBreadcrumb,
      accessState: t.accessState,
      isSingleFileTab: t.isSingleFileTab,
      lastKnownPath: t.lastKnownPath || t.pathBreadcrumb,
      fileName: t.fileName,
    }));

    let encoded = encodeURIComponent(JSON.stringify(serializable));

    if (encoded.length > 3800) {
      const compacted = serializable.map((item) => ({
        ...item,
        lastKnownPath:
          item.lastKnownPath && item.lastKnownPath !== item.pathBreadcrumb
            ? item.lastKnownPath
            : undefined,
      }));
      encoded = encodeURIComponent(JSON.stringify(compacted));
    }

    const secureAttr = window.location?.protocol === 'https:' ? '; Secure; SameSite=None' : '; SameSite=Lax';
    document.cookie = `${TAB_COOKIE_NAME}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE}${secureAttr}`;
  } catch (err) {
    console.warn('Failed to write tab cookie state:', err);
  }
}

/**
 * Removes both legacy v1 and current v2 tab cookies.
 */
export function clearTabCookieState(): void {
  if (typeof document === 'undefined') return;
  const secureAttr = window.location?.protocol === 'https:' ? '; Secure; SameSite=None' : '; SameSite=Lax';
  document.cookie = `${LEGACY_TAB_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${LEGACY_TAB_COOKIE_NAME}=; path=/; max-age=0${secureAttr}`;
  document.cookie = `${TAB_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${TAB_COOKIE_NAME}=; path=/; max-age=0${secureAttr}`;
}
