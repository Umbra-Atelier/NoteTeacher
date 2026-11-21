import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Eraser, AlertTriangle, X, Check, ArrowRight, ArrowLeft } from 'lucide-react';

export type ClearActionType = 'clear_page_elements' | 'clear_all_elements' | 'delete_page';

interface ClearPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageTitle: string;
  totalPages: number;
  onClearCurrentPageElements: () => void;
  onClearAllElements: () => void;
  onDeleteCurrentPage: () => void;
}

export const ClearPageModal: React.FC<ClearPageModalProps> = ({
  isOpen,
  onClose,
  currentPageTitle,
  totalPages,
  onClearCurrentPageElements,
  onClearAllElements,
  onDeleteCurrentPage,
}) => {
  // Step 1: Open modal (when Clear Page button is clicked)
  // Step 2: Choose action from the 3 choices
  // Step 3: Final confirmation step
  const [selectedAction, setSelectedAction] = useState<ClearActionType | null>(null);
  const [step, setStep] = useState<2 | 3>(2);

  if (!isOpen) return null;

  const handleSelectAction = (action: ClearActionType) => {
    setSelectedAction(action);
    setStep(3);
  };

  const handleExecuteConfirmedAction = () => {
    if (selectedAction === 'clear_page_elements') {
      onClearCurrentPageElements();
    } else if (selectedAction === 'clear_all_elements') {
      onClearAllElements();
    } else if (selectedAction === 'delete_page') {
      onDeleteCurrentPage();
    }
    handleClose();
  };

  const handleClose = () => {
    setSelectedAction(null);
    setStep(2);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ui-scale-target w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[calc((100vh-2rem)/var(--ui-scale,1))] max-w-[calc((100vw-2rem)/var(--ui-scale,1))] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Clear or Delete Page
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Step {step} of 3: {step === 2 ? 'Choose an action' : 'Confirm decision'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {/* STEP 2: SELECT ACTION */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium pb-1">
                Select what you want to clear on <strong className="text-slate-900 dark:text-white font-semibold">{currentPageTitle}</strong>:
              </p>

              {/* Option 1: Clear Page of Elements (Only) */}
              <button
                type="button"
                onClick={() => handleSelectAction('clear_page_elements')}
                className="w-full text-left p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all group flex items-start gap-3.5 cursor-pointer"
              >
                <div className="p-2.5 rounded-lg bg-amber-500 text-white shrink-0 group-hover:scale-105 transition-transform">
                  <Eraser className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Clear Page of Elements (Only)
                    </span>
                    <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Removes all annotations, pen strokes, shapes, Desmos graphs, calculators, and images from this page. Keeps the page and background.
                  </p>
                </div>
              </button>

              {/* Option 2: Clear All Elements (Across All Pages) */}
              <button
                type="button"
                onClick={() => handleSelectAction('clear_all_elements')}
                className="w-full text-left p-3.5 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/40 dark:bg-orange-950/20 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-all group flex items-start gap-3.5 cursor-pointer"
              >
                <div className="p-2.5 rounded-lg bg-orange-500 text-white shrink-0 group-hover:scale-105 transition-transform">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Clear All Elements (Entire Document)
                    </span>
                    <ArrowRight className="w-4 h-4 text-orange-600 dark:text-orange-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Wipes all annotations, drawings, shapes, and graphs across every page in your document. Leaves pages and PDF backgrounds intact.
                  </p>
                </div>
              </button>

              {/* Option 3: Delete Current Page */}
              <button
                type="button"
                onClick={() => handleSelectAction('delete_page')}
                className="w-full text-left p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all group flex items-start gap-3.5 cursor-pointer"
              >
                <div className="p-2.5 rounded-lg bg-rose-600 text-white shrink-0 group-hover:scale-105 transition-transform">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Delete Current Page
                    </span>
                    <ArrowRight className="w-4 h-4 text-rose-600 dark:text-rose-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {totalPages > 1
                      ? `Permanently removes ${currentPageTitle} and all of its content from the document.`
                      : 'Resets the only page in the document to a clean blank state.'}
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* STEP 3: FINAL CONFIRMATION */}
          {step === 3 && selectedAction && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm mb-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Are you sure you want to proceed?</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {selectedAction === 'clear_page_elements' && (
                    <>You are about to clear all drawings, shapes, and graphs from <strong>{currentPageTitle}</strong>. The page itself will remain.</>
                  )}
                  {selectedAction === 'clear_all_elements' && (
                    <>You are about to clear all annotations, shapes, and graphs across <strong>all {totalPages} pages</strong> in the document.</>
                  )}
                  {selectedAction === 'delete_page' && (
                    <>You are about to delete <strong>{currentPageTitle}</strong>. This removes the page from your lesson.</>
                  )}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>An Undo snapshot will be saved. You can press Ctrl+Z to undo.</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Options</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteConfirmedAction}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-md transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Yes, Confirm & Execute</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
