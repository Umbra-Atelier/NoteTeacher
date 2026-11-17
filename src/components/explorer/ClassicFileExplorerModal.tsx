import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  X,
  LayoutGrid,
  List,
  HardDrive,
  Check,
  Lock,
  Loader2,
  FolderPlus,
  Save,
  Download,
  Info,
  Share2,
} from 'lucide-react';
import { ExplorerFileItem, ExplorerFolderTab, SaveAsMode } from '../../types';
import {
  extractFileExtension,
  formatFileDate,
  formatFileSize,
  isSupportedExplorerExtension,
} from '../../utils/fileExplorerStorage';

const SAVE_FORMAT_OPTIONS: Array<{ mode: SaveAsMode; label: string; ext: string }> = [
  { mode: 'pdf_as_shown', label: 'PDF Document (As Shown)', ext: '.pdf' },
  { mode: 'pdf_clean', label: 'PDF Document (Clean)', ext: '.pdf' },
  { mode: 'image_as_shown', label: 'PNG Image (As Shown)', ext: '.png' },
  { mode: 'image_clean', label: 'PNG Image (Clean)', ext: '.png' },
  { mode: 'project_json', label: 'NoteTeacher Project (.noteteacher)', ext: '.noteteacher' },
];

function applyExtensionForSaveMode(name: string, saveMode: SaveAsMode): string {
  const trimmed = name.trim() || 'NoteTeacher_Document';
  const base = trimmed.replace(/\.(noteteacher|json|pdf|png|jpg|jpeg)$/i, '');
  const targetExt =
    SAVE_FORMAT_OPTIONS.find((opt) => opt.mode === saveMode)?.ext || '.pdf';
  if (saveMode === 'project_json' && /\.json$/i.test(trimmed)) {
    return trimmed;
  }
  return `${base}${targetExt}`;
}

interface ClassicFileExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderTabs: ExplorerFolderTab[];
  activeTabId?: string;
  onOpenFile: (file: ExplorerFileItem) => void;
  onPinSubfolderTab?: (folder: {
    name: string;
    pathBreadcrumb: string;
    sourceType: 'local_handle' | 'local_path';
    dirHandle?: FileSystemDirectoryHandle;
    files: ExplorerFileItem[];
  }) => void;
  onRefreshExplorer: () => void;
  modalMode?: 'open' | 'save';
  initialSaveMode?: SaveAsMode;
  suggestedSaveName?: string;
  saveNotice?: string | null;
  onSaveToDirectory?: (
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    saveMode: SaveAsMode,
    pathBreadcrumb: string
  ) => Promise<void>;
  onDownloadFallback?: (fileName: string, saveMode: SaveAsMode) => Promise<void>;
  onShareFallback?: (fileName: string, saveMode: SaveAsMode) => Promise<void>;
  onAddLocalFolder?: () => Promise<ExplorerFolderTab | null>;
}

interface TreeSubfolderNode {
  id: string;
  name: string;
  pathBreadcrumb: string;
  sourceType: 'local_handle' | 'local_path';
  dirHandle?: FileSystemDirectoryHandle;
  localTabId?: string;
  relativePrefix?: string;
}

export const ClassicFileExplorerModal: React.FC<ClassicFileExplorerModalProps> = ({
  isOpen,
  onClose,
  folderTabs,
  activeTabId,
  onOpenFile,
  onPinSubfolderTab,
  onRefreshExplorer,
  modalMode = 'open',
  initialSaveMode = 'pdf_as_shown',
  suggestedSaveName,
  saveNotice,
  onSaveToDirectory,
  onDownloadFallback,
  onShareFallback,
  onAddLocalFolder,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [extensionFilter, setExtensionFilter] = useState<string>('all');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [subfoldersByParent, setSubfoldersByParent] = useState<Record<string, TreeSubfolderNode[]>>({});
  const [filesByNode, setFilesByNode] = useState<Record<string, ExplorerFileItem[]>>({});
  const [nodeById, setNodeById] = useState<Record<string, TreeSubfolderNode>>({});
  const [loadingNodeIds, setLoadingNodeIds] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavePanelExpanded, setIsSavePanelExpanded] = useState(modalMode === 'save');
  const [selectedSaveMode, setSelectedSaveMode] = useState<SaveAsMode>(initialSaveMode);
  const [saveFileName, setSaveFileName] = useState<string>(
    applyExtensionForSaveMode(
      suggestedSaveName || `NoteTeacher_${new Date().toISOString().slice(0, 10)}`,
      initialSaveMode
    )
  );
  const [isSavingCopy, setIsSavingCopy] = useState(false);

  const loadChildrenForTab = async (tab: ExplorerFolderTab) => {
    if (tab.accessState && tab.accessState !== 'granted') return;
    if (loadingNodeIds[tab.id]) return;

    if (tab.isSingleFileTab) {
      setSubfoldersByParent((prev) => ({ ...prev, [tab.id]: [] }));
      setFilesByNode((prev) => ({ ...prev, [tab.id]: tab.files }));
      return;
    }

    setLoadingNodeIds((prev) => ({ ...prev, [tab.id]: true }));
    setLoadError(null);

    try {
      if (tab.sourceType === 'local_handle' && tab.dirHandle) {
        const subFolders: TreeSubfolderNode[] = [];
        const directFiles: ExplorerFileItem[] = [];
        for await (const entry of tab.dirHandle.values()) {
          const childPath = `${tab.pathBreadcrumb}/${entry.name}`;
          if (entry.kind === 'directory') {
            const subHandle = entry as FileSystemDirectoryHandle;
            const subId = `${tab.id}::${childPath}`;
            subFolders.push({
              id: subId,
              name: entry.name,
              pathBreadcrumb: childPath,
              sourceType: 'local_handle',
              dirHandle: subHandle,
            });
          } else if (entry.kind === 'file' && isSupportedExplorerExtension(entry.name)) {
            const fh = entry as FileSystemFileHandle;
            try {
              const f = await fh.getFile();
              directFiles.push({
                id: `${tab.dirHandle.name}__${entry.name}`,
                name: entry.name,
                extension: extractFileExtension(entry.name),
                sizeBytes: f.size,
                lastModified: f.lastModified,
                pathBreadcrumb: childPath,
                sourceType: 'local_handle',
                fileHandle: fh,
                isMissing: false,
              });
            } catch {}
          }
        }
        subFolders.sort((a, b) => a.name.localeCompare(b.name));
        directFiles.sort((a, b) => b.lastModified - a.lastModified);

        setSubfoldersByParent((prev) => ({ ...prev, [tab.id]: subFolders }));
        setFilesByNode((prev) => ({ ...prev, [tab.id]: directFiles }));
        setNodeById((prev) => {
          const next = { ...prev };
          for (const sf of subFolders) next[sf.id] = sf;
          return next;
        });
      } else if (tab.sourceType === 'local_path') {
        const subFolderMap = new Map<string, TreeSubfolderNode>();
        const directFiles: ExplorerFileItem[] = [];
        const allSubfolderFiles: Record<string, ExplorerFileItem[]> = {};
        const allSubfolderChildren: Record<string, Map<string, TreeSubfolderNode>> = {};

        for (const f of tab.files) {
          const rawRel =
            f.relativePath ||
            (f.pathBreadcrumb.startsWith(`${tab.pathBreadcrumb}/`)
              ? f.pathBreadcrumb.slice(tab.pathBreadcrumb.length + 1)
              : f.name);
          const parts = rawRel.split('/').filter(Boolean);
          if (parts.length <= 1) {
            directFiles.push(f);
          } else {
            let parentId = tab.id;
            let prefixAcc = '';
            for (let i = 0; i < parts.length - 1; i++) {
              const seg = parts[i];
              prefixAcc = prefixAcc ? `${prefixAcc}/${seg}` : seg;
              const nodeId = `${tab.id}::rel::${prefixAcc}`;
              const nodePath = `${tab.pathBreadcrumb}/${prefixAcc}`;
              const nodeObj: TreeSubfolderNode = {
                id: nodeId,
                name: seg,
                pathBreadcrumb: nodePath,
                sourceType: 'local_path',
                localTabId: tab.id,
                relativePrefix: prefixAcc,
              };
              if (i === 0) {
                subFolderMap.set(nodeId, nodeObj);
              } else {
                if (!allSubfolderChildren[parentId]) {
                  allSubfolderChildren[parentId] = new Map();
                }
                allSubfolderChildren[parentId].set(nodeId, nodeObj);
              }
              parentId = nodeId;
            }
            if (!allSubfolderFiles[parentId]) {
              allSubfolderFiles[parentId] = [];
            }
            allSubfolderFiles[parentId].push(f);
          }
        }

        const rootSubs = Array.from(subFolderMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setSubfoldersByParent((prev) => {
          const next = { ...prev, [tab.id]: rootSubs };
          for (const [pid, childMap] of Object.entries(allSubfolderChildren)) {
            next[pid] = Array.from(childMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          }
          return next;
        });
        setFilesByNode((prev) => ({
          ...prev,
          [tab.id]: directFiles.sort((a, b) => b.lastModified - a.lastModified),
          ...allSubfolderFiles,
        }));
        setNodeById((prev) => {
          const next = { ...prev };
          rootSubs.forEach((sf) => {
            next[sf.id] = sf;
          });
          Object.values(allSubfolderChildren).forEach((m) => {
            m.forEach((sf) => {
              next[sf.id] = sf;
            });
          });
          return next;
        });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load folder contents.');
    } finally {
      setLoadingNodeIds((prev) => ({ ...prev, [tab.id]: false }));
    }
  };

  const loadChildrenForSubfolder = async (node: TreeSubfolderNode) => {
    if (loadingNodeIds[node.id]) return;
    setLoadingNodeIds((prev) => ({ ...prev, [node.id]: true }));
    setLoadError(null);

    try {
      if (node.sourceType === 'local_handle' && node.dirHandle) {
        const subFolders: TreeSubfolderNode[] = [];
        const directFiles: ExplorerFileItem[] = [];
        for await (const entry of node.dirHandle.values()) {
          const childPath = `${node.pathBreadcrumb}/${entry.name}`;
          if (entry.kind === 'directory') {
            const subId = `${node.id}::${entry.name}`;
            subFolders.push({
              id: subId,
              name: entry.name,
              pathBreadcrumb: childPath,
              sourceType: 'local_handle',
              dirHandle: entry as FileSystemDirectoryHandle,
            });
          } else if (entry.kind === 'file' && isSupportedExplorerExtension(entry.name)) {
            const fh = entry as FileSystemFileHandle;
            try {
              const f = await fh.getFile();
              directFiles.push({
                id: `${node.dirHandle.name}__${entry.name}`,
                name: entry.name,
                extension: extractFileExtension(entry.name),
                sizeBytes: f.size,
                lastModified: f.lastModified,
                pathBreadcrumb: childPath,
                sourceType: 'local_handle',
                fileHandle: fh,
                isMissing: false,
              });
            } catch {}
          }
        }
        subFolders.sort((a, b) => a.name.localeCompare(b.name));
        directFiles.sort((a, b) => b.lastModified - a.lastModified);

        setSubfoldersByParent((prev) => ({ ...prev, [node.id]: subFolders }));
        setFilesByNode((prev) => ({ ...prev, [node.id]: directFiles }));
        setNodeById((prev) => {
          const next = { ...prev };
          for (const sf of subFolders) next[sf.id] = sf;
          return next;
        });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load subfolder.');
    } finally {
      setLoadingNodeIds((prev) => ({ ...prev, [node.id]: false }));
    }
  };

  const wasModalOpenRef = React.useRef(false);
  const folderTabsRef = React.useRef(folderTabs);
  folderTabsRef.current = folderTabs;
  const filesByNodeRef = React.useRef(filesByNode);
  filesByNodeRef.current = filesByNode;
  const nodeByIdRef = React.useRef(nodeById);
  nodeByIdRef.current = nodeById;

  useEffect(() => {
    if (!isOpen) {
      wasModalOpenRef.current = false;
      return;
    }
    const isFreshOpen = !wasModalOpenRef.current;
    wasModalOpenRef.current = true;
    if (!isFreshOpen) return;

    const tabs = folderTabsRef.current;
    setIsSavePanelExpanded(modalMode === 'save');
    setSelectedSaveMode(initialSaveMode);
    setSaveFileName(
      applyExtensionForSaveMode(
        suggestedSaveName || `NoteTeacher_${new Date().toISOString().slice(0, 10)}`,
        initialSaveMode
      )
    );
    setIsSavingCopy(false);
    const preferred =
      activeTabId && activeTabId !== 'home' && tabs.some((t) => t.id === activeTabId)
        ? activeTabId
        : tabs[0]?.id || '';
    setSelectedNodeId((prev) => {
      if (activeTabId && activeTabId !== 'home' && tabs.some((t) => t.id === activeTabId)) {
        return activeTabId;
      }
      if (prev && (tabs.some((t) => t.id === prev) || nodeByIdRef.current[prev])) return prev;
      return preferred;
    });
    setSelectedFileId(null);
    setLoadError(null);
    tabs.forEach((tab) => {
      if (tab.accessState === 'granted' && !filesByNodeRef.current[tab.id]) {
        void loadChildrenForTab(tab);
      }
    });
    if (preferred) {
      setExpandedNodes((prev) => (prev[preferred] ? prev : { ...prev, [preferred]: true }));
    }
  }, [isOpen, activeTabId, modalMode, initialSaveMode, suggestedSaveName]);

  const currentTab = folderTabs.find((t) => t.id === selectedNodeId);
  const currentSubfolder = nodeById[selectedNodeId];
  const isCurrentFolderLocked = Boolean(
    currentTab && currentTab.accessState && currentTab.accessState !== 'granted'
  );

  const activeBreadcrumb = currentSubfolder
    ? currentSubfolder.pathBreadcrumb
    : currentTab?.pathBreadcrumb || '';

  const activeWritableDirHandle: FileSystemDirectoryHandle | undefined = !isCurrentFolderLocked
    ? currentSubfolder?.dirHandle || (!currentTab?.isSingleFileTab ? currentTab?.dirHandle : undefined)
    : undefined;

  const folderFiles = useMemo(() => {
    if (isCurrentFolderLocked) return [];
    if (filesByNode[selectedNodeId]) return filesByNode[selectedNodeId];
    if (currentTab) return currentTab.files;
    return [];
  }, [isCurrentFolderLocked, filesByNode, selectedNodeId, currentTab]);

  const currentSubfolders = subfoldersByParent[selectedNodeId] || [];

  const extensionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    folderFiles.forEach((f) => {
      const ext = f.extension || '.file';
      map[ext] = (map[ext] || 0) + 1;
    });
    return map;
  }, [folderFiles]);

  const sortedExtensions = useMemo(() => Object.keys(extensionCounts).sort(), [extensionCounts]);

  const visibleFiles = useMemo(() => {
    let files = folderFiles;
    if (extensionFilter !== 'all') {
      files = files.filter((f) => f.extension === extensionFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      files = files.filter(
        (f) => f.name.toLowerCase().includes(q) || f.pathBreadcrumb.toLowerCase().includes(q)
      );
    }
    return files;
  }, [folderFiles, extensionFilter, searchQuery]);

  if (!isOpen || typeof document === 'undefined') return null;

  const selectedFile = folderFiles.find((f) => f.id === selectedFileId);
  const isNodeLoading = Boolean(loadingNodeIds[selectedNodeId]);

  const handleSelectRootTab = (tab: ExplorerFolderTab) => {
    setSelectedNodeId(tab.id);
    setSelectedFileId(null);
    setExtensionFilter('all');
    setExpandedNodes((prev) => ({ ...prev, [tab.id]: true }));
    if (!filesByNode[tab.id]) {
      void loadChildrenForTab(tab);
    }
  };

  const handleSelectSubfolder = (sub: TreeSubfolderNode) => {
    setSelectedNodeId(sub.id);
    setSelectedFileId(null);
    setExtensionFilter('all');
    setExpandedNodes((prev) => ({ ...prev, [sub.id]: true }));
    if (!filesByNode[sub.id]) {
      void loadChildrenForSubfolder(sub);
    }
  };

  const toggleExpandRoot = (tab: ExplorerFolderTab, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !expandedNodes[tab.id];
    setExpandedNodes((prev) => ({ ...prev, [tab.id]: next }));
    if (next && !subfoldersByParent[tab.id]) {
      void loadChildrenForTab(tab);
    }
  };

  const toggleExpandSub = (sub: TreeSubfolderNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !expandedNodes[sub.id];
    setExpandedNodes((prev) => ({ ...prev, [sub.id]: next }));
    if (next && !subfoldersByParent[sub.id]) {
      void loadChildrenForSubfolder(sub);
    }
  };

  const renderSubTree = (parentId: string, depth: number) => {
    const children = subfoldersByParent[parentId] || [];
    if (children.length === 0) return null;

    return (
      <div className="pl-4 space-y-0.5">
        {children.map((sub) => {
          const isSelected = selectedNodeId === sub.id;
          const isExpanded = Boolean(expandedNodes[sub.id]);
          const isBusy = Boolean(loadingNodeIds[sub.id]);
          return (
            <div key={sub.id} className="space-y-0.5">
              <div
                onClick={() => handleSelectSubfolder(sub)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => toggleExpandSub(sub, e)}
                    className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">{sub.name}</span>
                </div>
              </div>
              {isExpanded && depth < 5 && renderSubTree(sub.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const handleConfirmOpen = () => {
    if (selectedFile && !selectedFile.isMissing) {
      onOpenFile(selectedFile);
      onClose();
    }
  };

  const handleSaveCopyHere = async () => {
    if (!onSaveToDirectory || !activeWritableDirHandle) return;
    const targetName = applyExtensionForSaveMode(saveFileName, selectedSaveMode);
    setSaveFileName(targetName);
    setIsSavingCopy(true);
    setLoadError(null);
    try {
      await onSaveToDirectory(
        activeWritableDirHandle,
        targetName,
        selectedSaveMode,
        `${activeBreadcrumb}/${targetName}`
      );
      if (currentTab) void loadChildrenForTab(currentTab);
      else if (currentSubfolder) void loadChildrenForSubfolder(currentSubfolder);
      onClose();
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to save copy into the selected folder.'
      );
    } finally {
      setIsSavingCopy(false);
    }
  };

  const handleDownloadToDevice = async () => {
    if (!onDownloadFallback) return;
    const targetName = applyExtensionForSaveMode(saveFileName, selectedSaveMode);
    setSaveFileName(targetName);
    setIsSavingCopy(true);
    setLoadError(null);
    try {
      await onDownloadFallback(targetName, selectedSaveMode);
      onClose();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to save file to device.');
    } finally {
      setIsSavingCopy(false);
    }
  };

  const handleShareToFiles = async () => {
    if (!onShareFallback) return;
    const targetName = applyExtensionForSaveMode(saveFileName, selectedSaveMode);
    setSaveFileName(targetName);
    setIsSavingCopy(true);
    setLoadError(null);
    try {
      await onShareFallback(targetName, selectedSaveMode);
      onClose();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to open device Share / Save to Files sheet.');
    } finally {
      setIsSavingCopy(false);
    }
  };

  const handleAddFolderFromModal = async () => {
    if (!onAddLocalFolder) return;
    setLoadError(null);
    const added = await onAddLocalFolder();
    if (added) {
      setSelectedNodeId(added.id);
      setExpandedNodes((prev) => ({ ...prev, [added.id]: true }));
      void loadChildrenForTab(added);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="dcg-do-not-blur fixed inset-0 z-[10002] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[86vh] max-h-[820px] flex flex-col overflow-hidden select-none"
      >
        {/* 1. TOP HEADER & BREADCRUMBS */}
        <div className="flex flex-col border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg text-white flex items-center justify-center shadow-xs ${
                  modalMode === 'save' ? 'bg-emerald-600' : 'bg-blue-600'
                }`}
              >
                {modalMode === 'save' ? (
                  <Save className="w-4 h-4" />
                ) : (
                  <FolderOpen className="w-4 h-4" />
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {modalMode === 'save'
                    ? 'Save Document — NoteTeacher File Explorer'
                    : 'NoteTeacher Folder Tree Explorer'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {modalMode === 'save'
                    ? 'Choose a folder to save a copy directly, or download directly to your device'
                    : 'Browse subfolders and documents inside your added local tabs'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onRefreshExplorer();
                  if (currentTab) void loadChildrenForTab(currentTab);
                  else if (currentSubfolder) void loadChildrenForSubfolder(currentSubfolder);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Refresh folders and scan for changes"
              >
                <RefreshCw className={`w-4 h-4 ${isNodeLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Close explorer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-4 py-2 border-t border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-mono overflow-x-auto py-1">
              <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{activeBreadcrumb || '/'}</span>
              {selectedFile && (
                <>
                  <span>/</span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold truncate max-w-[180px]">
                    {selectedFile.name}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in folder..."
                  className="pl-8 pr-3 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-48 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                />
              </div>

              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-xs'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-xs'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="List view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. MAIN BODY */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT DIRECTORY TREE */}
          <div className="w-60 sm:w-72 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3 overflow-y-auto space-y-1 shrink-0">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-400">
                Added Tabs ({folderTabs.length})
              </span>
            </div>

            {folderTabs.length === 0 ? (
              <div className="px-2 py-4 text-xs text-slate-400">
                No folders or files added yet.
              </div>
            ) : (
              folderTabs.map((tab) => {
                const isSelected = selectedNodeId === tab.id;
                const isExpanded = Boolean(expandedNodes[tab.id]);
                const isLocked = Boolean(tab.accessState && tab.accessState !== 'granted');
                const isBusy = Boolean(loadingNodeIds[tab.id]);
                const isSingleFile = Boolean(tab.isSingleFileTab || tab.iconType === 'file');

                return (
                  <div key={tab.id} className="space-y-0.5">
                    <div
                      onClick={() => handleSelectRootTab(tab)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {!isSingleFile ? (
                          <button
                            type="button"
                            onClick={(e) => toggleExpandRoot(tab, e)}
                            className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}

                        {isSingleFile ? (
                          <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        )}

                        <span className="truncate">{tab.name}</span>
                      </div>

                      {isLocked ? (
                        <Lock className="w-3 h-3 text-amber-500 shrink-0 ml-1" />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums shrink-0 ml-1">
                          {(filesByNode[tab.id] || tab.files).length}
                        </span>
                      )}
                    </div>

                    {!isSingleFile && isExpanded && !isLocked && renderSubTree(tab.id, 1)}
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT FILE GRID / LIST */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 p-4 overflow-y-auto space-y-3">
            {saveNotice && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-start gap-2 text-xs text-blue-800 dark:text-blue-200">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>{saveNotice}</span>
              </div>
            )}

            {loadError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                {loadError}
              </div>
            )}

            {folderTabs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-slate-400">
                <FolderOpen className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No folders or files added yet
                </div>
                <p className="text-xs max-w-sm">
                  {modalMode === 'save'
                    ? 'Use "Download to Device" below to save immediately to your Downloads folder, or add a local folder to save directly inside NoteTeacher.'
                    : 'Close this explorer and use Home → Add Folder or Add File to pin local folders and documents as tabs.'}
                </p>
                {onAddLocalFolder && (
                  <button
                    type="button"
                    onClick={() => void handleAddFolderFromModal()}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-xs"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Add Local Folder</span>
                  </button>
                )}
              </div>
            ) : isCurrentFolderLocked ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Local Permission Required
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  Open the &quot;{currentTab?.name}&quot; tab to re-grant local folder or file access.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 pb-1 shrink-0 flex-wrap">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setExtensionFilter('all')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        extensionFilter === 'all'
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      All ({folderFiles.length})
                    </button>

                    {sortedExtensions.map((ext) => (
                      <button
                        key={ext}
                        type="button"
                        onClick={() => setExtensionFilter(ext)}
                        className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1 ${
                          extensionFilter === ext
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        <span>{ext}</span>
                        <span className="opacity-70 text-[10px]">({extensionCounts[ext]})</span>
                      </button>
                    ))}
                  </div>

                  {currentSubfolder && onPinSubfolderTab && (
                    <button
                      type="button"
                      onClick={() => {
                        onPinSubfolderTab({
                          name: currentSubfolder.name,
                          pathBreadcrumb: currentSubfolder.pathBreadcrumb,
                          sourceType: currentSubfolder.sourceType,
                          dirHandle: currentSubfolder.dirHandle,
                          files: folderFiles,
                        });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Pin Folder as Tab</span>
                    </button>
                  )}
                </div>

                {/* Subfolder quick cards */}
                {currentSubfolders.length > 0 && !searchQuery.trim() && extensionFilter === 'all' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pb-1">
                    {currentSubfolders.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSelectSubfolder(sub)}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-400 bg-slate-50/50 dark:bg-slate-950/40 text-left transition-colors"
                      >
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {sub.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {visibleFiles.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                    <FolderOpen className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      No matching files in this folder
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Choose a subfolder or clear your search filter.
                    </p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {visibleFiles.map((file) => {
                      const isSelected = selectedFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          onClick={() => setSelectedFileId(file.id)}
                          onDoubleClick={() => {
                            if (!file.isMissing) {
                              onOpenFile(file);
                              onClose();
                            }
                          }}
                          className={`group flex flex-col p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition-transform group-hover:scale-105 ${
                              file.extension === '.noteteacher'
                                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-600'
                                : file.extension === '.pdf'
                                ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-600'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                            }`}
                          >
                            <FileText className="w-5 h-5" />
                          </div>

                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                            {file.name}
                          </span>

                          <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-1 flex items-center justify-between">
                            <span>{formatFileSize(file.sizeBytes)}</span>
                            <span>{file.extension}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {visibleFiles.map((file) => {
                      const isSelected = selectedFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          onClick={() => setSelectedFileId(file.id)}
                          onDoubleClick={() => {
                            if (!file.isMissing) {
                              onOpenFile(file);
                              onClose();
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40'
                              : 'border-slate-200 dark:border-slate-800 hover:border-blue-400'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <FileText
                              className={`w-4 h-4 shrink-0 ${
                                file.extension === '.noteteacher'
                                  ? 'text-blue-600'
                                  : file.extension === '.pdf'
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                              }`}
                            />
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {file.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                            <span>{formatFileSize(file.sizeBytes)}</span>
                            <span>·</span>
                            <span>{formatFileDate(file.lastModified)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 3. SAVE COPY BAR & BOTTOM FOOTER */}
        {(isSavePanelExpanded || modalMode === 'save') && (onSaveToDirectory || onDownloadFallback) && (
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                File name:
              </label>
              <input
                type="text"
                data-testid="save-explorer-filename-input"
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                Format:
              </label>
              <select
                value={selectedSaveMode}
                onChange={(e) => {
                  const nextMode = e.target.value as SaveAsMode;
                  setSelectedSaveMode(nextMode);
                  setSaveFileName((prev) => applyExtensionForSaveMode(prev, nextMode));
                }}
                className="px-2.5 py-1 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SAVE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.mode} value={opt.mode}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {modalMode === 'save' ? (
              <div className="flex items-center gap-2 flex-wrap">
                {onAddLocalFolder && (
                  <button
                    type="button"
                    onClick={() => void handleAddFolderFromModal()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
                    <span>Add Folder</span>
                  </button>
                )}
                {activeBreadcrumb && !activeWritableDirHandle && folderTabs.length > 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    Read-only folder selected — use Download to Device or add a writable folder.
                  </span>
                )}
              </div>
            ) : selectedFile ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">Selected:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
                  {selectedFile.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  ({formatFileSize(selectedFile.sizeBytes)})
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400">
                Click a file to select, or double-click to open directly.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>

            {onSaveToDirectory && activeWritableDirHandle && modalMode === 'open' && !isSavePanelExpanded && (
              <button
                type="button"
                onClick={() => setIsSavePanelExpanded(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Copy Here</span>
              </button>
            )}

            {onShareFallback && (modalMode === 'save' || isSavePanelExpanded) && (
              <button
                type="button"
                disabled={isSavingCopy}
                onClick={() => void handleShareToFiles()}
                data-testid="save-explorer-share-btn"
                title="Open your device Share / Save to Files sheet to choose a specific folder (iCloud, Files, Drive, OneDrive)"
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition-all"
              >
                {isSavingCopy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                <span>Save to Files / Share...</span>
              </button>
            )}

            {onDownloadFallback && (modalMode === 'save' || isSavePanelExpanded) && (
              <button
                type="button"
                disabled={isSavingCopy}
                onClick={() => void handleDownloadToDevice()}
                data-testid="save-explorer-download-btn"
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition-all"
              >
                {isSavingCopy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Download to Downloads</span>
              </button>
            )}

            {onSaveToDirectory && (modalMode === 'save' || isSavePanelExpanded) && (
              <button
                type="button"
                disabled={!activeWritableDirHandle || isSavingCopy}
                onClick={() => void handleSaveCopyHere()}
                data-testid="save-copy-here-btn"
                title={
                  activeWritableDirHandle
                    ? `Save copy into ${activeBreadcrumb}`
                    : 'Select an unlocked local folder in the tree to save directly into it'
                }
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                {isSavingCopy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Copy Here</span>
              </button>
            )}

            {modalMode === 'open' && (
              <button
                type="button"
                disabled={!selectedFile || Boolean(selectedFile.isMissing)}
                onClick={handleConfirmOpen}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Open in NoteTeacher</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
