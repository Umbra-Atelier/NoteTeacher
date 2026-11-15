import React, { useRef, useState, useEffect } from 'react';
import { Compass, Trash2, Grid } from 'lucide-react';
import { GeometricShape } from '../types';
import { AnchoredScreenPopup } from './ViewportPortalPopup';

interface InteractiveGridBoxProps {
  shape: GeometricShape;
  isActive: boolean;
  zoomScale?: number;
  allowFingerControls?: boolean;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<GeometricShape>) => void;
  onDelete: () => void;
}

export const InteractiveGridBox: React.FC<InteractiveGridBoxProps> = ({
  shape,
  isActive,
  zoomScale = 1,
  allowFingerControls = true,
  isReadOnly = false,
  hideChrome = false,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const [isDragging, setIsDragging] = useState(false);
  const [isRepositioningActive, setIsRepositioningActive] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, shapeX: 0, shapeY: 0 });
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Rows and Cols are frozen from initial creation and NEVER change on resize!
  const rows = shape.gridRows || Math.max(2, Math.round(Math.abs(shape.height) / 28));
  const cols = shape.gridCols || Math.max(2, Math.round(Math.abs(shape.width) / 28));

  const strokeColor = shape.isGhosted ? '#EF4444' : shape.strokeColor || '#2563EB';
  const strokeDash =
    shape.strokeStyle === 'dashed' ? '6 4' : shape.strokeStyle === 'dotted' ? '2 3' : undefined;

  // Click & Hold / Drag on Compass Handle to activate repositioning
  const startTopLeftHold = (clientX: number, clientY: number) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setDragStart({ x: clientX, y: clientY, shapeX: shape.x, shapeY: shape.y });

    holdTimerRef.current = setTimeout(() => {
      setIsRepositioningActive(true);
      setIsDragging(true);
    }, 400);
  };

  const cancelTopLeftHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePointerDownTopLeft = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    startTopLeftHold(e.clientX, e.clientY);
    setIsDragging(true);
  };

  // Immediate or Hold-activated Drag Moving (perspective-aware)
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const scale = zoomScale || 1;
      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;
      onUpdate({
        x: Math.max(0, dragStart.shapeX + dx),
        y: Math.max(0, dragStart.shapeY + dy),
      });
    };
    const handleEnd = () => {
      cancelTopLeftHold();
      setIsDragging(false);
      setIsRepositioningActive(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [isDragging, dragStart, onUpdate, zoomScale]);

  // Top-Right L-Grab Resizing (Number of lines remains frozen, scaled by perspective zoom)
  const startResizeTR = (startX: number, startY: number) => {
    const startY0 = shape.y;
    const startW = shape.width;
    const startH = shape.height;
    const aspect = startW / startH;
    const scale = zoomScale || 1;

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const dx = (ev.clientX - startX) / scale;
      const dy = (startY - ev.clientY) / scale;
      const delta = (dx + dy) / 2;
      const newW = Math.max(60, Math.min(1400, startW + delta));
      const newH = newW / aspect;
      const newY = startY0 - (newH - startH);

      onUpdate({
        y: Math.max(0, newY),
        width: newW,
        height: newH,
        // Number of lines across and up/down remains strictly preserved
        gridRows: rows,
        gridCols: cols,
      });
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const handlePointerDownResizeTR = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    startResizeTR(e.clientX, e.clientY);
  };

  // Bottom-Left L-Grab Resizing (Number of lines remains frozen, scaled by perspective zoom)
  const startResizeBL = (startX: number, startY: number) => {
    const startX0 = shape.x;
    const startW = shape.width;
    const startH = shape.height;
    const aspect = startW / startH;
    const scale = zoomScale || 1;

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const dx = (startX - ev.clientX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const delta = (dx + dy) / 2;
      const newW = Math.max(60, Math.min(1400, startW + delta));
      const newH = newW / aspect;
      const newX = startX0 - (newW - startW);

      onUpdate({
        x: Math.max(0, newX),
        width: newW,
        height: newH,
        gridRows: rows,
        gridCols: cols,
      });
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const handlePointerDownResizeBL = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    startResizeBL(e.clientX, e.clientY);
  };

  const w = Math.max(20, shape.width);
  const h = Math.max(20, shape.height);

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        if (!allowFingerControls && lastPointerTypeRef.current === 'touch') return;
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => {
        lastPointerTypeRef.current = e.pointerType;
        if (e.pointerType === 'touch' && !allowFingerControls) return;
        e.stopPropagation();
      }}
      className={`interactive-grid-box absolute select-none transition-shadow ${
        isActive
          ? 'ring-2 ring-indigo-500 shadow-xl z-40'
          : 'hover:ring-1 hover:ring-indigo-300 z-30'
      } ${isRepositioningActive ? 'ring-4 ring-indigo-400 shadow-2xl' : ''} ${
        isReadOnly ? 'pointer-events-none' : ''
      }`}
      style={{
        left: `${shape.x}px`,
        top: `${shape.y}px`,
        width: `${w}px`,
        height: `${h}px`,
        backgroundColor: shape.fillColor || 'transparent',
        transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      {/* ============================================================== */}
      {/* SVG FULL GRAPHING GRID CONTENT                                 */}
      {/* ============================================================== */}
      <svg className="w-full h-full overflow-visible pointer-events-none">
        {/* Outer Grid Border */}
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth || 1.5}
          fill="none"
          strokeDasharray={strokeDash}
        />

        {/* Vertical Grid Lines (Frozen count) */}
        {Array.from({ length: cols - 1 }).map((_, i) => {
          const lx = ((i + 1) / cols) * w;
          const isCenter = Math.abs(i + 1 - cols / 2) < 0.5;
          return (
            <line
              key={`grid-v-${i}`}
              x1={lx}
              y1={0}
              x2={lx}
              y2={h}
              stroke={strokeColor}
              strokeWidth={(shape.strokeWidth || 1.5) * (isCenter ? 1.2 : 0.75)}
              strokeOpacity={isCenter ? 0.9 : 0.65}
              strokeDasharray={isCenter ? undefined : strokeDash}
            />
          );
        })}

        {/* Horizontal Grid Lines (Frozen count) */}
        {Array.from({ length: rows - 1 }).map((_, j) => {
          const ly = ((j + 1) / rows) * h;
          const isCenter = Math.abs(j + 1 - rows / 2) < 0.5;
          return (
            <line
              key={`grid-h-${j}`}
              x1={0}
              y1={ly}
              x2={w}
              y2={ly}
              stroke={strokeColor}
              strokeWidth={(shape.strokeWidth || 1.5) * (isCenter ? 1.2 : 0.75)}
              strokeOpacity={isCenter ? 0.9 : 0.65}
              strokeDasharray={isCenter ? undefined : strokeDash}
            />
          );
        })}
      </svg>

      {/* ============================================================== */}
      {/* ACTIVE CONTROLS (L-Grabs, Compass Move, Delete)                 */}
      {/* ============================================================== */}
      {isActive && !hideChrome && (
        <>
          {/* TOP-RIGHT L-GRAB RESIZE HANDLE (Proportional) */}
          <div
            onPointerDown={handlePointerDownResizeTR}
            title="Drag L-handle to resize grid (line count remains preserved)"
            className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
          >
            <div className="w-5 h-5 border-t-3 border-r-3 border-indigo-600 rounded-tr-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-500">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* BOTTOM-LEFT L-GRAB RESIZE HANDLE (Proportional) */}
          <div
            onPointerDown={handlePointerDownResizeBL}
            title="Drag L-handle to resize grid (line count remains preserved)"
            className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
          >
            <div className="w-5 h-5 border-b-3 border-l-3 border-indigo-600 rounded-bl-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-500">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* TOP HEADER CONTROLS (Compass Move + Info + Delete) - Portaled to screen bounds */}
          <AnchoredScreenPopup
            anchorRef={containerRef}
            placement="top"
            align="center"
            gap={8}
            zIndexClass="z-[10002]"
            respectHeader={true}
            freezePosition={isDragging}
          >
            <div className="flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg select-none">
              <div
                onPointerDown={handlePointerDownTopLeft}
                title="Click and hold for a moment to move graphing grid"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-grab active:cursor-grabbing transition-all select-none shadow-xs touch-none ${
                  isRepositioningActive
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-md'
                    : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="text-[10px] tracking-wider uppercase">
                  {isRepositioningActive ? 'Moving...' : 'Move'}
                </span>
              </div>

              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <Grid className="w-3 h-3 text-indigo-500" />
                <span>
                  {cols}×{rows} lines
                </span>
              </div>

              <button
                type="button"
                onPointerDown={(e) => {
                  lastPointerTypeRef.current = e.pointerType;
                  if (e.pointerType === 'touch' && !allowFingerControls) return;
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  if (!allowFingerControls && lastPointerTypeRef.current === 'touch') return;
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete Grid Shape"
                className="p-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </AnchoredScreenPopup>
        </>
      )}
    </div>
  );
};
