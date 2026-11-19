export type AppMode =
  | 'drawing'
  | 'calculator'
  | 'graphing'
  | 'geometric'
  | 'dictate'
  | 'edit'
  | 'presenter'
  | 'touch_controls';

export type DictateSubMode = 'height' | 'dimensions' | 'constant_font';

export type TouchInputMode =
  | 'two_finger'
  | 'two_finger_stylus'
  | 'stylus_and_hand'
  | 'stylus_only';
export type LeftToolbarTool = 'pointer' | 'zoom' | 'pan';

export type StylusDetectionMode = 'active_pen' | 'smart_tip';

export interface StylusDetectionConfig {
  detectionMode: StylusDetectionMode;
  maxTipSizePx: number;
  allowMouseInput: boolean;
  minPenPressure: number;
}

export interface CameraViewportState {
  zoomScale: number;
  panOffset: { x: number; y: number };
  viewportWidth: number;
  viewportHeight: number;
  isFullPovMode?: boolean;
  povZoomFactor?: number;
  povScale?: number;
  stageWidth?: number;
  stageHeight?: number;
  povScrollYFraction?: number;
}

export type PenType = 'pencil' | 'pen' | 'highlighter' | 'eraser';

export type ShapeType =
  | 'rect'
  | 'rounded_rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'double_arrow'
  | 'grid'
  | 'angle'
  | 'arc'
  | 'polyline';

export type EraserType = 'scrub' | 'select' | 'circle';

export type MagicGrabMode = 'touch' | 'contained' | 'not_contained';

export type AngleNegativeDirection = 'clockwise' | 'counter_clockwise';

export type PaperTemplate = 'blank' | 'lined' | 'grid' | 'graph' | 'dotted' | 'pdf';

export type PresenterMode = 'none' | 'laser' | 'spotlight';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface CanvasStroke {
  id: string;
  tool: PenType;
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
  pageId: string;
  isGhosted?: boolean;
}

export interface GeometricShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  pageId: string;
  isGhosted?: boolean;
  points?: StrokePoint[];
  gridRows?: number;
  gridCols?: number;
  startAngle?: number;
  endAngle?: number;
  arcSweep?: 'acute' | 'obtuse';
  arcSweepFlag?: 0 | 1;
  angleDegrees?: number;
  radius?: number;
  centerX?: number;
  centerY?: number;
  isArrow?: boolean;
  rotation?: number;
}

export interface LiveStrokePreview {
  pageId: string;
  tool: PenType;
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
}

export interface LiveShapePreview {
  pageId: string;
  shapeType: ShapeType;
  start: { x: number; y: number };
  current: { x: number; y: number };
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  fill: boolean;
  fillOpacity?: number;
}

export interface LiveGraphMarqueePreview {
  pageId: string;
  start: { x: number; y: number };
  current: { x: number; y: number };
}

export interface LiveAnglePreview {
  pageId: string;
  step: 'circle_drag' | 'ray1_drag' | 'ray2_drag' | 'sector_select';
  center: { x: number; y: number };
  radius: number;
  ray1: number;
  ray2: number;
  unit: 'deg' | 'rad';
  allowNegativeAngles: boolean;
  negativeDirection?: AngleNegativeDirection;
}

export interface LiveDictatePreview {
  pageId: string;
  subMode: DictateSubMode;
  start: { x: number; y: number };
  current: { x: number; y: number };
  constantFontSize: number;
}

export interface LiveCanvasOverlay {
  stroke?: LiveStrokePreview | null;
  shape?: LiveShapePreview | null;
  graphMarquee?: LiveGraphMarqueePreview | null;
  angle?: LiveAnglePreview | null;
  dictatePreview?: LiveDictatePreview | null;
}

export interface LivePresenterToolState {
  laserPoints?: Array<{ nx: number; ny: number; time: number }>;
  spotlightNormPos?: { nx: number; ny: number } | null;
}

export interface DesmosExpression {
  id: string;
  latex: string;
  color?: string;
  hidden?: boolean;
}

export interface DesmosBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseWidth?: number;
  baseHeight?: number;
  expressions: DesmosExpression[];
  desmosState?: unknown;
  opacity: number; // 0 (transparent) to 1 (opaque white)
  isFormulaOpen: boolean;
  isSettingsOpen: boolean;
  showResizeHandles: boolean;
  pageId: string;
  settings?: {
    showXAxis?: boolean;
    showYAxis?: boolean;
    showGrid?: boolean;
    degreeMode?: boolean;
    xAxisLabel?: string;
    yAxisLabel?: string;
  };
  rotation?: number;
}

export interface PageData {
  id: string;
  title: string;
  template: PaperTemplate;
  underlayTemplate?: PaperTemplate;
  pdfPageNumber?: number;
  pdfSourceId?: string;
  previewDataUrl?: string;
  pdfDataUrl?: string;
  pdfWidth?: number;
  pdfHeight?: number;
  aspectRatio?: number;
}

export interface DocumentColor {
  hex: string;
  count: number;
  lastUsed: number;
}

export type CalcAngleMode = 'DEG' | 'RAD' | 'GRAD';

export interface CalculatorBox {
  id: string;
  x: number;
  y: number;
  scale: number; // Scales maintaining the calculator's natural aspect ratio
  pageId: string;
  expression: string;
  result: string;
  history: Array<{ expr: string; res: string }>;
  isRad: boolean;
  opacity?: number;
  angleMode?: CalcAngleMode;
  isFeMode?: boolean;
  memoryStack?: number[];
  rotation?: number;
}

export interface CanvasImage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  pageId: string;
  rotation?: number;
}

export interface DictatedTextBox {
  id: string;
  pageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  rotation: number;
  text: string;
  interimText?: string;
  color: string;
  wrap: boolean;
  boxMode: DictateSubMode;
  isGhosted?: boolean;
}

export interface GrabbedSelection {
  strokeIds: string[];
  shapeIds: string[];
  graphIds: string[];
  calculatorIds?: string[];
  imageIds?: string[];
  dictateIds?: string[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  rotation?: number;
}

export type ControlsVisibility = 'presenter_only' | 'show_to_audience';

export interface ScreenDevice {
  id: string;
  name: string;
  isPrimary: boolean;
  resolution?: string;
}

export interface PresenterSettings {
  controlsVisibility: ControlsVisibility;
  presenterViewScreen: string; // e.g. 'this_screen'
  audienceViewScreen: string; // e.g. 'projector'
  availableScreens: ScreenDevice[];
  hasScreenPermission: boolean | null;
  presentationType?: 'screens' | 'dual_view';
}

export type SaveAsMode =
  | 'pdf_as_shown'
  | 'pdf_clean'
  | 'image_as_shown'
  | 'image_clean'
  | 'project_json';

export type FileSourceType = 'local_handle' | 'local_path';

export interface ExplorerFileItem {
  id: string;
  name: string;
  extension: string;
  sizeBytes: number;
  lastModified: number;
  pathBreadcrumb: string;
  sourceType: FileSourceType;
  fileHandle?: FileSystemFileHandle;
  relativePath?: string;
  isFolder?: boolean;
  isMissing?: boolean;
}

export type TabAccessState = 'granted' | 'permission_required';

export interface ExplorerFolderTab {
  id: string;
  name: string;
  iconType: 'folder' | 'file';
  sourceType: FileSourceType;
  pathBreadcrumb: string;
  dirHandle?: FileSystemDirectoryHandle;
  files: ExplorerFileItem[];
  missingCount: number;
  accessState?: TabAccessState;
  isSingleFileTab?: boolean;
  lastKnownPath?: string;
  fileName?: string;
}

export interface ExplorerTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  extension?: string;
  sizeBytes?: number;
  lastModified?: number;
  children?: ExplorerTreeNode[];
  fileItem?: ExplorerFileItem;
}

export interface ActiveFileContext {
  id?: string;
  name: string;
  extension: string;
  pathBreadcrumb: string;
  sourceType: FileSourceType;
  fileHandle?: FileSystemFileHandle;
}

