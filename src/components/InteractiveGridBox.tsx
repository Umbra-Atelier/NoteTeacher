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
  editingDimsField?: 'cols' | 'rows' | null;
  editingDimsDraft?: string;
  onStartEditDims?: (field: 'cols' | 'rows') => void;
  onChangeDimsDraft?: (field: 'cols' | 'rows', draft: string) => void;
  onStopEditDims?: () => void;
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
  editingDimsField = null,
  editingDimsDraft = '',
  onStartEditDims,
  onChangeDimsDraft,
  onStopEditDims,
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
  const rows = shape.gridRows || Math.max(1, Math.round(Math.abs(shape.height) / 28));
  const cols = shape.gridCols || Math.max(1, Math.round(Math.abs(shape.width) / 28));

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

  const projectDeltaToLocal = (screenDx: number, screenDy: number) => {
    const scale = zoomScale || 1;
    const dx = screenDx / scale;
    const dy = screenDy / scale;
    const deg = shape.rotation || 0;
    if (!deg) {
      return { localDx: dx, localDy: dy, cos: 1, sin: 0 };
    }
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      localDx: dx * cos + dy * sin,
      localDy: -dx * sin + dy * cos,
      cos,
      sin,
    };
  };

  // Helper to update width/height around a fixed local edge/corner point (respecting optional rotation)
  const computeRotatedBoxForAnchor = (
    startX0: number,
    startY0: number,
    startW: number,
    startH: number,
    newW: number,
    newH: number,
    anchorNormX: number, // 0 = left, 0.5 = center, 1 = right
    anchorNormY: number, // 0 = top, 0.5 = center, 1 = bottom
    cos: number,
    sin: number
  ) => {
    if (cos === 1 && sin === 0) {
      const nextX = startX0 + (startW - newW) * anchorNormX;
      const nextY = startY0 + (startH - newH) * anchorNormY;
      return { x: nextX, y: nextY };
    }
    const oldCx = startX0 + startW / 2;
    const oldCy = startY0 + startH / 2;
    const oldOffX = (anchorNormX - 0.5) * startW;
    const oldOffY = (anchorNormY - 0.5) * startH;
    const anchorWorldX = oldCx + oldOffX * cos - oldOffY * sin;
    const anchorWorldY = oldCy + oldOffX * sin + oldOffY * cos;

    const newOffX = (anchorNormX - 0.5) * newW;
    const newOffY = (anchorNormY - 0.5) * newH;
    const newCx = anchorWorldX - (newOffX * cos - newOffY * sin);
    const newCy = anchorWorldY - (newOffX * sin + newOffY * cos);
    return {
      x: newCx - newW / 2,
      y: newCy - newH / 2,
    };
  };

  // Unified 4-Corner Proportional Resize (Maintains exact width:height aspect ratio & frozen rows/cols)
  const startCornerResize = (
    corner: 'tl' | 'tr' | 'bl' | 'br',
    startClientX: number,
    startClientY: number
  ) => {
    const startX0 = shape.x;
    const startY0 = shape.y;
    const startW = Math.max(20, shape.width);
    const startH = Math.max(20, shape.height);
    const aspect = startW / startH;

    const signX = corner === 'tr' || corner === 'br' ? 1 : -1;
    const signY = corner === 'bl' || corner === 'br' ? 1 : -1;
    const anchorNormX = signX === 1 ? 0 : 1;
    const anchorNormY = signY === 1 ? 0 : 1;

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const { localDx, localDy, cos, sin } = projectDeltaToLocal(
        ev.clientX - startClientX,
        ev.clientY - startClientY
      );
      const scaleW = (startW + signX * localDx) / startW;
      const scaleH = (startH + signY * localDy) / startH;
      const avgScale = (scaleW + scaleH) / 2;

      const minW = Math.max(20, 20 * aspect);
      const maxW = Math.min(1400, 1400 * aspect);
      let newW = Math.max(minW, Math.min(maxW, startW * avgScale));
      let newH = newW / aspect;

      let pos = computeRotatedBoxForAnchor(
        startX0,
        startY0,
        startW,
        startH,
        newW,
        newH,
        anchorNormX,
        anchorNormY,
        cos,
        sin
      );

      if (cos === 1 && sin === 0) {
        if (pos.x < 0 && anchorNormX === 1) {
          newW = Math.max(20, startX0 + startW);
          newH = newW / aspect;
          pos = computeRotatedBoxForAnchor(
            startX0,
            startY0,
            startW,
            startH,
            newW,
            newH,
            anchorNormX,
            anchorNormY,
            cos,
            sin
          );
        }
        if (pos.y < 0 && anchorNormY === 1) {
          newH = Math.max(20, startY0 + startH);
          newW = newH * aspect;
          pos = computeRotatedBoxForAnchor(
            startX0,
            startY0,
            startW,
            startH,
            newW,
            newH,
            anchorNormX,
            anchorNormY,
            cos,
            sin
          );
        }
      }

      onUpdate({
        x: Math.max(0, pos.x),
        y: Math.max(0, pos.y),
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

  // Directional Edge Stretch (Right/Left stretch width only; Up/Down stretch height only)
  const startEdgeStretch = (
    edge: 'left' | 'right' | 'top' | 'bottom',
    startClientX: number,
    startClientY: number
  ) => {
    const startX0 = shape.x;
    const startY0 = shape.y;
    const startW = Math.max(20, shape.width);
    const startH = Math.max(20, shape.height);

    const isHorizontal = edge === 'left' || edge === 'right';
    const sign = edge === 'right' || edge === 'bottom' ? 1 : -1;
    const anchorNormX = edge === 'left' ? 1 : edge === 'right' ? 0 : 0.5;
    const anchorNormY = edge === 'top' ? 1 : edge === 'bottom' ? 0 : 0.5;

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const { localDx, localDy, cos, sin } = projectDeltaToLocal(
        ev.clientX - startClientX,
        ev.clientY - startClientY
      );

      let newW = startW;
      let newH = startH;
      if (isHorizontal) {
        newW = Math.max(20, Math.min(1400, startW + sign * localDx));
      } else {
        newH = Math.max(20, Math.min(1400, startH + sign * localDy));
      }

      const pos = computeRotatedBoxForAnchor(
        startX0,
        startY0,
        startW,
        startH,
        newW,
        newH,
        anchorNormX,
        anchorNormY,
        cos,
        sin
      );

      let finalX = pos.x;
      let finalY = pos.y;
      if (cos === 1 && sin === 0) {
        if (edge === 'left' && finalX < 0) {
          newW = Math.max(20, startX0 + startW);
          finalX = 0;
        }
        if (edge === 'top' && finalY < 0) {
          newH = Math.max(20, startY0 + startH);
          finalY = 0;
        }
      }

      onUpdate({
        x: Math.max(0, finalX),
        y: Math.max(0, finalY),
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

  const handleCornerPointerDown = (
    corner: 'tl' | 'tr' | 'bl' | 'br',
    e: React.PointerEvent
  ) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    startCornerResize(corner, e.clientX, e.clientY);
  };

  const handleEdgePointerDown = (
    edge: 'left' | 'right' | 'top' | 'bottom',
    e: React.PointerEvent
  ) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    startEdgeStretch(edge, e.clientX, e.clientY);
  };

  const w = Math.max(20, shape.width);
  const h = Math.max(20, shape.height);

  return (
    <div
      ref={containerRef}
      data-testid={`interactive-grid-box-${shape.id}`}
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
      <svg
        shapeRendering="geometricPrecision"
        className="w-full h-full overflow-visible pointer-events-none"
      >
        {/* Outer Grid Border */}
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth || 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={strokeDash}
        />

        {/* Vertical Grid Lines (Frozen count) */}
        {Array.from({ length: cols - 1 }).map((_, i) => {
          const lx = ((i + 1) / cols) * w;
          const isCenter = Math.abs(i + 1 - cols / 2) < 0.5;
          const baseW = shape.strokeWidth || 1.5;
          return (
            <line
              key={`grid-v-${i}`}
              x1={lx}
              y1={0}
              x2={lx}
              y2={h}
              stroke={strokeColor}
              strokeWidth={isCenter ? baseW * 1.2 : Math.max(0.85, baseW * 0.85)}
              strokeOpacity={isCenter ? 0.9 : 0.65}
              strokeLinecap="round"
              strokeDasharray={isCenter ? undefined : strokeDash}
            />
          );
        })}

        {/* Horizontal Grid Lines (Frozen count) */}
        {Array.from({ length: rows - 1 }).map((_, j) => {
          const ly = ((j + 1) / rows) * h;
          const isCenter = Math.abs(j + 1 - rows / 2) < 0.5;
          const baseW = shape.strokeWidth || 1.5;
          return (
            <line
              key={`grid-h-${j}`}
              x1={0}
              y1={ly}
              x2={w}
              y2={ly}
              stroke={strokeColor}
              strokeWidth={isCenter ? baseW * 1.2 : Math.max(0.85, baseW * 0.85)}
              strokeOpacity={isCenter ? 0.9 : 0.65}
              strokeLinecap="round"
              strokeDasharray={isCenter ? undefined : strokeDash}
            />
          );
        })}
      </svg>

      {/* ============================================================== */}
      {/* ACTIVE CONTROLS (4 Proportional Corners + 4 Directional Edges) */}
      {/* ============================================================== */}
      {isActive && !hideChrome && (
        <>
          {/* TOP-LEFT CORNER RESIZE HANDLE (Proportional) */}
          <div
            data-testid="grid-resize-tl"
            onPointerDown={(e) => handleCornerPointerDown('tl', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag corner to resize entire grid proportionally"
            className="absolute -top-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
          >
            <div className="w-5 h-5 border-t-3 border-l-3 border-indigo-600 rounded-tl-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-500">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* TOP-RIGHT CORNER RESIZE HANDLE (Proportional) */}
          <div
            data-testid="grid-resize-tr"
            onPointerDown={(e) => handleCornerPointerDown('tr', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag corner to resize entire grid proportionally"
            className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
          >
            <div className="w-5 h-5 border-t-3 border-r-3 border-indigo-600 rounded-tr-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-500">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* BOTTOM-LEFT CORNER RESIZE HANDLE (Proportional) */}
          <div
            data-testid="grid-resize-bl"
            onPointerDown={(e) => handleCornerPointerDown('bl', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag corner to resize entire grid proportionally"
            className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
          >
            <div className="w-5 h-5 border-b-3 border-l-3 border-indigo-600 rounded-bl-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-500">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* BOTTOM-RIGHT CORNER RESIZE HANDLE (Proportional) */}
          <div
            data-testid="grid-resize-br"
            onPointerDown={(e) => handleCornerPointerDown('br', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag corner to resize entire grid proportionally"
            className="absolute -bottom-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
          >
            <div className="w-5 h-5 border-b-3 border-r-3 border-indigo-600 rounded-br-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-500">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* TOP EDGE STRETCH HANDLE (Stretch Up Only) */}
          <div
            data-testid="grid-stretch-top"
            onPointerDown={(e) => handleEdgePointerDown('top', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag up or down to stretch rows vertically"
            className="absolute -top-3 left-1/2 -translate-x-1/2 w-9 h-6 flex items-center justify-center cursor-ns-resize hover:scale-110 transition-transform z-50 pointer-events-auto touch-none"
          >
            <div className="w-7 h-2.5 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 shadow-md flex items-center justify-center">
              <div className="w-3.5 h-0.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* BOTTOM EDGE STRETCH HANDLE (Stretch Down Only) */}
          <div
            data-testid="grid-stretch-bottom"
            onPointerDown={(e) => handleEdgePointerDown('bottom', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag up or down to stretch rows vertically"
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-9 h-6 flex items-center justify-center cursor-ns-resize hover:scale-110 transition-transform z-50 pointer-events-auto touch-none"
          >
            <div className="w-7 h-2.5 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 shadow-md flex items-center justify-center">
              <div className="w-3.5 h-0.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* LEFT EDGE STRETCH HANDLE (Stretch Left Only) */}
          <div
            data-testid="grid-stretch-left"
            onPointerDown={(e) => handleEdgePointerDown('left', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag left or right to stretch columns horizontally"
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-9 flex items-center justify-center cursor-ew-resize hover:scale-110 transition-transform z-50 pointer-events-auto touch-none"
          >
            <div className="w-2.5 h-7 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 shadow-md flex items-center justify-center">
              <div className="w-0.5 h-3.5 bg-indigo-600 rounded-full" />
            </div>
          </div>

          {/* RIGHT EDGE STRETCH HANDLE (Stretch Right Only) */}
          <div
            data-testid="grid-stretch-right"
            onPointerDown={(e) => handleEdgePointerDown('right', e)}
            onClick={(e) => e.stopPropagation()}
            title="Drag left or right to stretch columns horizontally"
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-9 flex items-center justify-center cursor-ew-resize hover:scale-110 transition-transform z-50 pointer-events-auto touch-none"
          >
            <div className="w-2.5 h-7 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 shadow-md flex items-center justify-center">
              <div className="w-0.5 h-3.5 bg-indigo-600 rounded-full" />
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

              <div
                data-testid="grid-dims-control"
                onPointerDown={(e) => {
                  lastPointerTypeRef.current = e.pointerType;
                  if (e.pointerType === 'touch' && !allowFingerControls) return;
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                <Grid className="w-3 h-3 text-indigo-500 shrink-0" />
                {editingDimsField !== null ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="grid-cols-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditDims?.('cols');
                      }}
                      title="Edit columns with on-screen keyboard"
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                        editingDimsField === 'cols'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:border-indigo-400'
                      }`}
                    >
                      {editingDimsField === 'cols' ? editingDimsDraft || '—' : cols}
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Grid columns"
                      data-testid="grid-cols-input"
                      value={editingDimsField === 'cols' ? editingDimsDraft : String(cols)}
                      onFocus={() => {
                        if (editingDimsField !== 'cols') onStartEditDims?.('cols');
                      }}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                        onChangeDimsDraft?.('cols', clean);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          onStartEditDims?.('rows');
                        } else if (e.key === 'Enter' || e.key === 'Escape') {
                          e.preventDefault();
                          onStopEditDims?.();
                        }
                      }}
                      className="sr-only"
                    />
                    <span className="text-slate-400">×</span>
                    <button
                      type="button"
                      data-testid="grid-rows-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditDims?.('rows');
                      }}
                      title="Edit rows with on-screen keyboard"
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                        editingDimsField === 'rows'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:border-indigo-400'
                      }`}
                    >
                      {editingDimsField === 'rows' ? editingDimsDraft || '—' : rows}
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Grid rows"
                      data-testid="grid-rows-input"
                      value={editingDimsField === 'rows' ? editingDimsDraft : String(rows)}
                      onFocus={() => {
                        if (editingDimsField !== 'rows') onStartEditDims?.('rows');
                      }}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                        onChangeDimsDraft?.('rows', clean);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          onStartEditDims?.('cols');
                        } else if (e.key === 'Enter' || e.key === 'Escape') {
                          e.preventDefault();
                          onStopEditDims?.();
                        }
                      }}
                      className="sr-only"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">lines</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="grid-dims-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartEditDims?.('cols');
                    }}
                    title="Click to edit columns × rows with the on-screen keyboard"
                    className="flex items-center gap-0.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    <span>
                      {cols}×{rows} lines
                    </span>
                  </button>
                )}
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
