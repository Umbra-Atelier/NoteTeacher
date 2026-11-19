import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Home,
  Folder,
  FileText,
  FolderPlus,
  FilePlus,
  Plus,
  X,
  RefreshCw,
  FolderTree,
  Lock,
  AlertCircle,
  Info,
} from 'lucide-react';
import {
  ExplorerFileItem,
  ExplorerFolderTab,
  ActiveFileContext,
  SaveAsMode,
} from '../../types';
import { HomeDashboardTab } from './HomeDashboardTab';
import { FolderContentsTab } from './FolderContentsTab';
import { MissingFilesModal } from './MissingFilesModal';
import { MoveFileModal } from './MoveFileModal';
import { ClassicFileExplorerModal } from './ClassicFileExplorerModal';
import { DeleteTabConfirmModal } from './DeleteTabConfirmModal';
import {
  loadSavedFolderTabs,
  saveFolderTabs,
  getDirectoryHandle,
  saveDirectoryHandle,
  getSingleFileHandle,
  saveSingleFileHandle,
  deleteDirectoryHandle,
  queryHandlePermission,
  verifyHandlePermission,
  scanDirectoryFiles,
  parseUploadedFolderFiles,
  runExplorerCleanupMigration,
  resetAllExplorerStorage,
  extractFileExtension,
  EXPLORER_TABS_UPDATED_EVENT,
  setSessionFileRef,
  getSessionFileRef,
  deleteSessionFileRef,
  clearSessionFileRefs,
} from '../../utils/fileExplorerStorage';

interface FileExplorerViewProps {
  onOpenFile: (file: ExplorerFileItem, rawFile?: File) => void;
  onCloseModal: () => void;
  activeFileContext?: ActiveFileContext | null;
  onSaveToDirectory?: (
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    saveMode: SaveAsMode,
    pathBreadcrumb: string
  ) => Promise<void>;
  onDownloadFallback?: (fileName: string, saveMode: SaveAsMode) => Promise<void>;
  onShareFallback?: (fileName: string, saveMode: SaveAsMode) => Promise<void>;
}

export const FileExplorerView: React.FC<FileExplorerViewProps> = ({
  onOpenFile,
  onCloseModal,
  activeFileContext,
  onSaveToDirectory,
  onDownloadFallback,
  onShareFallback,
}) => {
  const [activeTabId, setActiveTabId] = useState<string>('home');
  const [folderTabs, setFolderTabs] = useState<ExplorerFolderTab[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [reloadingTabId, setReloadingTabId] = useState<string | null>(null);
  const [explorerBannerError, setExplorerBannerError] = useState<string | null>(null);
  const [explorerInfoNotice, setExplorerInfoNotice] = useState<string | null>(null);
  const [showAddTabMenu, setShowAddTabMenu] = useState(false);

  // Modals state
  const [missingFilesFolder, setMissingFilesFolder] = useState<ExplorerFolderTab | null>(null);
  const [movingFile, setMovingFile] = useState<ExplorerFileItem | null>(null);
  const [movingSourceTabId, setMovingSourceTabId] = useState<string | null>(null);
  const [pendingDeleteTab, setPendingDeleteTab] = useState<ExplorerFolderTab | null>(null);
  const [showClassicExplorer, setShowClassicExplorer] = useState(false);
  const [classicSelectedTabId, setClassicSelectedTabId] = useState<string | null>(null);

  // Hidden system input fallbacks
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reshareTargetTabIdRef = useRef<string | null>(null);
  const folderTabsRef = useRef<ExplorerFolderTab[]>([]);
  const addTabMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    folderTabsRef.current = folderTabs;
  }, [folderTabs]);

  useEffect(() => {
    if (!showAddTabMenu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (addTabMenuRef.current && !addTabMenuRef.current.contains(e.target as Node)) {
        setShowAddTabMenu(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [showAddTabMenu]);

  // Rehydrate directory/file handles silently
  const rehydrateExplorerState = useCallback(async (tabs: ExplorerFolderTab[]) => {
    setIsScanning(true);
    setExplorerBannerError(null);
    const updatedTabs: ExplorerFolderTab[] = [];

    for (const tab of tabs) {
      if (tab.sourceType === 'local_handle') {
        if (tab.isSingleFileTab) {
          const fh = await getSingleFileHandle(tab.id);
          if (fh) {
            const hasPerm = await queryHandlePermission(fh, 'read');
            if (hasPerm) {
              try {
                const file = await fh.getFile();
                const ext = extractFileExtension(file.name);
                const fileItem: ExplorerFileItem = {
                  id: `${tab.id}__${file.name}`,
                  name: file.name,
                  extension: ext,
                  sizeBytes: file.size,
                  lastModified: file.lastModified,
                  pathBreadcrumb: tab.pathBreadcrumb,
                  sourceType: 'local_handle',
                  fileHandle: fh,
                  isMissing: false,
                };
                updatedTabs.push({
                  ...tab,
                  fileName: file.name,
                  files: [fileItem],
                  missingCount: 0,
                  accessState: 'granted',
                });
                continue;
              } catch {
                // File missing or unreadable
              }
            }
          }
          updatedTabs.push({
            ...tab,
            accessState: 'permission_required',
          });
          continue;
        }

        const dirHandle = await getDirectoryHandle(tab.id);
        if (dirHandle) {
          const hasPerm = await queryHandlePermission(dirHandle, 'read');
          if (hasPerm) {
            const freshFiles = await scanDirectoryFiles(
              dirHandle,
              tab.pathBreadcrumb,
              tab.files
            );
            updatedTabs.push({
              ...tab,
              dirHandle,
              files: freshFiles,
              missingCount: freshFiles.filter((f) => f.isMissing).length,
              accessState: 'granted',
            });
            continue;
          }
        }
        updatedTabs.push({
          ...tab,
          accessState: 'permission_required',
        });
        continue;
      }

      if (tab.sourceType === 'local_path') {
        const hasSessionFiles = tab.files.some((f) => Boolean(getSessionFileRef(f.id)));
        updatedTabs.push({
          ...tab,
          accessState: hasSessionFiles ? 'granted' : 'permission_required',
        });
        continue;
      }
    }

    setFolderTabs(updatedTabs);
    saveFolderTabs(updatedTabs);
    setIsScanning(false);
  }, []);

  // Initial mount: run cleanup migration and rehydrate local handles
  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      await runExplorerCleanupMigration();
      if (!active) return;

      const savedTabs = loadSavedFolderTabs();
      setFolderTabs(savedTabs);

      if (savedTabs.length > 0) {
        await rehydrateExplorerState(savedTabs);
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [rehydrateExplorerState]);

  useEffect(() => {
    const handleTabsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<ExplorerFolderTab[] | undefined>).detail;
      const latest = Array.isArray(detail) ? detail : loadSavedFolderTabs();
      setFolderTabs(latest);
    };
    window.addEventListener(EXPLORER_TABS_UPDATED_EVENT, handleTabsUpdated);
    return () => {
      window.removeEventListener(EXPLORER_TABS_UPDATED_EVENT, handleTabsUpdated);
    };
  }, []);

  // Reload single tab handler
  const handleReloadTab = async (tabId: string) => {
    setReloadingTabId(tabId);
    setExplorerBannerError(null);
    const target = folderTabs.find((t) => t.id === tabId);
    if (!target) {
      setReloadingTabId(null);
      return;
    }

    try {
      if (target.sourceType === 'local_handle') {
        if (target.isSingleFileTab) {
          const fh = await getSingleFileHandle(tabId);
          if (fh && (await verifyHandlePermission(fh, 'read', true))) {
            try {
              const file = await fh.getFile();
              const item: ExplorerFileItem = {
                id: `${tabId}__${file.name}`,
                name: file.name,
                extension: extractFileExtension(file.name),
                sizeBytes: file.size,
                lastModified: file.lastModified,
                pathBreadcrumb: target.pathBreadcrumb,
                sourceType: 'local_handle',
                fileHandle: fh,
                isMissing: false,
              };
              const updated = folderTabs.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      fileName: file.name,
                      files: [item],
                      missingCount: 0,
                      accessState: 'granted' as const,
                    }
                  : t
              );
              setFolderTabs(updated);
              saveFolderTabs(updated);
            } catch {
              const missingFile = target.files[0]
                ? [{ ...target.files[0], isMissing: true }]
                : [];
              const updated = folderTabs.map((t) =>
                t.id === tabId
                  ? { ...t, files: missingFile, missingCount: missingFile.length }
                  : t
              );
              setFolderTabs(updated);
              saveFolderTabs(updated);
            }
          } else {
            const updated = folderTabs.map((t) =>
              t.id === tabId ? { ...t, accessState: 'permission_required' as const } : t
            );
            setFolderTabs(updated);
            saveFolderTabs(updated);
          }
        } else {
          const handle = target.dirHandle || (await getDirectoryHandle(tabId));
          if (handle && (await verifyHandlePermission(handle, 'read', true))) {
            const freshFiles = await scanDirectoryFiles(
              handle,
              target.pathBreadcrumb,
              target.files
            );
            const updated = folderTabs.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    dirHandle: handle,
                    files: freshFiles,
                    missingCount: freshFiles.filter((f) => f.isMissing).length,
                    accessState: 'granted' as const,
                  }
                : t
            );
            setFolderTabs(updated);
            saveFolderTabs(updated);
          } else {
            const updated = folderTabs.map((t) =>
              t.id === tabId ? { ...t, accessState: 'permission_required' as const } : t
            );
            setFolderTabs(updated);
            saveFolderTabs(updated);
          }
        }
      } else {
        saveFolderTabs(folderTabs);
      }
    } catch (err) {
      setExplorerBannerError(
        err instanceof Error ? err.message : 'Unable to reload tab contents.'
      );
    } finally {
      setReloadingTabId(null);
    }
  };

  const findMatchingFolderTab = async (
    tabs: ExplorerFolderTab[],
    folderName: string,
    pathBreadcrumb: string,
    dirHandle?: FileSystemDirectoryHandle
  ): Promise<ExplorerFolderTab | undefined> => {
    if (dirHandle) {
      for (const t of tabs) {
        if (t.isSingleFileTab) continue;
        const candidateHandle =
          t.dirHandle || (t.sourceType === 'local_handle' ? await getDirectoryHandle(t.id) : null);
        if (candidateHandle && typeof dirHandle.isSameEntry === 'function') {
          try {
            if (await dirHandle.isSameEntry(candidateHandle)) {
              return t;
            }
          } catch {}
        }
      }
    }
    return tabs.find(
      (t) =>
        !t.isSingleFileTab &&
        (t.pathBreadcrumb === pathBreadcrumb ||
          t.lastKnownPath === pathBreadcrumb ||
          t.name === folderName)
    );
  };

  const findMatchingSingleFileTab = async (
    tabs: ExplorerFolderTab[],
    fileName: string,
    pathBreadcrumb: string,
    fileHandle?: FileSystemFileHandle
  ): Promise<ExplorerFolderTab | undefined> => {
    if (fileHandle) {
      for (const t of tabs) {
        if (!t.isSingleFileTab) continue;
        const candidateHandle =
          t.sourceType === 'local_handle' ? await getSingleFileHandle(t.id) : null;
        if (candidateHandle && typeof fileHandle.isSameEntry === 'function') {
          try {
            if (await fileHandle.isSameEntry(candidateHandle)) {
              return t;
            }
          } catch {}
        }
      }
    }
    return tabs.find(
      (t) =>
        t.isSingleFileTab &&
        (t.pathBreadcrumb === pathBreadcrumb || t.fileName === fileName || t.name === fileName)
    );
  };

  // Add Folder tab via Native File System Access API or browser folder picker fallback
  const executeAddFolder = async () => {
    setShowAddTabMenu(false);
    setExplorerBannerError(null);
    setExplorerInfoNotice(null);
    reshareTargetTabIdRef.current = null;

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        // @ts-expect-error showDirectoryPicker options
        const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
          mode: 'read',
        });
        const folderName = dirHandle.name;
        const pathBreadcrumb = `/Local Device/${folderName}`;
        const currentTabs = folderTabsRef.current;
        const existingTab = await findMatchingFolderTab(
          currentTabs,
          folderName,
          pathBreadcrumb,
          dirHandle
        );

        const targetTabId = existingTab ? existingTab.id : `tab-dir-${Date.now()}`;
        const files = await scanDirectoryFiles(
          dirHandle,
          existingTab?.pathBreadcrumb || pathBreadcrumb,
          existingTab?.files
        );
        await saveDirectoryHandle(targetTabId, dirHandle);

        if (existingTab) {
          existingTab.files.forEach((f) => deleteSessionFileRef(f.id));
          const updated = currentTabs.map((t) =>
            t.id === existingTab.id
              ? {
                  ...t,
                  name: folderName,
                  sourceType: 'local_handle' as const,
                  pathBreadcrumb: t.pathBreadcrumb || pathBreadcrumb,
                  dirHandle,
                  files,
                  missingCount: files.filter((f) => f.isMissing).length,
                  accessState: 'granted' as const,
                  lastKnownPath: t.lastKnownPath || pathBreadcrumb,
                }
              : t
          );
          setFolderTabs(updated);
          saveFolderTabs(updated);
          setActiveTabId(existingTab.id);
          setExplorerInfoNotice(`Permission re-granted for "${folderName}".`);
          return;
        }

        const newTab: ExplorerFolderTab = {
          id: targetTabId,
          name: folderName,
          iconType: 'folder',
          sourceType: 'local_handle',
          pathBreadcrumb,
          dirHandle,
          files,
          missingCount: files.filter((f) => f.isMissing).length,
          accessState: 'granted',
          lastKnownPath: pathBreadcrumb,
        };

        const updated = [...currentTabs, newTab];
        setFolderTabs(updated);
        saveFolderTabs(updated);
        setActiveTabId(targetTabId);
        return;
      } catch (err: unknown) {
        const errName = (err as Error)?.name;
        if (errName === 'AbortError') return;
        console.warn('showDirectoryPicker failed, falling back to input:', err);
        if (errName === 'SecurityError') {
          setExplorerInfoNotice(
            'Your browser blocked the native folder permission dialog inside this embedded frame. Using the built-in folder picker instead — files remain private on your device.'
          );
        } else {
          setExplorerInfoNotice(
            'Native persistent read permissions are unavailable in this browser context, so the standard folder picker opened. Files remain local on your device.'
          );
        }
      }
    }

    folderInputRef.current?.click();
  };

  // Fallback Directory Input Handler (updates existing matching folder tab in place instead of duplicating)
  const handleFallbackFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const explicitTargetId = reshareTargetTabIdRef.current;
    reshareTargetTabIdRef.current = null;

    if (fileList && fileList.length > 0) {
      const currentTabs = folderTabsRef.current;
      const rawRel = fileList[0].webkitRelativePath || '';
      const hasFolderSegment = rawRel.includes('/');
      const detectedFolderName = hasFolderSegment
        ? rawRel.split('/')[0] || 'Selected Folder'
        : 'Selected Folder';
      const detectedPath = `/Local Device/${detectedFolderName}`;

      const explicitTarget = explicitTargetId
        ? currentTabs.find((t) => t.id === explicitTargetId)
        : undefined;
      const matchedExisting =
        explicitTarget ||
        (hasFolderSegment
          ? currentTabs.find(
              (t) =>
                !t.isSingleFileTab &&
                (t.pathBreadcrumb === detectedPath ||
                  t.lastKnownPath === detectedPath ||
                  t.name === detectedFolderName)
            )
          : undefined);

      const finalFolderName = hasFolderSegment
        ? detectedFolderName
        : matchedExisting?.name || detectedFolderName;
      const finalPath = matchedExisting?.pathBreadcrumb || `/Local Device/${finalFolderName}`;

      const parsedFiles = parseUploadedFolderFiles(fileList, finalFolderName, finalPath);
      if (matchedExisting) {
        matchedExisting.files.forEach((f) => deleteSessionFileRef(f.id));
      }
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const relPath = f.webkitRelativePath ? f.webkitRelativePath : `${finalFolderName}/${f.name}`;
        const fileId = `${finalFolderName}__${relPath}__${f.size}`;
        setSessionFileRef(fileId, f);
      }

      if (matchedExisting) {
        const updated = currentTabs.map((t) =>
          t.id === matchedExisting.id
            ? {
                ...t,
                name: finalFolderName,
                sourceType: 'local_path' as const,
                dirHandle: undefined,
                pathBreadcrumb: finalPath,
                files: parsedFiles,
                missingCount: 0,
                accessState: 'granted' as const,
                lastKnownPath: finalPath,
              }
            : t
        );
        setFolderTabs(updated);
        saveFolderTabs(updated);
        setActiveTabId(matchedExisting.id);
        setExplorerInfoNotice(`Permission re-granted for "${finalFolderName}".`);
      } else {
        const newTabId = `tab-folder-${Date.now()}`;
        const newTab: ExplorerFolderTab = {
          id: newTabId,
          name: finalFolderName,
          iconType: 'folder',
          sourceType: 'local_path',
          pathBreadcrumb: finalPath,
          files: parsedFiles,
          missingCount: 0,
          accessState: 'granted',
          lastKnownPath: finalPath,
        };

        const updated = [...currentTabs, newTab];
        setFolderTabs(updated);
        saveFolderTabs(updated);
        setActiveTabId(newTabId);
      }
    }
    e.target.value = '';
  };

  // Add Individual File tab handler (prefers showOpenFilePicker for persistent FileHandle when supported)
  const handleAddNewFile = async (explicitTargetTabId?: string) => {
    setShowAddTabMenu(false);
    setExplorerBannerError(null);
    reshareTargetTabIdRef.current = explicitTargetTabId || null;

    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        // @ts-expect-error showOpenFilePicker
        const handles: FileSystemFileHandle[] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'NoteTeacher Documents, PDFs, & Images',
              accept: {
                'application/json': ['.noteteacher', '.json'],
                'application/pdf': ['.pdf'],
                'image/*': ['.png', '.jpg', '.jpeg'],
              },
            },
          ],
        });
        if (handles && handles[0]) {
          const fh = handles[0];
          const file = await fh.getFile();
          const targetTabId = reshareTargetTabIdRef.current;
          reshareTargetTabIdRef.current = null;
          const currentTabs = folderTabsRef.current;
          const filePathBreadcrumb = `/Local Device/${file.name}`;
          const existingMatch =
            (targetTabId ? currentTabs.find((t) => t.id === targetTabId) : undefined) ||
            (await findMatchingSingleFileTab(currentTabs, file.name, filePathBreadcrumb, fh));
          const tabId = existingMatch ? existingMatch.id : `tab-file-${Date.now()}`;
          await saveSingleFileHandle(tabId, fh);

          const ext = extractFileExtension(file.name);
          const item: ExplorerFileItem = {
            id: `${tabId}__${file.name}`,
            name: file.name,
            extension: ext,
            sizeBytes: file.size,
            lastModified: file.lastModified,
            pathBreadcrumb: filePathBreadcrumb,
            sourceType: 'local_handle',
            fileHandle: fh,
            isMissing: false,
          };
          setSessionFileRef(item.id, file);

          if (existingMatch) {
            const updated = currentTabs.map((t) =>
              t.id === existingMatch.id
                ? {
                    ...t,
                    name: file.name,
                    iconType: 'file' as const,
                    fileName: file.name,
                    sourceType: 'local_handle' as const,
                    pathBreadcrumb: item.pathBreadcrumb,
                    files: [item],
                    missingCount: 0,
                    accessState: 'granted' as const,
                    isSingleFileTab: true,
                    lastKnownPath: item.pathBreadcrumb,
                  }
                : t
            );
            setFolderTabs(updated);
            saveFolderTabs(updated);
            setActiveTabId(existingMatch.id);
            setExplorerInfoNotice(`Permission re-granted for "${file.name}".`);
          } else {
            const newTab: ExplorerFolderTab = {
              id: tabId,
              name: file.name,
              iconType: 'file',
              sourceType: 'local_handle',
              pathBreadcrumb: item.pathBreadcrumb,
              files: [item],
              missingCount: 0,
              accessState: 'granted',
              isSingleFileTab: true,
              fileName: file.name,
              lastKnownPath: item.pathBreadcrumb,
            };
            const updated = [...currentTabs, newTab];
            setFolderTabs(updated);
            saveFolderTabs(updated);
            onOpenFile(item, file);
            onCloseModal();
          }
          return;
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          reshareTargetTabIdRef.current = null;
          return;
        }
        console.warn('showOpenFilePicker failed, falling back to input:', err);
      }
    }

    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTabId = reshareTargetTabIdRef.current;
    reshareTargetTabIdRef.current = null;

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const ext = extractFileExtension(file.name);
      const currentTabs = folderTabsRef.current;
      const pathBreadcrumb = `/Local Device/${file.name}`;
      const existingMatch =
        (targetTabId ? currentTabs.find((t) => t.id === targetTabId) : undefined) ||
        currentTabs.find(
          (t) =>
            t.isSingleFileTab &&
            (t.pathBreadcrumb === pathBreadcrumb || t.fileName === file.name || t.name === file.name)
        );
      const tabId = existingMatch ? existingMatch.id : `tab-file-${Date.now()}`;
      const itemId = `${tabId}__${file.name}`;
      if (existingMatch) {
        existingMatch.files.forEach((f) => deleteSessionFileRef(f.id));
      }
      setSessionFileRef(itemId, file);

      const item: ExplorerFileItem = {
        id: itemId,
        name: file.name,
        extension: ext,
        sizeBytes: file.size,
        lastModified: file.lastModified,
        pathBreadcrumb,
        sourceType: 'local_path',
        isMissing: false,
      };

      if (existingMatch) {
        const updated = currentTabs.map((t) =>
          t.id === existingMatch.id
            ? {
                ...t,
                name: file.name,
                iconType: 'file' as const,
                sourceType: 'local_path' as const,
                fileName: file.name,
                pathBreadcrumb: item.pathBreadcrumb,
                files: [item],
                missingCount: 0,
                accessState: 'granted' as const,
                isSingleFileTab: true,
                lastKnownPath: item.pathBreadcrumb,
              }
            : t
        );
        setFolderTabs(updated);
        saveFolderTabs(updated);
        setActiveTabId(existingMatch.id);
        setExplorerInfoNotice(`Permission re-granted for "${file.name}".`);
      } else {
        const newTab: ExplorerFolderTab = {
          id: tabId,
          name: file.name,
          iconType: 'file',
          sourceType: 'local_path',
          pathBreadcrumb: item.pathBreadcrumb,
          files: [item],
          missingCount: 0,
          accessState: 'granted',
          isSingleFileTab: true,
          fileName: file.name,
          lastKnownPath: item.pathBreadcrumb,
        };
        const updated = [...currentTabs, newTab];
        setFolderTabs(updated);
        saveFolderTabs(updated);
        onOpenFile(item, file);
        onCloseModal();
      }
    }
    e.target.value = '';
  };

  // Pin subfolder directly as tab from ClassicFileExplorerModal (deduplicated)
  const handlePinSubfolderTab = async (folder: {
    name: string;
    pathBreadcrumb: string;
    sourceType: 'local_handle' | 'local_path';
    dirHandle?: FileSystemDirectoryHandle;
    files: ExplorerFileItem[];
  }) => {
    const currentTabs = folderTabsRef.current;
    const existing = await findMatchingFolderTab(
      currentTabs,
      folder.name,
      folder.pathBreadcrumb,
      folder.dirHandle
    );

    if (existing && existing.pathBreadcrumb === folder.pathBreadcrumb) {
      if (folder.sourceType === 'local_handle' && folder.dirHandle) {
        await saveDirectoryHandle(existing.id, folder.dirHandle);
      }
      const updated = currentTabs.map((t) =>
        t.id === existing.id
          ? {
              ...t,
              sourceType: folder.sourceType,
              dirHandle: folder.dirHandle,
              accessState: 'granted' as const,
              files: folder.files,
              missingCount: folder.files.filter((f) => f.isMissing).length,
            }
          : t
      );
      setFolderTabs(updated);
      saveFolderTabs(updated);
      setActiveTabId(existing.id);
      setClassicSelectedTabId(null);
      setShowClassicExplorer(false);
      return;
    }

    const newTabId = `tab-pin-${folder.sourceType}-${Date.now()}`;
    if (folder.sourceType === 'local_handle' && folder.dirHandle) {
      await saveDirectoryHandle(newTabId, folder.dirHandle);
    }

    const newTab: ExplorerFolderTab = {
      id: newTabId,
      name: folder.name,
      iconType: 'folder',
      sourceType: folder.sourceType,
      pathBreadcrumb: folder.pathBreadcrumb,
      lastKnownPath: folder.pathBreadcrumb,
      dirHandle: folder.dirHandle,
      accessState: 'granted',
      files: folder.files,
      missingCount: folder.files.filter((f) => f.isMissing).length,
    };

    const updated = [...currentTabs, newTab];
    setFolderTabs(updated);
    saveFolderTabs(updated);
    setActiveTabId(newTabId);
    setClassicSelectedTabId(null);
    setShowClassicExplorer(false);
  };

  // Confirmed tab removal (never deletes real files)
  const executeDeleteFolderTab = (tabId: string) => {
    const targetTab = folderTabs.find((t) => t.id === tabId);
    if (targetTab?.sourceType === 'local_handle') {
      void deleteDirectoryHandle(tabId);
    }
    if (targetTab) {
      targetTab.files.forEach((f) => deleteSessionFileRef(f.id));
    }
    const updated = folderTabs.filter((t) => t.id !== tabId);
    setFolderTabs(updated);
    saveFolderTabs(updated);
    if (activeTabId === tabId) {
      setActiveTabId('home');
    }
  };

  const requestDeleteTab = (tab: ExplorerFolderTab, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPendingDeleteTab(tab);
  };

  const handleResetAllExplorerTabs = async () => {
    await resetAllExplorerStorage();
    clearSessionFileRefs();
    setFolderTabs([]);
    setActiveTabId('home');
  };

  // Remove file reference from folder
  const handleRemoveFileReference = (fileId: string) => {
    deleteSessionFileRef(fileId);
    const updatedTabs = folderTabs.map((t) => {
      const nextFiles = t.files.filter((f) => f.id !== fileId);
      return {
        ...t,
        files: nextFiles,
        missingCount: nextFiles.filter((f) => f.isMissing).length,
      };
    });
    setFolderTabs(updatedTabs);
    saveFolderTabs(updatedTabs);
  };

  // Move file reference between local folder tabs
  const handleMoveFileConfirm = (file: ExplorerFileItem, targetTabId: string) => {
    const updatedTabs = folderTabsRef.current.map((tab) => {
      if (tab.files.some((f) => f.id === file.id) && tab.id !== targetTabId) {
        const remaining = tab.files.filter((f) => f.id !== file.id);
        return {
          ...tab,
          files: remaining,
          missingCount: remaining.filter((f) => f.isMissing).length,
        };
      }
      if (tab.id === targetTabId) {
        const movedItem: ExplorerFileItem = {
          ...file,
          pathBreadcrumb: `${tab.pathBreadcrumb}/${file.name}`,
        };
        const nextFiles = [movedItem, ...tab.files.filter((f) => f.id !== file.id)];
        return {
          ...tab,
          files: nextFiles,
          missingCount: nextFiles.filter((f) => f.isMissing).length,
        };
      }
      return tab;
    });
    setFolderTabs(updatedTabs);
    saveFolderTabs(updatedTabs);
  };

  // Re-share local folder or single file from LockedTabGate
  const handleReshareLocal = async (tab: ExplorerFolderTab) => {
    if (tab.isSingleFileTab) {
      const savedFh = await getSingleFileHandle(tab.id);
      if (savedFh && (await verifyHandlePermission(savedFh, 'read', true))) {
        try {
          const file = await savedFh.getFile();
          const item: ExplorerFileItem = {
            id: `${tab.id}__${file.name}`,
            name: file.name,
            extension: extractFileExtension(file.name),
            sizeBytes: file.size,
            lastModified: file.lastModified,
            pathBreadcrumb: tab.pathBreadcrumb,
            sourceType: 'local_handle',
            fileHandle: savedFh,
            isMissing: false,
          };
          const updated = folderTabsRef.current.map((t) =>
            t.id === tab.id
              ? {
                  ...t,
                  fileName: file.name,
                  files: [item],
                  accessState: 'granted' as const,
                  missingCount: 0,
                }
              : t
          );
          setFolderTabs(updated);
          saveFolderTabs(updated);
          return;
        } catch {}
      }
      await handleAddNewFile(tab.id);
      return;
    }

    if (tab.sourceType === 'local_handle') {
      const savedHandle = tab.dirHandle || (await getDirectoryHandle(tab.id));
      if (savedHandle && (await verifyHandlePermission(savedHandle, 'read', true))) {
        const files = await scanDirectoryFiles(
          savedHandle,
          tab.pathBreadcrumb,
          tab.files
        );
        const updated = folderTabsRef.current.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                dirHandle: savedHandle,
                files,
                accessState: 'granted' as const,
                missingCount: files.filter((f) => f.isMissing).length,
              }
            : t
        );
        setFolderTabs(updated);
        saveFolderTabs(updated);
        return;
      }
    }

    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        // @ts-expect-error showDirectoryPicker options
        const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
          mode: 'read',
        });
        await saveDirectoryHandle(tab.id, dirHandle);
        const pathBreadcrumb = `/Local Device/${dirHandle.name}`;
        const files = await scanDirectoryFiles(dirHandle, pathBreadcrumb, tab.files);

        const updated = folderTabsRef.current.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                name: dirHandle.name,
                sourceType: 'local_handle' as const,
                pathBreadcrumb,
                dirHandle,
                files,
                accessState: 'granted' as const,
                lastKnownPath: pathBreadcrumb,
                missingCount: files.filter((f) => f.isMissing).length,
              }
            : t
        );

        setFolderTabs(updated);
        saveFolderTabs(updated);
        return;
      } catch (err: unknown) {
        const errName = (err as Error)?.name;
        if (errName === 'AbortError') return;
        if (errName === 'SecurityError') {
          setExplorerInfoNotice(
            'Your browser blocked the native folder permission dialog inside this embedded frame. Using the built-in folder picker instead — files remain private on your device.'
          );
        }
      }
    }

    reshareTargetTabIdRef.current = tab.id;
    folderInputRef.current?.click();
  };

  const activeTab = folderTabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* 1. HORIZONTAL TAB STRIP */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 pt-2 select-none gap-1">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTabId('home')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl border-t border-x transition-all shrink-0 ${
              activeTabId === 'home'
                ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 border-b-transparent shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </button>

          {folderTabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const isLocked = tab.accessState !== 'granted';
            const isSingleFile = Boolean(tab.isSingleFileTab || tab.iconType === 'file');

            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-xl border-t border-x transition-all cursor-pointer shrink-0 max-w-[210px] ${
                  isActive
                    ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 border-b-transparent shadow-xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {isSingleFile ? (
                  <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}

                <span className="truncate">{tab.name}</span>

                {isLocked && (
                  <span
                    className="p-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 shrink-0"
                    title="Permission required — click tab to re-grant access"
                  >
                    <Lock className="w-2.5 h-2.5" />
                  </span>
                )}

                {tab.missingCount > 0 && !isLocked && (
                  <span
                    className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                    title="Has missing files"
                  />
                )}

                <button
                  type="button"
                  onClick={(e) => requestDeleteTab(tab, e)}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 opacity-60 group-hover:opacity-100 transition-opacity ml-1"
                  title="Remove tab (asks for confirmation)"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Strictly 2 options for adding tabs: Add Folder or Add File */}
          <div ref={addTabMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowAddTabMenu((prev) => !prev)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
              title="Add a folder or file tab"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {showAddTabMenu && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-50 text-xs animate-in fade-in duration-100">
                <button
                  type="button"
                  onClick={() => void executeAddFolder()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Add Folder</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddNewFile()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
                >
                  <FilePlus className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>Add File</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TOP RIGHT TAB STRIP ACTIONS */}
        <div className="flex items-center gap-1.5 shrink-0 pb-1.5">
          <button
            type="button"
            onClick={() => setShowClassicExplorer(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors border border-emerald-200/60 dark:border-emerald-800/60"
            title="Browse subfolders inside your added folders"
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Folder Tree</span>
          </button>

          <button
            type="button"
            disabled={isScanning}
            onClick={() => void rehydrateExplorerState(folderTabs)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Scan folders for changed or missing files"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {explorerBannerError && (
        <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{explorerBannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setExplorerBannerError(null)}
            className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {explorerInfoNotice && (
        <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-start justify-between gap-2 text-xs text-blue-800 dark:text-blue-200 shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span className="leading-relaxed">{explorerInfoNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExplorerInfoNotice(null)}
            className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. TAB CONTENT VIEW */}
      {activeTabId === 'home' || !activeTab ? (
        <HomeDashboardTab
          onAddNewFolder={() => void executeAddFolder()}
          onAddNewFile={() => void handleAddNewFile()}
          savedTabs={folderTabs}
          onSelectTab={(tabId) => setActiveTabId(tabId)}
          onOpenClassicExplorer={() => setShowClassicExplorer(true)}
          onResetAllTabs={() => void handleResetAllExplorerTabs()}
        />
      ) : (
        <FolderContentsTab
          folderTab={activeTab}
          onOpenFile={(file) => {
            onOpenFile(file, getSessionFileRef(file.id));
            onCloseModal();
          }}
          onMoveFile={(file) => {
            setMovingFile(file);
            setMovingSourceTabId(activeTab.id);
          }}
          onRemoveFileReference={handleRemoveFileReference}
          onOpenMissingFilesModal={() => setMissingFilesFolder(activeTab)}
          onReloadTab={() => void handleReloadTab(activeTab.id)}
          onDeleteTab={() => requestDeleteTab(activeTab)}
          onReshareLocal={() => void handleReshareLocal(activeTab)}
          onOpenClassicExplorer={() => setShowClassicExplorer(true)}
          isReloading={reloadingTabId === activeTab.id}
        />
      )}

      {/* 3. HIDDEN SYSTEM INPUT FALLBACKS */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard for folder pickers
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={handleFallbackFolderUpload}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".noteteacher,.pdf,.json,.png,.jpg,.jpeg,.one,application/json,application/pdf,image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* 4. MODALS */}
      <ClassicFileExplorerModal
        isOpen={showClassicExplorer}
        onClose={() => {
          setShowClassicExplorer(false);
          setClassicSelectedTabId(null);
        }}
        folderTabs={folderTabs}
        activeTabId={classicSelectedTabId || activeTabId}
        onOpenFile={(file) => {
          onOpenFile(file, getSessionFileRef(file.id));
          onCloseModal();
        }}
        onPinSubfolderTab={(folder) => void handlePinSubfolderTab(folder)}
        onRefreshExplorer={() => void rehydrateExplorerState(folderTabs)}
        suggestedSaveName={activeFileContext?.name}
        onSaveToDirectory={onSaveToDirectory}
        onDownloadFallback={onDownloadFallback}
        onShareFallback={onShareFallback}
      />

      {missingFilesFolder && (
        <MissingFilesModal
          isOpen={true}
          onClose={() => setMissingFilesFolder(null)}
          folderName={missingFilesFolder.name}
          missingFiles={missingFilesFolder.files.filter((f) => f.isMissing)}
          onRemoveReference={handleRemoveFileReference}
          onSearchInSystem={() => void handleAddNewFile()}
        />
      )}

      {movingFile && (
        <MoveFileModal
          isOpen={true}
          onClose={() => {
            setMovingFile(null);
            setMovingSourceTabId(null);
          }}
          file={movingFile}
          sourceTabId={movingSourceTabId}
          folderTabs={folderTabs}
          onConfirmMove={handleMoveFileConfirm}
        />
      )}

      <DeleteTabConfirmModal
        isOpen={Boolean(pendingDeleteTab)}
        tab={pendingDeleteTab}
        onClose={() => setPendingDeleteTab(null)}
        onConfirmDelete={executeDeleteFolderTab}
      />
    </div>
  );
};
