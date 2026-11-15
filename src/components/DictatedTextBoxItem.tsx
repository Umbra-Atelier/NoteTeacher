import React, { useEffect, useRef, useState } from 'react';
import { Compass, Keyboard, Mic, Trash2, X } from 'lucide-react';
import { DictatedTextBox } from '../types';
import { AnchoredScreenPopup } from './ViewportPortalPopup';
import { RotationJoystickControl } from './RotationJoystickControl';

interface DictatedTextBoxItemProps {
  box: DictatedTextBox;
  isDictatingActive: boolean;
  isListening: boolean;
  showTransformBox: boolean;
  isEditing?: boolean;
  isEraserActive?: boolean;
  zoomScale?: number;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  passThroughBody?: boolean;
  onSelectForTransform: () => void;
  onResumeDictation?: () => void;
  onStartManualEdit?: () => void;
  onStopManualEdit?: () => void;
  onDeselect?: () => void;
  onUpdate: (updated: Partial<DictatedTextBox>) => void;
  onCommitHistory?: () => void;
  onDelete: () => void;
}

export const DictatedTextBoxItem: React.FC<DictatedTextBoxItemProps> = ({
  box,
  isDictatingActive,
  isListening,
  showTransformBox,
  isEditing = false,
  isEraserActive = false,
  zoomScale = 1,
  isReadOnly = false,
  hideChrome = false,
  passThroughBody = false,
  onSelectForTransform,
  onResumeDictation,
  onStartManualEdit,
  onStopManualEdit,
  onDeselect,
  onUpdate,
  onCommitHistory,
  onDelete,
}) => {
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aabbAnchorRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const lastTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastDoubleTriggerRef = useRef<number>(0);

  const [isDraggingMove, setIsDraggingMove] = useState(false);
  const [isJoystickOpen, setIsJoystickOpen] = useState(false);
  const [isDraggingJoystick, setIsDraggingJoystick] = useState(false);

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onCommitHistoryRef = useRef(onCommitHistory);
  onCommitHistoryRef.current = onCommitHistory;

  // Focus inline textarea cleanly at end of text whenever entering manual edit mode
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

  const triggerDoubleClickEdit = () => {
    if (isReadOnly || isEraserActive || !onStartManualEdit) return;
    const now = Date.now();
    if (now - lastDoubleTriggerRef.current < 350) return;
    lastDoubleTriggerRef.current = now;
    onStartManualEdit();
  };

  // Close joystick when transform box closes
  useEffect(() => {
    if (!showTransformBox) {
      setIsJoystickOpen(false);
      setIsDraggingJoystick(false);
    }
  }, [showTransformBox]);

  // Dynamically sync dimensions to rendered text so sideways-expanding nowrap boxes
  // and vertically wrapping boxes always have accurate bounds & transform frames.
  useEffect(() => {
    const el = contentMeasureRef.current;
    if (!el || isReadOnly) return;

    const measureAndSync = () => {
      if (isResizingRef.current) return;
      const measuredW = Math.ceil(el.scrollWidth);
      const measuredH = Math.ceil(el.scrollHeight);

      if (!box.wrap) {
        const targetW = Math.max(Math.round(box.fontSize * 1.8), 90, measuredW);
        const targetH = Math.max(Math.round(box.fontSize * 1.08), measuredH);
        if (Math.abs(targetW - box.width) > 2 || Math.abs(targetH - box.height) > 2) {
          onUpdateRef.current({ width: targetW, height: targetH });
        }
      } else {
        const targetH = Math.max(Math.round(box.fontSize * 1.08), measuredH);
        if (targetH > box.height + 2) {
          onUpdateRef.current({ height: targetH });
        }
      }
    };

    measureAndSync();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measureAndSync);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [box.text, box.interimText, box.fontSize, box.wrap, box.width, box.height, isReadOnly, isEditing]);

  // Smooth Compass Grab Movement (60fps, zoom-aware)
  const startCompassDrag = (startClientX: number, startClientY: number) => {
    if (isReadOnly) return;
    onCommitHistoryRef.current?.();
    setIsDraggingMove(true);

    const startX = box.x;
    const startY = box.y;
    const scale = zoomScale || 1;
    let rafId: number | null = null;
    let latestClientX = startClientX;
    let latestClientY = startClientY;

    const applyMove = () => {
      const dx = (latestClientX - startClientX) / scale;
      const dy = (latestClientY - startClientY) / scale;
      onUpdateRef.current({
        x: Math.max(0, startX + dx),
        y: Math.max(0, startY + dy),
      });
      rafId = null;
    };

    const onMove = (cx: number, cy: number) => {
      latestClientX = cx;
      latestClientY = cy;
      if (rafId === null) {
        rafId = requestAnimationFrame(applyMove);
      }
    };

    const handleMouseMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
    const handleTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) {
        ev.preventDefault();
        onMove(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };
    const handleEnd = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      applyMove();
      setIsDraggingMove(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  // Proportional L-Grab Resize (strictly preserves aspect ratio & scales fontSize proportionally,
  // even when box is rotated!)
  const startCornerResize = (
    sx: -1 | 1,
    sy: -1 | 1,
    startClientX: number,
    startClientY: number
  ) => {
    if (isReadOnly) return;
    onCommitHistoryRef.current?.();
    isResizingRef.current = true;

    const startW = Math.max(40, box.width);
    const startH = Math.max(14, box.height);
    const startFont = Math.max(10, box.fontSize);
    const startCx = box.x + startW / 2;
    const startCy = box.y + startH / 2;
    const aspect = startW / startH;
    const rad = (box.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const scale = zoomScale || 1;

    const onMove = (clientX: number, clientY: number) => {
      const dx = (clientX - startClientX) / scale;
      const dy = (clientY - startClientY) / scale;

      // Project world delta onto the box's rotated local X/Y axes
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;

      // Outward drag along this corner direction
      const expand = (sx * localDx + sy * localDy) / 2;
      const newW = Math.max(48, Math.min(2400, startW + expand));
      const ratio = newW / startW;
      const newH = newW / aspect;
      const newFontSize = Math.max(8, startFont * ratio);

      // Keep the opposite corner pinned stationary in world space
      const dW = newW - startW;
      const dH = newH - startH;
      const localShiftX = (sx * dW) / 2;
      const localShiftY = (sy * dH) / 2;

      const worldShiftX = localShiftX * cos - localShiftY * sin;
      const worldShiftY = localShiftX * sin + localShiftY * cos;

      const newCx = startCx + worldShiftX;
      const newCy = startCy + worldShiftY;

      onUpdateRef.current({
        x: Math.max(0, newCx - newW / 2),
        y: Math.max(0, newCy - newH / 2),
        width: newW,
        height: newH,
        fontSize: newFontSize,
      });
    };

    const handleMouseMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
    const handleTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) {
        ev.preventDefault();
        onMove(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };
    const handleEnd = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  const hasAnyText = Boolean(box.text || box.interimText);
  const showSelectionChrome = !hideChrome && !isReadOnly && showTransformBox && !isEditing;
  const showActiveDictationChrome =
    !hideChrome && !isReadOnly && isDictatingActive && !showTransformBox && !isEditing;
  const shouldPassThrough = isReadOnly || isEraserActive || (passThroughBody && !isEditing);

  // Visual un-rotated AABB around the rotated box for screen-safe, non-spinning top/bottom chrome
  const boxRad = ((box.rotation || 0) * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(boxRad));
  const absSin = Math.abs(Math.sin(boxRad));
  const aabbW = box.width * absCos + box.height * absSin;
  const aabbH = box.width * absSin + box.height * absCos;

  return (
    <div
      className={`dictated-text-box absolute ${
        isEditing
          ? 'z-50'
          : showSelectionChrome
          ? 'z-50'
          : showActiveDictationChrome
          ? 'z-[46]'
          : 'z-[38]'
      } ${isEditing ? 'select-text' : 'select-none'} ${
        shouldPassThrough ? 'pointer-events-none' : ''
      } ${box.isGhosted ? 'opacity-35' : ''}`}
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    >
      {/* Un-rotated Visual AABB Anchor for Portaled Top Rotation Joystick & Bottom Action Bar */}
      <div
        ref={aabbAnchorRef}
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          left: `${(box.width - aabbW) / 2}px`,
          top: `${(box.height - aabbH) / 2}px`,
          width: `${aabbW}px`,
          height: `${aabbH}px`,
        }}
      />

      {/* Only the text box + border + corner L-grabs rotate! */}
      <div
        className="relative w-full h-full"
        style={{
          transform: `rotate(${box.rotation || 0}deg)`,
          transformOrigin: 'center center',
        }}
        onPointerDown={(e) => {
          if (shouldPassThrough) return;
          e.stopPropagation();
          if (isEditing) return;

          // Touch / pen double-tap detection so touch users can double-tap cleanly without opening on single tap
          if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            const now = Date.now();
            const prev = lastTouchTapRef.current;
            if (
              prev &&
              now - prev.time < 340 &&
              Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 28
            ) {
              lastTouchTapRef.current = null;
              triggerDoubleClickEdit();
              return;
            }
            lastTouchTapRef.current = { time: now, x: e.clientX, y: e.clientY };
          }

          if (!isDictatingActive && !showTransformBox) {
            onSelectForTransform();
          }
        }}
        onClick={(e) => {
          if (shouldPassThrough) return;
          e.stopPropagation();
          if (isEditing) return;
          if (!isDictatingActive && !showTransformBox) {
            onSelectForTransform();
          }
        }}
        onDoubleClick={(e) => {
          if (shouldPassThrough) return;
          e.stopPropagation();
          triggerDoubleClickEdit();
        }}
        title={
          !isReadOnly && !isEditing && !shouldPassThrough
            ? 'Double-click to type manually or open on-screen keyboard'
            : undefined
        }
      >
      {/* Bounding Box Outline */}
      {(showSelectionChrome || showActiveDictationChrome || isEditing || box.isGhosted) && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none rounded transition-colors ${
            box.isGhosted
              ? 'border-2 border-dashed border-red-500 bg-red-500/10'
              : isEditing
              ? 'border-2 border-sky-500 bg-white/80 dark:bg-slate-900/80 ring-2 ring-sky-400/30 shadow-sm'
              : showSelectionChrome
              ? 'border-2 border-sky-500 bg-sky-500/5 shadow-sm'
              : isListening
              ? 'border-2 border-dashed border-blue-500 bg-blue-500/5'
              : 'border-2 border-dashed border-sky-400/80 bg-sky-500/5'
          }`}
        />
      )}

      {/* Mirror Text Content (drives auto-width for nowrap and auto-height for wrap) */}
      <div
        ref={contentMeasureRef}
        aria-hidden={isEditing}
        style={{
          fontSize: `${box.fontSize}px`,
          lineHeight: 1.08,
          color: box.color || '#0F172A',
          whiteSpace: box.wrap ? 'pre-wrap' : 'pre',
          wordBreak: box.wrap ? 'break-word' : 'normal',
          overflowWrap: box.wrap ? 'anywhere' : 'normal',
          width: box.wrap ? '100%' : 'max-content',
          minWidth: box.wrap ? undefined : '100%',
        }}
        className={`font-sans font-medium tracking-normal ${
          isEditing ? 'opacity-0 pointer-events-none select-none' : ''
        }`}
      >
        {hasAnyText ? (
          <>
            <span>{box.text}</span>
            {isEditing ? '\u200b' : null}
            {box.interimText && (
              <span className="text-sky-600 dark:text-sky-400 opacity-85">
                {box.text && !/[\s]$/.test(box.text) ? ' ' : ''}
                {box.interimText}
              </span>
            )}
          </>
        ) : isEditing ? (
          '\u200b'
        ) : showActiveDictationChrome || showSelectionChrome ? (
          <span
            className="opacity-45 italic select-none"
            style={{ fontSize: `${Math.min(box.fontSize, Math.max(12, box.fontSize * 0.85))}px` }}
          >
            {isListening ? 'Listening (English)...' : 'Double-click to type or click mic...'}
          </span>
        ) : null}
      </div>

      {/* Live Inline Textarea when Double-Clicked (Supports Connected Keyboard + On-Screen Keyboard) */}
      {isEditing && !isReadOnly && (
        <textarea
          ref={textareaRef}
          data-dictate-editor={box.id}
          value={box.text}
          wrap={box.wrap ? 'soft' : 'off'}
          onChange={(e) => {
            onUpdateRef.current({ text: e.target.value, interimText: '' });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              onStopManualEdit?.();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          placeholder="Type here..."
          spellCheck={true}
          style={{
            fontSize: `${box.fontSize}px`,
            lineHeight: 1.08,
            color: box.color || '#0F172A',
            whiteSpace: box.wrap ? 'pre-wrap' : 'pre',
            wordBreak: box.wrap ? 'break-word' : 'normal',
            overflowWrap: box.wrap ? 'anywhere' : 'normal',
          }}
          className="absolute inset-0 w-full h-full bg-transparent p-0 m-0 border-0 outline-none resize-none overflow-hidden font-sans font-medium tracking-normal select-text caret-sky-600"
        />
      )}

      {/* ================================================================= */}
      {/* CLICK-OFF / MODE-SWITCH TRANSFORM CONTROLS                        */}
      {/* (4 Corner L-Grabs with aspect-ratio lock, Compass Move, Rotation) */}
      {/* ================================================================= */}
      {showSelectionChrome && (
        <>
          {/* TOP-LEFT L-GRAB */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              startCornerResize(-1, -1, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length === 1) {
                startCornerResize(-1, -1, e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag L-grab to resize (maintains aspect ratio)"
            className="absolute -top-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize hover:scale-125 transition-transform z-50 pointer-events-auto"
          >
            <div className="w-4 h-4 border-t-[3px] border-l-[3px] border-sky-600 rounded-tl bg-white dark:bg-slate-900 shadow-sm" />
          </div>

          {/* TOP-RIGHT L-GRAB */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              startCornerResize(1, -1, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length === 1) {
                startCornerResize(1, -1, e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag L-grab to resize (maintains aspect ratio)"
            className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 pointer-events-auto"
          >
            <div className="w-4 h-4 border-t-[3px] border-r-[3px] border-sky-600 rounded-tr bg-white dark:bg-slate-900 shadow-sm" />
          </div>

          {/* BOTTOM-LEFT L-GRAB */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              startCornerResize(-1, 1, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length === 1) {
                startCornerResize(-1, 1, e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag L-grab to resize (maintains aspect ratio)"
            className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 pointer-events-auto"
          >
            <div className="w-4 h-4 border-b-[3px] border-l-[3px] border-sky-600 rounded-bl bg-white dark:bg-slate-900 shadow-sm" />
          </div>

          {/* BOTTOM-RIGHT L-GRAB */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              startCornerResize(1, 1, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (e.touches.length === 1) {
                startCornerResize(1, 1, e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag L-grab to resize (maintains aspect ratio)"
            className="absolute -bottom-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize hover:scale-125 transition-transform z-50 pointer-events-auto"
          >
            <div className="w-4 h-4 border-b-[3px] border-r-[3px] border-sky-600 rounded-br bg-white dark:bg-slate-900 shadow-sm" />
          </div>
        </>
      )}
      </div>

      {/* ================================================================= */}
      {/* NON-SPINNING TOP ROTATION CONTROL + SPIN JOYSTICK (Portaled 0deg) */}
      {/* ================================================================= */}
      {showSelectionChrome && (
        <RotationJoystickControl
          rotation={box.rotation || 0}
          anchorRef={aabbAnchorRef}
          isOpen={isJoystickOpen}
          onToggleOpen={() => setIsJoystickOpen((prev) => !prev)}
          onCommitHistory={() => onCommitHistoryRef.current?.()}
          onDraggingChange={setIsDraggingJoystick}
          onRotateDelta={(deltaDeg) => {
            let nextRot = (box.rotation || 0) + deltaDeg;
            while (nextRot >= 180) nextRot -= 360;
            while (nextRot < -180) nextRot += 360;
            onUpdateRef.current({ rotation: nextRot });
          }}
          onResetZero={() => onUpdateRef.current({ rotation: 0 })}
          accent="sky"
          placement="top"
          gap={8}
        />
      )}

      {/* ================================================================= */}
      {/* COMPASS GRAB (Smooth Move) + RESUME MIC + TYPE + DELETE + DISMISS */}
      {/* Portaled so it is NEVER cut off by PDF POV edges or screen bounds */}
      {/* ================================================================= */}
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
          <div className="flex items-center gap-1.5 flex-wrap bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl select-none">
            {/* Compass Grab Handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                startCompassDrag(e.clientX, e.clientY);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (e.touches.length === 1) {
                  startCompassDrag(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Drag Compass to move text box smoothly"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs cursor-grab active:cursor-grabbing transition-colors ${
                isDraggingMove
                  ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                  : 'bg-sky-600 hover:bg-sky-700 text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Move</span>
            </div>

            {/* Resume Dictation Button */}
            {onResumeDictation && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResumeDictation();
                }}
                title="Resume dictating into this text box"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 shadow-xs"
              >
                <Mic className="w-3 h-3" />
                <span>Dictate</span>
              </button>
            )}

            {/* Open Keyboard / Type Manually Button */}
            {onStartManualEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartManualEdit();
                }}
                title="Type manually with physical or on-screen keyboard (or double-click box)"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs"
              >
                <Keyboard className="w-3 h-3" />
                <span>Type</span>
              </button>
            )}

            {/* Delete Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete dictated text box"
              className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 shadow-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Done / Hide Transform Box */}
            {onDeselect && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeselect();
                }}
                title="Hide selection box"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </AnchoredScreenPopup>
      )}
    </div>
  );
};
