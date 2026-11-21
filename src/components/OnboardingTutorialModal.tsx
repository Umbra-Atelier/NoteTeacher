import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Mail,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { AppMode, ShapeType } from '../types';

export const TUTORIAL_COOKIE_NAME = 'noteteacher_tutorial_done';
export const CREATOR_EMAIL = 'julianlee555.ca@gmail.com';

export function hasCompletedTutorialCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith(`${TUTORIAL_COOKIE_NAME}=1`));
}

export function setCompletedTutorialCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${TUTORIAL_COOKIE_NAME}=1; path=/; max-age=31536000; SameSite=Lax`;
}

export interface TutorialStepConfig {
  id: string;
  title: string;
  category: string;
  description: string;
  targetSelector: string | null;
  switchMode?: AppMode;
  shapeType?: ShapeType;
  isCreatorFinale?: boolean;
}

export const TUTORIAL_STEPS: TutorialStepConfig[] = [
  {
    id: 'canvas-overview',
    category: 'Workspace',
    title: 'Your Digital Lesson & PDF Studio',
    description:
      'Write directly on blank, lined, graph, or dotted pages—or import full multi-page PDFs. Your strokes lock onto the screen the instant your pen touches down, even when resting your wrist.',
    targetSelector: '[data-tour-id="canvas-stage"]',
    switchMode: 'drawing',
  },
  {
    id: 'mode-bar-collapse',
    category: 'Mode Bar',
    title: 'Mode Switcher & Arrow Collapse Toggle',
    description:
      'Switch workspaces or hold and drag tabs to reorder them. Click the arrow toggle right beneath the mode bar to slide it smoothly up out of sight—flipping the arrow 180° while keeping the very top bar and your active mode options pinned right at the top.',
    targetSelector: '[data-tour-id="mode-bar-collapse-group"]',
    switchMode: 'drawing',
  },
  {
    id: 'drawing-tools',
    category: 'Writing',
    title: 'Pencil, Pen & Highlighter',
    description:
      'Each writing tool remembers its own tip width and color. Single-point taps render crisp dots, and missed initial pen events are recovered mid-stroke so words never drop.',
    targetSelector: '[data-tour-id="drawing-tools"]',
    switchMode: 'drawing',
  },
  {
    id: 'color-palette',
    category: 'Colors',
    title: 'Rainbow Slider & Custom Palette',
    description:
      'Slide the expanding rainbow bar for live hues, fine-tune saturation and brightness, tap + to add slots, drag swatches to reorder them like app icons, or drag down to delete.',
    targetSelector: '[data-tour-id="color-palette"]',
    switchMode: 'drawing',
  },
  {
    id: 'touch-controls',
    category: 'Stylus & Palm',
    title: 'Tailored Touch & Palm Rejection',
    description:
      'Pick 2-Finger Touch, 2-Finger + Stylus, Stylus & Hand (with a dedicated left-side zoom/pan rail), or Stylus Only. Tune Active Pen or passive Smart Tip sensitivity using the Calibration Pad.',
    targetSelector: '[data-tour-id="touch-controls"]',
    switchMode: 'touch_controls',
  },
  {
    id: 'calculator',
    category: 'Math Tools',
    title: 'Drop-In Scientific Calculators',
    description:
      'Tap anywhere on a page to place a full scientific calculator with DEG/RAD/GRAD modes, calculation history, memory keys, transparency, rotation, and L-grab corner scaling.',
    targetSelector: '[data-tour-id="calculator-tools"]',
    switchMode: 'calculator',
  },
  {
    id: 'graphing',
    category: 'Desmos',
    title: 'Transparent Live Desmos Graphs',
    description:
      'Stretch custom-sized Desmos graphing boxes right onto any worksheet or PDF. Adjust graph background transparency so lesson diagrams shine cleanly underneath.',
    targetSelector: '[data-tour-id="graphing-tools"]',
    switchMode: 'graphing',
  },
  {
    id: 'geometric-angles',
    category: 'Geometry',
    title: 'Shapes, Grids & 0°–359° Angle Tool',
    description:
      'Build crisp shapes with a 1–24px size slider and independent mode color memory, click any grid’s X×Y dimension badge to set exact columns and rows via the on-screen keyboard, or measure 0°–359° angles in Degrees or Radians.',
    targetSelector: '[data-tour-id="geometric-tools"]',
    switchMode: 'geometric',
    shapeType: 'angle',
  },
  {
    id: 'dictate',
    category: 'Voice & Text',
    title: 'Live Speech Dictation & Keyboards',
    description:
      'Drag vertically to size single-line text, draw a wrapping 2D box, or lock a constant font size—then speak into the live mic dock or double-tap any text box for the virtual keyboard.',
    targetSelector: '[data-tour-id="dictate-tools"]',
    switchMode: 'dictate',
  },
  {
    id: 'edit-grab-copy',
    category: 'Editing',
    title: 'Ghosted Eraser, Magic Grab & Picture Copy',
    description:
      'Erase with an undoable red ghost preview (Scrub, Box Select, or Circle Carver), lasso and rotate groups via Magic Grab’s compass and joystick, or snip any page area with Picture Copy.',
    targetSelector: '[data-tour-id="edit-tools"]',
    switchMode: 'edit',
  },
  {
    id: 'files-pdf',
    category: 'Files & PDFs',
    title: 'Classic File Explorer & Multi-Page Export',
    description:
      'Open PDFs, images, or saved projects from local folders, switch paper patterns underneath open PDFs without wiping pages, and export clean or annotated PDFs and images.',
    targetSelector: '[data-tour-id="file-btn"]',
    switchMode: 'drawing',
  },
  {
    id: 'pov-page-bar',
    category: 'Page View',
    title: 'Full-POV Edges, Smart Zoom & Page Bar',
    description:
      'Click the sideward arrows to expand any page edge-to-edge under the top bar, or stay in regular view for instant Page Copy and New Page controls. Floating zoom controls stay subtle until tapped.',
    targetSelector: '[data-tour-id="pov-controls"]',
    switchMode: 'drawing',
  },
  {
    id: 'presenter-quick',
    category: 'Presenting',
    title: 'Dual-View Projection, Laser & Quick Controls',
    description:
      'Launch a clean Audience Viewer tab synced in real time—complete with laser trail, spotlight focus, and Full-POV mirroring—plus always-accessible File, Undo/Redo, Paper Type, Save, Dark Mode, and Fullscreen controls along the very top bar.',
    targetSelector: '[data-tour-id="presenter-tools"]',
    switchMode: 'presenter',
  },
  {
    id: 'creator-finale',
    category: 'Creator Note',
    title: 'Built by umbra atelier',
    description:
      'NoteTeacher started with a simple idea: a student who, after watching teachers teach, saw that educators needed a dedicated tool with thoughtful features to make lessons even better—crafted with an AI build partner.',
    targetSelector: null,
    isCreatorFinale: true,
  },
];

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export type TutorialStage = 'idle' | 'welcome' | 'tour' | 'animating';

interface OnboardingTutorialModalProps {
  stage: TutorialStage;
  stepIndex: number;
  onStartTour: () => void;
  onLater: () => void;
  onStepChange: (nextIndex: number) => void;
  onSkipTour: () => void;
  onCompleteWithAnimation: () => void;
  onAnimationEnd: () => void;
}

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FlightCoords {
  fromLeft: number;
  fromTop: number;
  fromSize: number;
  dx: number;
  dy: number;
  targetScale: number;
}

export const OnboardingTutorialModal: React.FC<OnboardingTutorialModalProps> = ({
  stage,
  stepIndex,
  onStartTour,
  onLater,
  onStepChange,
  onSkipTour,
  onCompleteWithAnimation,
  onAnimationEnd,
}) => {
  const totalSteps = TUTORIAL_STEPS.length;
  const clampedIdx = Math.max(0, Math.min(totalSteps - 1, stepIndex));
  const currentStep = TUTORIAL_STEPS[clampedIdx];

  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const [emailCopied, setEmailCopied] = useState(false);

  // Outro collapse & corner flight state
  const finaleInfoBadgeRef = useRef<HTMLDivElement>(null);
  const finaleCardRef = useRef<HTMLDivElement>(null);
  const [outroPhase, setOutroPhase] = useState<'none' | 'collapse' | 'fly'>('none');
  const [flightCoords, setFlightCoords] = useState<FlightCoords | null>(null);
  const [flyStarted, setFlyStarted] = useState(false);

  useEffect(() => {
    setEmailCopied(false);
    if (stage !== 'animating') {
      setOutroPhase('none');
      setFlightCoords(null);
      setFlyStarted(false);
    }
  }, [stage, clampedIdx]);

  // Measure highlighted target element whenever step changes or window resizes
  useLayoutEffect(() => {
    if (stage !== 'tour') {
      setHighlightRect(null);
      return;
    }

    let rafId = 0;
    let settleTimer: number | null = null;

    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewportSize((prev) => (prev.w === vw && prev.h === vh ? prev : { w: vw, h: vh }));

      const applyRect = (next: HighlightRect | null) => {
        setHighlightRect((prev) => {
          if (prev === next) return prev;
          if (
            prev &&
            next &&
            prev.left === next.left &&
            prev.top === next.top &&
            prev.width === next.width &&
            prev.height === next.height
          ) {
            return prev;
          }
          return next;
        });
      };

      if (!currentStep.targetSelector) {
        applyRect(null);
        return;
      }

      const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
      if (!el) {
        applyRect(null);
        return;
      }

      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) {
        applyRect(null);
        return;
      }

      const pad = currentStep.id === 'canvas-overview' ? 0 : 8;
      // For huge full-canvas showcase, frame an inner focal margin so the dark spotlight border stays visible
      if (currentStep.id === 'canvas-overview') {
        const insetX = Math.min(36, Math.round(r.width * 0.05));
        const insetY = Math.min(28, Math.round(r.height * 0.05));
        applyRect({
          left: Math.round(Math.max(8, r.left + insetX)),
          top: Math.round(Math.max(8, r.top + insetY)),
          width: Math.round(Math.max(120, Math.min(vw - 16, r.width - insetX * 2))),
          height: Math.round(Math.max(140, Math.min(vh - r.top - 24, r.height - insetY * 2))),
        });
        return;
      }

      const left = Math.round(Math.max(4, r.left - pad));
      const top = Math.round(Math.max(4, r.top - pad));
      const right = Math.round(Math.min(vw - 4, r.right + pad));
      const bottom = Math.round(Math.min(vh - 4, r.bottom + pad));
      applyRect({
        left,
        top,
        width: Math.max(24, right - left),
        height: Math.max(24, bottom - top),
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    // Secondary measure after mode sub-toolbar finishes mounting/reflowing
    settleTimer = window.setTimeout(scheduleMeasure, 65);

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    return () => {
      cancelAnimationFrame(rafId);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [stage, currentStep.id, currentStep.targetSelector]);

  const handleCopyCreatorEmail = useCallback(async () => {
    const ok = await copyTextToClipboard(CREATOR_EMAIL);
    if (ok) {
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 2200);
    }
  }, []);

  const triggerOutroFlight = useCallback(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const fromEl = finaleInfoBadgeRef.current;
    const toEl = document.querySelector('[data-tour-id="creator-info-btn"]') as HTMLElement | null;

    if (prefersReducedMotion || !fromEl || !toEl) {
      onCompleteWithAnimation();
      onAnimationEnd();
      return;
    }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const fromCx = fromRect.left + fromRect.width / 2;
    const fromCy = fromRect.top + fromRect.height / 2;
    const toCx = toRect.left + toRect.width / 2;
    const toCy = toRect.top + toRect.height / 2;

    onCompleteWithAnimation();
    setOutroPhase('collapse');
    setFlightCoords({
      fromLeft: fromRect.left,
      fromTop: fromRect.top,
      fromSize: Math.max(24, fromRect.width),
      dx: toCx - fromCx,
      dy: toCy - fromCy,
      targetScale: Math.max(0.65, toRect.width / Math.max(1, fromRect.width)),
    });
    setFlyStarted(false);

    window.setTimeout(() => {
      setOutroPhase('fly');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlyStarted(true);
        });
      });
    }, 260);

    window.setTimeout(() => {
      onAnimationEnd();
    }, 760);
  }, [onCompleteWithAnimation, onAnimationEnd]);

  // Keyboard navigation during tutorial
  useEffect(() => {
    if (stage !== 'welcome' && stage !== 'tour') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stage === 'welcome') {
          onLater();
        } else {
          onSkipTour();
        }
      } else if (stage === 'tour' && e.key === 'ArrowRight') {
        if (clampedIdx < totalSteps - 1) {
          onStepChange(clampedIdx + 1);
        }
      } else if (stage === 'tour' && e.key === 'ArrowLeft') {
        if (clampedIdx > 0) {
          onStepChange(clampedIdx - 1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, clampedIdx, totalSteps, onLater, onSkipTour, onStepChange]);

  if (typeof document === 'undefined' || stage === 'idle') return null;

  // 1. FIRST-LAUNCH BLURRED WELCOME POPUP
  if (stage === 'welcome') {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tutorial-title"
        data-testid="tutorial-welcome-modal"
        className="fixed inset-0 z-[10200] bg-slate-950/55 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
      >
        <div className="ui-scale-target w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 text-slate-900 dark:text-slate-100 space-y-5 max-h-[calc((100vh-2rem)/var(--ui-scale,1))] max-w-[calc((100vw-2rem)/var(--ui-scale,1))] overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </div>
              <div>
                <h2
                  id="welcome-tutorial-title"
                  className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
                >
                  Welcome to NoteTeacher
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Interactive Tour · {totalSteps} quick highlights
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLater}
              aria-label="Close tutorial prompt"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Take a quick interactive walkthrough of NoteTeacher&apos;s zero-lag writing tools,
            live Desmos graphing, scientific calculators, voice dictation, PDF views, and dual-screen
            presenting—each highlighted live right on your workspace.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onLater}
              data-testid="tutorial-later-btn"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              Later
            </button>
            <button
              type="button"
              onClick={onStartTour}
              data-testid="tutorial-play-btn"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play Tutorial</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // 2. COMPUTE SPOTLIGHT CARD POSITION
  const cardWidth = Math.min(400, viewportSize.w - 24);
  const estimatedCardHeight = currentStep.isCreatorFinale ? 360 : 230;
  let cardStyle: React.CSSProperties;

  if (currentStep.isCreatorFinale || !highlightRect) {
    cardStyle = {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${Math.min(460, viewportSize.w - 24)}px`,
    };
  } else if (currentStep.id === 'canvas-overview') {
    cardStyle = {
      left: `${Math.round((viewportSize.w - cardWidth) / 2)}px`,
      bottom: '28px',
      width: `${cardWidth}px`,
    };
  } else {
    const spaceBelow = viewportSize.h - (highlightRect.top + highlightRect.height);
    const spaceAbove = highlightRect.top;
    const spaceLeft = highlightRect.left;
    let top: number;
    let left: number;

    if (spaceBelow >= estimatedCardHeight + 20) {
      top = highlightRect.top + highlightRect.height + 16;
      left = highlightRect.left + highlightRect.width / 2 - cardWidth / 2;
    } else if (spaceAbove >= estimatedCardHeight + 20) {
      top = highlightRect.top - estimatedCardHeight - 16;
      left = highlightRect.left + highlightRect.width / 2 - cardWidth / 2;
    } else if (spaceLeft >= cardWidth + 24) {
      top = highlightRect.top + highlightRect.height / 2 - estimatedCardHeight / 2;
      left = highlightRect.left - cardWidth - 16;
    } else {
      top = Math.max(16, viewportSize.h - estimatedCardHeight - 20);
      left = (viewportSize.w - cardWidth) / 2;
    }

    const clampedLeft = Math.max(12, Math.min(viewportSize.w - cardWidth - 12, Math.round(left)));
    const clampedTop = Math.max(
      12,
      Math.min(viewportSize.h - estimatedCardHeight - 12, Math.round(top))
    );

    cardStyle = {
      left: `${clampedLeft}px`,
      top: `${clampedTop}px`,
      width: `${cardWidth}px`,
    };
  }

  const isOutroCollapsingOrFlying = stage === 'animating' && outroPhase !== 'none';

  return createPortal(
    <div
      data-testid="tutorial-spotlight-overlay"
      className={`fixed inset-0 z-[10200] transition-opacity duration-200 ${
        outroPhase === 'fly' ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      {/* SVG Spotlight Mask Backdrop */}
      {outroPhase !== 'fly' && (
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none"
          width={viewportSize.w}
          height={viewportSize.h}
        >
          <defs>
            <mask id="noteteacher-spotlight-mask">
              <rect x="0" y="0" width={viewportSize.w} height={viewportSize.h} fill="white" />
              {highlightRect && (
                <rect
                  x={highlightRect.left}
                  y={highlightRect.top}
                  width={highlightRect.width}
                  height={highlightRect.height}
                  rx={12}
                  ry={12}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width={viewportSize.w}
            height={viewportSize.h}
            fill="rgba(2, 6, 23, 0.64)"
            mask="url(#noteteacher-spotlight-mask)"
          />
          {highlightRect && (
            <rect
              x={highlightRect.left}
              y={highlightRect.top}
              width={highlightRect.width}
              height={highlightRect.height}
              rx={12}
              ry={12}
              fill="none"
              stroke="#3B82F6"
              strokeWidth={2.5}
            />
          )}
        </svg>
      )}

      {/* Tutorial Step / Creator Finale Card */}
      {outroPhase !== 'fly' && (
        <div
          ref={finaleCardRef}
          role="dialog"
          aria-modal="true"
          data-testid={`tutorial-step-card-${clampedIdx + 1}`}
          style={cardStyle}
          className={`fixed z-[10210] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 transition-opacity duration-200 ${
            isOutroCollapsingOrFlying ? 'opacity-95' : 'opacity-100'
          }`}
        >
          <div className="ui-scale-target p-5 space-y-3.5">
          {/* Header Row: Step Counter + Category + Close */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                data-testid="tutorial-step-counter"
                className="font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums"
              >
                {clampedIdx + 1} / {totalSteps}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {currentStep.category}
              </span>
            </div>

            {!currentStep.isCreatorFinale && (
              <button
                type="button"
                onClick={onSkipTour}
                data-testid="tutorial-skip-btn"
                className="text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Skip
              </button>
            )}
          </div>

          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {currentStep.title}
          </h3>

          <p className="text-xs sm:text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            {currentStep.description}
          </p>

          {/* Creator Finale Email Highlight & Collapse-into-"i" Row */}
          {currentStep.isCreatorFinale && (
            <div className="pt-1 space-y-2.5 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Questions, bug reports, or new feature suggestions? Contact{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  umbra atelier
                </span>{' '}
                directly—click the email below to copy it:
              </p>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="inline-flex items-center gap-2 min-w-0">
                  {/* Blue "i" with circle around it */}
                  <div
                    ref={finaleInfoBadgeRef}
                    data-testid="creator-finale-info-dot"
                    className="w-7 h-7 rounded-full border-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-serif font-bold text-sm flex items-center justify-center shrink-0 transition-opacity duration-150 opacity-100"
                  >
                    i
                  </div>

                  {/* Highlighted Blue Email Button (collapses into the blue "i" circle on finish) */}
                  <button
                    type="button"
                    onClick={() => void handleCopyCreatorEmail()}
                    data-testid="creator-finale-email-btn"
                    title="Click to copy julianlee555.ca@gmail.com to clipboard"
                    style={{
                      maxWidth: outroPhase === 'collapse' ? '0px' : '260px',
                      opacity: outroPhase === 'collapse' ? 0 : 1,
                      paddingLeft: outroPhase === 'collapse' ? '0px' : '10px',
                      paddingRight: outroPhase === 'collapse' ? '0px' : '10px',
                      transform: outroPhase === 'collapse' ? 'scaleX(0.2)' : 'scaleX(1)',
                      transformOrigin: 'left center',
                    }}
                    className="overflow-hidden whitespace-nowrap inline-flex items-center gap-1.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 dark:hover:bg-blue-900/70 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-all duration-[250ms] ease-out cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>{CREATOR_EMAIL}</span>
                    {emailCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-75 shrink-0" />
                    )}
                  </button>
                </div>

                {emailCopied && outroPhase === 'none' && (
                  <span
                    data-testid="creator-finale-copied-badge"
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                  >
                    Copied!
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Footer Navigation */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={clampedIdx === 0 || isOutroCollapsingOrFlying}
              onClick={() => onStepChange(Math.max(0, clampedIdx - 1))}
              data-testid="tutorial-prev-btn"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            {currentStep.isCreatorFinale ? (
              <button
                type="button"
                disabled={isOutroCollapsingOrFlying}
                onClick={triggerOutroFlight}
                data-testid="tutorial-finish-btn"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Finish Tutorial</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStepChange(Math.min(totalSteps - 1, clampedIdx + 1))}
                data-testid="tutorial-next-btn"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <span>{clampedIdx === totalSteps - 2 ? 'Creator Note' : 'Next'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Flying Blue Circular "i" Dot traveling to Top-Right Corner Button */}
      {outroPhase === 'fly' && flightCoords && (
        <div
          aria-hidden="true"
          data-testid="flying-creator-info-dot"
          style={{
            position: 'fixed',
            left: `${flightCoords.fromLeft}px`,
            top: `${flightCoords.fromTop}px`,
            width: `${flightCoords.fromSize}px`,
            height: `${flightCoords.fromSize}px`,
            transform: flyStarted
              ? `translate3d(${flightCoords.dx}px, ${flightCoords.dy}px, 0) scale(${flightCoords.targetScale})`
              : 'translate3d(0px, 0px, 0) scale(1)',
            transition: 'transform 440ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="z-[10300] rounded-full border-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-serif font-bold text-sm flex items-center justify-center shadow-lg pointer-events-none"
        >
          i
        </div>
      )}
    </div>,
    document.body
  );
};

interface CreatorInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayTutorial: () => void;
}

export const CreatorInfoDialog: React.FC<CreatorInfoDialogProps> = ({
  isOpen,
  onClose,
  onReplayTutorial,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(CREATOR_EMAIL);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-info-dialog-title"
      data-testid="creator-info-dialog"
      onClick={onClose}
      className="fixed inset-0 z-[10250] bg-slate-950/55 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ui-scale-target w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 text-slate-900 dark:text-slate-100 space-y-4 max-h-[calc((100vh-2rem)/var(--ui-scale,1))] max-w-[calc((100vw-2rem)/var(--ui-scale,1))] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-serif font-bold text-base flex items-center justify-center shrink-0">
              i
            </div>
            <div>
              <h2
                id="creator-info-dialog-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                About NoteTeacher · umbra atelier
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Creator Story, Feedback &amp; Feature Ideas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close info dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          NoteTeacher was designed by{' '}
          <span className="font-semibold text-slate-900 dark:text-slate-100">umbra atelier</span>
          —conceived by a student who, after watching teachers teach, saw the need for a dedicated
          classroom tool built with practical features to make lessons even better, developed
          together with an AI build partner.
        </p>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Have questions about a tool or a feature you&apos;d love to suggest? Contact me directly
            at the email below (click to copy):
          </p>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => void handleCopy()}
              data-testid="creator-info-email-btn"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 dark:hover:bg-blue-900/70 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>{CREATOR_EMAIL}</span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 opacity-75 shrink-0" />
              )}
            </button>

            {copied && (
              <span
                data-testid="creator-info-copied-text"
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
              >
                Copied to clipboard!
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              onClose();
              onReplayTutorial();
            }}
            data-testid="creator-info-replay-btn"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay Tutorial</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            data-testid="creator-info-close-btn"
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
