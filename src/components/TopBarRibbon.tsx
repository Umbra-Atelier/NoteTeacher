import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  FolderOpen,
  FileDown,
  Save,
  Pen,
  Highlighter,
  Pencil,
  Calculator,
  LineChart,
  Shapes,
  Eraser,
  Hand,
  Sliders,
  MoreHorizontal,
  Plus,
  Undo2,
  Redo2,
  Upload,
  Sun,
  Moon,
  Presentation,
  Square,
  Circle,
  Triangle,
  Minus,
  MoveRight,
  MoveHorizontal,
  Grid,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  Monitor,
  Tv,
  Cast,
  Eye,
  EyeOff,
  ShieldCheck,
  Scissors,
  Copy,
  ClipboardPaste,
  X,
  AlignJustify,
  Camera,
  Compass,
  ExternalLink,
  AlertCircle,
  GripHorizontal,
  Touchpad,
  Mic,
  MoveVertical,
  BoxSelect,
  Type,
  Maximize2,
  Minimize2,
  MicOff,
  CheckCircle2,
} from 'lucide-react';
import {
  AngleNegativeDirection,
  AppMode,
  DictateSubMode,
  PenType,
  ShapeType,
  EraserType,
  MagicGrabMode,
  PaperTemplate,
  PresenterMode,
  SaveAsMode,
  PresenterSettings,
  PageData,
  TouchInputMode,
  StylusDetectionConfig,
  ExplorerFileItem,
  ActiveFileContext,
} from '../types';
import { MicPermissionState } from '../utils/speechDictation';
import { hsvToHex, hexToHsv, hexWithAlphaPercent } from '../utils/colorUtils';
import { captureAllMountedWidgets } from '../utils/widgetSnapshotCache';
import { FileExplorerView } from './explorer/FileExplorerView';
import { AnchoredScreenPopup } from './ViewportPortalPopup';
import {
  ensureTouchGeometryTracker,
  recordTouchGeometry,
  getEffectiveTouchMetrics,
  getTouchContactDiameters,
} from '../utils/touchGeometry';

interface TopBarRibbonProps {
  mode: AppMode;
  onSetMode: (mode: AppMode) => void;

  // File & Save As props
  onSaveAs: (mode: SaveAsMode) => void;
  onNewDocument: () => void;
  onOpenProject: (file: File) => void;

  // Page selection props (shown when File is clicked alongside Save options)
  pages: PageData[];
  currentPageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: (template: PaperTemplate) => void;
  onDeletePage: (id: string) => void;
  onDuplicatePage: (id: string) => void;
  onMovePage: (index: number, direction: 'up' | 'down') => void;

  // Drawing mode props
  penType: PenType;
  onSetPenType: (pen: PenType) => void;
  strokeWidth: number;
  onSetStrokeWidth: (w: number) => void;
  currentColor: string;
  onSetCurrentColor: (color: string) => void;
  documentColors: string[];
  paletteColors: string[];
  onUpdatePaletteColors: (cols: string[]) => void;

  // Touch controls mode props
  touchInputMode: TouchInputMode;
  onSetTouchInputMode: (m: TouchInputMode) => void;
  stylusConfig: StylusDetectionConfig;
  onUpdateStylusConfig: (updated: Partial<StylusDetectionConfig>) => void;

  // Geometric angle settings props
  angleUnit?: 'deg' | 'rad';
  onSetAngleUnit?: (u: 'deg' | 'rad') => void;
  angleNegativeDirection?: AngleNegativeDirection;
  onSetAngleNegativeDirection?: (d: AngleNegativeDirection) => void;
  allowNegativeAngles?: boolean;
  onSetAllowNegativeAngles?: (a: boolean) => void;

  // Calculator mode props
  onAddCalculatorAtCenter: () => void;

  // Graphing mode props
  onAddDesmosBoxAtCenter: () => void;
  graphOpacity: number;
  onSetGraphOpacity: (op: number) => void;

  // Geometric mode props
  shapeType: ShapeType;
  onSetShapeType: (s: ShapeType) => void;
  shapeStrokeWidth: number;
  onSetShapeStrokeWidth: (w: number) => void;
  shapeStyle: 'solid' | 'dashed' | 'dotted';
  onSetShapeStyle: (st: 'solid' | 'dashed' | 'dotted') => void;
  shapeFill: boolean;
  onSetShapeFill: (f: boolean) => void;
  shapeFillOpacity?: number;
  onSetShapeFillOpacity?: (opacity: number) => void;

  // Edit mode props (Eraser, Magic Grab, Cut, Copy, Paste, Delete)
  eraserType: EraserType;
  onSetEraserType: (t: EraserType) => void;
  eraserSize: number;
  onSetEraserSize: (s: number) => void;
  isMagicGrabActive: boolean;
  onSetMagicGrabActive: (active: boolean) => void;
  magicGrabMode?: MagicGrabMode;
  onSetMagicGrabMode?: (mode: MagicGrabMode) => void;
  keepEmptyBox?: boolean;
  onSetKeepEmptyBox?: (keep: boolean) => void;
  isPictureCopyActive?: boolean;
  onSetPictureCopyActive?: (active: boolean) => void;
  onClearPage: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  canPaste: boolean;

  // Presenter Mode props
  presenterSettings: PresenterSettings;
  onUpdatePresenterSettings: (settings: Partial<PresenterSettings>) => void;
  onRequestScreenPermission: () => void;
  onOpenAudienceTab?: () => void;

  // Global actions
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  // Quick Presenter tool & templates
  presenterMode: PresenterMode;
  onSetPresenterMode: (m: PresenterMode) => void;
  currentTemplate: PaperTemplate;
  currentUnderlayTemplate?: PaperTemplate;
  onSetTemplate: (t: PaperTemplate) => void;
  onUploadPdf: (file: File) => void;

  // Geometric & Dictate Eraser toggles
  isGeometricEraserActive?: boolean;
  onSetGeometricEraserActive?: (active: boolean) => void;
  isDictateEraserActive?: boolean;
  onSetDictateEraserActive?: (active: boolean) => void;

  // Dictate mode props
  dictateSubMode?: DictateSubMode;
  onSetDictateSubMode?: (subMode: DictateSubMode) => void;
  constantDictateFontSize?: number;
  onSetConstantDictateFontSize?: (size: number) => void;
  micPermission?: MicPermissionState;
  isRequestingMicPermission?: boolean;
  onRequestMicPermission?: () => void;

  // Theme & Fullscreen
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onStatusNotice?: (kind: 'info' | 'success' | 'error', message: string) => void;

  // File Explorer integration
  onOpenFileFromExplorer?: (file: ExplorerFileItem, rawFile?: File) => void;
  activeFileContext?: ActiveFileContext | null;
  onOpenSaveExplorer?: (mode: SaveAsMode) => void;
  onSaveToDirectory?: (
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    saveMode: SaveAsMode,
    pathBreadcrumb: string
  ) => Promise<void>;
  onDownloadFallback?: (fileName: string, saveMode: SaveAsMode) => Promise<void>;
  onShareFallback?: (fileName: string, saveMode: SaveAsMode) => Promise<void>;

  // Creator Info & Onboarding Tour button
  onOpenCreatorInfo?: () => void;
  isCreatorInfoOpen?: boolean;
  creatorInfoJustLanded?: boolean;

  // Mode bar collapse toggle
  isModeBarCollapsed?: boolean;
  onToggleModeBarCollapsed?: () => void;
}

export const TopBarRibbon: React.FC<TopBarRibbonProps> = ({
  mode,
  onSetMode,
  onSaveAs,
  onNewDocument,
  onOpenProject,
  pages,
  currentPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onDuplicatePage,
  onMovePage,
  penType,
  onSetPenType,
  strokeWidth,
  onSetStrokeWidth,
  currentColor,
  onSetCurrentColor,
  documentColors,
  paletteColors = [],
  onUpdatePaletteColors,
  touchInputMode,
  onSetTouchInputMode,
  stylusConfig,
  onUpdateStylusConfig,
  angleUnit = 'deg',
  onSetAngleUnit,
  angleNegativeDirection = 'counter_clockwise',
  onSetAngleNegativeDirection,
  allowNegativeAngles = false,
  onSetAllowNegativeAngles,
  onAddCalculatorAtCenter,
  onAddDesmosBoxAtCenter,
  graphOpacity,
  onSetGraphOpacity,
  shapeType,
  onSetShapeType,
  shapeStrokeWidth,
  onSetShapeStrokeWidth,
  shapeStyle,
  onSetShapeStyle,
  shapeFill,
  onSetShapeFill,
  shapeFillOpacity = 25,
  onSetShapeFillOpacity,
  eraserType,
  onSetEraserType,
  eraserSize,
  onSetEraserSize,
  isMagicGrabActive,
  onSetMagicGrabActive,
  magicGrabMode = 'touch',
  onSetMagicGrabMode,
  keepEmptyBox = false,
  onSetKeepEmptyBox,
  isPictureCopyActive = false,
  onSetPictureCopyActive,
  onClearPage,
  onCut,
  onCopy,
  onPaste,
  onDeleteSelected,
  hasSelection,
  canPaste,
  presenterSettings,
  onUpdatePresenterSettings,
  onRequestScreenPermission,
  onOpenAudienceTab,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  presenterMode,
  onSetPresenterMode,
  currentTemplate,
  currentUnderlayTemplate,
  onSetTemplate,
  onUploadPdf,
  isGeometricEraserActive = false,
  onSetGeometricEraserActive,
  isDictateEraserActive = false,
  onSetDictateEraserActive,
  dictateSubMode = 'height',
  onSetDictateSubMode,
  constantDictateFontSize = 24,
  onSetConstantDictateFontSize,
  micPermission = 'unknown',
  isRequestingMicPermission = false,
  onRequestMicPermission,
  isDarkMode,
  onToggleTheme,
  onStatusNotice,
  onOpenFileFromExplorer,
  activeFileContext,
  onOpenSaveExplorer,
  onSaveToDirectory,
  onDownloadFallback,
  onShareFallback,
  onOpenCreatorInfo,
  isCreatorInfoOpen = false,
  creatorInfoJustLanded = false,
  isModeBarCollapsed: controlledModeBarCollapsed,
  onToggleModeBarCollapsed,
}) => {
  // Fullscreen toggle state synced with browser fullscreen events (standard + WebKit Safari)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  });

  useEffect(() => {
    const syncFs = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  const handleToggleFullscreen = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.currentTarget?.blur();
    if (typeof document === 'undefined') return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const activeFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
    try {
      if (activeFs) {
        if (typeof doc.exitFullscreen === 'function') {
          await doc.exitFullscreen();
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          await doc.webkitExitFullscreen();
        }
      } else {
        if (typeof el.requestFullscreen === 'function') {
          try {
            await el.requestFullscreen({ navigationUI: 'hide' });
          } catch {
            await el.requestFullscreen();
          }
        } else if (typeof el.webkitRequestFullscreen === 'function') {
          await el.webkitRequestFullscreen();
        } else {
          onStatusNotice?.(
            'info',
            'Fullscreen mode is not supported by this browser viewport.'
          );
        }
      }
    } catch {
      onStatusNotice?.(
        'info',
        'Fullscreen mode could not be activated in this browser window.'
      );
    }
  };
  // Dual-tab File Modal state: 'export' (Current saving/export flow) vs 'explorer' (Files explorer view)
  const [fileMenuTab, setFileMenuTab] = useState<'export' | 'explorer'>('export');
  // Rainbow HSB/HSV state (default brightness 100 for palette color rainbow bar)
  const [hue, setHue] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(100);
  const [brightness, setBrightness] = useState<number>(100);

  // Horizontal Sideways-Expanding Rainbow Slider State
  const [isSlidingRainbow, setIsSlidingRainbow] = useState(false);

  // Constant Dictate Font Size draft input state
  const [dictateFontDraft, setDictateFontDraft] = useState<string>(String(constantDictateFontSize));
  useEffect(() => {
    setDictateFontDraft(String(constantDictateFontSize));
  }, [constantDictateFontSize]);

  // Live Stylus Calibration & Test Pad State
  const [lastStylusSample, setLastStylusSample] = useState<{
    pointerType: string;
    width: number;
    height: number;
    pressure: number;
    tiltX: number;
    tiltY: number;
    accepted: boolean;
    belowPressureCutoff: boolean;
    minObservedPenPressure: number | null;
  } | null>(null);
  const [showStylusTestModal, setShowStylusTestModal] = useState(false);
  const [testModalDots, setTestModalDots] = useState<
    Array<{
      id: number;
      x: number;
      y: number;
      pointerType: string;
      size: number;
      accepted: boolean;
      belowCutoff?: boolean;
    }>
  >([]);

  // Palette Reordering and Trash State
  const [draggedPaletteIndex, setDraggedPaletteIndex] = useState<number | null>(null);
  const [dragOverPaletteIndex, setDragOverPaletteIndex] = useState<number | null>(null);

  // Popover menus state
  const [showFileModal, setShowFileModal] = useState(false);
  const [lastFullEraserMode, setLastFullEraserMode] = useState<'scrub' | 'select'>(
    eraserType === 'select' ? 'select' : 'scrub'
  );
  const [showPaletteOverflow, setShowPaletteOverflow] = useState(false);
  const [showColorSliders, setShowColorSliders] = useState(false);
  const [showPresenterToolMenu, setShowPresenterToolMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showAddPageOptions, setShowAddPageOptions] = useState(false);

  useEffect(() => {
    ensureTouchGeometryTracker();
  }, []);

  const currentMinPenPressure = stylusConfig.minPenPressure ?? 0;

  const getRecommendedPenCutoff = (
    sample: {
      pointerType: string;
      pressure: number;
      minObservedPenPressure: number | null;
    } | null
  ): number => {
    if (!sample || sample.pointerType !== 'pen') return 0.08;
    const candidate = sample.minObservedPenPressure ?? (sample.pressure > 0 && sample.pressure < 0.26 ? sample.pressure : null);
    if (candidate !== null && candidate > 0 && candidate <= 0.28) {
      return Math.min(0.3, Math.max(0.04, Number((candidate + 0.02).toFixed(2))));
    }
    return 0.08;
  };

  const evaluatePointerAsStylus = (
    pointerType: string,
    w: number,
    h: number,
    pressure: number
  ) => {
    if (touchInputMode === 'two_finger') return true;
    if (pointerType === 'pen') return true;
    if (pointerType === 'mouse') return stylusConfig.allowMouseInput;
    if (pointerType === 'touch') {
      if (stylusConfig.detectionMode === 'smart_tip') {
        const contactSize = Math.max(w || 0, h || 0);
        const hasPenPressure = pressure > 0 && Math.abs(pressure - 0.5) > 0.01;
        return contactSize <= stylusConfig.maxTipSizePx || (hasPenPressure && contactSize <= stylusConfig.maxTipSizePx + 6);
      }
      return false;
    }
    return false;
  };

  const applySampleFromPointer = (
    e: React.PointerEvent<HTMLDivElement>,
    phase: 'down' | 'move' = 'down'
  ) => {
    const metrics = getEffectiveTouchMetrics(e.nativeEvent);
    const w = metrics.width;
    const h = metrics.height;
    const pressure = e.pressure ?? 0;
    const accepted = evaluatePointerAsStylus(e.pointerType, w, h, pressure);
    const minCutoff = stylusConfig.detectionMode === 'active_pen' ? currentMinPenPressure : 0;
    const belowPressureCutoff =
      e.pointerType === 'pen' &&
      minCutoff > 0 &&
      phase === 'move' &&
      pressure < minCutoff;
    setLastStylusSample((prev) => {
      const prevMin =
        phase === 'move' && prev?.pointerType === 'pen' ? prev.minObservedPenPressure : null;
      const observedTail =
        e.pointerType === 'pen' && pressure > 0 && pressure < 0.28 ? Number(pressure.toFixed(2)) : null;
      const minObservedPenPressure =
        observedTail !== null
          ? prevMin !== null
            ? Math.min(prevMin, observedTail)
            : observedTail
          : prevMin;
      return {
        pointerType: e.pointerType,
        width: w,
        height: h,
        pressure: Number(pressure.toFixed(2)),
        tiltX: Math.round(e.tiltX || 0),
        tiltY: Math.round(e.tiltY || 0),
        accepted,
        belowPressureCutoff,
        minObservedPenPressure,
      };
    });
    return { w, h, size: metrics.size, accepted, belowPressureCutoff };
  };

  const applySampleFromTouch = (e: React.TouchEvent<HTMLDivElement>, updateDots: boolean) => {
    recordTouchGeometry(e.nativeEvent);
    const t = e.changedTouches[0] || e.touches[0];
    if (!t) return;
    const geom = getTouchContactDiameters(t);
    if (!geom.isMeasured) return;
    const w = geom.width;
    const h = geom.height;
    const pType = geom.touchType === 'stylus' ? 'pen' : 'touch';
    const accepted = evaluatePointerAsStylus(pType, w, h, geom.force);
    const minCutoff = stylusConfig.detectionMode === 'active_pen' ? currentMinPenPressure : 0;
    setLastStylusSample((prev) => {
      if (prev && prev.pointerType === 'pen' && pType !== 'pen') return prev;
      const nextPressure = Number((geom.force || prev?.pressure || 0).toFixed(2));
      const belowPressureCutoff =
        pType === 'pen' && minCutoff > 0 && nextPressure > 0 && nextPressure < minCutoff;
      return {
        pointerType: pType,
        width: w,
        height: h,
        pressure: nextPressure,
        tiltX: prev?.tiltX ?? 0,
        tiltY: prev?.tiltY ?? 0,
        accepted,
        belowPressureCutoff,
        minObservedPenPressure: prev?.minObservedPenPressure ?? null,
      };
    });
    if (updateDots) {
      const rect = e.currentTarget.getBoundingClientRect();
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;
      setTestModalDots((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (
            next[i].pointerType === pType &&
            Math.hypot(next[i].x - tx, next[i].y - ty) < 48
          ) {
            next[i] = { ...next[i], size: geom.size, accepted };
            break;
          }
        }
        return next;
      });
    }
  };

  // File input & popover trigger refs
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const colorSlidersBtnRef = useRef<HTMLButtonElement>(null);
  const paletteOverflowBtnRef = useRef<HTMLButtonElement>(null);
  const presenterMenuBtnRef = useRef<HTMLButtonElement>(null);
  const templateMenuBtnRef = useRef<HTMLButtonElement>(null);

  // Collapsible Mode Select Bar animation state
  const [internalModeBarCollapsed, setInternalModeBarCollapsed] = useState(false);
  const isModeBarCollapsed = controlledModeBarCollapsed ?? internalModeBarCollapsed;
  const [isModeBarAnimating, setIsModeBarAnimating] = useState(false);
  const modeBarAnimTimerRef = useRef<number | null>(null);
  const prevModeBarCollapsedRef = useRef(isModeBarCollapsed);

  useEffect(() => {
    if (prevModeBarCollapsedRef.current !== isModeBarCollapsed) {
      prevModeBarCollapsedRef.current = isModeBarCollapsed;
      setIsModeBarAnimating(true);
      if (modeBarAnimTimerRef.current !== null) {
        window.clearTimeout(modeBarAnimTimerRef.current);
      }
      modeBarAnimTimerRef.current = window.setTimeout(() => {
        setIsModeBarAnimating(false);
        modeBarAnimTimerRef.current = null;
      }, 450);
    }
  }, [isModeBarCollapsed]);

  useEffect(() => {
    return () => {
      if (modeBarAnimTimerRef.current !== null) {
        window.clearTimeout(modeBarAnimTimerRef.current);
      }
    };
  }, []);

  const handleToggleModeBarCollapsed = () => {
    setIsModeBarAnimating(true);
    if (modeBarAnimTimerRef.current !== null) {
      window.clearTimeout(modeBarAnimTimerRef.current);
    }
    modeBarAnimTimerRef.current = window.setTimeout(() => {
      setIsModeBarAnimating(false);
      modeBarAnimTimerRef.current = null;
    }, 450);
    if (onToggleModeBarCollapsed) {
      onToggleModeBarCollapsed();
    } else {
      setInternalModeBarCollapsed((prev) => !prev);
    }
  };

  const updateActivePaletteOrColor = (hex: string) => {
    onSetCurrentColor(hex);
    const activeIdx = paletteColors.findIndex(
      (c) => c.toUpperCase() === currentColor.toUpperCase()
    );
    if (activeIdx !== -1) {
      const copy = [...paletteColors];
      copy[activeIdx] = hex;
      onUpdatePaletteColors(copy);
    }
  };

  const handleHueChange = (newHue: number) => {
    const nextSat = saturation === 0 ? 100 : saturation;
    const nextBright = brightness === 0 ? 100 : brightness;
    setHue(newHue);
    if (nextSat !== saturation) setSaturation(nextSat);
    if (nextBright !== brightness) setBrightness(nextBright);
    const hex = hsvToHex(newHue, nextSat, nextBright);
    updateActivePaletteOrColor(hex);
  };

  const handleSatChange = (newSat: number) => {
    setSaturation(newSat);
    const hex = hsvToHex(hue, newSat, brightness);
    updateActivePaletteOrColor(hex);
  };

  const handleBrightnessChange = (newBright: number) => {
    setBrightness(newBright);
    const hex = hsvToHex(hue, saturation, newBright);
    updateActivePaletteOrColor(hex);
  };

  const handleSelectPaletteColor = (colorHex: string) => {
    onSetCurrentColor(colorHex);
    const hsv = hexToHsv(colorHex);
    if (hsv.s > 0 && hsv.v > 0) {
      setHue(hsv.h);
      setSaturation(hsv.s);
      setBrightness(hsv.v);
    } else {
      setSaturation(hsv.s);
      setBrightness(colorHex.toUpperCase() === '#000000' ? 0 : 100);
    }
  };

  // Top bar mode ordering state (allows holding down to move left/right compared to the others)
  const [modeOrder, setModeOrder] = useState<AppMode[]>(() => {
    try {
      const saved = localStorage.getItem('noteteacher_mode_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 6) {
          if (!parsed.includes('touch_controls')) parsed.push('touch_controls');
          if (!parsed.includes('dictate')) {
            const geoIdx = parsed.indexOf('geometric');
            if (geoIdx >= 0) parsed.splice(geoIdx + 1, 0, 'dictate');
            else parsed.push('dictate');
          }
          return parsed;
        }
      }
    } catch {}
    return ['drawing', 'calculator', 'graphing', 'geometric', 'dictate', 'edit', 'presenter', 'touch_controls'];
  });

  const [draggedMode, setDraggedMode] = useState<AppMode | null>(null);
  const [dragOverMode, setDragOverMode] = useState<AppMode | null>(null);
  const [holdingModeId, setHoldingModeId] = useState<AppMode | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleModeHoldStart = (mId: AppMode) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setHoldingModeId(mId);
    }, 200);
  };

  const handleModeHoldEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingModeId(null);
  };

  const handleReorderMode = (sourceId: AppMode, targetId: AppMode) => {
    if (sourceId === targetId) return;
    setModeOrder((prev) => {
      const sourceIndex = prev.indexOf(sourceId);
      const targetIndex = prev.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;
      const copy = [...prev];
      copy.splice(sourceIndex, 1);
      copy.splice(targetIndex, 0, sourceId);
      try {
        localStorage.setItem('noteteacher_mode_order', JSON.stringify(copy));
      } catch {}
      return copy;
    });
  };

  const handleShiftMode = (mId: AppMode, direction: 'left' | 'right') => {
    setModeOrder((prev) => {
      const idx = prev.indexOf(mId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      try {
        localStorage.setItem('noteteacher_mode_order', JSON.stringify(copy));
      } catch {}
      return copy;
    });
  };

  const ALL_MODES: Record<
    AppMode,
    { id: AppMode; label: string; icon: React.FC<{ className?: string }>; color: string }
  > = {
    drawing: { id: 'drawing', label: 'Drawing', icon: Pen, color: 'text-blue-600' },
    calculator: { id: 'calculator', label: 'Calculator', icon: Calculator, color: 'text-emerald-600' },
    graphing: { id: 'graphing', label: 'Graphing (Desmos)', icon: LineChart, color: 'text-indigo-600' },
    geometric: { id: 'geometric', label: 'Geometric', icon: Shapes, color: 'text-amber-600' },
    dictate: { id: 'dictate', label: 'Dictate', icon: Mic, color: 'text-sky-600' },
    edit: { id: 'edit', label: 'Edit', icon: Eraser, color: 'text-rose-600' },
    presenter: { id: 'presenter', label: 'Presenter Mode', icon: Presentation, color: 'text-purple-600' },
    touch_controls: { id: 'touch_controls', label: 'Touch Controls', icon: Touchpad, color: 'text-cyan-600' },
  };

  const outsidePaletteColors = paletteColors.slice(0, 6);
  const overflowPaletteColors = paletteColors.slice(6);

  // Reorder palette items helper
  const handleReorderPalette = (srcIndex: number, targetIndex: number) => {
    if (srcIndex === targetIndex) return;
    const copy = [...paletteColors];
    const [moved] = copy.splice(srcIndex, 1);
    copy.splice(targetIndex, 0, moved);
    onUpdatePaletteColors(copy);
  };

  // Delete palette swatch helper
  const handleDeletePaletteColor = (indexToDelete: number) => {
    if (paletteColors.length <= 1) return; // Keep at least one color
    const copy = paletteColors.filter((_, idx) => idx !== indexToDelete);
    onUpdatePaletteColors(copy);
    if (!copy.includes(currentColor)) {
      onSetCurrentColor(copy[0]);
    }
  };

  // Add new white palette swatch helper
  const handleAddNewPaletteColor = () => {
    const copy = [...paletteColors, '#FFFFFF'];
    onUpdatePaletteColors(copy);
    onSetCurrentColor('#FFFFFF');
    setSaturation(0);
    setBrightness(100);
  };

  // Shared Rainbow Slider, Color Tuner & Homescreen Palette Bar (used in both Drawing and Geometric tabs)
  const renderColorAndPaletteControls = () => (
    <div data-tour-id="color-palette" className="flex items-center gap-3 flex-wrap">
      {/* ========================================================== */}
      {/* RAINBOW SLIDER & COLOR TUNER                               */}
      {/* ========================================================== */}
      <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
        <span className="text-slate-500 font-medium">Rainbow:</span>

        {/* Sideways-Expanding Horizontal Rainbow Slider */}
        <div className="relative flex items-center">
          <div
            onPointerDown={(e) => {
              setIsSlidingRainbow(true);
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
              );
              handleHueChange(Math.round(ratio * 360));
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!isSlidingRainbow) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
              );
              handleHueChange(Math.round(ratio * 360));
            }}
            onPointerUp={(e) => {
              setIsSlidingRainbow(false);
              try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              } catch {}
            }}
            onPointerCancel={() => setIsSlidingRainbow(false)}
            title="Slide horizontally to change color in real-time (expands sideways while sliding)"
            style={{
              touchAction: 'none',
              width: isSlidingRainbow ? '230px' : '110px',
              height: isSlidingRainbow ? '22px' : '16px',
              transition: 'width 0.16s ease, height 0.16s ease',
              background:
                'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
            }}
            className={`relative rounded-full cursor-pointer select-none shadow-xs ${
              isSlidingRainbow ? 'z-50 ring-2 ring-blue-500 shadow-lg' : ''
            }`}
          >
            {/* Slider Thumb Dot (with white circle border that changes color) */}
            <div
              style={{
                left: `${(hue / 360) * 100}%`,
                backgroundColor: hsvToHex(hue, saturation, brightness),
              }}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-2 ring-black/30 shadow-lg pointer-events-none transition-[width,height] ${
                isSlidingRainbow ? 'w-6 h-6' : 'w-5 h-5'
              }`}
            />
          </div>

          <div className="relative ml-2">
            <button
              ref={colorSlidersBtnRef}
              type="button"
              title="Fine tune RGB/HSB color sliders"
              onClick={() => setShowColorSliders(!showColorSliders)}
              className={`p-1.5 rounded-lg border ${
                showColorSliders
                  ? 'bg-blue-50 border-blue-400 text-blue-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            {showColorSliders && (
              <AnchoredScreenPopup
                anchorRef={colorSlidersBtnRef}
                placement="bottom"
                align="start"
                gap={8}
                respectHeader={false}
                zIndexClass="z-[10120]"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-64 p-3 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 space-y-2.5"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="font-bold text-slate-800 dark:text-slate-100">Color Tuner</span>
                    <div
                      className="w-6 h-6 rounded-md shadow-xs border"
                      style={{ backgroundColor: currentColor }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Saturation</span>
                      <span>{saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={saturation}
                      onChange={(e) => handleSatChange(parseInt(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Brightness</span>
                      <span>{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={brightness}
                      onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </AnchoredScreenPopup>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* PALETTE BAR (Homescreen-style drag, + circle, & 3-dot menu) */}
      {/* ========================================================== */}
      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800 select-none">
        <span className="text-[11px] text-slate-400 font-medium">Palette:</span>

        {/* Outside swatches (up to 6) */}
        {outsidePaletteColors.map((colorHex, idx) => {
          const isSelected = currentColor.toUpperCase() === colorHex.toUpperCase();
          const isOver = dragOverPaletteIndex === idx;

          return (
            <button
              key={`${colorHex}-${idx}`}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/palette', idx.toString());
                setDraggedPaletteIndex(idx);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPaletteIndex(idx);
              }}
              onDragLeave={() => {
                if (dragOverPaletteIndex === idx) setDragOverPaletteIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const src = parseInt(e.dataTransfer.getData('text/palette'), 10);
                if (!isNaN(src)) handleReorderPalette(src, idx);
                setDraggedPaletteIndex(null);
                setDragOverPaletteIndex(null);
              }}
              title={`Select ${colorHex} (Hold and drag to reorder like homescreen apps)`}
              onClick={() => handleSelectPaletteColor(colorHex)}
              className={`rounded-full transition-all border relative cursor-grab active:cursor-grabbing ${
                isSelected && isSlidingRainbow
                  ? 'w-7 h-7 scale-140 ring-4 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 border-white shadow-xl z-10'
                  : isSelected
                  ? 'w-6 h-6 scale-120 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 border-white shadow-md'
                  : 'w-6 h-6 hover:scale-110 border-slate-300 dark:border-slate-600'
              } ${isOver ? 'ring-2 ring-amber-400 scale-125' : ''}`}
              style={{ backgroundColor: colorHex }}
            />
          );
        })}

        {/* + Circle Button to add another white palette slot */}
        <button
          type="button"
          onClick={handleAddNewPaletteColor}
          title="Add new white palette slot (then use slider to customize)"
          className="w-6 h-6 rounded-full border-2 border-dashed border-slate-400 hover:border-blue-500 text-slate-500 hover:text-blue-600 dark:border-slate-600 dark:hover:border-blue-400 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>

        {/* 3-Dot Overflow Menu (Only appears when palette runs out of space, i.e. > 6 swatches) */}
        {overflowPaletteColors.length > 0 && (
          <div className="relative">
            <button
              ref={paletteOverflowBtnRef}
              type="button"
              title={`More palette & document colors (${overflowPaletteColors.length} in overflow)`}
              onClick={() => setShowPaletteOverflow(!showPaletteOverflow)}
              className="w-6 h-6 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 transition-transform active:scale-95"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {showPaletteOverflow && (
              <AnchoredScreenPopup
                anchorRef={paletteOverflowBtnRef}
                placement="bottom"
                align="start"
                gap={8}
                respectHeader={false}
                zIndexClass="z-[10120]"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-64 p-3 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Overflow Palette Colors ({overflowPaletteColors.length})
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Drag to outside to swap
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1">
                      {overflowPaletteColors.map((hex, overflowIdx) => {
                        const realIdx = 6 + overflowIdx;
                        const isSelected = currentColor.toUpperCase() === hex.toUpperCase();
                        return (
                          <button
                            key={`overflow-${hex}-${realIdx}`}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/palette', realIdx.toString());
                              setDraggedPaletteIndex(realIdx);
                            }}
                            onClick={() => {
                              handleSelectPaletteColor(hex);
                              setShowPaletteOverflow(false);
                            }}
                            title={`${hex} - Click to select this color`}
                            className={`w-8 h-8 rounded-full border border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform cursor-grab active:cursor-grabbing ${
                              isSelected
                                ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
                                : ''
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {documentColors.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Document Colors in Use ({documentColors.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1">
                        {documentColors.map((hex) => (
                          <button
                            key={`doc-${hex}`}
                            type="button"
                            onClick={() => {
                              handleSelectPaletteColor(hex);
                              setShowPaletteOverflow(false);
                            }}
                            title={`Document color: ${hex}`}
                            className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 hover:scale-115 transition-transform"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AnchoredScreenPopup>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Shared Eraser sub-controls (reused across Edit, Drawing, Geometric, and Dictate tabs)
  const renderEraserSubControls = () => (
    <>
      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800 flex-wrap">
        <span className="text-slate-500 font-medium">Eraser:</span>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => onSetEraserType(lastFullEraserMode)}
            className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
              eraserType !== 'circle'
                ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Full Elements
          </button>
          <button
            type="button"
            onClick={() => onSetEraserType('circle')}
            title="Carve small pieces out of drawn strokes and geometric elements"
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
              eraserType === 'circle'
                ? 'bg-rose-600 text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full border-2 inline-block ${
                eraserType === 'circle'
                  ? 'border-white bg-white/25'
                  : 'border-red-500 bg-red-500/20'
              }`}
            />
            <span>Circle Erase</span>
          </button>
        </div>

        {eraserType !== 'circle' ? (
          <>
            <button
              type="button"
              onClick={() => {
                setLastFullEraserMode('scrub');
                onSetEraserType('scrub');
              }}
              className={`px-2 py-1 rounded text-xs font-medium ${
                eraserType === 'scrub'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Scrub Path
            </button>
            <button
              type="button"
              onClick={() => {
                setLastFullEraserMode('select');
                onSetEraserType('select');
              }}
              className={`px-2 py-1 rounded text-xs font-medium ${
                eraserType === 'select'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Select Box Area
            </button>
          </>
        ) : (
          <span className="px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[11px] font-medium">
            Ink &amp; shapes only
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
        <span className="text-slate-500 font-medium">Size:</span>
        <input
          type="range"
          min="8"
          max="72"
          value={eraserSize}
          onChange={(e) => onSetEraserSize(parseInt(e.target.value, 10))}
          className="w-24 accent-rose-600 cursor-pointer"
        />
        <div
          className={`rounded-full shrink-0 ${
            eraserType === 'circle'
              ? 'border-2 border-red-500 bg-red-500/20'
              : 'border border-rose-400 bg-rose-100 dark:bg-rose-950'
          }`}
          style={{
            width: `${Math.min(24, Math.max(8, eraserSize / 2.2))}px`,
            height: `${Math.min(24, Math.max(8, eraserSize / 2.2))}px`,
          }}
        />
        <span className="font-mono text-[11px] text-slate-500">{eraserSize}px</span>
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-[100] w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs select-none overscroll-none touch-pan-x">
      {/* ROW 1: PERSISTENT TOP UTILITY BAR (File, Undo/Redo, Laser/Spotlight, Paper Type, Save, Brightness, Fullscreen, Info — NEVER collapses) */}
      <div className="relative z-20 flex flex-wrap items-center justify-between px-3 py-1.5 gap-x-2 gap-y-1.5 bg-white/95 dark:bg-slate-900/95 border-b border-slate-100 dark:border-slate-800/80">
        {/* ============================================================== */}
        {/* FILE BUTTON (Opens File & Page Manager Dialog)                 */}
        {/* ============================================================== */}
        <div className="order-1 flex items-center shrink-0">
          <div className="relative">
            <button
              type="button"
              data-tour-id="file-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!showFileModal) {
                  void captureAllMountedWidgets();
                }
                setShowFileModal(!showFileModal);
              }}
              className={`dcg-do-not-blur flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                showFileModal
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 border-transparent'
              }`}
            >
              <span>File</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onUploadPdf(e.target.files[0]);
                setShowFileModal(false);
              }
            }}
          />
          <input
            ref={projectInputRef}
            type="file"
            accept=".noteteacher,application/json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onOpenProject(e.target.files[0]);
                setShowFileModal(false);
              }
            }}
          />
        </div>

        {/* Center + Right Actions (Undo/Redo, Overlays, Template, Quick Export, Theme, Fullscreen, Info) */}
        <div className="order-2 ml-auto flex items-center justify-end gap-1.5 flex-wrap max-w-full">
          {/* Quick Undo / Redo */}
          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 shrink-0">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Right Zone: Overlays, Template, Quick Export, Theme */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Quick Presenter Overlay Dropdown */}
            <div className="relative">
              <button
                ref={presenterMenuBtnRef}
                type="button"
                onClick={() => setShowPresenterToolMenu(!showPresenterToolMenu)}
                title="Classroom Presenter Overlays"
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  presenterMode !== 'none'
                    ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Presentation className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="capitalize">
                  {presenterMode === 'none' ? 'Laser / Spotlight' : presenterMode}
                </span>
              </button>

              {showPresenterToolMenu && (
                <AnchoredScreenPopup
                  anchorRef={presenterMenuBtnRef}
                  placement="bottom"
                  align="end"
                  gap={6}
                  respectHeader={false}
                  zIndexClass="z-[10120]"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 text-xs"
                  >
                    {[
                      { id: 'none', label: 'Off / Normal Cursor' },
                      { id: 'laser', label: 'Laser Pointer (Glow)' },
                      { id: 'spotlight', label: 'Spotlight Focus' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSetPresenterMode(p.id as PresenterMode);
                          setShowPresenterToolMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${
                          presenterMode === p.id ? 'font-bold text-rose-600' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span>{p.label}</span>
                        {presenterMode === p.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </AnchoredScreenPopup>
              )}
            </div>

            {/* Paper Template Selector */}
            <div className="relative">
              <button
                ref={templateMenuBtnRef}
                type="button"
                onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                title={
                  currentTemplate === 'pdf'
                    ? 'Change Paper Pattern Underneath PDF'
                    : 'Change Canvas Background Paper'
                }
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Grid className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="capitalize">
                  {currentTemplate === 'pdf'
                    ? currentUnderlayTemplate && currentUnderlayTemplate !== 'blank'
                      ? `PDF · ${currentUnderlayTemplate}`
                      : 'PDF Background'
                    : `${currentTemplate} Paper`}
                </span>
              </button>

              {showTemplateMenu && (
                <AnchoredScreenPopup
                  anchorRef={templateMenuBtnRef}
                  placement="bottom"
                  align="end"
                  gap={6}
                  respectHeader={false}
                  zIndexClass="z-[10120]"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 text-xs"
                  >
                    {currentTemplate === 'pdf' && (
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-slate-100 dark:border-slate-700 mb-0.5">
                        Pattern Underneath PDF
                      </div>
                    )}
                    {[
                      { id: 'blank', label: 'Blank Whiteboard' },
                      { id: 'lined', label: 'Lined Notebook' },
                      { id: 'grid', label: 'Graph Paper' },
                      { id: 'dotted', label: 'Dotted Grid' },
                    ].map((t) => {
                      const activePattern =
                        currentTemplate === 'pdf'
                          ? currentUnderlayTemplate || 'blank'
                          : currentTemplate;
                      const isActivePattern = activePattern === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSetTemplate(t.id as PaperTemplate);
                            setShowTemplateMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 ${
                            isActivePattern
                              ? 'font-bold text-blue-600 dark:text-blue-400'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <span>{t.label}</span>
                          {isActivePattern && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </AnchoredScreenPopup>
              )}
            </div>

            {/* Quick Save */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const ext = activeFileContext?.extension?.toLowerCase();
                const quickMode: SaveAsMode =
                  ext === '.noteteacher' || ext === '.json' ? 'project_json' : 'pdf_as_shown';
                onSaveAs(quickMode);
              }}
              data-testid="top-save-btn"
              title="Save Document (Opens File Explorer)"
              className="dcg-do-not-blur flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>Save</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              title="Toggle Light / Dark Mode"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Top-Right Fullscreen Toggle */}
            <button
              type="button"
              onClick={(e) => void handleToggleFullscreen(e)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              data-testid="fullscreen-toggle-btn"
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                isFullscreen
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 ring-1 ring-blue-300 dark:ring-blue-700'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Top-Right Circular Blue "i" Creator Info & Feedback Button */}
            {onOpenCreatorInfo && (
              <button
                type="button"
                onClick={onOpenCreatorInfo}
                title="About NoteTeacher · Contact umbra atelier & Replay Tutorial"
                aria-label="About NoteTeacher and creator contact info"
                data-tour-id="creator-info-btn"
                data-testid="creator-info-btn"
                className={`w-7 h-7 rounded-full border-2 font-serif font-bold text-sm flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                  isCreatorInfoOpen
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 dark:hover:text-white'
                } ${
                  creatorInfoJustLanded
                    ? 'ring-4 ring-blue-400/50 scale-110'
                    : ''
                }`}
              >
                i
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ROW 1.5: COLLAPSIBLE MODE SELECTOR BAR + ATTACHED BOTTOM ARROW TOGGLE */}
      <div
        data-tour-id="mode-bar-collapse-group"
        className="relative z-10 flex flex-col"
      >
        {/* Sliding & Height-Collapsing Wrapper for Mode Select Bar */}
        <div
          data-testid="mode-bar-collapse-region"
          aria-hidden={isModeBarCollapsed}
          className={`grid transition-[grid-template-rows] duration-[420ms] ease-[cubic-bezier(0.25,0.85,0.3,1)] ${
            isModeBarCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
          }`}
        >
          <div
            className={`min-h-0 ${
              isModeBarCollapsed || isModeBarAnimating ? 'overflow-hidden' : 'overflow-visible'
            }`}
          >
            <div
              data-testid="mode-bar-sliding-inner"
              style={{
                transform: isModeBarCollapsed ? 'translateY(-100%)' : 'translateY(0%)',
                opacity: isModeBarCollapsed ? 0 : 1,
                transition: 'transform 420ms cubic-bezier(0.25, 0.85, 0.3, 1), opacity 340ms ease',
              }}
              className={`px-3 py-1.5 bg-slate-50/75 dark:bg-slate-900/75 border-b border-slate-200/80 dark:border-slate-800 ${
                isModeBarCollapsed ? 'pointer-events-none' : ''
              }`}
            >
              <div
                className="flex items-center gap-1 flex-wrap justify-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700 select-none w-fit max-w-full mx-auto"
                title="Hold down and drag a mode left or right to reorder modes"
              >
                {modeOrder.map((mId, index) => {
                  const m = ALL_MODES[mId];
                  if (!m) return null;
                  const isActive = mode === m.id;
                  const isBeingDragged = draggedMode === m.id;
                  const isOver = dragOverMode === m.id;
                  const isHolding = holdingModeId === m.id;

                  return (
                    <div
                      key={m.id}
                      draggable={!isModeBarCollapsed}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', m.id);
                        setDraggedMode(m.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedMode && draggedMode !== m.id) {
                          setDragOverMode(m.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverMode === m.id) setDragOverMode(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const source = e.dataTransfer.getData('text/plain') as AppMode;
                        if (source) {
                          handleReorderMode(source, m.id);
                        }
                        setDraggedMode(null);
                        setDragOverMode(null);
                        setHoldingModeId(null);
                      }}
                      onDragEnd={() => {
                        setDraggedMode(null);
                        setDragOverMode(null);
                        setHoldingModeId(null);
                      }}
                      onMouseDown={() => handleModeHoldStart(m.id)}
                      onMouseUp={handleModeHoldEnd}
                      onTouchStart={() => handleModeHoldStart(m.id)}
                      onTouchEnd={handleModeHoldEnd}
                      className={`relative flex items-center shrink-0 transition-all ${
                        isOver ? 'scale-105 border-b-2 border-blue-500' : ''
                      } ${
                        isBeingDragged || isHolding
                          ? 'opacity-80 scale-95 shadow-md ring-2 ring-blue-500 rounded-lg'
                          : ''
                      }`}
                    >
                      <button
                        type="button"
                        tabIndex={isModeBarCollapsed ? -1 : 0}
                        onClick={() => {
                          if (!isHolding && !draggedMode) {
                            onSetMode(m.id);
                          }
                        }}
                        title="Click to select mode. Hold down or drag left/right to move compared to others."
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-grab active:cursor-grabbing ${
                          isActive
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs ring-1 ring-slate-200 dark:ring-slate-700'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <m.icon
                          className={`w-3.5 h-3.5 shrink-0 ${isActive ? m.color : 'text-slate-400'}`}
                        />
                        <span>{m.label}</span>
                      </button>

                      {/* Micro shift buttons when held down */}
                      {isHolding && (
                        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-slate-900 text-white rounded px-1 py-0.5 shadow-lg z-50 text-[10px]">
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShiftMode(m.id, 'left');
                              }}
                              className="hover:text-blue-400 px-0.5"
                              title="Move left"
                            >
                              ◀
                            </button>
                          )}
                          <span>Move</span>
                          {index < modeOrder.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShiftMode(m.id, 'right');
                              }}
                              className="hover:text-blue-400 px-0.5"
                              title="Move right"
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Arrow Collapse Toggle flush against bottom edge of the Mode Select Bar */}
        <div className="relative flex justify-center h-[18px]">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleModeBarCollapsed}
            aria-expanded={!isModeBarCollapsed}
            aria-label={isModeBarCollapsed ? 'Expand mode select bar' : 'Collapse mode select bar'}
            title={
              isModeBarCollapsed
                ? 'Expand Mode Select Bar'
                : 'Collapse Mode Select Bar upward (keeps top bar and active mode options visible)'
            }
            data-testid="mode-bar-collapse-toggle"
            data-tour-id="mode-bar-collapse-toggle"
            className="dcg-do-not-blur -mt-px h-[19px] px-5 rounded-b-lg border-x border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/95 hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-600 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronUp
              data-testid="mode-bar-collapse-arrow"
              style={{
                transform: isModeBarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              className="w-3.5 h-3.5 transition-transform duration-[420ms] ease-[cubic-bezier(0.25,0.85,0.3,1)]"
            />
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* FILE & PAGE MANAGER MODAL (Portaled to body to blur entire app)     */}
      {/* ================================================================== */}
      {showFileModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={() => setShowFileModal(false)}
            className="dcg-do-not-blur fixed inset-0 z-[9998] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-100"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="dcg-do-not-blur relative w-full max-w-4xl my-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[calc(100vh-3rem)]"
            >
              {/* TOP HEADER: DUAL TABS (Save & Export vs. Files Explorer) */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/90 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex items-center p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setFileMenuTab('export')}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        fileMenuTab === 'export'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save &amp; Export</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFileMenuTab('explorer')}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        fileMenuTab === 'explorer'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Files Explorer</span>
                    </button>
                  </div>

                  {activeFileContext && (
                    <div
                      title={activeFileContext.pathBreadcrumb || activeFileContext.name}
                      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 text-[11px] font-mono text-blue-700 dark:text-blue-300 max-w-md truncate"
                    >
                      <span className="font-bold shrink-0">Open:</span>
                      <span className="truncate">
                        {activeFileContext.pathBreadcrumb || activeFileContext.name}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowFileModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                  title="Close file menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* TAB 1: CURRENT SAVING & EXPORT FLOW */}
              {fileMenuTab === 'export' && (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                  {/* LEFT COLUMN: SELECT FILE / PAGE MENU */}
                  <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-950/60 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col p-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          Pages ({pages.length})
                        </span>
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowAddPageOptions(!showAddPageOptions)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Page</span>
                        </button>

                        {showAddPageOptions && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50 text-xs">
                            {[
                              { id: 'blank', label: 'Blank Page', icon: FileText },
                              { id: 'lined', label: 'Lined Notebook', icon: AlignJustify },
                              { id: 'grid', label: 'Math Graph Grid', icon: Grid },
                              { id: 'dotted', label: 'Dotted Grid', icon: Grid },
                            ].map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  onAddPage(t.id as PaperTemplate);
                                  setShowAddPageOptions(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                              >
                                <t.icon className="w-3.5 h-3.5 text-slate-400" />
                                <span>{t.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scrollable Thumbnail List */}
                    <div className="flex-1 overflow-y-auto space-y-2 py-3 pr-1">
                      {pages.map((p, idx) => {
                        const isSelected = p.id === currentPageId;
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              onSelectPage(p.id);
                              setShowFileModal(false);
                            }}
                            className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500 shadow-xs ring-1 ring-blue-500'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                {idx + 1}
                              </span>
                              <div className="truncate">
                                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {p.title}
                                </div>
                                <div className="text-[10px] text-slate-400 capitalize">
                                  {p.template} template
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMovePage(idx, 'up');
                                  }}
                                  className="p-1 hover:text-blue-600 text-slate-400 rounded"
                                  title="Move Up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {idx < pages.length - 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMovePage(idx, 'down');
                                  }}
                                  className="p-1 hover:text-blue-600 text-slate-400 rounded"
                                  title="Move Down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDuplicatePage(p.id);
                                }}
                                className="p-1 hover:text-blue-600 text-slate-400 rounded"
                                title="Duplicate Page"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              {pages.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeletePage(p.id);
                                  }}
                                  className="p-1 hover:text-rose-600 text-slate-400 rounded"
                                  title="Delete Page"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: SAVE & EXPORT OPTIONS */}
                  <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto">
                    <div>
                      <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                            Save Document
                          </h3>
                          <p className="text-xs text-slate-500">
                            Save complete worksheets, rendered PDFs, images, or project files via File Explorer
                          </p>
                        </div>
                        {onOpenSaveExplorer && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowFileModal(false);
                              onOpenSaveExplorer('pdf_as_shown');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold transition-colors shrink-0"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Save to Explorer Folder...</span>
                          </button>
                        )}
                      </div>

                      {/* Save As Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {/* Save As PDF (As Shown) */}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowFileModal(false);
                            onSaveAs('pdf_as_shown');
                          }}
                          className="dcg-do-not-blur flex flex-col text-left p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 hover:border-blue-500 transition-all group"
                        >
                          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs mb-1">
                            <FileDown className="w-4 h-4" />
                            <span>Save as PDF (As Shown)</span>
                          </div>
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                            Full multi-page PDF capturing exact frozen Desmos graphs, calculators, open keypads, formulas, and menus
                          </span>
                        </button>

                        {/* Save As PDF (Clean) */}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowFileModal(false);
                            onSaveAs('pdf_clean');
                          }}
                          className="dcg-do-not-blur flex flex-col text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-400 transition-all group"
                        >
                          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-xs mb-1">
                            <FileDown className="w-4 h-4 text-slate-500" />
                            <span>Save as PDF (Clean)</span>
                          </div>
                          <span className="text-[11px] text-slate-500 leading-tight">
                            Full multi-page worksheet collapsing all formula panels, keypads, settings, and resize handles
                          </span>
                        </button>

                        {/* Save As PNG (As Shown) */}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowFileModal(false);
                            onSaveAs('image_as_shown');
                          }}
                          className="dcg-do-not-blur flex flex-col text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-all"
                        >
                          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs mb-1">
                            <Save className="w-4 h-4" />
                            <span>Save as Image (As Shown)</span>
                          </div>
                          <span className="text-[10px] text-slate-400 leading-tight">
                            High-resolution PNG of current page with formulas and menus open
                          </span>
                        </button>

                        {/* Save As PNG (Clean) */}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowFileModal(false);
                            onSaveAs('image_clean');
                          }}
                          className="dcg-do-not-blur flex flex-col text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-400 transition-all"
                        >
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-xs mb-1">
                            <Save className="w-4 h-4 text-slate-400" />
                            <span>Save as Image (Clean)</span>
                          </div>
                          <span className="text-[10px] text-slate-400 leading-tight">
                            High-resolution PNG of current page with menus and handles hidden
                          </span>
                        </button>
                      </div>

                      {/* Import and Project Options */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            pdfInputRef.current?.click();
                          }}
                          className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-medium"
                        >
                          <Upload className="w-3.5 h-3.5 text-blue-500" />
                          <span>Upload PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            projectInputRef.current?.click();
                          }}
                          className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-medium"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                          <span>Open Project</span>
                        </button>

                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowFileModal(false);
                            onSaveAs('project_json');
                          }}
                          className="dcg-do-not-blur flex items-center justify-center gap-1.5 p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-700 dark:text-purple-300 text-xs font-semibold"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Project (.noteteacher)</span>
                        </button>
                      </div>
                    </div>

                    {/* Bottom Footer Action */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          onNewDocument();
                          setShowFileModal(false);
                        }}
                        className="text-rose-600 hover:underline font-medium"
                      >
                        Start New Blank Document
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFileModal(false)}
                        className="px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg font-semibold"
                      >
                        Close &amp; Return to Canvas
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FILES EXPLORER VIEW (With its own dedicated tab bar & Home tab on far left) */}
              {fileMenuTab === 'explorer' && (
                <div className="flex-1 flex flex-col min-h-[460px] overflow-hidden">
                  <FileExplorerView
                    onOpenFile={(file, rawFile) => {
                      if (onOpenFileFromExplorer) {
                        onOpenFileFromExplorer(file, rawFile);
                      }
                      setShowFileModal(false);
                    }}
                    onCloseModal={() => setShowFileModal(false)}
                    activeFileContext={activeFileContext}
                    onSaveToDirectory={onSaveToDirectory}
                    onDownloadFallback={onDownloadFallback}
                    onShareFallback={onShareFallback}
                  />
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ROW 2: DYNAMIC RIBBON BAR BASED ON ACTIVE MODE (Stays visible & slides upward when Mode Bar collapses) */}
      <div
        data-testid="mode-options-ribbon"
        className="flex items-center px-4 pt-1 pb-2 gap-4 text-xs overflow-x-auto min-h-[48px]"
      >
        {/* ============================================================== */}
        {/* EDIT MODE RIBBON (Cut, Copy, Paste, Delete + Notepad Eraser)   */}
        {/* ============================================================== */}
        {mode === 'edit' && (
          <div data-tour-id="edit-tools" className="flex items-center gap-4 flex-wrap w-full">
            {/* Clipboard and Delete Controls for Selected Items */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {/* Cut Button */}
              <button
                type="button"
                onClick={onCut}
                disabled={!hasSelection}
                title="Cut selected items (Ctrl+X)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors font-medium"
              >
                <Scissors className="w-3.5 h-3.5 text-blue-600" />
                <span>Cut</span>
              </button>

              {/* Copy Button */}
              <button
                type="button"
                onClick={onCopy}
                disabled={!hasSelection}
                title="Copy selected items (Ctrl+C)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors font-medium"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                <span>Copy</span>
              </button>

              {/* Paste Button */}
              <button
                type="button"
                onClick={onPaste}
                disabled={!canPaste}
                title="Paste from clipboard (Ctrl+V)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:pointer-events-none transition-colors font-medium"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600" />
                <span>Paste</span>
              </button>

              {/* Delete Selected Button */}
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={!hasSelection}
                title="Delete selected items (Del)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 disabled:pointer-events-none transition-colors font-medium"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete</span>
              </button>
            </div>

            {/* Tool Mode: Notepad Eraser vs Magic Grab vs Picture Copy */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl pl-2 border-l border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onSetMagicGrabActive(false);
                  onSetPictureCopyActive?.(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  !isMagicGrabActive && !isPictureCopyActive
                    ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Notepad Eraser</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetMagicGrabActive(true);
                  onSetPictureCopyActive?.(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isMagicGrabActive && !isPictureCopyActive
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Magic Grab</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetMagicGrabActive(false);
                  onSetPictureCopyActive?.(true);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isPictureCopyActive
                    ? 'bg-white dark:bg-slate-900 text-purple-600 shadow-xs ring-1 ring-purple-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Picture Copy: Drag to screenshot a square of the page, then click anywhere to place it"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Picture Copy</span>
              </button>
            </div>

            {isPictureCopyActive && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs text-purple-700 dark:text-purple-300 font-medium animate-pulse">
                <span>📸 Drag on the page to screenshot an area, then click anywhere to place it</span>
              </div>
            )}

            {isMagicGrabActive && !isPictureCopyActive && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 flex-wrap">
                <span className="text-slate-500 text-xs font-medium">Select Mode:</span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => onSetMagicGrabMode?.('touch')}
                    className={`px-2 py-1 rounded font-medium transition-colors ${
                      magicGrabMode === 'touch'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                    title="Select all elements that touch or intersect the box"
                  >
                    Touch
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetMagicGrabMode?.('contained')}
                    className={`px-2 py-1 rounded font-medium transition-colors ${
                      magicGrabMode === 'contained'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                    title="Select only elements completely contained within the box"
                  >
                    Contained
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetMagicGrabMode?.('not_contained')}
                    className={`px-2 py-1 rounded font-medium transition-colors ${
                      magicGrabMode === 'not_contained'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                    title="Select all elements not contained outside the box"
                  >
                    Not Contained
                  </button>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none ml-2">
                  <input
                    type="checkbox"
                    checked={keepEmptyBox}
                    onChange={(e) => onSetKeepEmptyBox?.(e.target.checked)}
                    className="accent-indigo-600 rounded cursor-pointer"
                  />
                  <span>Keep Empty Box (Paste Target)</span>
                </label>
              </div>
            )}

            {!isMagicGrabActive && !isPictureCopyActive && renderEraserSubControls()}

            {isMagicGrabActive && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                  Magic Grab Active
                </span>
                <span>Click or drag a box over elements to select, cut, copy, or move</span>
              </div>
            )}

            <div className="ml-auto pl-2 border-l border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClearPage}
                title="Clear current page annotations"
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Page</span>
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PRESENTER MODE OPTIONS RIBBON                                  */}
        {/* ============================================================== */}
        {mode === 'presenter' && (
          <div data-tour-id="presenter-tools" className="flex items-center gap-4 flex-wrap w-full text-xs">
            {/* PRESENTATION MODE CHOICE: Dual View vs Multi-Screen */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onUpdatePresenterSettings({ presentationType: 'dual_view' })}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
                  (presenterSettings.presentationType || 'dual_view') === 'dual_view'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Canva-style Dual View: Opens clean viewer tab alongside this tab without edit controls"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Dual View (Viewer Tab)</span>
              </button>

              <button
                type="button"
                onClick={() => onUpdatePresenterSettings({ presentationType: 'screens' })}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
                  presenterSettings.presentationType === 'screens'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="Detect connected external monitors, AirPlay, or projectors"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>External Displays / Projectors</span>
              </button>
            </div>

            {/* DUAL VIEW CONTROLS */}
            {(presenterSettings.presentationType || 'dual_view') === 'dual_view' ? (
              <>
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 font-medium">Controls on Audience View:</span>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => onUpdatePresenterSettings({ controlsVisibility: 'presenter_only' })}
                      className={`flex items-center gap-1 px-2.5 py-0.5 rounded font-medium transition-colors ${
                        presenterSettings.controlsVisibility === 'presenter_only'
                          ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <EyeOff className="w-3 h-3" />
                      <span>Hidden (Clean)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePresenterSettings({ controlsVisibility: 'show_to_audience' })}
                      className={`flex items-center gap-1 px-2.5 py-0.5 rounded font-medium transition-colors ${
                        presenterSettings.controlsVisibility === 'show_to_audience'
                          ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Visible</span>
                    </button>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenAudienceTab}
                    className="flex items-center gap-1.5 px-3.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
                    title="Opens clean audience tab alongside this tab with live synchronized whiteboard"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Audience Viewer Tab</span>
                  </button>
                </div>
              </>
            ) : (
              /* EXTERNAL MULTI-SCREEN CONTROLS */
              <>
                {presenterSettings.availableScreens.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onRequestScreenPermission}
                      className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-lg font-semibold transition-colors cursor-pointer"
                      title="Click to send device prompt for permission or detect connected monitors"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>No screen detected (Click to detect screens)</span>
                    </button>
                    <span className="text-slate-400 text-[11px] hidden md:inline">
                      (Click sends device prompt for screen management permission)
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <Monitor className="w-3.5 h-3.5 text-blue-500" />
                        <span>Presenter:</span>
                      </span>
                      <select
                        value={presenterSettings.presenterViewScreen}
                        onChange={(e) => onUpdatePresenterSettings({ presenterViewScreen: e.target.value })}
                        className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                      >
                        {presenterSettings.availableScreens.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.resolution ? `(${s.resolution})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <Tv className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Audience:</span>
                      </span>
                      <select
                        value={presenterSettings.audienceViewScreen}
                        onChange={(e) => onUpdatePresenterSettings({ audienceViewScreen: e.target.value })}
                        className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                      >
                        {presenterSettings.availableScreens.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={onOpenAudienceTab}
                      className="ml-auto flex items-center gap-1.5 px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
                    >
                      <Cast className="w-3.5 h-3.5" />
                      <span>Open Audience Tab</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* DRAWING MODE RIBBON                                            */}
        {/* ============================================================== */}
        {mode === 'drawing' && (
          <div className="flex items-center gap-4 flex-wrap">
            <div data-tour-id="drawing-tools" className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {[
                { id: 'pencil', label: 'Pencil', icon: Pencil },
                { id: 'pen', label: 'Pen', icon: Pen },
                { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
                { id: 'eraser', label: 'Eraser', icon: Eraser },
              ].map((p) => {
                const isActive = penType === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSetPenType(p.id as PenType)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      isActive
                        ? p.id === 'eraser'
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <p.icon className="w-3.5 h-3.5" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            {penType === 'eraser' ? (
              renderEraserSubControls()
            ) : (
              <>
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 font-medium">Size:</span>
                  <input
                    type="range"
                    min={penType === 'highlighter' ? 12 : 1}
                    max={penType === 'highlighter' ? 48 : 24}
                    value={strokeWidth}
                    onChange={(e) => onSetStrokeWidth(parseInt(e.target.value))}
                    className="w-24 accent-blue-600 cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-slate-500 w-5">{strokeWidth}</span>
                  <div
                    className="rounded-full shrink-0"
                    style={{
                      width: `${Math.min(22, Math.max(4, strokeWidth))}px`,
                      height: `${Math.min(22, Math.max(4, strokeWidth))}px`,
                      backgroundColor: currentColor,
                      opacity: penType === 'highlighter' ? 0.4 : 1,
                    }}
                  />
                </div>
              </>
            )}
            </div>

            {renderColorAndPaletteControls()}
          </div>
        )}

        {/* ============================================================== */}
        {/* CALCULATOR MODE RIBBON                                         */}
        {/* ============================================================== */}
        {mode === 'calculator' && (
          <div data-tour-id="calculator-tools" className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={onAddCalculatorAtCenter}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Scientific Calculator</span>
            </button>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
              <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium">
                💡 Tip: Tap anywhere on the page to drop calculator instantly
              </span>
              <span>Use the arrow cross to drag, and top-right/bottom-left L-grabs to scale</span>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* GRAPHING (DESMOS) MODE RIBBON                                  */}
        {/* ============================================================== */}
        {mode === 'graphing' && (
          <div data-tour-id="graphing-tools" className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={onAddDesmosBoxAtCenter}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Desmos Graph Box</span>
            </button>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 font-medium">Graph Transparency:</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={graphOpacity}
                onChange={(e) => onSetGraphOpacity(parseFloat(e.target.value))}
                className="w-24 accent-indigo-600 cursor-pointer"
              />
              <span className="font-mono text-[11px] text-slate-500">
                {Math.round((1 - graphOpacity) * 100)}%
              </span>
            </div>

            <div className="text-xs text-slate-500">
              <span>Drag marquee on canvas to stretch custom graph size</span>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* GEOMETRIC MODE RIBBON                                          */}
        {/* ============================================================== */}
        {mode === 'geometric' && (
          <div data-tour-id="geometric-tools" className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {[
                { id: 'rect', label: 'Rectangle', icon: Square },
                { id: 'circle', label: 'Circle/Ellipse', icon: Circle },
                { id: 'triangle', label: 'Triangle', icon: Triangle },
                { id: 'line', label: 'Line', icon: Minus },
                { id: 'arrow', label: 'Arrow', icon: MoveRight },
                { id: 'double_arrow', label: 'Double Arrow', icon: MoveHorizontal },
                { id: 'grid', label: 'Axes Grid', icon: Grid },
                { id: 'angle', label: 'Angle Tool (Circle & Rays)', icon: Compass },
              ].map((s) => {
                const isActive = !isGeometricEraserActive && shapeType === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    onClick={() => {
                      onSetGeometricEraserActive?.(false);
                      onSetShapeType(s.id as ShapeType);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-xs ring-1 ring-amber-400'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <s.icon className="w-4 h-4" />
                  </button>
                );
              })}

              <button
                type="button"
                title="Eraser (Scrub, Select Box Area, or Circle Erase)"
                onClick={() => onSetGeometricEraserActive?.(!isGeometricEraserActive)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  isGeometricEraserActive
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Eraser</span>
              </button>
            </div>

            {isGeometricEraserActive ? (
              renderEraserSubControls()
            ) : (
              <>
                {shapeType === 'angle' && (
                  <>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-lg text-xs font-medium">
                      <Compass className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Drag circle → Ray 1 → Ray 2 → Click acute/obtuse arc</span>
                    </div>

                    {/* Angle Controls: Radians/Degrees, Ray Order, Negative Angles */}
                    <div className="flex items-center gap-1 pl-2 border-l border-amber-300 dark:border-amber-700">
                      <span className="text-xs text-amber-800 dark:text-amber-200 font-medium">Unit:</span>
                      <button
                        type="button"
                        onClick={() => onSetAngleUnit?.(angleUnit === 'deg' ? 'rad' : 'deg')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                          angleUnit === 'deg'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 hover:bg-amber-200'
                        }`}
                      >
                        Degrees (°)
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetAngleUnit?.(angleUnit === 'deg' ? 'rad' : 'deg')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                          angleUnit === 'rad'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 hover:bg-amber-200'
                        }`}
                      >
                        Radians (rad)
                      </button>
                    </div>

                    <div className="flex items-center gap-1 pl-2 border-l border-amber-300 dark:border-amber-700">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-amber-900 dark:text-amber-200 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={allowNegativeAngles}
                          onChange={(e) => onSetAllowNegativeAngles?.(e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span>Allow Negative</span>
                      </label>
                    </div>

                    {allowNegativeAngles && (
                      <div className="flex items-center gap-1 pl-2 border-l border-amber-300 dark:border-amber-700">
                        <span className="text-xs text-amber-800 dark:text-amber-200 font-medium whitespace-nowrap">
                          Negative Direction:
                        </span>
                        <div className="flex items-center gap-0.5 bg-amber-100/80 dark:bg-amber-900/50 p-0.5 rounded">
                          <button
                            type="button"
                            onClick={() => onSetAngleNegativeDirection?.('counter_clockwise')}
                            title="Angle becomes negative when dragging Ray 2 counter-clockwise past Ray 1"
                            className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                              angleNegativeDirection === 'counter_clockwise'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-amber-800 dark:text-amber-200 hover:bg-amber-200/70'
                            }`}
                          >
                            ↺ Counter-Clockwise
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetAngleNegativeDirection?.('clockwise')}
                            title="Angle becomes negative when dragging Ray 2 clockwise past Ray 1"
                            className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                              angleNegativeDirection === 'clockwise'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-amber-800 dark:text-amber-200 hover:bg-amber-200/70'
                            }`}
                          >
                            ↻ Clockwise
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 font-medium">Size:</span>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={shapeStrokeWidth}
                    onChange={(e) => onSetShapeStrokeWidth(parseInt(e.target.value, 10))}
                    aria-label="Geometric line size"
                    data-testid="geometric-size-slider"
                    className="w-24 accent-amber-600 cursor-pointer"
                  />
                  <span
                    data-testid="geometric-size-value"
                    className="font-mono text-[11px] text-slate-500 w-7 tabular-nums"
                  >
                    {shapeStrokeWidth}px
                  </span>
                  <div className="w-6 h-5 flex items-center justify-center shrink-0">
                    <div
                      className="w-full rounded-full"
                      style={{
                        height: `${Math.min(18, Math.max(1, shapeStrokeWidth))}px`,
                        backgroundColor: currentColor,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 font-medium">Style:</span>
                  {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onSetShapeStyle(st)}
                      className={`px-2 py-0.5 rounded text-xs capitalize ${
                        shapeStyle === st
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-medium'
                          : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={shapeFill}
                      onChange={(e) => onSetShapeFill(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-medium">Fill:</span>
                  </label>

                  <div
                    className="w-5 h-5 rounded border shrink-0 transition-colors"
                    title={
                      shapeFill && shapeFillOpacity > 0
                        ? `Fill preview: ${shapeFillOpacity}% opacity`
                        : 'No fill (transparent)'
                    }
                    style={{
                      borderColor: currentColor,
                      backgroundColor:
                        shapeFill && shapeFillOpacity > 0
                          ? hexWithAlphaPercent(currentColor, shapeFillOpacity)
                          : 'transparent',
                    }}
                  />

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={shapeFill ? shapeFillOpacity : 0}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      onSetShapeFillOpacity?.(next);
                      if (next > 0 && !shapeFill) {
                        onSetShapeFill(true);
                      } else if (next === 0 && shapeFill) {
                        onSetShapeFill(false);
                      }
                    }}
                    title="Adjust shape fill level (0% transparent to 100% solid)"
                    className="w-20 accent-amber-600 cursor-pointer"
                  />

                  <span className="font-mono text-[11px] text-slate-500 tabular-nums w-8">
                    {shapeFill ? shapeFillOpacity : 0}%
                  </span>
                </div>

                {renderColorAndPaletteControls()}
              </>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* DICTATE MODE RIBBON                                            */}
        {/* ============================================================== */}
        {mode === 'dictate' && (
          <div data-tour-id="dictate-tools" className="flex items-center gap-3 flex-wrap w-full">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex-wrap">
              <button
                type="button"
                onClick={() => {
                  onSetDictateEraserActive?.(false);
                  onSetDictateSubMode?.('height');
                }}
                title="Drag vertically from one point to a lower point to define text height (expands right without wrapping)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !isDictateEraserActive && dictateSubMode === 'height'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <MoveVertical className="w-3.5 h-3.5" />
                <span>Define Text Box Height</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetDictateEraserActive?.(false);
                  onSetDictateSubMode?.('dimensions');
                }}
                title="Draw a 2D box on the page; text wraps downward when it reaches the right edge"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !isDictateEraserActive && dictateSubMode === 'dimensions'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <BoxSelect className="w-3.5 h-3.5" />
                <span>Define Text Box Dimensions</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetDictateEraserActive?.(false);
                  onSetDictateSubMode?.('constant_font');
                }}
                title="Set a constant font size in the top bar and draw a horizontal line to define wrap width"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !isDictateEraserActive && dictateSubMode === 'constant_font'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Set Constant Text Box Font</span>
              </button>

              <button
                type="button"
                onClick={() => onSetDictateEraserActive?.(!isDictateEraserActive)}
                title="Eraser (Scrub, Select Box Area, or Circle Erase)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isDictateEraserActive
                    ? 'bg-rose-500 text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Eraser</span>
              </button>
            </div>

            {isDictateEraserActive ? (
              renderEraserSubControls()
            ) : (
              <>
                {/* Constant Font Size Input Box (always visible & editable in top bar with default value) */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-colors ${
                    dictateSubMode === 'constant_font'
                      ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-400 dark:border-sky-600 text-sky-900 dark:text-sky-100'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="font-medium whitespace-nowrap">Font Size:</span>
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={dictateFontDraft}
                    onFocus={() => {
                      onSetDictateEraserActive?.(false);
                      onSetDictateSubMode?.('constant_font');
                    }}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDictateFontDraft(raw);
                      const parsed = parseInt(raw, 10);
                      if (!isNaN(parsed) && parsed >= 10) {
                        onSetConstantDictateFontSize?.(Math.min(200, parsed));
                        onSetDictateSubMode?.('constant_font');
                      }
                    }}
                    onBlur={() => {
                      const parsed = parseInt(dictateFontDraft, 10);
                      const clamped = isNaN(parsed) ? 24 : Math.max(10, Math.min(200, parsed));
                      setDictateFontDraft(String(clamped));
                      onSetConstantDictateFontSize?.(clamped);
                    }}
                    aria-label="Constant text box font size in pixels"
                    className="w-14 px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-center font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">px</span>
                </div>

                {/* Cross-Platform Microphone Permission Control (Apple iOS/iPadOS/macOS, Windows, Android) */}
                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
                  {micPermission === 'granted' ? (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Mic Ready</span>
                    </span>
                  ) : micPermission === 'denied' ? (
                    <button
                      type="button"
                      disabled={isRequestingMicPermission}
                      onClick={() => onRequestMicPermission?.()}
                      title="Microphone access is blocked — click to request again or view device settings instructions"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      <MicOff className="w-3.5 h-3.5 shrink-0" />
                      <span>{isRequestingMicPermission ? 'Requesting...' : 'Mic Blocked · Allow'}</span>
                    </button>
                  ) : micPermission === 'unsupported' ? (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-medium whitespace-nowrap">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>HTTPS Required for Mic</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isRequestingMicPermission}
                      onClick={() => onRequestMicPermission?.()}
                      title="Ask for Microphone Permission (Apple, Windows & Android)"
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-colors whitespace-nowrap"
                    >
                      <Mic className="w-3.5 h-3.5 shrink-0" />
                      <span>{isRequestingMicPermission ? 'Requesting Mic...' : 'Allow Mic'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  {dictateSubMode === 'height' && (
                    <span>Drag vertically on the page to set text height (no wrap, expands right)</span>
                  )}
                  {dictateSubMode === 'dimensions' && (
                    <span>Drag a box on the page to set text height and wrap width</span>
                  )}
                  {dictateSubMode === 'constant_font' && (
                    <span>Draw a horizontal line on the page to define wrap width at {constantDictateFontSize}px font</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TOUCH CONTROLS MODE RIBBON                                     */}
        {/* ============================================================== */}
        {mode === 'touch_controls' && (
          <div data-tour-id="touch-controls" className="flex items-center gap-3 flex-wrap py-0.5">
            <span className="text-xs font-bold text-cyan-800 dark:text-cyan-300 uppercase tracking-wider shrink-0">
              Touch Strategy:
            </span>

            {/* Strategy 1: Original 2-Finger Touch Mode */}
            <button
              type="button"
              onClick={() => onSetTouchInputMode('two_finger')}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                touchInputMode === 'two_finger'
                  ? 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500 ring-2 ring-cyan-400 text-cyan-950 dark:text-cyan-100 shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-cyan-300'
              }`}
            >
              {/* Side-view / Gesture SVG: Finger writing & 2-finger pinch zoom/pan */}
              <div className="w-16 h-12 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                <svg viewBox="0 0 100 65" className="w-full h-full p-1">
                  <rect x="5" y="52" width="90" height="4" rx="2" fill="#94A3B8" />
                  {/* Finger 1 touching */}
                  <path
                    d="M 28 16 C 32 16, 35 20, 35 26 L 35 48 C 35 51, 27 51, 27 48 L 27 26 C 27 20, 28 16, 28 16 Z"
                    fill="#FDBA74"
                    stroke="#EA580C"
                    strokeWidth="1.2"
                  />
                  {/* Finger 2 touching */}
                  <path
                    d="M 65 16 C 69 16, 72 20, 72 26 L 72 48 C 72 51, 64 51, 64 48 L 64 26 C 64 20, 65 16, 65 16 Z"
                    fill="#FDBA74"
                    stroke="#EA580C"
                    strokeWidth="1.2"
                  />
                  {/* Zoom arrows */}
                  <line x1="40" y1="30" x2="60" y2="30" stroke="#0284C7" strokeWidth="2" />
                  <polyline points="44,26 40,30 44,34" fill="none" stroke="#0284C7" strokeWidth="2" />
                  <polyline points="56,26 60,30 56,34" fill="none" stroke="#0284C7" strokeWidth="2" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">2-Finger Touch</span>
                  {touchInputMode === 'two_finger' && (
                    <span className="px-1.5 py-0.2 bg-cyan-500 text-white text-[9px] rounded-full font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight max-w-[155px]">
                  Original touch mode. Finger draws; 2-finger pinch &amp; pan enabled.
                </p>
              </div>
            </button>

            {/* Strategy 2: 2-Finger Touch Controls + Stylus (Distinguishes skin vs stylus) */}
            <button
              type="button"
              onClick={() => onSetTouchInputMode('two_finger_stylus')}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                touchInputMode === 'two_finger_stylus'
                  ? 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500 ring-2 ring-cyan-400 text-cyan-950 dark:text-cyan-100 shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-cyan-300'
              }`}
            >
              {/* SVG: Stylus + Palm ignored + Two fingers zoom */}
              <div className="w-16 h-12 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                <svg viewBox="0 0 100 65" className="w-full h-full p-1">
                  <rect x="5" y="52" width="90" height="4" rx="2" fill="#94A3B8" />
                  {/* Palm contact rejected */}
                  <ellipse cx="24" cy="51" rx="9" ry="2.5" fill="#EF4444" opacity="0.35" />
                  {/* Wrist & Stylus on left */}
                  <path
                    d="M 8 36 C 14 40, 18 50, 26 51 C 34 51, 38 44, 42 36 C 36 28, 22 26, 8 36 Z"
                    fill="#FDBA74"
                    stroke="#EA580C"
                    strokeWidth="1.1"
                  />
                  <line x1="48" y1="12" x2="40" y2="52" stroke="#0284C7" strokeWidth="2.8" strokeLinecap="round" />
                  <circle cx="40" cy="52" r="2" fill="#0369A1" />
                  {/* Two fingers on right */}
                  <path d="M 65 20 L 65 49" stroke="#EA580C" strokeWidth="5" strokeLinecap="round" />
                  <path d="M 80 20 L 80 49" stroke="#EA580C" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="24" cy="41" r="5" fill="#10B981" />
                  <path d="M 22 41 L 23.5 42.5 L 26.5 39" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">2-Finger + Stylus</span>
                  {touchInputMode === 'two_finger_stylus' && (
                    <span className="px-1.5 py-0.2 bg-cyan-500 text-white text-[9px] rounded-full font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight max-w-[175px]">
                  Stylus draws &amp; wrist skin ignored. 2 fingers still pinch-zoom &amp; pan.
                </p>
              </div>
            </button>

            {/* Strategy 3: Stylus and Hand (Wrist on page, Palm Rejection, Left Toolbar) */}
            <button
              type="button"
              onClick={() => onSetTouchInputMode('stylus_and_hand')}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                touchInputMode === 'stylus_and_hand'
                  ? 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500 ring-2 ring-cyan-400 text-cyan-950 dark:text-cyan-100 shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-cyan-300'
              }`}
            >
              <div className="w-16 h-12 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                <svg viewBox="0 0 100 65" className="w-full h-full p-1">
                  <rect x="5" y="52" width="90" height="4" rx="2" fill="#94A3B8" />
                  <ellipse cx="32" cy="52" rx="10" ry="2.5" fill="#EF4444" opacity="0.3" />
                  <path
                    d="M 10 32 C 18 36, 24 50, 36 52 C 48 53, 56 46, 66 36 C 62 28, 50 20, 38 20 C 26 20, 16 24, 10 32 Z"
                    fill="#FDBA74"
                    stroke="#EA580C"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M 48 40 C 56 44, 64 42, 66 36 C 64 30, 56 30, 52 34 Z"
                    fill="#FED7AA"
                    stroke="#EA580C"
                    strokeWidth="1.2"
                  />
                  <line x1="74" y1="12" x2="64" y2="52" stroke="#0284C7" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="64" cy="52" r="2" fill="#0369A1" />
                  <g transform="translate(26, 42) scale(0.6)">
                    <circle cx="10" cy="10" r="9" fill="#10B981" />
                    <path d="M 6 10 L 9 13 L 14 7" stroke="#FFFFFF" strokeWidth="2" fill="none" />
                  </g>
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">Stylus &amp; Hand</span>
                  {touchInputMode === 'stylus_and_hand' && (
                    <span className="px-1.5 py-0.2 bg-cyan-500 text-white text-[9px] rounded-full font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight max-w-[175px]">
                  Wrist ignored; 2-finger controls off. Left-side zoom/pan toolbar active.
                </p>
              </div>
            </button>

            {/* Strategy 4: Stylus Only (Hand elevated above screen) */}
            <button
              type="button"
              onClick={() => onSetTouchInputMode('stylus_only')}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                touchInputMode === 'stylus_only'
                  ? 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500 ring-2 ring-cyan-400 text-cyan-950 dark:text-cyan-100 shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-cyan-300'
              }`}
            >
              <div className="w-16 h-12 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                <svg viewBox="0 0 100 65" className="w-full h-full p-1">
                  <rect x="5" y="52" width="90" height="4" rx="2" fill="#94A3B8" />
                  <line x1="5" y1="56" x2="95" y2="56" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2,2" />
                  <line x1="30" y1="44" x2="30" y2="50" stroke="#06B6D4" strokeWidth="1.5" strokeDasharray="1,1" />
                  <line x1="50" y1="42" x2="50" y2="50" stroke="#06B6D4" strokeWidth="1.5" strokeDasharray="1,1" />
                  <path
                    d="M 10 22 C 22 24, 30 28, 42 30 C 50 32, 60 30, 68 24 C 64 20, 52 14, 40 14 C 28 14, 18 16, 10 22 Z"
                    fill="#FDBA74"
                    stroke="#EA580C"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M 48 30 C 55 35, 62 38, 66 36 C 68 34, 66 28, 60 26 Z"
                    fill="#FED7AA"
                    stroke="#EA580C"
                    strokeWidth="1.2"
                  />
                  <line x1="72" y1="8" x2="62" y2="52" stroke="#0284C7" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="62" cy="52" r="2" fill="#0369A1" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">Stylus Only</span>
                  {touchInputMode === 'stylus_only' && (
                    <span className="px-1.5 py-0.2 bg-cyan-500 text-white text-[9px] rounded-full font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight max-w-[155px]">
                  Hand elevated off page. All fingers &amp; touch gestures ignored.
                </p>
              </div>
            </button>

            {/* STYLUS DETECTION & CALIBRATION SECTION */}
            <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-slate-200 dark:border-slate-700 flex-wrap">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
                  Stylus Detection
                </span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onUpdateStylusConfig({ detectionMode: 'active_pen' })}
                    title="Hardware active stylus only (pointerType === 'pen': Apple Pencil, Surface Pen, S Pen)"
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      stylusConfig.detectionMode === 'active_pen'
                        ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Active Pen
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateStylusConfig({ detectionMode: 'smart_tip' })}
                    title="Also accepts passive / capacitive styluses with narrow contact tip size while rejecting wide palm contacts"
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      stylusConfig.detectionMode === 'smart_tip'
                        ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Smart Tip (Passive)
                  </button>
                </div>
              </div>

              {stylusConfig.detectionMode === 'active_pen' ? (
                <div
                  className="flex flex-col gap-0.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
                  title="Minimum active pen pressure needed to continue ink as the stylus lifts off glass (0.00–0.30). Quick initial taps are never dropped."
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                    <span>Lift Cutoff</span>
                    <span className="font-mono tabular-nums font-bold text-cyan-600 dark:text-cyan-400">
                      {currentMinPenPressure.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.30"
                    step="0.01"
                    value={currentMinPenPressure}
                    aria-label="Active Pen Lift Cutoff Pressure"
                    data-testid="ribbon-lift-cutoff-slider"
                    onChange={(e) =>
                      onUpdateStylusConfig({ minPenPressure: parseFloat(e.target.value) })
                    }
                    className="w-24 accent-cyan-600 cursor-pointer"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                    <span>Max Tip Size</span>
                    <span className="font-mono tabular-nums font-bold text-cyan-600 dark:text-cyan-400">
                      {stylusConfig.maxTipSizePx}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="32"
                    value={stylusConfig.maxTipSizePx}
                    onChange={(e) =>
                      onUpdateStylusConfig({ maxTipSizePx: parseInt(e.target.value, 10) })
                    }
                    className="w-24 accent-cyan-600 cursor-pointer"
                  />
                </div>
              )}

              <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stylusConfig.allowMouseInput}
                  onChange={(e) => onUpdateStylusConfig({ allowMouseInput: e.target.checked })}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <span>Allow Mouse</span>
              </label>

              {/* Inline Mini Tap-to-Test & Calibrate Pad */}
              <div className="flex items-center gap-2">
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    applySampleFromPointer(e, 'down');
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons > 0 || e.pressure > 0 || e.pointerType === 'touch') {
                      const metrics = getEffectiveTouchMetrics(e.nativeEvent);
                      if (e.pointerType === 'pen' || metrics.isMeasured) {
                        applySampleFromPointer(e, 'move');
                      }
                    }
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    applySampleFromTouch(e, false);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                    applySampleFromTouch(e, false);
                  }}
                  style={{ touchAction: 'none' }}
                  className="px-3 py-1.5 rounded-xl border-2 border-dashed border-cyan-400 dark:border-cyan-700 bg-cyan-50/60 dark:bg-cyan-950/30 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 cursor-crosshair select-none flex flex-col justify-center min-w-[160px]"
                  title="Tap or drag stylus tip here to inspect reported size, pressure & lift tail status"
                >
                  <span className="text-[10px] font-bold text-cyan-800 dark:text-cyan-200">
                    Tap Here to Test Stylus
                  </span>
                  {lastStylusSample ? (
                    <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {lastStylusSample.pointerType.toUpperCase()} · {lastStylusSample.width}×
                      {lastStylusSample.height}px · P:{lastStylusSample.pressure.toFixed(2)}{' '}
                      <strong
                        className={
                          !lastStylusSample.accepted
                            ? 'text-rose-600 dark:text-rose-400'
                            : lastStylusSample.belowPressureCutoff
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {!lastStylusSample.accepted
                          ? '✕ Blocked'
                          : lastStylusSample.belowPressureCutoff
                          ? '✕ Tail Filtered'
                          : '✓ OK'}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      Reads pen/touch, size &amp; pressure
                    </span>
                  )}
                </div>

                {lastStylusSample &&
                  ((lastStylusSample.pointerType === 'touch' && !lastStylusSample.accepted) ||
                    (lastStylusSample.pointerType === 'pen' &&
                      (stylusConfig.detectionMode !== 'active_pen' ||
                        currentMinPenPressure === 0 ||
                        (lastStylusSample.minObservedPenPressure !== null &&
                          getRecommendedPenCutoff(lastStylusSample) !== currentMinPenPressure)))) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (lastStylusSample.pointerType === 'pen') {
                          const cutoff = getRecommendedPenCutoff(lastStylusSample);
                          onUpdateStylusConfig({
                            detectionMode: 'active_pen',
                            minPenPressure: cutoff,
                          });
                        } else {
                          const tipSize = Math.max(lastStylusSample.width, lastStylusSample.height, 1);
                          onUpdateStylusConfig({
                            detectionMode: 'smart_tip',
                            maxTipSizePx: Math.max(8, Math.min(32, tipSize + 6)),
                          });
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold shadow-xs transition-colors"
                    >
                      Auto-Setup
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => setShowStylusTestModal(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-300 dark:border-cyan-800 bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-slate-700 text-[11px] font-semibold transition-colors"
                >
                  Calibration Pad
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STYLUS CALIBRATION MODAL (Portaled to body for full testing)   */}
        {/* ================================================================== */}
        {showStylusTestModal &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              onClick={() => setShowStylusTestModal(false)}
              className="fixed inset-0 z-[9998] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Stylus Detection &amp; Palm Rejection Tester
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tap or write &amp; lift with your stylus below to test contacts, pressure &amp; tail cutoff.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStylusTestModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Active Pen Lift Cutoff Slider directly inside Calibration Pad */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Active Pen Lift Cutoff Pressure
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Quick taps always register; trailing lift points below cutoff are trimmed.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min="0"
                      max="0.30"
                      step="0.01"
                      value={currentMinPenPressure}
                      aria-label="Calibration Pad Lift Cutoff Pressure"
                      data-testid="modal-lift-cutoff-slider"
                      onChange={(e) =>
                        onUpdateStylusConfig({ minPenPressure: parseFloat(e.target.value) })
                      }
                      className="w-32 accent-cyan-600 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums text-xs font-bold text-cyan-700 dark:text-cyan-300 min-w-[3rem] text-right">
                      {currentMinPenPressure.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const { size, accepted, belowPressureCutoff } = applySampleFromPointer(e, 'down');
                    setTestModalDots((prev) => [
                      ...prev.slice(-18),
                      {
                        id: Date.now() + Math.random(),
                        x,
                        y,
                        pointerType: e.pointerType,
                        size,
                        accepted,
                        belowCutoff: belowPressureCutoff,
                      },
                    ]);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons > 0 || e.pressure > 0 || e.pointerType === 'touch') {
                      const metrics = getEffectiveTouchMetrics(e.nativeEvent);
                      if (e.pointerType === 'pen' || metrics.isMeasured) {
                        const { size, accepted, belowPressureCutoff } = applySampleFromPointer(e, 'move');
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        setTestModalDots((prev) => {
                          if (prev.length === 0) return prev;
                          const next = [...prev];
                          for (let i = next.length - 1; i >= 0; i--) {
                            if (
                              next[i].pointerType === e.pointerType &&
                              Math.hypot(next[i].x - x, next[i].y - y) < 48
                            ) {
                              next[i] = {
                                ...next[i],
                                size,
                                accepted,
                                belowCutoff: belowPressureCutoff,
                              };
                              break;
                            }
                          }
                          return next;
                        });
                      }
                    }
                  }}
                  onTouchStart={(e) => applySampleFromTouch(e, true)}
                  onTouchMove={(e) => applySampleFromTouch(e, true)}
                  style={{ touchAction: 'none' }}
                  className="relative w-full h-56 rounded-xl border-2 border-dashed border-cyan-400 dark:border-cyan-700 bg-slate-50 dark:bg-slate-950 overflow-hidden cursor-crosshair select-none flex items-center justify-center"
                >
                  <span className="text-xs text-slate-400 pointer-events-none text-center px-6">
                    Tap or Write &amp; Lift Stylus Here — Green = Active Ink, Amber = Lift Tail Filtered, Red = Palm Rejected
                  </span>
                  {testModalDots.map((dot) => (
                    <div
                      key={dot.id}
                      style={{
                        left: `${dot.x}px`,
                        top: `${dot.y}px`,
                        width: `${Math.max(18, Math.min(80, dot.size))}px`,
                        height: `${Math.max(18, Math.min(80, dot.size))}px`,
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none border-2 flex items-center justify-center text-[9px] font-mono font-bold ${
                        !dot.accepted
                          ? 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300'
                          : dot.belowCutoff
                          ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {dot.pointerType}
                    </div>
                  ))}
                </div>

                {lastStylusSample && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs">
                    <div className="font-mono tabular-nums text-slate-700 dark:text-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Type: <strong>{lastStylusSample.pointerType}</strong></span>
                      <span>Size: <strong>{lastStylusSample.width}×{lastStylusSample.height}px</strong></span>
                      <span>Pressure: <strong>{lastStylusSample.pressure.toFixed(2)}</strong></span>
                      <span>Tilt: <strong>{lastStylusSample.tiltX}°,{lastStylusSample.tiltY}°</strong></span>
                      <span
                        className={`font-semibold ${
                          !lastStylusSample.accepted
                            ? 'text-rose-600 dark:text-rose-400'
                            : lastStylusSample.belowPressureCutoff
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {!lastStylusSample.accepted
                          ? '✕ Rejected'
                          : lastStylusSample.belowPressureCutoff
                          ? `✕ Tail Below Cutoff (< ${currentMinPenPressure.toFixed(2)})`
                          : '✓ Active Ink'}
                      </span>
                    </div>
                    {lastStylusSample.pointerType === 'touch' ? (
                      <button
                        type="button"
                        onClick={() => {
                          const tipSize = Math.max(lastStylusSample.width, lastStylusSample.height, 1);
                          onUpdateStylusConfig({
                            detectionMode: 'smart_tip',
                            maxTipSizePx: Math.max(8, Math.min(32, tipSize + 6)),
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold shrink-0"
                      >
                        Use This Tap as Passive Stylus (≤{Math.max(8, Math.min(32, Math.max(lastStylusSample.width, lastStylusSample.height, 1) + 6))}px)
                      </button>
                    ) : lastStylusSample.pointerType === 'pen' ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const recommended = getRecommendedPenCutoff(lastStylusSample);
                            onUpdateStylusConfig({
                              detectionMode: 'active_pen',
                              minPenPressure: recommended,
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold"
                        >
                          Auto-Setup Cutoff ({getRecommendedPenCutoff(lastStylusSample).toFixed(2)})
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStylusConfig({ detectionMode: 'active_pen' })}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        >
                          Lock to Active Pen
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setTestModalDots([]);
                      setLastStylusSample(null);
                    }}
                    className="text-slate-500 hover:text-slate-700 font-medium"
                  >
                    Clear Test Dots
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStylusTestModal(false)}
                    className="px-4 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ============================================================== */}
        {/* TRASH ZONE: Big X in Circle at bottom center for Swatch Deletion */}
        {/* ============================================================== */}
        {draggedPaletteIndex !== null &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const src = parseInt(e.dataTransfer.getData('text/palette'), 10);
                if (!isNaN(src)) {
                  handleDeletePaletteColor(src);
                }
                setDraggedPaletteIndex(null);
                setDragOverPaletteIndex(null);
              }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-1.5 animate-bounce select-none pointer-events-auto"
            >
              <div className="w-16 h-16 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl border-4 border-white dark:border-slate-800 hover:bg-rose-700 hover:scale-110 transition-all cursor-pointer">
                <X className="w-9 h-9 stroke-[3]" />
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-slate-900/90 text-white rounded-full shadow-lg backdrop-blur-xs">
                Drag here to delete swatch
              </span>
            </div>,
            document.body
          )}
      </div>
    </header>
  );
};
