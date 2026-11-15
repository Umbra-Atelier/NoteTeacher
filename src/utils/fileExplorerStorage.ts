import {
  ActiveFileContext,
  ExplorerFileItem,
  ExplorerFolderTab,
  ExplorerTreeNode,
} from '../types';
import { clearTabCookieState, getTabCookieState, setTabCookieState } from './cookieUtils';

const DB_NAME = 'noteteacher_file_explorer_db';
const DB_VERSION = 2;
const STORE_HANDLES = 'folder_handles';
const STORE_FILE_HANDLES = 'single_file_handles';
const SCHEMA_VERSION_KEY = 'noteteacher_explorer_schema_version';
const CURRENT_SCHEMA_VERSION = '2';

const LOCAL_STORAGE_TABS_KEY = 'noteteacher_explorer_tabs_meta';
const LOCAL_STORAGE_ACTIVE_FILE_KEY = 'noteteacher_active_file_context';
const LEGACY_DRIVES_KEY = 'noteteacher_connected_drives';

const SUPPORTED_EXTENSIONS = new Set([
  '.noteteacher',
  '.pdf',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.one',
]);

export function isSupportedExplorerExtension(filename: string): boolean {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return false;
  return SUPPORTED_EXTENSIONS.has(filename.slice(idx).toLowerCase());
}

export function extractFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx !== -1 ? filename.slice(idx).toLowerCase() : '.file';
}

// Open IndexedDB for FileSystemHandle persistence
function openExplorerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'tabId' });
      }
      if (!db.objectStoreNames.contains(STORE_FILE_HANDLES)) {
        db.createObjectStore(STORE_FILE_HANDLES, { keyPath: 'tabId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearIndexedDbHandles(): Promise<void> {
  try {
    const db = await openExplorerDb();
    const storeNames = [STORE_HANDLES, STORE_FILE_HANDLES].filter((name) =>
      db.objectStoreNames.contains(name)
    );
    if (storeNames.length === 0) return;
    const tx = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
      tx.objectStore(storeName).clear();
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to clear IndexedDB explorer handles:', err);
  }
}

/**
 * One-time migration cleanly purging all legacy sample tabs, v1 cookies, localStorage, and handles.
 */
export async function runExplorerCleanupMigration(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    // Always purge deprecated cloud drive connection metadata
    localStorage.removeItem(LEGACY_DRIVES_KEY);

    const existingVersion = localStorage.getItem(SCHEMA_VERSION_KEY);
    if (existingVersion === CURRENT_SCHEMA_VERSION) {
      return false;
    }
    clearTabCookieState();
    localStorage.removeItem(LOCAL_STORAGE_TABS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_ACTIVE_FILE_KEY);
    await clearIndexedDbHandles();
    localStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
    return true;
  } catch (err) {
    console.warn('Explorer cleanup migration failed:', err);
    return false;
  }
}

/**
 * Full manual reset of all explorer tabs, cookies, localStorage, and handles.
 */
export async function resetAllExplorerStorage(): Promise<void> {
  clearTabCookieState();
  try {
    localStorage.removeItem(LOCAL_STORAGE_TABS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_ACTIVE_FILE_KEY);
    localStorage.removeItem(LEGACY_DRIVES_KEY);
    localStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
  } catch {}
  await clearIndexedDbHandles();
}

// Store directory handle in IndexedDB
export async function saveDirectoryHandle(
  tabId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const db = await openExplorerDb();
    const tx = db.transaction(STORE_HANDLES, 'readwrite');
    tx.objectStore(STORE_HANDLES).put({ tabId, handle });
    await new Promise((res, rej) => {
      tx.oncomplete = () => res(undefined);
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save directory handle in IndexedDB:', err);
  }
}

// Retrieve directory handle from IndexedDB
export async function getDirectoryHandle(
  tabId: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openExplorerDb();
    const tx = db.transaction(STORE_HANDLES, 'readonly');
    const req = tx.objectStore(STORE_HANDLES).get(tabId);
    return new Promise((res) => {
      req.onsuccess = () => res(req.result?.handle || null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

// Store single file handle in IndexedDB
export async function saveSingleFileHandle(
  tabId: string,
  handle: FileSystemFileHandle
): Promise<void> {
  try {
    const db = await openExplorerDb();
    const tx = db.transaction(STORE_FILE_HANDLES, 'readwrite');
    tx.objectStore(STORE_FILE_HANDLES).put({ tabId, handle });
    await new Promise((res, rej) => {
      tx.oncomplete = () => res(undefined);
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save single file handle in IndexedDB:', err);
  }
}

export async function getSingleFileHandle(
  tabId: string
): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openExplorerDb();
    const tx = db.transaction(STORE_FILE_HANDLES, 'readonly');
    const req = tx.objectStore(STORE_FILE_HANDLES).get(tabId);
    return new Promise((res) => {
      req.onsuccess = () => res(req.result?.handle || null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

// Remove directory or file handle from IndexedDB
export async function deleteDirectoryHandle(tabId: string): Promise<void> {
  try {
    const db = await openExplorerDb();
    const stores = [STORE_HANDLES, STORE_FILE_HANDLES].filter((s) =>
      db.objectStoreNames.contains(s)
    );
    if (stores.length === 0) return;
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) {
      tx.objectStore(s).delete(tabId);
    }
  } catch (err) {
    console.warn('Failed to delete handle:', err);
  }
}

// Check current permission without prompting (silent startup check) or prompt when user clicks
export async function queryHandlePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> {
  try {
    const opts = { mode };
    // @ts-expect-error queryPermission
    return (await handle.queryPermission(opts)) === 'granted';
  } catch {
    return false;
  }
}

// Request permission interactively (must be from user gesture)
export async function verifyHandlePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'read',
  allowPrompt = true
): Promise<boolean> {
  try {
    const opts = { mode };
    // @ts-expect-error queryPermission
    if ((await handle.queryPermission(opts)) === 'granted') {
      return true;
    }
    if (!allowPrompt) return false;
    // @ts-expect-error requestPermission
    if ((await handle.requestPermission(opts)) === 'granted') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Scan a directory handle and reconcile against previously saved file entries to surface missing/renamed files
export async function scanDirectoryFiles(
  dirHandle: FileSystemDirectoryHandle,
  folderBreadcrumb: string,
  previousFiles: ExplorerFileItem[] = []
): Promise<ExplorerFileItem[]> {
  const files: ExplorerFileItem[] = [];
  const seenNames = new Set<string>();

  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const name = fileHandle.name;
        if (!isSupportedExplorerExtension(name)) continue;

        const ext = extractFileExtension(name);
        seenNames.add(name);
        try {
          const file = await fileHandle.getFile();
          files.push({
            id: `${dirHandle.name}__${name}`,
            name,
            extension: ext,
            sizeBytes: file.size,
            lastModified: file.lastModified,
            pathBreadcrumb: `${folderBreadcrumb}/${name}`,
            sourceType: 'local_handle',
            fileHandle,
            isMissing: false,
          });
        } catch {
          files.push({
            id: `${dirHandle.name}__${name}`,
            name,
            extension: ext,
            sizeBytes: 0,
            lastModified: Date.now(),
            pathBreadcrumb: `${folderBreadcrumb}/${name}`,
            sourceType: 'local_handle',
            fileHandle,
            isMissing: true,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Error scanning directory handle:', err);
  }

  // Flag previously known files that disappeared externally
  for (const prev of previousFiles) {
    if (!seenNames.has(prev.name)) {
      files.push({
        ...prev,
        isMissing: true,
      });
    }
  }

  return files.sort((a, b) => Number(Boolean(a.isMissing)) - Number(Boolean(b.isMissing)) || b.lastModified - a.lastModified);
}

// Recursively scan subdirectories for the Classic Explorer left tree & folder navigation
export async function scanLocalDirectoryTree(
  dirHandle: FileSystemDirectoryHandle,
  folderBreadcrumb: string,
  depth = 0,
  maxDepth = 3
): Promise<ExplorerTreeNode[]> {
  if (depth >= maxDepth) return [];
  const children: ExplorerTreeNode[] = [];
  try {
    for await (const entry of dirHandle.values()) {
      const childPath = `${folderBreadcrumb}/${entry.name}`;
      if (entry.kind === 'directory') {
        const subHandle = entry as FileSystemDirectoryHandle;
        const subChildren = await scanLocalDirectoryTree(subHandle, childPath, depth + 1, maxDepth);
        children.push({
          id: `${childPath}__dir`,
          name: entry.name,
          path: childPath,
          type: 'folder',
          children: subChildren,
        });
      } else if (entry.kind === 'file' && isSupportedExplorerExtension(entry.name)) {
        const fileHandle = entry as FileSystemFileHandle;
        try {
          const file = await fileHandle.getFile();
          const ext = extractFileExtension(entry.name);
          children.push({
            id: `${childPath}__file`,
            name: entry.name,
            path: childPath,
            type: 'file',
            extension: ext,
            sizeBytes: file.size,
            lastModified: file.lastModified,
            fileItem: {
              id: `${dirHandle.name}__${entry.name}`,
              name: entry.name,
              extension: ext,
              sizeBytes: file.size,
              lastModified: file.lastModified,
              pathBreadcrumb: childPath,
              sourceType: 'local_handle',
              fileHandle,
              isMissing: false,
            },
          });
        } catch {
          // Ignore unreadable individual entries during tree traversal
        }
      }
    }
  } catch (err) {
    console.warn('Error scanning local directory tree:', err);
  }

  return children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Convert files selected via fallback <input type="file" webkitdirectory />
export function parseUploadedFolderFiles(
  fileList: FileList,
  folderName: string,
  pathBreadcrumb: string
): ExplorerFileItem[] {
  const files: ExplorerFileItem[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const name = file.name;
    if (!isSupportedExplorerExtension(name)) continue;
    const ext = extractFileExtension(name);
    const fullRel = file.webkitRelativePath ? file.webkitRelativePath : `${folderName}/${name}`;
    const innerRel = fullRel.startsWith(`${folderName}/`)
      ? fullRel.slice(folderName.length + 1)
      : fullRel;
    files.push({
      id: `${folderName}__${fullRel}__${file.size}`,
      name,
      extension: ext,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      pathBreadcrumb: `${pathBreadcrumb}/${innerRel}`,
      relativePath: innerRel,
      sourceType: 'local_path',
      isMissing: false,
    });
  }
  return files.sort((a, b) => b.lastModified - a.lastModified);
}

// Write a file directly into a local FileSystemDirectoryHandle (used by Classic Explorer "Save Copy Here")
export async function writeFileToDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: Blob | string
): Promise<FileSystemFileHandle> {
  const granted = await verifyHandlePermission(dirHandle, 'readwrite', true);
  if (!granted) {
    throw new Error('Write permission was not granted for this local folder.');
  }
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

// Cookie and LocalStorage synchronization for Local Tab metadata
export function loadSavedFolderTabs(): ExplorerFolderTab[] {
  try {
    const schemaVer = localStorage.getItem(SCHEMA_VERSION_KEY);
    if (schemaVer !== CURRENT_SCHEMA_VERSION) {
      return [];
    }

    const cookieTabs = getTabCookieState();
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_TABS_KEY);
    const localTabs: Array<Record<string, unknown>> = rawLocal ? JSON.parse(rawLocal) : [];

    const isLocalTab = (t: Record<string, unknown>) =>
      t &&
      t.id !== 'tab-sample-math' &&
      (t.sourceType === 'local_handle' || t.sourceType === 'local_path') &&
      !t.isClassicOnly;

    const cleanLocalTabs: ExplorerFolderTab[] = Array.isArray(localTabs)
      ? localTabs
          .filter(isLocalTab)
          .map((t) => ({
            id: String(t.id),
            name: String(t.name || 'Folder'),
            iconType: t.iconType === 'file' || t.isSingleFileTab ? 'file' : 'folder',
            sourceType: t.sourceType as 'local_handle' | 'local_path',
            pathBreadcrumb: String(t.pathBreadcrumb || '/Local Device'),
            accessState:
              t.accessState === 'granted' ? 'granted' : 'permission_required',
            isSingleFileTab: Boolean(t.isSingleFileTab),
            lastKnownPath: String(t.lastKnownPath || t.pathBreadcrumb || '/Local Device'),
            fileName: t.fileName ? String(t.fileName) : undefined,
            files: Array.isArray(t.files)
              ? (t.files as ExplorerFileItem[]).filter(
                  (f) => f.sourceType === 'local_handle' || f.sourceType === 'local_path'
                )
              : [],
            missingCount: Number(t.missingCount || 0),
          }))
      : [];

    if (cookieTabs && cookieTabs.length > 0) {
      return cookieTabs
        .filter((c) => c.id !== 'tab-sample-math')
        .map((c) => {
          const localMatch = cleanLocalTabs.find((l) => l.id === c.id);
          return {
            id: c.id,
            name: c.name,
            iconType: c.iconType === 'file' || c.isSingleFileTab ? 'file' : 'folder',
            sourceType: c.sourceType,
            pathBreadcrumb: c.pathBreadcrumb,
            accessState: c.accessState || localMatch?.accessState || 'permission_required',
            isSingleFileTab: c.isSingleFileTab ?? localMatch?.isSingleFileTab ?? false,
            lastKnownPath: c.lastKnownPath || localMatch?.lastKnownPath || c.pathBreadcrumb,
            fileName: c.fileName || localMatch?.fileName,
            files: localMatch?.files || [],
            missingCount: localMatch?.missingCount || 0,
          };
        });
    }

    return cleanLocalTabs;
  } catch (err) {
    console.warn('Failed to parse saved folder tabs:', err);
  }
  return [];
}

export function saveFolderTabs(tabs: ExplorerFolderTab[]): void {
  try {
    const cleanTabs = tabs.filter(
      (t) =>
        t.id !== 'tab-sample-math' &&
        (t.sourceType === 'local_handle' || t.sourceType === 'local_path')
    );

    // 1. Synchronize compact location metadata to document.cookie
    setTabCookieState(cleanTabs);

    // 2. Strip FileSystemHandles before serializing to localStorage
    const serializable = cleanTabs.map((t) => ({
      id: t.id,
      name: t.name,
      iconType: t.iconType === 'file' || t.isSingleFileTab ? 'file' : 'folder',
      sourceType: t.sourceType,
      pathBreadcrumb: t.pathBreadcrumb,
      accessState: t.accessState,
      isSingleFileTab: t.isSingleFileTab,
      lastKnownPath: t.lastKnownPath || t.pathBreadcrumb,
      fileName: t.fileName,
      files: t.files.map((f) => ({
        id: f.id,
        name: f.name,
        extension: f.extension,
        sizeBytes: f.sizeBytes,
        lastModified: f.lastModified,
        pathBreadcrumb: f.pathBreadcrumb,
        relativePath: f.relativePath,
        sourceType: f.sourceType,
        isMissing: f.isMissing,
      })),
      missingCount: t.missingCount,
    }));
    localStorage.setItem(LOCAL_STORAGE_TABS_KEY, JSON.stringify(serializable));
  } catch (err) {
    console.warn('Failed to save folder tabs to localStorage:', err);
  }
}

// Active file context persistence
export function getSavedActiveFileContext(): ActiveFileContext | null {
  try {
    if (localStorage.getItem(SCHEMA_VERSION_KEY) !== CURRENT_SCHEMA_VERSION) return null;
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIVE_FILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveFileContext;
      if (parsed && (parsed.sourceType === 'local_handle' || parsed.sourceType === 'local_path')) {
        return parsed;
      }
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_FILE_KEY);
    }
  } catch {}
  return null;
}

export function saveActiveFileContext(ctx: ActiveFileContext | null): void {
  try {
    if (ctx) {
      const { fileHandle, ...serializable } = ctx;
      localStorage.setItem(LOCAL_STORAGE_ACTIVE_FILE_KEY, JSON.stringify(serializable));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_FILE_KEY);
    }
  } catch {}
}

// Format bytes into human readable format
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format timestamp into clean relative / localized date
export function formatFileDate(timestamp: number): string {
  if (!timestamp) return 'Unknown';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
