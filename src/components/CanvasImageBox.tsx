import React, { useRef, useState, useEffect } from 'react';
import { Move, Trash2 } from 'lucide-react';
import { CanvasImage } from '../types';
import { AnchoredScreenPopup } from './ViewportPortalPopup';

interface CanvasImageBoxProps {
  image: CanvasImage;
  isActive: boolean;
  zoomScale?: number;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<CanvasImage>) => void;
  onDelete: () => void;
}

export const CanvasImageBox: React.FC<CanvasImageBoxProps> = ({
  image,
  isActive,
  zoomScale = 1,
  isReadOnly = false,
  hideChrome = false,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRepositioningActive, setIsRepositioningActive] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, imageX: 0, imageY: 0 });
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Click & Hold for 500ms on Top-Left Compass Handle to activate repositioning
  const startTopLeftHold = (clientX: number, clientY: number) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setDragStart({ x: clientX, y: clientY, imageX: image.x, imageY: image.y });

    holdTimerRef.current = setTimeout(() => {
      setIsRepositioningActive(true);
      setIsDragging(true);
    }, 500);
  };

  const cancelTopLeftHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleMouseDownTopLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTopLeftHold(e.clientX, e.clientY);
    setIsDragging(true);
  };

  const handleTouchStartTopLeft = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      startTopLeftHold(t.clientX, t.clientY);
      setIsDragging(true);
    }
  };

  // Smooth, lag-free Drag Moving synced with zoomScale and display refresh rate
  useEffect(() => {
    if (!isDragging) return;

    let rafId: number | null = null;
    let latestClientX = dragStart.x;
    let latestClientY = dragStart.y;

    const updatePosition = () => {
      const scale = zoomScale || 1;
      const dx = (latestClientX - dragStart.x) / scale;
      const dy = (latestClientY - dragStart.y) / scale;
      onUpdate({
        x: Math.max(0, dragStart.imageX + dx),
        y: Math.max(0, dragStart.imageY + dy),
      });
      rafId = null;
    };

    const handleMove = (clientX: number, clientY: number) => {
      latestClientX = clientX;
      latestClientY = clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      cancelTopLeftHold();
      setIsDragging(false);
      setIsRepositioningActive(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragStart, onUpdate, zoomScale]);

  // Proportional Resizing by holding down the Top-Right L-Grab
  const startResizeTR = (startX: number, startY: number) => {
    const startY0 = image.y;
    const startW = image.width;
    const startH = image.height;
    const aspect = startW / startH;
    const scale = zoomScale || 1;

    const onMove = (clientX: number, clientY: number) => {
      const dx = (clientX - startX) / scale;
      const dy = (startY - clientY) / scale; // upward is expansion
      const delta = (dx + dy) / 2;
      const newW = Math.max(60, Math.min(1200, startW + delta));
      const newH = newW / aspect;
      const newY = startY0 - (newH - startH);

      onUpdate({
        y: Math.max(0, newY),
        width: newW,
        height: newH,
      });
    };

    const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) onMove(ev.touches[0].clientX, ev.touches[0].clientY);
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const handleMouseDownResizeTR = (e: React.MouseEvent) => {
    e.stopPropagation();
    startResizeTR(e.clientX, e.clientY);
  };

  const handleTouchStartResizeTR = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      startResizeTR(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Proportional Resizing by holding down the Bottom-Left L-Grab
  const startResizeBL = (startX: number, startY: number) => {
    const startX0 = image.x;
    const startW = image.width;
    const startH = image.height;
    const aspect = startW / startH;

    const onMove = (clientX: number, clientY: number) => {
      const scale = zoomScale || 1;
      const dx = (startX - clientX) / scale; // leftward is expansion
      const dy = (clientY - startY) / scale; // downward is expansion
      const delta = (dx + dy) / 2;
      const newW = Math.max(60, Math.min(1200, startW + delta));
      const newH = newW / aspect;
      const newX = startX0 - (newW - startW);

      onUpdate({
        x: Math.max(0, newX),
        width: newW,
        height: newH,
      });
    };

    const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) onMove(ev.touches[0].clientX, ev.touches[0].clientY);
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const handleMouseDownResizeBL = (e: React.MouseEvent) => {
    e.stopPropagation();
    startResizeBL(e.clientX, e.clientY);
  };

  const handleTouchStartResizeBL = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      startResizeBL(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`picture-box absolute select-none shadow-xl rounded-xl transition-shadow ${
        isActive
          ? 'ring-2 ring-indigo-500 shadow-2xl z-40'
          : 'ring-1 ring-slate-300 dark:ring-slate-700 hover:ring-indigo-400 z-30'
      } ${isRepositioningActive ? 'ring-4 ring-indigo-400 shadow-2xl' : ''} ${
        isReadOnly ? 'pointer-events-none' : ''
      } bg-white dark:bg-slate-900`}
      style={{
        left: `${image.x}px`,
        top: `${image.y}px`,
        width: `${image.width}px`,
        height: `${image.height}px`,
        transform: image.rotation ? `rotate(${image.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      {!hideChrome && (
        <>
          {/* ============================================================== */}
          {/* TOP-RIGHT L-GRAB RESIZE HANDLE (Proportional, Non-Free-Form)    */}
          {/* ============================================================== */}
          <div
            onMouseDown={handleMouseDownResizeTR}
            onTouchStart={handleTouchStartResizeTR}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag L-handle to resize image snippet (preserves aspect ratio)"
            className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto"
          >
            <div className="w-5 h-5 border-t-3 border-r-3 border-indigo-500 rounded-tr-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-400">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
            </div>
          </div>

          {/* ============================================================== */}
          {/* BOTTOM-LEFT L-GRAB RESIZE HANDLE (Proportional, Non-Free-Form)  */}
          {/* ============================================================== */}
          <div
            onMouseDown={handleMouseDownResizeBL}
            onTouchStart={handleTouchStartResizeBL}
            onPointerDown={(e) => e.stopPropagation()}
            title="Drag L-handle to resize image snippet (preserves aspect ratio)"
            className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto"
          >
            <div className="w-5 h-5 border-b-3 border-l-3 border-indigo-500 rounded-bl-md bg-white dark:bg-slate-900 shadow-md flex items-center justify-center group-hover:border-indigo-400">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
            </div>
          </div>

          {/* ============================================================ */}
          {/* TOP HEADER CONTROLS (Compass Move + Delete)                  */}
          {/* Active bar portals to screen bounds so PDF POV never clips   */}
          {/* ============================================================ */}
          {isActive ? (
            <AnchoredScreenPopup
              anchorRef={containerRef}
              placement="top"
              align="start"
              gap={8}
              zIndexClass="z-[10002]"
              respectHeader={true}
              freezePosition={isDragging}
            >
              <div className="flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg select-none">
                <div
                  onMouseDown={handleMouseDownTopLeft}
                  onTouchStart={handleTouchStartTopLeft}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Click and hold for a moment to move image snippet"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold cursor-grab active:cursor-grabbing transition-all select-none shadow-xs ${
                    isRepositioningActive
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-md'
                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                  }`}
                >
                  <Move className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="text-[10px] tracking-wider uppercase">
                    {isRepositioningActive ? 'Moving...' : 'Move'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  title="Delete Image Snippet"
                  className="p-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950 dark:text-rose-300 transition-colors shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </AnchoredScreenPopup>
          ) : (
            <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity pointer-events-auto select-none">
              <div
                onMouseDown={handleMouseDownTopLeft}
                onTouchStart={handleTouchStartTopLeft}
                onPointerDown={(e) => e.stopPropagation()}
                title="Click and hold for a second to move image snippet"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold cursor-grab active:cursor-grabbing bg-indigo-600/90 text-white shadow-sm"
              >
                <Move className="w-3 h-3 stroke-[2.5]" />
                <span>Move</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete Image Snippet"
                className="p-1 rounded bg-rose-600/90 hover:bg-rose-700 text-white shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Image Content */}
      <div className="w-full h-full overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700/80">
        <img
          src={image.dataUrl}
          alt="PDF Snippet"
          draggable={false}
          className="w-full h-full object-contain pointer-events-none"
        />
      </div>
    </div>
  );
};
