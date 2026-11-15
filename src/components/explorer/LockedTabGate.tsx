import React, { useState } from 'react';
import {
  Lock,
  FolderOpen,
  FileText,
  Trash2,
  MoreVertical,
  ArrowRight,
} from 'lucide-react';
import { ExplorerFolderTab } from '../../types';

interface LockedTabGateProps {
  tab: ExplorerFolderTab;
  onReshareLocal: () => void;
  onDeleteTab: () => void;
  children: React.ReactNode;
}

export const LockedTabGate: React.FC<LockedTabGateProps> = ({
  tab,
  onReshareLocal,
  onDeleteTab,
  children,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  if (tab.accessState === 'granted') {
    return <>{children}</>;
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* 1. BACKGROUND BLURRED TAB CONTENTS */}
      <div
        className="flex-1 overflow-hidden pointer-events-none select-none filter blur-md opacity-30 transition-all duration-300"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* 2. TOP RIGHT 3-DOT TAB OPTIONS MENU (Deletes tab without re-sharing) */}
      <div className="absolute top-4 right-4 z-40">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className="p-2 rounded-xl bg-white/95 dark:bg-slate-800/95 hover:bg-white dark:hover:bg-slate-800 shadow-md border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 transition-all"
            title="Tab options"
            aria-label="Tab options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <div
              onMouseLeave={() => setShowMenu(false)}
              className="absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 text-xs animate-in fade-in duration-100"
            >
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-200 block truncate">
                  {tab.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono block truncate">
                  {tab.lastKnownPath || tab.pathBreadcrumb}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onDeleteTab();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium transition-colors"
                title="Remove tab from NoteTeacher without re-sharing"
              >
                <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                <div>
                  <span className="block font-semibold">Delete Tab from App</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                    Closes tab without re-sharing
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. CENTERED FULL-TAB RE-SHARING PROMPT */}
      <div className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-slate-900/10 dark:bg-black/30">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Icon */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            {tab.isSingleFileTab ? (
              <FileText className="w-7 h-7" />
            ) : (
              <FolderOpen className="w-7 h-7" />
            )}
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {tab.isSingleFileTab
                  ? 'Access Permission Required for File'
                  : 'Folder Permission Required'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
              This tab points to local device files that cannot be read until permission is granted again.
            </p>
          </div>

          {/* Last Known Path Card */}
          <div className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-left space-y-1">
            <span className="text-[10px] font-semibold text-slate-400 block">
              Saved Location
            </span>
            <div className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all select-all">
              {tab.lastKnownPath || tab.pathBreadcrumb}
            </div>
            {tab.fileName && (
              <div className="pt-1 flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400">
                <span className="font-semibold">Target File:</span>
                <span className="font-mono">{tab.fileName}</span>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <div className="w-full pt-1 space-y-2">
            <button
              type="button"
              onClick={onReshareLocal}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-all shadow-md active:scale-[0.98]"
            >
              <FolderOpen className="w-4 h-4" />
              <span>
                {tab.isSingleFileTab ? `Re-share "${tab.fileName || tab.name}"` : 'Re-grant Folder Permission'}
              </span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 opacity-70" />
            </button>

            <button
              type="button"
              onClick={onDeleteTab}
              className="w-full py-2 text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors font-medium"
            >
              Remove tab from NoteTeacher without sharing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
