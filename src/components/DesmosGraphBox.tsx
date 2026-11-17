import React, { useEffect, useRef, useState } from 'react';
import {
  Sliders,
  Trash2,
  Move,
  Keyboard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DesmosBox } from '../types';
import { AnchoredScreenPopup } from './ViewportPortalPopup';
import {
  DESMOS_HEADER_HEIGHT,
  DesmosCalcInstance,
  getDesmosLogicalSize,
  registerLiveDesmos,
} from '../utils/widgetSnapshotCache';

interface DesmosGraphBoxProps {
  box: DesmosBox;
  isActive: boolean;
  isMagicGrabActive: boolean;
  zoomScale?: number;
  allowFingerControls?: boolean;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<DesmosBox>) => void;
  onDelete: () => void;
}

const HEADER_HEIGHT = DESMOS_HEADER_HEIGHT;
const MIN_DISPLAY_W = 32;
const MAX_DISPLAY_W = 1600;

// Global declaration for official Desmos Graphing Calculator API
declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (
        element: HTMLElement,
        options?: Record<string, unknown>
      ) => {
        setExpression: (expr: { id: string; latex: string; color?: string; hidden?: boolean }) => void;
        removeExpression: (expr: { id: string }) => void;
        getExpressions?: () => Array<{ id: string; latex?: string; color?: string; hidden?: boolean }>;
        getState: () => unknown;
        setState: (state: unknown) => void;
        destroy: () => void;
        updateSettings: (settings: Record<string, unknown>) => void;
        setBlank: () => void;
        isKeypadOpen?: boolean;
        setKeypadOpen?: (open: boolean) => void;
        observe?: (event: string, callback: () => void) => void;
        observeEvent?: (event: string, callback: () => void) => void;
        resize?: () => void;
        updateDimensions?: () => void;
        focusFirstExpression?: () => void;
        openKeypad?: () => void;
        asyncScreenshot?: DesmosCalcInstance['asyncScreenshot'];
        screenshot?: DesmosCalcInstance['screenshot'];
      };
    };
  }
}

export const DesmosGraphBox: React.FC<DesmosGraphBoxProps> = ({
  box,
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
  const logicalStageRef = useRef<HTMLDivElement>(null);
  const prefsBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const calcContainerRef = useRef<HTMLDivElement>(null);
  const calcInstanceRef = useRef<ReturnType<NonNullable<Window['Desmos']>['GraphingCalculator']> | null>(null);

  const boxRef = useRef(box);
  boxRef.current = box;
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;
  const lastAppliedStateStrRef = useRef<string>('');
  const lastFormulaOpenRef = useRef<boolean | null>(null);

  const [showPreferences, setShowPreferences] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRepositioningActive, setIsRepositioningActive] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0 });
  const [desmosLoaded, setDesmosLoaded] = useState(
    () => typeof window !== 'undefined' && Boolean(window.Desmos?.GraphingCalculator)
  );
  const [showEmbedFallback, setShowEmbedFallback] = useState(false);
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);

  // Freeze logical internal Desmos dimensions so resizing the box with L-grabs ONLY scales CSS
  // and NEVER triggers Desmos's container ResizeObserver or alters graph bounds.
  const { baseWidth, baseHeight } = getDesmosLogicalSize(box);
  const lockedAspect = baseWidth / baseHeight;
  const visualScale = box.width / baseWidth;

  // Toggle Keypad deterministically via Desmos controller API + fallback DOM events/blur
  const toggleKeypad = () => {
    const el = calcContainerRef.current;
    const calc = calcInstanceRef.current;
    if (!el || !calc) return;

    const controllerCalc = calc as unknown as {
      withControllerInAPIMode?: (fn: () => void) => void;
      controller?: {
        dispatch: (action: Record<string, unknown>) => void;
        isKeypadOpen?: () => boolean;
        getFocusLocation?: () => unknown;
      };
    };

    const keysEl = el.querySelector<HTMLElement>('.dcg-keys-container');
    const isDomOpen = keysEl?.getAttribute('aria-hidden') === 'false';
    const isCtrlOpen = controllerCalc.controller?.isKeypadOpen?.();
    const isCurrentlyOpen = typeof isCtrlOpen === 'boolean' ? isCtrlOpen : isDomOpen;

    if (isCurrentlyOpen) {
      // 1. Primary: Dispatch Desmos's exact internal minimize action (matches .dcg-minimize-keypad onTap)
      try {
        if (controllerCalc.withControllerInAPIMode && controllerCalc.controller) {
          controllerCalc.withControllerInAPIMode(() => {
            controllerCalc.controller!.dispatch({
              type: 'keypad/set-minimized',
              minimized: true,
            });
          });
        }
      } catch {}

      // 2. Fallback: Also click minimize button & blur active MathQuill if still visible
      setTimeout(() => {
        const stillOpenCtrl = controllerCalc.controller?.isKeypadOpen?.();
        const stillOpenDom =
          el.querySelector('.dcg-keys-container')?.getAttribute('aria-hidden') === 'false';
        if (stillOpenCtrl || stillOpenDom) {
          const minBtn = el.querySelector<HTMLElement>('.dcg-minimize-keypad');
          if (minBtn) {
            const rect = minBtn.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            minBtn.dispatchEvent(
              new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                buttons: 1,
                clientX: cx,
                clientY: cy,
              })
            );
            minBtn.dispatchEvent(
              new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                buttons: 0,
                clientX: cx,
                clientY: cy,
              })
            );
          }

          try {
            if (controllerCalc.withControllerInAPIMode && controllerCalc.controller) {
              const focusLoc = controllerCalc.controller.getFocusLocation?.();
              if (focusLoc) {
                controllerCalc.withControllerInAPIMode(() => {
                  controllerCalc.controller!.dispatch({
                    type: 'blur-focus-location',
                    location: focusLoc,
                  });
                });
              }
            }
          } catch {}

          const activeEl = document.activeElement as HTMLElement | null;
          if (activeEl && el.contains(activeEl)) {
            activeEl.blur();
          } else {
            el.querySelector<HTMLElement>('.dcg-mq-textarea textarea')?.blur();
          }
        }
        const finalOpen =
          el.querySelector('.dcg-keys-container')?.getAttribute('aria-hidden') === 'false';
        setIsKeypadOpen(finalOpen);
      }, 25);

      setIsKeypadOpen(false);
    } else {
      try {
        calc.openKeypad?.();
        calc.focusFirstExpression?.();
      } catch {}
      setIsKeypadOpen(true);
    }
  };

  // Register live Desmos instance & DOM handles with export snapshot registry
  useEffect(() => {
    return registerLiveDesmos(box.id, {
      getContainer: () => containerRef.current,
      getStage: () => logicalStageRef.current,
      getPopover: () => popoverRef.current,
      getCalc: () => calcInstanceRef.current as unknown as DesmosCalcInstance | null,
      getBox: () => boxRef.current,
      getZoomScale: () => zoomScaleRef.current || 1,
    });
  }, [box.id]);

  // Initialize REAL Desmos Graphing Calculator ONCE with autosize: false
  // IMPORTANT: Do NOT stopPropagation on mousedown/touchstart/pointerdown inside calcContainerRef,
  // because Desmos attaches document-level listeners (`mousedown` -> `preventDefault()` for .dcg-do-not-blur
  // and `dcg-tap` synthesis). Blocking events before `document` blurs MathQuill and closes keypad on every key click.
  useEffect(() => {
    let checkInterval: NodeJS.Timeout | null = null;
    let observer: MutationObserver | null = null;
    let syncTimer: number | null = null;

    const initCalculator = () => {
      const calcEl = calcContainerRef.current;
      if (!calcEl) return false;
      if (typeof window === 'undefined' || !window.Desmos) return false;
      if (calcInstanceRef.current) return true;

      try {
        // Temporarily override getBoundingClientRect ONLY during synchronous constructor so Desmos's internal
        // DomChangeDetector measures exact logical unscaled pixels (bodyW x bodyH) instead of canvas/box scale
        const bodyW = Math.round(baseWidth);
        const bodyH = Math.max(200, Math.round(baseHeight - HEADER_HEIGHT));
        const origGetBCR = calcEl.getBoundingClientRect.bind(calcEl);
        calcEl.getBoundingClientRect = () =>
          ({
            width: bodyW,
            height: bodyH,
            top: 0,
            left: 0,
            right: bodyW,
            bottom: bodyH,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect);

        const calculator = window.Desmos.GraphingCalculator(calcEl, {
          autosize: false,
          keypad: !isReadOnlyRef.current,
          expressions: true,
          settingsMenu: !isReadOnlyRef.current,
          zoomButtons: !isReadOnlyRef.current,
          border: false,
          lockViewport: isReadOnlyRef.current,
          pointsOfInterest: true,
          trace: true,
          fontSize: 13,
        });

        // Restore native bounding box immediately so all clicks/taps/drag coordinates map accurately
        calcEl.getBoundingClientRect = origGetBCR;

        // Restore full saved Desmos state if available, otherwise seed initial expressions
        const initialBox = boxRef.current;
        if (initialBox.desmosState) {
          try {
            lastAppliedStateStrRef.current = JSON.stringify(initialBox.desmosState);
            calculator.setState(initialBox.desmosState);
          } catch {
            initialBox.expressions?.forEach((expr) => {
              calculator.setExpression({
                id: expr.id,
                latex: expr.latex,
                color: expr.color || '#2563eb',
                hidden: expr.hidden || false,
              });
            });
          }
        } else if (initialBox.expressions && initialBox.expressions.length > 0) {
          lastAppliedStateStrRef.current = JSON.stringify(initialBox.expressions);
          initialBox.expressions.forEach((expr) => {
            calculator.setExpression({
              id: expr.id,
              latex: expr.latex,
              color: expr.color || '#2563eb',
              hidden: expr.hidden || false,
            });
          });
        } else {
          calculator.setExpression({
            id: 'default-1',
            latex: 'y = -0.5x^2 + 4',
            color: '#2563eb',
          });
        }

        if (isReadOnlyRef.current) {
          try {
            calculator.updateSettings({ expressionsCollapsed: !initialBox.isFormulaOpen });
          } catch {}
        }

        calcInstanceRef.current = calculator;
        setDesmosLoaded(true);

        // Observe Desmos state edits (equations, zoom bounds, expression list open/closed)
        if (!isReadOnlyRef.current && typeof calculator.observeEvent === 'function') {
          calculator.observeEvent('change', () => {
            if (syncTimer) window.clearTimeout(syncTimer);
            syncTimer = window.setTimeout(() => {
              const inst = calcInstanceRef.current;
              if (!inst) return;
              try {
                const st = inst.getState();
                const stStr = JSON.stringify(st);
                if (stStr === lastAppliedStateStrRef.current) return;
                lastAppliedStateStrRef.current = stStr;
                const exprs =
                  inst.getExpressions?.()?.map((e) => ({
                    id: String(e.id),
                    latex: String(e.latex || ''),
                    color: e.color,
                    hidden: e.hidden,
                  })) || boxRef.current.expressions;
                const panelEl = calcContainerRef.current?.querySelector('.dcg-exppanel-outer');
                const exprPanelOpen = panelEl
                  ? getComputedStyle(panelEl).display !== 'none'
                  : false;
                lastFormulaOpenRef.current = exprPanelOpen;
                onUpdateRef.current({
                  desmosState: st,
                  expressions: exprs,
                  isFormulaOpen: exprPanelOpen,
                });
              } catch {}
            }, 80);
          });
        }

        // Keep React header button icon & formula panel visibility synced with Desmos DOM
        const syncKeypadState = () => {
          if (!calcContainerRef.current) return;
          const keysEl = calcContainerRef.current.querySelector('.dcg-keys-container');
          const open = keysEl ? keysEl.getAttribute('aria-hidden') === 'false' : false;
          setIsKeypadOpen((prev) => (prev === open ? prev : open));

          if (!isReadOnlyRef.current) {
            const panelEl = calcContainerRef.current.querySelector('.dcg-exppanel-outer');
            if (panelEl) {
              const panelOpen = getComputedStyle(panelEl).display !== 'none';
              if (lastFormulaOpenRef.current === null) {
                lastFormulaOpenRef.current = panelOpen;
                if (panelOpen !== boxRef.current.isFormulaOpen) {
                  onUpdateRef.current({ isFormulaOpen: panelOpen });
                }
              } else if (lastFormulaOpenRef.current !== panelOpen) {
                lastFormulaOpenRef.current = panelOpen;
                onUpdateRef.current({ isFormulaOpen: panelOpen });
              }
            }
          }
        };

        observer = new MutationObserver(syncKeypadState);
        observer.observe(calcEl, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-hidden', 'class', 'style'],
        });
        syncKeypadState();

        return true;
      } catch (err) {
        console.warn('Could not initialize Desmos Graphing Calculator API:', err);
        return false;
      }
    };

    let fallbackTimer: number | null = null;
    if (!initCalculator()) {
      checkInterval = setInterval(() => {
        if (initCalculator()) {
          if (checkInterval) clearInterval(checkInterval);
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        }
      }, 200);
      fallbackTimer = window.setTimeout(() => {
        if (!calcInstanceRef.current) {
          setShowEmbedFallback(true);
        }
      }, 2500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (syncTimer) window.clearTimeout(syncTimer);
      if (observer) observer.disconnect();
      if (calcInstanceRef.current) {
        if (!isReadOnlyRef.current) {
          try {
            const inst = calcInstanceRef.current;
            const finalState = inst.getState();
            const finalStr = JSON.stringify(finalState);
            const panelEl = calcContainerRef.current?.querySelector('.dcg-exppanel-outer');
            const finalFormulaOpen = panelEl
              ? getComputedStyle(panelEl).display !== 'none'
              : boxRef.current.isFormulaOpen;
            if (
              finalStr !== lastAppliedStateStrRef.current ||
              finalFormulaOpen !== boxRef.current.isFormulaOpen
            ) {
              const exprs =
                inst.getExpressions?.()?.map((e) => ({
                  id: String(e.id),
                  latex: String(e.latex || ''),
                  color: e.color,
                  hidden: e.hidden,
                })) || boxRef.current.expressions;
              onUpdateRef.current({
                desmosState: finalState,
                expressions: exprs,
                isFormulaOpen: finalFormulaOpen,
              });
            }
          } catch {}
        }
        try {
          calcInstanceRef.current.destroy();
        } catch {}
        calcInstanceRef.current = null;
      }
    };
  }, []);

  // Sync external Desmos state, expressions, and expression-panel toggle into read-only Audience View instances
  useEffect(() => {
    if (!isReadOnly || !calcInstanceRef.current) return;
    const calc = calcInstanceRef.current;
    if (box.desmosState) {
      try {
        const nextStr = JSON.stringify(box.desmosState);
        if (nextStr !== lastAppliedStateStrRef.current) {
          lastAppliedStateStrRef.current = nextStr;
          calc.setState(box.desmosState);
        }
      } catch {}
    } else if (box.expressions && box.expressions.length > 0) {
      try {
        const exprStr = JSON.stringify(box.expressions);
        if (exprStr !== lastAppliedStateStrRef.current) {
          lastAppliedStateStrRef.current = exprStr;
          box.expressions.forEach((expr) => {
            calc.setExpression({
              id: expr.id,
              latex: expr.latex,
              color: expr.color || '#2563eb',
              hidden: expr.hidden || false,
            });
          });
        }
      } catch {}
    }
    try {
      calc.updateSettings({ expressionsCollapsed: !box.isFormulaOpen });
    } catch {}
  }, [isReadOnly, box.desmosState, box.expressions, box.isFormulaOpen]);

  // Top-Left Move Handle Drag (smooth lag-free rAF)
  const handlePointerDownTopLeft = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    setDragStart({ x: e.clientX, y: e.clientY, boxX: box.x, boxY: box.y });
    setIsRepositioningActive(true);
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    let rafId: number | null = null;
    let latestX = dragStart.x;
    let latestY = dragStart.y;

    const commitMove = () => {
      const scale = zoomScale || 1;
      const dx = (latestX - dragStart.x) / scale;
      const dy = (latestY - dragStart.y) / scale;
      onUpdateRef.current({
        x: Math.max(0, dragStart.boxX + dx),
        y: Math.max(0, dragStart.boxY + dy),
      });
      rafId = null;
    };

    const scheduleMove = (clientX: number, clientY: number) => {
      latestX = clientX;
      latestY = clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(commitMove);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      scheduleMove(e.clientX, e.clientY);
    };
    const handleEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDragging(false);
      setIsRepositioningActive(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [isDragging, dragStart, zoomScale]);

  // Proportional L-Grab Resizing via Top-Right corner (strictly locks drawn aspect ratio, no min 340 block)
  const startResizeTR = (startX: number, startY: number) => {
    const startBoxY = box.y;
    const startWidth = box.width;
    const startHeight = box.height;
    const scale = zoomScale || 1;

    let rafId: number | null = null;
    let latestX = startX;
    let latestY = startY;

    const commitResize = () => {
      const dx = (latestX - startX) / scale;
      const dy = (startY - latestY) / scale;
      const delta = (dx + dy) / 2;
      const newWidth = Math.max(MIN_DISPLAY_W, Math.min(MAX_DISPLAY_W, startWidth + delta));
      const newHeight = newWidth / lockedAspect;
      const newY = startBoxY - (newHeight - startHeight);

      onUpdate({
        y: Math.max(0, newY),
        width: newWidth,
        height: newHeight,
      });
      rafId = null;
    };

    const scheduleResize = (clientX: number, clientY: number) => {
      latestX = clientX;
      latestY = clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(commitResize);
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      scheduleResize(ev.clientX, ev.clientY);
    };
    const onEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  // Proportional L-Grab Resizing via Bottom-Left corner
  const startResizeBL = (startX: number, startY: number) => {
    const startBoxX = box.x;
    const startWidth = box.width;
    const scale = zoomScale || 1;

    let rafId: number | null = null;
    let latestX = startX;
    let latestY = startY;

    const commitResize = () => {
      const dx = (startX - latestX) / scale;
      const dy = (latestY - startY) / scale;
      const delta = (dx + dy) / 2;
      const newWidth = Math.max(MIN_DISPLAY_W, Math.min(MAX_DISPLAY_W, startWidth + delta));
      const newHeight = newWidth / lockedAspect;
      const newX = startBoxX - (newWidth - startWidth);

      onUpdate({
        x: Math.max(0, newX),
        width: newWidth,
        height: newHeight,
      });
      rafId = null;
    };

    const scheduleResize = (clientX: number, clientY: number) => {
      latestX = clientX;
      latestY = clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(commitResize);
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      scheduleResize(ev.clientX, ev.clientY);
    };
    const onEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  return (
    <div
      ref={containerRef}
      data-desmos-box-id={box.id}
      data-active={isActive ? 'true' : 'false'}
      onPointerDownCapture={(e) => {
        lastPointerTypeRef.current = e.pointerType;
      }}
      onClick={() => {
        if (!allowFingerControls && lastPointerTypeRef.current === 'touch') return;
        if (!isActive) {
          onSelect();
        }
      }}
      className={`desmos-box absolute transition-shadow ${
        isActive
          ? 'ring-2 ring-blue-500 shadow-2xl z-40'
          : 'ring-1 ring-slate-300 dark:ring-slate-700 hover:ring-blue-400 shadow-md z-30'
      } ${isRepositioningActive ? 'ring-4 ring-indigo-500 shadow-2xl' : ''} ${
        isReadOnly ? 'pointer-events-none' : ''
      }`}
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        borderRadius: '12px',
        overflow: 'visible',
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      {/* ============================================================== */}
      {/* TOP-RIGHT L-GRAB RESIZE HANDLE (Proportional, Any Small Size)  */}
      {/* ============================================================== */}
      {!hideChrome && (
        <div
          data-export-hide-clean="true"
          onPointerDown={(e) => {
            if (e.pointerType === 'touch' && !allowFingerControls) return;
            e.preventDefault();
            e.stopPropagation();
            if (!isActive) onSelect();
            startResizeTR(e.clientX, e.clientY);
          }}
          title="Drag L-handle to scale Desmos graph box without changing graph bounds"
          style={{ touchAction: 'none' }}
          className="absolute -top-3.5 -right-3.5 w-8 h-8 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 pointer-events-auto touch-none"
        >
          <div className="w-5 h-5 border-t-3 border-r-3 border-blue-500 rounded-tr-md bg-white dark:bg-slate-900 shadow-lg flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* BOTTOM-LEFT L-GRAB RESIZE HANDLE (Proportional, Any Small Size)*/}
      {/* ============================================================== */}
      {!hideChrome && (
        <div
          data-export-hide-clean="true"
          onPointerDown={(e) => {
            if (e.pointerType === 'touch' && !allowFingerControls) return;
            e.preventDefault();
            e.stopPropagation();
            if (!isActive) onSelect();
            startResizeBL(e.clientX, e.clientY);
          }}
          title="Drag L-handle to scale Desmos graph box without changing graph bounds"
          style={{ touchAction: 'none' }}
          className="absolute -bottom-3.5 -left-3.5 w-8 h-8 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 pointer-events-auto touch-none"
        >
          <div className="w-5 h-5 border-b-3 border-l-3 border-blue-500 rounded-bl-md bg-white dark:bg-slate-900 shadow-lg flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FIXED-DIMENSION LOGICAL STAGE SCALED TO FIT OUTER DIMENSIONS   */}
      {/* ============================================================== */}
      <div
        ref={logicalStageRef}
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `scale(${visualScale})`,
          transformOrigin: 'top left',
          backgroundColor: `rgba(255, 255, 255, ${box.opacity ?? 0.98})`,
          backdropFilter: (box.opacity ?? 0.98) < 0.9 ? 'blur(4px)' : 'none',
          borderRadius: '12px',
          overflow: 'visible',
        }}
        className="desmos-logical-stage flex flex-col shadow-inner"
      >
        {/* Top Header Bar (Fixed 38px logical height) */}
        <div
          style={{ height: `${HEADER_HEIGHT}px` }}
          className={`flex items-center justify-between px-3 border-b shrink-0 transition-colors ${
            isActive
              ? 'bg-blue-50/95 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800'
              : 'bg-slate-50/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700'
          } rounded-t-xl`}
        >
          <div className="flex items-center gap-2">
            {/* Top-Left Move Handle */}
            {!hideChrome && (
              <div
                data-export-hide-clean="true"
                onPointerDown={handlePointerDownTopLeft}
                style={{ touchAction: 'none' }}
                title="Drag to reposition Desmos graph"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-grab active:cursor-grabbing select-none shadow-xs touch-none ${
                  isRepositioningActive
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-md'
                    : 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-200'
                }`}
              >
                <Move className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="text-[10px] tracking-wider uppercase">
                  {isRepositioningActive ? 'Moving...' : 'Move'}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
              <span className="text-blue-600">Desmos</span>
              <span className="hidden sm:inline">Graphing</span>
              {!hideChrome && (
                <span
                  data-export-hide-clean="true"
                  className="text-[10px] text-slate-400 font-mono font-normal"
                >
                  {Math.round(box.width)}×{Math.round(box.height)}
                </span>
              )}
            </div>
          </div>

          {!hideChrome && (
            <div data-export-hide-clean="true" className="flex items-center gap-1.5">
              {/* Keypad & Functions Toggle */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                title={
                  isKeypadOpen
                    ? 'Close keyboard & functions (sin, cos, tan)'
                    : 'Open keyboard & functions (sin, cos, tan, calculus)'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  toggleKeypad();
                }}
                className={`dcg-do-not-blur flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold select-none shadow-xs ${
                  isKeypadOpen
                    ? 'bg-blue-600 text-white ring-1 ring-blue-400 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-medium">Keys & f(x)</span>
                {isKeypadOpen ? (
                  <ChevronUp className="w-3 h-3 opacity-80" />
                ) : (
                  <ChevronDown className="w-3 h-3 opacity-80" />
                )}
              </button>

              {/* Preferences Button */}
              <button
                ref={prefsBtnRef}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                title="Graph Preferences & Opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPreferences(!showPreferences);
                }}
                className={`p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${
                  showPreferences ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50' : ''
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              {/* Delete Graph Box */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                title="Delete Graph Box"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 rounded text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Main Real Desmos Calculator Surface (Fixed Logical Dimensions) */}
        <div
          className="relative w-full rounded-b-xl"
          style={{
            height: `${baseHeight - HEADER_HEIGHT}px`,
            overflow: 'visible',
            opacity: box.opacity ?? 0.98,
          }}
        >
          <div
            ref={calcContainerRef}
            className="w-full h-full rounded-b-xl overflow-visible desmos-calc-container"
          />

          {!desmosLoaded && showEmbedFallback && (
            <iframe
              src="https://www.desmos.com/calculator?embed"
              title="Desmos Graphing Calculator"
              allow="fullscreen"
              allowFullScreen
              className="w-full h-full border-0 rounded-b-xl"
            />
          )}
        </div>
      </div>

      {/* PREFERENCES POPOVER (Portaled cleanly so never clipped by PDF POV or screen edges) */}
      {showPreferences && !hideChrome && (
        <AnchoredScreenPopup
          anchorRef={prefsBtnRef}
          placement="bottom"
          align="end"
          gap={6}
          zIndexClass="z-[10020]"
          respectHeader={true}
        >
          <div
            ref={popoverRef}
            data-export-hide-clean="true"
            onClick={(e) => e.stopPropagation()}
            className="dcg-do-not-blur w-60 max-w-[calc(100vw-24px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Graph Preferences
              </span>
              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Transparency</span>
                <span className="font-mono text-[11px]">
                  {Math.round((1 - (box.opacity ?? 0.98)) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={box.opacity ?? 0.98}
                onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">
                Allows document lines & worksheet problems to show beneath graph
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
              💡 Resizing with the blue corner L-grabs scales cleanly without shifting your graph viewport.
            </div>
          </div>
        </AnchoredScreenPopup>
      )}
    </div>
  );
};
