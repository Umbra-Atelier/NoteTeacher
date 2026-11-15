import React, { useCallback, useEffect, useRef, useState } from 'react';

interface DocumentScrollBarProps {
  isVisible: boolean;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  currentPageNumber: number;
  totalPages: number;
  onDismiss: () => void;
}

export const DocumentScrollBar: React.FC<DocumentScrollBarProps> = ({
  isVisible,
  scrollContainerRef,
  currentPageNumber,
  totalPages,
  onDismiss,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    grabOffsetY: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [thumbMetrics, setThumbMetrics] = useState<{
    top: number;
    height: number;
    trackHeight: number;
    canScroll: boolean;
  }>({
    top: 0,
    height: 56,
    trackHeight: 400,
    canScroll: false,
  });

  const recomputeThumb = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const trackEl = trackRef.current;
    if (!scrollEl || !trackEl) return;

    const trackHeight = trackEl.clientHeight;
    const scrollHeight = scrollEl.scrollHeight;
    const clientHeight = scrollEl.clientHeight;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);

    if (trackHeight <= 0) return;

    const minThumb = Math.min(56, Math.max(36, trackHeight * 0.2));
    const proportional =
      scrollHeight > 0 ? (clientHeight / scrollHeight) * trackHeight : trackHeight;
    const thumbHeight = Math.max(
      minThumb,
      Math.min(trackHeight, maxScroll <= 2 ? Math.min(84, trackHeight * 0.35) : proportional)
    );
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollEl.scrollTop / maxScroll)) : 0;

    setThumbMetrics({
      top: ratio * maxThumbTop,
      height: thumbHeight,
      trackHeight,
      canScroll: maxScroll > 2 || totalPages > 1,
    });
  }, [scrollContainerRef, totalPages]);

  // Keep thumb synced with container scroll & resize while visible (rAF-throttled)
  useEffect(() => {
    if (!isVisible) return;
    recomputeThumb();

    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (dragStateRef.current?.active || rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputeThumb();
      });
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', recomputeThumb);
    const ro = new ResizeObserver(recomputeThumb);
    ro.observe(scrollEl);
    if (trackRef.current) ro.observe(trackRef.current);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      scrollEl.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', recomputeThumb);
      ro.disconnect();
    };
  }, [isVisible, scrollContainerRef, recomputeThumb, totalPages]);

  // Disappear after a click somewhere else on the screen
  useEffect(() => {
    if (!isVisible) return;

    const handleWindowPointerDown = (e: PointerEvent) => {
      if (dragStateRef.current?.active) return;
      const el = containerRef.current;
      if (el && el.contains(e.target as Node)) {
        return;
      }
      onDismiss();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown, true);
    };
  }, [isVisible, onDismiss]);

  const scrollToThumbTop = useCallback(
    (desiredThumbTop: number) => {
      const scrollEl = scrollContainerRef.current;
      const trackEl = trackRef.current;
      if (!scrollEl || !trackEl) return;

      const trackHeight = trackEl.clientHeight;
      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      const maxThumbTop = Math.max(1, trackHeight - thumbMetrics.height);
      const clampedThumbTop = Math.max(0, Math.min(maxThumbTop, desiredThumbTop));
      const ratio = clampedThumbTop / maxThumbTop;

      scrollEl.scrollTop = ratio * maxScroll;
      setThumbMetrics((prev) => ({
        ...prev,
        top: clampedThumbTop,
      }));
    },
    [scrollContainerRef, thumbMetrics.height]
  );

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const trackEl = trackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const pointerOffsetInTrack = e.clientY - rect.top;

    // Determine if pointer pressed inside the thumb or elsewhere on track
    const isInsideThumb =
      pointerOffsetInTrack >= thumbMetrics.top &&
      pointerOffsetInTrack <= thumbMetrics.top + thumbMetrics.height;

    const grabOffsetY = isInsideThumb
      ? pointerOffsetInTrack - thumbMetrics.top
      : thumbMetrics.height / 2;

    if (!isInsideThumb) {
      scrollToThumbTop(pointerOffsetInTrack - grabOffsetY);
    }

    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      grabOffsetY,
    };
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.active || drag.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    const trackEl = trackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const pointerOffsetInTrack = e.clientY - rect.top;
    scrollToThumbTop(pointerOffsetInTrack - drag.grabOffsetY);
  };

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    dragStateRef.current = null;
    setIsDragging(false);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  if (!isVisible) return null;

  const safePageNum = Math.min(Math.max(1, currentPageNumber), Math.max(1, totalPages));
  const thumbCenterY = thumbMetrics.top + thumbMetrics.height / 2;

  return (
    <div
      ref={containerRef}
      data-testid="right-edge-scrollbar"
      className="dcg-do-not-blur absolute right-2 top-3 bottom-3 z-40 w-8 flex justify-center select-none touch-none animate-in fade-in duration-150"
    >
      {/* Interactive Track + Draggable Thumb */}
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerCancel={handleTrackPointerUp}
        className="relative w-full h-full flex justify-center cursor-pointer touch-none"
        role="scrollbar"
        aria-orientation="vertical"
        aria-valuenow={safePageNum}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, totalPages)}
        aria-label="Document quick scroll bar"
      >
        {/* Rail */}
        <div
          className={`w-2 h-full rounded-full transition-colors ${
            isDragging
              ? 'bg-slate-900/20 dark:bg-white/25'
              : 'bg-slate-900/12 dark:bg-white/15 hover:bg-slate-900/20 dark:hover:bg-white/25'
          }`}
        />

        {/* Draggable Thumb */}
        <div
          style={{
            top: `${thumbMetrics.top}px`,
            height: `${thumbMetrics.height}px`,
          }}
          className={`absolute w-3 rounded-full shadow-md transition-[width,background-color] duration-100 ${
            isDragging
              ? 'w-3.5 bg-blue-600 dark:bg-blue-400 ring-2 ring-blue-500/30 cursor-grabbing'
              : 'bg-slate-700/85 dark:bg-slate-200/90 hover:w-3.5 hover:bg-blue-600 dark:hover:bg-blue-400 cursor-grab'
          }`}
        />

        {/* Floating Page Number Badge beside the thumb to the left */}
        <div
          style={{
            top: `${thumbCenterY}px`,
            transform: 'translateY(-50%)',
          }}
          className="absolute right-full mr-2 pointer-events-none flex items-center"
        >
          <div className="bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xl border border-slate-700/60 dark:border-slate-300/80 whitespace-nowrap tabular-nums">
            Page {safePageNum} of {Math.max(1, totalPages)}
          </div>
          <div className="w-2 h-2 rotate-45 -ml-1 bg-slate-900/95 dark:bg-slate-100/95 border-r border-t border-slate-700/60 dark:border-slate-300/80" />
        </div>
      </div>
    </div>
  );
};
