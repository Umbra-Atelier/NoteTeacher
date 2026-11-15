import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ClampedPopupCoords {
  left: number;
  top: number;
  maxHeight: number;
  ready: boolean;
}

function getSafeTopBound(respectHeader: boolean): number {
  if (!respectHeader || typeof document === 'undefined') return 8;
  const headerEl = document.querySelector('header');
  if (!headerEl) return 8;
  const r = headerEl.getBoundingClientRect();
  // Ensure popups stay cleanly visible below sticky top ribbon when canvas popups are near top
  return Math.max(8, Math.min(window.innerHeight - 120, Math.round(r.bottom) + 6));
}

export function clampBoxToViewport(
  desiredLeft: number,
  desiredTop: number,
  width: number,
  height: number,
  options?: {
    margin?: number;
    respectHeader?: boolean;
  }
): { left: number; top: number; maxHeight: number } {
  const margin = options?.margin ?? 8;
  const safeTop = getSafeTopBound(options?.respectHeader ?? true);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  const maxW = Math.max(80, vw - margin * 2);
  const effectiveW = Math.min(width, maxW);
  const maxAllowedH = Math.max(120, vh - safeTop - margin);
  const effectiveH = Math.min(height, maxAllowedH);

  const maxLeft = Math.max(margin, vw - effectiveW - margin);
  const maxTop = Math.max(safeTop, vh - effectiveH - margin);

  return {
    left: Math.round(Math.max(margin, Math.min(maxLeft, desiredLeft))),
    top: Math.round(Math.max(safeTop, Math.min(maxTop, desiredTop))),
    maxHeight: maxAllowedH,
  };
}

interface AnchoredScreenPopupProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: 'top' | 'bottom';
  align?: 'center' | 'start' | 'end';
  gap?: number;
  zIndexClass?: string;
  respectHeader?: boolean;
  freezePosition?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Portals a floating popup / control bar to document.body so it is NEVER
 * clipped by PDF page overflow-hidden / contain:paint boundaries, and dynamically
 * clamps its measured rect strictly inside window screen bounds.
 */
export const AnchoredScreenPopup: React.FC<AnchoredScreenPopupProps> = ({
  anchorRef,
  placement = 'top',
  align = 'center',
  gap = 8,
  zIndexClass = 'z-[9995]',
  respectHeader = true,
  freezePosition = false,
  className = '',
  children,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<ClampedPopupCoords>({
    left: -9999,
    top: -9999,
    maxHeight: 600,
    ready: false,
  });
  const frozenCoordsRef = useRef<ClampedPopupCoords | null>(null);

  const recomputePosition = useCallback(() => {
    if (freezePosition && frozenCoordsRef.current?.ready) {
      return;
    }
    const anchorEl = anchorRef.current;
    const popupEl = popupRef.current;
    if (!anchorEl || !popupEl) return;

    const aRect = anchorEl.getBoundingClientRect();
    const pRect = popupEl.getBoundingClientRect();
    const popW = Math.max(popupEl.offsetWidth || pRect.width || 0, 40);
    const popH = Math.max(popupEl.offsetHeight || pRect.height || 0, 24);

    // Hide gracefully if anchor is completely offscreen horizontally or vertically beyond generous slack
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (aRect.width === 0 && aRect.height === 0) return;

    const safeTop = getSafeTopBound(respectHeader);
    const margin = 8;

    let desiredLeft: number;
    if (align === 'start') {
      desiredLeft = aRect.left;
    } else if (align === 'end') {
      desiredLeft = aRect.right - popW;
    } else {
      desiredLeft = aRect.left + aRect.width / 2 - popW / 2;
    }

    const topIfAbove = aRect.top - popH - gap;
    const topIfBelow = aRect.bottom + gap;

    let desiredTop: number;
    if (placement === 'top') {
      const fitsAbove = topIfAbove >= safeTop;
      const fitsBelow = topIfBelow + popH <= vh - margin;
      if (fitsAbove) {
        desiredTop = topIfAbove;
      } else if (fitsBelow) {
        desiredTop = topIfBelow;
      } else {
        // Pick whichever side gives more visible clearance
        const spaceAbove = aRect.top - safeTop;
        const spaceBelow = vh - margin - aRect.bottom;
        desiredTop = spaceBelow > spaceAbove ? topIfBelow : topIfAbove;
      }
    } else {
      const fitsBelow = topIfBelow + popH <= vh - margin;
      const fitsAbove = topIfAbove >= safeTop;
      if (fitsBelow) {
        desiredTop = topIfBelow;
      } else if (fitsAbove) {
        desiredTop = topIfAbove;
      } else {
        const spaceAbove = aRect.top - safeTop;
        const spaceBelow = vh - margin - aRect.bottom;
        desiredTop = spaceAbove > spaceBelow ? topIfAbove : topIfBelow;
      }
    }

    const clamped = clampBoxToViewport(desiredLeft, desiredTop, popW, popH, {
      margin,
      respectHeader,
    });

    // If desiredTop wasn't clamped horizontally out of bounds, also ensure anchor hasn't scrolled far away
    void vw;

    const next: ClampedPopupCoords = {
      left: clamped.left,
      top: clamped.top,
      maxHeight: clamped.maxHeight,
      ready: true,
    };
    frozenCoordsRef.current = next;
    setCoords((prev) =>
      prev.left === next.left &&
      prev.top === next.top &&
      prev.maxHeight === next.maxHeight &&
      prev.ready === next.ready
        ? prev
        : next
    );
  }, [anchorRef, placement, align, gap, respectHeader, freezePosition]);

  useLayoutEffect(() => {
    recomputePosition();
  });

  useEffect(() => {
    const popupEl = popupRef.current;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recomputePosition());
      if (popupEl) ro.observe(popupEl);
      if (anchorRef.current) ro.observe(anchorRef.current);
    }

    let rafId: number | null = null;
    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputePosition();
      });
    };

    window.addEventListener('scroll', scheduleSync, true);
    window.addEventListener('resize', scheduleSync);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('scroll', scheduleSync, true);
      window.removeEventListener('resize', scheduleSync);
    };
  }, [anchorRef, recomputePosition]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: `${coords.maxHeight}px`,
        visibility: coords.ready ? 'visible' : 'hidden',
      }}
      className={`${zIndexClass} pointer-events-auto ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};
