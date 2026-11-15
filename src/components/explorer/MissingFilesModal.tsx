import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, Search, X } from 'lucide-react';
import { ExplorerFileItem } from '../../types';

interface MissingFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderName: string;
  missingFiles: ExplorerFileItem[];
  onRemoveReference: (fileId: string) => void;
  onSearchInSystem: (file: ExplorerFileItem) => void;
}

export const MissingFilesModal: React.FC<MissingFilesModalProps> = ({
  isOpen,
  onClose,
  folderName,
  missingFiles,
  onRemoveReference,
  onSearchInSystem,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      className="dcg-do-not-blur fixed inset-0 z-[10002] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Missing or Renamed Files
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Folder: &quot;{folderName}&quot; ({missingFiles.length} item{missingFiles.length === 1 ? '' : 's'})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* EXPLANATORY BANNER */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/40 text-xs text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
          These documents were moved, renamed, or deleted outside NoteTeacher. You can search your system using the original filename or remove the dead reference from your app tabs.
        </div>

        {/* LIST OF MISSING FILES WITH BREADCRUMBS */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {missingFiles.map((f) => (
            <div
              key={f.id}
              className="p-3 rounded-xl border border-rose-200/80 dark:border-rose-900/40 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
                  <span className="truncate">{f.name}</span>
                  <span className="text-[10px] text-rose-600 font-mono bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 rounded">
                    {f.extension}
                  </span>
                </div>

                {/* BREADCRUMB FORMAT: /<local or drive name>/<folder name>/<file name> */}
                <div className="text-[11px] font-mono text-slate-400 break-all bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded">
                  {f.pathBreadcrumb}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => onSearchInSystem(f)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-medium transition-colors"
                  title="Search file in system file picker"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Locate</span>
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveReference(f.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600 text-xs font-medium transition-colors"
                  title="Remove reference from app"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* FOOTER */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
