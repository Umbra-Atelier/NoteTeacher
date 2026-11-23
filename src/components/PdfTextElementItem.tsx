import React, { useEffect, useRef, useState } from 'react';
import { Compass, Keyboard, Trash2, X } from 'lucide-react';
import { PdfTextElement } from '../types';
import { AnchoredScreenPopup } from './ViewportPortalPopup';
import { RotationJoystickControl } from './RotationJoystickControl';

interface PdfTextElementItemProps {
  element: PdfTextElement;
  stageWidth: number;
  stageHeight: number;
  pagePdfWidth?: number;
  isPdfEditorActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  zoomScale?: number;
  allowFingerControls?: boolean;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onDeselect: () => void;
  onUpdate: (updated: Partial<PdfTextElement>) => void;
  onCommitHistory?: () => void;
  onDelete: () => void;
}

export const PdfTextElementItem: React.FC<PdfTextElementItemProps> = ({
  element,
  stageWidth,
  stageHeight,
  pagePdfWidth = 612,
  isPdfEditorActive,
  isSelected,
  isEditing,
  zoomScale = 1,
  allowFingerControls = true,
  isReadOnly = false,
  hideChrome = false,
  onSelect,
  onStartEdit,
  onStopEdit,
  onDeselect,
  onUpdate,
  onCommitHistory,
  onDelete,
}) => {
  const measureRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aabbAnchorRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const lastPointerTypeRef = useRef<string>('mouse');
  const lastTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastDoubleTriggerRef = useRef<number>(0);

  const [isHovered, setIsHovered] = useState(false);
  const [isDraggingMove, setIsDraggingMove] = useState(false);
  const [isJoystickOpen, setIsJoystickOpen] = useState(false);
  const [isDraggingJoystick, setIsDraggingJoystick] = useState(false);

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onCommitHistoryRef = useRef(onCommitHistory);
  onCommitHistoryRef.current = onCommitHistory;

  const safeStageW = Math.max(100, stageWidth || 612);
  const safeStageH = Math.max(100, stageHeight || 792);
  const safePdfW = Math.max(100, pagePdfWidth || 612);
  const ptToPx = safeStageW / safePdfW;

  const boxX = element.nx * safeStageW;
  const boxY = element.ny * safeStageH;
  const boxW = Math.max(24, element.nw * safeStageW);
  const boxH = Math.max(16, element.nh * safeStageH);
  const fontSizePx = Math.max(8, (element.fontSizePt || 14) * ptToPx);

  const boxDimsRef = useRef({
    nx: element.nx,
    ny: element.ny,
    nw: element.nw,
    nh: element.nh,
    boxW,
    boxH,
    safeStageW,
    safeStageH,
  });
  boxDimsRef.current = {
    nx: element.nx,
    ny: element.ny,
    nw: element.nw,
    nh: element.nh,
    boxW,
    boxH,
    safeStageW,
    safeStageH,
  };

  useEffect(() => {
    if (!isEditing) return;
    const raf = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus({ preventScroll: true });
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditing]);

  useEffect(() => {
    if (!isSelected) {
      setIsJoystickOpen(false);
      setIsDraggingJoystick(false);
    }
  }, [isSelected]);

  // Keep dimensions fitted cleanly when typing or changing formatting
  useEffect(() => {
    const el = measureRef.current;
    if (!el || isReadOnly || element.status === 'deleted') return;
    if (element.origin === 'native' && element.status === 'unmodified') return;

    let rafId: number | null = null;
    const syncSize = () => {
      if (isResizingRef.current) return;
      const d = boxDimsRef.current;
      const measuredW = Math.ceil(el.scrollWidth) + 4;
      const measuredH = Math.ceil(el.scrollHeight) + 2;

      if (!element.wrap) {
        const targetW = Math.max(Math.round(fontSizePx * 1.8), 64, measuredW);
        const targetH = Math.max(Math.round(fontSizePx * 1.15), measuredH);
        if (Math.abs(targetW - d.boxW) > 3 || Math.abs(targetH - d.boxH) > 3) {
          onUpdateRef.current({
            nw: Math.min(1, targetW / d.safeStageW),
            nh: Math.min(1, targetH / d.safeStageH),
          });
        }
      } else {
        const targetH = Math.max(Math.round(fontSizePx * 1.15), measuredH);
        if (targetH > d.boxH + 3) {
          onUpdateRef.current({
            nh: Math.min(1, targetH / d.safeStageH),
          });
        }
      }
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        syncSize();
      });
    };

    schedule();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    }
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [
    element.text,
    element.fontSizePt,
    element.fontFamily,
    element.bold,
    element.italic,
    element.wrap,
    element.status,
    element.origin,
    fontSizePx,
    isReadOnly,
    isEditing,
  ]);

  const triggerDoubleEdit = () => {
    if (isReadOnly || !isPdfEditorActive) return;
    const now = Date.now();
    if (now - lastDoubleTriggerRef.current < 340) return;
    lastDoubleTriggerRef.current = now;
    if (element.status === 'unmodified') {
      onUpdateRef.current({ status: 'edited' });
    }
    onStartEdit();
  };

  const startDragMove = (startClientX: number, startClientY: number) => {
    if (isReadOnly) return;
    onCommitHistoryRef.current?.();
    setIsDraggingMove(true);

    const startNx = element.nx;
    const startNy = element.ny;
    const scale = zoomScale || 1;
    let rafId: number | null = null;
    let lastX = startClientX;
    let lastY = startClientY;

    const applyMove = () => {
      const dx = (lastX - startClientX) / (scale * safeStageW);
      const dy = (lastY - startClientY) / (scale * safeStageH);
      onUpdateRef.current({
        status: 'edited',
        nx: Math.max(0, Math.min(0.98, startNx + dx)),
        ny: Math.max(0, Math.min(0.98, startNy + dy)),
      });
      rafId = null;
    };

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (rafId === null) rafId = requestAnimationFrame(applyMove);
    };
    const onEnd = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      applyMove();
      setIsDraggingMove(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const startCornerResize = (
    sx: -1 | 1,
    sy: -1 | 1,
    startClientX: number,
    startClientY: number
  ) => {
    if (isReadOnly) return;
    onCommitHistoryRef.current?.();
    isResizingRef.current = true;

    const startW = Math.max(36, boxW);
    const startH = Math.max(14, boxH);
    const startFontPt = Math.max(6, element.fontSizePt || 14);
    const startCx = boxX + startW / 2;
    const startCy = boxY + startH / 2;
    const aspect = startW / startH;
    const rad = ((element.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const scale = zoomScale || 1;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const dx = (ev.clientX - startClientX) / scale;
      const dy = (ev.clientY - startClientY) / scale;
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      const expand = (sx * localDx + sy * localDy) / 2;
      const newW = Math.max(40, Math.min(safeStageW, startW + expand));
      const ratio = newW / startW;
      const newH = newW / aspect;
      const newFontPt = Math.max(6, Math.min(200, Math.round(startFontPt * ratio * 10) / 10));

      const dW = newW - startW;
      const dH = newH - startH;
      const localShiftX = (sx * dW) / 2;
      const localShiftY = (sy * dH) / 2;
      const worldShiftX = localShiftX * cos - localShiftY * sin;
      const worldShiftY = localShiftX * sin + localShiftY * cos;

      const newCx = startCx + worldShiftX;
      const newCy = startCy + worldShiftY;

      onUpdateRef.current({
        status: 'edited',
        nx: Math.max(0, (newCx - newW / 2) / safeStageW),
        ny: Math.max(0, (newCy - newH / 2) / safeStageH),
        nw: newW / safeStageW,
        nh: newH / safeStageH,
        fontSizePt: newFontPt,
      });
    };

    const onEnd = () => {
      isResizingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  // Mask patch over original native text location when edited or deleted
  const showNativeMaskPatch =
    element.origin === 'native' &&
    (element.status === 'edited' || element.status === 'deleted') &&
    Boolean(element.originalBounds);

  // If unmodified native text and NOT in PDF editor mode, nothing to draw (PDF.js tiles handle it crisply)
  if (element.origin === 'native' && element.status === 'unmodified' && !isPdfEditorActive) {
    return null;
  }

  // If deleted native text, only render the white mask patch (no interactive text box)
  if (element.status === 'deleted') {
    if (!showNativeMaskPatch || !element.originalBounds) return null;
    const ob = element.originalBounds;
    return (
      <div
        aria-hidden="true"
        className="absolute bg-white pointer-events-none z-[12]"
        style={{
          left: `${ob.nx * safeStageW - 2}px`,
          top: `${ob.ny * safeStageH - 2}px`,
          width: `${ob.nw * safeStageW + 4}px`,
          height: `${ob.nh * safeStageH + 4}px`,
        }}
      />
    );
  }

  const fontStack =
    element.fontFamily === 'TimesRoman'
      ? '"Times New Roman", Georgia, serif'
      : element.fontFamily === 'Courier'
      ? '"Courier New", Courier, monospace'
      : 'Helvetica, Arial, sans-serif';

  const isNativeOverlayUnmodified = element.origin === 'native' && element.status === 'unmodified';
  const showSelectionChrome = !hideChrome && !isReadOnly && isPdfEditorActive && isSelected && !isEditing;

  const boxRad = ((element.rotation || 0) * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(boxRad));
  const absSin = Math.abs(Math.sin(boxRad));
  const aabbW = boxW * absCos + boxH * absSin;
  const aabbH = boxW * absSin + boxH * absCos;

  return (
    <>
      {showNativeMaskPatch && element.originalBounds && (
        <div
          aria-hidden="true"
          className="absolute bg-white pointer-events-none z-[12]"
          style={{
            left: `${element.originalBounds.nx * safeStageW - 2}px`,
            top: `${element.originalBounds.ny * safeStageH - 2}px`,
            width: `${element.originalBounds.nw * safeStageW + 4}px`,
            height: `${element.originalBounds.nh * safeStageH + 4}px`,
          }}
        />
      )}

      <div
        data-pdf-text-id={element.id}
        onMouseEnter={() => isPdfEditorActive && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`pdf-text-element absolute ${
          isEditing || showSelectionChrome
            ? 'z-50'
            : isPdfEditorActive
            ? 'z-[44]'
            : 'z-[15]'
        } ${isEditing ? 'select-text' : 'select-none'} ${
          !isPdfEditorActive || isReadOnly ? 'pointer-events-none' : 'cursor-pointer'
        }`}
        style={{
          left: `${boxX}px`,
          top: `${boxY}px`,
          width: `${boxW}px`,
          height: `${boxH}px`,
        }}
      >
        <div
          ref={aabbAnchorRef}
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: `${(boxW - aabbW) / 2}px`,
            top: `${(boxH - aabbH) / 2}px`,
            width: `${aabbW}px`,
            height: `${aabbH}px`,
          }}
        />

        <div
          className="relative w-full h-full"
          style={{
            transform: `rotate(${element.rotation || 0}deg)`,
            transformOrigin: 'center center',
          }}
          onPointerDown={(e) => {
            lastPointerTypeRef.current = e.pointerType;
            if (!isPdfEditorActive || isReadOnly) return;
            if (e.pointerType === 'touch' && !allowFingerControls) return;
            e.stopPropagation();
            if (isEditing) return;

            if (e.pointerType === 'touch' || e.pointerType === 'pen') {
              const now = Date.now();
              const prev = lastTouchTapRef.current;
              if (
                prev &&
                now - prev.time < 340 &&
                Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 28
              ) {
                lastTouchTapRef.current = null;
                triggerDoubleEdit();
                return;
              }
              lastTouchTapRef.current = { time: now, x: e.clientX, y: e.clientY };
            }

            if (!isSelected) {
              onSelect();
            } else if (e.pointerType === 'mouse' && e.button === 0) {
              // Quick drag move on already-selected PDF text element body
              const sx = e.clientX;
              const sy = e.clientY;
              const onMoveCheck = (mv: PointerEvent) => {
                if (Math.hypot(mv.clientX - sx, mv.clientY - sy) > 5) {
                  cleanup();
                  startDragMove(sx, sy);
                }
              };
              const cleanup = () => {
                window.removeEventListener('pointermove', onMoveCheck);
                window.removeEventListener('pointerup', cleanup);
              };
              window.addEventListener('pointermove', onMoveCheck);
              window.addEventListener('pointerup', cleanup, { once: true });
            }
          }}
          onClick={(e) => {
            if (!isPdfEditorActive || isReadOnly) return;
            if (!allowFingerControls && lastPointerTypeRef.current === 'touch') return;
            e.stopPropagation();
            if (!isEditing && !isSelected) {
              onSelect();
            }
          }}
          onDoubleClick={(e) => {
            if (!isPdfEditorActive || isReadOnly) return;
            if (!allowFingerControls && lastPointerTypeRef.current === 'touch') return;
            e.stopPropagation();
            triggerDoubleEdit();
          }}
          title={
            isPdfEditorActive && !isEditing
              ? 'Click to select · Double-click to edit PDF text'
              : undefined
          }
        >
          {/* Acrobat-style Bounding Frame */}
          {(showSelectionChrome ||
            isEditing ||
            (isPdfEditorActive && !hideChrome && (isHovered || element.origin === 'native'))) && (
            <div
              aria-hidden="true"
              className={`absolute inset-0 pointer-events-none rounded-xs transition-colors ${
                isEditing
                  ? 'border-2 border-blue-600 bg-white/95 ring-2 ring-blue-400/30 shadow-sm'
                  : showSelectionChrome
                  ? 'border-2 border-blue-600 bg-blue-500/5 shadow-sm'
                  : isHovered
                  ? 'border border-blue-500 bg-blue-500/10'
                  : 'border border-dashed border-blue-400/40'
              }`}
            />
          )}

          {/* Rendered / Measured Text Content (hidden visually for unmodified native text since PDF tile shows underneath) */}
          <div
            ref={measureRef}
            aria-hidden={isEditing || isNativeOverlayUnmodified}
            style={{
              fontFamily: fontStack,
              fontSize: `${fontSizePx}px`,
              lineHeight: 1.15,
              fontWeight: element.bold ? 700 : 400,
              fontStyle: element.italic ? 'italic' : 'normal',
              textDecoration: element.underline ? 'underline' : 'none',
              color: element.color || '#000000',
              textAlign: element.align || 'left',
              whiteSpace: element.wrap ? 'pre-wrap' : 'pre',
              wordBreak: element.wrap ? 'break-word' : 'normal',
              overflowWrap: element.wrap ? 'anywhere' : 'normal',
              width: element.wrap ? '100%' : 'max-content',
              minWidth: element.wrap ? undefined : '100%',
            }}
            className={`px-0.5 ${
              isEditing || isNativeOverlayUnmodified
                ? 'opacity-0 pointer-events-none select-none'
                : ''
            }`}
          >
            {element.text ? (
              <span>{element.text}</span>
            ) : isPdfEditorActive && !isEditing ? (
              <span className="opacity-45 italic">Double-click to type PDF text...</span>
            ) : null}
          </div>

          {/* Inline Textarea Editor */}
          {isEditing && !isReadOnly && (
            <textarea
              ref={textareaRef}
              data-pdf-text-editor={element.id}
              value={element.text}
              wrap={element.wrap ? 'soft' : 'off'}
              onChange={(e) => {
                onUpdateRef.current({ text: e.target.value, status: 'edited' });
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onStopEdit();
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              placeholder="Type PDF text..."
              spellCheck={true}
              style={{
                fontFamily: fontStack,
                fontSize: `${fontSizePx}px`,
                lineHeight: 1.15,
                fontWeight: element.bold ? 700 : 400,
                fontStyle: element.italic ? 'italic' : 'normal',
                textDecoration: element.underline ? 'underline' : 'none',
                color: element.color || '#000000',
                textAlign: element.align || 'left',
                whiteSpace: element.wrap ? 'pre-wrap' : 'pre',
                wordBreak: element.wrap ? 'break-word' : 'normal',
                overflowWrap: element.wrap ? 'anywhere' : 'normal',
              }}
              className="absolute inset-0 w-full h-full bg-transparent px-0.5 py-0 m-0 border-0 outline-none resize-none overflow-hidden select-text caret-blue-600"
            />
          )}

          {/* 4 Corner L-Grab Resize Handles */}
          {showSelectionChrome && (
            <>
              {(
                [
                  { sx: -1, sy: -1, pos: '-top-3 -left-3', border: 'border-t-[3px] border-l-[3px] rounded-tl', cur: 'cursor-nwse-resize' },
                  { sx: 1, sy: -1, pos: '-top-3 -right-3', border: 'border-t-[3px] border-r-[3px] rounded-tr', cur: 'cursor-nesw-resize' },
                  { sx: -1, sy: 1, pos: '-bottom-3 -left-3', border: 'border-b-[3px] border-l-[3px] rounded-bl', cur: 'cursor-nesw-resize' },
                  { sx: 1, sy: 1, pos: '-bottom-3 -right-3', border: 'border-b-[3px] border-r-[3px] rounded-br', cur: 'cursor-nwse-resize' },
                ] as const
              ).map((c) => (
                <div
                  key={`${c.sx},${c.sy}`}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'touch' && !allowFingerControls) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startCornerResize(c.sx, c.sy, e.clientX, e.clientY);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    triggerDoubleEdit();
                  }}
                  title="Resize PDF text box"
                  className={`absolute ${c.pos} w-4 h-4 flex items-center justify-center ${c.cur} hover:scale-125 transition-transform z-50 pointer-events-auto touch-none`}
                >
                  <div className={`w-3 h-3 ${c.border} border-blue-600 bg-white dark:bg-slate-900 shadow-sm`} />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Top Rotation Joystick */}
        {showSelectionChrome && (
          <RotationJoystickControl
            rotation={element.rotation || 0}
            anchorRef={aabbAnchorRef}
            isOpen={isJoystickOpen}
            allowFingerControls={allowFingerControls}
            onToggleOpen={() => setIsJoystickOpen((prev) => !prev)}
            onCommitHistory={() => onCommitHistoryRef.current?.()}
            onDraggingChange={setIsDraggingJoystick}
            onRotateDelta={(deltaDeg) => {
              let nextRot = (element.rotation || 0) + deltaDeg;
              while (nextRot >= 180) nextRot -= 360;
              while (nextRot < -180) nextRot += 360;
              onUpdateRef.current({ status: 'edited', rotation: nextRot });
            }}
            onResetZero={() => onUpdateRef.current({ status: 'edited', rotation: 0 })}
            accent="sky"
            placement="top"
            gap={8}
          />
        )}

        {/* Bottom Portaled Action Bar (Move, Edit/Keyboard, Delete, Done) */}
        {showSelectionChrome && (
          <AnchoredScreenPopup
            anchorRef={aabbAnchorRef}
            placement="bottom"
            align="start"
            gap={10}
            zIndexClass="z-[10005]"
            respectHeader={true}
            freezePosition={isDraggingMove || isDraggingJoystick}
          >
            <div className="ui-scale-target flex items-center gap-1.5 flex-wrap bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl select-none">
              <div
                onPointerDown={(e) => {
                  if (e.pointerType === 'touch' && !allowFingerControls) return;
                  e.preventDefault();
                  e.stopPropagation();
                  startDragMove(e.clientX, e.clientY);
                }}
                title="Drag to move PDF text box"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs cursor-grab active:cursor-grabbing transition-colors touch-none ${
                  isDraggingMove
                    ? 'bg-blue-700 text-white ring-2 ring-blue-300'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Move</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (element.status === 'unmodified') {
                    onUpdateRef.current({ status: 'edited' });
                  }
                  onStartEdit();
                }}
                title="Edit PDF text with physical or on-screen keyboard"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs cursor-pointer"
              >
                <Keyboard className="w-3 h-3" />
                <span>Edit Text</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete PDF text element"
                className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeselect();
                }}
                title="Deselect"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </AnchoredScreenPopup>
        )}
      </div>
    </>
  );
};
