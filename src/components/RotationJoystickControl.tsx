import React, { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { AnchoredScreenPopup } from './ViewportPortalPopup';

interface RotationJoystickControlProps {
  rotation: number;
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  allowFingerControls?: boolean;
  onToggleOpen: () => void;
  onCommitHistory?: () => void;
  onRotateDelta: (deltaDeg: number) => void;
  onResetZero: () => void;
  accent?: 'sky' | 'indigo';
  placement?: 'top' | 'bottom';
  gap?: number;
  inlineWithContent?: React.ReactNode;
  onDraggingChange?: (isDragging: boolean) => void;
}

/**
 * Shared upright (0deg) Rotation Control + Spin Joystick popup.
 * Portaled cleanly outside rotated object wrappers and outside PDF POV overflow bounds
 * so the Spin Joystick box itself NEVER spins when rotating text boxes or Magic Grab objects,
 * and never clips against PDF page edges or viewport boundaries.
 */
export const RotationJoystickControl: React.FC<RotationJoystickControlProps> = ({
  rotation,
  anchorRef,
  isOpen,
  allowFingerControls = true,
  onToggleOpen,
  onCommitHistory,
  onRotateDelta,
  onResetZero,
  accent = 'sky',
  placement = 'top',
  gap = 8,
  inlineWithContent,
  onDraggingChange,
}) => {
  const joystickPadRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const [isDraggingJoystick, setIsDraggingJoystick] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState<{ x: number; y: number }>({ x: 0, y: -26 });

  const onRotateDeltaRef = useRef(onRotateDelta);
  onRotateDeltaRef.current = onRotateDelta;
  const onCommitHistoryRef = useRef(onCommitHistory);
  onCommitHistoryRef.current = onCommitHistory;
  const onDraggingChangeRef = useRef(onDraggingChange);
  onDraggingChangeRef.current = onDraggingChange;

  useEffect(() => {
    if (!isDraggingJoystick) {
      const rad = ((rotation - 90) * Math.PI) / 180;
      setJoystickKnob({
        x: Math.cos(rad) * 26,
        y: Math.sin(rad) * 26,
      });
    }
  }, [rotation, isDraggingJoystick]);

  const startJoystickDrag = (startClientX: number, startClientY: number) => {
    if (!joystickPadRef.current) return;
    onCommitHistoryRef.current?.();
    setIsDraggingJoystick(true);
    onDraggingChangeRef.current?.(true);

    const padRect = joystickPadRef.current.getBoundingClientRect();
    const centerClientX = padRect.left + padRect.width / 2;
    const centerClientY = padRect.top + padRect.height / 2;
    const maxKnobRadius = 30;

    let prevAngle: number | null = null;
    const initDx = startClientX - centerClientX;
    const initDy = startClientY - centerClientY;
    if (Math.hypot(initDx, initDy) >= 4) {
      prevAngle = Math.atan2(initDy, initDx);
      const clampedR = Math.min(maxKnobRadius, Math.hypot(initDx, initDy));
      setJoystickKnob({
        x: Math.cos(prevAngle) * clampedR,
        y: Math.sin(prevAngle) * clampedR,
      });
    }

    const onMove = (clientX: number, clientY: number) => {
      const dx = clientX - centerClientX;
      const dy = clientY - centerClientY;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        setJoystickKnob({ x: dx, y: dy });
        return;
      }

      const angle = Math.atan2(dy, dx);
      const clampedR = Math.min(maxKnobRadius, dist);
      setJoystickKnob({
        x: Math.cos(angle) * clampedR,
        y: Math.sin(angle) * clampedR,
      });

      if (prevAngle === null) {
        prevAngle = angle;
        return;
      }

      let deltaRad = angle - prevAngle;
      while (deltaRad > Math.PI) deltaRad -= 2 * Math.PI;
      while (deltaRad < -Math.PI) deltaRad += 2 * Math.PI;
      prevAngle = angle;

      const deltaDeg = (deltaRad * 180) / Math.PI;
      if (Math.abs(deltaDeg) > 0.0001) {
        onRotateDeltaRef.current(deltaDeg);
      }
    };

    const handlePointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      onMove(ev.clientX, ev.clientY);
    };
    const handleEnd = () => {
      setIsDraggingJoystick(false);
      onDraggingChangeRef.current?.(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  };

  const isIndigo = accent === 'indigo';
  const borderClass = isIndigo
    ? 'border-indigo-300 dark:border-indigo-700'
    : 'border-sky-300 dark:border-sky-700';
  const padBorderClass = isIndigo
    ? 'border-indigo-400 dark:border-indigo-600'
    : 'border-sky-400 dark:border-sky-600';
  const vectorStroke = isIndigo ? '#4F46E5' : '#0284C7';

  return (
    <AnchoredScreenPopup
      anchorRef={anchorRef}
      placement={placement}
      align="center"
      gap={gap}
      zIndexClass="z-[10010]"
      respectHeader={true}
      freezePosition={isDraggingJoystick}
    >
      <div className="flex flex-col items-center select-none">
        {isOpen && (
          <div
            className={`mb-2 flex flex-col items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2.5 rounded-2xl shadow-2xl border ${borderClass} select-none`}
          >
            <div className="flex items-center justify-between w-full mb-1.5 px-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 gap-2">
              <span>Spin Joystick</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommitHistoryRef.current?.();
                  onResetZero();
                }}
                className={`px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 ${
                  isIndigo
                    ? 'hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300'
                    : 'hover:bg-sky-100 text-sky-700 dark:text-sky-300'
                }`}
                title="Reset rotation to 0°"
              >
                0°
              </button>
            </div>

            <div
              ref={joystickPadRef}
              onPointerDown={(e) => {
                if (e.pointerType === 'touch' && !allowFingerControls) return;
                e.preventDefault();
                e.stopPropagation();
                startJoystickDrag(e.clientX, e.clientY);
              }}
              className={`relative w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 border-2 ${padBorderClass} shadow-inner cursor-grab active:cursor-grabbing flex items-center justify-center touch-none`}
              title="Drag around the joystick to spin smoothly"
            >
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-slate-400/70 rounded" />
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-slate-400/70 rounded" />
              <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-0.5 bg-slate-400/70 rounded" />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-0.5 bg-slate-400/70 rounded" />

              <svg viewBox="-40 -40 80 80" className="absolute inset-0 w-full h-full pointer-events-none">
                <line
                  x1={0}
                  y1={0}
                  x2={joystickKnob.x}
                  y2={joystickKnob.y}
                  stroke={vectorStroke}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <circle cx={0} cy={0} r={3.5} fill="#64748B" />
              </svg>

              <div
                style={{
                  transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)`,
                }}
                className={`w-6 h-6 rounded-full shadow-md border-2 border-white flex items-center justify-center pointer-events-none transition-colors ${
                  isDraggingJoystick
                    ? isIndigo
                      ? 'bg-indigo-600 scale-110'
                      : 'bg-blue-600 scale-110'
                    : isIndigo
                    ? 'bg-indigo-500'
                    : 'bg-sky-500'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-white/90" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {inlineWithContent}
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
              onToggleOpen();
            }}
            title="Click to open Rotation Joystick"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md border transition-all cursor-pointer whitespace-nowrap touch-none ${
              isOpen
                ? isIndigo
                  ? 'bg-indigo-600 text-white border-indigo-700 ring-2 ring-indigo-300'
                  : 'bg-sky-600 text-white border-sky-700 ring-2 ring-sky-300'
                : isIndigo
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-slate-800'
                : 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700 hover:bg-sky-50 dark:hover:bg-slate-800'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">{Math.round(rotation || 0)}°</span>
          </button>
        </div>
      </div>
    </AnchoredScreenPopup>
  );
};
