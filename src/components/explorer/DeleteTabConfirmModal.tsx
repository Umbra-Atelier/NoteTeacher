import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Folder, FileText } from 'lucide-react';
import { ExplorerFolderTab } from '../../types';

interface DeleteTabConfirmModalProps {
  isOpen: boolean;
  tab: ExplorerFolderTab | null;
  onClose: () => void;
  onConfirmDelete: (tabId: string) => void;
}

export const DeleteTabConfirmModal: React.FC<DeleteTabConfirmModalProps> = ({
  isOpen,
  tab,
  onClose,
  onConfirmDelete,
}) => {
  if (!isOpen || !tab || typeof document === 'undefined') return null;

  const isSingleFile = Boolean(tab.isSingleFileTab || tab.iconType === 'file');

  return createPortal(
    <div
      onClick={onClose}
      className="dcg-do-not-blur fixed inset-0 z-[10004] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ui-scale-target w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[calc((100vh-2rem)/var(--ui-scale,1))] max-w-[calc((100vw-2rem)/var(--ui-scale,1))] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Remove {isSingleFile ? 'File' : 'Folder'} Tab?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Confirm removing this shortcut from NoteTeacher
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Cancel removal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 truncate">
            {isSingleFile ? (
              <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            )}
            <span className="truncate">{tab.name}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 break-all">
            {tab.lastKnownPath || tab.pathBreadcrumb}
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          This removes the tab reference and stored cookie entry from NoteTeacher. Your original computer folders and files will remain completely untouched.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmDelete(tab.id);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Tab</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
