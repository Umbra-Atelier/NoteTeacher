import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  PdfEditorTool,
  PdfFontFamily,
  PdfTextAlign,
  PdfTextElement,
  PdfImageElement,
  WritingGuideConfig,
} from '../types';
import { DesmosGraphBox } from './DesmosGraphBox';
import { ScientificCalculatorBox, CALC_BASE_WIDTH, CALC_BASE_HEIGHT } from './ScientificCalculatorBox';
import { CanvasImageBox } from './CanvasImageBox';
import { DictatedTextBoxItem } from './DictatedTextBoxItem';
import { PdfTextElementItem } from './PdfTextElementItem';
import { PdfImageElementItem } from './PdfImageElementItem';
import { InteractiveGridBox } from './InteractiveGridBox';
import { GhostEraserPrompt } from './GhostEraserPrompt';
import { PresenterOverlay } from './PresenterOverlay';
import { RotationJoystickControl } from './RotationJoystickControl';
import { sanitizeClonedDocumentForHtml2Canvas } from '../utils/domSnapshot';
import { recordPageStageSize } from '../utils/widgetSnapshotCache';
import {
  hexWithAlphaPercent,
  getBrightHighlighterColor,
  getHighlighterDodgeColor,
} from '../utils/colorUtils';
import {
  ensureTouchGeometryTracker,
  recordTouchGeometry,
  clearPointerGeometryCache,
  getEffectiveTouchMetrics,
  getTouchContactDiameters,
} from '../utils/touchGeometry';
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
  Trash2,
} from 'lucide-react';

interface CanvasStageProps {
  mode: AppMode;
  pageId: string;
  isActivePage?: boolean;
  isVisibleInViewport?: boolean;
  isFullPovMode?: boolean;
  template: PaperTemplate;
  underlayTemplate?: PaperTemplate;
  povScale?: number;
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

  // PDF Editor mode props
  pdfEditorTool?: PdfEditorTool;
  pdfDefaultTextStyle?: {
    fontSizePt: number;
    fontFamily: PdfFontFamily;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
    align: PdfTextAlign;
    wrap: boolean;
  };
  pdfTextElements?: PdfTextElement[];
  pdfImageElements?: PdfImageElement[];
  selectedPdfTextId?: string | null;
  editingPdfTextId?: string | null;
  selectedPdfImageId?: string | null;
  onAddPdfTextElement?: (el: PdfTextElement) => void;
  onUpdatePdfTextElement?: (id: string, updated: Partial<PdfTextElement>) => void;
  onDeletePdfTextElement?: (id: string) => void;
  onSelectPdfTextElement?: (id: string) => void;
  onStartEditPdfTextElement?: (id: string) => void;
  onStopEditPdfTextElement?: () => void;
  onDeselectPdfTextElement?: () => void;
  onUpdatePdfImageElement?: (id: string, updated: Partial<PdfImageElement>) => void;
  onDeletePdfImageElement?: (id: string) => void;
  onSelectPdfImageElement?: (id: string) => void;
  onDeselectPdfImageElement?: () => void;

  // Page state collections
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images?: CanvasImage[];

  // Mutators
  editingGridDims?: { shapeId: string; field: 'cols' | 'rows'; draft: string } | null;
  onStartEditGridDims?: (shapeId: string, field: 'cols' | 'rows') => void;
  onChangeGridDimsDraft?: (shapeId: string, field: 'cols' | 'rows', draft: string) => void;
  onStopEditGridDims?: () => void;
  writingGuideConfig?: WritingGuideConfig;
  autoStraightenLines?: boolean;
  onToggleWritingGuidesQuick?: () => void;
  onCommitDrawingStroke?: (
    stroke: CanvasStroke,
    guideShapesToAdd?: GeometricShape[],
    shapeIdsToDelete?: string[],
    shapePatches?: Array<{ id: string; patch: Partial<GeometricShape> }>
  ) => void;
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
  // Transformation & rollback callbacks
  onTransformEnd?: () => void;
  onDiscardTouchArtifacts?: (artifacts: {
    strokeIds?: string[];
    shapeIds?: string[];
    graphIds?: string[];
    calcIds?: string[];
    imageIds?: string[];
    dictateIds?: string[];
  }) => void;

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

// Detect dots or straight-line segments (characteristic of pinching/zooming while a finger is down)
function isStraightLineOrDotStroke(points?: StrokePoint[]): boolean {
  if (!points || points.length <= 2) return true;
  const first = points[0];
  const last = points[points.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  if (pathLen < 10) return true;
  if (chord < 1e-3) return false;
  if (chord / pathLen < 0.92) return false;
  const ux = (last.x - first.x) / chord;
  const uy = (last.y - first.y) / chord;
  let maxDev = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dx = points[i].x - first.x;
    const dy = points[i].y - first.y;
    const perp = Math.abs(dx * uy - dy * ux);
    if (perp > maxDev) maxDev = perp;
  }
  return maxDev <= Math.max(5, pathLen * 0.065);
}

// Auto-straighten strokes that are roughly linear while keeping freehand curves smooth
function maybeStraightenStrokePoints(points: StrokePoint[]): StrokePoint[] {
  if (!points || points.length < 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (chord < 18) return points;

  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  if (pathLen < 18 || chord / pathLen < 0.94) return points;

  // Compute centroid & covariance principal axis (total least squares line fit)
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= points.length;
  cy /= points.length;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - cx;
    const dy = points[i].y - cy;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }

  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  let ux = Math.cos(theta);
  let uy = Math.sin(theta);

  // Align unit axis with drawing direction
  if ((last.x - first.x) * ux + (last.y - first.y) * uy < 0) {
    ux = -ux;
    uy = -uy;
  }

  let maxDev = 0;
  let sumDev = 0;
  let prevProj = (first.x - cx) * ux + (first.y - cy) * uy;
  let maxBackward = 0;

  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - cx;
    const dy = points[i].y - cy;
    const proj = dx * ux + dy * uy;
    const perp = Math.abs(dx * -uy + dy * ux);
    if (perp > maxDev) maxDev = perp;
    sumDev += perp;
    if (i > 0 && proj < prevProj) {
      maxBackward = Math.max(maxBackward, prevProj - proj);
    }
    if (proj > prevProj) prevProj = proj;
  }

  const meanDev = sumDev / points.length;
  const maxAllowedDev = Math.max(7, Math.min(20, chord * 0.06));
  const maxAllowedMean = Math.max(3.2, chord * 0.028);

  if (maxDev > maxAllowedDev || meanDev > maxAllowedMean || maxBackward > Math.max(5, chord * 0.08)) {
    return points;
  }

  // Gentle axis snap when within 1.8 degrees of horizontal or vertical
  const axisThreshold = Math.sin((1.8 * Math.PI) / 180);
  if (Math.abs(uy) <= axisThreshold) {
    ux = ux >= 0 ? 1 : -1;
    uy = 0;
  } else if (Math.abs(ux) <= axisThreshold) {
    ux = 0;
    uy = uy >= 0 ? 1 : -1;
  }

  const startProj = (first.x - cx) * ux + (first.y - cy) * uy;
  const endProj = (last.x - cx) * ux + (last.y - cy) * uy;
  const ax = cx + startProj * ux;
  const ay = cy + startProj * uy;
  const bx = cx + endProj * ux;
  const by = cy + endProj * uy;
  const lineLen = Math.hypot(bx - ax, by - ay);
  if (lineLen < 4) return points;

  // Resample collinear points so erasers and magic grab hit-test cleanly along the full line
  const steps = Math.max(4, Math.min(80, Math.round(lineLen / 8)));
  const avgPressure =
    points.reduce((acc, p) => acc + (p.pressure ?? 0.5), 0) / points.length;
  const result: StrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    result.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      pressure: avgPressure,
    });
  }
  return result;
}

const PDF_TILE_COLS = 3;
const PDF_TILE_ROWS = 4;

export const CanvasStage: React.FC<CanvasStageProps> = ({
  mode,
  touchInputMode = 'two_finger',
  stylusConfig = {
    detectionMode: 'active_pen',
    maxTipSizePx: 14,
    allowMouseInput: true,
    minPenPressure: 0,
  },
  isAudienceViewer = false,
  isActivePage = true,
  isVisibleInViewport = true,
  isFullPovMode = false,
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
  underlayTemplate = 'blank',
  povScale = 1,
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
  pdfEditorTool = 'select',
  pdfDefaultTextStyle = {
    fontSizePt: 14,
    fontFamily: 'Helvetica',
    bold: false,
    italic: false,
    underline: false,
    color: '#0F172A',
    align: 'left',
    wrap: true,
  },
  pdfTextElements = [],
  pdfImageElements = [],
  selectedPdfTextId = null,
  editingPdfTextId = null,
  selectedPdfImageId = null,
  onAddPdfTextElement,
  onUpdatePdfTextElement,
  onDeletePdfTextElement,
  onSelectPdfTextElement,
  onStartEditPdfTextElement,
  onStopEditPdfTextElement,
  onDeselectPdfTextElement,
  onUpdatePdfImageElement,
  onDeletePdfImageElement,
  onSelectPdfImageElement,
  onDeselectPdfImageElement,
  strokes,
  shapes,
  graphs,
  calculators,
  images = [],
  editingGridDims = null,
  onStartEditGridDims,
  onChangeGridDimsDraft,
  onStopEditGridDims,
  writingGuideConfig,
  autoStraightenLines = false,
  onToggleWritingGuidesQuick,
  onCommitDrawingStroke,
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
  onDiscardTouchArtifacts,
  onColorUsed,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan state (Two-finger pinch-to-zoom centered on finger midpoint)
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeZoomScale = isAudienceViewer ? externalZoomScale ?? 1 : zoomScale;
  const activePanOffset = isAudienceViewer ? externalPanOffset ?? { x: 0, y: 0 } : panOffset;
  const [floatingZoomCoords, setFloatingZoomCoords] = useState<{
    right: number;
    bottom: number;
    visible: boolean;
  }>({ right: 14, bottom: 14, visible: false });
  const [isZoomControlActive, setIsZoomControlActive] = useState<boolean>(false);
  const zoomControlRef = useRef<HTMLDivElement>(null);
  const [isGuideQuickActive, setIsGuideQuickActive] = useState<boolean>(false);
  const guideQuickRef = useRef<HTMLDivElement>(null);

  // Return bottom-right zoom controls to transparent when clicking outside
  useEffect(() => {
    if (!isZoomControlActive) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (zoomControlRef.current && !zoomControlRef.current.contains(e.target as Node)) {
        setIsZoomControlActive(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown, { capture: true });
    };
  }, [isZoomControlActive]);

  // Return bottom-left quick guides toggle to transparent when clicking outside
  useEffect(() => {
    if (!isGuideQuickActive) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (guideQuickRef.current && !guideQuickRef.current.contains(e.target as Node)) {
        setIsGuideQuickActive(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown, { capture: true });
    };
  }, [isGuideQuickActive]);

  // Keep bottom-right zoom controls anchored on-screen in the exact same fixed viewport corner across Regular & Full POV
  const recomputeFloatingZoomCoords = useCallback(() => {
    if (isAudienceViewer || !isActivePage || !isVisibleInViewport) {
      setFloatingZoomCoords((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

    if (isFullPovMode || povScale > 1.02) {
      setFloatingZoomCoords((prev) =>
        prev.visible && prev.right === 14 && prev.bottom === 14
          ? prev
          : { right: 14, bottom: 14, visible: true }
      );
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setFloatingZoomCoords((prev) =>
        prev.visible && prev.right === 14 && prev.bottom === 14
          ? prev
          : { right: 14, bottom: 14, visible: true }
      );
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 68 || rect.top >= vh - 8) {
      setFloatingZoomCoords((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const pageRightGap = vw - rect.right;
    const computedRight = Math.max(12, Math.min(vw - 96, Math.round(pageRightGap + 12)));
    let computedBottom = Math.max(14, Math.min(vh - 96, Math.round(vh - Math.min(vh, rect.bottom) + 12)));
    // Avoid overlapping Regular POV bottom-right bar when narrow viewport forces it onto the right edge
    if (pageRightGap < 112) {
      computedBottom = Math.max(66, computedBottom);
    }

    setFloatingZoomCoords((prev) =>
      prev.visible && prev.right === computedRight && prev.bottom === computedBottom
        ? prev
        : { right: computedRight, bottom: computedBottom, visible: true }
    );
  }, [isAudienceViewer, isActivePage, isVisibleInViewport, isFullPovMode, povScale]);

  useLayoutEffect(() => {
    recomputeFloatingZoomCoords();
  }, [recomputeFloatingZoomCoords]);

  useEffect(() => {
    if (isAudienceViewer || !isActivePage || !isVisibleInViewport) return;
    const scrollTarget = scrollContainerRef?.current || containerRef.current?.closest('main');
    const el = containerRef.current;
    let rafId: number | null = null;
    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recomputeFloatingZoomCoords();
      });
    };
    const ro = el ? new ResizeObserver(schedule) : null;
    if (el && ro) ro.observe(el);
    scrollTarget?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro?.disconnect();
      scrollTarget?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [isAudienceViewer, isActivePage, isVisibleInViewport, scrollContainerRef, recomputeFloatingZoomCoords]);

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

  const [stageDims, setStageDims] = useState<{ width: number; height: number }>(() => ({
    width: 612,
    height: aspectRatio && aspectRatio > 0 ? Math.round(612 / aspectRatio) : 792,
  }));

  // Record exact logical CSS stage dimensions per page for pixel-accurate multi-page PDF/Image exports
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !pageId) return;
    const record = () => {
      if (el.clientWidth > 50 && el.clientHeight > 50) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        setStageDims((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
        if (!isAudienceViewer) {
          recordPageStageSize(pageId, w, h);
        }
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
  const contactingPenIdsRef = useRef<Set<number>>(new Set());
  const confirmedDownPenIdsRef = useRef<Set<number>>(new Set());
  const strokeSawPositiveContactRef = useRef<boolean>(false);
  const zeroContactMoveStreakRef = useRef<Map<number, number>>(new Map());
  const strokeStartTimestampRef = useRef<number>(0);
  const pendingUpLostCaptureCountRef = useRef<Map<number, { count: number; at: number }>>(new Map());
  const layerCapturedPointerIdsRef = useRef<Set<number>>(new Set());
  const activeStrokeSessionRef = useRef<number>(0);
  const lastStylusEventAtRef = useRef<number>(0);
  const lastProcessedPointerMoveRef = useRef<Event | null>(null);
  const handledByNativeInkRef = useRef<WeakSet<Event>>(new WeakSet());
  const activeRecoveryWindowPointerIdRef = useRef<number | null>(null);
  const activeSmartStylusPointerIdRef = useRef<number | null>(null);
  const rejectedSmartTouchIdsRef = useRef<Set<number>>(new Set());
  const palmTouchPointerIdsRef = useRef<Set<number>>(new Set());
  const smartTouchCoordsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const activePointerIdRef = useRef<number | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const strokeReachedMinPressureRef = useRef<boolean>(false);
  const pendingPenTailPointsRef = useRef<StrokePoint[]>([]);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderedPointCountRef = useRef<number>(0);
  const pendingLiveCanvasClearRef = useRef<boolean>(false);
  const liveStrokeStreamTimerRef = useRef<number | null>(null);
  const lastCommittedBridgeRef = useRef<{ pointerId: number; point: StrokePoint; time: number } | null>(null);

  // Guilty-until-proven-innocent tracking for non-pen touch inputs before/during 2-finger pinch-to-zoom
  const stylusConfigRef = useRef<StylusDetectionConfig>(stylusConfig);
  stylusConfigRef.current = stylusConfig;
  const povScaleRef = useRef<number>(povScale);
  povScaleRef.current = povScale;
  const onDiscardTouchArtifactsRef = useRef(onDiscardTouchArtifacts);
  onDiscardTouchArtifactsRef.current = onDiscardTouchArtifacts;
  const activeStrokeMetaRef = useRef<{
    pointerId: number;
    pointerType: string;
    startedAt: number;
    startZoom: number;
    startPovScale: number;
    startPanX: number;
    startPanY: number;
    endedByCancel: boolean;
  } | null>(null);
  const activePointerMetaRef = useRef<
    Map<
      number,
      {
        pointerType: string;
        downAt: number;
        startZoom: number;
        startPovScale: number;
        startPanX: number;
        startPanY: number;
      }
    >
  >(new Map());
  const recentTouchArtifactsRef = useRef<
    Array<{
      kind: 'stroke' | 'shape' | 'graph' | 'calc' | 'dictate';
      id: string;
      pointerId: number;
      startedAt: number;
      createdAt: number;
      endedByCancel: boolean;
      startZoom: number;
      startPovScale: number;
      startPanX: number;
      startPanY: number;
      endZoom: number;
      endPovScale: number;
      endPanX: number;
      endPanY: number;
      points?: StrokePoint[];
    }>
  >([]);
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());
  const pinchSuppressedTouchPointerIdsRef = useRef<Set<number>>(new Set());
  const activeTouchCountRef = useRef<number>(0);
  const lastAllTouchLiftAtRef = useRef<number>(0);
  const lastPinchEndedAtRef = useRef<number>(0);
  const touchMotionTrackRef = useRef<
    Map<number, { startX: number; startY: number; lastX: number; lastY: number; downAt: number }>
  >(new Map());

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

  const computeUnwrappedRay2 = useCallback(
    (rawAngle: number, prevRay2: number, ray1: number) => {
      if (!allowNegativeAngles) {
        return rawAngle;
      }
      let delta = rawAngle - prevRay2;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      let nextRay2 = prevRay2 + delta;
      let sweep = nextRay2 - ray1;
      while (sweep >= 2 * Math.PI) {
        sweep -= 2 * Math.PI;
        nextRay2 -= 2 * Math.PI;
      }
      while (sweep <= -2 * Math.PI) {
        sweep += 2 * Math.PI;
        nextRay2 += 2 * Math.PI;
      }
      return nextRay2;
    },
    [allowNegativeAngles]
  );

  const computeNegativeModeSectors = useCallback(
    (ray1: number, ray2: number) => {
      let rawDiffSvg = ray2 - ray1;
      while (rawDiffSvg >= 2 * Math.PI) rawDiffSvg -= 2 * Math.PI;
      while (rawDiffSvg <= -2 * Math.PI) rawDiffSvg += 2 * Math.PI;

      const posDirSign = angleNegativeDirection === 'clockwise' ? -1 : 1;
      const signedSweep = rawDiffSvg * posDirSign;

      const primarySpan = Math.abs(signedSweep);
      const primarySweepFlag: 0 | 1 = rawDiffSvg >= 0 ? 1 : 0;
      const primaryLargeArcFlag: 0 | 1 = primarySpan > Math.PI ? 1 : 0;
      const primaryDegMag = Math.round((primarySpan * 180) / Math.PI) % 360;
      const primaryIsNeg = signedSweep < 0 && primaryDegMag > 0;
      const primaryIsNegRad = signedSweep < 0 && primarySpan / Math.PI >= 0.005 && primarySpan / Math.PI < 1.995;

      const secondarySpan = Math.max(0, 2 * Math.PI - primarySpan);
      const secondarySweepFlag: 0 | 1 = primarySweepFlag === 1 ? 0 : 1;
      const secondaryLargeArcFlag: 0 | 1 = secondarySpan > Math.PI ? 1 : 0;
      const secondaryDegMag = Math.round((secondarySpan * 180) / Math.PI) % 360;
      const secondaryIsNeg = signedSweep >= 0 && secondaryDegMag > 0;
      const secondaryIsNegRad = signedSweep >= 0 && secondarySpan / Math.PI >= 0.005 && secondarySpan / Math.PI < 1.995;

      return {
        rawDiffSvg,
        signedSweep,
        primarySpan,
        primarySweepFlag,
        primaryLargeArcFlag,
        primaryDegMag,
        primaryIsNeg,
        primaryIsNegRad,
        secondarySpan,
        secondarySweepFlag,
        secondaryLargeArcFlag,
        secondaryDegMag,
        secondaryIsNeg,
        secondaryIsNegRad,
      };
    },
    [angleNegativeDirection]
  );

  // Active Desmos Marquee Stretch
  const [graphDragStart, setGraphDragStart] = useState<{ x: number; y: number } | null>(null);
  const [graphDragCurrent, setGraphDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Active Dictate Box Drag
  const [dictateDragStart, setDictateDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dictateDragCurrent, setDictateDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Active PDF Editor Text Box Drag
  const [pdfTextDragStart, setPdfTextDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pdfTextDragCurrent, setPdfTextDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const lastPdfTextTapRef = useRef<{ id: string; time: number; x: number; y: number } | null>(null);

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
  const [selectedLineShapeId, setSelectedLineShapeId] = useState<string | null>(null);
  const lineDragRef = useRef<{
    shapeId: string;
    mode: 'move' | 'start' | 'end';
    startStageX: number;
    startStageY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origBandTop?: number;
    origBandBottom?: number;
  } | null>(null);

  // Filter items for current page (memoized to prevent downstream re-render loops)
  const pageStrokes = useMemo(
    () => strokes.filter((s) => s.pageId === pageId),
    [strokes, pageId]
  );
  const pageShapes = useMemo(
    () => shapes.filter((sh) => sh.pageId === pageId),
    [shapes, pageId]
  );

  // Draw Mode Writing Guidelines live tracking state & refs
  const [liveGuidePreview, setLiveGuidePreview] = useState<{
    topY?: number;
    bottomY: number;
  } | null>(null);
  const writingGuideConfigRef = useRef(writingGuideConfig);
  writingGuideConfigRef.current = writingGuideConfig;
  const autoStraightenLinesRef = useRef(autoStraightenLines);
  autoStraightenLinesRef.current = autoStraightenLines;
  const penTypeRef = useRef(penType);
  penTypeRef.current = penType;
  const pageShapesRef = useRef(pageShapes);
  pageShapesRef.current = pageShapes;
  const onCommitDrawingStrokeRef = useRef(onCommitDrawingStroke);
  onCommitDrawingStrokeRef.current = onCommitDrawingStroke;
  const onAddStrokeRef = useRef(onAddStroke);
  onAddStrokeRef.current = onAddStroke;

  const activeGuideTrackRef = useRef<{
    kind: 'new' | 'extend';
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    showTop: boolean;
    targetGuideId?: string;
    anchorY?: number;
    spacing?: number;
    extTop?: number;
    groupId?: string;
  } | null>(null);

  const lastEqualCandidateRef = useRef<{
    pageId: string;
    guideGroupId: string;
    shapeIds: string[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  const isStrokeRoughlyHorizontal = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): boolean => {
    const dx = maxX - minX;
    const dy = maxY - minY;
    return dx >= 10 && dy <= Math.max(8, dx * 0.28);
  };

  const areEqualSignPair = (
    a: { minX: number; maxX: number; minY: number; maxY: number },
    b: { minX: number; maxX: number; minY: number; maxY: number }
  ): boolean => {
    if (
      !isStrokeRoughlyHorizontal(a.minX, a.maxX, a.minY, a.maxY) ||
      !isStrokeRoughlyHorizontal(b.minX, b.maxX, b.minY, b.maxY)
    ) {
      return false;
    }
    const aW = a.maxX - a.minX;
    const bW = b.maxX - b.minX;
    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const minW = Math.max(1, Math.min(aW, bW));
    const aCx = (a.minX + a.maxX) / 2;
    const bCx = (b.minX + b.maxX) / 2;
    const horizAligned =
      overlapX / minW >= 0.35 || Math.abs(aCx - bCx) <= Math.max(14, Math.max(aW, bW) * 0.45);
    if (!horizAligned) return false;

    const aCy = (a.minY + a.maxY) / 2;
    const bCy = (b.minY + b.maxY) / 2;
    const vertDist = Math.abs(bCy - aCy);
    return vertDist >= 3 && vertDist <= 56;
  };
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
  const pagePdfTextElements = useMemo(
    () => pdfTextElements.filter((t) => t.pageId === pageId),
    [pdfTextElements, pageId]
  );
  const pagePdfImageElements = useMemo(
    () => pdfImageElements.filter((img) => img.pageId === pageId),
    [pdfImageElements, pageId]
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
    (touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') &&
    leftToolbarTool !== 'pointer';
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

  // Clear immediate-mode scratch canvas right after React commits the permanent SVG stroke (0-frame flicker)
  const clearLiveCanvas = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }
    renderedPointCountRef.current = 0;
  }, []);

  const ensureLiveCanvasSize = useCallback(() => {
    const canvas = liveCanvasRef.current;
    const layer = interactionLayerRef.current;
    if (!canvas || !layer) return null;
    const logicalW = Math.max(1, layer.clientWidth || 1000);
    const logicalH = Math.max(1, layer.clientHeight || 1400);
    const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const scaleBoost = Math.max(1, (activeZoomScale || 1) * (povScale || 1));
    let dpr = Math.max(2.5, Math.min(deviceDpr * 2.5 * scaleBoost, 4));
    const maxDimDpr = Math.min(4096 / logicalW, 4096 / logicalH);
    dpr = Math.max(1, Math.min(dpr, maxDimDpr));
    const targetW = Math.round(logicalW * dpr);
    const targetH = Math.round(logicalH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      renderedPointCountRef.current = 0;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return ctx;
  }, [activeZoomScale, povScale]);

  const drawIncrementalLivePoints = useCallback(
    (pts: StrokePoint[], color: string, width: number) => {
      const ctx = ensureLiveCanvasSize();
      if (!ctx || pts.length === 0) return;

      const startIdx = renderedPointCountRef.current;
      if (startIdx >= pts.length) return;

      const drawColor =
        penTypeRef.current === 'highlighter' ? getBrightHighlighterColor(color) : color;
      ctx.save();
      ctx.strokeStyle = drawColor;
      ctx.fillStyle = drawColor;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (startIdx === 0) {
        const p0 = pts[0];
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, Math.max(0.5, width / 2), 0, Math.PI * 2);
        ctx.fill();
      }

      if (pts.length >= 2) {
        const firstSeg = Math.max(1, startIdx);
        ctx.beginPath();
        if (firstSeg === 1) {
          const p0 = pts[0];
          const p1 = pts[1];
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        } else {
          const pPrev2 = pts[firstSeg - 2];
          const pPrev1 = pts[firstSeg - 1];
          ctx.moveTo((pPrev2.x + pPrev1.x) / 2, (pPrev2.y + pPrev1.y) / 2);
        }

        for (let i = Math.max(2, firstSeg); i < pts.length; i++) {
          const p1 = pts[i - 1];
          const p2 = pts[i];
          ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        }
        ctx.stroke();
      }

      ctx.restore();
      renderedPointCountRef.current = pts.length;
    },
    [ensureLiveCanvasSize]
  );

  // Clean interaction state when switching modes or pages
  useEffect(() => {
    if (liveStrokeStreamTimerRef.current !== null) {
      window.clearInterval(liveStrokeStreamTimerRef.current);
      liveStrokeStreamTimerRef.current = null;
    }
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    strokeReachedMinPressureRef.current = false;
    pendingPenTailPointsRef.current = [];
    renderedPointCountRef.current = 0;
    pendingLiveCanvasClearRef.current = false;
    lastCommittedBridgeRef.current = null;
    clearLiveCanvas();
    activePointerIdRef.current = null;
    activeRecoveryWindowPointerIdRef.current = null;
    isStylusDownRef.current = false;
    contactingPenIdsRef.current.clear();
    confirmedDownPenIdsRef.current.clear();
    zeroContactMoveStreakRef.current.clear();
    pendingUpLostCaptureCountRef.current.clear();
    layerCapturedPointerIdsRef.current.clear();
    activeSmartStylusPointerIdRef.current = null;
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
  }, [mode, pageId, clearLiveCanvas]);

  const stopLiveStrokeStream = useCallback(() => {
    if (liveStrokeStreamTimerRef.current !== null) {
      window.clearInterval(liveStrokeStreamTimerRef.current);
      liveStrokeStreamTimerRef.current = null;
    }
  }, []);

  const commitActiveDrawingStrokeRef = useRef<(preserveBridgeForPointerId?: number) => void>(() => {});
  commitActiveDrawingStrokeRef.current = (preserveBridgeForPointerId?: number) => {
    if (!isDrawingRef.current) return;
    stopLiveStrokeStream();
    const pts = currentPointsRef.current.slice();
    const strokeMeta = activeStrokeMetaRef.current;
    activeStrokeMetaRef.current = null;
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    strokeReachedMinPressureRef.current = false;
    pendingPenTailPointsRef.current = [];
    renderedPointCountRef.current = 0;

    if (preserveBridgeForPointerId !== undefined && pts.length > 0) {
      lastCommittedBridgeRef.current = {
        pointerId: preserveBridgeForPointerId,
        point: pts[pts.length - 1],
        time: Date.now(),
      };
    } else {
      lastCommittedBridgeRef.current = null;
    }

    if (lastLiveOverlaySentNonNullRef.current && onLiveOverlayChange && !isAudienceViewer) {
      lastLiveOverlaySentNonNullRef.current = false;
      liveOverlayThrottleRef.current = Date.now();
      onLiveOverlayChange(null);
    }

    // Never commit a non-hardware-pen touch stroke if viewport zoomed/panned while it was drawn or pinch is active
    if (strokeMeta?.pointerType === 'touch') {
      const vp = zoomPanRef.current;
      const vpMoved =
        Math.abs(vp.zoomScale - strokeMeta.startZoom) > 0.002 ||
        Math.abs(povScaleRef.current - strokeMeta.startPovScale) > 0.002 ||
        Math.hypot(vp.panOffset.x - strokeMeta.startPanX, vp.panOffset.y - strokeMeta.startPanY) > 1.5;
      if (
        vpMoved ||
        isPinchingRef.current ||
        activeTouchCountRef.current >= 2 ||
        pinchSuppressedTouchPointerIdsRef.current.has(strokeMeta.pointerId)
      ) {
        clearLiveCanvas();
        return;
      }
    }

    if (pts.length >= 1) {
      const finalPoints =
        autoStraightenLinesRef.current && penType !== 'eraser'
          ? maybeStraightenStrokePoints(pts)
          : pts;
      const finalStrokeColor =
        penType === 'highlighter' ? getBrightHighlighterColor(currentColor) : currentColor;

      const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      pendingLiveCanvasClearRef.current = true;
      if (!isActivePage && onActivatePage) {
        onActivatePage();
      }
      onColorUsed(currentColor);

      const strokeObj: CanvasStroke = {
        id: strokeId,
        pageId,
        tool: penType,
        color: finalStrokeColor,
        width: strokeWidth,
        opacity: penType === 'highlighter' ? 0.52 : 1,
        points: finalPoints,
      };

      const guideTrack = activeGuideTrackRef.current;
      activeGuideTrackRef.current = null;
      setLiveGuidePreview(null);

      const gCfg = writingGuideConfigRef.current;
      const guidesCurrentlyActive =
        Boolean(gCfg?.enabled && !gCfg?.quickPaused) && penType !== 'eraser';

      let guideShapesToAdd: GeometricShape[] | undefined;
      let shapeIdsToDelete: string[] | undefined;
      let shapePatches: Array<{ id: string; patch: Partial<GeometricShape> }> | undefined;

      // Compute full stroke bounds
      let sMinX = Infinity;
      let sMaxX = -Infinity;
      let sMinY = Infinity;
      let sMaxY = -Infinity;
      for (let i = 0; i < finalPoints.length; i++) {
        const p = finalPoints[i];
        if (p.x < sMinX) sMinX = p.x;
        if (p.x > sMaxX) sMaxX = p.x;
        if (p.y < sMinY) sMinY = p.y;
        if (p.y > sMaxY) sMaxY = p.y;
      }

      if (guidesCurrentlyActive && finalPoints.length > 0 && Number.isFinite(sMinY)) {
        const cand = lastEqualCandidateRef.current;
        const strokeBounds = { minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY };

        if (
          gCfg?.mode === 'ignore_equals' &&
          cand &&
          cand.pageId === pageId &&
          areEqualSignPair(cand, strokeBounds)
        ) {
          // Two stacked horizontal strokes (=) detected: remove the equal sign's guideline(s)
          const existingIds = new Set(pageShapesRef.current.map((sh) => sh.id));
          const toDel = cand.shapeIds.filter((id) => existingIds.has(id));
          if (toDel.length > 0) {
            shapeIdsToDelete = toDel;
          }
          lastEqualCandidateRef.current = null;
        } else {
          lastEqualCandidateRef.current = null;

          if (guideTrack && gCfg) {
            const pageW = Math.max(
              100,
              interactionLayerRef.current?.clientWidth || stageDims.width || 612
            );

            if (
              guideTrack.kind === 'extend' &&
              gCfg.extendLines &&
              guideTrack.targetGuideId &&
              typeof guideTrack.anchorY === 'number' &&
              typeof guideTrack.spacing === 'number'
            ) {
              // Consume the current extension space so further letters inside it act normally,
              // and extend a new spaced guide below it.
              const prevExtTop =
                typeof guideTrack.extTop === 'number'
                  ? guideTrack.extTop
                  : guideTrack.anchorY - guideTrack.spacing;
              const nextExtY = guideTrack.anchorY + guideTrack.spacing;
              const nextExtId = `guide-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

              shapePatches = [
                {
                  id: guideTrack.targetGuideId,
                  patch: {
                    guideExtended: true,
                    guideBandTop: prevExtTop - 4,
                    guideBandBottom: guideTrack.anchorY + 2,
                  },
                },
              ];

              guideShapesToAdd = [
                {
                  id: nextExtId,
                  type: 'line',
                  pageId,
                  x: 0,
                  y: nextExtY,
                  width: pageW,
                  height: 0,
                  strokeColor: gCfg.color || '#5B7FA6',
                  strokeWidth: gCfg.thickness || 1.5,
                  strokeStyle: 'solid',
                  opacity: gCfg.opacity ?? 0.45,
                  isWritingGuide: true,
                  guideGroupId: guideTrack.groupId,
                  guideRole: 'extended',
                  guideExtTop: guideTrack.anchorY,
                  guideSpacing: guideTrack.spacing,
                  guideExtended: false,
                },
              ];
            } else if (guideTrack.kind === 'new') {
              const letterH = Math.max(0, sMaxY - sMinY);
              const topPad = Math.max(14, Math.min(36, letterH * 0.35));
              const bottomPad = gCfg.extendLines
                ? 2
                : Math.max(14, Math.min(34, letterH * 0.35));
              const bandTop = sMinY - topPad;
              const bandBottom = sMaxY + bottomPad;
              const guideGroupId = `guidegrp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const bottomId = `guide-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

              const created: GeometricShape[] = [
                {
                  id: bottomId,
                  type: 'line',
                  pageId,
                  x: 0,
                  y: sMaxY,
                  width: pageW,
                  height: 0,
                  strokeColor: gCfg.color || '#5B7FA6',
                  strokeWidth: gCfg.thickness || 1.5,
                  strokeStyle: 'solid',
                  opacity: gCfg.opacity ?? 0.45,
                  isWritingGuide: true,
                  guideGroupId,
                  guideRole: 'bottom',
                  guideBandTop: bandTop,
                  guideBandBottom: bandBottom,
                },
              ];

              if (guideTrack.showTop) {
                const topId = `guide-t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                created.push({
                  id: topId,
                  type: 'line',
                  pageId,
                  x: 0,
                  y: sMinY,
                  width: pageW,
                  height: 0,
                  strokeColor: gCfg.color || '#5B7FA6',
                  strokeWidth: gCfg.thickness || 1.5,
                  strokeStyle: 'solid',
                  opacity: gCfg.opacity ?? 0.45,
                  isWritingGuide: true,
                  guideGroupId,
                  guideRole: 'top',
                  guideBandTop: bandTop,
                  guideBandBottom: bandBottom,
                });
              }

              if (gCfg.extendLines) {
                const spacing = Math.max(24, letterH);
                const extId = `guide-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                created.push({
                  id: extId,
                  type: 'line',
                  pageId,
                  x: 0,
                  y: sMaxY + spacing,
                  width: pageW,
                  height: 0,
                  strokeColor: gCfg.color || '#5B7FA6',
                  strokeWidth: gCfg.thickness || 1.5,
                  strokeStyle: 'solid',
                  opacity: gCfg.opacity ?? 0.45,
                  isWritingGuide: true,
                  guideGroupId,
                  guideRole: 'extended',
                  guideExtTop: sMaxY,
                  guideSpacing: spacing,
                  guideExtended: false,
                });
              }

              guideShapesToAdd = created;

              if (
                gCfg.mode === 'ignore_equals' &&
                isStrokeRoughlyHorizontal(sMinX, sMaxX, sMinY, sMaxY)
              ) {
                lastEqualCandidateRef.current = {
                  pageId,
                  guideGroupId,
                  shapeIds: created.map((c) => c.id),
                  minX: sMinX,
                  maxX: sMaxX,
                  minY: sMinY,
                  maxY: sMaxY,
                };
              }
            }
          }
        }
      } else {
        lastEqualCandidateRef.current = null;
      }

      if (onCommitDrawingStrokeRef.current) {
        onCommitDrawingStrokeRef.current(
          strokeObj,
          guideShapesToAdd,
          shapeIdsToDelete,
          shapePatches
        );
      } else {
        onAddStrokeRef.current(strokeObj);
      }

      if (strokeMeta?.pointerType === 'touch') {
        const vp = zoomPanRef.current;
        const now = Date.now();
        recentTouchArtifactsRef.current = [
          ...recentTouchArtifactsRef.current.filter((a) => now - a.createdAt < 1200),
          {
            kind: 'stroke',
            id: strokeId,
            pointerId: strokeMeta.pointerId,
            startedAt: strokeMeta.startedAt,
            createdAt: now,
            endedByCancel: strokeMeta.endedByCancel,
            startZoom: strokeMeta.startZoom,
            startPovScale: strokeMeta.startPovScale,
            startPanX: strokeMeta.startPanX,
            startPanY: strokeMeta.startPanY,
            endZoom: vp.zoomScale,
            endPovScale: povScaleRef.current,
            endPanX: vp.panOffset.x,
            endPanY: vp.panOffset.y,
            points: pts,
          },
        ];
      }

      window.setTimeout(() => {
        if (pendingLiveCanvasClearRef.current && !isDrawingRef.current) {
          pendingLiveCanvasClearRef.current = false;
          clearLiveCanvas();
        }
      }, 64);
    } else {
      activeGuideTrackRef.current = null;
      setLiveGuidePreview(null);
      clearLiveCanvas();
    }
  };

  // Global pen contact tracking & safety reset if a pointer lifts or cancels outside the canvas layer
  // Ensure touch radius tracking and global hardware pen/touch reset stay active
  useEffect(() => {
    ensureTouchGeometryTracker();
    const trackPenDown = (ev: PointerEvent) => {
      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.add(ev.pointerId);
        contactingPenIdsRef.current.add(ev.pointerId);
        zeroContactMoveStreakRef.current.set(ev.pointerId, 0);
        lastStylusEventAtRef.current = Date.now();
        isStylusDownRef.current = true;
        isPinchingRef.current = false;
      }
    };
    const resetStuckPointer = (ev: PointerEvent) => {
      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.delete(ev.pointerId);
        contactingPenIdsRef.current.delete(ev.pointerId);
        zeroContactMoveStreakRef.current.delete(ev.pointerId);
        lastStylusEventAtRef.current = Date.now();
      }
      if (ev.pointerType === 'touch') {
        activeTouchPointerIdsRef.current.delete(ev.pointerId);
        pinchSuppressedTouchPointerIdsRef.current.delete(ev.pointerId);
        if (
          ev.type === 'pointercancel' &&
          activeStrokeMetaRef.current?.pointerId === ev.pointerId
        ) {
          activeStrokeMetaRef.current.endedByCancel = true;
        }
      }
      activePointerMetaRef.current.delete(ev.pointerId);
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
      }
      rejectedSmartTouchIdsRef.current.delete(ev.pointerId);
      palmTouchPointerIdsRef.current.delete(ev.pointerId);
      smartTouchCoordsRef.current.delete(ev.pointerId);
      clearPointerGeometryCache(ev.pointerId);
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      if (activeRecoveryWindowPointerIdRef.current === ev.pointerId) {
        activeRecoveryWindowPointerIdRef.current = null;
      }
      if (activePointerIdRef.current === ev.pointerId) {
        if (isDrawingRef.current) {
          if (
            ev.pointerType === 'touch' &&
            (isPinchingRef.current || activeTouchCountRef.current >= 2)
          ) {
            isDrawingRef.current = false;
            currentPointsRef.current = [];
            renderedPointCountRef.current = 0;
            activeStrokeMetaRef.current = null;
            stopLiveStrokeStream();
            clearLiveCanvas();
          } else {
            commitActiveDrawingStrokeRef.current();
          }
        }
        activePointerIdRef.current = null;
      }
    };
    window.addEventListener('pointerdown', trackPenDown, { capture: true, passive: true });
    window.addEventListener('pointerup', resetStuckPointer, { capture: false, passive: true });
    window.addEventListener('pointercancel', resetStuckPointer, { capture: false, passive: true });
    return () => {
      window.removeEventListener('pointerdown', trackPenDown, { capture: true });
      window.removeEventListener('pointerup', resetStuckPointer, { capture: false });
      window.removeEventListener('pointercancel', resetStuckPointer, { capture: false });
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

  // Throttled live in-progress overlay streaming to Audience Viewer tab (non-stroke tools; drawing strokes stream directly via timer)
  useEffect(() => {
    if (isAudienceViewer || !onLiveOverlayChange) return;

    const hasShape =
      mode === 'geometric' && shapeType !== 'angle' && !!shapeDragStart && !!shapeDragCurrent;
    const hasGraph = mode === 'graphing' && !!graphDragStart && !!graphDragCurrent;
    const hasAngle =
      mode === 'geometric' && shapeType === 'angle' && angleStep !== 'idle' && !!angleCenter;
    const hasDictatePreview =
      mode === 'dictate' && !!dictateDragStart && !!dictateDragCurrent;
    const hasPdfTextPreview =
      mode === 'pdf_editor' &&
      pdfEditorTool !== 'select' &&
      !!pdfTextDragStart &&
      !!pdfTextDragCurrent;

    if (!hasShape && !hasGraph && !hasAngle && !hasDictatePreview && !hasPdfTextPreview) {
      if (isDrawingRef.current) return;
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

    const ptScalePreview =
      (stageDims.width || 612) / (pdfWidth && pdfWidth > 0 ? pdfWidth : 612);

    const payload: LiveCanvasOverlay = {
      stroke: null,
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
      pdfTextPreview:
        hasPdfTextPreview && pdfTextDragStart && pdfTextDragCurrent
          ? {
              pageId,
              subMode: pdfEditorTool as 'height' | 'dimensions' | 'constant_font',
              start: pdfTextDragStart,
              current: pdfTextDragCurrent,
              constantFontSizePt: Math.max(10, Math.round(pdfDefaultTextStyle.fontSizePt * ptScalePreview)),
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
    currentColor,
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
    pdfEditorTool,
    pdfTextDragStart,
    pdfTextDragCurrent,
    pdfDefaultTextStyle.fontSizePt,
    stageDims.width,
    pdfWidth,
    angleStep,
    angleCenter,
    angleRadius,
    angleRay1,
    angleRay2,
    angleUnit,
    allowNegativeAngles,
    angleNegativeDirection,
  ]);

  useLayoutEffect(() => {
    if (pendingLiveCanvasClearRef.current) {
      pendingLiveCanvasClearRef.current = false;
      clearLiveCanvas();
    }
  }, [pageStrokes, clearLiveCanvas]);

  useEffect(() => {
    return () => {
      if (liveOverlayTimerRef.current) {
        window.clearTimeout(liveOverlayTimerRef.current);
      }
      if (liveStrokeStreamTimerRef.current !== null) {
        window.clearInterval(liveStrokeStreamTimerRef.current);
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
    } else if (selectedLineShapeId) {
      selPayload.shapeIds = [selectedLineShapeId];
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
    selectedLineShapeId,
    selectedDictateBoxId,
    isAudienceViewer,
    isActivePage,
  ]);

  useEffect(() => {
    if (mode !== 'edit' && selectedLineShapeId) {
      setSelectedLineShapeId(null);
    }
  }, [mode, selectedLineShapeId]);

  useEffect(() => {
    if (selectedLineShapeId && !pageShapes.some((sh) => sh.id === selectedLineShapeId)) {
      setSelectedLineShapeId(null);
    }
  }, [pageShapes, selectedLineShapeId]);

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

  // Helper to cleanly cancel a provisional Smart Tip / single-finger touch stroke when wide finger or 2-finger pinch arrives
  const abortActiveSmartTipTouch = useCallback(
    (pointerId?: number) => {
      // Never abort an active hardware stylus stroke
      if (
        contactingPenIdsRef.current.size > 0 ||
        activeStrokeMetaRef.current?.pointerType === 'pen'
      ) {
        return;
      }
      const targetId = pointerId ?? activeSmartStylusPointerIdRef.current ?? undefined;
      if (targetId !== undefined) {
        rejectedSmartTouchIdsRef.current.add(targetId);
        smartTouchCoordsRef.current.delete(targetId);
        const layer = interactionLayerRef.current;
        if (layer) {
          tryReleasePointerCapture(layer, targetId);
        }
      }
      activeSmartStylusPointerIdRef.current = null;
      if (contactingPenIdsRef.current.size === 0) {
        isStylusDownRef.current = false;
      }
      if (
        targetId == null ||
        activePointerIdRef.current === targetId ||
        activeStrokeMetaRef.current?.pointerType === 'touch'
      ) {
        activePointerIdRef.current = null;
        activeStrokeMetaRef.current = null;
        if (isDrawingRef.current) {
          isDrawingRef.current = false;
          currentPointsRef.current = [];
          renderedPointCountRef.current = 0;
          activeGuideTrackRef.current = null;
          setLiveGuidePreview(null);
          stopLiveStrokeStream();
          clearLiveCanvas();
          if (lastLiveOverlaySentNonNullRef.current && onLiveOverlayChange && !isAudienceViewer) {
            lastLiveOverlaySentNonNullRef.current = false;
            liveOverlayThrottleRef.current = Date.now();
            onLiveOverlayChange(null);
          }
        }
        setShapeDragStart(null);
        setShapeDragCurrent(null);
        setGraphDragStart(null);
        setGraphDragCurrent(null);
        setDictateDragStart(null);
        setDictateDragCurrent(null);
        setPdfTextDragStart(null);
        setPdfTextDragCurrent(null);
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
      }
    },
    [clearLiveCanvas, stopLiveStrokeStream, onLiveOverlayChange, isAudienceViewer]
  );

  // Retroactively delete provisional touch strokes/elements created right as a 2-finger pinch-to-zoom began
  const cleanupGuiltyTouchArtifacts = useCallback(
    (reason: 'pinch_start' | 'zoom_drift') => {
      if (stylusConfig.detectionMode === 'active_pen' && touchInputMode !== 'two_finger') {
        return;
      }
      if (contactingPenIdsRef.current.size > 0) return;

      // Suppress all currently down touch pointers so lifting one finger before the other never emits trailing strokes
      activeTouchPointerIdsRef.current.forEach((pid) => {
        pinchSuppressedTouchPointerIdsRef.current.add(pid);
      });
      if (activeSmartStylusPointerIdRef.current !== null) {
        pinchSuppressedTouchPointerIdsRef.current.add(activeSmartStylusPointerIdRef.current);
      }
      if (activePointerIdRef.current !== null && activeStrokeMetaRef.current?.pointerType === 'touch') {
        pinchSuppressedTouchPointerIdsRef.current.add(activePointerIdRef.current);
      }

      abortActiveSmartTipTouch(activeSmartStylusPointerIdRef.current ?? undefined);

      const now = Date.now();
      const isSmartTipMode =
        touchInputMode === 'two_finger_stylus' && stylusConfig.detectionMode === 'smart_tip';
      const maxWindowMs = isSmartTipMode ? 650 : 450;

      const strokeIds: string[] = [];
      const shapeIds: string[] = [];
      const graphIds: string[] = [];
      const calcIds: string[] = [];
      const dictateIds: string[] = [];
      const survivors: typeof recentTouchArtifactsRef.current = [];

      for (const item of recentTouchArtifactsRef.current) {
        if (now - item.createdAt > 1200) continue;

        const vpMoved =
          Math.abs(item.endZoom - item.startZoom) > 0.001 ||
          Math.abs(item.endPovScale - item.startPovScale) > 0.001 ||
          Math.hypot(item.endPanX - item.startPanX, item.endPanY - item.startPanY) > 1.2;
        const ageMs = now - item.createdAt;
        const overlappedPinch =
          activeTouchPointerIdsRef.current.has(item.pointerId) ||
          pinchSuppressedTouchPointerIdsRef.current.has(item.pointerId) ||
          (lastAllTouchLiftAtRef.current > 0 &&
            Math.abs(item.createdAt - lastAllTouchLiftAtRef.current) < 40 &&
            now - lastAllTouchLiftAtRef.current < 180);

        let isGuilty = false;
        if (item.endedByCancel || vpMoved || overlappedPinch) {
          isGuilty = true;
        } else if (reason === 'pinch_start' && ageMs <= maxWindowMs) {
          if (item.kind !== 'stroke') {
            isGuilty = ageMs <= (isSmartTipMode ? 550 : 280);
          } else if (isSmartTipMode) {
            isGuilty =
              ageMs <= 380 ||
              isStraightLineOrDotStroke(item.points) ||
              item.createdAt - item.startedAt <= 320;
          } else {
            isGuilty =
              ageMs <= 160 ||
              (isStraightLineOrDotStroke(item.points) && ageMs <= 260);
          }
        } else if (reason === 'zoom_drift' && ageMs <= 320) {
          if (item.kind === 'stroke' && isStraightLineOrDotStroke(item.points)) {
            isGuilty = true;
          }
        }

        if (isGuilty) {
          if (item.kind === 'stroke') strokeIds.push(item.id);
          else if (item.kind === 'shape') shapeIds.push(item.id);
          else if (item.kind === 'graph') graphIds.push(item.id);
          else if (item.kind === 'calc') calcIds.push(item.id);
          else if (item.kind === 'dictate') dictateIds.push(item.id);
        } else {
          survivors.push(item);
        }
      }

      recentTouchArtifactsRef.current = survivors;

      if (
        strokeIds.length > 0 ||
        shapeIds.length > 0 ||
        graphIds.length > 0 ||
        calcIds.length > 0 ||
        dictateIds.length > 0
      ) {
        onDiscardTouchArtifactsRef.current?.({
          strokeIds,
          shapeIds,
          graphIds,
          calcIds,
          dictateIds,
        });
      }
    },
    [abortActiveSmartTipTouch, stylusConfig.detectionMode, touchInputMode]
  );

  // If viewport zooms/pans (even from outer workspace POV pinch) while a touch stroke is actively drawing,
  // abort immediately so zooming never creates straight-line drawing artifacts.
  useEffect(() => {
    const meta = activeStrokeMetaRef.current;
    if (meta?.pointerType === 'touch' && isDrawingRef.current) {
      const vpMoved =
        Math.abs(activeZoomScale - meta.startZoom) > 0.002 ||
        Math.abs(povScale - meta.startPovScale) > 0.002 ||
        Math.hypot(activePanOffset.x - meta.startPanX, activePanOffset.y - meta.startPanY) > 1.5;
      if (vpMoved) {
        cleanupGuiltyTouchArtifacts('zoom_drift');
      }
    }
  }, [activeZoomScale, activePanOffset.x, activePanOffset.y, povScale, cleanupGuiltyTouchArtifacts]);

  // Two-Finger Pinch & Stretch to Zoom: Centers zooming exactly on finger midpoint
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isAudienceViewer) return;

    const getActiveFingerTouches = (touches: TouchList, forMove: boolean): Touch[] => {
      const list = Array.from(touches);
      // Always exclude explicit hardware stylus contacts so resting palm + active pen never reads as 2 fingers
      const nonStylusList = list.filter(
        (t) => (t as Touch & { touchType?: string }).touchType !== 'stylus'
      );
      if (touchInputMode === 'two_finger_stylus') {
        if (nonStylusList.length < list.length) {
          return nonStylusList;
        }
        if (stylusConfig.detectionMode === 'smart_tip') {
          if (contactingPenIdsRef.current.size > 0) {
            return [];
          }
          if (nonStylusList.length < 2) {
            return nonStylusList;
          }
          const maxTip = stylusConfig.maxTipSizePx ?? 14;
          const palmThreshold = Math.max(48, maxTip * 2.8);
          const smallMeasured = nonStylusList.filter((t) => {
            const g = getTouchContactDiameters(t);
            return g.isMeasured && g.size <= maxTip;
          });
          const palmMeasured = nonStylusList.filter((t) => {
            const g = getTouchContactDiameters(t);
            return g.isMeasured && g.size >= palmThreshold;
          });
          // Distinguish a stationary large resting palm + small passive stylus from two fingers pinching
          if (palmMeasured.length > 0 && smallMeasured.length > 0) {
            const palmMoved = palmMeasured.some((pt) => {
              const tr = touchMotionTrackRef.current.get(pt.identifier);
              return tr ? Math.hypot(pt.clientX - tr.startX, pt.clientY - tr.startY) >= 10 : false;
            });
            if (!palmMoved) {
              return nonStylusList.filter((t) => !smallMeasured.includes(t));
            }
          }
          // If one touch already drew a long/curved stroke (> 350ms) and a 2nd wide touch just landed,
          // wait until touches move >= 6px before confirming pinch so resting side-of-hand doesn't cancel writing
          if (
            !forMove &&
            !isPinchingRef.current &&
            isDrawingRef.current &&
            activeStrokeMetaRef.current?.pointerType === 'touch' &&
            Date.now() - activeStrokeMetaRef.current.startedAt > 350 &&
            currentPointsRef.current.length > 6 &&
            !isStraightLineOrDotStroke(currentPointsRef.current)
          ) {
            return smallMeasured.length > 0
              ? nonStylusList.filter((t) => !smallMeasured.includes(t))
              : nonStylusList;
          }
          if (
            forMove &&
            !isPinchingRef.current &&
            isDrawingRef.current &&
            activeStrokeMetaRef.current?.pointerType === 'touch' &&
            Date.now() - activeStrokeMetaRef.current.startedAt > 350 &&
            currentPointsRef.current.length > 6 &&
            !isStraightLineOrDotStroke(currentPointsRef.current)
          ) {
            const movedCount = nonStylusList.filter((t) => {
              const tr = touchMotionTrackRef.current.get(t.identifier);
              return tr ? Math.hypot(t.clientX - tr.startX, t.clientY - tr.startY) >= 6 : false;
            }).length;
            if (movedCount < 2 && smallMeasured.length > 0) {
              return nonStylusList.filter((t) => !smallMeasured.includes(t));
            }
          }
          return nonStylusList;
        }
        // Active Pen mode: preserve exact untouched active_pen behavior
        const hasTouchTypeApi = list.some(
          (t) => typeof (t as Touch & { touchType?: string }).touchType === 'string'
        );
        if (hasTouchTypeApi) {
          return nonStylusList;
        }
        return isStylusDownRef.current || contactingPenIdsRef.current.size > 0 ? [] : nonStylusList;
      }
      return nonStylusList;
    };

    const confirmAndInitPinch = (fingerTouches: Touch[]) => {
      isPinchingRef.current = true;
      cleanupGuiltyTouchArtifacts('pinch_start');

      const t0 = fingerTouches[0];
      const t1 = fingerTouches[1];
      const dist = Math.max(1, Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY));
      const mid = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };

      const rect = container.getBoundingClientRect();
      const outerScale = rect.width / (container.clientWidth || rect.width || 1);
      const localMidX = (mid.x - rect.left) / outerScale;
      const localMidY = (mid.y - rect.top) / outerScale;
      const focalStageX = (localMidX - panOffset.x) / zoomScale;
      const focalStageY = (localMidY - panOffset.y) / zoomScale;

      pinchInitialDistRef.current = dist;
      pinchInitialScaleRef.current = zoomScale;
      pinchFocalStageRef.current = { x: focalStageX, y: focalStageY };
    };

    const disqualifySmartTipIfTouchTooWide = (e: TouchEvent) => {
      if (
        stylusConfig.detectionMode !== 'smart_tip' ||
        activeSmartStylusPointerIdRef.current === null ||
        contactingPenIdsRef.current.size > 0
      ) {
        return;
      }
      const activeId = activeSmartStylusPointerIdRef.current;
      const storedCoord = smartTouchCoordsRef.current.get(activeId);
      const maxTip = stylusConfig.maxTipSizePx ?? 14;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if ((t as Touch & { touchType?: string }).touchType === 'stylus') continue;
        if (
          storedCoord &&
          Math.hypot(t.clientX - storedCoord.x, t.clientY - storedCoord.y) > 72
        ) {
          continue;
        }
        const geom = getTouchContactDiameters(t);
        const hasPenPressure = geom.force > 0 && Math.abs(geom.force - 0.5) > 0.01;
        const fits =
          geom.size <= maxTip || (hasPenPressure && geom.size <= maxTip + 6);
        if (geom.isMeasured && !fits) {
          abortActiveSmartTipTouch(activeId);
          break;
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const now = Date.now();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const ct = e.changedTouches[i];
        touchMotionTrackRef.current.set(ct.identifier, {
          startX: ct.clientX,
          startY: ct.clientY,
          lastX: ct.clientX,
          lastY: ct.clientY,
          downAt: now,
        });
      }
      recordTouchGeometry(e);
      disqualifySmartTipIfTouchTooWide(e);

      // Let Desmos boxes and Scientific Calculators handle their own internal pinch/touch gestures
      if ((e.target as HTMLElement)?.closest?.('.desmos-box, .calculator-box')) {
        return;
      }

      // In stylus_only or stylus_and_hand mode, all two-finger canvas touch controls are disabled
      if (touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand') {
        return;
      }

      const isHardwarePenActive =
        contactingPenIdsRef.current.size > 0 || Date.now() - lastStylusEventAtRef.current < 220;

      // Never let resting palm/wrist + hardware pen abort or block an active hardware stylus stroke
      if (isHardwarePenActive) {
        return;
      }
      if (
        stylusConfig.detectionMode !== 'smart_tip' &&
        (isStylusDownRef.current || (isDrawingRef.current && touchInputMode !== 'two_finger'))
      ) {
        return;
      }

      const fingerTouches = getActiveFingerTouches(e.touches, false);
      activeTouchCountRef.current =
        stylusConfig.detectionMode === 'smart_tip' ? fingerTouches.length : e.touches.length;
      if (fingerTouches.length >= 2) {
        e.preventDefault();
        confirmAndInitPinch(fingerTouches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const existing = touchMotionTrackRef.current.get(t.identifier);
        if (existing) {
          existing.lastX = t.clientX;
          existing.lastY = t.clientY;
        } else {
          touchMotionTrackRef.current.set(t.identifier, {
            startX: t.clientX,
            startY: t.clientY,
            lastX: t.clientX,
            lastY: t.clientY,
            downAt: Date.now(),
          });
        }
      }
      recordTouchGeometry(e);
      disqualifySmartTipIfTouchTooWide(e);

      if ((e.target as HTMLElement)?.closest?.('.desmos-box, .calculator-box')) {
        return;
      }

      if (touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand') {
        return;
      }

      if (contactingPenIdsRef.current.size > 0 || Date.now() - lastStylusEventAtRef.current < 220) {
        isPinchingRef.current = false;
        pinchInitialDistRef.current = null;
        pinchFocalStageRef.current = null;
        return;
      }

      // Active Pen mode: preserve untouched active_pen block
      if (
        stylusConfig.detectionMode !== 'smart_tip' &&
        (isStylusDownRef.current || (isDrawingRef.current && touchInputMode !== 'two_finger')) &&
        !isPinchingRef.current
      ) {
        isPinchingRef.current = false;
        pinchInitialDistRef.current = null;
        pinchFocalStageRef.current = null;
        return;
      }

      const fingerTouches = getActiveFingerTouches(e.touches, true);
      activeTouchCountRef.current =
        stylusConfig.detectionMode === 'smart_tip' ? fingerTouches.length : e.touches.length;
      if (e.touches.length < 2 || fingerTouches.length < 2) {
        if (isPinchingRef.current) {
          lastPinchEndedAtRef.current = Date.now();
        }
        isPinchingRef.current = false;
        pinchInitialDistRef.current = null;
        pinchFocalStageRef.current = null;
        return;
      }
      if (fingerTouches.length >= 2 && !isPinchingRef.current) {
        e.preventDefault();
        confirmAndInitPinch(fingerTouches);
      }

      if (
        fingerTouches.length >= 2 &&
        isPinchingRef.current &&
        pinchInitialDistRef.current &&
        pinchFocalStageRef.current
      ) {
        e.preventDefault();
        const t0 = fingerTouches[0];
        const t1 = fingerTouches[1];
        const currentDist = Math.max(1, Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY));
        const currentMid = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
        };

        const factor = currentDist / pinchInitialDistRef.current;
        const newScale = Math.max(0.6, Math.min(3.5, pinchInitialScaleRef.current * factor));

        const rect = container.getBoundingClientRect();
        const outerScale = rect.width / (container.clientWidth || rect.width || 1);
        const localMidX = (currentMid.x - rect.left) / outerScale;
        const localMidY = (currentMid.y - rect.top) / outerScale;
        const newPanX = localMidX - pinchFocalStageRef.current.x * newScale;
        const newPanY = localMidY - pinchFocalStageRef.current.y * newScale;

        setZoomScale(newScale);
        setPanOffset({
          x: newPanX,
          y: newPanY,
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const alive = new Set<number>();
      for (let i = 0; i < e.touches.length; i++) {
        alive.add(e.touches[i].identifier);
      }
      Array.from(touchMotionTrackRef.current.keys()).forEach((id) => {
        if (!alive.has(id)) touchMotionTrackRef.current.delete(id);
      });
      if (e.touches.length === 0) {
        lastAllTouchLiftAtRef.current = Date.now();
        palmTouchPointerIdsRef.current.clear();
        activeTouchPointerIdsRef.current.clear();
        pinchSuppressedTouchPointerIdsRef.current.clear();
        rejectedSmartTouchIdsRef.current.clear();
        smartTouchCoordsRef.current.clear();
        if (activeSmartStylusPointerIdRef.current !== null) {
          activeSmartStylusPointerIdRef.current = null;
        }
        if (
          activePointerIdRef.current !== null &&
          !contactingPenIdsRef.current.has(activePointerIdRef.current) &&
          activePointerMetaRef.current.get(activePointerIdRef.current)?.pointerType === 'touch'
        ) {
          activePointerIdRef.current = null;
        }
        activePointerMetaRef.current.forEach((meta, pid) => {
          if (meta.pointerType === 'touch') {
            activePointerMetaRef.current.delete(pid);
          }
        });
        if (contactingPenIdsRef.current.size === 0) {
          isStylusDownRef.current = false;
        }
      }
      recordTouchGeometry(e);
      const fingerTouches = getActiveFingerTouches(e.touches, false);
      activeTouchCountRef.current =
        stylusConfig.detectionMode === 'smart_tip' ? fingerTouches.length : e.touches.length;
      if (fingerTouches.length < 2) {
        if (isPinchingRef.current) {
          lastPinchEndedAtRef.current = Date.now();
        }
        isPinchingRef.current = false;
        pinchInitialDistRef.current = null;
        pinchFocalStageRef.current = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const outerScale = rect.width / (container.clientWidth || rect.width || 1);
        const cursorX = (e.clientX - rect.left) / outerScale;
        const cursorY = (e.clientY - rect.top) / outerScale;

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
  }, [
    mode,
    zoomScale,
    panOffset,
    touchInputMode,
    stylusConfig,
    isAudienceViewer,
    abortActiveSmartTipTouch,
    cleanupGuiltyTouchArtifacts,
  ]);

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

      const effectivePattern = template === 'pdf' ? underlayTemplate : template;

      // Grid / graph pattern if paper is grid or graph
      if (effectivePattern === 'grid' || effectivePattern === 'graph') {
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
      } else if (effectivePattern === 'lined') {
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
        ctx.lineWidth = 1;
        const lineSpacing = 32 * activeZoomScale;
        const startY = (-(stageCropTop * activeZoomScale) % lineSpacing + lineSpacing) % lineSpacing;
        for (let gy = startY; gy < screenH; gy += lineSpacing) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(screenW, gy);
          ctx.stroke();
        }
      } else if (effectivePattern === 'dotted') {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
        const spacing = 24 * activeZoomScale;
        const startX = (-(stageCropLeft * activeZoomScale) % spacing + spacing) % spacing;
        const startY = (-(stageCropTop * activeZoomScale) % spacing + spacing) % spacing;
        for (let gx = startX; gx < screenW; gx += spacing) {
          for (let gy = startY; gy < screenH; gy += spacing) {
            ctx.beginPath();
            ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
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
              ctx.save();
              if (effectivePattern !== 'blank') {
                ctx.globalCompositeOperation = 'multiply';
              }
              ctx.drawImage(img, pdfDrawX, pdfDrawY, pdfDrawW, pdfDrawH);
              ctx.restore();
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
        ctx.globalAlpha = sh.opacity ?? 1;
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

      // 5. Draw Pen Strokes (with 3-pass high-contrast highlighter compositing)
      for (const strk of pageStrokes) {
        if (strk.isGhosted || !strk.points || strk.points.length < 1) continue;

        const traceStrokeGeometry = () => {
          if (strk.points.length === 1) {
            const p0 = strk.points[0];
            ctx.beginPath();
            ctx.arc(
              (p0.x - stageCropLeft) * activeZoomScale,
              (p0.y - stageCropTop) * activeZoomScale,
              Math.max(0.5, (strk.width * activeZoomScale) / 2),
              0,
              Math.PI * 2
            );
            ctx.fill();
            return;
          }
          ctx.beginPath();
          const p0 = strk.points[0];
          ctx.moveTo(
            (p0.x - stageCropLeft) * activeZoomScale,
            (p0.y - stageCropTop) * activeZoomScale
          );
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
          ctx.lineTo(
            (pLast.x - stageCropLeft) * activeZoomScale,
            (pLast.y - stageCropTop) * activeZoomScale
          );
          ctx.stroke();
        };

        if (strk.tool === 'highlighter') {
          const brightHex = getBrightHighlighterColor(strk.color);
          const dodgeHex = getHighlighterDodgeColor(brightHex);
          const passes: Array<{
            composite: GlobalCompositeOperation;
            color: string;
            alpha: number;
          }> = [
            { composite: 'color-dodge', color: dodgeHex, alpha: 0.88 },
            { composite: 'color-burn', color: brightHex, alpha: 0.55 },
            { composite: 'multiply', color: brightHex, alpha: strk.opacity || 0.52 },
          ];
          for (const pass of passes) {
            ctx.save();
            ctx.globalCompositeOperation = pass.composite;
            ctx.globalAlpha = pass.alpha;
            ctx.strokeStyle = pass.color;
            ctx.fillStyle = pass.color;
            ctx.lineWidth = strk.width * activeZoomScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            traceStrokeGeometry();
            ctx.restore();
          }
        } else {
          ctx.save();
          ctx.strokeStyle = strk.color;
          ctx.fillStyle = strk.color;
          ctx.lineWidth = strk.width * activeZoomScale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (strk.tool === 'pencil') {
            ctx.globalAlpha = 0.85;
          }
          traceStrokeGeometry();
          ctx.restore();
        }
      }

      dataUrl = offscreen.toDataURL('image/png');
    }

    return dataUrl;
  };

  const trySetPointerCapture = (target: HTMLElement, pointerId: number) => {
    try {
      target.setPointerCapture(pointerId);
      layerCapturedPointerIdsRef.current.add(pointerId);
    } catch {
      // Ignore if pointer already inactive or capture unsupported
    }
  };

  const tryReleasePointerCapture = (target: HTMLElement, pointerId: number) => {
    layerCapturedPointerIdsRef.current.delete(pointerId);
    try {
      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  const recordExpectedUpLostCapture = (layerEl: HTMLElement | null, pointerId: number) => {
    let wasCaptured = layerCapturedPointerIdsRef.current.delete(pointerId);
    if (!wasCaptured && layerEl) {
      try {
        wasCaptured = layerEl.hasPointerCapture(pointerId);
      } catch {
        wasCaptured = false;
      }
    }
    if (wasCaptured) {
      const now = Date.now();
      const prev = pendingUpLostCaptureCountRef.current.get(pointerId);
      const activeCount = prev && now - prev.at < 1000 ? prev.count : 0;
      pendingUpLostCaptureCountRef.current.set(pointerId, {
        count: activeCount + 1,
        at: now,
      });
    }
  };

  // Helper: check if a native or React pen PointerEvent is physically contacting the surface (vs hovering)
  const isPenEventContacting = useCallback(
    (
      ev: Pick<PointerEvent, 'pointerType' | 'pointerId' | 'buttons' | 'pressure'> & {
        tangentialPressure?: number;
        getCoalescedEvents?: () => PointerEvent[];
      },
      trackMoveStreak = false
    ): boolean => {
      if (ev.pointerType !== 'pen') return false;
      const minCutoff =
        stylusConfigRef.current?.detectionMode === 'active_pen'
          ? stylusConfigRef.current?.minPenPressure ?? 0
          : 0;
      const hasButtonsContact = (ev.buttons & 1) !== 0 || (ev.buttons & 32) !== 0;
      // When buttons are already released mid-lift and pressure dropped into the calibrated hover tail below cutoff, stop extending the stroke
      const isReleasedLiftTail =
        minCutoff > 0 &&
        strokeReachedMinPressureRef.current &&
        !hasButtonsContact &&
        (ev.pressure ?? 0) < minCutoff;

      let hasPositiveSignal =
        !isReleasedLiftTail &&
        (hasButtonsContact || (ev.pressure ?? 0) > 0 || (ev.tangentialPressure ?? 0) > 0);
      if (!hasPositiveSignal && !isReleasedLiftTail && typeof ev.getCoalescedEvents === 'function') {
        try {
          const coalesced = ev.getCoalescedEvents();
          if (
            coalesced &&
            coalesced.some(
              (ce) =>
                (ce.buttons & 1) !== 0 ||
                (ce.buttons & 32) !== 0 ||
                (ce.pressure ?? 0) > 0 ||
                (ce.tangentialPressure ?? 0) > 0
            )
          ) {
            hasPositiveSignal = true;
          }
        } catch {
          // Ignore coalesced lookup errors
        }
      }
      if (hasPositiveSignal) {
        if (trackMoveStreak) {
          strokeSawPositiveContactRef.current = true;
          zeroContactMoveStreakRef.current.set(ev.pointerId, 0);
        }
        return true;
      }
      // On iPadOS Apple Pencil & WebKit, rapid touch-down or transient move frames inside a confirmed
      // pointerdown->pointerup window can temporarily report pressure===0 & buttons===0 while on the glass.
      if (confirmedDownPenIdsRef.current.has(ev.pointerId)) {
        if (!trackMoveStreak) return !isReleasedLiftTail;
        const elapsed = Date.now() - strokeStartTimestampRef.current;
        const nextStreak = (zeroContactMoveStreakRef.current.get(ev.pointerId) || 0) + 1;
        zeroContactMoveStreakRef.current.set(ev.pointerId, nextStreak);
        if (isReleasedLiftTail) {
          return nextStreak < 2;
        }
        if (!strokeSawPositiveContactRef.current || elapsed < 140 || nextStreak < 4) {
          return true;
        }
      }
      return false;
    },
    []
  );

  // Stylus Detection & Palm Rejection Gate (Active Pen vs Smart Tip Passive)
  const isPointerAccepted = useCallback(
    (
      e: Pick<
        PointerEvent,
        'pointerType' | 'pointerId' | 'width' | 'height' | 'pressure' | 'buttons' | 'clientX' | 'clientY'
      > & { getCoalescedEvents?: () => PointerEvent[] },
      phase: 'down' | 'move' | 'up'
    ): boolean => {
      if (isAudienceViewer) return false;
      if (e.pointerType === 'pen') return true;
      if (e.pointerType === 'mouse') return stylusConfig?.allowMouseInput ?? true;
      if (e.pointerType === 'touch') {
        // In 2-Finger Touch mode, single-finger capacitive touch always draws/erases/creates elements
        // (and 2 fingers pinch-zoom & pan).
        if (touchInputMode === 'two_finger') return true;
        // In Stylus modes with Active Pen selected, keep exact active_pen rejection behavior untouched.
        if (stylusConfig?.detectionMode !== 'smart_tip') {
          return false;
        }
        if (rejectedSmartTouchIdsRef.current.has(e.pointerId)) {
          return false;
        }
        if (phase === 'down' || phase === 'move') {
          smartTouchCoordsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }

        // Prevent a 2nd simultaneous touch pointer from overwriting an already-active smart-tip pointer
        if (
          phase === 'down' &&
          activeSmartStylusPointerIdRef.current !== null &&
          activeSmartStylusPointerIdRef.current !== e.pointerId &&
          smartTouchCoordsRef.current.has(activeSmartStylusPointerIdRef.current)
        ) {
          return false;
        }

        const metrics = getEffectiveTouchMetrics(e);
        const hasPenPressure = e.pressure > 0 && Math.abs(e.pressure - 0.5) > 0.01;
        const maxTip = stylusConfig.maxTipSizePx ?? 14;
        const fitsTip =
          metrics.size <= maxTip || (hasPenPressure && metrics.size <= maxTip + 6);

        const palmThreshold = Math.max(48, maxTip * 2.8);

        if (phase !== 'down' && activeSmartStylusPointerIdRef.current === e.pointerId) {
          if (metrics.isMeasured && !fitsTip) {
            if (metrics.size >= palmThreshold) {
              palmTouchPointerIdsRef.current.add(e.pointerId);
            }
            abortActiveSmartTipTouch(e.pointerId);
            return false;
          }
          return true;
        }

        // Note: touch pointermove events never hover (every touch move is physical contact) and usually have e.buttons === 0
        if (phase === 'down' || (phase === 'move' && !isDrawingRef.current)) {
          if (
            phase === 'move' &&
            (isPinchingRef.current ||
              activeTouchCountRef.current >= 2 ||
              pinchSuppressedTouchPointerIdsRef.current.has(e.pointerId) ||
              Date.now() - lastPinchEndedAtRef.current < 260)
          ) {
            return false;
          }
          if (fitsTip) {
            palmTouchPointerIdsRef.current.delete(e.pointerId);
            activeSmartStylusPointerIdRef.current = e.pointerId;
            isStylusDownRef.current = true;
            return true;
          } else {
            rejectedSmartTouchIdsRef.current.add(e.pointerId);
            if (metrics.isMeasured && metrics.size >= palmThreshold) {
              palmTouchPointerIdsRef.current.add(e.pointerId);
            }
            return false;
          }
        }
        return false;
      }
      return false;
    },
    [isAudienceViewer, stylusConfig, touchInputMode, abortActiveSmartTipTouch]
  );

  // Pointer Down (React fallback for non-inking modes; inking fast-path runs natively on interactionLayerRef)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (handledByNativeInkRef.current.has(e.nativeEvent)) {
      return;
    }
    if (e.pointerType === 'pen') {
      contactingPenIdsRef.current.add(e.pointerId);
      lastStylusEventAtRef.current = Date.now();
      isStylusDownRef.current = true;
      // An explicit hardware stylus contact must never be blocked by a stale pinch flag
      isPinchingRef.current = false;
    }

    let hadOtherActiveTouch = false;
    if (e.pointerType === 'touch') {
      if (!isPinchingRef.current && activeTouchCountRef.current < 2) {
        pinchSuppressedTouchPointerIdsRef.current.delete(e.pointerId);
      }
      hadOtherActiveTouch = Array.from(activeTouchPointerIdsRef.current).some(
        (id) =>
          id !== e.pointerId &&
          !(stylusConfig?.detectionMode === 'smart_tip' && palmTouchPointerIdsRef.current.has(id))
      );
      activeTouchPointerIdsRef.current.add(e.pointerId);
      activePointerMetaRef.current.set(e.pointerId, {
        pointerType: e.pointerType,
        downAt: Date.now(),
        startZoom: zoomPanRef.current.zoomScale,
        startPovScale: povScaleRef.current,
        startPanX: zoomPanRef.current.panOffset.x,
        startPanY: zoomPanRef.current.panOffset.y,
      });
    }

    if (!isPointerAccepted(e, 'down')) {
      return;
    }

    if (
      e.pointerType === 'touch' &&
      (isPinchingRef.current || activeTouchCountRef.current >= 2 || hadOtherActiveTouch) &&
      (touchInputMode === 'two_finger' ||
        (touchInputMode === 'two_finger_stylus' && stylusConfig?.detectionMode === 'smart_tip'))
    ) {
      return;
    }

    if (!isActivePage && onActivatePage) {
      onActivatePage();
    }

    // Never allow a non-pen touch/mouse to hijack an active stylus gesture
    if (
      e.pointerType !== 'pen' &&
      activePointerIdRef.current !== null &&
      activePointerIdRef.current !== e.pointerId &&
      (isStylusDownRef.current || isDrawingRef.current)
    ) {
      return;
    }

    // TOUCH CONTROLS MODE: Stylus zoom and pan tool overrides (both Stylus + Hand and Stylus Only)
    if (touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') {
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

    // Allow drawing, geometric shapes, dictate boxes, pdf text placement, and erasers directly on top of other elements!
    if (
      mode !== 'drawing' &&
      mode !== 'geometric' &&
      mode !== 'dictate' &&
      !(mode === 'pdf_editor' && pdfEditorTool !== 'select') &&
      !isAnyEraseActive &&
      (e.target as HTMLElement).closest(
        '.desmos-box, .calculator-box, .picture-box, .interactive-grid-box, .dictated-text-box, .pdf-text-element, .pdf-image-element'
      )
    ) {
      return;
    }
    if (presenterMode === 'laser' || presenterMode === 'spotlight') return;
    if (isPinchingRef.current && e.pointerType !== 'pen') return;

    // Deselect active items when clicking canvas background
    setSelectedGridShapeId(null);
    onStopEditGridDims?.();
    setSelectedGraphId(null);
    setSelectedCalcId(null);
    setSelectedImageId(null);
    if (editingDictateBoxId) {
      onStopManualEditDictateBox?.();
    }
    if (mode !== 'dictate') {
      onClickOutsideDictateBox?.();
    }
    if (mode === 'pdf_editor' && pdfEditorTool === 'select') {
      onStopEditPdfTextElement?.();
      onDeselectPdfTextElement?.();
      onDeselectPdfImageElement?.();
    }

    trySetPointerCapture(e.currentTarget, e.pointerId);
    activePointerIdRef.current = e.pointerId;

    const { x, y } = getStageCoords(e.clientX, e.clientY);
    const pressure = e.pressure ?? 0;

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
      const calcId = `calc-${Date.now()}`;
      const newCalc: CalculatorBox = {
        id: calcId,
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
      if (e.pointerType === 'touch') {
        const vp = zoomPanRef.current;
        const now = Date.now();
        recentTouchArtifactsRef.current = [
          ...recentTouchArtifactsRef.current.filter((a) => now - a.createdAt < 1200),
          {
            kind: 'calc',
            id: calcId,
            pointerId: e.pointerId,
            startedAt: now,
            createdAt: now,
            endedByCancel: false,
            startZoom: vp.zoomScale,
            startPovScale: povScaleRef.current,
            startPanX: vp.panOffset.x,
            startPanY: vp.panOffset.y,
            endZoom: vp.zoomScale,
            endPovScale: povScaleRef.current,
            endPanX: vp.panOffset.x,
            endPanY: vp.panOffset.y,
          },
        ];
      }
      return;
    }

    // DRAWING MODE fallback (if somehow invoked outside native DOM listener)
    if (mode === 'drawing') {
      startImmediateStroke(
        e.pointerId,
        e.pointerType,
        e.clientX,
        e.clientY,
        pressure,
        null,
        e.currentTarget,
        false
      );
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
          const rawAngle = Math.atan2(y - angleCenter.y, x - angleCenter.x);
          setAngleRay2((prev) => computeUnwrappedRay2(rawAngle, prev, angleRay1));
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

    // PDF EDITOR MODE (Add new native PDF text box)
    if (mode === 'pdf_editor' && pdfEditorTool !== 'select') {
      setPdfTextDragStart({ x, y });
      setPdfTextDragCurrent({ x, y });
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

  // Immediate-mode stroke initiator (zero React setState during stroke; renders directly on 2D <canvas>)
  const startImmediateStroke = useCallback(
    (
      pointerId: number,
      pointerType: string,
      clientX: number,
      clientY: number,
      rawPressure: number,
      coalesced: PointerEvent[] | null,
      captureTarget: HTMLElement | null,
      markWindowRecovery: boolean
    ) => {
      if (pointerType === 'pen') {
        confirmedDownPenIdsRef.current.add(pointerId);
        contactingPenIdsRef.current.add(pointerId);
        rejectedSmartTouchIdsRef.current.delete(pointerId);
        palmTouchPointerIdsRef.current.delete(pointerId);
        pinchSuppressedTouchPointerIdsRef.current.delete(pointerId);
        zeroContactMoveStreakRef.current.set(pointerId, 0);
        lastStylusEventAtRef.current = Date.now();
        isStylusDownRef.current = true;
        isPinchingRef.current = false;
      }

      // If an earlier stroke's pointerup was missed, commit it cleanly before starting the new word/stroke
      if (isDrawingRef.current && currentPointsRef.current.length > 0) {
        commitActiveDrawingStrokeRef.current();
      }

      activeStrokeSessionRef.current += 1;
      strokeStartTimestampRef.current = Date.now();
      strokeSawPositiveContactRef.current = rawPressure > 0;
      lastProcessedPointerMoveRef.current = null;

      const minCutoff =
        pointerType === 'pen' && stylusConfigRef.current?.detectionMode === 'active_pen'
          ? stylusConfigRef.current?.minPenPressure ?? 0
          : 0;
      pendingPenTailPointsRef.current = [];
      let reachedMin = pointerType !== 'pen' || minCutoff <= 0;

      if (captureTarget) {
        trySetPointerCapture(captureTarget, pointerId);
      }
      activePointerIdRef.current = pointerId;
      activeRecoveryWindowPointerIdRef.current = markWindowRecovery ? pointerId : null;

      // Defer UI deselections only if something was actually selected/editing
      if (selectedGridShapeId) {
        setSelectedGridShapeId(null);
        onStopEditGridDims?.();
      }
      if (selectedLineShapeId) setSelectedLineShapeId(null);
      if (selectedGraphId) setSelectedGraphId(null);
      if (selectedCalcId) setSelectedCalcId(null);
      if (selectedImageId) setSelectedImageId(null);
      if (editingDictateBoxId) {
        onStopManualEditDictateBox?.();
      }

      // Always keep at least the initial contact point(s) so quick light pen taps NEVER drop
      const initialPts: StrokePoint[] = [];
      if (coalesced && coalesced.length > 0) {
        for (let i = 0; i < coalesced.length; i++) {
          const ce = coalesced[i];
          const c = getStageCoords(ce.clientX, ce.clientY);
          const pVal = ce.pressure ?? rawPressure;
          if (pointerType === 'pen' && minCutoff > 0 && pVal >= minCutoff) {
            reachedMin = true;
          }
          const pt: StrokePoint = { x: c.x, y: c.y, pressure: pVal > 0 ? pVal : 0.5 };
          if (pointerType === 'pen' && minCutoff > 0 && reachedMin && pVal < minCutoff && initialPts.length >= 1) {
            pendingPenTailPointsRef.current.push(pt);
          } else {
            if (pendingPenTailPointsRef.current.length > 0) {
              initialPts.push(...pendingPenTailPointsRef.current);
              pendingPenTailPointsRef.current = [];
            }
            initialPts.push(pt);
          }
        }
      } else {
        const ptStage = getStageCoords(clientX, clientY);
        if (pointerType === 'pen' && minCutoff > 0 && rawPressure >= minCutoff) {
          reachedMin = true;
        }
        initialPts.push({ x: ptStage.x, y: ptStage.y, pressure: rawPressure > 0 ? rawPressure : 0.5 });
      }
      strokeReachedMinPressureRef.current = reachedMin;

      // If OS palm arbitration dropped capture mid-word within 140ms and we recovered the same pen pointer, bridge seamlessly
      const bridge = lastCommittedBridgeRef.current;
      if (
        bridge &&
        bridge.pointerId === pointerId &&
        Date.now() - bridge.time < 140 &&
        initialPts.length > 0 &&
        Math.hypot(initialPts[0].x - bridge.point.x, initialPts[0].y - bridge.point.y) < 120
      ) {
        initialPts.unshift(bridge.point);
      }
      lastCommittedBridgeRef.current = null;

      // Initialize dynamic Writing Guidelines tracking (regular row vs. active extension zone vs. new row)
      const gCfg = writingGuideConfigRef.current;
      if (gCfg?.enabled && !gCfg.quickPaused && penType !== 'eraser' && initialPts.length > 0) {
        const startY = initialPts[0].y;
        const inExistingBand = pageShapesRef.current.some((sh) => {
          if (!sh.isWritingGuide || sh.isGhosted) return false;
          if (sh.guideRole === 'extended' && !sh.guideExtended) {
            // When Extend Line is on, the unconsumed extension zone handles extensions below;
            // when Extend Line is off, treat it as a normal row so it stays clean.
            if (!gCfg.extendLines && typeof sh.guideExtTop === 'number') {
              return startY >= sh.guideExtTop - 4 && startY <= sh.y + 4;
            }
            return false;
          }
          if (typeof sh.guideBandTop === 'number' && typeof sh.guideBandBottom === 'number') {
            return startY >= sh.guideBandTop && startY <= sh.guideBandBottom;
          }
          return Math.abs(startY - sh.y) <= 14;
        });

        let gMinX = Infinity;
        let gMaxX = -Infinity;
        let gMinY = Infinity;
        let gMaxY = -Infinity;
        for (let i = 0; i < initialPts.length; i++) {
          const p = initialPts[i];
          if (p.x < gMinX) gMinX = p.x;
          if (p.x > gMaxX) gMaxX = p.x;
          if (p.y < gMinY) gMinY = p.y;
          if (p.y > gMaxY) gMaxY = p.y;
        }

        if (inExistingBand) {
          activeGuideTrackRef.current = null;
          setLiveGuidePreview(null);
        } else {
          // Check whether starting inside an unconsumed extension space (below parent bottom guide and above extended line)
          let matchingExt: GeometricShape | null = null;
          if (gCfg.extendLines) {
            let bestDist = Infinity;
            for (const sh of pageShapesRef.current) {
              if (
                !sh.isWritingGuide ||
                sh.isGhosted ||
                sh.guideRole !== 'extended' ||
                sh.guideExtended ||
                typeof sh.guideExtTop !== 'number'
              ) {
                continue;
              }
              if (startY > sh.guideExtTop + 2 && startY < sh.y) {
                const dist = sh.y - startY;
                if (dist < bestDist) {
                  bestDist = dist;
                  matchingExt = sh;
                }
              }
            }
          }

          if (matchingExt) {
            const spacing =
              matchingExt.guideSpacing ||
              Math.max(24, matchingExt.y - (matchingExt.guideExtTop ?? matchingExt.y - 28));
            activeGuideTrackRef.current = {
              kind: 'extend',
              targetGuideId: matchingExt.id,
              anchorY: matchingExt.y,
              spacing,
              extTop: matchingExt.guideExtTop,
              groupId: matchingExt.guideGroupId,
              minX: gMinX,
              maxX: gMaxX,
              minY: gMinY,
              maxY: gMaxY,
              showTop: false,
            };
            setLiveGuidePreview({
              topY: undefined,
              bottomY: matchingExt.y + spacing,
            });
          } else {
            const showTop =
              gCfg.mode === 'top_bottom' ||
              (gCfg.mode === 'ignore_equals' && gCfg.ignoreEqualsTopBottom);
            activeGuideTrackRef.current = {
              kind: 'new',
              minX: gMinX,
              maxX: gMaxX,
              minY: gMinY,
              maxY: gMaxY,
              showTop,
            };
            setLiveGuidePreview({
              topY: showTop ? gMinY : undefined,
              bottomY: gMaxY,
            });
          }
        }
      } else {
        activeGuideTrackRef.current = null;
        setLiveGuidePreview(null);
      }

      pendingLiveCanvasClearRef.current = false;
      clearLiveCanvas();
      activeStrokeMetaRef.current = {
        pointerId,
        pointerType,
        startedAt: strokeStartTimestampRef.current,
        startZoom: zoomPanRef.current.zoomScale,
        startPovScale: povScaleRef.current,
        startPanX: zoomPanRef.current.panOffset.x,
        startPanY: zoomPanRef.current.panOffset.y,
        endedByCancel: false,
      };
      isDrawingRef.current = true;
      currentPointsRef.current = initialPts;
      renderedPointCountRef.current = 0;
      drawIncrementalLivePoints(initialPts, currentColor, strokeWidth);

      // Start lightweight throttled live overlay stream for Audience View (does NOT re-render CanvasStage)
      if (!isAudienceViewer && onLiveOverlayChange && penType !== 'eraser') {
        stopLiveStrokeStream();
        liveStrokeStreamTimerRef.current = window.setInterval(() => {
          if (!isDrawingRef.current || currentPointsRef.current.length < 1) return;
          liveOverlayThrottleRef.current = Date.now();
          lastLiveOverlaySentNonNullRef.current = true;
          const gt = activeGuideTrackRef.current;
          const cfg = writingGuideConfigRef.current;
          onLiveOverlayChange({
            stroke: {
              pageId,
              tool: penType,
              color:
                penType === 'highlighter'
                  ? getBrightHighlighterColor(currentColor)
                  : currentColor,
              width: strokeWidth,
              opacity: penType === 'highlighter' ? 0.52 : 1,
              points: currentPointsRef.current.slice(),
            },
            writingGuides:
              gt && cfg
                ? {
                    pageId,
                    topY: gt.kind === 'new' && gt.showTop ? gt.minY : undefined,
                    bottomY:
                      gt.kind === 'extend'
                        ? (gt.anchorY ?? gt.maxY) + (gt.spacing || 28)
                        : gt.maxY,
                    color: cfg.color,
                    thickness: cfg.thickness,
                    opacity: cfg.opacity,
                  }
                : null,
            shape: null,
            graphMarquee: null,
            angle: null,
            dictatePreview: null,
          });
        }, 36);
      }
    },
    [
      selectedGridShapeId,
      onStopEditGridDims,
      selectedGraphId,
      selectedCalcId,
      selectedImageId,
      editingDictateBoxId,
      onStopManualEditDictateBox,
      getStageCoords,
      clearLiveCanvas,
      drawIncrementalLivePoints,
      currentColor,
      strokeWidth,
      isAudienceViewer,
      onLiveOverlayChange,
      penType,
      pageId,
      stopLiveStrokeStream,
    ]
  );

  const appendCoalescedDrawingPoints = useCallback(
    (clientX: number, clientY: number, rawPressure: number, coalesced: PointerEvent[] | null) => {
      const meta = activeStrokeMetaRef.current;
      if (meta?.pointerType === 'touch') {
        const vp = zoomPanRef.current;
        const vpMoved =
          Math.abs(vp.zoomScale - meta.startZoom) > 0.002 ||
          Math.abs(povScaleRef.current - meta.startPovScale) > 0.002 ||
          Math.hypot(vp.panOffset.x - meta.startPanX, vp.panOffset.y - meta.startPanY) > 1.5;
        if (vpMoved || isPinchingRef.current || activeTouchCountRef.current >= 2) {
          cleanupGuiltyTouchArtifacts('zoom_drift');
          return;
        }
      }
      const pts = currentPointsRef.current;
      const isActivePenFilter =
        meta?.pointerType === 'pen' &&
        stylusConfigRef.current?.detectionMode === 'active_pen' &&
        (stylusConfigRef.current?.minPenPressure ?? 0) > 0;
      const minCutoff = isActivePenFilter ? stylusConfigRef.current?.minPenPressure ?? 0 : 0;

      const pushFilteredPoint = (px: number, py: number, pRaw: number) => {
        const pt: StrokePoint = { x: px, y: py, pressure: pRaw > 0 ? pRaw : 0.5 };
        if (!isActivePenFilter) {
          pts.push(pt);
          return;
        }
        if (pRaw >= minCutoff) {
          strokeReachedMinPressureRef.current = true;
          if (pendingPenTailPointsRef.current.length > 0) {
            pts.push(...pendingPenTailPointsRef.current);
            pendingPenTailPointsRef.current = [];
          }
          pts.push(pt);
        } else if (!strokeReachedMinPressureRef.current) {
          // Stroke has not yet reached cutoff pressure (quick light tap or pressureless pen) -> never drop
          pts.push(pt);
        } else {
          // Buffer low-pressure lift tail; flushed if pen presses back down, or trimmed away cleanly on lift
          pendingPenTailPointsRef.current.push(pt);
        }
      };

      const prevCount = pts.length;
      if (coalesced && coalesced.length > 0) {
        for (let i = 0; i < coalesced.length; i++) {
          const ce = coalesced[i];
          const c = getStageCoords(ce.clientX, ce.clientY);
          pushFilteredPoint(c.x, c.y, ce.pressure ?? rawPressure);
        }
      } else {
        const pt = getStageCoords(clientX, clientY);
        pushFilteredPoint(pt.x, pt.y, rawPressure);
      }
      if (pts.length > prevCount) {
        drawIncrementalLivePoints(pts, currentColor, strokeWidth);
        const track = activeGuideTrackRef.current;
        if (track && track.kind === 'new') {
          let changed = false;
          for (let i = prevCount; i < pts.length; i++) {
            const pt = pts[i];
            if (pt.x < track.minX) track.minX = pt.x;
            if (pt.x > track.maxX) track.maxX = pt.x;
            if (pt.y < track.minY) {
              track.minY = pt.y;
              changed = true;
            }
            if (pt.y > track.maxY) {
              track.maxY = pt.y;
              changed = true;
            }
          }
          if (changed) {
            setLiveGuidePreview({
              topY: track.showTop ? track.minY : undefined,
              bottomY: track.maxY,
            });
          }
        }
      }
    },
    [getStageCoords, drawIncrementalLivePoints, currentColor, strokeWidth, cleanupGuiltyTouchArtifacts]
  );

  // Pointer Move (React fallback for non-inking modes; inking fast-path runs natively on interactionLayerRef)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const nativeEv = e.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    if (handledByNativeInkRef.current.has(nativeEv) || lastProcessedPointerMoveRef.current === nativeEv) {
      return;
    }
    lastProcessedPointerMoveRef.current = nativeEv;

    if (!isPointerAccepted(e, 'move')) {
      return;
    }

    if (e.pointerType === 'pen') {
      lastStylusEventAtRef.current = Date.now();
    }

    const isPenContacting = isPenEventContacting(nativeEv);
    const isPenHovering = e.pointerType === 'pen' && !isPenContacting;

    // If hardware pen lifted into hover and browser missed pointerup, cleanly commit the open stroke
    if (isPenHovering) {
      contactingPenIdsRef.current.delete(e.pointerId);
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      if (activeRecoveryWindowPointerIdRef.current === e.pointerId) {
        activeRecoveryWindowPointerIdRef.current = null;
      }
      if (activePointerIdRef.current === e.pointerId) {
        if (isDrawingRef.current) {
          commitActiveDrawingStrokeRef.current();
        }
        activePointerIdRef.current = null;
      }
      return;
    }

    if (isPenContacting) {
      contactingPenIdsRef.current.add(e.pointerId);
      isStylusDownRef.current = true;
      isPinchingRef.current = false;
      // Allow a currently drawing pen to pre-empt any stale pointerId (e.g., missed pointerup between words)
      if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
        if (isDrawingRef.current && currentPointsRef.current.length > 0) {
          commitActiveDrawingStrokeRef.current();
        }
        activePointerIdRef.current = e.pointerId;
      }
    } else if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    if (isPinchingRef.current && e.pointerType !== 'pen') return;

    // TOUCH CONTROLS MODE: Dynamic Stylus Zoom and Pan (both Stylus + Hand and Stylus Only)
    if (touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') {
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
          const outerScale = rect.width / (container.clientWidth || rect.width || 1);
          const focalClientX = (stylusZoomAnchor.clientX - rect.left) / outerScale;
          const focalClientY = (stylusZoomAnchor.clientY - rect.top) / outerScale;
          setPanOffset({
            x: focalClientX - stylusZoomAnchor.stageX * newScale,
            y: focalClientY - stylusZoomAnchor.stageY * newScale,
          });
        }
        setZoomScale(newScale);
        return;
      }
      if (leftToolbarTool === 'pan' && stylusPanStart && isCapturedOrPressed) {
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        const outerScale =
          container && rect ? rect.width / (container.clientWidth || rect.width || 1) : 1;
        const dx = (e.clientX - stylusPanStart.clientX) / outerScale;
        const dy = (e.clientY - stylusPanStart.clientY) / outerScale;
        setPanOffset({
          x: stylusPanStart.initialPanX + dx,
          y: stylusPanStart.initialPanY + dy,
        });
        return;
      }
    }

    const { x, y } = getStageCoords(e.clientX, e.clientY);
    const pressure = e.pressure ?? 0;

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
      const coalesced =
        typeof nativeEv.getCoalescedEvents === 'function'
          ? nativeEv.getCoalescedEvents()
          : null;

      if (!isDrawingRef.current) {
        const touchNotPinching =
          e.pointerType === 'touch' &&
          !isPinchingRef.current &&
          activeTouchCountRef.current < 2 &&
          !pinchSuppressedTouchPointerIdsRef.current.has(e.pointerId) &&
          Date.now() - lastPinchEndedAtRef.current >= 260;
        const isSmartTipContacting =
          touchNotPinching &&
          (touchInputMode === 'two_finger' ||
            (stylusConfig?.detectionMode === 'smart_tip' &&
              activeSmartStylusPointerIdRef.current === e.pointerId));
        const isMouseContacting =
          e.pointerType === 'mouse' &&
          (stylusConfig?.allowMouseInput ?? true) &&
          (e.buttons & 1) !== 0;

        if (isPenContacting || isSmartTipContacting || isMouseContacting) {
          startImmediateStroke(
            e.pointerId,
            e.pointerType,
            e.clientX,
            e.clientY,
            pressure,
            coalesced,
            e.currentTarget,
            false
          );
          return;
        }
      }

      if (isDrawingRef.current) {
        appendCoalescedDrawingPoints(e.clientX, e.clientY, pressure, coalesced);
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
        if (angleStep === 'ray1_drag' && angleCenter && (e.buttons & 1) !== 0) {
          setAngleRay1(Math.atan2(y - angleCenter.y, x - angleCenter.x));
          return;
        }
        if (angleStep === 'ray2_drag' && angleCenter && (e.buttons & 1) !== 0) {
          const rawAngle = Math.atan2(y - angleCenter.y, x - angleCenter.x);
          setAngleRay2((prev) => computeUnwrappedRay2(rawAngle, prev, angleRay1));
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

    if (mode === 'pdf_editor' && pdfTextDragStart) {
      setPdfTextDragCurrent({ x, y });
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
      const padY = sh.type === 'line' && shMaxY - shMinY < 6 ? 6 : 0;
      const isTouching = !(
        shMaxX < minX ||
        shMinX > maxX ||
        shMaxY + padY < minY ||
        shMinY - padY > maxY
      );

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

  // Pointer Up (React fallback for non-inking modes; inking fast-path runs natively on interactionLayerRef)
  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (handledByNativeInkRef.current.has(e.nativeEvent)) {
      return;
    }
    const pMeta = activePointerMetaRef.current.get(e.pointerId);
    activePointerMetaRef.current.delete(e.pointerId);
    const accepted = isPointerAccepted(e, 'up');
    if (e.pointerType === 'pen') {
      contactingPenIdsRef.current.delete(e.pointerId);
      lastStylusEventAtRef.current = Date.now();
    }
    const wasPinchSuppressed =
      e.pointerType === 'touch' && pinchSuppressedTouchPointerIdsRef.current.has(e.pointerId);
    if (e.pointerType === 'touch') {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
      pinchSuppressedTouchPointerIdsRef.current.delete(e.pointerId);
    }
    if (activeSmartStylusPointerIdRef.current === e.pointerId) {
      activeSmartStylusPointerIdRef.current = null;
    }
    rejectedSmartTouchIdsRef.current.delete(e.pointerId);
    palmTouchPointerIdsRef.current.delete(e.pointerId);
    smartTouchCoordsRef.current.delete(e.pointerId);
    clearPointerGeometryCache(e.pointerId);
    if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
      isStylusDownRef.current = false;
    }
    if (activeRecoveryWindowPointerIdRef.current === e.pointerId) {
      activeRecoveryWindowPointerIdRef.current = null;
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

    if (
      e.pointerType === 'touch' &&
      (wasPinchSuppressed || isPinchingRef.current || activeTouchCountRef.current >= 2)
    ) {
      setShapeDragStart(null);
      setShapeDragCurrent(null);
      setGraphDragStart(null);
      setGraphDragCurrent(null);
      setDictateDragStart(null);
      setDictateDragCurrent(null);
      setPdfTextDragStart(null);
      setPdfTextDragCurrent(null);
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
      return;
    }

    const recordPlacedTouchArtifact = (kind: 'shape' | 'graph' | 'dictate', id: string) => {
      if (e.pointerType !== 'touch') return;
      const vp = zoomPanRef.current;
      const now = Date.now();
      recentTouchArtifactsRef.current = [
        ...recentTouchArtifactsRef.current.filter((a) => now - a.createdAt < 1200),
        {
          kind,
          id,
          pointerId: e.pointerId,
          startedAt: pMeta?.downAt ?? now,
          createdAt: now,
          endedByCancel: false,
          startZoom: pMeta?.startZoom ?? vp.zoomScale,
          startPovScale: pMeta?.startPovScale ?? povScaleRef.current,
          startPanX: pMeta?.startPanX ?? vp.panOffset.x,
          startPanY: pMeta?.startPanY ?? vp.panOffset.y,
          endZoom: vp.zoomScale,
          endPovScale: povScaleRef.current,
          endPanX: vp.panOffset.x,
          endPanY: vp.panOffset.y,
        },
      ];
    };

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
            const isPointClick =
              Math.abs(maxX - minX) < 6 && Math.abs(maxY - minY) < 6;
            if (
              isPointClick &&
              (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow')
            ) {
              const d = distToSegment(
                { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
                { x: sh.x, y: sh.y },
                { x: sh.x + sh.width, y: sh.y + sh.height }
              );
              if (d <= Math.max(12, (sh.strokeWidth || 2) / 2 + 10)) {
                ghostedShapeIds.push(sh.id);
              }
            } else {
              const aabb = getRotatedBoxAabb(sh.x, sh.y, sh.width, sh.height, sh.rotation || 0);
              const padY = sh.type === 'line' && aabb.maxY - aabb.minY < 6 ? 6 : 0;
              const overlaps = !(
                aabb.maxX < minX ||
                aabb.minX > maxX ||
                aabb.maxY + padY < minY ||
                aabb.minY - padY > maxY
              );
              if (overlaps) {
                ghostedShapeIds.push(sh.id);
              }
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

    // DRAWING COMMIT fallback
    if (mode === 'drawing') {
      if (isDrawingRef.current) {
        const pts = currentPointsRef.current;
        const rawUpPressure = e.pressure ?? 0;
        const minCutoff =
          e.pointerType === 'pen' && stylusConfigRef.current?.detectionMode === 'active_pen'
            ? stylusConfigRef.current?.minPenPressure ?? 0
            : 0;
        const shouldSuppressUpTail =
          e.pointerType === 'pen' &&
          minCutoff > 0 &&
          strokeReachedMinPressureRef.current &&
          rawUpPressure < minCutoff;
        const lastPt = pts[pts.length - 1];
        if (!shouldSuppressUpTail && (!lastPt || Math.hypot(x - lastPt.x, y - lastPt.y) > 0.25)) {
          pts.push({ x, y, pressure: rawUpPressure > 0 ? rawUpPressure : 0.5 });
          drawIncrementalLivePoints(pts, currentColor, strokeWidth);
        }
        commitActiveDrawingStrokeRef.current();
      }
      return;
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
      recordPlacedTouchArtifact('graph', newGraph.id);
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
          gridCols = Math.max(1, Math.round(absW / 28));
          gridRows = Math.max(1, Math.round(absH / 28));
        }

        const newShape: GeometricShape = {
          id: `shape-${Date.now()}`,
          pageId,
          type: shapeType,
          x: shapeType === 'grid' ? minX : shapeDragStart.x,
          y: shapeType === 'grid' ? minY : shapeDragStart.y,
          width: shapeType === 'grid' ? Math.max(20, absW) : w,
          height: shapeType === 'grid' ? Math.max(20, absH) : h,
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
        recordPlacedTouchArtifact('shape', newShape.id);
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
        recordPlacedTouchArtifact('dictate', id);
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
        recordPlacedTouchArtifact('dictate', id);
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
        recordPlacedTouchArtifact('dictate', id);
      }
      return;
    }

    // PDF EDITOR: PLACE NEW TEXT BOX (OR TAP TO SELECT EXISTING PDF ELEMENT)
    if (mode === 'pdf_editor' && pdfTextDragStart && pdfTextDragCurrent) {
      const start = pdfTextDragStart;
      const current = pdfTextDragCurrent;
      setPdfTextDragStart(null);
      setPdfTextDragCurrent(null);

      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const dist = Math.hypot(dx, dy);

      const safeStageW = interactionLayerRef.current?.clientWidth || stageDims.width || 612;
      const safeStageH = interactionLayerRef.current?.clientHeight || stageDims.height || 792;
      const safePdfW = pdfWidth && pdfWidth > 0 ? pdfWidth : 612;
      const pxToPt = safePdfW / safeStageW;

      if (dist < 10) {
        // Hit-test existing PDF text elements first
        for (let i = pagePdfTextElements.length - 1; i >= 0; i--) {
          const el = pagePdfTextElements[i];
          if (el.status === 'deleted') continue;
          const bx = el.nx * safeStageW;
          const by = el.ny * safeStageH;
          const bw = el.nw * safeStageW;
          const bh = el.nh * safeStageH;
          if (isPointInRotatedBox(start.x, start.y, bx, by, bw, bh, el.rotation || 0, 6)) {
            const now = Date.now();
            const prevTap = lastPdfTextTapRef.current;
            if (
              prevTap &&
              prevTap.id === el.id &&
              now - prevTap.time < 380 &&
              Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 28
            ) {
              lastPdfTextTapRef.current = null;
              onStartEditPdfTextElement?.(el.id);
            } else {
              lastPdfTextTapRef.current = { id: el.id, time: now, x: e.clientX, y: e.clientY };
              onSelectPdfTextElement?.(el.id);
            }
            return;
          }
        }
        // Hit-test existing PDF image elements
        for (let i = pagePdfImageElements.length - 1; i >= 0; i--) {
          const imgEl = pagePdfImageElements[i];
          if (imgEl.status === 'deleted') continue;
          const bx = imgEl.nx * safeStageW;
          const by = imgEl.ny * safeStageH;
          const bw = imgEl.nw * safeStageW;
          const bh = imgEl.nh * safeStageH;
          if (isPointInRotatedBox(start.x, start.y, bx, by, bw, bh, imgEl.rotation || 0, 6)) {
            lastPdfTextTapRef.current = null;
            onSelectPdfImageElement?.(imgEl.id);
            return;
          }
        }
        lastPdfTextTapRef.current = null;
        onStopEditPdfTextElement?.();
        onDeselectPdfTextElement?.();
        onDeselectPdfImageElement?.();
        return;
      }

      const id = `pdf-text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (pdfEditorTool === 'height') {
        const fontPx = Math.max(12, Math.abs(dy));
        const fontSizePt = Math.max(8, Math.min(180, Math.round(fontPx * pxToPt * 10) / 10));
        const boxH = Math.max(16, Math.round(fontPx * 1.15));
        const boxW = Math.max(140, Math.round(fontPx * 3.5));
        const topY = Math.min(start.y, current.y);
        onAddPdfTextElement?.({
          id,
          pageId,
          origin: 'added',
          status: 'edited',
          nx: Math.max(0, Math.min(0.95, start.x / safeStageW)),
          ny: Math.max(0, Math.min(0.95, topY / safeStageH)),
          nw: Math.min(0.95, boxW / safeStageW),
          nh: Math.min(0.95, boxH / safeStageH),
          text: '',
          fontSizePt,
          fontFamily: pdfDefaultTextStyle.fontFamily,
          bold: pdfDefaultTextStyle.bold,
          italic: pdfDefaultTextStyle.italic,
          underline: pdfDefaultTextStyle.underline,
          color: pdfDefaultTextStyle.color,
          align: pdfDefaultTextStyle.align,
          rotation: 0,
          wrap: false,
        });
      } else if (pdfEditorTool === 'dimensions') {
        const minX = Math.min(start.x, current.x);
        const minY = Math.min(start.y, current.y);
        const w = Math.max(80, Math.round(Math.abs(dx)));
        const h = Math.max(16, Math.round(Math.abs(dy)));
        const fontSizePt = Math.max(8, Math.min(180, Math.round(h * pxToPt * 10) / 10));
        onAddPdfTextElement?.({
          id,
          pageId,
          origin: 'added',
          status: 'edited',
          nx: Math.max(0, Math.min(0.95, minX / safeStageW)),
          ny: Math.max(0, Math.min(0.95, minY / safeStageH)),
          nw: Math.min(0.95, w / safeStageW),
          nh: Math.min(0.95, Math.max(h, Math.round(h * 1.12)) / safeStageH),
          text: '',
          fontSizePt,
          fontFamily: pdfDefaultTextStyle.fontFamily,
          bold: pdfDefaultTextStyle.bold,
          italic: pdfDefaultTextStyle.italic,
          underline: pdfDefaultTextStyle.underline,
          color: pdfDefaultTextStyle.color,
          align: pdfDefaultTextStyle.align,
          rotation: 0,
          wrap: true,
        });
      } else {
        // constant_font: horizontal drag sets wrap width using pdfDefaultTextStyle.fontSizePt
        const fontSizePt = Math.max(6, Math.min(180, pdfDefaultTextStyle.fontSizePt));
        const fontPx = fontSizePt / pxToPt;
        const minX = Math.min(start.x, current.x);
        const w = Math.max(80, Math.round(Math.abs(dx)));
        const h = Math.max(16, Math.round(fontPx * 1.15));
        const topY = Math.max(4, Math.round(start.y - fontPx * 0.5));
        onAddPdfTextElement?.({
          id,
          pageId,
          origin: 'added',
          status: 'edited',
          nx: Math.max(0, Math.min(0.95, minX / safeStageW)),
          ny: Math.max(0, Math.min(0.95, topY / safeStageH)),
          nw: Math.min(0.95, w / safeStageW),
          nh: Math.min(0.95, h / safeStageH),
          text: '',
          fontSizePt,
          fontFamily: pdfDefaultTextStyle.fontFamily,
          bold: pdfDefaultTextStyle.bold,
          italic: pdfDefaultTextStyle.italic,
          underline: pdfDefaultTextStyle.underline,
          color: pdfDefaultTextStyle.color,
          align: pdfDefaultTextStyle.align,
          rotation: 0,
          wrap: true,
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

    // EDIT MODE: MAGIC GRAB LASSO / CLICK-TO-SELECT LINE COMMIT
    if (mode === 'edit' && isMagicGrabActive && lassoStart && lassoCurrent) {
      const minX = Math.min(lassoStart.x, lassoCurrent.x);
      const maxX = Math.max(lassoStart.x, lassoCurrent.x);
      const minY = Math.min(lassoStart.y, lassoCurrent.y);
      const maxY = Math.max(lassoStart.y, lassoCurrent.y);
      const dragDist = Math.hypot(lassoCurrent.x - lassoStart.x, lassoCurrent.y - lassoStart.y);

      setLassoStart(null);
      setLassoCurrent(null);

      // Single click / tap near a line (e.g. writing guideline or regular line shape) selects it directly for editing & deletion
      if (dragDist < 6) {
        let bestLine: GeometricShape | null = null;
        let bestDist = Infinity;
        for (let i = pageShapes.length - 1; i >= 0; i--) {
          const sh = pageShapes[i];
          if (sh.isGhosted || sh.type !== 'line') continue;
          const tol = Math.max(14, (sh.strokeWidth || 2) / 2 + 11);
          const d = distToSegment(
            { x, y },
            { x: sh.x, y: sh.y },
            { x: sh.x + sh.width, y: sh.y + sh.height }
          );
          if (d <= tol && d < bestDist) {
            bestDist = d;
            bestLine = sh;
          }
        }
        if (bestLine) {
          setGrabSelection(null);
          setSelectedLineShapeId(bestLine.id);
          return;
        }
      }
      setSelectedLineShapeId(null);

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

  // Pointer Cancel (reset stylus / gesture states cleanly without letting rejected palm touches cancel active pen ink)
  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (handledByNativeInkRef.current.has(e.nativeEvent)) {
      return;
    }
    if (e.pointerType === 'pen') {
      contactingPenIdsRef.current.delete(e.pointerId);
    }
    const wasPinchSuppressed =
      e.pointerType === 'touch' &&
      (isPinchingRef.current ||
        activeTouchCountRef.current >= 2 ||
        pinchSuppressedTouchPointerIdsRef.current.has(e.pointerId));
    if (e.pointerType === 'touch') {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
      pinchSuppressedTouchPointerIdsRef.current.delete(e.pointerId);
    }
    activePointerMetaRef.current.delete(e.pointerId);
    if (activeSmartStylusPointerIdRef.current === e.pointerId) {
      activeSmartStylusPointerIdRef.current = null;
    }
    if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
      isStylusDownRef.current = false;
    }
    if (activeRecoveryWindowPointerIdRef.current === e.pointerId) {
      activeRecoveryWindowPointerIdRef.current = null;
    }
    if (e.pointerId !== activePointerIdRef.current) {
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
    // Preserve hardware pen points on interruption; abort touch strokes if pinching or mark cancel metadata
    if (
      mode === 'drawing' &&
      isDrawingRef.current &&
      currentPointsRef.current.length >= 1 &&
      !(e.pointerType === 'touch' && wasPinchSuppressed)
    ) {
      if (e.pointerType === 'touch' && activeStrokeMetaRef.current) {
        activeStrokeMetaRef.current.endedByCancel = true;
      }
      commitActiveDrawingStrokeRef.current(e.pointerType === 'pen' ? e.pointerId : undefined);
    } else {
      isDrawingRef.current = false;
      currentPointsRef.current = [];
      renderedPointCountRef.current = 0;
      activeStrokeMetaRef.current = null;
      stopLiveStrokeStream();
      clearLiveCanvas();
    }
    setStylusZoomAnchor(null);
    setStylusPanStart(null);
    setShapeDragStart(null);
    setShapeDragCurrent(null);
    setGraphDragStart(null);
    setGraphDragCurrent(null);
    setDictateDragStart(null);
    setDictateDragCurrent(null);
    setPdfTextDragStart(null);
    setPdfTextDragCurrent(null);
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
    if (handledByNativeInkRef.current.has(e.nativeEvent)) {
      return;
    }
    if (e.pointerType === 'pen') {
      contactingPenIdsRef.current.delete(e.pointerId);
    }
    const wasPinchSuppressed =
      e.pointerType === 'touch' &&
      (isPinchingRef.current ||
        activeTouchCountRef.current >= 2 ||
        pinchSuppressedTouchPointerIdsRef.current.has(e.pointerId));
    if (activeSmartStylusPointerIdRef.current === e.pointerId) {
      activeSmartStylusPointerIdRef.current = null;
    }
    if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
      isStylusDownRef.current = false;
    }
    if (activeRecoveryWindowPointerIdRef.current === e.pointerId) {
      activeRecoveryWindowPointerIdRef.current = null;
    }
    if (e.pointerId !== activePointerIdRef.current) {
      return;
    }
    activePointerIdRef.current = null;
    if (mode === 'drawing' && isDrawingRef.current) {
      if (e.pointerType === 'touch' && wasPinchSuppressed) {
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        renderedPointCountRef.current = 0;
        activeStrokeMetaRef.current = null;
        stopLiveStrokeStream();
        clearLiveCanvas();
        return;
      }
      if (e.pointerType === 'touch' && activeStrokeMetaRef.current) {
        activeStrokeMetaRef.current.endedByCancel = true;
      }
      commitActiveDrawingStrokeRef.current(e.pointerType === 'pen' ? e.pointerId : undefined);
    }
  };

  // Native Direct-DOM Inking Engine + Window Missed-Down Fallback
  // Attached directly to interactionLayerRef for synchronous setPointerCapture, immediate-mode 2D <canvas> rendering,
  // pointerrawupdate/pointermove coalesced sampling, and zero React re-render overhead while writing.
  const isInkingFastPathEnabled =
    !isAudienceViewer &&
    mode === 'drawing' &&
    !isAnyEraseActive &&
    !isNavToolOverride &&
    presenterMode !== 'laser' &&
    presenterMode !== 'spotlight' &&
    !pendingPhotoSnippet;

  const nativeInkEngineRef = useRef<{
    onDown: (ev: PointerEvent) => void;
    onMove: (ev: PointerEvent) => void;
    onRawUpdate: (ev: PointerEvent) => void;
    onUp: (ev: PointerEvent) => void;
    onCancel: (ev: PointerEvent) => void;
    onLostCapture: (ev: PointerEvent) => void;
    onWindowDown: (ev: PointerEvent) => void;
    onWindowMove: (ev: PointerEvent) => void;
    onWindowUp: (ev: PointerEvent) => void;
    onWindowCancel: (ev: PointerEvent) => void;
  }>({
    onDown: () => {},
    onMove: () => {},
    onRawUpdate: () => {},
    onUp: () => {},
    onCancel: () => {},
    onLostCapture: () => {},
    onWindowDown: () => {},
    onWindowMove: () => {},
    onWindowUp: () => {},
    onWindowCancel: () => {},
  });

  nativeInkEngineRef.current = {
    onDown: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled) return;
      if (handledByNativeInkRef.current.has(ev)) return;
      const layer = interactionLayerRef.current;
      if (!layer) return;

      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.add(ev.pointerId);
        contactingPenIdsRef.current.add(ev.pointerId);
        zeroContactMoveStreakRef.current.set(ev.pointerId, 0);
        lastStylusEventAtRef.current = Date.now();
        isStylusDownRef.current = true;
        isPinchingRef.current = false;
      }

      let hadOtherActiveTouch = false;
      if (ev.pointerType === 'touch') {
        if (!isPinchingRef.current && activeTouchCountRef.current < 2) {
          pinchSuppressedTouchPointerIdsRef.current.delete(ev.pointerId);
        }
        hadOtherActiveTouch = Array.from(activeTouchPointerIdsRef.current).some(
          (id) =>
            id !== ev.pointerId &&
            !(stylusConfig?.detectionMode === 'smart_tip' && palmTouchPointerIdsRef.current.has(id))
        );
        activeTouchPointerIdsRef.current.add(ev.pointerId);
      }

      if (!isPointerAccepted(ev, 'down')) {
        return;
      }

      if (
        ev.pointerType === 'touch' &&
        (isPinchingRef.current || activeTouchCountRef.current >= 2 || hadOtherActiveTouch) &&
        (touchInputMode === 'two_finger' ||
          (touchInputMode === 'two_finger_stylus' && stylusConfig?.detectionMode === 'smart_tip'))
      ) {
        return;
      }

      if (
        ev.pointerType !== 'pen' &&
        activePointerIdRef.current !== null &&
        activePointerIdRef.current !== ev.pointerId &&
        (isStylusDownRef.current || isDrawingRef.current)
      ) {
        return;
      }

      if (isPinchingRef.current && ev.pointerType !== 'pen') return;

      handledByNativeInkRef.current.add(ev);
      const coalesced =
        typeof (ev as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents === 'function'
          ? (ev as PointerEvent & { getCoalescedEvents: () => PointerEvent[] }).getCoalescedEvents()
          : null;

      startImmediateStroke(
        ev.pointerId,
        ev.pointerType,
        ev.clientX,
        ev.clientY,
        ev.pressure ?? 0,
        coalesced,
        layer,
        false
      );
    },

    onMove: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled) return;
      const layer = interactionLayerRef.current;
      if (!layer) return;
      if (handledByNativeInkRef.current.has(ev) || lastProcessedPointerMoveRef.current === ev) return;
      if (!isPointerAccepted(ev, 'move')) return;

      const penContacting = isPenEventContacting(ev, true);
      if (ev.pointerType === 'pen') {
        lastStylusEventAtRef.current = Date.now();
        if (!penContacting) {
          confirmedDownPenIdsRef.current.delete(ev.pointerId);
          contactingPenIdsRef.current.delete(ev.pointerId);
          zeroContactMoveStreakRef.current.delete(ev.pointerId);
          if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
            isStylusDownRef.current = false;
          }
          if (activeRecoveryWindowPointerIdRef.current === ev.pointerId) {
            activeRecoveryWindowPointerIdRef.current = null;
          }
          if (activePointerIdRef.current === ev.pointerId) {
            if (isDrawingRef.current) {
              commitActiveDrawingStrokeRef.current();
            }
            activePointerIdRef.current = null;
          }
          return;
        }
        contactingPenIdsRef.current.add(ev.pointerId);
        isStylusDownRef.current = true;
        isPinchingRef.current = false;
        if (activePointerIdRef.current !== null && activePointerIdRef.current !== ev.pointerId) {
          if (isDrawingRef.current && currentPointsRef.current.length > 0) {
            commitActiveDrawingStrokeRef.current();
          }
          activePointerIdRef.current = ev.pointerId;
        }
      } else if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) {
        return;
      }

      if (isPinchingRef.current && ev.pointerType !== 'pen') return;

      handledByNativeInkRef.current.add(ev);
      lastProcessedPointerMoveRef.current = ev;

      const coalesced =
        typeof (ev as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents === 'function'
          ? (ev as PointerEvent & { getCoalescedEvents: () => PointerEvent[] }).getCoalescedEvents()
          : null;
      const pressure = ev.pressure ?? 0;

      // Synthetic Stroke Initiation (Missed Down-State Fallback):
      // Do NOT call setPointerCapture mid-move; track via window capture listeners so capture errors cannot abort the stroke.
      if (!isDrawingRef.current) {
        const touchNotPinching =
          ev.pointerType === 'touch' &&
          !isPinchingRef.current &&
          activeTouchCountRef.current < 2 &&
          !pinchSuppressedTouchPointerIdsRef.current.has(ev.pointerId) &&
          Date.now() - lastPinchEndedAtRef.current >= 260;
        const smartTipContacting =
          touchNotPinching &&
          (touchInputMode === 'two_finger' ||
            (stylusConfig?.detectionMode === 'smart_tip' &&
              activeSmartStylusPointerIdRef.current === ev.pointerId));
        const mouseContacting =
          ev.pointerType === 'mouse' &&
          (stylusConfig?.allowMouseInput ?? true) &&
          (ev.buttons & 1) !== 0;

        if (penContacting || smartTipContacting || mouseContacting) {
          startImmediateStroke(
            ev.pointerId,
            ev.pointerType,
            ev.clientX,
            ev.clientY,
            pressure,
            coalesced,
            null,
            true
          );
        }
        return;
      }

      if (activePointerIdRef.current === null || activePointerIdRef.current === ev.pointerId) {
        appendCoalescedDrawingPoints(ev.clientX, ev.clientY, pressure, coalesced);
      }
    },

    // Hardware-rate raw update wakes up missed-down starts immediately before frame coalescing
    onRawUpdate: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled) return;
      if (isDrawingRef.current && (ev.pointerType !== 'pen' || activePointerIdRef.current === ev.pointerId)) {
        return;
      }
      const layer = interactionLayerRef.current;
      if (!layer) return;
      if (handledByNativeInkRef.current.has(ev) || lastProcessedPointerMoveRef.current === ev) return;
      if (
        ev.pointerType === 'touch' &&
        (isPinchingRef.current ||
          activeTouchCountRef.current >= 2 ||
          pinchSuppressedTouchPointerIdsRef.current.has(ev.pointerId) ||
          Date.now() - lastPinchEndedAtRef.current < 260)
      ) {
        return;
      }
      if (
        ev.pointerType !== 'pen' &&
        !(
          ev.pointerType === 'touch' &&
          (touchInputMode === 'two_finger' || stylusConfig?.detectionMode === 'smart_tip')
        )
      ) {
        return;
      }
      if (ev.pointerType === 'pen') {
        if (!isPenEventContacting(ev, false)) return;
        contactingPenIdsRef.current.add(ev.pointerId);
        lastStylusEventAtRef.current = Date.now();
        isStylusDownRef.current = true;
        isPinchingRef.current = false;
      }
      if (!isPointerAccepted(ev, 'move')) return;

      handledByNativeInkRef.current.add(ev);
      lastProcessedPointerMoveRef.current = ev;
      startImmediateStroke(
        ev.pointerId,
        ev.pointerType,
        ev.clientX,
        ev.clientY,
        ev.pressure ?? 0,
        null,
        null,
        true
      );
    },

    onUp: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled) return;
      if (handledByNativeInkRef.current.has(ev)) return;
      const layer = interactionLayerRef.current;
      const accepted = isPointerAccepted(ev, 'up');

      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.delete(ev.pointerId);
        contactingPenIdsRef.current.delete(ev.pointerId);
        zeroContactMoveStreakRef.current.delete(ev.pointerId);
        lastStylusEventAtRef.current = Date.now();
      }
      if (ev.pointerType === 'touch') {
        activeTouchPointerIdsRef.current.delete(ev.pointerId);
        pinchSuppressedTouchPointerIdsRef.current.delete(ev.pointerId);
      }
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
      }
      rejectedSmartTouchIdsRef.current.delete(ev.pointerId);
      palmTouchPointerIdsRef.current.delete(ev.pointerId);
      smartTouchCoordsRef.current.delete(ev.pointerId);
      clearPointerGeometryCache(ev.pointerId);
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      if (activeRecoveryWindowPointerIdRef.current === ev.pointerId) {
        activeRecoveryWindowPointerIdRef.current = null;
      }

      if (!accepted) return;
      if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) {
        return;
      }

      handledByNativeInkRef.current.add(ev);
      activePointerIdRef.current = null;
      recordExpectedUpLostCapture(layer, ev.pointerId);

      if (isDrawingRef.current) {
        const pt = getStageCoords(ev.clientX, ev.clientY);
        const pts = currentPointsRef.current;
        const rawUpPressure = ev.pressure ?? 0;
        const minCutoff =
          ev.pointerType === 'pen' && stylusConfigRef.current?.detectionMode === 'active_pen'
            ? stylusConfigRef.current?.minPenPressure ?? 0
            : 0;
        const shouldSuppressUpTail =
          ev.pointerType === 'pen' &&
          minCutoff > 0 &&
          strokeReachedMinPressureRef.current &&
          rawUpPressure < minCutoff;
        const lastPt = pts[pts.length - 1];
        if (!shouldSuppressUpTail && (!lastPt || Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) > 0.25)) {
          pts.push({ x: pt.x, y: pt.y, pressure: rawUpPressure > 0 ? rawUpPressure : 0.5 });
          drawIncrementalLivePoints(pts, currentColor, strokeWidth);
        }
        commitActiveDrawingStrokeRef.current();
      }
    },

    onCancel: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled && !isDrawingRef.current) return;
      if (handledByNativeInkRef.current.has(ev)) return;
      const layer = interactionLayerRef.current;
      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.delete(ev.pointerId);
        contactingPenIdsRef.current.delete(ev.pointerId);
        zeroContactMoveStreakRef.current.delete(ev.pointerId);
      }
      const wasPinchSuppressed =
        ev.pointerType === 'touch' &&
        (isPinchingRef.current ||
          activeTouchCountRef.current >= 2 ||
          pinchSuppressedTouchPointerIdsRef.current.has(ev.pointerId));
      if (ev.pointerType === 'touch') {
        activeTouchPointerIdsRef.current.delete(ev.pointerId);
        pinchSuppressedTouchPointerIdsRef.current.delete(ev.pointerId);
      }
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
      }
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      if (activeRecoveryWindowPointerIdRef.current === ev.pointerId) {
        activeRecoveryWindowPointerIdRef.current = null;
      }
      if (ev.pointerId !== activePointerIdRef.current) {
        return;
      }
      handledByNativeInkRef.current.add(ev);
      activePointerIdRef.current = null;
      recordExpectedUpLostCapture(layer, ev.pointerId);
      if (
        isDrawingRef.current &&
        currentPointsRef.current.length >= 1 &&
        !(ev.pointerType === 'touch' && wasPinchSuppressed)
      ) {
        if (ev.pointerType === 'touch' && activeStrokeMetaRef.current) {
          activeStrokeMetaRef.current.endedByCancel = true;
        }
        commitActiveDrawingStrokeRef.current(ev.pointerType === 'pen' ? ev.pointerId : undefined);
      } else {
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        strokeReachedMinPressureRef.current = false;
        pendingPenTailPointsRef.current = [];
        renderedPointCountRef.current = 0;
        activeStrokeMetaRef.current = null;
        stopLiveStrokeStream();
        clearLiveCanvas();
      }
    },

    onLostCapture: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled && !isDrawingRef.current) return;
      const layer = interactionLayerRef.current;
      const queuedEntry = pendingUpLostCaptureCountRef.current.get(ev.pointerId);
      const queuedUpCaptures =
        queuedEntry && Date.now() - queuedEntry.at < 1000 ? queuedEntry.count : 0;
      if (queuedUpCaptures > 0) {
        if (queuedUpCaptures === 1) {
          pendingUpLostCaptureCountRef.current.delete(ev.pointerId);
        } else {
          pendingUpLostCaptureCountRef.current.set(ev.pointerId, {
            count: queuedUpCaptures - 1,
            at: queuedEntry!.at,
          });
        }
        handledByNativeInkRef.current.add(ev);
        return;
      }

      // If a brand-new stroke already re-captured this pointerId (rapid zigzag taps!), ignore stale capture loss
      if (layer) {
        try {
          if (layer.hasPointerCapture(ev.pointerId)) {
            handledByNativeInkRef.current.add(ev);
            return;
          }
        } catch {
          // Ignore capture query errors
        }
      }

      // Never allow lostpointercapture to abort/truncate an active hardware pen stroke —
      // seamlessly hand off tracking to window listeners until real pointerup / pointercancel / hover!
      if (
        ev.pointerType === 'pen' &&
        isDrawingRef.current &&
        ev.pointerId === activePointerIdRef.current
      ) {
        activeRecoveryWindowPointerIdRef.current = ev.pointerId;
        handledByNativeInkRef.current.add(ev);
        return;
      }

      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.delete(ev.pointerId);
        contactingPenIdsRef.current.delete(ev.pointerId);
        zeroContactMoveStreakRef.current.delete(ev.pointerId);
      }
      const wasPinchSuppressed =
        ev.pointerType === 'touch' &&
        (isPinchingRef.current ||
          activeTouchCountRef.current >= 2 ||
          pinchSuppressedTouchPointerIdsRef.current.has(ev.pointerId));
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
      }
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      if (activeRecoveryWindowPointerIdRef.current === ev.pointerId) {
        activeRecoveryWindowPointerIdRef.current = null;
      }
      if (ev.pointerId !== activePointerIdRef.current) {
        return;
      }
      handledByNativeInkRef.current.add(ev);
      activePointerIdRef.current = null;
      if (isDrawingRef.current) {
        if (ev.pointerType === 'touch' && wasPinchSuppressed) {
          isDrawingRef.current = false;
          currentPointsRef.current = [];
          strokeReachedMinPressureRef.current = false;
          pendingPenTailPointsRef.current = [];
          renderedPointCountRef.current = 0;
          activeStrokeMetaRef.current = null;
          stopLiveStrokeStream();
          clearLiveCanvas();
          return;
        }
        if (ev.pointerType === 'touch' && activeStrokeMetaRef.current) {
          activeStrokeMetaRef.current.endedByCancel = true;
        }
        commitActiveDrawingStrokeRef.current(ev.pointerType === 'pen' ? ev.pointerId : undefined);
      }
    },

    onWindowDown: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled || !isVisibleInViewport) return;
      if (ev.pointerType !== 'pen') return;
      if (handledByNativeInkRef.current.has(ev)) return;
      const layer = interactionLayerRef.current;
      if (!layer) return;

      const targetEl = ev.target as HTMLElement | null;
      if (
        targetEl?.closest(
          'header, aside, .floating-zoom, [data-floating-zoom], .banner-prompt, [role="dialog"], [data-testid="right-edge-scrollbar"], [data-testid="on-screen-keyboard"], button, input, textarea, select, [contenteditable="true"]'
        )
      ) {
        return;
      }

      const rect = layer.getBoundingClientRect();
      const insideStage =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      if (!insideStage) return;

      confirmedDownPenIdsRef.current.add(ev.pointerId);
      contactingPenIdsRef.current.add(ev.pointerId);
      zeroContactMoveStreakRef.current.set(ev.pointerId, 0);
      lastStylusEventAtRef.current = Date.now();
      isStylusDownRef.current = true;
      isPinchingRef.current = false;

      handledByNativeInkRef.current.add(ev);
      const coalesced =
        typeof (ev as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents === 'function'
          ? (ev as PointerEvent & { getCoalescedEvents: () => PointerEvent[] }).getCoalescedEvents()
          : null;

      // Capture on layer when the event hit layer directly; otherwise track via window recovery safely
      startImmediateStroke(
        ev.pointerId,
        ev.pointerType,
        ev.clientX,
        ev.clientY,
        ev.pressure ?? 0,
        coalesced,
        ev.target === layer ? layer : null,
        ev.target !== layer
      );
    },

    onWindowMove: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled || !isVisibleInViewport) return;
      if (handledByNativeInkRef.current.has(ev) || lastProcessedPointerMoveRef.current === ev) {
        return;
      }
      const layer = interactionLayerRef.current;
      if (!layer) return;

      const isTrackedRecovery = activeRecoveryWindowPointerIdRef.current === ev.pointerId;
      // Allow window capture phase to recover missed starts even when ev.target === layer if not yet drawing
      const canRecoverMissedPen =
        ev.pointerType === 'pen' &&
        (!isDrawingRef.current ||
          (activePointerIdRef.current !== null && activePointerIdRef.current !== ev.pointerId));
      if (!isTrackedRecovery && !canRecoverMissedPen && ev.target === layer) {
        return;
      }

      const targetEl = ev.target as HTMLElement | null;
      if (
        !isTrackedRecovery &&
        targetEl?.closest(
          'header, aside, .floating-zoom, [data-floating-zoom], .banner-prompt, [role="dialog"], [data-testid="right-edge-scrollbar"], [data-testid="on-screen-keyboard"], button, input, textarea'
        )
      ) {
        return;
      }

      const rect = layer.getBoundingClientRect();
      const insideStage =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;

      if (!insideStage && !isTrackedRecovery) {
        return;
      }

      const penContacting = isPenEventContacting(ev, true);
      if (ev.pointerType === 'pen') {
        lastStylusEventAtRef.current = Date.now();
        if (!penContacting) {
          confirmedDownPenIdsRef.current.delete(ev.pointerId);
          contactingPenIdsRef.current.delete(ev.pointerId);
          zeroContactMoveStreakRef.current.delete(ev.pointerId);
          if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
            isStylusDownRef.current = false;
          }
          if (isTrackedRecovery && isDrawingRef.current) {
            commitActiveDrawingStrokeRef.current();
            activeRecoveryWindowPointerIdRef.current = null;
            activePointerIdRef.current = null;
          }
          return;
        }
        contactingPenIdsRef.current.add(ev.pointerId);
        isStylusDownRef.current = true;
        isPinchingRef.current = false;
        if (activePointerIdRef.current !== null && activePointerIdRef.current !== ev.pointerId) {
          if (isDrawingRef.current && currentPointsRef.current.length > 0) {
            commitActiveDrawingStrokeRef.current();
          }
          activePointerIdRef.current = ev.pointerId;
        }
      }

      if (!isPointerAccepted(ev, 'move')) {
        return;
      }

      const touchNotPinching =
        ev.pointerType === 'touch' &&
        !isPinchingRef.current &&
        activeTouchCountRef.current < 2 &&
        !pinchSuppressedTouchPointerIdsRef.current.has(ev.pointerId) &&
        Date.now() - lastPinchEndedAtRef.current >= 260;
      const smartTipContacting =
        touchNotPinching &&
        (touchInputMode === 'two_finger' ||
          (stylusConfig?.detectionMode === 'smart_tip' &&
            activeSmartStylusPointerIdRef.current === ev.pointerId));
      const mouseContacting =
        ev.pointerType === 'mouse' &&
        (stylusConfig?.allowMouseInput ?? true) &&
        (ev.buttons & 1) !== 0;

      if (!penContacting && !smartTipContacting && !mouseContacting) {
        return;
      }

      if (isPinchingRef.current && ev.pointerType !== 'pen') {
        return;
      }

      handledByNativeInkRef.current.add(ev);
      lastProcessedPointerMoveRef.current = ev;
      const coalesced =
        typeof (ev as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents === 'function'
          ? (ev as PointerEvent & { getCoalescedEvents: () => PointerEvent[] }).getCoalescedEvents()
          : null;
      const pressure = ev.pressure ?? 0;

      if (!isDrawingRef.current) {
        startImmediateStroke(
          ev.pointerId,
          ev.pointerType,
          ev.clientX,
          ev.clientY,
          pressure,
          coalesced,
          null,
          true
        );
        return;
      }

      if (
        activeRecoveryWindowPointerIdRef.current === ev.pointerId ||
        activePointerIdRef.current === ev.pointerId
      ) {
        appendCoalescedDrawingPoints(ev.clientX, ev.clientY, pressure, coalesced);
      }
    },

    onWindowUp: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled || !isVisibleInViewport) return;
      if (handledByNativeInkRef.current.has(ev)) return;
      if (
        activeRecoveryWindowPointerIdRef.current !== ev.pointerId &&
        activePointerIdRef.current !== ev.pointerId
      ) {
        return;
      }
      const layer = interactionLayerRef.current;
      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.delete(ev.pointerId);
        contactingPenIdsRef.current.delete(ev.pointerId);
        zeroContactMoveStreakRef.current.delete(ev.pointerId);
        lastStylusEventAtRef.current = Date.now();
      }
      if (ev.pointerType === 'touch') {
        activeTouchPointerIdsRef.current.delete(ev.pointerId);
        pinchSuppressedTouchPointerIdsRef.current.delete(ev.pointerId);
      }
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
      }
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      handledByNativeInkRef.current.add(ev);
      activeRecoveryWindowPointerIdRef.current = null;
      activePointerIdRef.current = null;
      recordExpectedUpLostCapture(layer, ev.pointerId);
      if (isDrawingRef.current) {
        const pt = getStageCoords(ev.clientX, ev.clientY);
        const pts = currentPointsRef.current;
        const rawUpPressure = ev.pressure ?? 0;
        const minCutoff =
          ev.pointerType === 'pen' && stylusConfigRef.current?.detectionMode === 'active_pen'
            ? stylusConfigRef.current?.minPenPressure ?? 0
            : 0;
        const shouldSuppressUpTail =
          ev.pointerType === 'pen' &&
          minCutoff > 0 &&
          strokeReachedMinPressureRef.current &&
          rawUpPressure < minCutoff;
        const lastPt = pts[pts.length - 1];
        if (!shouldSuppressUpTail && (!lastPt || Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) > 0.25)) {
          pts.push({ x: pt.x, y: pt.y, pressure: rawUpPressure > 0 ? rawUpPressure : 0.5 });
          drawIncrementalLivePoints(pts, currentColor, strokeWidth);
        }
        commitActiveDrawingStrokeRef.current();
      }
    },

    onWindowCancel: (ev: PointerEvent) => {
      if (!isInkingFastPathEnabled && !isDrawingRef.current) return;
      if (handledByNativeInkRef.current.has(ev)) return;
      if (
        activeRecoveryWindowPointerIdRef.current !== ev.pointerId &&
        activePointerIdRef.current !== ev.pointerId
      ) {
        return;
      }
      const layer = interactionLayerRef.current;
      if (ev.pointerType === 'pen') {
        confirmedDownPenIdsRef.current.delete(ev.pointerId);
        contactingPenIdsRef.current.delete(ev.pointerId);
        zeroContactMoveStreakRef.current.delete(ev.pointerId);
      }
      const wasPinchSuppressed =
        ev.pointerType === 'touch' &&
        (isPinchingRef.current ||
          activeTouchCountRef.current >= 2 ||
          pinchSuppressedTouchPointerIdsRef.current.has(ev.pointerId));
      if (ev.pointerType === 'touch') {
        activeTouchPointerIdsRef.current.delete(ev.pointerId);
        pinchSuppressedTouchPointerIdsRef.current.delete(ev.pointerId);
      }
      if (activeSmartStylusPointerIdRef.current === ev.pointerId) {
        activeSmartStylusPointerIdRef.current = null;
      }
      if (contactingPenIdsRef.current.size === 0 && activeSmartStylusPointerIdRef.current === null) {
        isStylusDownRef.current = false;
      }
      handledByNativeInkRef.current.add(ev);
      activeRecoveryWindowPointerIdRef.current = null;
      activePointerIdRef.current = null;
      recordExpectedUpLostCapture(layer, ev.pointerId);
      if (
        isDrawingRef.current &&
        currentPointsRef.current.length >= 1 &&
        !(ev.pointerType === 'touch' && wasPinchSuppressed)
      ) {
        if (ev.pointerType === 'touch' && activeStrokeMetaRef.current) {
          activeStrokeMetaRef.current.endedByCancel = true;
        }
        commitActiveDrawingStrokeRef.current(ev.pointerType === 'pen' ? ev.pointerId : undefined);
      } else {
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        strokeReachedMinPressureRef.current = false;
        pendingPenTailPointsRef.current = [];
        renderedPointCountRef.current = 0;
        activeStrokeMetaRef.current = null;
        stopLiveStrokeStream();
        clearLiveCanvas();
      }
    },
  };

  useEffect(() => {
    const layer = interactionLayerRef.current;
    if (!layer || isAudienceViewer) return;

    const onDown = (ev: PointerEvent) => nativeInkEngineRef.current.onDown(ev);
    const onMove = (ev: PointerEvent) => nativeInkEngineRef.current.onMove(ev);
    const onRaw = (ev: PointerEvent) => nativeInkEngineRef.current.onRawUpdate(ev);
    const onUp = (ev: PointerEvent) => nativeInkEngineRef.current.onUp(ev);
    const onCancel = (ev: PointerEvent) => nativeInkEngineRef.current.onCancel(ev);
    const onLostCapture = (ev: PointerEvent) => nativeInkEngineRef.current.onLostCapture(ev);

    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    layer.addEventListener('pointercancel', onCancel);
    layer.addEventListener('lostpointercapture', onLostCapture);
    if ('onpointerrawupdate' in window) {
      layer.addEventListener('pointerrawupdate' as keyof HTMLElementEventMap, onRaw as EventListener);
    }

    return () => {
      layer.removeEventListener('pointerdown', onDown);
      layer.removeEventListener('pointermove', onMove);
      layer.removeEventListener('pointerup', onUp);
      layer.removeEventListener('pointercancel', onCancel);
      layer.removeEventListener('lostpointercapture', onLostCapture);
      if ('onpointerrawupdate' in window) {
        layer.removeEventListener('pointerrawupdate' as keyof HTMLElementEventMap, onRaw as EventListener);
      }
    };
  }, [isAudienceViewer]);

  useEffect(() => {
    if (isAudienceViewer || !isVisibleInViewport || mode !== 'drawing') return;
    const onWinDown = (ev: PointerEvent) => nativeInkEngineRef.current.onWindowDown(ev);
    const onWinMove = (ev: PointerEvent) => nativeInkEngineRef.current.onWindowMove(ev);
    const onWinUp = (ev: PointerEvent) => nativeInkEngineRef.current.onWindowUp(ev);
    const onWinCancel = (ev: PointerEvent) => nativeInkEngineRef.current.onWindowCancel(ev);
    window.addEventListener('pointerdown', onWinDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onWinMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onWinUp, { capture: true, passive: true });
    window.addEventListener('pointercancel', onWinCancel, { capture: true, passive: true });
    if ('onpointerrawupdate' in window) {
      window.addEventListener('pointerrawupdate', onWinMove as EventListener, {
        capture: true,
        passive: true,
      });
    }
    return () => {
      window.removeEventListener('pointerdown', onWinDown, { capture: true });
      window.removeEventListener('pointermove', onWinMove, { capture: true });
      window.removeEventListener('pointerup', onWinUp, { capture: true });
      window.removeEventListener('pointercancel', onWinCancel, { capture: true });
      if ('onpointerrawupdate' in window) {
        window.removeEventListener('pointerrawupdate', onWinMove as EventListener, { capture: true });
      }
    };
  }, [isAudienceViewer, isVisibleInViewport, mode]);

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
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      if (onTransformEnd) onTransformEnd();
    };

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      onMove(ev.clientX, ev.clientY);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const allowFingerElementControls = touchInputMode !== 'stylus_only';

  const handleCompassPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !allowFingerElementControls) return;
    e.preventDefault();
    e.stopPropagation();
    startCompassMove(e.clientX, e.clientY);
  };

  // Complete Geometric Angle Tool: Decompose into 3 independent elements
  // 1. Terminal arm 1 (line, no arrow)
  // 2. Terminal arm 2 (line, no arrow)
  // 3. Angle arc (with degree/radian calculation)
  // User can select or erase any arm or the arc independently!
  const handleCompleteAngle = (chosenSweep: 'acute' | 'obtuse' | 'primary' | 'secondary') => {
    if (!angleCenter) return;

    let chosenSpan = 0;
    let calculatedDeg = 0;
    let storedArcSweep: 'acute' | 'obtuse' = 'acute';
    let storedSweepFlag: 0 | 1 | undefined;

    if (allowNegativeAngles) {
      const sectors = computeNegativeModeSectors(angleRay1, angleRay2);
      const isPrimary = chosenSweep === 'primary' || chosenSweep === 'acute';
      chosenSpan = isPrimary ? sectors.primarySpan : sectors.secondarySpan;
      storedSweepFlag = isPrimary ? sectors.primarySweepFlag : sectors.secondarySweepFlag;
      const degMag = isPrimary ? sectors.primaryDegMag : sectors.secondaryDegMag;
      const isNeg = isPrimary ? sectors.primaryIsNeg : sectors.secondaryIsNeg;
      calculatedDeg = isNeg && degMag > 0 ? -degMag : degMag;
      storedArcSweep = chosenSpan > Math.PI ? 'obtuse' : 'acute';
    } else {
      let diff = (angleRay2 - angleRay1) % (2 * Math.PI);
      if (diff < 0) diff += 2 * Math.PI;
      const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
      const obtuseSpan = 2 * Math.PI - acuteSpan;
      const isObtuseChoice = chosenSweep === 'obtuse' || chosenSweep === 'secondary';
      chosenSpan = isObtuseChoice ? obtuseSpan : acuteSpan;
      calculatedDeg = Math.round((chosenSpan * 180) / Math.PI);
      storedArcSweep = isObtuseChoice ? 'obtuse' : 'acute';
    }

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
      arcSweep: storedArcSweep,
      arcSweepFlag: storedSweepFlag,
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
    const opacity = sh.isGhosted ? 0.3 : (sh.opacity ?? 1);

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
      if (sh.arcSweepFlag !== undefined) {
        sweepFlag = sh.arcSweepFlag;
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
      const degLabel = `${deg}°`;
      const badgeWidth = Math.max(32, degLabel.length * 7 + 12);

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
              x={-badgeWidth / 2}
              y={-10}
              width={badgeWidth}
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
              {degLabel}
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
      className={`relative w-full h-full bg-white dark:bg-slate-900 overflow-hidden select-none overscroll-none ${
        mode === 'drawing' || touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand'
          ? 'touch-none'
          : ''
      } ${
        isAudienceViewer ? 'pointer-events-none' : ''
      }`}
    >
      {/* PENDING PHOTO SNIPPET BANNER (Portaled to body so Full POV transform never shifts or clips it) */}
      {!isAudienceViewer &&
        pendingPhotoSnippet &&
        isActivePage &&
        isVisibleInViewport &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="banner-prompt fixed top-20 left-1/2 -translate-x-1/2 z-[10020] max-w-[92vw] pointer-events-auto">
            <div className="ui-scale-target bg-indigo-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
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
          </div>,
          document.body
        )}

      {/* ANGLE TOOL HELPER BANNER (Portaled to body so Full POV transform never shifts or clips it) */}
      {!isAudienceViewer &&
        angleStep !== 'idle' &&
        isActivePage &&
        isVisibleInViewport &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="banner-prompt fixed top-20 left-1/2 -translate-x-1/2 z-[10020] max-w-[92vw] pointer-events-auto">
            <div className="ui-scale-target bg-blue-600 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in">
              <Compass className="w-4 h-4 text-blue-200 shrink-0" />
              <span className="text-xs font-bold tracking-wide truncate">
                {angleStep === 'circle_drag' && 'Release pointer to lock circle size'}
                {angleStep === 'ray1_drag' && 'Drag blue terminal ray to orient 1st direction, then release'}
                {angleStep === 'ray2_drag' && 'Drag red terminal ray to orient 2nd direction, then release'}
                {angleStep === 'sector_select' &&
                  (allowNegativeAngles
                    ? 'Click either angle arc button to keep that angle'
                    : 'Click either the Acute or Obtuse arc button to keep that angle')}
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
          </div>,
          document.body
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
        {(() => {
          const effectivePaperPattern: PaperTemplate =
            template === 'pdf' ? underlayTemplate || 'blank' : template;
          return (
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center bg-white">
              {/* Lined Notebook Paper */}
              {effectivePaperPattern === 'lined' && (
                <div className="absolute inset-0 w-full h-full">
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
              {(effectivePaperPattern === 'grid' || effectivePaperPattern === 'graph') && (
                <div
                  className="absolute inset-0 w-full h-full"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(59, 130, 246, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.15) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />
              )}

              {/* Dotted Paper */}
              {effectivePaperPattern === 'dotted' && (
                <div
                  className="absolute inset-0 w-full h-full"
                  style={{
                    backgroundImage:
                      'radial-gradient(rgba(100, 116, 139, 0.3) 1.5px, transparent 1.5px)',
                    backgroundSize: '24px 24px',
                  }}
                />
              )}

              {/* PDF Document Layer rendered above paper underlay (multiplied when a pattern sits underneath) */}
              {template === 'pdf' && (() => {
                const blurryBaseSrc =
                  previewDataUrl ||
                  (pdfDataUrl && pdfDataUrl !== '__CACHED__' ? pdfDataUrl : undefined);
                const crispViewerSrc =
                  pdfDataUrl && pdfDataUrl !== '__CACHED__' ? pdfDataUrl : undefined;

                return (
                  <div
                    className={`relative w-full h-full overflow-hidden select-none pointer-events-none ${
                      effectivePaperPattern !== 'blank' ? 'bg-transparent' : 'bg-white'
                    }`}
                    style={{
                      aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
                      mixBlendMode: effectivePaperPattern !== 'blank' ? 'multiply' : 'normal',
                    }}
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
            </div>
          );
        })()}

        {/* 2. VECTOR DRAWINGS & SHAPES LAYER (Rendered above graphs so annotations and shapes sit on top) */}
        <svg
          shapeRendering="geometricPrecision"
          className="absolute inset-0 w-full h-full pointer-events-none z-35 overflow-hidden"
        >
          {/* Page Geometric Shapes (non-grid) */}
          {pageShapes.map(renderShapeSvg)}

          {/* Page Freehand Strokes */}
          {pageStrokes.map((s) => {
            if (!s.points || s.points.length < 1) return null;
            const pathD = pointsToSvgPath(s.points);

            if (!s.isGhosted && s.tool === 'highlighter') {
              const brightHex = getBrightHighlighterColor(s.color);
              const dodgeHex = getHighlighterDodgeColor(brightHex);
              return (
                <React.Fragment key={s.id}>
                  <path
                    d={pathD}
                    stroke={dodgeHex}
                    strokeWidth={s.width}
                    strokeOpacity={0.88}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ mixBlendMode: 'color-dodge' }}
                  />
                  <path
                    d={pathD}
                    stroke={brightHex}
                    strokeWidth={s.width}
                    strokeOpacity={0.55}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ mixBlendMode: 'color-burn' }}
                  />
                  <path
                    d={pathD}
                    stroke={brightHex}
                    strokeWidth={s.width}
                    strokeOpacity={s.opacity || 0.52}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                </React.Fragment>
              );
            }

            const strokeColor = s.isGhosted ? '#DC2626' : s.color;
            const strokeDash = s.isGhosted ? '4 4' : undefined;
            const opacity = s.isGhosted
              ? 0.25
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
              />
            );
          })}

          {/* Audience Live Synced In-Progress Overlay Preview (Real-Time Stream) */}
          {isAudienceViewer && externalLiveOverlay && (
            <g>
              {externalLiveOverlay.stroke &&
                externalLiveOverlay.stroke.pageId === pageId &&
                externalLiveOverlay.stroke.points.length >= 1 &&
                (externalLiveOverlay.stroke.tool === 'highlighter' ? (
                  (() => {
                    const liveStrk = externalLiveOverlay.stroke!;
                    const livePathD = pointsToSvgPath(liveStrk.points);
                    const brightHex = getBrightHighlighterColor(liveStrk.color);
                    const dodgeHex = getHighlighterDodgeColor(brightHex);
                    return (
                      <>
                        <path
                          d={livePathD}
                          stroke={dodgeHex}
                          strokeWidth={liveStrk.width}
                          strokeOpacity={0.88}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ mixBlendMode: 'color-dodge' }}
                        />
                        <path
                          d={livePathD}
                          stroke={brightHex}
                          strokeWidth={liveStrk.width}
                          strokeOpacity={0.55}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ mixBlendMode: 'color-burn' }}
                        />
                        <path
                          d={livePathD}
                          stroke={brightHex}
                          strokeWidth={liveStrk.width}
                          strokeOpacity={0.52}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ mixBlendMode: 'multiply' }}
                        />
                      </>
                    );
                  })()
                ) : (
                  <path
                    d={pointsToSvgPath(externalLiveOverlay.stroke.points)}
                    stroke={externalLiveOverlay.stroke.color}
                    strokeWidth={externalLiveOverlay.stroke.width}
                    opacity={externalLiveOverlay.stroke.tool === 'pencil' ? 0.85 : 1}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

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

              {externalLiveOverlay.pdfTextPreview &&
                externalLiveOverlay.pdfTextPreview.pageId === pageId && (() => {
                  const d = externalLiveOverlay.pdfTextPreview;
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
                          stroke="#0D9488"
                          strokeWidth={2.5}
                        />
                        <text
                          x={d.start.x + 12}
                          y={topY + h * 0.86}
                          fill="rgba(13,148,136,0.45)"
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
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={Math.abs(dx)}
                        height={Math.abs(dy)}
                        fill="rgba(20, 184, 166, 0.08)"
                        stroke="#0D9488"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        rx={4}
                      />
                    );
                  }
                  const minX = Math.min(d.start.x, d.current.x);
                  const w = Math.abs(dx);
                  return (
                    <rect
                      x={minX}
                      y={d.start.y - d.constantFontSizePt * 0.5}
                      width={w}
                      height={d.constantFontSizePt * 1.12}
                      fill="rgba(20, 184, 166, 0.08)"
                      stroke="#0D9488"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      rx={4}
                    />
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
                  const cols = Math.max(1, Math.round(absW / 28));
                  const rows = Math.max(1, Math.round(absH / 28));
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
                            strokeWidth={Math.max(0.85, shapeStrokeWidth * 0.85)}
                            strokeOpacity={0.65}
                            strokeLinecap="round"
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
                            strokeWidth={Math.max(0.85, shapeStrokeWidth * 0.85)}
                            strokeOpacity={0.65}
                            strokeLinecap="round"
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

          {/* Active PDF Editor Text Box Drag Guide Preview */}
          {mode === 'pdf_editor' && pdfEditorTool !== 'select' && pdfTextDragStart && pdfTextDragCurrent && (() => {
            const dx = pdfTextDragCurrent.x - pdfTextDragStart.x;
            const dy = pdfTextDragCurrent.y - pdfTextDragStart.y;
            const safeStageW = stageDims.width || 612;
            const safePdfW = pdfWidth && pdfWidth > 0 ? pdfWidth : 612;
            const fPx = Math.max(10, Math.round(pdfDefaultTextStyle.fontSizePt * (safeStageW / safePdfW)));

            if (pdfEditorTool === 'height') {
              const topY = Math.min(pdfTextDragStart.y, pdfTextDragCurrent.y);
              const botY = Math.max(pdfTextDragStart.y, pdfTextDragCurrent.y);
              const h = Math.max(12, Math.abs(dy));
              const ptEst = Math.max(8, Math.round(h * (safePdfW / safeStageW)));
              return (
                <g>
                  <line x1={pdfTextDragStart.x} y1={topY} x2={pdfTextDragStart.x} y2={botY} stroke="#0D9488" strokeWidth={2.5} />
                  <line x1={pdfTextDragStart.x - 8} y1={topY} x2={pdfTextDragStart.x + 8} y2={topY} stroke="#0D9488" strokeWidth={2.5} />
                  <line x1={pdfTextDragStart.x - 8} y1={botY} x2={pdfTextDragStart.x + 8} y2={botY} stroke="#0D9488" strokeWidth={2.5} />
                  <text x={pdfTextDragStart.x + 14} y={topY + h * 0.86} fill="rgba(13, 148, 136, 0.35)" fontSize={h} fontFamily="sans-serif" fontWeight="600">
                    Aa
                  </text>
                  <text x={pdfTextDragStart.x + 12} y={Math.max(18, topY - 8)} fill="#0D9488" fontSize={12} fontWeight="bold" fontFamily="sans-serif">
                    PDF Text Height: {ptEst}pt (No wrap →)
                  </text>
                </g>
              );
            }
            if (pdfEditorTool === 'dimensions') {
              const x = Math.min(pdfTextDragStart.x, pdfTextDragCurrent.x);
              const y = Math.min(pdfTextDragStart.y, pdfTextDragCurrent.y);
              const w = Math.abs(dx);
              const h = Math.max(12, Math.abs(dy));
              const ptEst = Math.max(8, Math.round(h * (safePdfW / safeStageW)));
              return (
                <g>
                  <rect x={x} y={y} width={w} height={Math.abs(dy)} fill="rgba(20, 184, 166, 0.08)" stroke="#0D9488" strokeWidth={2} strokeDasharray="6 4" rx={4} />
                  {w > 24 && Math.abs(dy) >= 12 && (
                    <text x={x + 6} y={y + h * 0.86} fill="rgba(13, 148, 136, 0.32)" fontSize={h} fontFamily="sans-serif" fontWeight="600">
                      Aa
                    </text>
                  )}
                  <text x={x} y={Math.max(18, y - 8)} fill="#0D9488" fontSize={12} fontWeight="bold" fontFamily="sans-serif">
                    PDF Text Box: {Math.round(w)}px × {ptEst}pt (Wraps ↓)
                  </text>
                </g>
              );
            }
            const minX = Math.min(pdfTextDragStart.x, pdfTextDragCurrent.x);
            const w = Math.abs(dx);
            return (
              <g>
                <rect x={minX} y={Math.max(4, pdfTextDragStart.y - fPx * 0.5)} width={w} height={fPx * 1.15} fill="rgba(20, 184, 166, 0.08)" stroke="#0D9488" strokeWidth={1.5} strokeDasharray="5 4" rx={4} />
                <line x1={pdfTextDragStart.x} y1={pdfTextDragStart.y} x2={pdfTextDragCurrent.x} y2={pdfTextDragStart.y} stroke="#0D9488" strokeWidth={2.5} />
                <line x1={pdfTextDragStart.x} y1={pdfTextDragStart.y - 8} x2={pdfTextDragStart.x} y2={pdfTextDragStart.y + 8} stroke="#0D9488" strokeWidth={2.5} />
                <line x1={pdfTextDragCurrent.x} y1={pdfTextDragStart.y - 8} x2={pdfTextDragCurrent.x} y2={pdfTextDragStart.y + 8} stroke="#0D9488" strokeWidth={2.5} />
                <text x={minX} y={Math.max(18, pdfTextDragStart.y - fPx * 0.5 - 8)} fill="#0D9488" fontSize={12} fontWeight="bold" fontFamily="sans-serif">
                  PDF Text Width: {Math.round(w)}px · {pdfDefaultTextStyle.fontSizePt}pt
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
                cy={angleCenter.y + angleRadius * Math.sin(angleRay1)}
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

          {/* Active Live Draw Mode Writing Guide Preview */}
          {!isAudienceViewer && liveGuidePreview && (
            <g data-testid="live-writing-guide-preview">
              {liveGuidePreview.topY !== undefined && (
                <line
                  x1={0}
                  y1={liveGuidePreview.topY}
                  x2={stageDims.width || 850}
                  y2={liveGuidePreview.topY}
                  stroke={writingGuideConfig?.color || '#5B7FA6'}
                  strokeWidth={writingGuideConfig?.thickness || 1.5}
                  opacity={writingGuideConfig?.opacity ?? 0.45}
                />
              )}
              <line
                x1={0}
                y1={liveGuidePreview.bottomY}
                x2={stageDims.width || 850}
                y2={liveGuidePreview.bottomY}
                stroke={writingGuideConfig?.color || '#5B7FA6'}
                strokeWidth={writingGuideConfig?.thickness || 1.5}
                opacity={writingGuideConfig?.opacity ?? 0.45}
              />
            </g>
          )}

          {isAudienceViewer &&
            externalLiveOverlay?.writingGuides &&
            externalLiveOverlay.writingGuides.pageId === pageId && (
              <g>
                {externalLiveOverlay.writingGuides.topY !== undefined && (
                  <line
                    x1={0}
                    y1={externalLiveOverlay.writingGuides.topY}
                    x2={stageDims.width || 850}
                    y2={externalLiveOverlay.writingGuides.topY}
                    stroke={externalLiveOverlay.writingGuides.color}
                    strokeWidth={externalLiveOverlay.writingGuides.thickness}
                    opacity={externalLiveOverlay.writingGuides.opacity}
                  />
                )}
                <line
                  x1={0}
                  y1={externalLiveOverlay.writingGuides.bottomY}
                  x2={stageDims.width || 850}
                  y2={externalLiveOverlay.writingGuides.bottomY}
                  stroke={externalLiveOverlay.writingGuides.color}
                  strokeWidth={externalLiveOverlay.writingGuides.thickness}
                  opacity={externalLiveOverlay.writingGuides.opacity}
                />
              </g>
            )}
        </svg>

        {/* 2.5 IMMEDIATE-MODE 2D CANVAS INKING BUFFER (Zero React re-renders during active strokes) */}
        {!isAudienceViewer && (
          <canvas
            ref={liveCanvasRef}
            style={{
              touchAction: 'none',
              opacity: penType === 'highlighter' ? 0.56 : penType === 'pencil' ? 0.85 : 1,
              mixBlendMode: penType === 'highlighter' ? 'multiply' : 'normal',
            }}
            className="live-ink-canvas absolute inset-0 w-full h-full pointer-events-none z-[36]"
          />
        )}

        {/* 3. PLACED CANVAS IMAGE BOXES LAYER */}
        {pageImages.map((img) => (
          <CanvasImageBox
            key={img.id}
            image={img}
            isActive={!isAudienceViewer && mode !== 'pdf_editor' && selectedImageId === img.id}
            zoomScale={activeZoomScale * povScale}
            allowFingerControls={allowFingerElementControls}
            isReadOnly={isAudienceViewer || mode === 'pdf_editor'}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            onSelect={() => {
              if (!isAudienceViewer && mode !== 'pdf_editor' && selectedImageId !== img.id) {
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
          .map((gridShape) => {
            const isEditingThisGrid =
              !isAudienceViewer && mode !== 'pdf_editor' && editingGridDims?.shapeId === gridShape.id;
            return (
              <InteractiveGridBox
                key={gridShape.id}
                shape={gridShape}
                isActive={!isAudienceViewer && mode !== 'pdf_editor' && selectedGridShapeId === gridShape.id}
                zoomScale={activeZoomScale * povScale}
                allowFingerControls={allowFingerElementControls}
                isReadOnly={isAudienceViewer || mode === 'pdf_editor'}
                hideChrome={isAudienceViewer && hideAudienceChrome}
                editingDimsField={isEditingThisGrid ? editingGridDims.field : null}
                editingDimsDraft={isEditingThisGrid ? editingGridDims.draft : ''}
                onStartEditDims={(field) => onStartEditGridDims?.(gridShape.id, field)}
                onChangeDimsDraft={(field, draft) =>
                  onChangeGridDimsDraft?.(gridShape.id, field, draft)
                }
                onStopEditDims={() => onStopEditGridDims?.()}
                onSelect={() => {
                  if (!isAudienceViewer && mode !== 'pdf_editor' && selectedGridShapeId !== gridShape.id) {
                    setSelectedGridShapeId(gridShape.id);
                    onStopEditGridDims?.();
                    setSelectedGraphId(null);
                    setSelectedCalcId(null);
                    setSelectedImageId(null);
                  }
                }}
                onUpdate={(updated) => onUpdateShape && onUpdateShape(gridShape.id, updated)}
                onDelete={() => {
                  if (isEditingThisGrid) {
                    onStopEditGridDims?.();
                  }
                  if (onDeleteShape) onDeleteShape(gridShape.id);
                }}
              />
            );
          })}

        {/* 4. DESMOS GRAPH BOXES LAYER */}
        {pageGraphs.map((g) => (
          <DesmosGraphBox
            key={g.id}
            box={g}
            isActive={!isAudienceViewer && mode !== 'pdf_editor' && selectedGraphId === g.id}
            isMagicGrabActive={!isAudienceViewer && mode === 'edit' && isMagicGrabActive}
            zoomScale={activeZoomScale * povScale}
            allowFingerControls={allowFingerElementControls}
            isReadOnly={isAudienceViewer || mode === 'pdf_editor'}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            onSelect={() => {
              if (!isAudienceViewer && mode !== 'pdf_editor' && selectedGraphId !== g.id) {
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
            isActive={!isAudienceViewer && mode !== 'pdf_editor' && selectedCalcId === c.id}
            zoomScale={activeZoomScale * povScale}
            allowFingerControls={allowFingerElementControls}
            isReadOnly={isAudienceViewer || mode === 'pdf_editor'}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            disableTwoFingerPinch={
              touchInputMode === 'stylus_only' || touchInputMode === 'stylus_and_hand'
            }
            onSelect={() => {
              if (!isAudienceViewer && mode !== 'pdf_editor' && selectedCalcId !== c.id) {
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
          const isThisEditing = !isAudienceViewer && mode !== 'pdf_editor' && editingDictateBoxId === box.id;
          return (
            <DictatedTextBoxItem
              key={box.id}
              box={box}
              isDictatingActive={isThisDictating}
              isListening={isThisDictating && isDictating}
              showTransformBox={isThisTransform && mode !== 'pdf_editor'}
              isEditing={isThisEditing}
              isEraserActive={isAnyEraseActive}
              zoomScale={activeZoomScale * povScale}
              allowFingerControls={allowFingerElementControls}
              isReadOnly={isAudienceViewer || mode === 'pdf_editor'}
              hideChrome={isAudienceViewer && hideAudienceChrome}
              passThroughBody={
                mode === 'drawing' ||
                mode === 'geometric' ||
                mode === 'pdf_editor' ||
                isAnyEraseActive
              }
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

        {/* 5.6 NATIVE PDF EDITOR LAYERS (Images + Native/Added Text Elements, strictly isolated from NoteTeacher items) */}
        {pagePdfImageElements.map((imgEl) => (
          <PdfImageElementItem
            key={imgEl.id}
            element={imgEl}
            stageWidth={stageDims.width}
            stageHeight={stageDims.height}
            isPdfEditorActive={!isAudienceViewer && mode === 'pdf_editor'}
            isSelected={!isAudienceViewer && mode === 'pdf_editor' && selectedPdfImageId === imgEl.id}
            zoomScale={activeZoomScale * povScale}
            allowFingerControls={allowFingerElementControls}
            isReadOnly={isAudienceViewer || mode !== 'pdf_editor'}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            onSelect={() => onSelectPdfImageElement?.(imgEl.id)}
            onDeselect={() => onDeselectPdfImageElement?.()}
            onUpdate={(updated) => onUpdatePdfImageElement?.(imgEl.id, updated)}
            onCommitHistory={onTransformEnd}
            onDelete={() => onDeletePdfImageElement?.(imgEl.id)}
          />
        ))}

        {pagePdfTextElements.map((txtEl) => (
          <PdfTextElementItem
            key={txtEl.id}
            element={txtEl}
            stageWidth={stageDims.width}
            stageHeight={stageDims.height}
            pagePdfWidth={pdfWidth || 612}
            isPdfEditorActive={!isAudienceViewer && mode === 'pdf_editor'}
            isSelected={!isAudienceViewer && mode === 'pdf_editor' && selectedPdfTextId === txtEl.id}
            isEditing={!isAudienceViewer && mode === 'pdf_editor' && editingPdfTextId === txtEl.id}
            zoomScale={activeZoomScale * povScale}
            allowFingerControls={allowFingerElementControls}
            isReadOnly={isAudienceViewer || mode !== 'pdf_editor'}
            hideChrome={isAudienceViewer && hideAudienceChrome}
            onSelect={() => onSelectPdfTextElement?.(txtEl.id)}
            onStartEdit={() => onStartEditPdfTextElement?.(txtEl.id)}
            onStopEdit={() => onStopEditPdfTextElement?.()}
            onDeselect={() => onDeselectPdfTextElement?.()}
            onUpdate={(updated) => onUpdatePdfTextElement?.(txtEl.id, updated)}
            onCommitHistory={onTransformEnd}
            onDelete={() => onDeletePdfTextElement?.(txtEl.id)}
          />
        ))}

        {/* 6. INTERACTION LAYER */}
        {!isAudienceViewer && (
          <div
            ref={interactionLayerRef}
            style={{ touchAction: 'none' }}
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
              isAnyEraseActive ||
              (mode === 'pdf_editor' && pdfEditorTool !== 'select') ||
              ((touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') &&
                leftToolbarTool !== 'pointer')
                ? 'z-[45]'
                : mode === 'geometric' || mode === 'dictate'
                ? 'z-[38]'
                : 'z-20'
            } ${
              (touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') &&
              leftToolbarTool === 'zoom'
                ? 'cursor-zoom-in'
                : (touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') &&
                  leftToolbarTool === 'pan'
                ? stylusPanStart
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : isCircleEraseActive && eraserCirclePos
                ? 'cursor-none'
                : mode === 'calculator'
                ? 'cursor-pointer'
                : mode === 'pdf_editor'
                ? pdfEditorTool === 'select'
                  ? 'cursor-default'
                  : 'cursor-crosshair'
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
                allowFingerControls={allowFingerElementControls}
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
                      onPointerDown={handleCompassPointerDown}
                      title="Click and hold for a moment or drag to move selected items"
                      className={`relative touch-none flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-md cursor-grab active:cursor-grabbing transition-all select-none whitespace-nowrap ${
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

        {/* 7.2 EDIT MODE CLICK-SELECTED LINE / GUIDELINE HANDLES & QUICK INSPECTOR */}
        {!isAudienceViewer &&
          mode === 'edit' &&
          selectedLineShapeId &&
          (() => {
            const selLine = pageShapes.find(
              (sh) => sh.id === selectedLineShapeId && sh.type === 'line'
            );
            if (!selLine) return null;
            const x1 = selLine.x;
            const y1 = selLine.y;
            const x2 = selLine.x + selLine.width;
            const y2 = selLine.y + selLine.height;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const barTop = Math.max(12, Math.min((stageDims.height || 1000) - 56, midY - 46));
            const barLeft = Math.max(
              140,
              Math.min((stageDims.width || 850) - 140, midX)
            );

            const beginLineDrag = (
              dragMode: 'move' | 'start' | 'end',
              e: React.PointerEvent
            ) => {
              e.stopPropagation();
              if (e.button !== 0 && e.pointerType === 'mouse') return;
              onTransformEnd?.();
              const startStage = getStageCoords(e.clientX, e.clientY);
              lineDragRef.current = {
                shapeId: selLine.id,
                mode: dragMode,
                startStageX: startStage.x,
                startStageY: startStage.y,
                origX: selLine.x,
                origY: selLine.y,
                origW: selLine.width,
                origH: selLine.height,
                origBandTop: selLine.guideBandTop,
                origBandBottom: selLine.guideBandBottom,
              };

              const onWinMove = (ev: PointerEvent) => {
                const drag = lineDragRef.current;
                if (!drag || !onUpdateShape) return;
                const cur = getStageCoords(ev.clientX, ev.clientY);
                const dx = cur.x - drag.startStageX;
                const dy = cur.y - drag.startStageY;
                if (drag.mode === 'move') {
                  const patch: Partial<GeometricShape> = {
                    x: drag.origX + dx,
                    y: drag.origY + dy,
                  };
                  if (typeof drag.origBandTop === 'number') {
                    patch.guideBandTop = drag.origBandTop + dy;
                  }
                  if (typeof drag.origBandBottom === 'number') {
                    patch.guideBandBottom = drag.origBandBottom + dy;
                  }
                  if (typeof selLine.guideExtTop === 'number') {
                    patch.guideExtTop = selLine.guideExtTop + dy;
                  }
                  onUpdateShape(drag.shapeId, patch);
                } else if (drag.mode === 'start') {
                  const end2X = drag.origX + drag.origW;
                  const end2Y = drag.origY + drag.origH;
                  const nextX1 = drag.origX + dx;
                  const nextY1 = drag.origY + dy;
                  const minY = Math.min(nextY1, end2Y);
                  const maxY = Math.max(nextY1, end2Y);
                  onUpdateShape(drag.shapeId, {
                    x: nextX1,
                    y: nextY1,
                    width: end2X - nextX1,
                    height: end2Y - nextY1,
                    ...(selLine.isWritingGuide
                      ? { guideBandTop: minY - 16, guideBandBottom: maxY + 16 }
                      : {}),
                  });
                } else {
                  const nextW = drag.origW + dx;
                  const nextH = drag.origH + dy;
                  const end2Y = drag.origY + nextH;
                  const minY = Math.min(drag.origY, end2Y);
                  const maxY = Math.max(drag.origY, end2Y);
                  onUpdateShape(drag.shapeId, {
                    width: nextW,
                    height: nextH,
                    ...(selLine.isWritingGuide
                      ? { guideBandTop: minY - 16, guideBandBottom: maxY + 16 }
                      : {}),
                  });
                }
              };

              const onWinUp = () => {
                lineDragRef.current = null;
                window.removeEventListener('pointermove', onWinMove);
                window.removeEventListener('pointerup', onWinUp);
                window.removeEventListener('pointercancel', onWinUp);
              };

              window.addEventListener('pointermove', onWinMove);
              window.addEventListener('pointerup', onWinUp);
              window.addEventListener('pointercancel', onWinUp);
            };

            return (
              <div
                data-testid="selected-line-editor"
                className="absolute inset-0 pointer-events-none z-[46]"
              >
                <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                  {/* Selection highlight line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#2563EB"
                    strokeWidth={Math.max(3, (selLine.strokeWidth || 1.5) + 2)}
                    strokeDasharray="6 4"
                    opacity={0.85}
                  />
                  {/* Wide hit strip for dragging the line body */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={22}
                    className="pointer-events-auto cursor-move touch-none"
                    onPointerDown={(e) => beginLineDrag('move', e)}
                  />
                  {/* Start endpoint handle */}
                  <circle
                    cx={x1}
                    cy={y1}
                    r={7}
                    fill="#FFFFFF"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    className="pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={(e) => beginLineDrag('start', e)}
                  />
                  {/* End endpoint handle */}
                  <circle
                    cx={x2}
                    cy={y2}
                    r={7}
                    fill="#FFFFFF"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    className="pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={(e) => beginLineDrag('end', e)}
                  />
                </svg>

                {/* Compact floating inspector bar */}
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    left: `${barLeft}px`,
                    top: `${barTop}px`,
                  }}
                  className="ui-scale-target absolute -translate-x-1/2 pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-xl text-xs whitespace-nowrap select-none"
                >
                  <button
                    type="button"
                    onPointerDown={(e) => beginLineDrag('move', e)}
                    title="Drag to move line"
                    className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-move"
                  >
                    <Move className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1 px-1.5 border-l border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] text-slate-500">Width</span>
                    <button
                      type="button"
                      onClick={() => {
                        onTransformEnd?.();
                        onUpdateShape?.(selLine.id, {
                          strokeWidth: Math.max(1, Number(((selLine.strokeWidth || 1.5) - 0.5).toFixed(1))),
                        });
                      }}
                      className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold"
                    >
                      -
                    </button>
                    <span className="font-mono tabular-nums text-[11px] w-7 text-center">
                      {(selLine.strokeWidth || 1.5).toFixed(1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onTransformEnd?.();
                        onUpdateShape?.(selLine.id, {
                          strokeWidth: Math.min(12, Number(((selLine.strokeWidth || 1.5) + 0.5).toFixed(1))),
                        });
                      }}
                      className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-center gap-1 px-1.5 border-l border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] text-slate-500">Opacity</span>
                    <button
                      type="button"
                      onClick={() => {
                        onTransformEnd?.();
                        onUpdateShape?.(selLine.id, {
                          opacity: Math.max(0.1, Number((((selLine.opacity ?? 1) - 0.1)).toFixed(2))),
                        });
                      }}
                      className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold"
                    >
                      -
                    </button>
                    <span className="font-mono tabular-nums text-[11px] w-8 text-center">
                      {Math.round((selLine.opacity ?? 1) * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onTransformEnd?.();
                        onUpdateShape?.(selLine.id, {
                          opacity: Math.min(1, Number((((selLine.opacity ?? 1) + 0.1)).toFixed(2))),
                        });
                      }}
                      className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold"
                    >
                      +
                    </button>
                  </div>

                  <input
                    type="color"
                    value={selLine.strokeColor || '#5B7FA6'}
                    onChange={(e) => {
                      onTransformEnd?.();
                      onUpdateShape?.(selLine.id, { strokeColor: e.target.value });
                    }}
                    title="Change line color"
                    className="w-5 h-5 p-0 border border-slate-300 dark:border-slate-600 rounded cursor-pointer bg-transparent"
                  />

                  <button
                    type="button"
                    data-testid="selected-line-delete-btn"
                    onClick={() => {
                      onDeleteShape?.(selLine.id);
                      setSelectedLineShapeId(null);
                    }}
                    title="Delete line"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-600 text-rose-600 hover:text-white font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedLineShapeId(null)}
                    title="Deselect line"
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}
        {/* 7.5 ACTIVE ANGLE TOOL SECTOR SELECT & LIVE DISPLAY OVERLAY (At z-50 above interaction layer) */}
        {mode === 'geometric' && shapeType === 'angle' && (angleStep === 'ray2_drag' || angleStep === 'sector_select') && angleCenter && (() => {
          const formatAngleVal = (spanRad: number, isNegDeg: boolean, isNegRad: boolean) => {
            if (angleUnit === 'rad') {
              const piMult = spanRad / Math.PI;
              const wrappedPi = piMult >= 1.995 ? 0 : piMult;
              const sign = isNegRad ? '-' : '';
              return `${sign}${wrappedPi.toFixed(2)}π rad`;
            }
            const degVal = Math.round((spanRad * 180) / Math.PI) % 360;
            const sign = isNegDeg && degVal > 0 ? '-' : '';
            return `${sign}${degVal}°`;
          };

          const startX = angleCenter.x + angleRadius * Math.cos(angleRay1);
          const startY = angleCenter.y + angleRadius * Math.sin(angleRay1);
          const endX = angleCenter.x + angleRadius * Math.cos(angleRay2);
          const endY = angleCenter.y + angleRadius * Math.sin(angleRay2);

          let primaryChoice: 'acute' | 'primary' = 'acute';
          let secondaryChoice: 'obtuse' | 'secondary' = 'obtuse';
          let primaryText = '';
          let secondaryText = '';
          let primarySweep = 1;
          let primaryLargeArc = 0;
          let primarySpan = 0;
          let secondarySweep = 0;
          let secondaryLargeArc = 1;
          let secondarySpan = 0;

          if (allowNegativeAngles) {
            const sectors = computeNegativeModeSectors(angleRay1, angleRay2);
            primaryChoice = 'primary';
            secondaryChoice = 'secondary';
            primarySpan = sectors.primarySpan;
            primarySweep = sectors.primarySweepFlag;
            primaryLargeArc = sectors.primaryLargeArcFlag;
            secondarySpan = sectors.secondarySpan;
            secondarySweep = sectors.secondarySweepFlag;
            secondaryLargeArc = sectors.secondaryLargeArcFlag;

            const pVal = formatAngleVal(sectors.primarySpan, sectors.primaryIsNeg, sectors.primaryIsNegRad);
            const sVal = formatAngleVal(sectors.secondarySpan, sectors.secondaryIsNeg, sectors.secondaryIsNegRad);
            const pSuffix = sectors.primaryDegMag > 0 || (angleUnit === 'rad' && sectors.primarySpan / Math.PI >= 0.005)
              ? (sectors.signedSweep < 0 ? ' Neg' : ' Pos')
              : '';
            const sSuffix = sectors.secondaryDegMag > 0 || (angleUnit === 'rad' && sectors.secondarySpan / Math.PI >= 0.005)
              ? (sectors.signedSweep >= 0 ? ' Neg' : ' Pos')
              : '';
            primaryText = `${pVal}${pSuffix}`;
            secondaryText = `${sVal}${sSuffix}`;
          } else {
            let diff = (angleRay2 - angleRay1) % (2 * Math.PI);
            if (diff < 0) diff += 2 * Math.PI;
            const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
            const obtuseSpan = 2 * Math.PI - acuteSpan;

            primarySpan = acuteSpan;
            secondarySpan = obtuseSpan;
            primarySweep = diff <= Math.PI ? 1 : 0;
            primaryLargeArc = 0;
            secondarySweep = primarySweep === 1 ? 0 : 1;
            secondaryLargeArc = 1;

            primaryText = `${formatAngleVal(acuteSpan, false, false)} Acute`;
            secondaryText = `${formatAngleVal(obtuseSpan, false, false)} Obtuse`;
          }

          const primaryD = `M ${startX} ${startY} A ${angleRadius} ${angleRadius} 0 ${primaryLargeArc} ${primarySweep} ${endX} ${endY}`;
          const primaryWedge = `M ${angleCenter.x} ${angleCenter.y} L ${startX} ${startY} A ${angleRadius} ${angleRadius} 0 ${primaryLargeArc} ${primarySweep} ${endX} ${endY} Z`;

          const primaryMidAngle = primarySweep === 1 ? angleRay1 + primarySpan / 2 : angleRay1 - primarySpan / 2;
          const badgeDist = angleRadius + 44;
          const primaryBadgeX = angleCenter.x + badgeDist * Math.cos(primaryMidAngle);
          const primaryBadgeY = angleCenter.y + badgeDist * Math.sin(primaryMidAngle);
          const primaryArcEdgeX = angleCenter.x + angleRadius * Math.cos(primaryMidAngle);
          const primaryArcEdgeY = angleCenter.y + angleRadius * Math.sin(primaryMidAngle);

          const secondaryD = `M ${startX} ${startY} A ${angleRadius} ${angleRadius} 0 ${secondaryLargeArc} ${secondarySweep} ${endX} ${endY}`;
          const secondaryWedge = `M ${angleCenter.x} ${angleCenter.y} L ${startX} ${startY} A ${angleRadius} ${angleRadius} 0 ${secondaryLargeArc} ${secondarySweep} ${endX} ${endY} Z`;

          const secondaryMidAngle = secondarySweep === 1 ? angleRay1 + secondarySpan / 2 : angleRay1 - secondarySpan / 2;
          const secondaryBadgeX = angleCenter.x + badgeDist * Math.cos(secondaryMidAngle);
          const secondaryBadgeY = angleCenter.y + badgeDist * Math.sin(secondaryMidAngle);
          const secondaryArcEdgeX = angleCenter.x + angleRadius * Math.cos(secondaryMidAngle);
          const secondaryArcEdgeY = angleCenter.y + angleRadius * Math.sin(secondaryMidAngle);

          const isClickable = angleStep === 'sector_select';

          return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
              {/* Primary Arc & Callout Line */}
              {isClickable && (
                <path
                  d={primaryWedge}
                  fill="rgba(16, 185, 129, 0.15)"
                  className="cursor-pointer pointer-events-auto hover:fill-emerald-300/30 transition-colors"
                  onClick={() => handleCompleteAngle(primaryChoice)}
                />
              )}
              <path
                d={primaryD}
                stroke="#10B981"
                strokeWidth={isClickable ? 4.5 : 3}
                fill="none"
                strokeLinecap="round"
                className={isClickable ? 'cursor-pointer pointer-events-auto' : ''}
                onClick={isClickable ? () => handleCompleteAngle(primaryChoice) : undefined}
              />
              {/* Dashed connector from arc to badge */}
              <line
                x1={primaryArcEdgeX}
                y1={primaryArcEdgeY}
                x2={primaryBadgeX}
                y2={primaryBadgeY}
                stroke="#10B981"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              {/* Primary Badge */}
              <g
                transform={`translate(${primaryBadgeX}, ${primaryBadgeY})`}
                onClick={isClickable ? () => handleCompleteAngle(primaryChoice) : undefined}
                className={isClickable ? 'cursor-pointer pointer-events-auto transition-transform hover:scale-105' : ''}
              >
                <rect
                  x={-60}
                  y={-14}
                  width={120}
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
                  {primaryText} {isClickable ? '▾' : ''}
                </text>
              </g>

              {/* Secondary Arc & Callout Line */}
              {isClickable && (
                <path
                  d={secondaryWedge}
                  fill="rgba(245, 158, 11, 0.12)"
                  className="cursor-pointer pointer-events-auto hover:fill-amber-300/30 transition-colors"
                  onClick={() => handleCompleteAngle(secondaryChoice)}
                />
              )}
              <path
                d={secondaryD}
                stroke="#F59E0B"
                strokeWidth={isClickable ? 4.5 : 3}
                fill="none"
                strokeLinecap="round"
                className={isClickable ? 'cursor-pointer pointer-events-auto' : ''}
                onClick={isClickable ? () => handleCompleteAngle(secondaryChoice) : undefined}
              />
              {/* Dashed connector from arc to badge */}
              <line
                x1={secondaryArcEdgeX}
                y1={secondaryArcEdgeY}
                x2={secondaryBadgeX}
                y2={secondaryBadgeY}
                stroke="#F59E0B"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              {/* Secondary Badge */}
              <g
                transform={`translate(${secondaryBadgeX}, ${secondaryBadgeY})`}
                onClick={isClickable ? () => handleCompleteAngle(secondaryChoice) : undefined}
                className={isClickable ? 'cursor-pointer pointer-events-auto transition-transform hover:scale-105' : ''}
              >
                <rect
                  x={-60}
                  y={-14}
                  width={120}
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
                  {secondaryText} {isClickable ? '▾' : ''}
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

      {/* 8.5 TOUCH CONTROLS LEFT FLOATING TOOLBAR (Portaled to body so Full POV scale/scroll never shifts it) */}
      {!isAudienceViewer &&
        isActivePage &&
        isVisibleInViewport &&
        (touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only') &&
        typeof document !== 'undefined' &&
        createPortal(
          <aside
            aria-label="Stylus Navigation Controls"
            className="fixed left-3 top-1/2 -translate-y-1/2 z-[9990] flex flex-col items-center gap-2 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 select-none pointer-events-auto"
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
          </aside>,
          document.body
        )}

      {/* 8.6 DYNAMIC STYLUS ZOOM HUD INDICATOR (Portaled to body for accurate viewport alignment in Full POV) */}
      {!isAudienceViewer &&
        isActivePage &&
        stylusZoomAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              left: `${stylusZoomAnchor.clientX}px`,
              top: `${stylusZoomAnchor.clientY}px`,
            }}
            className="fixed -translate-x-1/2 -translate-y-1/2 z-[10050] pointer-events-none select-none flex items-center justify-center"
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
          </div>,
          document.body
        )}

      {/* 9. CLASSROOM PRESENTER OVERLAY */}
      <PresenterOverlay
        mode={presenterMode}
        onClose={onClosePresenter}
        isReadOnly={isAudienceViewer}
        externalState={externalPresenterState}
        onStateChange={onPresenterStateChange}
      />

      {/* 10. FLOATING ZOOM CONTROLS (Portaled & viewport-fixed so they stay in the exact same screen corner in Full POV; transparent with no box underneath when idle) */}
      {!isAudienceViewer &&
        isActivePage &&
        isVisibleInViewport &&
        floatingZoomCoords.visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={zoomControlRef}
            data-floating-zoom="true"
            style={{
              position: 'fixed',
              right: `${floatingZoomCoords.right}px`,
              bottom: `${floatingZoomCoords.bottom}px`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsZoomControlActive(true);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            className={`floating-zoom pointer-events-auto z-[9990] flex items-center gap-1 px-2 py-1 rounded-full border text-xs select-none transition-opacity duration-150 ${
              isZoomControlActive
                ? 'opacity-100 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-lg'
                : 'opacity-25 hover:opacity-70 bg-transparent border-transparent shadow-none'
            }`}
          >
            <button
              type="button"
              title="Zoom Out"
              onClick={(e) => {
                e.stopPropagation();
                setIsZoomControlActive(true);
                setZoomScale((prev) => Math.max(0.6, prev - 0.25));
              }}
              className={`p-1 rounded-full text-slate-700 dark:text-slate-200 ${
                isZoomControlActive ? 'hover:bg-slate-100 dark:hover:bg-slate-700' : ''
              }`}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              title="Zoom Controls"
              onClick={(e) => {
                e.stopPropagation();
                setIsZoomControlActive(true);
              }}
              className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 w-11 text-center"
            >
              {Math.round(zoomScale * 100)}%
            </button>

            <button
              type="button"
              title="Zoom In"
              onClick={(e) => {
                e.stopPropagation();
                setIsZoomControlActive(true);
                setZoomScale((prev) => Math.min(3.5, prev + 0.25));
              }}
              className={`p-1 rounded-full text-slate-700 dark:text-slate-200 ${
                isZoomControlActive ? 'hover:bg-slate-100 dark:hover:bg-slate-700' : ''
              }`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {zoomScale !== 1 && (
              <button
                type="button"
                title="Reset Zoom & Pan (100%)"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomControlActive(true);
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className={`flex items-center gap-1 px-1.5 py-0.5 ml-1 rounded-full text-[10px] font-medium text-slate-700 dark:text-slate-200 ${
                  isZoomControlActive
                    ? 'bg-slate-100 dark:bg-slate-700 hover:bg-blue-50 hover:text-blue-600'
                    : 'bg-transparent'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>,
          document.body
        )}

      {/* 8.8 BOTTOM-LEFT TRANSPARENT WRITING GUIDELINES QUICK TOGGLE (Portaled in Drawing mode when guides are turned on) */}
      {!isAudienceViewer &&
        isActivePage &&
        isVisibleInViewport &&
        mode === 'drawing' &&
        writingGuideConfig?.enabled &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={guideQuickRef}
            data-testid="bottom-left-guides-toggle-wrap"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsGuideQuickActive(true);
            }}
            onTouchStart={(e) => e.stopPropagation()}
            className={`fixed bottom-4 left-4 z-[9991] pointer-events-auto select-none transition-opacity duration-150 rounded-xl border ${
              isGuideQuickActive
                ? 'opacity-100 bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700 shadow-lg backdrop-blur-md'
                : 'opacity-25 hover:opacity-75 bg-transparent border-transparent shadow-none'
            }`}
          >
            <button
              type="button"
              data-testid="bottom-left-guides-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setIsGuideQuickActive(true);
                onToggleWritingGuidesQuick?.();
              }}
              title="Quick toggle writing guidelines on or off (preserves chosen mode)"
              className={`min-h-[40px] flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                !writingGuideConfig.quickPaused
                  ? isGuideQuickActive
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-700 dark:text-slate-200'
                  : isGuideQuickActive
                  ? 'text-slate-600 dark:text-slate-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <svg
                viewBox="0 0 18 18"
                className="w-4 h-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 15h14" />
                <path d="M5 12l4-8 4 8" />
                <path d="M6.3 9.5h5.4" />
                {writingGuideConfig.quickPaused && <path d="M2.5 2.5l13 13" />}
              </svg>
              <span>
                {writingGuideConfig.quickPaused ? 'Guides: Off' : 'Guides: On'}
              </span>
              <span className="text-[11px] font-medium opacity-75">
                ·{' '}
                {writingGuideConfig.mode === 'top_bottom'
                  ? 'Top & Bottom'
                  : writingGuideConfig.mode === 'ignore_equals'
                  ? 'Ignore ='
                  : 'Bottom'}
              </span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
