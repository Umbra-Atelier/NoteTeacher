import React, { useEffect, useRef, useState } from 'react';
import { LivePresenterToolState, PresenterMode } from '../types';

interface PresenterOverlayProps {
  mode: PresenterMode;
  onClose: () => void;
  isReadOnly?: boolean;
  externalState?: LivePresenterToolState | null;
  onStateChange?: (state: LivePresenterToolState) => void;
}

interface NormalizedLaserPoint {
  nx: number;
  ny: number;
  time: number;
}

export const PresenterOverlay: React.FC<PresenterOverlayProps> = ({
  mode,
  onClose,
  isReadOnly = false,
  externalState = null,
  onStateChange,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 800, height: 1000 });

  const laserPointsRef = useRef<NormalizedLaserPoint[]>([]);
  const [spotlightNormPos, setSpotlightNormPos] = useState<{ nx: number; ny: number }>({
    nx: 0.5,
    ny: 0.4,
  });

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const externalStateRef = useRef(externalState);
  externalStateRef.current = externalState;

  const spotlightRef = useRef(spotlightNormPos);
  spotlightRef.current = spotlightNormPos;

  const lastEmitTimeRef = useRef<number>(0);

  const emitPresenterState = (
    override?: Partial<LivePresenterToolState>,
    force = false
  ) => {
    if (isReadOnly || !onStateChangeRef.current) return;
    const now = Date.now();
    if (!force && now - lastEmitTimeRef.current < 32) return;
    lastEmitTimeRef.current = now;

    onStateChangeRef.current({
      laserPoints: laserPointsRef.current,
      spotlightNormPos: spotlightRef.current,
      ...override,
    });
  };

  // Track exact overlay container dimensions for crisp cursor/canvas mapping
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const syncSize = () => {
      const w = Math.max(100, el.clientWidth);
      const h = Math.max(100, el.clientHeight);
      setOverlaySize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // Clear laser points on mode exit
  useEffect(() => {
    if (mode !== 'laser') {
      laserPointsRef.current = [];
    }
  }, [mode]);

  // Smooth rAF Laser Pointer Animation Loop without rebuilding on every frame
  useEffect(() => {
    if (mode !== 'laser') return;

    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      const sourcePoints = isReadOnly
        ? externalStateRef.current?.laserPoints || []
        : laserPointsRef.current;

      const active = sourcePoints.filter((pt) => now - pt.time < 1200);
      if (!isReadOnly) {
        const hadPoints = laserPointsRef.current.length > 0;
        laserPointsRef.current = active;
        if (hadPoints && active.length === 0) {
          emitPresenterState({ laserPoints: [] }, true);
        }
      }

      if (active.length > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 1; i < active.length; i++) {
          const pt1 = active[i - 1];
          const pt2 = active[i];
          const age = now - pt2.time;
          const progress = Math.max(0, 1 - age / 1200);

          ctx.beginPath();
          ctx.moveTo(pt1.nx * canvas.width, pt1.ny * canvas.height);
          ctx.lineTo(pt2.nx * canvas.width, pt2.ny * canvas.height);
          ctx.strokeStyle = `rgba(239, 68, 68, ${progress * 0.9})`;
          ctx.lineWidth = 4 * progress + 2;
          ctx.shadowColor = '#EF4444';
          ctx.shadowBlur = 10 * progress;
          ctx.stroke();
        }

        const head = active[active.length - 1];
        ctx.beginPath();
        ctx.arc(head.nx * canvas.width, head.ny * canvas.height, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#DC2626';
        ctx.shadowBlur = 14;
        ctx.fill();

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [mode, isReadOnly, overlaySize.width, overlaySize.height]);

  // Pointer move handler for laser / spotlight
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isReadOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));

    if (mode === 'laser') {
      const nextPts = [...laserPointsRef.current, { nx, ny, time: Date.now() }];
      laserPointsRef.current = nextPts;
      emitPresenterState({ laserPoints: nextPts });
    } else if (mode === 'spotlight') {
      const nextSpot = { nx, ny };
      setSpotlightNormPos(nextSpot);
      spotlightRef.current = nextSpot;
      emitPresenterState({ spotlightNormPos: nextSpot });
    }
  };

  if (mode === 'none') return null;

  const activeSpotlight = isReadOnly
    ? externalState?.spotlightNormPos || { nx: 0.5, ny: 0.4 }
    : spotlightNormPos;

  return (
    <div
      ref={overlayRef}
      onPointerMove={handlePointerMove}
      className={`presenter-overlay absolute inset-0 z-30 ${
        isReadOnly
          ? 'pointer-events-none'
          : mode === 'laser' || mode === 'spotlight'
          ? 'cursor-none'
          : 'pointer-events-none'
      }`}
    >
      {/* LASER POINTER LAYER */}
      {mode === 'laser' && (
        <canvas
          ref={canvasRef}
          width={overlaySize.width}
          height={overlaySize.height}
          className={`w-full h-full ${isReadOnly ? 'pointer-events-none' : 'pointer-events-auto'}`}
        />
      )}

      {/* SPOTLIGHT LAYER */}
      {mode === 'spotlight' && (
        <div
          className={`absolute inset-0 overflow-hidden ${
            isReadOnly ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <svg className="w-full h-full">
            <defs>
              <mask id={`spotlight-mask-${isReadOnly ? 'ro' : 'ed'}`}>
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <circle
                  cx={activeSpotlight.nx * overlaySize.width}
                  cy={activeSpotlight.ny * overlaySize.height}
                  r="130"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(15, 23, 42, 0.7)"
              mask={`url(#spotlight-mask-${isReadOnly ? 'ro' : 'ed'})`}
            />
            <circle
              cx={activeSpotlight.nx * overlaySize.width}
              cy={activeSpotlight.ny * overlaySize.height}
              r="130"
              fill="none"
              stroke="rgba(59, 130, 246, 0.5)"
              strokeWidth="3"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
