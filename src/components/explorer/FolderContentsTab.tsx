import React, { useMemo, useState } from 'react';
import {
  FileText,
  AlertTriangle,
  MoreVertical,
  ExternalLink,
  Move,
  Trash2,
  FolderOpen,
  RefreshCw,
  FolderTree,
} from 'lucide-react';
import { ExplorerFileItem, ExplorerFolderTab } from '../../types';
import { formatFileDate, formatFileSize } from '../../utils/fileExplorerStorage';
import { LockedTabGate } from './LockedTabGate';

interface FolderContentsTabProps {
  folderTab: ExplorerFolderTab;
  onOpenFile: (file: ExplorerFileItem) => void;
  onMoveFile: (file: ExplorerFileItem) => void;
  onRemoveFileReference: (fileId: string) => void;
  onOpenMissingFilesModal: () => void;
  onReloadTab: () => void;
  onDeleteTab: () => void;
  onReshareLocal: () => void;
  onOpenClassicExplorer?: () => void;
  isReloading?: boolean;
}

export const FolderContentsTab: React.FC<FolderContentsTabProps> = ({
  folderTab,
  onOpenFile,
  onMoveFile,
  onRemoveFileReference,
  onOpenMissingFilesModal,
  onReloadTab,
  onDeleteTab,
  onReshareLocal,
  onOpenClassicExplorer,
  isReloading = false,
}) => {
  const [selectedExtFilter, setSelectedExtFilter] = useState<string>('all');
  const [activeMenuFileId, setActiveMenuFileId] = useState<string | null>(null);
  const [showTabMenu, setShowTabMenu] = useState(false);

  const extensionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    folderTab.files.forEach((f) => {
      const ext = f.extension || '.file';
      map[ext] = (map[ext] || 0) + 1;
    });
    return map;
  }, [folderTab.files]);

  const sortedExtensions = useMemo(() => {
    return Object.keys(extensionCounts).sort();
  }, [extensionCounts]);

  const filteredFiles = useMemo(() => {
    if (selectedExtFilter === 'all') return folderTab.files;
    return folderTab.files.filter((f) => f.extension === selectedExtFilter);
  }, [folderTab.files, selectedExtFilter]);

  const missingFilesCount = folderTab.files.filter((f) => f.isMissing).length;

  return (
    <LockedTabGate
      tab={folderTab}
      onReshareLocal={onReshareLocal}
      onDeleteTab={onDeleteTab}
    >
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col space-y-4">
        {/* 1. TOP TAB TOOLBAR */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {folderTab.name}
            </h2>
            <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs hidden lg:inline">
              · {folderTab.pathBreadcrumb}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenClassicExplorer && !folderTab.isSingleFileTab && (
              <button
                type="button"
                onClick={onOpenClassicExplorer}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors border border-emerald-200/60 dark:border-emerald-800/60 whitespace-nowrap shrink-0"
                title="Open in-app folder tree and grid explorer"
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Folder Tree</span>
              </button>
            )}

            {/* RELOAD BUTTON */}
            <button
              type="button"
              disabled={isReloading}
              onClick={onReloadTab}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Rescan contents and refresh tab metadata"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Reload</span>
            </button>

            {/* 3-DOT TAB OPTIONS MENU */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTabMenu((prev) => !prev)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Tab settings"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showTabMenu && (
                <div
                  onMouseLeave={() => setShowTabMenu(false)}
                  className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 text-xs animate-in fade-in duration-100"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowTabMenu(false);
                      onReloadTab();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>Rescan &amp; Update Cookie</span>
                  </button>

                  {onOpenClassicExplorer && !folderTab.isSingleFileTab && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowTabMenu(false);
                        onOpenClassicExplorer();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <FolderTree className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Browse Subfolders in Tree</span>
                    </button>
                  )}

                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowTabMenu(false);
                      onDeleteTab();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Remove Tab from App</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. MISSING FILES ALERT BAR */}
        {missingFilesCount > 0 && (
          <button
            type="button"
            onClick={onOpenMissingFilesModal}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/80 text-rose-800 dark:text-rose-200 hover:bg-rose-100/80 dark:hover:bg-rose-950/90 transition-colors shadow-xs text-left"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold">Missing or renamed files detected</span>
                <span className="text-rose-600 dark:text-rose-400 ml-2 font-mono tabular-nums">
                  ({missingFilesCount} item{missingFilesCount === 1 ? '' : 's'})
                </span>
              </div>
            </div>
            <span className="text-[11px] font-semibold underline underline-offset-2 shrink-0">
              Inspect Paths &rarr;
            </span>
          </button>
        )}

        {/* 3. INTERACTIVE EXTENSION FILTER BAR */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedExtFilter('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              selectedExtFilter === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            All ({folderTab.files.length})
          </button>

          {sortedExtensions.map((ext) => (
            <button
              key={ext}
              type="button"
              onClick={() => setSelectedExtFilter(ext)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                selectedExtFilter === ext
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span>{ext}</span>
              <span className="opacity-70 text-[10px]">({extensionCounts[ext]})</span>
            </button>
          ))}
        </div>

        {/* 4. FILE LIST */}
        {filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2 text-slate-400">
            <FolderOpen className="w-8 h-8 text-slate-300 dark:text-slate-700" />
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              No supported documents in this folder
            </div>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Files ending in .noteteacher, .pdf, .json, .one, .png, or .jpg will show here. Click Reload after adding files.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredFiles.map((file) => {
              const isMenuOpen = activeMenuFileId === file.id;

              return (
                <div
                  key={file.id}
                  onClick={() => {
                    if (!file.isMissing) {
                      onOpenFile(file);
                    }
                  }}
                  className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    file.isMissing
                      ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 opacity-85'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        file.extension === '.noteteacher'
                          ? 'bg-blue-50 dark:bg-blue-950 text-blue-600'
                          : file.extension === '.pdf'
                          ? 'bg-rose-50 dark:bg-rose-950 text-rose-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
                        <span className="truncate">{file.name}</span>
                        {file.isMissing && (
                          <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold shrink-0">
                            · Missing
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-2 mt-0.5 truncate">
                        <span>{formatFileSize(file.sizeBytes)}</span>
                        <span>·</span>
                        <span>{file.extension}</span>
                        <span>·</span>
                        <span>{formatFileDate(file.lastModified)}</span>
                        <span className="hidden md:inline">·</span>
                        <span className="hidden md:inline truncate max-w-[220px] opacity-75">
                          {file.pathBreadcrumb}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3-DOT ACTION MENU */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setActiveMenuFileId(isMenuOpen ? null : file.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="File Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div
                        onMouseLeave={() => setActiveMenuFileId(null)}
                        className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50 text-xs animate-in fade-in duration-75"
                      >
                        {!file.isMissing && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuFileId(null);
                              onOpenFile(file);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-medium"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                            <span>Open in Viewer</span>
                          </button>
                        )}

                        {!file.isMissing && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuFileId(null);
                              onMoveFile(file);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-medium"
                          >
                            <Move className="w-3.5 h-3.5 text-amber-600" />
                            <span>Move File...</span>
                          </button>
                        )}

                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuFileId(null);
                            onRemoveFileReference(file.id);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600 font-medium"
                          title="Removes reference from NoteTeacher only — never deletes real files"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Remove Reference</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </LockedTabGate>
  );
};
