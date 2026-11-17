import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Move, Folder, Check, X, HardDrive } from 'lucide-react';
import { ExplorerFileItem, ExplorerFolderTab } from '../../types';

interface MoveFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: ExplorerFileItem | null;
  sourceTabId?: string | null;
  folderTabs: ExplorerFolderTab[];
  onConfirmMove: (file: ExplorerFileItem, targetTabId: string) => void;
}

export const MoveFileModal: React.FC<MoveFileModalProps> = ({
  isOpen,
  onClose,
  file,
  sourceTabId,
  folderTabs,
  onConfirmMove,
}) => {
  const destinationTabs = useMemo(
    () =>
      folderTabs.filter(
        (t) => t.id !== sourceTabId && !t.isSingleFileTab
      ),
    [folderTabs, sourceTabId]
  );

  const [selectedTargetTabId, setSelectedTargetTabId] = useState<string>(
    destinationTabs.length > 0 ? destinationTabs[0].id : ''
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTargetTabId((prev) => {
      if (destinationTabs.length === 0) return '';
      if (prev && destinationTabs.some((t) => t.id === prev)) return prev;
      return destinationTabs[0].id;
    });
  }, [isOpen, destinationTabs]);

  if (!isOpen || !file || typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      className="dcg-do-not-blur fixed inset-0 z-[10002] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Move className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Move File Location
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-1">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate">
            <HardDrive className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">{file.name}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 break-all">
            Current: {file.pathBreadcrumb}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Select Destination Folder Tab:
          </label>
          {destinationTabs.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Add at least one other folder tab first to move this file reference into it.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {destinationTabs.map((tab) => {
                const isSelected = selectedTargetTabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setSelectedTargetTabId(tab.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">{tab.name}</div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {tab.pathBreadcrumb}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedTargetTabId}
            onClick={() => {
              onConfirmMove(file, selectedTargetTabId);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white shadow-xs transition-colors"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Move File</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
