import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Crop,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { PdfImageElement } from '../types';
import { AnchoredScreenPopup } from './ViewportPortalPopup';
import { RotationJoystickControl } from './RotationJoystickControl';

interface PdfImageElementItemProps {
  element: PdfImageElement;
  stageWidth: number;
  stageHeight: number;
  isPdfEditorActive: boolean;
  isSelected: boolean;
  zoomScale?: number;
  allowFingerControls?: boolean;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onUpdate: (updated: Partial<PdfImageElement>) => void;
  onCommitHistory?: () => void;
  onDelete: () => void;
}

export const PdfImageElementItem: React.FC<PdfImageElementItemProps> = ({
  element,
  stageWidth,
  stageHeight,
  isPdfEditorActive,
  isSelected,
  zoomScale = 1,
  allowFingerControls = true,
  isReadOnly = false,
  hideChrome = false,
  onSelect,
  onDeselect,
  onUpdate,
  onCommitHistory,
  onDelete,
}) => {
  const aabbAnchorRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>('mouse');

  const [isHovered, setIsHovered] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isDraggingMove, setIsDraggingMove] = useState(false);
  const [isJoystickOpen, setIsJoystickOpen] = useState(false);
  const [isDraggingJoystick, setIsDraggingJoystick] = useState(false);

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onCommitHistoryRef = useRef(onCommitHistory);
  onCommitHistoryRef.current = onCommitHistory;

  useEffect(() => {
    if (!isSelected) {
      setIsCropping(false);
      setIsJoystickOpen(false);
      setIsDraggingJoystick(false);
    }
  }, [isSelected]);

  const safeStageW = Math.max(100, stageWidth || 612);
  const safeStageH = Math.max(100, stageHeight || 792);

  const boxX = element.nx * safeStageW;
  const boxY = element.ny * safeStageH;
  const boxW = Math.max(16, element.nw * safeStageW);
  const boxH = Math.max(16, element.nh * safeStageH);

  const crop = element.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const visFracW = Math.max(0.08, 1 - crop.left - crop.right);
  const visFracH = Math.max(0.08, 1 - crop.top - crop.bottom);
  const hasCrop =
    crop.top > 0.002 || crop.right > 0.002 || crop.bottom > 0.002 || crop.left > 0.002;

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

    const startW = Math.max(24, boxW);
    const startH = Math.max(24, boxH);
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
      const newW = Math.max(24, Math.min(safeStageW, startW + expand));
      const newH = newW / aspect;

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
      });
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  /**
   * Real-time image slicing crop drag: drags left/right/top/bottom crop edges
   * while keeping uncropped underlying image pixels anchored cleanly in place!
   */
  const startCropEdgeDrag = (
    edgeLeft: boolean,
    edgeRight: boolean,
    edgeTop: boolean,
    edgeBottom: boolean,
    startClientX: number,
    startClientY: number
  ) => {
    if (isReadOnly) return;
    onCommitHistoryRef.current?.();

    const startCrop = { ...crop };
    const startVisW = Math.max(0.08, 1 - startCrop.left - startCrop.right);
    const startVisH = Math.max(0.08, 1 - startCrop.top - startCrop.bottom);
    const startW = boxW;
    const startH = boxH;
    const fullW = startW / startVisW;
    const fullH = startH / startVisH;
    const startCx = boxX + startW / 2;
    const startCy = boxY + startH / 2;
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

      let nextL = startCrop.left;
      let nextR = startCrop.right;
      let nextT = startCrop.top;
      let nextB = startCrop.bottom;

      if (edgeLeft) {
        nextL = Math.max(0, Math.min(0.92 - startCrop.right, startCrop.left + localDx / fullW));
      }
      if (edgeRight) {
        nextR = Math.max(0, Math.min(0.92 - startCrop.left, startCrop.right - localDx / fullW));
      }
      if (edgeTop) {
        nextT = Math.max(0, Math.min(0.92 - startCrop.bottom, startCrop.top + localDy / fullH));
      }
      if (edgeBottom) {
        nextB = Math.max(0, Math.min(0.92 - startCrop.top, startCrop.bottom - localDy / fullH));
      }

      const nextVisW = Math.max(0.08, 1 - nextL - nextR);
      const nextVisH = Math.max(0.08, 1 - nextT - nextB);
      const newW = fullW * nextVisW;
      const newH = fullH * nextVisH;

      // Local center shift when cropping asymmetrically
      const dLeftPx = (nextL - startCrop.left) * fullW;
      const dRightPx = (nextR - startCrop.right) * fullW;
      const dTopPx = (nextT - startCrop.top) * fullH;
      const dBottomPx = (nextB - startCrop.bottom) * fullH;
      const localShiftX = (dLeftPx - dRightPx) / 2;
      const localShiftY = (dTopPx - dBottomPx) / 2;

      const worldShiftX = localShiftX * cos - localShiftY * sin;
      const worldShiftY = localShiftX * sin + localShiftY * cos;

      const newCx = startCx + worldShiftX;
      const newCy = startCy + worldShiftY;

      onUpdateRef.current({
        status: 'edited',
        crop: { top: nextT, right: nextR, bottom: nextB, left: nextL },
        nx: Math.max(0, (newCx - newW / 2) / safeStageW),
        ny: Math.max(0, (newCy - newH / 2) / safeStageH),
        nw: newW / safeStageW,
        nh: newH / safeStageH,
      });
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const handleResetCrop = () => {
    onCommitHistoryRef.current?.();
    const curCx = boxX + boxW / 2;
    const curCy = boxY + boxH / 2;
    const fullW = Math.min(safeStageW * 0.9, boxW / visFracW);
    const fullH = Math.min(safeStageH * 0.9, boxH / visFracH);
    onUpdateRef.current({
      status: 'edited',
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      nx: Math.max(0, (curCx - fullW / 2) / safeStageW),
      ny: Math.max(0, (curCy - fullH / 2) / safeStageH),
      nw: fullW / safeStageW,
      nh: fullH / safeStageH,
    });
  };

  const handleRotate90 = (deltaDeg: number) => {
    onCommitHistoryRef.current?.();
    let nextRot = (element.rotation || 0) + deltaDeg;
    while (nextRot >= 180) nextRot -= 360;
    while (nextRot < -180) nextRot += 360;
    onUpdateRef.current({ status: 'edited', rotation: nextRot });
  };

  const showNativeMaskPatch =
    element.origin === 'native' &&
    (element.status === 'edited' || element.status === 'deleted') &&
    Boolean(element.originalBounds);

  if (element.origin === 'native' && element.status === 'unmodified' && !isPdfEditorActive) {
    return null;
  }

  if (element.status === 'deleted') {
    if (!showNativeMaskPatch || !element.originalBounds) return null;
    const ob = element.originalBounds;
    return (
      <div
        aria-hidden="true"
        className="absolute bg-white pointer-events-none z-[11]"
        style={{
          left: `${ob.nx * safeStageW - 2}px`,
          top: `${ob.ny * safeStageH - 2}px`,
          width: `${ob.nw * safeStageW + 4}px`,
          height: `${ob.nh * safeStageH + 4}px`,
        }}
      />
    );
  }

  const isNativeOverlayUnmodified = element.origin === 'native' && element.status === 'unmodified';
  const showSelectionChrome = !hideChrome && !isReadOnly && isPdfEditorActive && isSelected;

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
          className="absolute bg-white pointer-events-none z-[11]"
          style={{
            left: `${element.originalBounds.nx * safeStageW - 2}px`,
            top: `${element.originalBounds.ny * safeStageH - 2}px`,
            width: `${element.originalBounds.nw * safeStageW + 4}px`,
            height: `${element.originalBounds.nh * safeStageH + 4}px`,
          }}
        />
      )}

      <div
        data-pdf-image-id={element.id}
        onMouseEnter={() => isPdfEditorActive && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`pdf-image-element absolute select-none ${
          showSelectionChrome ? 'z-50' : isPdfEditorActive ? 'z-[43]' : 'z-[14]'
        } ${!isPdfEditorActive || isReadOnly ? 'pointer-events-none' : 'cursor-pointer'}`}
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

            if (!isSelected) {
              onSelect();
              return;
            }
            if (!isCropping && e.button === 0) {
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
            if (!isSelected) onSelect();
          }}
          title={
            isPdfEditorActive
              ? 'Click to select · Move, Resize, Crop, Rotate, or Delete PDF Image'
              : undefined
          }
        >
          {/* Image Canvas Content (hidden for unmodified native PDF images since raster PDF tile shows underneath) */}
          {!isNativeOverlayUnmodified && (
            <div className="relative w-full h-full overflow-hidden">
              <img
                src={element.dataUrl}
                alt="PDF Element"
                draggable={false}
                className="absolute max-w-none pointer-events-none select-none"
                style={{
                  width: `${(1 / visFracW) * 100}%`,
                  height: `${(1 / visFracH) * 100}%`,
                  left: `${(-crop.left / visFracW) * 100}%`,
                  top: `${(-crop.top / visFracH) * 100}%`,
                }}
              />
            </div>
          )}

          {/* Hover / Active Frame */}
          {(showSelectionChrome ||
            (isPdfEditorActive && !hideChrome && (isHovered || element.origin === 'native'))) && (
            <div
              aria-hidden="true"
              className={`absolute inset-0 pointer-events-none transition-colors ${
                isCropping
                  ? 'border-2 border-amber-500 ring-2 ring-amber-400/35'
                  : showSelectionChrome
                  ? 'border-2 border-indigo-600 shadow-sm'
                  : isHovered
                  ? 'border border-indigo-500 bg-indigo-500/10'
                  : 'border border-dashed border-indigo-400/40'
              }`}
            />
          )}

          {/* Resize Corner Handles (Normal Mode) */}
          {showSelectionChrome && !isCropping && (
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
                  title="Resize PDF image"
                  className={`absolute ${c.pos} w-6 h-6 flex items-center justify-center ${c.cur} hover:scale-125 transition-transform z-50 pointer-events-auto touch-none`}
                >
                  <div className={`w-3.5 h-3.5 ${c.border} border-indigo-600 bg-white dark:bg-slate-900 shadow-sm`} />
                </div>
              ))}
            </>
          )}

          {/* Crop Edge & Corner Handles (Crop Mode) */}
          {showSelectionChrome && isCropping && (
            <>
              {(
                [
                  { id: 'tl', l: true, r: false, t: true, b: false, cls: '-top-2.5 -left-2.5 cursor-nwse-resize', bar: 'w-4 h-4 border-t-4 border-l-4 border-amber-500 rounded-tl-xs' },
                  { id: 'tr', l: false, r: true, t: true, b: false, cls: '-top-2.5 -right-2.5 cursor-nesw-resize', bar: 'w-4 h-4 border-t-4 border-r-4 border-amber-500 rounded-tr-xs' },
                  { id: 'bl', l: true, r: false, t: false, b: true, cls: '-bottom-2.5 -left-2.5 cursor-nesw-resize', bar: 'w-4 h-4 border-b-4 border-l-4 border-amber-500 rounded-bl-xs' },
                  { id: 'br', l: false, r: true, t: false, b: true, cls: '-bottom-2.5 -right-2.5 cursor-nwse-resize', bar: 'w-4 h-4 border-b-4 border-r-4 border-amber-500 rounded-br-xs' },
                  { id: 't', l: false, r: false, t: true, b: false, cls: '-top-2 left-1/2 -translate-x-1/2 cursor-ns-resize', bar: 'w-7 h-2 bg-amber-500 rounded-full shadow' },
                  { id: 'b', l: false, r: false, t: false, b: true, cls: '-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize', bar: 'w-7 h-2 bg-amber-500 rounded-full shadow' },
                  { id: 'l', l: true, r: false, t: false, b: false, cls: 'top-1/2 -left-2 -translate-y-1/2 cursor-ew-resize', bar: 'w-2 h-7 bg-amber-500 rounded-full shadow' },
                  { id: 'r', l: false, r: true, t: false, b: false, cls: 'top-1/2 -right-2 -translate-y-1/2 cursor-ew-resize', bar: 'w-2 h-7 bg-amber-500 rounded-full shadow' },
                ] as const
              ).map((h) => (
                <div
                  key={h.id}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'touch' && !allowFingerControls) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startCropEdgeDrag(h.l, h.r, h.t, h.b, e.clientX, e.clientY);
                  }}
                  title="Drag to crop PDF image"
                  className={`absolute ${h.cls} p-1.5 z-50 pointer-events-auto touch-none flex items-center justify-center`}
                >
                  <div className={h.bar} />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Top Rotation Joystick */}
        {showSelectionChrome && !isCropping && (
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
            accent="indigo"
            placement="top"
            gap={8}
          />
        )}

        {/* Bottom Portaled PDF Image Controls: Move, Crop, Rotate -90/+90, Delete, Done */}
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
                title="Drag to move PDF image"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs cursor-grab active:cursor-grabbing transition-colors touch-none ${
                  isDraggingMove
                    ? 'bg-indigo-700 text-white ring-2 ring-indigo-300'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Move</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCropping((prev) => !prev);
                }}
                title={isCropping ? 'Finish cropping image' : 'Crop PDF image edges'}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border shadow-xs cursor-pointer transition-colors ${
                  isCropping
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isCropping ? <Check className="w-3 h-3" /> : <Crop className="w-3 h-3" />}
                <span>{isCropping ? 'Done Crop' : 'Crop'}</span>
              </button>

              {hasCrop && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetCrop();
                  }}
                  title="Reset image crop"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 shadow-xs cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRotate90(-90);
                }}
                title="Rotate 90° counter-clockwise"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRotate90(90);
                }}
                title="Rotate 90° clockwise"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete PDF image"
                className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCropping(false);
                  onDeselect();
                }}
                title="Deselect PDF image"
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
