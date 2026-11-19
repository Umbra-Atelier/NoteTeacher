import React from 'react';
import {
  FolderPlus,
  FilePlus,
  Folder,
  ShieldCheck,
  HardDrive,
  FileText,
  FolderTree,
} from 'lucide-react';
import { ExplorerFolderTab } from '../../types';

interface HomeDashboardTabProps {
  onAddNewFolder: () => void;
  onAddNewFile: () => void;
  savedTabs: ExplorerFolderTab[];
  onSelectTab: (tabId: string) => void;
  onOpenClassicExplorer?: () => void;
  onResetAllTabs?: () => void;
}

export const HomeDashboardTab: React.FC<HomeDashboardTabProps> = ({
  onAddNewFolder,
  onAddNewFile,
  savedTabs,
  onSelectTab,
  onOpenClassicExplorer,
  onResetAllTabs,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
      {/* HEADER HERO + CLASSIC EXPLORER ACTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>In-App File Explorer</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add local folders (including synced Google Drive or OneDrive folders on your computer) or individual files as tabs. Files stay strictly on your device.
          </p>
        </div>
        {onOpenClassicExplorer && (
          <button
            type="button"
            onClick={onOpenClassicExplorer}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs shrink-0 self-start sm:self-auto"
          >
            <FolderTree className="w-4 h-4" />
            <span>Open Folder Tree Explorer</span>
          </button>
        )}
      </div>

      {/* 2 PRIMARY ACTION TILES: ADD FOLDER OR ADD FILE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. Add Folder */}
        <button
          type="button"
          onClick={onAddNewFolder}
          className="group text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between h-36"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Add Folder
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
              Select a local folder on your device (or a locally synced cloud folder) to browse its files in a tab.
            </div>
          </div>
        </button>

        {/* 2. Add File */}
        <button
          type="button"
          onClick={onAddNewFile}
          className="group text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-md transition-all flex flex-col justify-between h-36"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FilePlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              Add File
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
              Add and open an individual .noteteacher project, PDF worksheet, or image as a tab.
            </div>
          </div>
        </button>
      </div>

      {/* LINKED TABS QUICK ACCESS LIST */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Active Tabs ({savedTabs.length})
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {savedTabs.length > 0 && onResetAllTabs && (
              <button
                type="button"
                onClick={onResetAllTabs}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
              >
                Clear All Saved Tabs
              </button>
            )}
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Click any tab to jump to its files
            </span>
          </div>
        </div>

        {savedTabs.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No folders or files added yet
            </div>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Choose &quot;Add Folder&quot; or &quot;Add File&quot; above to pin local lessons and worksheets as tabs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {savedTabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className="group p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3 truncate">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      tab.isSingleFileTab || tab.iconType === 'file'
                        ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600'
                        : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                    }`}
                  >
                    {tab.isSingleFileTab || tab.iconType === 'file' ? (
                      <FileText className="w-4 h-4" />
                    ) : (
                      <Folder className="w-4 h-4" />
                    )}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 truncate">
                      {tab.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-mono" title={tab.pathBreadcrumb}>
                      {tab.isSingleFileTab || tab.iconType === 'file'
                        ? tab.pathBreadcrumb
                        : `${tab.files.length} document${tab.files.length === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>

                {tab.missingCount > 0 && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-full shrink-0">
                    {tab.missingCount} missing
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STORAGE ARCHITECTURE PROMISE BANNER */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            Local-First &amp; Non-Destructive Storage Architecture
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            NoteTeacher never modifies or deletes your original files on disk. Deleting a tab strictly removes the app shortcut. All file overwrites ask for explicit confirmation before saving back to disk.
          </div>
        </div>
      </div>
    </div>
  );
};
