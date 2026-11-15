import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  FileText,
  Grid,
  AlignJustify,
  MoreVertical,
} from 'lucide-react';
import { PageData, PaperTemplate } from '../types';

interface PageThumbnailSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  pages: PageData[];
  currentPageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: (template: PaperTemplate) => void;
  onDeletePage: (id: string) => void;
  onDuplicatePage: (id: string) => void;
  onMovePage: (index: number, direction: 'up' | 'down') => void;
}

export const PageThumbnailSidebar: React.FC<PageThumbnailSidebarProps> = ({
  isOpen,
  onToggle,
  pages,
  currentPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onDuplicatePage,
  onMovePage,
}) => {
  const [showAddMenu, setShowAddMenu] = React.useState(false);

  return (
    <div
      className={`fixed left-0 top-14 bottom-0 z-20 flex transition-all duration-200 select-none ${
        isOpen ? 'w-64' : 'w-10'
      }`}
    >
      {/* Sidebar Content Panel */}
      {isOpen ? (
        <div className="w-64 h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Pages ({pages.length})
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Add Page Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  title="Add Page"
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Page</span>
                </button>

                {showAddMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-xs"
                  >
                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Paper Template
                    </div>
                    {[
                      { id: 'blank', label: 'Blank Page', icon: FileText },
                      { id: 'lined', label: 'Lined Notebook', icon: AlignJustify },
                      { id: 'grid', label: 'Math Graph Grid', icon: Grid },
                      { id: 'dotted', label: 'Dotted Grid', icon: Grid },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onAddPage(t.id as PaperTemplate);
                          setShowAddMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-left"
                      >
                        <t.icon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Collapse button */}
              <button
                type="button"
                onClick={onToggle}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Collapse Pages"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Thumbnail List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {pages.map((p, idx) => {
              const isSelected = p.id === currentPageId;

              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPage(p.id)}
                  className={`group relative rounded-xl p-2.5 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  {/* Thumbnail Card Preview */}
                  <div className="relative w-full aspect-[4/3] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-center items-center shadow-xs">
                    {/* Background template representation */}
                    {p.template === 'lined' && (
                      <div className="w-full h-full flex flex-col justify-around py-1 px-2 opacity-30">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="w-full h-[1px] bg-blue-400" />
                        ))}
                      </div>
                    )}
                    {p.template === 'grid' && (
                      <div className="w-full h-full opacity-20 bg-[linear-gradient(to_right,#3b82f6_1px,transparent_1px),linear-gradient(to_bottom,#3b82f6_1px,transparent_1px)] bg-[size:10px_10px]" />
                    )}
                    {p.template === 'dotted' && (
                      <div className="w-full h-full opacity-30 bg-[radial-gradient(#64748b_1px,transparent_1px)] bg-[size:8px_8px]" />
                    )}
                    {p.template === 'blank' && (
                      <div className="text-[10px] text-slate-300 font-sans">Blank</div>
                    )}
                    {p.template === 'pdf' && (
                      <div className="text-[10px] text-rose-500 font-bold">PDF #{p.pdfPageNumber}</div>
                    )}

                    <span className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-900/70 text-white">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Title and Controls */}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                      {p.title || `Page ${idx + 1}`}
                    </span>

                    <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                      {/* Move Up */}
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMovePage(idx, 'up');
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          title="Move Up"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                      )}

                      {/* Move Down */}
                      {idx < pages.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMovePage(idx, 'down');
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          title="Move Down"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}

                      {/* Duplicate */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicatePage(p.id);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded"
                        title="Duplicate Page"
                      >
                        <Copy className="w-3 h-3" />
                      </button>

                      {/* Delete */}
                      {pages.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePage(p.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete Page"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Collapsed Rail */
        <div className="w-10 h-full bg-white/90 dark:bg-slate-900/90 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 shadow-xs">
          <button
            type="button"
            onClick={onToggle}
            title="Expand Page Sidebar"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-400 [writing-mode:vertical-rl]">
              PAGES ({pages.length})
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
