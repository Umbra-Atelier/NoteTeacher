import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, ChevronDown, ChevronUp, Check, Type } from 'lucide-react';
import { CanvasStroke, DictatedTextBox, GeometricShape } from '../types';
import { clampBoxToViewport } from './ViewportPortalPopup';

interface GhostEraserPromptProps {
  ghostedStrokes?: CanvasStroke[];
  ghostedShapes?: GeometricShape[];
  ghostedDictatedBoxes?: DictatedTextBox[];
  ghostedCount: number;
  position: { x: number; y: number } | null;
  onConfirm: (selected?: {
    strokeIds: string[];
    shapeIds: string[];
    dictateIds?: string[];
  }) => void;
  onCancel: () => void;
}

function strokeToPathD(stroke: CanvasStroke): string {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.1} ${pts[0].y + 0.1}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    d += ` Q ${p1.x} ${p1.y}, ${midX} ${midY}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return d;
}

export const GhostEraserPrompt: React.FC<GhostEraserPromptProps> = ({
  ghostedStrokes = [],
  ghostedShapes = [],
  ghostedDictatedBoxes = [],
  ghostedCount,
  position,
  onConfirm,
  onCancel,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [checkedStrokeIds, setCheckedStrokeIds] = useState<Set<string>>(new Set());
  const [checkedShapeIds, setCheckedShapeIds] = useState<Set<string>>(new Set());
  const [checkedDictateIds, setCheckedDictateIds] = useState<Set<string>>(new Set());

  const popupRef = useRef<HTMLDivElement>(null);
  const [clampedCoords, setClampedCoords] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    ready: boolean;
  }>({ left: -9999, top: -9999, maxHeight: 500, ready: false });

  const strokeIdsKey = ghostedStrokes.map((s) => s.id).join('|');
  const shapeIdsKey = ghostedShapes.map((sh) => sh.id).join('|');
  const dictateIdsKey = ghostedDictatedBoxes.map((b) => b.id).join('|');

  useEffect(() => {
    const nextStrokeIds = strokeIdsKey ? strokeIdsKey.split('|') : [];
    const nextShapeIds = shapeIdsKey ? shapeIdsKey.split('|') : [];
    const nextDictateIds = dictateIdsKey ? dictateIdsKey.split('|') : [];

    setCheckedStrokeIds((prev) => {
      if (prev.size === nextStrokeIds.length && nextStrokeIds.every((id) => prev.has(id))) {
        return prev;
      }
      return new Set(nextStrokeIds);
    });
    setCheckedShapeIds((prev) => {
      if (prev.size === nextShapeIds.length && nextShapeIds.every((id) => prev.has(id))) {
        return prev;
      }
      return new Set(nextShapeIds);
    });
    setCheckedDictateIds((prev) => {
      if (prev.size === nextDictateIds.length && nextDictateIds.every((id) => prev.has(id))) {
        return prev;
      }
      return new Set(nextDictateIds);
    });
  }, [strokeIdsKey, shapeIdsKey, dictateIdsKey]);

  const recomputePosition = useCallback(() => {
    if (!position || !popupRef.current) return;
    const el = popupRef.current;
    const w = Math.max(el.offsetWidth || 260, 220);
    const h = Math.max(el.offsetHeight || 48, 40);

    const headerEl = document.querySelector('header');
    const safeTop = headerEl
      ? Math.max(8, Math.round(headerEl.getBoundingClientRect().bottom) + 6)
      : 60;

    const desiredLeft = position.x - w / 2;
    const topAbove = position.y - h - 14;
    const topBelow = position.y + 18;
    const desiredTop =
      topAbove >= safeTop
        ? topAbove
        : topBelow + h <= window.innerHeight - 8
        ? topBelow
        : Math.max(safeTop, topAbove);

    const next = clampBoxToViewport(desiredLeft, desiredTop, w, h, {
      margin: 8,
      respectHeader: true,
    });
    setClampedCoords((prev) =>
      prev.left === next.left &&
      prev.top === next.top &&
      prev.maxHeight === next.maxHeight &&
      prev.ready
        ? prev
        : { ...next, ready: true }
    );
  }, [position]);

  useLayoutEffect(() => {
    recomputePosition();
  }, [recomputePosition, isDropdownOpen, ghostedCount]);

  useEffect(() => {
    const el = popupRef.current;
    let rafId: number | null = null;
    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputePosition();
      });
    };
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && el) {
      ro = new ResizeObserver(scheduleSync);
      ro.observe(el);
    }
    window.addEventListener('resize', scheduleSync);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', scheduleSync);
    };
  }, [recomputePosition]);

  if (ghostedCount === 0 || !position || typeof document === 'undefined') return null;

  const totalChecked = checkedStrokeIds.size + checkedShapeIds.size + checkedDictateIds.size;

  const toggleStroke = (id: string) => {
    setCheckedStrokeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleShape = (id: string) => {
    setCheckedShapeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDictate = (id: string) => {
    setCheckedDictateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmDelete = () => {
    onConfirm({
      strokeIds: Array.from(checkedStrokeIds),
      shapeIds: Array.from(checkedShapeIds),
      dictateIds: Array.from(checkedDictateIds),
    });
  };

  const getStrokeViewBox = (s: CanvasStroke) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    s.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    const w = Math.max(16, maxX - minX);
    const h = Math.max(16, maxY - minY);
    const pad = Math.max(8, Math.max(w, h) * 0.15);
    return `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`;
  };

  const getShapeViewBox = (sh: GeometricShape) => {
    if (sh.points && sh.points.length > 0) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      sh.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
      const w = Math.max(16, maxX - minX);
      const h = Math.max(16, maxY - minY);
      const pad = Math.max(8, Math.max(w, h) * 0.15);
      return `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`;
    }
    const x = Math.min(sh.x, sh.x + sh.width);
    const y = Math.min(sh.y, sh.y + sh.height);
    const w = Math.max(16, Math.abs(sh.width));
    const h = Math.max(16, Math.abs(sh.height));
    const pad = Math.max(8, Math.max(w, h) * 0.15);
    return `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`;
  };

  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: `${clampedCoords.left}px`,
        top: `${clampedCoords.top}px`,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: `${clampedCoords.maxHeight}px`,
        visibility: clampedCoords.ready ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="z-[10050] pointer-events-auto flex flex-col items-center animate-in fade-in zoom-in-95 duration-150"
    >
      {/* EXPANDABLE DROPDOWN THUMBNAIL GRID */}
      {isDropdownOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mb-2 w-80 max-w-[calc(100vw-24px)] bg-slate-900/98 text-white rounded-xl shadow-2xl border border-slate-700 p-3 space-y-2 backdrop-blur-md"
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs">
            <span className="font-bold text-slate-200">
              Select items to delete ({totalChecked} of {ghostedCount})
            </span>
            <button
              type="button"
              onClick={() => {
                const allSelected = totalChecked === ghostedCount;
                if (allSelected) {
                  setCheckedStrokeIds(new Set());
                  setCheckedShapeIds(new Set());
                  setCheckedDictateIds(new Set());
                } else {
                  setCheckedStrokeIds(new Set(ghostedStrokes.map((s) => s.id)));
                  setCheckedShapeIds(new Set(ghostedShapes.map((sh) => sh.id)));
                  setCheckedDictateIds(new Set(ghostedDictatedBoxes.map((b) => b.id)));
                }
              }}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium"
            >
              {totalChecked === ghostedCount ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto p-1 custom-scrollbar">
            {ghostedStrokes.map((s) => {
              const isChecked = checkedStrokeIds.has(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => toggleStroke(s.id)}
                  title={`Stroke (${s.tool}) - Click to ${isChecked ? 'unselect' : 'select'}`}
                  className={`relative w-15 h-15 rounded-lg border-2 cursor-pointer transition-all bg-slate-800/90 flex items-center justify-center overflow-hidden group ${
                    isChecked
                      ? 'border-emerald-500 ring-1 ring-emerald-400/50'
                      : 'border-slate-700 opacity-50 hover:opacity-80'
                  }`}
                >
                  <div
                    className={`absolute top-1 right-1 w-3.5 h-3.5 rounded flex items-center justify-center transition-colors z-10 ${
                      isChecked
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-400 bg-slate-900/80'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>

                  <svg viewBox={getStrokeViewBox(s)} className="w-full h-full p-1 pointer-events-none">
                    <path
                      d={strokeToPathD(s)}
                      stroke={s.color}
                      strokeWidth={Math.max(2, s.width)}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              );
            })}

            {ghostedShapes.map((sh) => {
              const isChecked = checkedShapeIds.has(sh.id);
              const x = Math.min(sh.x, sh.x + sh.width);
              const y = Math.min(sh.y, sh.y + sh.height);
              const w = Math.max(16, Math.abs(sh.width));
              const h = Math.max(16, Math.abs(sh.height));

              return (
                <div
                  key={sh.id}
                  onClick={() => toggleShape(sh.id)}
                  title={`Shape (${sh.type}) - Click to ${isChecked ? 'unselect' : 'select'}`}
                  className={`relative w-15 h-15 rounded-lg border-2 cursor-pointer transition-all bg-slate-800/90 flex items-center justify-center overflow-hidden group ${
                    isChecked
                      ? 'border-emerald-500 ring-1 ring-emerald-400/50'
                      : 'border-slate-700 opacity-50 hover:opacity-80'
                  }`}
                >
                  <div
                    className={`absolute top-1 right-1 w-3.5 h-3.5 rounded flex items-center justify-center transition-colors z-10 ${
                      isChecked
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-400 bg-slate-900/80'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>

                  <svg viewBox={getShapeViewBox(sh)} className="w-full h-full p-1 pointer-events-none">
                    {sh.type === 'circle' && (
                      <ellipse
                        cx={x + w / 2}
                        cy={y + h / 2}
                        rx={w / 2}
                        ry={h / 2}
                        stroke={sh.strokeColor}
                        strokeWidth={Math.max(2, sh.strokeWidth)}
                        fill={sh.fillColor || 'none'}
                      />
                    )}
                    {(sh.type === 'rect' || sh.type === 'rounded_rect' || sh.type === 'grid') && (
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        rx={sh.type === 'rounded_rect' ? Math.min(16, w / 4, h / 4) : undefined}
                        ry={sh.type === 'rounded_rect' ? Math.min(16, w / 4, h / 4) : undefined}
                        stroke={sh.strokeColor}
                        strokeWidth={Math.max(2, sh.strokeWidth)}
                        fill={sh.fillColor || 'none'}
                      />
                    )}
                    {sh.type === 'triangle' && (
                      <polygon
                        points={`${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`}
                        stroke={sh.strokeColor}
                        strokeWidth={Math.max(2, sh.strokeWidth)}
                        fill={sh.fillColor || 'none'}
                      />
                    )}
                    {(sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') && (
                      <line
                        x1={sh.x}
                        y1={sh.y}
                        x2={sh.x + sh.width}
                        y2={sh.y + sh.height}
                        stroke={sh.strokeColor}
                        strokeWidth={Math.max(2, sh.strokeWidth)}
                      />
                    )}
                    {sh.type === 'polyline' && sh.points && sh.points.length > 0 && (
                      <path
                        d={
                          sh.points.length === 1
                            ? `M ${sh.points[0].x} ${sh.points[0].y} L ${sh.points[0].x + 0.1} ${
                                sh.points[0].y + 0.1
                              }`
                            : sh.points
                                .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                                .join(' ')
                        }
                        stroke={sh.strokeColor}
                        strokeWidth={Math.max(2, sh.strokeWidth)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {sh.type === 'arc' && sh.centerX && sh.centerY && sh.radius && (
                      <circle
                        cx={sh.centerX}
                        cy={sh.centerY}
                        r={sh.radius}
                        stroke={sh.strokeColor}
                        strokeWidth={Math.max(2, sh.strokeWidth)}
                        fill="none"
                      />
                    )}
                  </svg>
                </div>
              );
            })}

            {ghostedDictatedBoxes.map((b) => {
              const isChecked = checkedDictateIds.has(b.id);
              return (
                <div
                  key={b.id}
                  onClick={() => toggleDictate(b.id)}
                  title={`Text Box: "${b.text || '(empty)'}" - Click to ${
                    isChecked ? 'unselect' : 'select'
                  }`}
                  className={`relative w-15 h-15 rounded-lg border-2 cursor-pointer transition-all bg-slate-800/90 flex flex-col items-center justify-center p-1.5 overflow-hidden ${
                    isChecked
                      ? 'border-emerald-500 ring-1 ring-emerald-400/50'
                      : 'border-slate-700 opacity-50 hover:opacity-80'
                  }`}
                >
                  <div
                    className={`absolute top-1 right-1 w-3.5 h-3.5 rounded flex items-center justify-center transition-colors z-10 ${
                      isChecked
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-400 bg-slate-900/80'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <Type className="w-3.5 h-3.5 text-sky-400 shrink-0 mb-0.5" />
                  <span className="text-[9px] text-slate-200 line-clamp-2 text-center leading-tight break-words">
                    {b.text || 'Text box'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN NOTEPAD GHOST ERASER CONFIRMATION BADGE */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/95 text-white shadow-2xl border border-slate-700/80 backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          <span>
            Delete <strong className="text-white">{totalChecked}</strong> ghosted item
            {totalChecked !== 1 ? 's' : ''}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            title={isDropdownOpen ? 'Collapse items preview' : 'View square previews of items to delete'}
            className="flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors ml-0.5"
          >
            {isDropdownOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={totalChecked === 0}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors active:scale-95 ${
              totalChecked > 0
                ? 'text-white bg-rose-600 hover:bg-rose-500'
                : 'text-slate-500 bg-slate-800 cursor-not-allowed'
            }`}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors active:scale-95"
          >
            Keep
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
