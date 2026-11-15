import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import html2canvas from 'html2canvas';
import {
  AngleNegativeDirection,
  AppMode,
  PenType,
  ShapeType,
  EraserType,
  CanvasStroke,
  GeometricShape,
  DesmosBox,
  CalculatorBox,
  PageData,
  PaperTemplate,
  PresenterMode,
  StrokePoint,
  GrabbedSelection,
  CanvasImage,
  DictatedTextBox,
  DictateSubMode,
  MagicGrabMode,
  TouchInputMode,
  LeftToolbarTool,
  StylusDetectionConfig,
  LiveCanvasOverlay,
  LivePresenterToolState,
} from '../types';
import { DesmosGraphBox } from './DesmosGraphBox';
import { ScientificCalculatorBox, CALC_BASE_WIDTH, CALC_BASE_HEIGHT } from './ScientificCalculatorBox';
import { CanvasImageBox } from './CanvasImageBox';
import { DictatedTextBoxItem } from './DictatedTextBoxItem';
import { InteractiveGridBox } from './InteractiveGridBox';
import { GhostEraserPrompt } from './GhostEraserPrompt';
import { PresenterOverlay } from './PresenterOverlay';
import { RotationJoystickControl } from './RotationJoystickControl';
import { sanitizeClonedDocumentForHtml2Canvas } from '../utils/domSnapshot';
import { recordPageStageSize } from '../utils/widgetSnapshotCache';
import { hexWithAlphaPercent } from '../utils/colorUtils';
import {
  acquirePdfPageTile,
  releasePdfTile,
  releasePagePdfResources,
  resolvePdfPageDataUrl,
} from '../utils/pdfPageCache';
import {
  Compass,
  Move,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Camera,
  MousePointer,
  Hand,
} from 'lucide-react';

interface CanvasStageProps {
  mode: AppMode;
  pageId: string;
  isActivePage?: boolean;
  template: PaperTemplate;
  pdfSourceId?: string;
  pdfPageNumber?: number;
  previewDataUrl?: string;
  pdfDataUrl?: string;
  aspectRatio?: number;
  pdfWidth?: number;
  pdfHeight?: number;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  onActivatePage?: () => void;

  // Touch controls input strategy & stylus detection configuration
  touchInputMode?: TouchInputMode;
  stylusConfig?: StylusDetectionConfig;

  // Audience live sync & viewer mirror props
  isAudienceViewer?: boolean;
  hideAudienceChrome?: boolean;
  externalZoomScale?: number;
  externalPanOffset?: { x: number; y: number };
  onViewportChange?: (zoomScale: number, panOffset: { x: number; y: number }) => void;
  externalLiveOverlay?: LiveCanvasOverlay | null;
  onLiveOverlayChange?: (overlay: LiveCanvasOverlay | null) => void;
  externalPresenterState?: LivePresenterToolState | null;
  onPresenterStateChange?: (state: LivePresenterToolState) => void;

  // Drawing props
  penType: PenType;
  strokeWidth: number;
  currentColor: string;

  // Geometric props
  shapeType: ShapeType;
  shapeStrokeWidth: number;
  shapeStyle: 'solid' | 'dashed' | 'dotted';
  shapeFill: boolean;
  shapeFillOpacity?: number;
  angleUnit?: 'deg' | 'rad';
  angleNegativeDirection?: AngleNegativeDirection;
  allowNegativeAngles?: boolean;

  // Edit / Eraser props
  eraserType: EraserType;
  eraserSize: number;
  isGeometricEraserActive?: boolean;
  isDictateEraserActive?: boolean;
  isMagicGrabActive: boolean;
  magicGrabMode?: MagicGrabMode;
  keepEmptyBox?: boolean;
  isPictureCopyActive?: boolean;
  onSetPictureCopyActive?: (active: boolean) => void;

  // Selection callback for Cut/Copy/Delete
  onSelectionChange?: (sel: {
    strokeIds: string[];
    shapeIds: string[];
    graphIds: string[];
    calcIds: string[];
    imageIds: string[];
    dictateIds?: string[];
  }) => void;
  activeSelectionProp?: GrabbedSelection | null;

  // Presenter props
  presenterMode: PresenterMode;
  onClosePresenter: () => void;

  // Dictate mode props
  dictateSubMode?: DictateSubMode;
  constantDictateFontSize?: number;
  dictatedTextBoxes?: DictatedTextBox[];
  activeDictateBoxId?: string | null;
  selectedDictateBoxId?: string | null;
  editingDictateBoxId?: string | null;
  isDictating?: boolean;
  onAddDictatedTextBox?: (box: DictatedTextBox) => void;
  onUpdateDictatedTextBox?: (id: string, updated: Partial<DictatedTextBox>) => void;
  onDeleteDictatedTextBox?: (id: string) => void;
  onSelectDictateBoxForTransform?: (id: string) => void;
  onResumeDictateBox?: (id: string) => void;
  onStartManualEditDictateBox?: (id: string) => void;
  onStopManualEditDictateBox?: () => void;
  onClickOutsideDictateBox?: () => void;
  onDeselectDictateBox?: () => void;

  // Page state collections
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images?: CanvasImage[];

  // Mutators
  onAddStroke: (stroke: CanvasStroke) => void;
  onAddShape: (shape: GeometricShape) => void;
  onUpdateShape?: (id: string, updated: Partial<GeometricShape>) => void;
  onDeleteShape?: (id: string) => void;
  onAddGraph: (graph: DesmosBox) => void;
  onAddCalculator: (calc: CalculatorBox) => void;
  onAddImage?: (img: CanvasImage) => void;
  onUpdateGraph: (id: string, updated: Partial<DesmosBox>) => void;
  onDeleteGraph: (id: string) => void;
  onUpdateCalculator: (id: string, updated: Partial<CalculatorBox>) => void;
  onDeleteCalculator: (id: string) => void;
  onUpdateImage?: (id: string, updated: Partial<CanvasImage>) => void;
  onDeleteImage?: (id: string) => void;

  // Eraser Ghosting, Partial Circle Carving & Commit
  onGhostItems: (strokeIds: string[], shapeIds: string[], dictateIds?: string[]) => void;
  onCircleEraseSweep?: (
    from: { x: number; y: number } | null,
    to: { x: number; y: number },
    radius: number
  ) => boolean;
  onConfirmDeleteGhosted: (selected?: {
    strokeIds: string[];
    shapeIds: string[];
    dictateIds?: string[];
  }) => void;
  onCancelGhosted: () => void;

  // Magic Grab Transform
  onTransformItems: (
    strokeIds: string[],
    shapeIds: string[],
    graphIds: string[],
    calcIds: string[],
    dx: number,
    dy: number,
    imageIds?: string[],
    dictateIds?: string[]
  ) => void;
  onRotateItems?: (
    strokeIds: string[],
    shapeIds: string[],
    graphIds: string[],
    calcIds: string[],
    deltaDeg: number,
    pivotX: number,
    pivotY: number,
    imageIds?: string[],
    dictateIds?: string[]
  ) => void;
  onTransformEnd?: () => void;

  // Document color registration
  onColorUsed: (hex: string) => void;
}

function isPointInRotatedBox(
  px: number,
  py: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  rotDeg = 0,
  pad = 0
): boolean {
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const dx = px - cx;
  const dy = py - cy;
  const rad = (-rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= bw / 2 + pad && Math.abs(localY) <= bh / 2 + pad;
}

function getRotatedBoxAabb(bx: number, by: number, bw: number, bh: number, rotDeg = 0) {
  if (!rotDeg) {
    return {
      minX: Math.min(bx, bx + bw),
      maxX: Math.max(bx, bx + bw),
      minY: Math.min(by, by + bh),
      maxY: Math.max(by, by + bh),
    };
  }
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = bw / 2;
  const hh = bh / 2;
  const pts = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

// Convert points to smooth quadratic bezier SVG path
function pointsToSvgPath(points: StrokePoint[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    d += ` Q ${p1.x} ${p1.y}, ${midX} ${midY}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

const PDF_TILE_COLS = 3;
const PDF_TILE_ROWS = 4;

export const CanvasStage: React.FC<CanvasStageProps> = ({
  mode,
  touchInputMode = 'two_finger',
  stylusConfig = { detectionMode: 'active_pen', maxTipSizePx: 14, allowMouseInput: true },
  isAudienceViewer = false,
  isActivePage = true,
  hideAudienceChrome = false,
  externalZoomScale,
  externalPanOffset,
  onViewportChange,
  externalLiveOverlay = null,
  onLiveOverlayChange,
  externalPresenterState = null,
  onPresenterStateChange,
  pageId,
  template,
  pdfSourceId,
  pdfPageNumber,
  previewDataUrl,
  pdfDataUrl,
  aspectRatio,
  pdfWidth,
  pdfHeight,
  scrollContainerRef,
  onActivatePage,
  penType,
  strokeWidth,
  currentColor,
  shapeType,
  shapeStrokeWidth,
  shapeStyle,
  shapeFill,
  shapeFillOpacity = 25,
  angleUnit = 'deg',
  angleNegativeDirection = 'counter_clockwise',
  allowNegativeAngles = false,
  eraserType,
  eraserSize,
  isGeometricEraserActive = false,
  isDictateEraserActive = false,
  isMagicGrabActive,
  magicGrabMode = 'touch',
  keepEmptyBox = false,
  isPictureCopyActive = false,
  onSetPictureCopyActive,
  onSelectionChange,
  activeSelectionProp,
  presenterMode,
  onClosePresenter,
  dictateSubMode = 'height',
  constantDictateFontSize = 24,
  dictatedTextBoxes = [],
  activeDictateBoxId = null,
  selectedDictateBoxId = null,
  editingDictateBoxId = null,
  isDictating = false,
  onAddDictatedTextBox,
  onUpdateDictatedTextBox,
  onDeleteDictatedTextBox,
  onSelectDictateBoxForTransform,
  onResumeDictateBox,
  onStartManualEditDictateBox,
  onStopManualEditDictateBox,
  onClickOutsideDictateBox,
  onDeselectDictateBox,
  strokes,
  shapes,
  graphs,
  calculators,
  images = [],
  onAddStroke,
  onAddShape,
  onUpdateShape,
  onDeleteShape,
  onAddGraph,
  onAddCalculator,
  onAddImage,
  onUpdateGraph,
  onDeleteGraph,
  onUpdateCalculator,
  onDeleteCalculator,
  onUpdateImage,
  onDeleteImage,
  onGhostItems,
  onCircleEraseSweep,
  onConfirmDeleteGhosted,
  onCancelGhosted,
  onTransformItems,
  onRotateItems,
  onTransformEnd,
  onColorUsed,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan state (Two-finger pinch-to-zoom centered on finger midpoint)
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeZoomScale = externalZoomScale ?? zoomScale;
  const activePanOffset = externalPanOffset ?? panOffset;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const lastEmittedViewportRef = useRef<string>('');

  // Emit viewport camera changes for live Audience View mirroring only from the active page
  useEffect(() => {
    if (isAudienceViewer || !isActivePage || !onViewportChangeRef.current) return;
    const key = `${pageId}:${zoomScale.toFixed(4)}:${panOffset.x.toFixed(2)}:${panOffset.y.toFixed(2)}`;
    if (lastEmittedViewportRef.current === key) return;
    lastEmittedViewportRef.current = key;
    onViewportChangeRef.current(zoomScale, panOffset);
  }, [pageId, zoomScale, panOffset, isAudienceViewer, isActivePage]);

  // Record exact logical CSS stage dimensions per page for pixel-accurate multi-page PDF/Image exports
  useEffect(() => {
    if (isAudienceViewer) return;
    const el = containerRef.current;
    if (!el || !pageId) return;
    const record = () => {
      if (el.clientWidth > 50 && el.clientHeight > 50) {
        recordPageStageSize(pageId, el.clientWidth, el.clientHeight);
      }
    };
    record();
    const ro = new ResizeObserver(record);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isAudienceViewer, pageId]);

  // OneNote-style spatial PDF tile streaming: blurry edges enter first, resolve crisply after settle,
  // and unload immediately whenever tiles scroll or pan outside the visible viewport.
  const [loadedTiles, setLoadedTiles] = useState<Record<string, { url: string; ready: boolean }>>({});
  const tileSettleTimersRef = useRef<Map<string, number>>(new Map());
  const tileAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeTileKeysRef = useRef<Set<string>>(new Set());
  const pageDescRef = useRef<PageData>({
    id: pageId,
    title: '',
    template,
    pdfSourceId,
    pdfPageNumber,
    previewDataUrl,
    pdfDataUrl,
    pdfWidth,
    pdfHeight,
    aspectRatio,
  });
  pageDescRef.current = {
    id: pageId,
    title: '',
    template,
    pdfSourceId,
    pdfPageNumber,
    previewDataUrl,
    pdfDataUrl,
    pdfWidth,
    pdfHeight,
    aspectRatio,
  };
  const zoomPanRef = useRef({ zoomScale: activeZoomScale, panOffset: activePanOffset });
  zoomPanRef.current = { zoomScale: activeZoomScale, panOffset: activePanOffset };

  const clearAllTileTasksAndCache = useCallback(() => {
    tileSettleTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    tileSettleTimersRef.current.clear();
    tileAbortControllersRef.current.forEach((ctrl) => ctrl.abort());
    tileAbortControllersRef.current.clear();
    activeTileKeysRef.current.clear();
    setLoadedTiles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    if (!isAudienceViewer) {
      releasePagePdfResources(pageId);
    }
  }, [pageId, isAudienceViewer]);

  useEffect(() => {
    if (isAudienceViewer || template !== 'pdf') {
      clearAllTileTasksAndCache();
      return;
    }

    let rafId: number | null = null;
    let isDisposed = false;

    const recomputeVisibleTiles = () => {
      rafId = null;
      if (isDisposed) return;
      const el = containerRef.current;
      if (!el) return;

      const cRect = el.getBoundingClientRect();
      const scrollEl = scrollContainerRef?.current || el.closest('main');
      const sRect = scrollEl
        ? scrollEl.getBoundingClientRect()
        : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

      const visLeft = Math.max(cRect.left, sRect.left, 0);
      const visRight = Math.min(cRect.right, sRect.right, window.innerWidth);
      const visTop = Math.max(cRect.top, sRect.top, 0);
      const visBottom = Math.min(cRect.bottom, sRect.bottom, window.innerHeight);

      const baseW = el.clientWidth || cRect.width;
      const baseH = el.clientHeight || cRect.height;
      const { zoomScale: curZoom, panOffset: curPan } = zoomPanRef.current;

      const nextKeys = new Set<string>();
      if (visRight > visLeft + 2 && visBottom > visTop + 2 && baseW > 10 && baseH > 10) {
        for (let row = 0; row < PDF_TILE_ROWS; row++) {
          const tTop = cRect.top + curPan.y + (row / PDF_TILE_ROWS) * baseH * curZoom;
          const tBottom = cRect.top + curPan.y + ((row + 1) / PDF_TILE_ROWS) * baseH * curZoom;
          if (tBottom <= visTop || tTop >= visBottom) continue;

          for (let col = 0; col < PDF_TILE_COLS; col++) {
            const tLeft = cRect.left + curPan.x + (col / PDF_TILE_COLS) * baseW * curZoom;
            const tRight = cRect.left + curPan.x + ((col + 1) / PDF_TILE_COLS) * baseW * curZoom;
            if (tRight <= visLeft || tLeft >= visRight) continue;
            nextKeys.add(`${col},${row}`);
          }
        }
      }

      // Cancel & unload any tiles that moved outside the visible viewport
      const keysToRemove: string[] = [];
      for (const existingKey of Array.from(activeTileKeysRef.current)) {
        if (!nextKeys.has(existingKey)) {
          keysToRemove.push(existingKey);
        }
      }

      for (const key of keysToRemove) {
        activeTileKeysRef.current.delete(key);
        const timerId = tileSettleTimersRef.current.get(key);
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
          tileSettleTimersRef.current.delete(key);
        }
        const ctrl = tileAbortControllersRef.current.get(key);
        if (ctrl) {
          ctrl.abort();
          tileAbortControllersRef.current.delete(key);
        }
        const [cStr, rStr] = key.split(',');
        releasePdfTile(pageId, Number(cStr), Number(rStr), PDF_TILE_COLS, PDF_TILE_ROWS);
      }

      if (keysToRemove.length > 0) {
        setLoadedTiles((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const k of keysToRemove) {
            if (k in next) {
              delete next[k];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }

      // Schedule newly entered visible tiles with brief settle so blurry edge resolves smoothly to crisp
      for (const key of nextKeys) {
        if (activeTileKeysRef.current.has(key)) continue;
        activeTileKeysRef.current.add(key);

        const [cStr, rStr] = key.split(',');
        const col = Number(cStr);
        const row = Number(rStr);

        const timerId = window.setTimeout(() => {
          tileSettleTimersRef.current.delete(key);
          if (isDisposed || !activeTileKeysRef.current.has(key)) return;

          const ctrl = new AbortController();
          tileAbortControllersRef.current.set(key, ctrl);

          void acquirePdfPageTile(
            pageDescRef.current,
            col,
            row,
            PDF_TILE_COLS,
            PDF_TILE_ROWS,
            ctrl.signal
          ).then((url) => {
            if (tileAbortControllersRef.current.get(key) === ctrl) {
              tileAbortControllersRef.current.delete(key);
            }
            if (!url || ctrl.signal.aborted || isDisposed || !activeTileKeysRef.current.has(key)) {
              return;
            }
            setLoadedTiles((prev) => {
              if (prev[key]?.url === url) return prev;
              return { ...prev, [key]: { url, ready: false } };
            });
          });
        }, 24);

        tileSettleTimersRef.current.set(key, timerId);
      }
    };

    const scheduleRecompute = () => {
      if (isDisposed || rafId !== null) return;
      rafId = requestAnimationFrame(recomputeVisibleTiles);
    };

    recomputeVisibleTiles();

    const scrollTarget = scrollContainerRef?.current || containerRef.current?.closest('main');
    scrollTarget?.addEventListener('scroll', scheduleRecompute, { passive: true });
    window.addEventListener('resize', scheduleRecompute);
    const ro = containerRef.current ? new ResizeObserver(scheduleRecompute) : null;
    if (containerRef.current && ro) {
      ro.observe(containerRef.current);
    }

    return () => {
      isDisposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      scrollTarget?.removeEventListener('scroll', scheduleRecompute);
      window.removeEventListener('resize', scheduleRecompute);
      ro?.disconnect();
    };
  }, [pageId, template, pdfSourceId, pdfPageNumber, pdfDataUrl, isAudienceViewer, scrollContainerRef, clearAllTileTasksAndCache]);

  // Trigger tile visibility update on zoom/pan changes too
  useEffect(() => {
    if (isAudienceViewer || template !== 'pdf') return;
    const scrollTarget = scrollContainerRef?.current || containerRef.current?.closest('main');
    const timer = window.setTimeout(() => {
      scrollTarget?.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    }, 35);
    return () => window.clearTimeout(timer);
  }, [activeZoomScale, activePanOffset.x, activePanOffset.y, isAudienceViewer, template, scrollContainerRef]);

  // Free all decoded PDF resources when CanvasStage unmounts
  useEffect(() => {
    return () => {
      clearAllTileTasksAndCache();
    };
  }, [clearAllTileTasksAndCache]);

  // Touch pinch tracking refs for invariant center zooming
  const pinchInitialDistRef = useRef<number | null>(null);
  const pinchInitialScaleRef = useRef<number>(1);
  const pinchFocalStageRef = useRef<{ x: number; y: number } | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const isStylusDownRef = useRef<boolean>(false);
  const activeSmartStylusPointerIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  // Active Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<StrokePoint[]>([]);

  // Active Shape Drag State
  const [shapeDragStart, setShapeDragStart] = useState<{ x: number; y: number } | null>(null);
  const [shapeDragCurrent, setShapeDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Active Geometric Angle Tool State
  const [angleStep, setAngleStep] = useState<
    'idle' | 'circle_drag' | 'ray1_drag' | 'ray2_drag' | 'sector_select'
  >('idle');
  const [angleCenter, setAngleCenter] = useState<{ x: number; y: number } | null>(null);
  const [angleRadius, setAngleRadius] = useState<number>(80);
  const [angleRay1, setAngleRay1] = useState<number>(0);
  const [angleRay2, setAngleRay2] = useState<number>(Math.PI / 3);

  // Active Desmos Marquee Stretch
  const [graphDragStart, setGraphDragStart] = useState<{ x: number; y: number } | null>(null);
  const [graphDragCurrent, setGraphDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Active Dictate Box Drag
  const [dictateDragStart, setDictateDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dictateDragCurrent, setDictateDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Active Eraser Selection Box
  const [eraserSelectStart, setEraserSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [eraserSelectCurrent, setEraserSelectCurrent] = useState<{ x: number; y: number } | null>(null);

  // Eraser Prompt & Circle Eraser cursor state
  const [eraserPromptPos, setEraserPromptPos] = useState<{ x: number; y: number } | null>(null);
  const [eraserCirclePos, setEraserCirclePos] = useState<{ x: number; y: number } | null>(null);
  const lastScrubPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastCircleErasePosRef = useRef<{ x: number; y: number } | null>(null);
  const isCircleErasingRef = useRef<boolean>(false);
  const hasGhostedInCurrentGestureRef = useRef<boolean>(false);

  // Live in-progress overlay streaming throttling refs
  const liveOverlayThrottleRef = useRef<number>(0);
  const liveOverlayTimerRef = useRef<number | null>(null);
  const lastLiveOverlaySentNonNullRef = useRef<boolean>(false);

  // Touch Controls toolbar state ('pointer' | 'zoom' | 'pan')
  const [leftToolbarTool, setLeftToolbarTool] = useState<LeftToolbarTool>('pointer');
  const [stylusZoomAnchor, setStylusZoomAnchor] = useState<{
    clientX: number;
    clientY: number;
    stageX: number;
    stageY: number;
    initialScale: number;
  } | null>(null);
  const [stylusPanStart, setStylusPanStart] = useState<{
    clientX: number;
    clientY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  // Selection / Magic Grab State
  const [grabSelection, setGrabSelection] = useState<GrabbedSelection | null>(null);
  const grabBoxRef = useRef<HTMLDivElement>(null);
  const [isMagicJoystickOpen, setIsMagicJoystickOpen] = useState(false);
  const [isDraggingMagicJoystick, setIsDraggingMagicJoystick] = useState(false);
  const [magicGroupRotation, setMagicGroupRotation] = useState(0);
  const magicPivotRef = useRef<{ x: number; y: number } | null>(null);
  const lastDictateTapRef = useRef<{ id: string; time: number; x: number; y: number } | null>(null);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoCurrent, setLassoCurrent] = useState<{ x: number; y: number } | null>(null);

  // Picture Copy Crop & Place State
  const [photoCropStart, setPhotoCropStart] = useState<{ x: number; y: number } | null>(null);
  const [photoCropCurrent, setPhotoCropCurrent] = useState<{ x: number; y: number } | null>(null);
  const [photoCropClientStart, setPhotoCropClientStart] = useState<{ x: number; y: number } | null>(null);
  const [photoCropClientCurrent, setPhotoCropClientCurrent] = useState<{ x: number; y: number } | null>(null);
  const [pendingPhotoSnippet, setPendingPhotoSnippet] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  // Active selected interactive item
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [selectedCalcId, setSelectedCalcId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedGridShapeId, setSelectedGridShapeId] = useState<string | null>(null);

  // Filter items for current page (memoized to prevent downstream re-render loops)
  const pageStrokes = useMemo(
    () => strokes.filter((s) => s.pageId === pageId),
    [strokes, pageId]
  );
  const pageShapes = useMemo(
    () => shapes.filter((sh) => sh.pageId === pageId),
    [shapes, pageId]
  );
  const pageGraphs = useMemo(
    () => graphs.filter((g) => g.pageId === pageId),
    [graphs, pageId]
  );
  const pageCalculators = useMemo(
    () => calculators.filter((c) => c.pageId === pageId),
    [calculators, pageId]
  );
  const pageImages = useMemo(
    () => images.filter((img) => img.pageId === pageId),
    [images, pageId]
  );
  const pageDictatedTextBoxes = useMemo(
    () => dictatedTextBoxes.filter((b) => b.pageId === pageId),
    [dictatedTextBoxes, pageId]
  );

  const ghostedStrokes = useMemo(
    () => pageStrokes.filter((s) => s.isGhosted),
    [pageStrokes]
  );
  const ghostedShapes = useMemo(
    () => pageShapes.filter((sh) => sh.isGhosted),
    [pageShapes]
  );
  const ghostedDictatedBoxes = useMemo(
    () => pageDictatedTextBoxes.filter((b) => b.isGhosted),
    [pageDictatedTextBoxes]
  );
  const ghostedCount =
    ghostedStrokes.length + ghostedShapes.length + ghostedDictatedBoxes.length;

  const isNavToolOverride =
    touchInputMode === 'stylus_and_hand' && leftToolbarTool !== 'pointer';
  const isAnyEraseActive =
    !isAudienceViewer &&
    !isNavToolOverride &&
    ((mode === 'drawing' && penType === 'eraser') ||
      (mode === 'geometric' && isGeometricEraserActive) ||
      (mode === 'dictate' && isDictateEraserActive) ||
      (mode === 'edit' && !isMagicGrabActive && !isPictureCopyActive));
  const isCircleEraseActive = isAnyEraseActive && eraserType === 'circle';

  // Reset Magic Grab rotation state when grabSelection closes
  useEffect(() => {
    if (!grabSelection) {
      setIsMagicJoystickOpen(false);
      setIsDraggingMagicJoystick(false);
      setMagicGroupRotation(0);
      magicPivotRef.current = null;
    }
  }, [grabSelection]);

  // Sync activeSelectionProp into grabSelection when updated externally (e.g. paste newly selected items)
  useEffect(() => {
    if (activeSelectionProp !== undefined) {
      setGrabSelection((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(activeSelectionProp)) return prev;
        return activeSelectionProp;
      });
    }
  }, [activeSelectionProp]);

  // Clean interaction state when switching modes or pages
  useEffect(() => {
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    activePointerIdRef.current = null;
    isStylusDownRef.current = false;
    activeSmartStylusPointerIdRef.current = null;
    setIsDrawing(false);
    setCurrentPoints([]);
    setShapeDragStart(null);
    setShapeDragCurrent(null);
    setGraphDragStart(null);
    setGraphDragCurrent(null);
    setDictateDragStart(null);
    setDictateDragCurrent(null);
    setEraserSelectStart(null);
    setEraserSelectCurrent(null);
    setEraserPromptPos(null);
    setEraserCirclePos(null);
    isCircleErasingRef.current = false;
    lastCircleErasePosRef.current = null;
    hasGhostedInCurrentGestureRef.current = false;
    setLassoStart(null);
    setLassoCurrent(null);
    setPhotoCropStart(null);
    setPhotoCropCurrent(null);
    setPhotoCropClientStart(null);
    setPhotoCropClientCurrent(null);
    setAngleStep('idle');
    setAngleCenter(null);
  }, [mode, pageId]);

  // Safety reset if a pointer lifts or cancels outside the canvas layer
  useEffect(() => {
    const resetStuckPointer = (ev: PointerEvent) => {
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
        isStylusDownRef.current = false;
      }
      if (activePointerIdRef.current === ev.pointerId && ev.pointerType === 'pen') {
        isStylusDownRef.current = false;
      }
    };
    window.addEventListener('pointerup', resetStuckPointer, { passive: true });
    window.addEventListener('pointercancel', resetStuckPointer, { passive: true });
    return () => {
      window.removeEventListener('pointerup', resetStuckPointer);
      window.removeEventListener('pointercancel', resetStuckPointer);
    };
  }, []);

  useEffect(() => {
    if (ghostedCount === 0) {
      setEraserPromptPos(null);
    }
  }, [ghostedCount]);

  useEffect(() => {
    if (!isCircleEraseActive) {
      setEraserCirclePos(null);
      isCircleErasingRef.current = false;
      lastCircleErasePosRef.current = null;
    }
  }, [isCircleEraseActive]);

  // Throttled live in-progress overlay streaming to Audience Viewer tab
  useEffect(() => {
    if (isAudienceViewer || !onLiveOverlayChange) return;

    const hasStroke =
      isDrawing && mode === 'drawing' && penType !== 'eraser' && currentPoints.length > 1;
    const hasShape =
      mode === 'geometric' && shapeType !== 'angle' && !!shapeDragStart && !!shapeDragCurrent;
    const hasGraph = mode === 'graphing' && !!graphDragStart && !!graphDragCurrent;
    const hasAngle =
      mode === 'geometric' && shapeType === 'angle' && angleStep !== 'idle' && !!angleCenter;
    const hasDictatePreview =
      mode === 'dictate' && !!dictateDragStart && !!dictateDragCurrent;

    if (!hasStroke && !hasShape && !hasGraph && !hasAngle && !hasDictatePreview) {
      if (liveOverlayTimerRef.current) {
        window.clearTimeout(liveOverlayTimerRef.current);
        liveOverlayTimerRef.current = null;
      }
      if (lastLiveOverlaySentNonNullRef.current) {
        lastLiveOverlaySentNonNullRef.current = false;
        liveOverlayThrottleRef.current = Date.now();
        onLiveOverlayChange(null);
      }
      return;
    }

    const payload: LiveCanvasOverlay = {
      stroke: hasStroke
        ? {
            pageId,
            tool: penType,
            color: currentColor,
            width: strokeWidth,
            opacity: penType === 'highlighter' ? 0.35 : 1,
            points: currentPoints,
          }
        : null,
      shape:
        hasShape && shapeDragStart && shapeDragCurrent
          ? {
              pageId,
              shapeType,
              start: shapeDragStart,
              current: shapeDragCurrent,
              strokeColor: currentColor,
              strokeWidth: shapeStrokeWidth,
              strokeStyle: shapeStyle,
              fill: shapeFill,
              fillOpacity: shapeFill ? Math.max(0, Math.min(100, shapeFillOpacity)) : 0,
            }
          : null,
      graphMarquee:
        hasGraph && graphDragStart && graphDragCurrent
          ? {
              pageId,
              start: graphDragStart,
              current: graphDragCurrent,
            }
          : null,
      angle:
        hasAngle && angleCenter
          ? {
              pageId,
              step: angleStep,
              center: angleCenter,
              radius: angleRadius,
              ray1: angleRay1,
              ray2: angleRay2,
              unit: angleUnit,
              allowNegativeAngles,
              negativeDirection: angleNegativeDirection,
            }
          : null,
      dictatePreview:
        hasDictatePreview && dictateDragStart && dictateDragCurrent
          ? {
              pageId,
              subMode: dictateSubMode,
              start: dictateDragStart,
              current: dictateDragCurrent,
              constantFontSize: constantDictateFontSize,
            }
          : null,
    };

    const elapsed = Date.now() - liveOverlayThrottleRef.current;
    if (elapsed >= 32) {
      if (liveOverlayTimerRef.current) {
        window.clearTimeout(liveOverlayTimerRef.current);
        liveOverlayTimerRef.current = null;
      }
      liveOverlayThrottleRef.current = Date.now();
      lastLiveOverlaySentNonNullRef.current = true;
      onLiveOverlayChange(payload);
    } else {
      if (liveOverlayTimerRef.current) {
        window.clearTimeout(liveOverlayTimerRef.current);
      }
      liveOverlayTimerRef.current = window.setTimeout(() => {
        liveOverlayTimerRef.current = null;
        liveOverlayThrottleRef.current = Date.now();
        lastLiveOverlaySentNonNullRef.current = true;
        onLiveOverlayChange(payload);
      }, Math.max(8, 32 - elapsed));
    }
  }, [
    isAudienceViewer,
    onLiveOverlayChange,
    pageId,
    mode,
    penType,
    isDrawing,
    currentPoints,
    currentColor,
    strokeWidth,
    shapeType,
    shapeDragStart,
    shapeDragCurrent,
    shapeStrokeWidth,
    shapeStyle,
    shapeFill,
    shapeFillOpacity,
    graphDragStart,
    graphDragCurrent,
    dictateSubMode,
    dictateDragStart,
    dictateDragCurrent,
    constantDictateFontSize,
    angleStep,
    angleCenter,
    angleRadius,
    angleRay1,
    angleRay2,
    angleUnit,
    allowNegativeAngles,
    angleNegativeDirection,
  ]);

  useEffect(() => {
    return () => {
      if (liveOverlayTimerRef.current) {
        window.clearTimeout(liveOverlayTimerRef.current);
      }
    };
  }, []);

  // Notify parent of selection changes with change guard & active-page gate to prevent infinite re-renders
  const lastReportedSelRef = useRef<string>('');
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (isAudienceViewer || !isActivePage || !onSelectionChangeRef.current) return;

    let selPayload = {
      strokeIds: [] as string[],
      shapeIds: [] as string[],
      graphIds: [] as string[],
      calcIds: [] as string[],
      imageIds: [] as string[],
      dictateIds: [] as string[],
    };

    if (grabSelection) {
      selPayload = {
        strokeIds: grabSelection.strokeIds,
        shapeIds: grabSelection.shapeIds,
        graphIds: grabSelection.graphIds,
        calcIds: grabSelection.calculatorIds || [],
        imageIds: grabSelection.imageIds || [],
        dictateIds: grabSelection.dictateIds || [],
      };
    } else if (selectedGraphId) {
      selPayload.graphIds = [selectedGraphId];
    } else if (selectedCalcId) {
      selPayload.calcIds = [selectedCalcId];
    } else if (selectedImageId) {
      selPayload.imageIds = [selectedImageId];
    } else if (selectedGridShapeId) {
      selPayload.shapeIds = [selectedGridShapeId];
    } else if (selectedDictateBoxId) {
      selPayload.dictateIds = [selectedDictateBoxId];
    }

    const key = JSON.stringify(selPayload);
    if (lastReportedSelRef.current !== key) {
      lastReportedSelRef.current = key;
      onSelectionChangeRef.current(selPayload);
    }
  }, [
    grabSelection,
    selectedGraphId,
    selectedCalcId,
    selectedImageId,
    selectedGridShapeId,
    selectedDictateBoxId,
    isAudienceViewer,
    isActivePage,
  ]);

  // Calculate coordinates on the stage, accurately accounting for zoom scale and pan offset
  const getStageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const el = interactionLayerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const internalWidth = el.clientWidth || 1000;
      const internalHeight = el.clientHeight || 1400;

      return {
        x: ((clientX - rect.left) / rect.width) * internalWidth,
        y: ((clientY - rect.top) / rect.height) * internalHeight,
      };
    },
    []
  );

  // Two-Finger Pinch & Stretch to Zoom: Centers zooming exactly on finger midpoint
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isAudienceViewer) return;

    const getActiveFingerTouches = (touches: TouchList): Touch[] => {
      const list = Array.from(touches);
      if (touchInputMode === 'two_finger_stylus') {
        const hasStylusTouch = list.some(
          (t) => (t as Touch & { touchType?: string }).touchType === 'stylus'
        );
        if (hasStylusTouch) {
          return list.filter(
            (t) => (t as Touch & { touchType?: string }).touchType !== 'stylus'
          );
        }
        if (stylusConfig.detectionMode === 'smart_tip') {
          const maxR = (stylusConfig.maxTipSizePx ?? 14) / 2;
          return list.filter((t) => {
            const rx = t.radiusX || 0;
            const ry = t.radiusY || 0;
            if (rx > 0 && ry > 0 && Math.max(rx, ry) <= maxR) {
              return false;
            }
            return true;
          });
        }
        const hasTouchTypeApi = list.some(
          (t) => typeof (t as Touch & { touchType?: string }).touchType === 'string'
        );
        if (hasTouchTypeApi) {
          return list.filter(
            (t) => (t as Touch & { touchType?: string }).touchType !== 'stylus'
          );
        }
        return isStylusDownRef.current ? [] : list;
      }
      return list;
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Let Desmos boxes and Scientific Calculators handle their own internal pinch/touch gestures
      if ((e.target as HTMLElement)?.closest?.('.desmos-box, .calculator-box')) {
        return;
      }

      // In stylus_only or stylus_and_hand mode, all two-finger canvas touch controls are disabled
      if (touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand') {
        return;
      }

      const fingerTouches = getActiveFingerTouches(e.touches);
      if (fingerTouches.length >= 2) {
        e.preventDefault();
        isPinchingRef.current = true;

        setIsDrawing(false);
        setCurrentPoints([]);
        setShapeDragStart(null);
        setShapeDragCurrent(null);
        setGraphDragStart(null);
        setGraphDragCurrent(null);
        setAngleStep('idle');
        setAngleCenter(null);
        setEraserSelectStart(null);
        setEraserSelectCurrent(null);
        setLassoStart(null);
        setLassoCurrent(null);
        setPhotoCropStart(null);
        setPhotoCropCurrent(null);
        setPhotoCropClientStart(null);
        setPhotoCropClientCurrent(null);

        const t0 = fingerTouches[0];
        const t1 = fingerTouches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const mid = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
        };

        const rect = container.getBoundingClientRect();
        const focalStageX = (mid.x - rect.left - panOffset.x) / zoomScale;
        const focalStageY = (mid.y - rect.top - panOffset.y) / zoomScale;

        pinchInitialDistRef.current = dist;
        pinchInitialScaleRef.current = zoomScale;
        pinchFocalStageRef.current = { x: focalStageX, y: focalStageY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.desmos-box, .calculator-box')) {
        return;
      }

      if (touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand') {
        return;
      }

      const fingerTouches = getActiveFingerTouches(e.touches);
      if (
        fingerTouches.length >= 2 &&
        isPinchingRef.current &&
        pinchInitialDistRef.current &&
        pinchFocalStageRef.current
      ) {
        e.preventDefault();
        const t0 = fingerTouches[0];
        const t1 = fingerTouches[1];
        const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const currentMid = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
        };

        const factor = currentDist / pinchInitialDistRef.current;
        const newScale = Math.max(0.6, Math.min(3.5, pinchInitialScaleRef.current * factor));

        const rect = container.getBoundingClientRect();
        const newPanX = currentMid.x - rect.left - pinchFocalStageRef.current.x * newScale;
        const newPanY = currentMid.y - rect.top - pinchFocalStageRef.current.y * newScale;

        setZoomScale(newScale);
        setPanOffset({
          x: newPanX,
          y: newPanY,
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const fingerTouches = getActiveFingerTouches(e.touches);
      if (fingerTouches.length < 2) {
        isPinchingRef.current = false;
        pinchInitialDistRef.current = null;
        pinchFocalStageRef.current = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const stageX = (cursorX - panOffset.x) / zoomScale;
        const stageY = (cursorY - panOffset.y) / zoomScale;

        const delta = -e.deltaY * 0.005;
        const newScale = Math.max(0.6, Math.min(3.5, zoomScale + delta));

        const newPanX = cursorX - stageX * newScale;
        const newPanY = cursorY - stageY * newScale;

        setZoomScale(newScale);
        setPanOffset({ x: newPanX, y: newPanY });
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [mode, zoomScale, panOffset, touchInputMode, stylusConfig, isAudienceViewer]);

  // Picture Copy: Capture real pixel-exact screenshot of cropped canvas region with robust native 2D composite fallback
  const captureSquareSnippet = async (
    clientX1: number,
    clientY1: number,
    clientX2: number,
    clientY2: number
  ): Promise<string> => {
    const container = containerRef.current;
    if (!container) return '';

    const rect = container.getBoundingClientRect();
    const screenLeft = Math.min(clientX1, clientX2);
    const screenTop = Math.min(clientY1, clientY2);
    const screenW = Math.max(20, Math.abs(clientX2 - clientX1));
    const screenH = Math.max(20, Math.abs(clientY2 - clientY1));

    const stageCropLeft = (screenLeft - rect.left - activePanOffset.x) / activeZoomScale;
    const stageCropTop = (screenTop - rect.top - activePanOffset.y) / activeZoomScale;
    const stageCropW = screenW / activeZoomScale;
    const stageCropH = screenH / activeZoomScale;

    let dataUrl = '';
    try {
      await document.fonts?.ready?.catch(() => {});
      const cropX = screenLeft - rect.left;
      const cropY = screenTop - rect.top;
      const canvas = await html2canvas(container, {
        x: cropX,
        y: cropY,
        width: screenW,
        height: screenH,
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc, clonedEl) => {
          sanitizeClonedDocumentForHtml2Canvas(clonedDoc, container, clonedEl, {});
        },
        ignoreElements: (el) => {
          return (
            el.classList.contains('drawing-layer') ||
            el.classList.contains('crop-preview-box') ||
            el.classList.contains('presenter-overlay') ||
            el.classList.contains('floating-zoom') ||
            el.classList.contains('banner-prompt')
          );
        },
      });
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      dataUrl = '';
    }

    // If html2canvas failed or yielded empty blank, compose pure native 2D canvas with all layers
    if (!dataUrl || dataUrl.length < 500) {
      const offscreen = document.createElement('canvas');
      const pixelRatio = 2;
      offscreen.width = Math.round(screenW * pixelRatio);
      offscreen.height = Math.round(screenH * pixelRatio);
      const ctx = offscreen.getContext('2d');
      if (!ctx) return '';

      ctx.scale(pixelRatio, pixelRatio);

      // 1. White paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, screenW, screenH);

      // Grid / graph pattern if paper is grid or graph
      if (template === 'grid' || template === 'graph') {
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        const gridSize = 24 * activeZoomScale;
        const startX = (-(stageCropLeft * activeZoomScale) % gridSize + gridSize) % gridSize;
        const startY = (-(stageCropTop * activeZoomScale) % gridSize + gridSize) % gridSize;
        for (let gx = startX; gx < screenW; gx += gridSize) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, screenH);
          ctx.stroke();
        }
        for (let gy = startY; gy < screenH; gy += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(screenW, gy);
          ctx.stroke();
        }
      }

      // 2. Draw PDF background image if present (resolving lazy PDF source when needed)
      if (template === 'pdf') {
        const resolvedPdfSrc = await resolvePdfPageDataUrl(pageDescRef.current);
        if (resolvedPdfSrc) {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const pdfW = pdfWidth || rect.width;
              const pdfH = pdfHeight || rect.height;
              const pdfDrawX = -stageCropLeft * activeZoomScale;
              const pdfDrawY = -stageCropTop * activeZoomScale;
              const pdfDrawW = pdfW * activeZoomScale;
              const pdfDrawH = pdfH * activeZoomScale;
              ctx.drawImage(img, pdfDrawX, pdfDrawY, pdfDrawW, pdfDrawH);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = resolvedPdfSrc;
          });
        }
      }

      // 3. Draw Placed Images that intersect crop
      for (const pImg of pageImages) {
        if (
          pImg.x + pImg.width >= stageCropLeft &&
          pImg.x <= stageCropLeft + stageCropW &&
          pImg.y + pImg.height >= stageCropTop &&
          pImg.y <= stageCropTop + stageCropH
        ) {
          await new Promise<void>((resolve) => {
            const imgEl = new Image();
            imgEl.crossOrigin = 'anonymous';
            imgEl.onload = () => {
              const dx = (pImg.x - stageCropLeft) * activeZoomScale;
              const dy = (pImg.y - stageCropTop) * activeZoomScale;
              const dw = pImg.width * activeZoomScale;
              const dh = pImg.height * activeZoomScale;
              ctx.drawImage(imgEl, dx, dy, dw, dh);
              resolve();
            };
            imgEl.onerror = () => resolve();
            imgEl.src = pImg.dataUrl;
          });
        }
      }

      // 4. Draw Geometric Shapes
      for (const sh of pageShapes) {
        if (sh.isGhosted || sh.type === 'grid') continue;
        ctx.save();
        ctx.strokeStyle = sh.strokeColor || '#000000';
        ctx.lineWidth = (sh.strokeWidth || 2) * activeZoomScale;
        if (sh.strokeStyle === 'dashed') ctx.setLineDash([8 * activeZoomScale, 6 * activeZoomScale]);
        if (sh.strokeStyle === 'dotted') ctx.setLineDash([3 * activeZoomScale, 4 * activeZoomScale]);

        const sx = (sh.x - stageCropLeft) * activeZoomScale;
        const sy = (sh.y - stageCropTop) * activeZoomScale;
        const sw = sh.width * activeZoomScale;
        const shh = sh.height * activeZoomScale;

        if (sh.type === 'rect' || sh.type === 'rounded_rect') {
          if (sh.fillColor && sh.fillColor !== 'transparent') {
            ctx.fillStyle = sh.fillColor;
            ctx.fillRect(sx, sy, sw, shh);
          }
          ctx.strokeRect(sx, sy, sw, shh);
        } else if (sh.type === 'circle') {
          ctx.beginPath();
          ctx.ellipse(sx + sw / 2, sy + shh / 2, Math.abs(sw / 2), Math.abs(shh / 2), 0, 0, 2 * Math.PI);
          if (sh.fillColor && sh.fillColor !== 'transparent') {
            ctx.fillStyle = sh.fillColor;
            ctx.fill();
          }
          ctx.stroke();
        } else if (sh.type === 'triangle') {
          ctx.beginPath();
          ctx.moveTo(sx + sw / 2, sy);
          ctx.lineTo(sx + sw, sy + shh);
          ctx.lineTo(sx, sy + shh);
          ctx.closePath();
          if (sh.fillColor && sh.fillColor !== 'transparent') {
            ctx.fillStyle = sh.fillColor;
            ctx.fill();
          }
          ctx.stroke();
        } else if (sh.type === 'polyline' && sh.points && sh.points.length > 0) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(
            (sh.points[0].x - stageCropLeft) * activeZoomScale,
            (sh.points[0].y - stageCropTop) * activeZoomScale
          );
          for (let i = 1; i < sh.points.length; i++) {
            ctx.lineTo(
              (sh.points[i].x - stageCropLeft) * activeZoomScale,
              (sh.points[i].y - stageCropTop) * activeZoomScale
            );
          }
          ctx.stroke();
        } else if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + sw, sy + shh);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 5. Draw Pen Strokes
      for (const strk of pageStrokes) {
        if (strk.isGhosted || !strk.points || strk.points.length < 2) continue;
        ctx.save();
        ctx.strokeStyle = strk.color;
        ctx.lineWidth = strk.width * activeZoomScale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (strk.tool === 'highlighter') {
          ctx.globalAlpha = 0.45;
        }

        ctx.beginPath();
        const p0 = strk.points[0];
        ctx.moveTo((p0.x - stageCropLeft) * activeZoomScale, (p0.y - stageCropTop) * activeZoomScale);
        for (let i = 1; i < strk.points.length; i++) {
          const pPrev = strk.points[i - 1];
          const pCur = strk.points[i];
          const midX = ((pPrev.x + pCur.x) / 2 - stageCropLeft) * activeZoomScale;
          const midY = ((pPrev.y + pCur.y) / 2 - stageCropTop) * activeZoomScale;
          ctx.quadraticCurveTo(
            (pPrev.x - stageCropLeft) * activeZoomScale,
            (pPrev.y - stageCropTop) * activeZoomScale,
            midX,
            midY
          );
        }
        const pLast = strk.points[strk.points.length - 1];
        ctx.lineTo((pLast.x - stageCropLeft) * activeZoomScale, (pLast.y - stageCropTop) * activeZoomScale);
        ctx.stroke();
        ctx.restore();
      }

      dataUrl = offscreen.toDataURL('image/png');
    }

    return dataUrl;
  };

  const trySetPointerCapture = (target: HTMLElement, pointerId: number) => {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Ignore if pointer already inactive or capture unsupported
    }
  };

  const tryReleasePointerCapture = (target: HTMLElement, pointerId: number) => {
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  // Stylus Detection & Palm Rejection Gate (Active Pen vs Smart Tip Passive)
  const isPointerAccepted = (
    e: React.PointerEvent<HTMLDivElement>,
    phase: 'down' | 'move' | 'up'
  ): boolean => {
    if (isAudienceViewer) return false;
    if (touchInputMode === 'two_finger') return true;
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse') return stylusConfig?.allowMouseInput ?? true;
    if (e.pointerType === 'touch') {
      if (stylusConfig?.detectionMode === 'smart_tip') {
        if (phase !== 'down' && activeSmartStylusPointerIdRef.current === e.pointerId) {
          return true;
        }
        if (phase === 'down') {
          const contactSize = Math.max(e.width || 0, e.height || 0);
          const hasPenPressure = e.pressure > 0 && Math.abs(e.pressure - 0.5) > 0.01;
          const maxTip = stylusConfig.maxTipSizePx ?? 14;
          const accepted =
            contactSize <= maxTip || (hasPenPressure && contactSize <= maxTip + 6);
          if (accepted) {
            activeSmartStylusPointerIdRef.current = e.pointerId;
            isStylusDownRef.current = true;
          }
          return accepted;
        }
      }
      return false;
    }
    return false;
  };

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isActivePage && onActivatePage) {
      onActivatePage();
    }
    if (e.pointerType === 'pen') {
      isStylusDownRef.current = true;
      // An explicit hardware stylus contact must never be blocked by a stale pinch flag
      isPinchingRef.current = false;
    }

    if (!isPointerAccepted(e, 'down')) {
      return;
    }

    // TOUCH CONTROLS MODE: Stylus zoom and pan tool overrides
    if (touchInputMode === 'stylus_and_hand') {
      const { x, y } = getStageCoords(e.clientX, e.clientY);
      if (leftToolbarTool === 'zoom') {
        trySetPointerCapture(e.currentTarget, e.pointerId);
        activePointerIdRef.current = e.pointerId;
        setStylusZoomAnchor({
          clientX: e.clientX,
          clientY: e.clientY,
          stageX: x,
          stageY: y,
          initialScale: zoomScale,
        });
        return;
      }
      if (leftToolbarTool === 'pan') {
        trySetPointerCapture(e.currentTarget, e.pointerId);
        activePointerIdRef.current = e.pointerId;
        setStylusPanStart({
          clientX: e.clientX,
          clientY: e.clientY,
          initialPanX: panOffset.x,
          initialPanY: panOffset.y,
        });
        return;
      }
    }

    // Allow drawing, geometric shapes, dictate boxes, and erasers directly on top of other elements!
    if (
      mode !== 'drawing' &&
      mode !== 'geometric' &&
      mode !== 'dictate' &&
      !isAnyEraseActive &&
      (e.target as HTMLElement).closest(
        '.desmos-box, .calculator-box, .picture-box, .interactive-grid-box, .dictated-text-box'
      )
    ) {
      return;
    }
    if (presenterMode === 'laser' || presenterMode === 'spotlight') return;
    if (isPinchingRef.current && e.pointerType !== 'pen') return;

    // Deselect active items when clicking canvas background
    setSelectedGridShapeId(null);
    setSelectedGraphId(null);
    setSelectedCalcId(null);
    setSelectedImageId(null);
    if (editingDictateBoxId) {
      onStopManualEditDictateBox?.();
    }
    if (mode !== 'dictate') {
      onClickOutsideDictateBox?.();
    }

    trySetPointerCapture(e.currentTarget, e.pointerId);
    activePointerIdRef.current = e.pointerId;

    const { x, y } = getStageCoords(e.clientX, e.clientY);
    const pressure = e.pressure || 0.5;

    // PICTURE COPY: Click to place snippet
    if (pendingPhotoSnippet) {
      if (onAddImage) {
        onAddImage({
          id: `img-${Date.now()}`,
          pageId,
          x: Math.max(10, x - pendingPhotoSnippet.width / 2),
          y: Math.max(10, y - pendingPhotoSnippet.height / 2),
          width: pendingPhotoSnippet.width,
          height: pendingPhotoSnippet.height,
          dataUrl: pendingPhotoSnippet.dataUrl,
        });
      }
      setPendingPhotoSnippet(null);
      if (onSetPictureCopyActive) onSetPictureCopyActive(false);
      return;
    }

    // UNIFIED ERASER HANDLER (Drawing Eraser, Edit Eraser, Geometric Eraser, Dictate Eraser)
    if (isAnyEraseActive) {
      if (eraserType === 'select') {
        setEraserSelectStart({ x, y });
        setEraserSelectCurrent({ x, y });
      } else if (eraserType === 'circle') {
        setEraserCirclePos({ x, y });
        isCircleErasingRef.current = true;
        lastCircleErasePosRef.current = { x, y };
        if (onCircleEraseSweep) {
          const modified = onCircleEraseSweep(null, { x, y }, eraserSize / 2);
          if (modified) {
            hasGhostedInCurrentGestureRef.current = true;
            lastScrubPosRef.current = {
              x: Math.min(window.innerWidth - 140, Math.max(140, e.clientX)),
              y: Math.max(80, e.clientY - eraserSize / 2 - 12),
            };
          }
        }
      } else {
        scrubEraseAt(x, y, e.clientX, e.clientY);
      }
      return;
    }

    // CALCULATOR MODE
    if (mode === 'calculator') {
      const newCalc: CalculatorBox = {
        id: `calc-${Date.now()}`,
        x: Math.max(20, x - CALC_BASE_WIDTH / 2),
        y: Math.max(20, y - 100),
        scale: 1,
        pageId,
        expression: '',
        result: '0',
        history: [],
        isRad: false,
        angleMode: 'DEG',
      };
      onAddCalculator(newCalc);
      setSelectedCalcId(newCalc.id);
      return;
    }

    // DRAWING MODE
    if (mode === 'drawing') {
      // If a previous stroke's pointerup was missed by the browser, commit it before starting the new word/stroke
      if (isDrawingRef.current && currentPointsRef.current.length > 0) {
        onAddStroke({
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pageId,
          tool: penType,
          color: currentColor,
          width: strokeWidth,
          opacity: penType === 'highlighter' ? 0.35 : 1,
          points: currentPointsRef.current,
        });
      }
      const initialPts: StrokePoint[] = [{ x, y, pressure }];
      isDrawingRef.current = true;
      currentPointsRef.current = initialPts;
      setIsDrawing(true);
      setCurrentPoints(initialPts);
      onColorUsed(currentColor);
      return;
    }

    // GRAPHING MODE
    if (mode === 'graphing') {
      setGraphDragStart({ x, y });
      setGraphDragCurrent({ x, y });
      return;
    }

    // GEOMETRIC MODE
    if (mode === 'geometric') {
      if (shapeType === 'angle') {
        if (angleStep === 'idle') {
          setAngleCenter({ x, y });
          setAngleRadius(40);
          setAngleRay1(-Math.PI / 4);
          setAngleStep('circle_drag');
          return;
        }
        if (angleStep === 'ray1_drag' && angleCenter) {
          setAngleRay1(Math.atan2(y - angleCenter.y, x - angleCenter.x));
          return;
        }
        if (angleStep === 'ray2_drag' && angleCenter) {
          setAngleRay2(Math.atan2(y - angleCenter.y, x - angleCenter.x));
          return;
        }
        return;
      }
      setShapeDragStart({ x, y });
      setShapeDragCurrent({ x, y });
      onColorUsed(currentColor);
      return;
    }

    // DICTATE MODE
    if (mode === 'dictate') {
      setDictateDragStart({ x, y });
      setDictateDragCurrent({ x, y });
      return;
    }

    // EDIT MODE
    if (mode === 'edit') {
      if (isPictureCopyActive) {
        setPhotoCropStart({ x, y });
        setPhotoCropCurrent({ x, y });
        setPhotoCropClientStart({ x: e.clientX, y: e.clientY });
        setPhotoCropClientCurrent({ x: e.clientX, y: e.clientY });
        return;
      }

      if (isMagicGrabActive) {
        setLassoStart({ x, y });
        setLassoCurrent({ x, y });
      }
    }
  };

  // Helper for line distance hit-testing
  const distToSegment = (
    p: { x: number; y: number },
    v: { x: number; y: number },
    w: { x: number; y: number }
  ) => {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerAccepted(e, 'move')) {
      return;
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    if (isPinchingRef.current && e.pointerType !== 'pen') return;

    // TOUCH CONTROLS MODE: Dynamic Stylus Zoom and Pan
    if (touchInputMode === 'stylus_and_hand') {
      let isCapturedOrPressed = e.buttons > 0;
      try {
        isCapturedOrPressed = isCapturedOrPressed || e.currentTarget.hasPointerCapture(e.pointerId);
      } catch {
        // Ignore capture query errors
      }

      if (leftToolbarTool === 'zoom' && stylusZoomAnchor && isCapturedOrPressed) {
        const dx = e.clientX - stylusZoomAnchor.clientX;
        const dist = Math.hypot(
          e.clientX - stylusZoomAnchor.clientX,
          e.clientY - stylusZoomAnchor.clientY
        );
        const horizontalFactor = dx * 0.008;
        const distFactor = dist > 15 ? (dist - 15) * 0.004 : 0;
        const newScale = Math.max(
          0.4,
          Math.min(4.0, stylusZoomAnchor.initialScale + horizontalFactor + distFactor)
        );

        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const focalClientX = stylusZoomAnchor.clientX - rect.left;
          const focalClientY = stylusZoomAnchor.clientY - rect.top;
          setPanOffset({
            x: focalClientX - stylusZoomAnchor.stageX * newScale,
            y: focalClientY - stylusZoomAnchor.stageY * newScale,
          });
        }
        setZoomScale(newScale);
        return;
      }
      if (leftToolbarTool === 'pan' && stylusPanStart && isCapturedOrPressed) {
        const dx = e.clientX - stylusPanStart.clientX;
        const dy = e.clientY - stylusPanStart.clientY;
        setPanOffset({
          x: stylusPanStart.initialPanX + dx,
          y: stylusPanStart.initialPanY + dy,
        });
        return;
      }
    }

    const { x, y } = getStageCoords(e.clientX, e.clientY);
    const pressure = e.pressure || 0.5;

    if (isCircleEraseActive) {
      setEraserCirclePos({ x, y });
      if (e.pointerType === 'mouse' && e.buttons === 0 && isCircleErasingRef.current) {
        isCircleErasingRef.current = false;
        lastCircleErasePosRef.current = null;
      }
      if (isCircleErasingRef.current) {
        const modified = onCircleEraseSweep?.(
          lastCircleErasePosRef.current,
          { x, y },
          eraserSize / 2
        );
        lastCircleErasePosRef.current = { x, y };
        if (modified) {
          hasGhostedInCurrentGestureRef.current = true;
          lastScrubPosRef.current = {
            x: Math.min(window.innerWidth - 140, Math.max(140, e.clientX)),
            y: Math.max(80, e.clientY - eraserSize / 2 - 12),
          };
        }
      }
      return;
    }

    if (isAnyEraseActive && !isCircleEraseActive) {
      if (eraserType === 'select' && eraserSelectStart) {
        setEraserSelectCurrent({ x, y });
      } else if (e.buttons === 1) {
        scrubEraseAt(x, y, e.clientX, e.clientY);
      }
      return;
    }

    if (mode === 'drawing') {
      if (isDrawingRef.current) {
        const nativeEv = e.nativeEvent as PointerEvent & {
          getCoalescedEvents?: () => PointerEvent[];
        };
        const coalesced =
          typeof nativeEv.getCoalescedEvents === 'function'
            ? nativeEv.getCoalescedEvents()
            : null;
        if (coalesced && coalesced.length > 0) {
          const nextPts = [...currentPointsRef.current];
          for (let i = 0; i < coalesced.length; i++) {
            const ce = coalesced[i];
            const c = getStageCoords(ce.clientX, ce.clientY);
            nextPts.push({ x: c.x, y: c.y, pressure: ce.pressure || pressure });
          }
          currentPointsRef.current = nextPts;
          setCurrentPoints(nextPts);
        } else {
          const nextPts = [...currentPointsRef.current, { x, y, pressure }];
          currentPointsRef.current = nextPts;
          setCurrentPoints(nextPts);
        }
        return;
      }
    }

    if (mode === 'graphing' && graphDragStart) {
      setGraphDragCurrent({ x, y });
      return;
    }

    if (mode === 'geometric') {
      if (shapeType === 'angle') {
        if (angleStep === 'circle_drag' && angleCenter) {
          const dist = Math.hypot(x - angleCenter.x, y - angleCenter.y);
          setAngleRadius(Math.max(30, dist));
          setAngleRay1(Math.atan2(y - angleCenter.y, x - angleCenter.x));
          return;
        }
        if (angleStep === 'ray1_drag' && angleCenter && e.buttons === 1) {
          setAngleRay1(Math.atan2(y - angleCenter.y, x - angleCenter.x));
          return;
        }
        if (angleStep === 'ray2_drag' && angleCenter && e.buttons === 1) {
          setAngleRay2(Math.atan2(y - angleCenter.y, x - angleCenter.x));
          return;
        }
        return;
      }
      if (shapeDragStart) {
        setShapeDragCurrent({ x, y });
        return;
      }
    }

    if (mode === 'dictate' && dictateDragStart) {
      setDictateDragCurrent({ x, y });
      return;
    }

    if (mode === 'edit') {
      if (isPictureCopyActive && photoCropStart) {
        setPhotoCropCurrent({ x, y });
        setPhotoCropClientCurrent({ x: e.clientX, y: e.clientY });
        return;
      }

      if (isMagicGrabActive && lassoStart) {
        setLassoCurrent({ x, y });
      }
    }
  };

  // Scrub Erase helper
  const scrubEraseAt = (x: number, y: number, clientX?: number, clientY?: number) => {
    const r = eraserSize / 2;
    const ghostedStrokeIds: string[] = [];
    const ghostedShapeIds: string[] = [];
    const ghostedDictateIds: string[] = [];

    pageStrokes.forEach((s) => {
      const hit = s.points.some((p) => Math.hypot(p.x - x, p.y - y) <= r + s.width / 2);
      if (hit) ghostedStrokeIds.push(s.id);
    });

    pageShapes.forEach((sh) => {
      if (sh.type === 'polyline' && sh.points && sh.points.length > 0) {
        const tol = r + (sh.strokeWidth || 2) / 2 + 4;
        let hit = false;
        if (sh.points.length === 1) {
          hit = Math.hypot(sh.points[0].x - x, sh.points[0].y - y) <= tol;
        } else {
          for (let i = 0; i < sh.points.length - 1; i++) {
            if (distToSegment({ x, y }, sh.points[i], sh.points[i + 1]) <= tol) {
              hit = true;
              break;
            }
          }
        }
        if (hit) ghostedShapeIds.push(sh.id);
        return;
      }
      if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') {
        const d = distToSegment(
          { x, y },
          { x: sh.x, y: sh.y },
          { x: sh.x + sh.width, y: sh.y + sh.height }
        );
        if (d <= r + sh.strokeWidth / 2 + 6) {
          ghostedShapeIds.push(sh.id);
        }
        return;
      }
      if (sh.type === 'arc' && sh.centerX !== undefined && sh.centerY !== undefined && sh.radius) {
        const distFromCenter = Math.hypot(x - sh.centerX, y - sh.centerY);
        if (Math.abs(distFromCenter - sh.radius) <= r + sh.strokeWidth / 2 + 12) {
          ghostedShapeIds.push(sh.id);
        }
        return;
      }
      const rx = Math.min(sh.x, sh.x + sh.width);
      const ry = Math.min(sh.y, sh.y + sh.height);
      const rw = Math.abs(sh.width);
      const rh = Math.abs(sh.height);
      if (isPointInRotatedBox(x, y, rx, ry, rw, rh, sh.rotation || 0, r + 4)) {
        ghostedShapeIds.push(sh.id);
      }
    });

    pageDictatedTextBoxes.forEach((box) => {
      if (isPointInRotatedBox(x, y, box.x, box.y, box.width, box.height, box.rotation || 0, r + 4)) {
        ghostedDictateIds.push(box.id);
      }
    });

    if (
      ghostedStrokeIds.length > 0 ||
      ghostedShapeIds.length > 0 ||
      ghostedDictateIds.length > 0
    ) {
      onGhostItems(ghostedStrokeIds, ghostedShapeIds, ghostedDictateIds);
      hasGhostedInCurrentGestureRef.current = true;
      const cx = clientX ?? x;
      const cy = clientY ?? y;
      lastScrubPosRef.current = {
        x: Math.min(window.innerWidth - 140, Math.max(140, cx)),
        y: Math.max(80, cy - 28),
      };
    }
  };

  // Helper to filter items for Magic Grab modes
  const filterItemsByLassoMode = (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    modeFilter: MagicGrabMode
  ) => {
    const selStrokeIds: string[] = [];
    const selShapeIds: string[] = [];
    const selGraphIds: string[] = [];
    const selCalcIds: string[] = [];
    const selImageIds: string[] = [];
    const selDictateIds: string[] = [];

    pageStrokes.forEach((s) => {
      if (!s.points || s.points.length === 0) return;
      const allInside = s.points.every(
        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
      );
      const anyInside = s.points.some(
        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
      );

      if (modeFilter === 'contained') {
        if (allInside) selStrokeIds.push(s.id);
      } else if (modeFilter === 'not_contained') {
        if (!allInside) selStrokeIds.push(s.id);
      } else {
        if (anyInside) selStrokeIds.push(s.id);
      }
    });

    pageShapes.forEach((sh) => {
      if (sh.points && sh.points.length > 0) {
        const allInside = sh.points.every(
          (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
        );
        const anyInside = sh.points.some(
          (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
        );
        if (modeFilter === 'contained') {
          if (allInside) selShapeIds.push(sh.id);
        } else if (modeFilter === 'not_contained') {
          if (!allInside) selShapeIds.push(sh.id);
        } else {
          if (anyInside) selShapeIds.push(sh.id);
        }
        return;
      }

      const { minX: shMinX, maxX: shMaxX, minY: shMinY, maxY: shMaxY } = getRotatedBoxAabb(
        sh.x,
        sh.y,
        sh.width,
        sh.height,
        sh.rotation || 0
      );

      const isFullyContained = shMinX >= minX && shMaxX <= maxX && shMinY >= minY && shMaxY <= maxY;
      const isTouching = !(shMaxX < minX || shMinX > maxX || shMaxY < minY || shMinY > maxY);

      if (modeFilter === 'contained') {
        if (isFullyContained) selShapeIds.push(sh.id);
      } else if (modeFilter === 'not_contained') {
        if (!isFullyContained) selShapeIds.push(sh.id);
      } else {
        if (isTouching) selShapeIds.push(sh.id);
      }
    });

    pageGraphs.forEach((g) => {
      const { minX: gMinX, maxX: gMaxX, minY: gMinY, maxY: gMaxY } = getRotatedBoxAabb(
        g.x,
        g.y,
        g.width,
        g.height,
        g.rotation || 0
      );

      const isFullyContained = gMinX >= minX && gMaxX <= maxX && gMinY >= minY && gMaxY <= maxY;
      const isTouching = !(gMaxX < minX || gMinX > maxX || gMaxY < minY || gMinY > maxY);

      if (modeFilter === 'contained') {
        if (isFullyContained) selGraphIds.push(g.id);
      } else if (modeFilter === 'not_contained') {
        if (!isFullyContained) selGraphIds.push(g.id);
      } else {
        if (isTouching) selGraphIds.push(g.id);
      }
    });

    pageCalculators.forEach((c) => {
      const { minX: cMinX, maxX: cMaxX, minY: cMinY, maxY: cMaxY } = getRotatedBoxAabb(
        c.x,
        c.y,
        CALC_BASE_WIDTH * (c.scale || 1),
        CALC_BASE_HEIGHT * (c.scale || 1),
        c.rotation || 0
      );

      const isFullyContained = cMinX >= minX && cMaxX <= maxX && cMinY >= minY && cMaxY <= maxY;
      const isTouching = !(cMaxX < minX || cMinX > maxX || cMaxY < minY || cMinY > maxY);

      if (modeFilter === 'contained') {
        if (isFullyContained) selCalcIds.push(c.id);
      } else if (modeFilter === 'not_contained') {
        if (!isFullyContained) selCalcIds.push(c.id);
      } else {
        if (isTouching) selCalcIds.push(c.id);
      }
    });

    pageImages.forEach((img) => {
      const { minX: iMinX, maxX: iMaxX, minY: iMinY, maxY: iMaxY } = getRotatedBoxAabb(
        img.x,
        img.y,
        img.width,
        img.height,
        img.rotation || 0
      );

      const isFullyContained = iMinX >= minX && iMaxX <= maxX && iMinY >= minY && iMaxY <= maxY;
      const isTouching = !(iMaxX < minX || iMinX > maxX || iMaxY < minY || iMinY > maxY);

      if (modeFilter === 'contained') {
        if (isFullyContained) selImageIds.push(img.id);
      } else if (modeFilter === 'not_contained') {
        if (!isFullyContained) selImageIds.push(img.id);
      } else {
        if (isTouching) selImageIds.push(img.id);
      }
    });

    pageDictatedTextBoxes.forEach((box) => {
      const { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY } = getRotatedBoxAabb(
        box.x,
        box.y,
        box.width,
        box.height,
        box.rotation || 0
      );

      const isFullyContained = bMinX >= minX && bMaxX <= maxX && bMinY >= minY && bMaxY <= maxY;
      const isTouching = !(bMaxX < minX || bMinX > maxX || bMaxY < minY || bMinY > maxY);

      if (modeFilter === 'contained') {
        if (isFullyContained) selDictateIds.push(box.id);
      } else if (modeFilter === 'not_contained') {
        if (!isFullyContained) selDictateIds.push(box.id);
      } else {
        if (isTouching) selDictateIds.push(box.id);
      }
    });

    return { selStrokeIds, selShapeIds, selGraphIds, selCalcIds, selImageIds, selDictateIds };
  };

  // Pointer Up
  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const accepted = isPointerAccepted(e, 'up');
    if (e.pointerType === 'pen' || activeSmartStylusPointerIdRef.current === e.pointerId) {
      isStylusDownRef.current = false;
      activeSmartStylusPointerIdRef.current = null;
    }

    if (!accepted) {
      return;
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }
    activePointerIdRef.current = null;

    tryReleasePointerCapture(e.currentTarget, e.pointerId);

    if (stylusZoomAnchor) {
      setStylusZoomAnchor(null);
      return;
    }
    if (stylusPanStart) {
      setStylusPanStart(null);
      return;
    }

    if (isPinchingRef.current && e.pointerType !== 'pen') return;

    const { x, y } = getStageCoords(e.clientX, e.clientY);

    // UNIFIED ERASER COMMIT (Drawing, Edit, Geometric, Dictate)
    if (isAnyEraseActive) {
      if (eraserType === 'select' && eraserSelectStart && eraserSelectCurrent) {
        const minX = Math.min(eraserSelectStart.x, eraserSelectCurrent.x);
        const maxX = Math.max(eraserSelectStart.x, eraserSelectCurrent.x);
        const minY = Math.min(eraserSelectStart.y, eraserSelectCurrent.y);
        const maxY = Math.max(eraserSelectStart.y, eraserSelectCurrent.y);

        const ghostedStrokeIds: string[] = [];
        const ghostedShapeIds: string[] = [];
        const ghostedDictateIds: string[] = [];

        pageStrokes.forEach((s) => {
          const inside = s.points.some(
            (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
          );
          if (inside) ghostedStrokeIds.push(s.id);
        });

        pageShapes.forEach((sh) => {
          if (sh.points && sh.points.length > 0) {
            if (
              sh.points.some((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
            ) {
              ghostedShapeIds.push(sh.id);
            }
          } else {
            const aabb = getRotatedBoxAabb(sh.x, sh.y, sh.width, sh.height, sh.rotation || 0);
            const overlaps = !(
              aabb.maxX < minX ||
              aabb.minX > maxX ||
              aabb.maxY < minY ||
              aabb.minY > maxY
            );
            if (overlaps) {
              ghostedShapeIds.push(sh.id);
            }
          }
        });

        pageDictatedTextBoxes.forEach((box) => {
          const aabb = getRotatedBoxAabb(box.x, box.y, box.width, box.height, box.rotation || 0);
          const overlaps = !(
            aabb.maxX < minX ||
            aabb.minX > maxX ||
            aabb.maxY < minY ||
            aabb.minY > maxY
          );
          if (overlaps) {
            ghostedDictateIds.push(box.id);
          }
        });

        if (
          ghostedStrokeIds.length > 0 ||
          ghostedShapeIds.length > 0 ||
          ghostedDictateIds.length > 0
        ) {
          onGhostItems(ghostedStrokeIds, ghostedShapeIds, ghostedDictateIds);
          setEraserPromptPos({ x: e.clientX, y: Math.max(80, e.clientY - 24) });
        }
        setEraserSelectStart(null);
        setEraserSelectCurrent(null);
      } else if (eraserType === 'circle') {
        isCircleErasingRef.current = false;
        lastCircleErasePosRef.current = null;
        if (e.pointerType === 'touch') {
          setEraserCirclePos(null);
        } else {
          setEraserCirclePos({ x, y });
        }
        if (ghostedCount > 0 || hasGhostedInCurrentGestureRef.current) {
          setEraserPromptPos(
            lastScrubPosRef.current || {
              x: Math.min(window.innerWidth - 140, Math.max(140, e.clientX)),
              y: Math.max(80, e.clientY - eraserSize / 2 - 12),
            }
          );
        }
        hasGhostedInCurrentGestureRef.current = false;
      } else if (eraserType === 'scrub') {
        if (ghostedCount > 0 || hasGhostedInCurrentGestureRef.current) {
          setEraserPromptPos(
            lastScrubPosRef.current || {
              x: Math.min(window.innerWidth - 140, Math.max(140, e.clientX)),
              y: Math.max(80, e.clientY - 24),
            }
          );
        }
        hasGhostedInCurrentGestureRef.current = false;
      }
      return;
    }

    // DRAWING COMMIT (reads synchronous ref points so rapid consecutive words never drop early or short strokes)
    if (mode === 'drawing') {
      if (isDrawingRef.current) {
        const pts = [...currentPointsRef.current];
        const lastPt = pts[pts.length - 1];
        if (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) > 0.25) {
          pts.push({ x, y, pressure: e.pressure || 0.5 });
        }
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        setIsDrawing(false);
        setCurrentPoints([]);
        if (pts.length >= 1) {
          onAddStroke({
            id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            pageId,
            tool: penType,
            color: currentColor,
            width: strokeWidth,
            opacity: penType === 'highlighter' ? 0.35 : 1,
            points: pts,
          });
        }
        return;
      }
    }

    // GRAPHING COMMIT
    if (mode === 'graphing' && graphDragStart && graphDragCurrent) {
      const minX = Math.min(graphDragStart.x, graphDragCurrent.x);
      const minY = Math.min(graphDragStart.y, graphDragCurrent.y);
      const rawW = Math.abs(graphDragCurrent.x - graphDragStart.x);
      const rawH = Math.abs(graphDragCurrent.y - graphDragStart.y);

      // Exact drawn marquee dimensions (fallback to 480x360 only on accidental tap)
      const isTinyTap = rawW < 15 && rawH < 15;
      const width = isTinyTap ? 480 : Math.max(24, rawW);
      const height = isTinyTap ? 360 : Math.max(24, rawH);

      // Lock logical Desmos size (>= 460x360) with the exact drawn aspect ratio
      const logicalScaleUp = Math.max(460 / width, 360 / height, 1);
      const baseWidth = width * logicalScaleUp;
      const baseHeight = height * logicalScaleUp;

      const newGraph: DesmosBox = {
        id: `graph-${Date.now()}`,
        pageId,
        x: minX,
        y: minY,
        width,
        height,
        baseWidth,
        baseHeight,
        opacity: 0.95,
        isFormulaOpen: false,
        isSettingsOpen: false,
        showResizeHandles: false,
        expressions: [{ id: '1', latex: 'y = x^2', color: '#2563eb' }],
        settings: {
          showXAxis: true,
          showYAxis: true,
          showGrid: true,
          degreeMode: true,
        },
      };

      onAddGraph(newGraph);
      setSelectedGraphId(newGraph.id);
      setGraphDragStart(null);
      setGraphDragCurrent(null);
      return;
    }

    // GEOMETRIC COMMIT (Grid shape freezes initial cols & rows, then becomes interactive)
    if (mode === 'geometric') {
      if (shapeType === 'angle') {
        if (angleStep === 'circle_drag') {
          setAngleStep('ray1_drag');
          return;
        }
        if (angleStep === 'ray1_drag') {
          setAngleStep('ray2_drag');
          const defaultSpan =
            angleNegativeDirection === 'clockwise' ? -Math.PI / 3 : Math.PI / 3;
          setAngleRay2(angleRay1 + defaultSpan);
          return;
        }
        if (angleStep === 'ray2_drag') {
          setAngleStep('sector_select');
          return;
        }
        return;
      }

      if (shapeDragStart && shapeDragCurrent) {
      const w = shapeDragCurrent.x - shapeDragStart.x;
      const h = shapeDragCurrent.y - shapeDragStart.y;

      if (Math.abs(w) > 5 || Math.abs(h) > 5) {
        const minX = Math.min(shapeDragStart.x, shapeDragCurrent.x);
        const minY = Math.min(shapeDragStart.y, shapeDragCurrent.y);
        const absW = Math.abs(w);
        const absH = Math.abs(h);

        let gridRows: number | undefined = undefined;
        let gridCols: number | undefined = undefined;

        if (shapeType === 'grid') {
          gridCols = Math.max(2, Math.round(absW / 28));
          gridRows = Math.max(2, Math.round(absH / 28));
        }

        const newShape: GeometricShape = {
          id: `shape-${Date.now()}`,
          pageId,
          type: shapeType,
          x: shapeType === 'grid' ? minX : shapeDragStart.x,
          y: shapeType === 'grid' ? minY : shapeDragStart.y,
          width: shapeType === 'grid' ? absW : w,
          height: shapeType === 'grid' ? absH : h,
          strokeColor: currentColor,
          fillColor:
            shapeFill && shapeFillOpacity > 0
              ? hexWithAlphaPercent(currentColor, shapeFillOpacity)
              : 'transparent',
          strokeWidth: shapeStrokeWidth,
          strokeStyle: shapeStyle,
          gridRows,
          gridCols,
        };

        onAddShape(newShape);
        if (shapeType === 'grid') {
          setSelectedGridShapeId(newShape.id);
        }
      }

      setShapeDragStart(null);
      setShapeDragCurrent(null);
      return;
    }
    return;
  }

    // DICTATE COMMIT (or Click Outside Active Box)
    if (mode === 'dictate' && dictateDragStart && dictateDragCurrent) {
      const start = dictateDragStart;
      const current = dictateDragCurrent;
      setDictateDragStart(null);
      setDictateDragCurrent(null);

      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const dist = Math.hypot(dx, dy);

      // Clicking (without dragging) either hits an existing box (select / double-tap edit) or clicks outside
      if (dist < 10) {
        let hitBox: DictatedTextBox | null = null;
        for (let i = pageDictatedTextBoxes.length - 1; i >= 0; i--) {
          const b = pageDictatedTextBoxes[i];
          if (isPointInRotatedBox(start.x, start.y, b.x, b.y, b.width, b.height, b.rotation || 0, 6)) {
            hitBox = b;
            break;
          }
        }
        if (hitBox) {
          const now = Date.now();
          const prevTap = lastDictateTapRef.current;
          if (
            prevTap &&
            prevTap.id === hitBox.id &&
            now - prevTap.time < 380 &&
            Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 28
          ) {
            lastDictateTapRef.current = null;
            onStartManualEditDictateBox?.(hitBox.id);
          } else {
            lastDictateTapRef.current = { id: hitBox.id, time: now, x: e.clientX, y: e.clientY };
            onSelectDictateBoxForTransform?.(hitBox.id);
          }
          return;
        }
        lastDictateTapRef.current = null;
        if (activeDictateBoxId) {
          onClickOutsideDictateBox?.();
        } else if (selectedDictateBoxId) {
          onDeselectDictateBox?.();
        }
        return;
      }

      const id = `dictate-${Date.now()}`;
      if (dictateSubMode === 'height') {
        const fontSize = Math.max(12, Math.round(Math.abs(dy) >= 10 ? Math.abs(dy) : constantDictateFontSize));
        const boxHeight = Math.max(14, Math.round(fontSize * 1.08));
        const topY = Math.min(start.y, current.y);
        onAddDictatedTextBox?.({
          id,
          pageId,
          x: start.x,
          y: topY,
          width: Math.max(140, Math.round(fontSize * 3.5)),
          height: boxHeight,
          fontSize,
          rotation: 0,
          text: '',
          interimText: '',
          color: '#0F172A',
          wrap: false,
          boxMode: 'height',
        });
      } else if (dictateSubMode === 'dimensions') {
        const minX = Math.min(start.x, current.x);
        const minY = Math.min(start.y, current.y);
        const w = Math.max(80, Math.round(Math.abs(dx)));
        const h = Math.max(14, Math.round(Math.abs(dy)));
        const fontSize = Math.max(12, h);
        onAddDictatedTextBox?.({
          id,
          pageId,
          x: minX,
          y: minY,
          width: w,
          height: Math.max(h, Math.round(fontSize * 1.08)),
          fontSize,
          rotation: 0,
          text: '',
          interimText: '',
          color: '#0F172A',
          wrap: true,
          boxMode: 'dimensions',
        });
      } else {
        // constant_font: Horizontal line defines wrap width, top-bar box controls font size
        const fontSize = Math.max(10, Math.round(constantDictateFontSize));
        const minX = Math.min(start.x, current.x);
        const w = Math.max(80, Math.round(Math.abs(dx)));
        const boxHeight = Math.round(fontSize * 1.12);
        onAddDictatedTextBox?.({
          id,
          pageId,
          x: minX,
          y: Math.max(4, Math.round(start.y - fontSize * 0.5)),
          width: w,
          height: boxHeight,
          fontSize,
          rotation: 0,
          text: '',
          interimText: '',
          color: '#0F172A',
          wrap: true,
          boxMode: 'constant_font',
        });
      }
      return;
    }

    // EDIT MODE: PICTURE COPY CROP COMMIT (Real screenshot capture with html2canvas)
    if (
      mode === 'edit' &&
      isPictureCopyActive &&
      photoCropStart &&
      photoCropCurrent &&
      photoCropClientStart &&
      photoCropClientCurrent
    ) {
      const cStartX = photoCropClientStart.x;
      const cStartY = photoCropClientStart.y;
      const cEndX = photoCropClientCurrent.x;
      const cEndY = photoCropClientCurrent.y;

      const minX = Math.min(photoCropStart.x, photoCropCurrent.x);
      const maxX = Math.max(photoCropStart.x, photoCropCurrent.x);
      const minY = Math.min(photoCropStart.y, photoCropCurrent.y);
      const maxY = Math.max(photoCropStart.y, photoCropCurrent.y);
      const w = maxX - minX;
      const h = maxY - minY;

      setPhotoCropStart(null);
      setPhotoCropCurrent(null);
      setPhotoCropClientStart(null);
      setPhotoCropClientCurrent(null);

      if (w > 10 && h > 10) {
        const dataUrl = await captureSquareSnippet(cStartX, cStartY, cEndX, cEndY);
        if (dataUrl) {
          setPendingPhotoSnippet({ dataUrl, width: w, height: h });
        }
      }
      return;
    }

    // (Legacy Edit eraser blocks unified above under `if (isAnyEraseActive)`)

    // EDIT MODE: MAGIC GRAB LASSO COMMIT
    if (mode === 'edit' && isMagicGrabActive && lassoStart && lassoCurrent) {
      const minX = Math.min(lassoStart.x, lassoCurrent.x);
      const maxX = Math.max(lassoStart.x, lassoCurrent.x);
      const minY = Math.min(lassoStart.y, lassoCurrent.y);
      const maxY = Math.max(lassoStart.y, lassoCurrent.y);

      setLassoStart(null);
      setLassoCurrent(null);

      const { selStrokeIds, selShapeIds, selGraphIds, selCalcIds, selImageIds, selDictateIds } =
        filterItemsByLassoMode(minX, minY, maxX, maxY, magicGrabMode);

      const hasElements =
        selStrokeIds.length > 0 ||
        selShapeIds.length > 0 ||
        selGraphIds.length > 0 ||
        selCalcIds.length > 0 ||
        selImageIds.length > 0 ||
        selDictateIds.length > 0;

      setMagicGroupRotation(0);
      setIsMagicJoystickOpen(false);
      if (hasElements) {
        setGrabSelection({
          strokeIds: selStrokeIds,
          shapeIds: selShapeIds,
          graphIds: selGraphIds,
          calculatorIds: selCalcIds,
          imageIds: selImageIds,
          dictateIds: selDictateIds,
          bounds: { minX, minY, maxX, maxY },
        });
      } else if (keepEmptyBox) {
        setGrabSelection({
          strokeIds: [],
          shapeIds: [],
          graphIds: [],
          calculatorIds: [],
          imageIds: [],
          dictateIds: [],
          bounds: { minX, minY, maxX, maxY },
        });
      } else {
        setGrabSelection(null);
      }
    }
  };

  // Pointer Cancel (reset stylus / gesture states cleanly on palm rejection or system interruption)
  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen' || activeSmartStylusPointerIdRef.current === e.pointerId) {
      isStylusDownRef.current = false;
      activeSmartStylusPointerIdRef.current = null;
    }
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }
    activePointerIdRef.current = null;
    tryReleasePointerCapture(e.currentTarget, e.pointerId);
    isCircleErasingRef.current = false;
    lastCircleErasePosRef.current = null;
    setEraserCirclePos(null);
    if (hasGhostedInCurrentGestureRef.current) {
      setEraserPromptPos(
        lastScrubPosRef.current || {
          x: Math.min(window.innerWidth - 140, Math.max(140, e.clientX || window.innerWidth / 2)),
          y: Math.max(80, (e.clientY || 120) - 24),
        }
      );
      hasGhostedInCurrentGestureRef.current = false;
    }
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    setStylusZoomAnchor(null);
    setStylusPanStart(null);
    setIsDrawing(false);
    setCurrentPoints([]);
    setShapeDragStart(null);
    setShapeDragCurrent(null);
    setGraphDragStart(null);
    setGraphDragCurrent(null);
    setDictateDragStart(null);
    setDictateDragCurrent(null);
    setEraserSelectStart(null);
    setEraserSelectCurrent(null);
    setLassoStart(null);
    setLassoCurrent(null);
    setPhotoCropStart(null);
    setPhotoCropCurrent(null);
    setPhotoCropClientStart(null);
    setPhotoCropClientCurrent(null);
  };

  // Lost Pointer Capture: if browser drops pointer capture before pointerup, commit active ink stroke cleanly instead of losing it
  const handleLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen' || activeSmartStylusPointerIdRef.current === e.pointerId) {
      isStylusDownRef.current = false;
      activeSmartStylusPointerIdRef.current = null;
    }
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }
    activePointerIdRef.current = null;
    if (mode === 'drawing' && isDrawingRef.current) {
      const pts = [...currentPointsRef.current];
      isDrawingRef.current = false;
      currentPointsRef.current = [];
      setIsDrawing(false);
      setCurrentPoints([]);
      if (pts.length >= 1) {
        onAddStroke({
          id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pageId,
          tool: penType,
          color: currentColor,
          width: strokeWidth,
          opacity: penType === 'highlighter' ? 0.35 : 1,
          points: pts,
        });
      }
    }
  };

  // Magic Grab Compass Handle: Click & Hold 400ms or drag to smoothly move items
  const [isCompassRepositioning, setIsCompassRepositioning] = useState(false);
  const [compassHoldProgress, setCompassHoldProgress] = useState(0);

  const startCompassMove = (startX: number, startY: number) => {
    if (!grabSelection) return;

    let lastStageX = getStageCoords(startX, startY).x;
    let lastStageY = getStageCoords(startX, startY).y;
    let isMoving = false;

    setCompassHoldProgress(0);
    const holdStartTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - holdStartTime;
      const pct = Math.min(100, (elapsed / 400) * 100);
      setCompassHoldProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setIsCompassRepositioning(true);
        isMoving = true;
      }
    }, 30);

    const onMove = (clientX: number, clientY: number) => {
      const curStage = getStageCoords(clientX, clientY);
      const stepDx = curStage.x - lastStageX;
      const stepDy = curStage.y - lastStageY;

      if (!isMoving && Math.hypot(stepDx, stepDy) > 4) {
        isMoving = true;
        setIsCompassRepositioning(true);
        clearInterval(interval);
        setCompassHoldProgress(100);
      }

      if (isMoving && (stepDx !== 0 || stepDy !== 0)) {
        onTransformItems(
          grabSelection.strokeIds,
          grabSelection.shapeIds,
          grabSelection.graphIds,
          grabSelection.calculatorIds || [],
          stepDx,
          stepDy,
          grabSelection.imageIds || [],
          grabSelection.dictateIds || []
        );

        setGrabSelection((prev) =>
          prev
            ? {
                ...prev,
                bounds: {
                  minX: prev.bounds.minX + stepDx,
                  maxX: prev.bounds.maxX + stepDx,
                  minY: prev.bounds.minY + stepDy,
                  maxY: prev.bounds.maxY + stepDy,
                },
              }
            : null
        );

        lastStageX = curStage.x;
        lastStageY = curStage.y;
      }
    };

    const onEnd = () => {
      clearInterval(interval);
      setCompassHoldProgress(0);
      setIsCompassRepositioning(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
      if (onTransformEnd) onTransformEnd();
    };

    const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) onMove(ev.touches[0].clientX, ev.touches[0].clientY);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const handleCompassMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    startCompassMove(e.clientX, e.clientY);
  };

  const handleCompassTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      startCompassMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Complete Geometric Angle Tool: Decompose into 3 independent elements
  // 1. Terminal arm 1 (line, no arrow)
  // 2. Terminal arm 2 (line, no arrow)
  // 3. Angle arc (with degree/radian calculation)
  // User can select or erase any arm or the arc independently!
  const handleCompleteAngle = (chosenSweep: 'acute' | 'obtuse') => {
    if (!angleCenter) return;
    let diff = (angleRay2 - angleRay1) % (2 * Math.PI);
    if (diff < 0) diff += 2 * Math.PI;
    const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
    const obtuseSpan = 2 * Math.PI - acuteSpan;
    const chosenSpan = chosenSweep === 'acute' ? acuteSpan : obtuseSpan;

    // Detect negative angle when Ray 2 is pulled past Ray 1 in the configured negative direction
    let rawDiff = angleRay2 - angleRay1;
    while (rawDiff > Math.PI) rawDiff -= 2 * Math.PI;
    while (rawDiff < -Math.PI) rawDiff += 2 * Math.PI;
    const isNegative =
      allowNegativeAngles &&
      (angleNegativeDirection === 'clockwise' ? rawDiff > 0 : rawDiff < 0);

    let calculatedDeg = Math.round((chosenSpan * 180) / Math.PI);
    if (isNegative && chosenSweep === 'acute') calculatedDeg = -calculatedDeg;

    // 1. Ray 1 (terminal arm 1 - line, no arrow)
    const ray1: GeometricShape = {
      id: `shape-${Date.now()}-ray1`,
      pageId,
      type: 'line',
      x: angleCenter.x,
      y: angleCenter.y,
      width: angleRadius * Math.cos(angleRay1),
      height: angleRadius * Math.sin(angleRay1),
      strokeColor: currentColor,
      strokeWidth: shapeStrokeWidth,
      strokeStyle: shapeStyle,
    };

    // 2. Ray 2 (terminal arm 2 - line, no arrow)
    const ray2: GeometricShape = {
      id: `shape-${Date.now()}-ray2`,
      pageId,
      type: 'line',
      x: angleCenter.x,
      y: angleCenter.y,
      width: angleRadius * Math.cos(angleRay2),
      height: angleRadius * Math.sin(angleRay2),
      strokeColor: currentColor,
      strokeWidth: shapeStrokeWidth,
      strokeStyle: shapeStyle,
    };

    // 3. Arc (angle arc between the arms)
    const arc: GeometricShape = {
      id: `shape-${Date.now()}-arc`,
      pageId,
      type: 'arc',
      x: angleCenter.x - angleRadius,
      y: angleCenter.y - angleRadius,
      width: angleRadius * 2,
      height: angleRadius * 2,
      centerX: angleCenter.x,
      centerY: angleCenter.y,
      radius: angleRadius,
      startAngle: angleRay1,
      endAngle: angleRay2,
      arcSweep: chosenSweep,
      angleDegrees: calculatedDeg,
      strokeColor: currentColor,
      strokeWidth: shapeStrokeWidth,
      strokeStyle: shapeStyle,
      fillColor:
        shapeFill && shapeFillOpacity > 0
          ? hexWithAlphaPercent(currentColor, shapeFillOpacity)
          : undefined,
    };

    onAddShape(ray1);
    onAddShape(ray2);
    onAddShape(arc);

    setAngleStep('idle');
    setAngleCenter(null);
  };

  // Render SVG Geometric Shape (non-grid shapes; grid shapes are rendered via InteractiveGridBox)
  const renderShapeSvg = (sh: GeometricShape) => {
    if (sh.type === 'grid') return null;

    const x = Math.min(sh.x, sh.x + sh.width);
    const y = Math.min(sh.y, sh.y + sh.height);
    const w = Math.abs(sh.width);
    const h = Math.abs(sh.height);

    const strokeColor = sh.isGhosted ? '#EF4444' : sh.strokeColor;
    const strokeDash =
      sh.strokeStyle === 'dashed' ? '8 6' : sh.strokeStyle === 'dotted' ? '3 4' : undefined;
    const opacity = sh.isGhosted ? 0.3 : 1;

    if (sh.type === 'arc') {
      const cx = sh.centerX ?? (sh.x + sh.width / 2);
      const cy = sh.centerY ?? (sh.y + sh.height / 2);
      const r = sh.radius ?? (Math.min(sh.width, sh.height) / 2);
      const a1 = sh.startAngle ?? 0;
      const a2 = sh.endAngle ?? Math.PI / 2;
      const isAcute = sh.arcSweep !== 'obtuse';

      let diff = (a2 - a1) % (2 * Math.PI);
      if (diff < 0) diff += 2 * Math.PI;

      const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
      const obtuseSpan = 2 * Math.PI - acuteSpan;
      const span = isAcute ? acuteSpan : obtuseSpan;
      const deg = sh.angleDegrees ?? Math.round((span * 180) / Math.PI);

      let sweepFlag = diff <= Math.PI ? 1 : 0;
      if (!isAcute) {
        sweepFlag = sweepFlag === 1 ? 0 : 1;
      }
      const largeArcFlag = isAcute ? 0 : 1;

      const startX = cx + r * Math.cos(a1);
      const startY = cy + r * Math.sin(a1);
      const endX = cx + r * Math.cos(a2);
      const endY = cy + r * Math.sin(a2);

      const arcD = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
      const wedgeD = `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY} Z`;

      const midAngle = sweepFlag === 1 ? a1 + span / 2 : a1 - span / 2;
      const badgeR = Math.max(16, r * 0.7);
      const badgeX = cx + badgeR * Math.cos(midAngle);
      const badgeY = cy + badgeR * Math.sin(midAngle);

      return (
        <g key={sh.id} opacity={opacity}>
          {sh.fillColor && <path d={wedgeD} fill={sh.fillColor} />}
          <path
            d={arcD}
            stroke={strokeColor}
            strokeWidth={sh.strokeWidth}
            strokeDasharray={strokeDash}
            fill="none"
            strokeLinecap="round"
          />
          <g transform={`translate(${badgeX}, ${badgeY})`}>
            <rect
              x={-16}
              y={-10}
              width={32}
              height={20}
              rx={6}
              fill="rgba(15, 23, 42, 0.85)"
              stroke={strokeColor}
              strokeWidth={1}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={10}
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              {deg}°
            </text>
          </g>
        </g>
      );
    }

    const shapeCx = x + w / 2;
    const shapeCy = y + h / 2;
    const rotAttr = sh.rotation ? `rotate(${sh.rotation} ${shapeCx} ${shapeCy})` : undefined;

    if (sh.type === 'rect') {
      return (
        <rect
          key={sh.id}
          x={x}
          y={y}
          width={w}
          height={h}
          stroke={strokeColor}
          strokeWidth={sh.strokeWidth}
          strokeDasharray={strokeDash}
          fill={sh.fillColor || 'transparent'}
          opacity={opacity}
          transform={rotAttr}
        />
      );
    }
    if (sh.type === 'rounded_rect') {
      const radius = Math.min(16, w / 4, h / 4);
      return (
        <rect
          key={sh.id}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          stroke={strokeColor}
          strokeWidth={sh.strokeWidth}
          strokeDasharray={strokeDash}
          fill={sh.fillColor || 'transparent'}
          opacity={opacity}
          transform={rotAttr}
        />
      );
    }
    if (sh.type === 'circle') {
      return (
        <ellipse
          key={sh.id}
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          stroke={strokeColor}
          strokeWidth={sh.strokeWidth}
          strokeDasharray={strokeDash}
          fill={sh.fillColor || 'transparent'}
          opacity={opacity}
          transform={rotAttr}
        />
      );
    }
    if (sh.type === 'triangle') {
      const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
      return (
        <polygon
          key={sh.id}
          points={points}
          stroke={strokeColor}
          strokeWidth={sh.strokeWidth}
          strokeDasharray={strokeDash}
          fill={sh.fillColor || 'transparent'}
          opacity={opacity}
          transform={rotAttr}
        />
      );
    }
    if (sh.type === 'polyline' && sh.points && sh.points.length > 0) {
      const d =
        sh.points.length === 1
          ? `M ${sh.points[0].x} ${sh.points[0].y} L ${sh.points[0].x + 0.1} ${sh.points[0].y + 0.1}`
          : sh.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      return (
        <path
          key={sh.id}
          d={d}
          stroke={strokeColor}
          strokeWidth={sh.strokeWidth}
          strokeDasharray={sh.isGhosted ? '4 4' : strokeDash}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      );
    }

    if (sh.type === 'line') {
      return (
        <line
          key={sh.id}
          x1={sh.x}
          y1={sh.y}
          x2={sh.x + sh.width}
          y2={sh.y + sh.height}
          stroke={strokeColor}
          strokeWidth={sh.strokeWidth}
          strokeDasharray={strokeDash}
          opacity={opacity}
        />
      );
    }
    if (sh.type === 'arrow' || sh.type === 'double_arrow') {
      const fromX = sh.x;
      const fromY = sh.y;
      const toX = sh.x + sh.width;
      const toY = sh.y + sh.height;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const headLen = 14;

      return (
        <g key={sh.id} opacity={opacity}>
          <line
            x1={fromX}
            y1={fromY}
            x2={toX}
            y2={toY}
            stroke={strokeColor}
            strokeWidth={sh.strokeWidth}
          />
          <path
            d={`M ${toX} ${toY} L ${toX - headLen * Math.cos(angle - Math.PI / 6)} ${
              toY - headLen * Math.sin(angle - Math.PI / 6)
            } M ${toX} ${toY} L ${toX - headLen * Math.cos(angle + Math.PI / 6)} ${
              toY - headLen * Math.sin(angle + Math.PI / 6)
            }`}
            stroke={strokeColor}
            strokeWidth={sh.strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
          {sh.type === 'double_arrow' && (
            <path
              d={`M ${fromX} ${fromY} L ${fromX + headLen * Math.cos(angle - Math.PI / 6)} ${
                fromY + headLen * Math.sin(angle - Math.PI / 6)
              } M ${fromX} ${fromY} L ${fromX + headLen * Math.cos(angle + Math.PI / 6)} ${
                fromY + headLen * Math.sin(angle + Math.PI / 6)
              }`}
              stroke={strokeColor}
              strokeWidth={sh.strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          )}
        </g>
      );
    }
    return null;
  };

  const isSelectionEmpty =
    grabSelection &&
    grabSelection.strokeIds.length === 0 &&
    grabSelection.shapeIds.length === 0 &&
    grabSelection.graphIds.length === 0 &&
    (grabSelection.calculatorIds || []).length === 0 &&
    (grabSelection.imageIds || []).length === 0 &&
    (grabSelection.dictateIds || []).length === 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-white dark:bg-slate-900 overflow-hidden select-none ${
        isAudienceViewer ? 'pointer-events-none' : ''
      }`}
    >
      {/* PENDING PHOTO SNIPPET BANNER */}
      {pendingPhotoSnippet && isActivePage && (
        <div className="banner-prompt fixed top-20 left-1/2 -translate-x-1/2 z-[10020] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-bounce max-w-[92vw]">
          <Camera className="w-4 h-4 text-indigo-200 shrink-0" />
          <span className="text-xs font-bold tracking-wide truncate">
            Photo snippet ready! Click anywhere on page to place it.
          </span>
          <button
            type="button"
            onClick={() => setPendingPhotoSnippet(null)}
            className="p-1 hover:bg-indigo-700 rounded-full shrink-0"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ANGLE TOOL HELPER BANNER */}
      {angleStep !== 'idle' && isActivePage && (
        <div className="banner-prompt fixed top-20 left-1/2 -translate-x-1/2 z-[10020] bg-blue-600 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in max-w-[92vw]">
          <Compass className="w-4 h-4 text-blue-200 shrink-0" />
          <span className="text-xs font-bold tracking-wide truncate">
            {angleStep === 'circle_drag' && 'Release pointer to lock circle size'}
            {angleStep === 'ray1_drag' && 'Drag blue terminal ray to orient 1st direction, then release'}
            {angleStep === 'ray2_drag' && 'Drag red terminal ray to orient 2nd direction, then release'}
            {angleStep === 'sector_select' && 'Click either the Acute or Obtuse arc button to keep that angle'}
          </span>
          <button
            type="button"
            onClick={() => {
              setAngleStep('idle');
              setAngleCenter(null);
            }}
            className="p-1 hover:bg-blue-700 rounded-full transition-colors shrink-0"
            title="Cancel Angle Tool"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ZOOMABLE & PANNABLE WORKSPACE WRAPPER */}
      <div
        style={{
          transform: `translate(${activePanOffset.x}px, ${activePanOffset.y}px) scale(${activeZoomScale})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
        }}
        className="canvas-zoom-wrapper relative w-full h-full"
      >
        {/* 1. BACKGROUND PAPER / PDF LAYER */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center bg-white">
          {template === 'pdf' && (() => {
            const blurryBaseSrc =
              previewDataUrl ||
              (pdfDataUrl && pdfDataUrl !== '__CACHED__' ? pdfDataUrl : undefined);
            const crispViewerSrc =
              pdfDataUrl && pdfDataUrl !== '__CACHED__' ? pdfDataUrl : undefined;

            return (
              <div
                className="relative w-full h-full overflow-hidden bg-white select-none pointer-events-none"
                style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : undefined }}
              >
                {blurryBaseSrc && (
                  <img
                    src={blurryBaseSrc}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-fill select-none pointer-events-none"
                    style={{ filter: 'blur(5px)', transform: 'scale(1.02)' }}
                  />
                )}

                {isAudienceViewer ? (
                  crispViewerSrc && (
                    <img
                      src={crispViewerSrc}
                      alt="PDF Page"
                      className="relative w-full h-full object-contain select-none pointer-events-none"
                    />
                  )
                ) : (
                  Object.entries(loadedTiles).map(([tileKey, tileEntry]) => {
                    const [cStr, rStr] = tileKey.split(',');
                    const col = Number(cStr);
                    const row = Number(rStr);
                    return (
                      <div
                        key={tileKey}
                        style={{
                          left: `${(col / PDF_TILE_COLS) * 100}%`,
                          top: `${(row / PDF_TILE_ROWS) * 100}%`,
                          width: `${(1 / PDF_TILE_COLS) * 100}%`,
                          height: `${(1 / PDF_TILE_ROWS) * 100}%`,
                        }}
                        className="absolute overflow-hidden pointer-events-none select-none"
                      >
                        <img
                          src={tileEntry.url}
                          alt=""
                          aria-hidden="true"
                          decoding="async"
                          onLoad={() => {
                            setLoadedTiles((prev) =>
                              prev[tileKey] && !prev[tileKey].ready
                                ? { ...prev, [tileKey]: { ...prev[tileKey], ready: true } }
                                : prev
                            );
                          }}
                          className={`w-full h-full object-fill block select-none pointer-events-none transition-opacity duration-150 ${
                            tileEntry.ready ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

          {/* Lined Notebook Paper */}
          {template === 'lined' && (
            <div className="w-full h-full relative">
              <div className="absolute left-24 top-0 bottom-0 w-[1.5px] bg-rose-400 opacity-60 z-0" />
              <div
                className="w-full h-full"
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom, transparent 31px, #93C5FD 32px)',
                  backgroundSize: '100% 32px',
                  opacity: 0.35,
                }}
              />
            </div>
          )}

          {/* Math Graph Paper */}
          {(template === 'grid' || template === 'graph') && (
            <div
              className="w-full h-full"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(59, 130, 246, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.15) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
          )}

          {/* Dotted Paper */}
          {template === 'dotted' && (
            <div
              className="w-full h-full"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(100, 116, 139, 0.3) 1.5px, transparent 1.5px)',
                backgroundSize: '24px 24px',
              }}
            />
          )}
        </div>

        {/* 2. VECTOR DRAWINGS & SHAPES LAYER (Rendered above graphs so annotations and shapes sit on top) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-35 overflow-hidden">
          {/* Page Geometric Shapes (non-grid) */}
          {pageShapes.map(renderShapeSvg)}

          {/* Page Freehand Strokes */}
          {pageStrokes.map((s) => {
            if (!s.points || s.points.length < 2) return null;
            const pathD = pointsToSvgPath(s.points);
            const strokeColor = s.isGhosted ? '#DC2626' : s.color;
            const strokeDash = s.isGhosted ? '4 4' : undefined;
            const opacity = s.isGhosted
              ? 0.25
              : s.tool === 'highlighter'
              ? s.opacity || 0.35
              : s.tool === 'pencil'
              ? 0.85
              : 1;

            return (
              <path
                key={s.id}
                d={pathD}
                stroke={strokeColor}
                strokeWidth={s.width}
                strokeDasharray={strokeDash}
                opacity={opacity}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={s.tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
              />
            );
          })}

          {/* Active Live Freehand Stroke Preview */}
          {isDrawing && currentPoints.length > 1 && (
            <path
              d={pointsToSvgPath(currentPoints)}
              stroke={currentColor}
              strokeWidth={strokeWidth}
              opacity={penType === 'highlighter' ? 0.35 : penType === 'pencil' ? 0.85 : 1}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={penType === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
            />
          )}

          {/* Audience Live Synced In-Progress Overlay Preview (Real-Time Stream) */}
          {isAudienceViewer && externalLiveOverlay && (
            <g>
              {externalLiveOverlay.stroke &&
                externalLiveOverlay.stroke.pageId === pageId &&
                externalLiveOverlay.stroke.points.length > 1 && (
                  <path
                    d={pointsToSvgPath(externalLiveOverlay.stroke.points)}
                    stroke={externalLiveOverlay.stroke.color}
                    strokeWidth={externalLiveOverlay.stroke.width}
                    opacity={
                      externalLiveOverlay.stroke.tool === 'highlighter'
                        ? 0.35
                        : externalLiveOverlay.stroke.tool === 'pencil'
                        ? 0.85
                        : 1
                    }
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={
                      externalLiveOverlay.stroke.tool === 'highlighter'
                        ? { mixBlendMode: 'multiply' }
                        : undefined
                    }
                  />
                )}

              {externalLiveOverlay.shape &&
                externalLiveOverlay.shape.pageId === pageId &&
                (() => {
                  const s = externalLiveOverlay.shape;
                  const x = Math.min(s.start.x, s.current.x);
                  const y = Math.min(s.start.y, s.current.y);
                  const absW = Math.abs(s.current.x - s.start.x);
                  const absH = Math.abs(s.current.y - s.start.y);
                  const dash =
                    s.strokeStyle === 'dashed'
                      ? '8 6'
                      : s.strokeStyle === 'dotted'
                      ? '3 4'
                      : undefined;
                  const extFill =
                    s.fill && (s.fillOpacity ?? 25) > 0
                      ? hexWithAlphaPercent(s.strokeColor, s.fillOpacity ?? 25)
                      : 'none';
                  if (s.shapeType === 'rect' || s.shapeType === 'grid') {
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={absW}
                        height={absH}
                        stroke={s.strokeColor}
                        strokeWidth={s.strokeWidth}
                        strokeDasharray={dash}
                        fill={extFill}
                      />
                    );
                  }
                  if (s.shapeType === 'rounded_rect') {
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={absW}
                        height={absH}
                        rx={12}
                        ry={12}
                        stroke={s.strokeColor}
                        strokeWidth={s.strokeWidth}
                        strokeDasharray={dash}
                        fill={extFill}
                      />
                    );
                  }
                  if (s.shapeType === 'circle') {
                    return (
                      <ellipse
                        cx={x + absW / 2}
                        cy={y + absH / 2}
                        rx={absW / 2}
                        ry={absH / 2}
                        stroke={s.strokeColor}
                        strokeWidth={s.strokeWidth}
                        strokeDasharray={dash}
                        fill={extFill}
                      />
                    );
                  }
                  if (s.shapeType === 'triangle') {
                    return (
                      <polygon
                        points={`${x + absW / 2},${y} ${x + absW},${y + absH} ${x},${y + absH}`}
                        stroke={s.strokeColor}
                        strokeWidth={s.strokeWidth}
                        strokeDasharray={dash}
                        fill={extFill}
                      />
                    );
                  }
                  if (
                    s.shapeType === 'line' ||
                    s.shapeType === 'arrow' ||
                    s.shapeType === 'double_arrow'
                  ) {
                    return (
                      <line
                        x1={s.start.x}
                        y1={s.start.y}
                        x2={s.current.x}
                        y2={s.current.y}
                        stroke={s.strokeColor}
                        strokeWidth={s.strokeWidth}
                        strokeDasharray={dash}
                      />
                    );
                  }
                  return null;
                })()}

              {externalLiveOverlay.graphMarquee &&
                externalLiveOverlay.graphMarquee.pageId === pageId && (
                  <rect
                    x={Math.min(
                      externalLiveOverlay.graphMarquee.start.x,
                      externalLiveOverlay.graphMarquee.current.x
                    )}
                    y={Math.min(
                      externalLiveOverlay.graphMarquee.start.y,
                      externalLiveOverlay.graphMarquee.current.y
                    )}
                    width={Math.abs(
                      externalLiveOverlay.graphMarquee.current.x -
                        externalLiveOverlay.graphMarquee.start.x
                    )}
                    height={Math.abs(
                      externalLiveOverlay.graphMarquee.current.y -
                        externalLiveOverlay.graphMarquee.start.y
                    )}
                    fill="rgba(79, 70, 229, 0.08)"
                    stroke="#4F46E5"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    rx={8}
                  />
                )}

              {externalLiveOverlay.angle &&
                externalLiveOverlay.angle.pageId === pageId && (() => {
                  const a = externalLiveOverlay.angle;
                  return (
                    <g>
                      <circle
                        cx={a.center.x}
                        cy={a.center.y}
                        r={a.radius}
                        stroke="#3B82F6"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        fill="rgba(59, 130, 246, 0.05)"
                      />
                      <circle cx={a.center.x} cy={a.center.y} r={5} fill="#1D4ED8" />
                      <line
                        x1={a.center.x}
                        y1={a.center.y}
                        x2={a.center.x + a.radius * Math.cos(a.ray1)}
                        y2={a.center.y + a.radius * Math.sin(a.ray1)}
                        stroke="#2563EB"
                        strokeWidth={3.5}
                        strokeLinecap="round"
                      />
                      {(a.step === 'ray2_drag' || a.step === 'sector_select') && (
                        <line
                          x1={a.center.x}
                          y1={a.center.y}
                          x2={a.center.x + a.radius * Math.cos(a.ray2)}
                          y2={a.center.y + a.radius * Math.sin(a.ray2)}
                          stroke="#EF4444"
                          strokeWidth={3.5}
                          strokeDasharray={a.step === 'ray2_drag' ? '6 4' : undefined}
                          strokeLinecap="round"
                        />
                      )}
                    </g>
                  );
                })()}

              {externalLiveOverlay.dictatePreview &&
                externalLiveOverlay.dictatePreview.pageId === pageId && (() => {
                  const d = externalLiveOverlay.dictatePreview;
                  const dx = d.current.x - d.start.x;
                  const dy = d.current.y - d.start.y;
                  if (d.subMode === 'height') {
                    const topY = Math.min(d.start.y, d.current.y);
                    const botY = Math.max(d.start.y, d.current.y);
                    const h = Math.max(12, Math.abs(dy));
                    return (
                      <g>
                        <line
                          x1={d.start.x}
                          y1={topY}
                          x2={d.start.x}
                          y2={botY}
                          stroke="#0284C7"
                          strokeWidth={2.5}
                        />
                        <text
                          x={d.start.x + 12}
                          y={topY + h * 0.86}
                          fill="rgba(15,23,42,0.45)"
                          fontSize={h}
                          fontFamily="sans-serif"
                          fontWeight="500"
                        >
                          Aa
                        </text>
                      </g>
                    );
                  }
                  if (d.subMode === 'dimensions') {
                    const x = Math.min(d.start.x, d.current.x);
                    const y = Math.min(d.start.y, d.current.y);
                    const w = Math.abs(dx);
                    const h = Math.abs(dy);
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill="rgba(14, 165, 233, 0.08)"
                        stroke="#0284C7"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        rx={4}
                      />
                    );
                  }
                  const minX = Math.min(d.start.x, d.current.x);
                  const w = Math.abs(dx);
                  return (
                    <g>
                      <rect
                        x={minX}
                        y={d.start.y - d.constantFontSize * 0.5}
                        width={w}
                        height={d.constantFontSize * 1.12}
                        fill="rgba(14, 165, 233, 0.08)"
                        stroke="#0284C7"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        rx={4}
                      />
                      <line
                        x1={d.start.x}
                        y1={d.start.y}
                        x2={d.current.x}
                        y2={d.start.y}
                        stroke="#0284C7"
                        strokeWidth={2.5}
                      />
                    </g>
                  );
                })()}
            </g>
          )}

          {/* Active Live Geometric Shape Drag Preview */}
          {shapeDragStart && shapeDragCurrent && (
            <g>
              {(() => {
                const w = shapeDragCurrent.x - shapeDragStart.x;
                const h = shapeDragCurrent.y - shapeDragStart.y;
                const x = Math.min(shapeDragStart.x, shapeDragCurrent.x);
                const y = Math.min(shapeDragStart.y, shapeDragCurrent.y);
                const absW = Math.abs(w);
                const absH = Math.abs(h);
                const strokeDash =
                  shapeStyle === 'dashed' ? '8 6' : shapeStyle === 'dotted' ? '3 4' : undefined;

                if (shapeType === 'grid') {
                  const cols = Math.max(2, Math.round(absW / 28));
                  const rows = Math.max(2, Math.round(absH / 28));
                  return (
                    <g key="grid-preview">
                      <rect
                        x={x}
                        y={y}
                        width={absW}
                        height={absH}
                        stroke={currentColor}
                        strokeWidth={shapeStrokeWidth}
                        strokeDasharray={strokeDash}
                        fill={
                          shapeFill && shapeFillOpacity > 0
                            ? hexWithAlphaPercent(currentColor, shapeFillOpacity)
                            : 'rgba(59, 130, 246, 0.08)'
                        }
                      />
                      {Array.from({ length: cols - 1 }).map((_, i) => {
                        const lx = x + ((i + 1) / cols) * absW;
                        return (
                          <line
                            key={`pv-${i}`}
                            x1={lx}
                            y1={y}
                            x2={lx}
                            y2={y + absH}
                            stroke={currentColor}
                            strokeWidth={shapeStrokeWidth * 0.75}
                            strokeOpacity={0.65}
                            strokeDasharray={strokeDash}
                          />
                        );
                      })}
                      {Array.from({ length: rows - 1 }).map((_, j) => {
                        const ly = y + ((j + 1) / rows) * absH;
                        return (
                          <line
                            key={`ph-${j}`}
                            x1={x}
                            y1={ly}
                            x2={x + absW}
                            y2={ly}
                            stroke={currentColor}
                            strokeWidth={shapeStrokeWidth * 0.75}
                            strokeOpacity={0.65}
                            strokeDasharray={strokeDash}
                          />
                        );
                      })}
                      <text
                        x={x + 8}
                        y={y + 18}
                        fill={currentColor}
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        Graphing Grid: {cols} × {rows} lines ({Math.round(absW)} × {Math.round(absH)}px)
                      </text>
                    </g>
                  );
                }
                const previewFill =
                  shapeFill && shapeFillOpacity > 0
                    ? hexWithAlphaPercent(currentColor, shapeFillOpacity)
                    : 'none';
                if (shapeType === 'rect') {
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={absW}
                      height={absH}
                      stroke={currentColor}
                      strokeWidth={shapeStrokeWidth}
                      strokeDasharray={strokeDash}
                      fill={previewFill}
                    />
                  );
                }
                if (shapeType === 'rounded_rect') {
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={absW}
                      height={absH}
                      rx={12}
                      ry={12}
                      stroke={currentColor}
                      strokeWidth={shapeStrokeWidth}
                      strokeDasharray={strokeDash}
                      fill={previewFill}
                    />
                  );
                }
                if (shapeType === 'circle') {
                  return (
                    <ellipse
                      cx={x + absW / 2}
                      cy={y + absH / 2}
                      rx={absW / 2}
                      ry={absH / 2}
                      stroke={currentColor}
                      strokeWidth={shapeStrokeWidth}
                      strokeDasharray={strokeDash}
                      fill={previewFill}
                    />
                  );
                }
                if (shapeType === 'triangle') {
                  const pts = `${x + absW / 2},${y} ${x + absW},${y + absH} ${x},${y + absH}`;
                  return (
                    <polygon
                      points={pts}
                      stroke={currentColor}
                      strokeWidth={shapeStrokeWidth}
                      strokeDasharray={strokeDash}
                      fill={previewFill}
                    />
                  );
                }
                if (
                  shapeType === 'line' ||
                  shapeType === 'arrow' ||
                  shapeType === 'double_arrow'
                ) {
                  return (
                    <line
                      x1={shapeDragStart.x}
                      y1={shapeDragStart.y}
                      x2={shapeDragCurrent.x}
                      y2={shapeDragCurrent.y}
                      stroke={currentColor}
                      strokeWidth={shapeStrokeWidth}
                    />
                  );
                }
                return null;
              })()}
            </g>
          )}

          {/* Active Desmos Marquee Stretch Preview */}
          {graphDragStart && graphDragCurrent && (
            <g>
              <rect
                x={Math.min(graphDragStart.x, graphDragCurrent.x)}
                y={Math.min(graphDragStart.y, graphDragCurrent.y)}
                width={Math.abs(graphDragCurrent.x - graphDragStart.x)}
                height={Math.abs(graphDragCurrent.y - graphDragStart.y)}
                fill="rgba(79, 70, 229, 0.08)"
                stroke="#4F46E5"
                strokeWidth={2}
                strokeDasharray="6 4"
                rx={8}
              />
              <text
                x={Math.min(graphDragStart.x, graphDragCurrent.x) + 10}
                y={Math.min(graphDragStart.y, graphDragCurrent.y) + 22}
                fill="#4F46E5"
                fontSize={12}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                Desmos Graph: {Math.round(Math.abs(graphDragCurrent.x - graphDragStart.x))} ×{' '}
                {Math.round(Math.abs(graphDragCurrent.y - graphDragStart.y))}px
              </text>
            </g>
          )}

          {/* Active Dictate Box Drag Guide Preview */}
          {mode === 'dictate' && dictateDragStart && dictateDragCurrent && (() => {
            const dx = dictateDragCurrent.x - dictateDragStart.x;
            const dy = dictateDragCurrent.y - dictateDragStart.y;
            if (dictateSubMode === 'height') {
              const topY = Math.min(dictateDragStart.y, dictateDragCurrent.y);
              const botY = Math.max(dictateDragStart.y, dictateDragCurrent.y);
              const h = Math.max(12, Math.abs(dy));
              return (
                <g>
                  <line
                    x1={dictateDragStart.x}
                    y1={topY}
                    x2={dictateDragStart.x}
                    y2={botY}
                    stroke="#0284C7"
                    strokeWidth={2.5}
                  />
                  <line
                    x1={dictateDragStart.x - 8}
                    y1={topY}
                    x2={dictateDragStart.x + 8}
                    y2={topY}
                    stroke="#0284C7"
                    strokeWidth={2.5}
                  />
                  <line
                    x1={dictateDragStart.x - 8}
                    y1={botY}
                    x2={dictateDragStart.x + 8}
                    y2={botY}
                    stroke="#0284C7"
                    strokeWidth={2.5}
                  />
                  <text
                    x={dictateDragStart.x + 14}
                    y={topY + h * 0.86}
                    fill="rgba(2, 132, 199, 0.35)"
                    fontSize={h}
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    Aa
                  </text>
                  <text
                    x={dictateDragStart.x + 12}
                    y={Math.max(18, topY - 8)}
                    fill="#0284C7"
                    fontSize={12}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    Text Height: {Math.round(h)}px (No wrap →)
                  </text>
                </g>
              );
            }
            if (dictateSubMode === 'dimensions') {
              const x = Math.min(dictateDragStart.x, dictateDragCurrent.x);
              const y = Math.min(dictateDragStart.y, dictateDragCurrent.y);
              const w = Math.abs(dx);
              const h = Math.max(12, Math.abs(dy));
              return (
                <g>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={Math.abs(dy)}
                    fill="rgba(14, 165, 233, 0.08)"
                    stroke="#0284C7"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    rx={4}
                  />
                  {w > 24 && Math.abs(dy) >= 12 && (
                    <text
                      x={x + 6}
                      y={y + h * 0.86}
                      fill="rgba(2, 132, 199, 0.32)"
                      fontSize={h}
                      fontFamily="sans-serif"
                      fontWeight="600"
                    >
                      Aa
                    </text>
                  )}
                  <text
                    x={x}
                    y={Math.max(18, y - 8)}
                    fill="#0284C7"
                    fontSize={12}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    Box: {Math.round(w)}px wide × {Math.round(Math.abs(dy))}px tall (Wraps ↓)
                  </text>
                </g>
              );
            }
            // constant_font horizontal line
            const minX = Math.min(dictateDragStart.x, dictateDragCurrent.x);
            const w = Math.abs(dx);
            const fSize = Math.max(10, constantDictateFontSize);
            return (
              <g>
                <rect
                  x={minX}
                  y={Math.max(4, dictateDragStart.y - fSize * 0.5)}
                  width={w}
                  height={fSize * 1.12}
                  fill="rgba(14, 165, 233, 0.08)"
                  stroke="#0284C7"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  rx={4}
                />
                <line
                  x1={dictateDragStart.x}
                  y1={dictateDragStart.y}
                  x2={dictateDragCurrent.x}
                  y2={dictateDragStart.y}
                  stroke="#0284C7"
                  strokeWidth={2.5}
                />
                <line
                  x1={dictateDragStart.x}
                  y1={dictateDragStart.y - 8}
                  x2={dictateDragStart.x}
                  y2={dictateDragStart.y + 8}
                  stroke="#0284C7"
                  strokeWidth={2.5}
                />
                <line
                  x1={dictateDragCurrent.x}
                  y1={dictateDragStart.y - 8}
                  x2={dictateDragCurrent.x}
                  y2={dictateDragStart.y + 8}
                  stroke="#0284C7"
                  strokeWidth={2.5}
                />
                <text
                  x={minX}
                  y={Math.max(18, dictateDragStart.y - fSize * 0.5 - 8)}
                  fill="#0284C7"
                  fontSize={12}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  Wrap Width: {Math.round(w)}px · Font: {fSize}px
                </text>
              </g>
            );
          })()}

          {/* Active Eraser Select Box Area */}
          {eraserSelectStart && eraserSelectCurrent && (
            <g>
              <rect
                x={Math.min(eraserSelectStart.x, eraserSelectCurrent.x)}
                y={Math.min(eraserSelectStart.y, eraserSelectCurrent.y)}
                width={Math.abs(eraserSelectCurrent.x - eraserSelectStart.x)}
                height={Math.abs(eraserSelectCurrent.y - eraserSelectStart.y)}
                fill="rgba(239, 68, 68, 0.16)"
                stroke="#EF4444"
                strokeWidth={2}
                strokeDasharray="5 5"
                rx={4}
              />
              <text
                x={Math.min(eraserSelectStart.x, eraserSelectCurrent.x) + 8}
                y={Math.min(eraserSelectStart.y, eraserSelectCurrent.y) + 18}
                fill="#DC2626"
                fontSize={11}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                Erase Area:{' '}
                {Math.round(Math.abs(eraserSelectCurrent.x - eraserSelectStart.x))} ×{' '}
                {Math.round(Math.abs(eraserSelectCurrent.y - eraserSelectStart.y))}px
              </text>
            </g>
          )}

          {/* Active Magic Grab Lasso Preview */}
          {lassoStart && lassoCurrent && (
            <rect
              x={Math.min(lassoStart.x, lassoCurrent.x)}
              y={Math.min(lassoStart.y, lassoCurrent.y)}
              width={Math.abs(lassoCurrent.x - lassoStart.x)}
              height={Math.abs(lassoCurrent.y - lassoStart.y)}
              fill="rgba(99, 102, 241, 0.1)"
              stroke="#6366F1"
              strokeWidth={2}
              strokeDasharray="4 4"
              rx={6}
            />
          )}

          {/* Active Picture Copy Crop Box Preview */}
          {photoCropStart && photoCropCurrent && (
            <g className="crop-preview-box">
              <rect
                x={Math.min(photoCropStart.x, photoCropCurrent.x)}
                y={Math.min(photoCropStart.y, photoCropCurrent.y)}
                width={Math.abs(photoCropCurrent.x - photoCropStart.x)}
                height={Math.abs(photoCropCurrent.y - photoCropStart.y)}
                fill="rgba(16, 185, 129, 0.12)"
                stroke="#10B981"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                rx={6}
              />
              <text
                x={Math.min(photoCropStart.x, photoCropCurrent.x) + 8}
                y={Math.min(photoCropStart.y, photoCropCurrent.y) + 20}
                fill="#059669"
                fontSize={12}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                📸 Screenshot Square:{' '}
                {Math.round(Math.abs(photoCropCurrent.x - photoCropStart.x))} ×{' '}
                {Math.round(Math.abs(photoCropCurrent.y - photoCropStart.y))}px
              </text>
            </g>
          )}

          {/* Active Live Geometric Angle Tool Protractor and Rays Preview */}
          {angleStep !== 'idle' && angleCenter && (
            <g key="angle-tool-preview" className="angle-tool-overlay">
              {/* Guide Protractor Circle */}
              <circle
                cx={angleCenter.x}
                cy={angleCenter.y}
                r={angleRadius}
                stroke="#3B82F6"
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="rgba(59, 130, 246, 0.05)"
              />
              {/* Center vertex point */}
              <circle cx={angleCenter.x} cy={angleCenter.y} r={5} fill="#1D4ED8" />

              {/* Terminal Ray 1 (blue arm - no arrow) */}
              <line
                x1={angleCenter.x}
                y1={angleCenter.y}
                x2={angleCenter.x + angleRadius * Math.cos(angleRay1)}
                y2={angleCenter.y + angleRadius * Math.sin(angleRay1)}
                stroke="#2563EB"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              {/* Ray 1 Handle */}
              <circle
                cx={angleCenter.x + angleRadius * Math.cos(angleRay1)}
                cy={angleCenter.y + angleRay1 ? angleCenter.y + angleRadius * Math.sin(angleRay1) : angleCenter.y}
                r={8}
                fill="#2563EB"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                className="cursor-pointer pointer-events-auto"
              />

              {/* Terminal Ray 2 (ghost red arm - no arrow) */}
              {(angleStep === 'ray2_drag' || angleStep === 'sector_select') && (
                <>
                  <line
                    x1={angleCenter.x}
                    y1={angleCenter.y}
                    x2={angleCenter.x + angleRadius * Math.cos(angleRay2)}
                    y2={angleCenter.y + angleRadius * Math.sin(angleRay2)}
                    stroke="#EF4444"
                    strokeWidth={3.5}
                    strokeDasharray={angleStep === 'ray2_drag' ? '6 4' : undefined}
                    strokeLinecap="round"
                  />
                  {/* Ray 2 Handle */}
                  <circle
                    cx={angleCenter.x + angleRadius * Math.cos(angleRay2)}
                    cy={angleCenter.y + angleRadius * Math.sin(angleRay2)}
                    r={8}
                    fill="#EF4444"
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                    className="cursor-pointer pointer-events-auto"
                  />
                </>
              )}
            </g>
          )}
        </svg>

        {/* 3. PLACED CANVAS IMAGE BOXES LAYER */}
        {pageImages.map((img) => (
          <CanvasImageBox
            key={img.id}
            image={img}
            isActive={!isAudienceViewer && selectedImageId === img.id}
            zoomScale={activeZoomScale}
            isReadOnly={isAudienceViewer}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            onSelect={() => {
              if (!isAudienceViewer && selectedImageId !== img.id) {
                setSelectedImageId(img.id);
                setSelectedGraphId(null);
                setSelectedCalcId(null);
                setSelectedGridShapeId(null);
              }
            }}
            onUpdate={(updated) => onUpdateImage && onUpdateImage(img.id, updated)}
            onDelete={() => onDeleteImage && onDeleteImage(img.id)}
          />
        ))}

        {/* 3.5 PLACED INTERACTIVE GRAPHING GRID BOXES (With L-Grabs & Invariant Line Count) */}
        {pageShapes
          .filter((sh) => sh.type === 'grid')
          .map((gridShape) => (
            <InteractiveGridBox
              key={gridShape.id}
              shape={gridShape}
              isActive={!isAudienceViewer && selectedGridShapeId === gridShape.id}
              zoomScale={activeZoomScale}
              isReadOnly={isAudienceViewer}
              hideChrome={isAudienceViewer && hideAudienceChrome}
              onSelect={() => {
                if (!isAudienceViewer && selectedGridShapeId !== gridShape.id) {
                  setSelectedGridShapeId(gridShape.id);
                  setSelectedGraphId(null);
                  setSelectedCalcId(null);
                  setSelectedImageId(null);
                }
              }}
              onUpdate={(updated) => onUpdateShape && onUpdateShape(gridShape.id, updated)}
              onDelete={() => onDeleteShape && onDeleteShape(gridShape.id)}
            />
          ))}

        {/* 4. DESMOS GRAPH BOXES LAYER */}
        {pageGraphs.map((g) => (
          <DesmosGraphBox
            key={g.id}
            box={g}
            isActive={!isAudienceViewer && selectedGraphId === g.id}
            isMagicGrabActive={!isAudienceViewer && mode === 'edit' && isMagicGrabActive}
            zoomScale={activeZoomScale}
            isReadOnly={isAudienceViewer}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            onSelect={() => {
              if (!isAudienceViewer && selectedGraphId !== g.id) {
                setSelectedGraphId(g.id);
                setSelectedCalcId(null);
                setSelectedImageId(null);
                setSelectedGridShapeId(null);
              }
            }}
            onUpdate={(updated) => onUpdateGraph(g.id, updated)}
            onDelete={() => onDeleteGraph(g.id)}
          />
        ))}

        {/* 5. SCIENTIFIC CALCULATOR BOXES LAYER */}
        {pageCalculators.map((c) => (
          <ScientificCalculatorBox
            key={c.id}
            box={c}
            isActive={!isAudienceViewer && selectedCalcId === c.id}
            zoomScale={activeZoomScale}
            isReadOnly={isAudienceViewer}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            disableTwoFingerPinch={
              touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand'
            }
            onSelect={() => {
              if (!isAudienceViewer && selectedCalcId !== c.id) {
                setSelectedCalcId(c.id);
                setSelectedGraphId(null);
                setSelectedImageId(null);
                setSelectedGridShapeId(null);
              }
            }}
            onUpdate={(updated) => onUpdateCalculator(c.id, updated)}
            onDelete={() => onDeleteCalculator(c.id)}
          />
        ))}

        {/* 5.5 DICTATED TEXT BOXES LAYER */}
        {pageDictatedTextBoxes.map((box) => {
          const isThisDictating = activeDictateBoxId === box.id;
          const isThisTransform = selectedDictateBoxId === box.id;
          const isThisEditing = !isAudienceViewer && editingDictateBoxId === box.id;
          return (
            <DictatedTextBoxItem
              key={box.id}
              box={box}
              isDictatingActive={isThisDictating}
              isListening={isThisDictating && isDictating}
              showTransformBox={isThisTransform}
              isEditing={isThisEditing}
              isEraserActive={isAnyEraseActive}
              zoomScale={activeZoomScale}
              isReadOnly={isAudienceViewer}
              hideChrome={isAudienceViewer && hideAudienceChrome}
              passThroughBody={mode === 'drawing' || mode === 'geometric' || isAnyEraseActive}
              onSelectForTransform={() => onSelectDictateBoxForTransform?.(box.id)}
              onResumeDictation={
                onResumeDictateBox ? () => onResumeDictateBox(box.id) : undefined
              }
              onStartManualEdit={
                onStartManualEditDictateBox
                  ? () => onStartManualEditDictateBox(box.id)
                  : undefined
              }
              onStopManualEdit={onStopManualEditDictateBox}
              onDeselect={onDeselectDictateBox}
              onUpdate={(updated) => onUpdateDictatedTextBox?.(box.id, updated)}
              onCommitHistory={onTransformEnd}
              onDelete={() => onDeleteDictatedTextBox?.(box.id)}
            />
          );
        })}

        {/* 6. INTERACTION LAYER */}
        {!isAudienceViewer && (
          <div
            ref={interactionLayerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            onPointerLeave={() => {
              if (!isCircleErasingRef.current) {
                setEraserCirclePos(null);
              }
            }}
            className={`drawing-layer absolute inset-0 touch-none ${
              mode === 'drawing' ||
              mode === 'geometric' ||
              mode === 'dictate' ||
              isAnyEraseActive ||
              (touchInputMode === 'stylus_and_hand' && leftToolbarTool !== 'pointer')
                ? 'z-40'
                : 'z-20'
            } ${
              touchInputMode === 'stylus_and_hand' && leftToolbarTool === 'zoom'
                ? 'cursor-zoom-in'
                : touchInputMode === 'stylus_and_hand' && leftToolbarTool === 'pan'
                ? stylusPanStart
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : isCircleEraseActive && eraserCirclePos
                ? 'cursor-none'
                : mode === 'calculator'
                ? 'cursor-pointer'
                : mode === 'edit'
                ? isPictureCopyActive
                  ? 'cursor-crosshair'
                  : isMagicGrabActive
                  ? 'cursor-grab'
                  : 'cursor-crosshair'
                : 'cursor-crosshair'
            }`}
          />
        )}

        {/* 6.5 CIRCLE ERASER LIVE RED CURSOR */}
        {isCircleEraseActive && eraserCirclePos && (
          <div
            aria-hidden="true"
            style={{
              left: `${eraserCirclePos.x}px`,
              top: `${eraserCirclePos.y}px`,
              width: `${eraserSize}px`,
              height: `${eraserSize}px`,
            }}
            className="drawing-layer absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-500 bg-red-500/15 shadow-[0_0_0_1px_rgba(255,255,255,0.65)] pointer-events-none z-50"
          >
            <div className="absolute left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/80" />
          </div>
        )}

        {/* 7. MAGIC GRAB SELECTION BOUNDING BOX, COMPASS DRAG & UPRIGHT SPIN JOYSTICK */}
        {grabSelection && (
          <>
            <div
              ref={grabBoxRef}
              style={{
                left: `${grabSelection.bounds.minX - 6}px`,
                top: `${grabSelection.bounds.minY - 6}px`,
                width: `${Math.max(40, grabSelection.bounds.maxX - grabSelection.bounds.minX + 12)}px`,
                height: `${Math.max(40, grabSelection.bounds.maxY - grabSelection.bounds.minY + 12)}px`,
              }}
              className={`absolute z-40 pointer-events-auto rounded-lg select-none shadow-lg transition-colors ${
                isSelectionEmpty
                  ? 'border-2 border-dashed border-emerald-500 bg-emerald-50/15'
                  : 'border-2 border-dashed border-indigo-600 bg-indigo-50/15'
              }`}
            />

            {!isAudienceViewer && (
              <RotationJoystickControl
                rotation={magicGroupRotation}
                anchorRef={grabBoxRef}
                isOpen={!isSelectionEmpty && isMagicJoystickOpen}
                onToggleOpen={() => {
                  if (!isSelectionEmpty) {
                    setIsMagicJoystickOpen((prev) => !prev);
                  }
                }}
                onCommitHistory={() => {
                  magicPivotRef.current = {
                    x: (grabSelection.bounds.minX + grabSelection.bounds.maxX) / 2,
                    y: (grabSelection.bounds.minY + grabSelection.bounds.maxY) / 2,
                  };
                  onTransformEnd?.();
                }}
                onRotateDelta={(deltaDeg) => {
                  if (isSelectionEmpty) return;
                  const pivot = magicPivotRef.current || {
                    x: (grabSelection.bounds.minX + grabSelection.bounds.maxX) / 2,
                    y: (grabSelection.bounds.minY + grabSelection.bounds.maxY) / 2,
                  };
                  onRotateItems?.(
                    grabSelection.strokeIds,
                    grabSelection.shapeIds,
                    grabSelection.graphIds,
                    grabSelection.calculatorIds || [],
                    deltaDeg,
                    pivot.x,
                    pivot.y,
                    grabSelection.imageIds || [],
                    grabSelection.dictateIds || []
                  );
                  setMagicGroupRotation((prev) => (((prev + deltaDeg) % 360) + 360) % 360);
                }}
                onResetZero={() => {
                  if (isSelectionEmpty || magicGroupRotation === 0) {
                    setMagicGroupRotation(0);
                    return;
                  }
                  const pivot = {
                    x: (grabSelection.bounds.minX + grabSelection.bounds.maxX) / 2,
                    y: (grabSelection.bounds.minY + grabSelection.bounds.maxY) / 2,
                  };
                  onRotateItems?.(
                    grabSelection.strokeIds,
                    grabSelection.shapeIds,
                    grabSelection.graphIds,
                    grabSelection.calculatorIds || [],
                    -magicGroupRotation,
                    pivot.x,
                    pivot.y,
                    grabSelection.imageIds || [],
                    grabSelection.dictateIds || []
                  );
                  setMagicGroupRotation(0);
                }}
                accent="indigo"
                placement="top"
                gap={8}
                onDraggingChange={(dragging) => {
                  setIsDraggingMagicJoystick(dragging);
                  if (dragging) {
                    magicPivotRef.current = {
                      x: (grabSelection.bounds.minX + grabSelection.bounds.maxX) / 2,
                      y: (grabSelection.bounds.minY + grabSelection.bounds.maxY) / 2,
                    };
                  } else {
                    magicPivotRef.current = null;
                  }
                }}
                inlineWithContent={
                  <>
                    <div
                      onMouseDown={handleCompassMouseDown}
                      onTouchStart={handleCompassTouchStart}
                      title="Click and hold for a moment or drag to move selected items"
                      className={`relative flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-md cursor-grab active:cursor-grabbing transition-all select-none whitespace-nowrap ${
                        isCompassRepositioning
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 scale-105'
                          : isSelectionEmpty
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {compassHoldProgress > 0 && compassHoldProgress < 100 && (
                        <span
                          className="absolute inset-0 bg-white/20 rounded-full transition-all"
                          style={{ width: `${compassHoldProgress}%` }}
                        />
                      )}
                      <Compass className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span className="tracking-wide">
                        {isCompassRepositioning
                          ? 'Moving...'
                          : isSelectionEmpty
                          ? 'Target Box (Ready to Paste)'
                          : 'Compass Move'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGrabSelection(null);
                      }}
                      className="p-1.5 bg-slate-800 text-white hover:bg-slate-900 rounded-full shadow-md transition-colors"
                      title="Deselect / Close Box"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                }
              />
            )}
          </>
        )}
        {/* 7.5 ACTIVE ANGLE TOOL SECTOR SELECT & LIVE DISPLAY OVERLAY (At z-50 above interaction layer) */}
        {mode === 'geometric' && shapeType === 'angle' && (angleStep === 'ray2_drag' || angleStep === 'sector_select') && angleCenter && (() => {
          let diff = (angleRay2 - angleRay1) % (2 * Math.PI);
          if (diff < 0) diff += 2 * Math.PI;
          const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
          const obtuseSpan = 2 * Math.PI - acuteSpan;

          let rawDiff = angleRay2 - angleRay1;
          while (rawDiff > Math.PI) rawDiff -= 2 * Math.PI;
          while (rawDiff < -Math.PI) rawDiff += 2 * Math.PI;
          const isNegative =
            allowNegativeAngles &&
            (angleNegativeDirection === 'clockwise' ? rawDiff > 0 : rawDiff < 0);

          const formatAngleVal = (spanRad: number, isNeg: boolean) => {
            const sign = isNeg ? '-' : '';
            if (angleUnit === 'rad') {
              return `${sign}${(spanRad / Math.PI).toFixed(2)}π rad`;
            }
            return `${sign}${Math.round((spanRad * 180) / Math.PI)}°`;
          };

          const acuteText = `${formatAngleVal(acuteSpan, isNegative)} Acute`;
          const obtuseText = `${formatAngleVal(obtuseSpan, false)} Obtuse`;

          // Geometry for Acute
          const acuteSweep = diff <= Math.PI ? 1 : 0;
          const acuteStartX = angleCenter.x + angleRadius * Math.cos(angleRay1);
          const acuteStartY = angleCenter.y + angleRadius * Math.sin(angleRay1);
          const acuteEndX = angleCenter.x + angleRadius * Math.cos(angleRay2);
          const acuteEndY = angleCenter.y + angleRadius * Math.sin(angleRay2);
          const acuteD = `M ${acuteStartX} ${acuteStartY} A ${angleRadius} ${angleRadius} 0 0 ${acuteSweep} ${acuteEndX} ${acuteEndY}`;
          const acuteWedge = `M ${angleCenter.x} ${angleCenter.y} L ${acuteStartX} ${acuteStartY} A ${angleRadius} ${angleRadius} 0 0 ${acuteSweep} ${acuteEndX} ${acuteEndY} Z`;

          const acuteMidAngle = acuteSweep === 1 ? angleRay1 + acuteSpan / 2 : angleRay1 - acuteSpan / 2;
          const acuteBadgeDist = angleRadius + 44;
          const acuteBadgeX = angleCenter.x + acuteBadgeDist * Math.cos(acuteMidAngle);
          const acuteBadgeY = angleCenter.y + acuteBadgeDist * Math.sin(acuteMidAngle);
          const acuteArcEdgeX = angleCenter.x + angleRadius * Math.cos(acuteMidAngle);
          const acuteArcEdgeY = angleCenter.y + angleRadius * Math.sin(acuteMidAngle);

          // Geometry for Obtuse
          const obtuseSweep = acuteSweep === 1 ? 0 : 1;
          const obtuseD = `M ${acuteStartX} ${acuteStartY} A ${angleRadius} ${angleRadius} 0 1 ${obtuseSweep} ${acuteEndX} ${acuteEndY}`;
          const obtuseWedge = `M ${angleCenter.x} ${angleCenter.y} L ${acuteStartX} ${acuteStartY} A ${angleRadius} ${angleRadius} 0 1 ${obtuseSweep} ${acuteEndX} ${acuteEndY} Z`;

          const obtuseMidAngle = obtuseSweep === 1 ? angleRay1 + obtuseSpan / 2 : angleRay1 - obtuseSpan / 2;
          const obtuseBadgeDist = angleRadius + 44;
          const obtuseBadgeX = angleCenter.x + obtuseBadgeDist * Math.cos(obtuseMidAngle);
          const obtuseBadgeY = angleCenter.y + obtuseBadgeDist * Math.sin(obtuseMidAngle);
          const obtuseArcEdgeX = angleCenter.x + angleRadius * Math.cos(obtuseMidAngle);
          const obtuseArcEdgeY = angleCenter.y + angleRadius * Math.sin(obtuseMidAngle);

          const isClickable = angleStep === 'sector_select';

          return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
              {/* Acute Arc & Callout Line */}
              {isClickable && (
                <path
                  d={acuteWedge}
                  fill="rgba(16, 185, 129, 0.15)"
                  className="cursor-pointer pointer-events-auto hover:fill-emerald-300/30 transition-colors"
                  onClick={() => handleCompleteAngle('acute')}
                />
              )}
              <path
                d={acuteD}
                stroke="#10B981"
                strokeWidth={isClickable ? 4.5 : 3}
                fill="none"
                strokeLinecap="round"
                className={isClickable ? 'cursor-pointer pointer-events-auto' : ''}
                onClick={isClickable ? () => handleCompleteAngle('acute') : undefined}
              />
              {/* Dashed connector from arc to badge */}
              <line
                x1={acuteArcEdgeX}
                y1={acuteArcEdgeY}
                x2={acuteBadgeX}
                y2={acuteBadgeY}
                stroke="#10B981"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              {/* Acute Badge */}
              <g
                transform={`translate(${acuteBadgeX}, ${acuteBadgeY})`}
                onClick={isClickable ? () => handleCompleteAngle('acute') : undefined}
                className={isClickable ? 'cursor-pointer pointer-events-auto transition-transform hover:scale-105' : ''}
              >
                <rect
                  x={-55}
                  y={-14}
                  width={110}
                  height={28}
                  rx={14}
                  fill="#065F46"
                  stroke="#34D399"
                  strokeWidth={1.5}
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={11}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {acuteText} {isClickable ? '▾' : ''}
                </text>
              </g>

              {/* Obtuse Arc & Callout Line */}
              {isClickable && (
                <path
                  d={obtuseWedge}
                  fill="rgba(245, 158, 11, 0.12)"
                  className="cursor-pointer pointer-events-auto hover:fill-amber-300/30 transition-colors"
                  onClick={() => handleCompleteAngle('obtuse')}
                />
              )}
              <path
                d={obtuseD}
                stroke="#F59E0B"
                strokeWidth={isClickable ? 4.5 : 3}
                fill="none"
                strokeLinecap="round"
                className={isClickable ? 'cursor-pointer pointer-events-auto' : ''}
                onClick={isClickable ? () => handleCompleteAngle('obtuse') : undefined}
              />
              {/* Dashed connector from arc to badge */}
              <line
                x1={obtuseArcEdgeX}
                y1={obtuseArcEdgeY}
                x2={obtuseBadgeX}
                y2={obtuseBadgeY}
                stroke="#F59E0B"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              {/* Obtuse Badge */}
              <g
                transform={`translate(${obtuseBadgeX}, ${obtuseBadgeY})`}
                onClick={isClickable ? () => handleCompleteAngle('obtuse') : undefined}
                className={isClickable ? 'cursor-pointer pointer-events-auto transition-transform hover:scale-105' : ''}
              >
                <rect
                  x={-55}
                  y={-14}
                  width={110}
                  height={28}
                  rx={14}
                  fill="#78350F"
                  stroke="#FBBF24"
                  strokeWidth={1.5}
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={11}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {obtuseText} {isClickable ? '▾' : ''}
                </text>
              </g>
            </svg>
          );
        })()}
      </div>

      {/* 8. MICROSOFT NOTEPAD GHOST ERASER PROMPT */}
      {!isAudienceViewer && ghostedCount > 0 && eraserPromptPos && (
        <GhostEraserPrompt
          ghostedStrokes={ghostedStrokes}
          ghostedShapes={ghostedShapes}
          ghostedDictatedBoxes={ghostedDictatedBoxes}
          ghostedCount={ghostedCount}
          position={eraserPromptPos}
          onConfirm={(sel) => {
            onConfirmDeleteGhosted(sel);
            setEraserPromptPos(null);
          }}
          onCancel={() => {
            onCancelGhosted();
            setEraserPromptPos(null);
          }}
        />
      )}

      {/* 8.5 TOUCH CONTROLS LEFT FLOATING TOOLBAR (Only on Active Page) */}
      {!isAudienceViewer && isActivePage && touchInputMode === 'stylus_and_hand' && (
        <aside
          aria-label="Stylus Navigation Controls"
          className="fixed left-3 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-2 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 select-none pointer-events-auto"
        >
          {/* Tool 1: Default Pointer (regular stylus function) */}
          <button
            type="button"
            title="Stylus Default Tool: Draw, select, and interact normally (ignoring palm/wrist touches)"
            onClick={() => setLeftToolbarTool('pointer')}
            className={`p-2 rounded-xl transition-all ${
              leftToolbarTool === 'pointer'
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MousePointer className="w-5 h-5" />
          </button>

          {/* Tool 2: Stylus Zoom Tool */}
          <button
            type="button"
            title="Stylus Zoom Tool: Tap to select zoom point; drag towards + / - or drag away to zoom into that point"
            onClick={() => setLeftToolbarTool('zoom')}
            className={`p-2 rounded-xl transition-all ${
              leftToolbarTool === 'zoom'
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          {/* Tool 3: Change POV Tool */}
          <button
            type="button"
            title="Change POV Tool: Drag stylus on page to pan canvas view"
            onClick={() => setLeftToolbarTool('pan')}
            className={`p-2 rounded-xl transition-all ${
              leftToolbarTool === 'pan'
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Hand className="w-5 h-5" />
          </button>
        </aside>
      )}

      {/* 8.6 DYNAMIC STYLUS ZOOM HUD INDICATOR */}
      {!isAudienceViewer && stylusZoomAnchor && (
        <div
          style={{
            left: `${stylusZoomAnchor.clientX}px`,
            top: `${stylusZoomAnchor.clientY}px`,
          }}
          className="fixed -translate-x-1/2 -translate-y-1/2 z-[9999] pointer-events-none select-none flex items-center justify-center"
        >
          {/* Dynamic connector line */}
          <div className="absolute w-36 h-0.5 bg-blue-500/60 rounded-full" />

          {/* Left Zoom Out (-) badge */}
          <div className="absolute -left-16 flex items-center gap-1 px-2.5 py-1 bg-slate-900/90 text-white rounded-full shadow-lg border border-white/20 text-xs font-bold backdrop-blur-xs">
            <span>−</span>
            <span className="text-[10px] text-slate-300">Out</span>
          </div>

          {/* Center Target Dot */}
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 bg-blue-500/20 flex items-center justify-center animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          </div>

          {/* Right Zoom In (+) badge */}
          <div className="absolute -right-16 flex items-center gap-1 px-2.5 py-1 bg-slate-900/90 text-white rounded-full shadow-lg border border-white/20 text-xs font-bold backdrop-blur-xs">
            <span>+</span>
            <span className="text-[10px] text-slate-300">In</span>
          </div>

          {/* Current Zoom Level */}
          <div className="absolute top-7 px-2 py-0.5 bg-blue-600 text-white rounded-md text-[11px] font-mono font-bold shadow-md">
            {Math.round(zoomScale * 100)}%
          </div>
        </div>
      )}

      {/* 9. CLASSROOM PRESENTER OVERLAY */}
      <PresenterOverlay
        mode={presenterMode}
        onClose={onClosePresenter}
        isReadOnly={isAudienceViewer}
        externalState={externalPresenterState}
        onStateChange={onPresenterStateChange}
      />

      {/* 10. FLOATING ZOOM CONTROLS */}
      {!isAudienceViewer && (
        <div className="floating-zoom absolute bottom-3 right-3 z-40 flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-2 py-1 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-xs select-none">
          <button
            type="button"
            title="Zoom Out"
            onClick={() => setZoomScale((prev) => Math.max(0.6, prev - 0.25))}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 w-11 text-center">
            {Math.round(zoomScale * 100)}%
          </span>

          <button
            type="button"
            title="Zoom In"
            onClick={() => setZoomScale((prev) => Math.min(3.5, prev + 0.25))}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {zoomScale !== 1 && (
            <button
              type="button"
              title="Reset Zoom & Pan (100%)"
              onClick={() => {
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 ml-1 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
