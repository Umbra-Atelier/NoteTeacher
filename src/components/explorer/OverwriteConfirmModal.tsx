import React from 'react';
import { AlertCircle, Save, HardDrive } from 'lucide-react';
import { ActiveFileContext } from '../../types';

interface OverwriteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmOverwrite: () => void;
  onSaveAsNew?: () => void;
  fileContext: ActiveFileContext;
}

export const OverwriteConfirmModal: React.FC<OverwriteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirmOverwrite,
  onSaveAsNew,
  fileContext,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[10001] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Overwrite Existing File?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This document has an existing path in your file explorer.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-1 font-mono text-xs">
          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">{fileContext.name}</span>
          </div>
          <div className="text-[11px] text-slate-400 break-all">
            {fileContext.pathBreadcrumb}
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Clicking <strong>Save &amp; Overwrite</strong> will save back to your file or open your system save picker with the original location and filename pre-filled.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>

          {onSaveAsNew && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSaveAsNew();
              }}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Save As Copy...
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirmOverwrite();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save &amp; Overwrite</span>
          </button>
        </div>
      </div>
    </div>
  );
};
