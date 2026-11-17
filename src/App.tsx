import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Maximize2,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  ArrowLeft,
  ArrowRight,
  Copy,
  Plus,
  FileText,
  AlignLeft,
  Grid,
  CircleDot,
} from 'lucide-react';
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
  CanvasImage,
  DictatedTextBox,
  DictateSubMode,
  MagicGrabMode,
  GrabbedSelection,
  PageData,
  PaperTemplate,
  PresenterMode,
  PresenterSettings,
  SaveAsMode,
  TouchInputMode,
  StylusDetectionConfig,
  CameraViewportState,
  LiveCanvasOverlay,
  LivePresenterToolState,
  ControlsVisibility,
  ExplorerFileItem,
  ExplorerFolderTab,
  ActiveFileContext,
} from './types';
import { useSpeechDictation } from './utils/speechDictation';
import { TopBarRibbon } from './components/TopBarRibbon';
import { CanvasStage } from './components/CanvasStage';
import { VirtualizedPageSlot } from './components/VirtualizedPageSlot';
import { CALC_BASE_WIDTH, CALC_BASE_HEIGHT } from './components/ScientificCalculatorBox';
import { ClearPageModal } from './components/ClearPageModal';
import { DocumentScrollBar } from './components/DocumentScrollBar';
import { OnScreenKeyboard, VirtualKeyAction } from './components/OnScreenKeyboard';
import { OverwriteConfirmModal } from './components/explorer/OverwriteConfirmModal';
import { ClassicFileExplorerModal } from './components/explorer/ClassicFileExplorerModal';
import {
  CreatorInfoDialog,
  hasCompletedTutorialCookie,
  OnboardingTutorialModal,
  setCompletedTutorialCookie,
  TUTORIAL_STEPS,
  TutorialStage,
} from './components/OnboardingTutorialModal';
import { harvestDocumentColors, CLASSROOM_PRESET_COLORS } from './utils/colorUtils';
import { INITIAL_PAGES } from './utils/sampleData';
import {
  buildSaveAsBlob,
  canShareFilesOnDevice,
  doesHandleMatchSaveMode,
  executeSaveAs,
  getDefaultSaveFileName,
  ProjectData,
  shareFileWithSystemSheet,
  triggerDirectBlobDownload,
} from './utils/exportUtils';
import { detectConnectedScreens, FALLBACK_SCREENS } from './utils/screenUtils';
import { loadPdfPages } from './utils/pdfLoader';
import { sweepCircleErase } from './utils/partialEraseUtils';
import {
  extractFileExtension,
  getDirectoryHandle,
  getSavedActiveFileContext,
  loadSavedFolderTabs,
  queryHandlePermission,
  runExplorerCleanupMigration,
  saveActiveFileContext,
  saveDirectoryHandle,
  saveFolderTabs,
  scanDirectoryFiles,
  verifyHandlePermission,
  writeFileToDirectoryHandle,
} from './utils/fileExplorerStorage';
import {
  getCachedFullPdfPageUrl,
  releasePagePdfResources,
  resolvePdfPageDataUrl,
} from './utils/pdfPageCache';
import { clearCachedPagePreview } from './utils/pagePreviewRenderer';
import {
  SYNC_CHANNEL_NAME,
  LivestreamDocumentState,
  LivestreamMessage,
  saveLivestreamSnapshotToDb,
  loadLivestreamSnapshotFromDb,
  postSyncMessageSafe,
  saveSmallLocalStorageBackup,
  computeAssetsSignature,
  buildCompactSyncPayload,
  mergeIncomingLivestreamState,
} from './utils/livestreamSync';
import {
  captureAllMountedWidgets,
  invalidateAllWidgetSnapshots,
  syncLiveDesmosBoxes,
} from './utils/widgetSnapshotCache';

interface ClipboardData {
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images: CanvasImage[];
  dictatedTextBoxes?: DictatedTextBox[];
}

const EMPTY_STROKES: CanvasStroke[] = [];
const EMPTY_SHAPES: GeometricShape[] = [];
const EMPTY_GRAPHS: DesmosBox[] = [];
const EMPTY_CALCULATORS: CalculatorBox[] = [];
const EMPTY_IMAGES: CanvasImage[] = [];
const EMPTY_DICTATED: DictatedTextBox[] = [];

function cloneDocData<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val)) as T;
}

export default function App() {
  // Mode & Active Tools
  const [mode, setMode] = useState<AppMode>('drawing');
  const [penType, setPenType] = useState<PenType>('pen');

  // Per-Pen Size and Color Memory (user requested each pen remember its own width and color)
  const [penProfiles, setPenProfiles] = useState<Record<PenType, { width: number; color: string }>>({
    pen: { width: 3, color: '#0F172A' },
    pencil: { width: 2, color: '#475569' },
    highlighter: { width: 24, color: '#FEF08A' },
    eraser: { width: 24, color: '#EF4444' },
  });

  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [currentColor, setCurrentColor] = useState<string>('#0F172A');
  const [geometricColor, setGeometricColor] = useState<string>('#2563EB');
  const [recentColors, setRecentColors] = useState<string[]>(CLASSROOM_PRESET_COLORS);

  const penTypeRef = useRef(penType);
  penTypeRef.current = penType;
  const penProfilesRef = useRef(penProfiles);
  penProfilesRef.current = penProfiles;
  const geometricColorRef = useRef(geometricColor);
  geometricColorRef.current = geometricColor;

  const syncColorForMode = useCallback((targetMode: AppMode) => {
    if (targetMode === 'drawing') {
      const profile = penProfilesRef.current[penTypeRef.current];
      if (profile) {
        setStrokeWidth(profile.width);
        setCurrentColor(profile.color);
      }
    } else if (targetMode === 'geometric') {
      setCurrentColor(geometricColorRef.current);
    }
  }, []);

  // Switch pen and restore its individual size and color
  const handleSetPenType = (newType: PenType) => {
    setPenType(newType);
    const profile = penProfiles[newType];
    if (profile) {
      setStrokeWidth(profile.width);
      setCurrentColor(profile.color);
    }
  };

  const handleSetStrokeWidth = (w: number) => {
    setStrokeWidth(w);
    setPenProfiles((prev) => ({
      ...prev,
      [penType]: { ...prev[penType], width: w },
    }));
  };

  const handleSetCurrentColor = (c: string) => {
    setCurrentColor(c);
    if (mode === 'drawing') {
      setPenProfiles((prev) => ({
        ...prev,
        [penType]: { ...prev[penType], color: c },
      }));
    } else if (mode === 'geometric') {
      setGeometricColor(c);
    }
  };

  // Geometric state
  const [shapeType, setShapeType] = useState<ShapeType>('rect');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState<number>(3);
  const [shapeStyle, setShapeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [shapeFill, setShapeFill] = useState<boolean>(false);
  const [shapeFillOpacity, setShapeFillOpacity] = useState<number>(25);

  const handleSetShapeFill = (fill: boolean) => {
    setShapeFill(fill);
    if (fill && shapeFillOpacity <= 0) {
      setShapeFillOpacity(25);
    }
  };

  // Edit / Eraser, Magic Grab & Clipboard state
  const [eraserType, setEraserType] = useState<EraserType>('scrub');
  const [eraserSize, setEraserSize] = useState<number>(24);
  const [isMagicGrabActive, setIsMagicGrabActive] = useState<boolean>(false);
  const [magicGrabMode, setMagicGrabMode] = useState<MagicGrabMode>('touch');
  const [keepEmptyBox, setKeepEmptyBox] = useState<boolean>(false);
  const [isPictureCopyActive, setIsPictureCopyActive] = useState<boolean>(false);

  const [selectedItems, setSelectedItems] = useState<{
    strokeIds: string[];
    shapeIds: string[];
    graphIds: string[];
    calcIds: string[];
    imageIds: string[];
    dictateIds: string[];
  }>({ strokeIds: [], shapeIds: [], graphIds: [], calcIds: [], imageIds: [], dictateIds: [] });

  const [activeSelection, setActiveSelection] = useState<GrabbedSelection | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Active file context from File Explorer (for save overwrite flow)
  const [activeFileContext, setActiveFileContextState] = useState<ActiveFileContext | null>(() => {
    return getSavedActiveFileContext();
  });
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [pendingOverwriteSaveMode, setPendingOverwriteSaveMode] = useState<SaveAsMode | null>(null);
  const [saveExplorerState, setSaveExplorerState] = useState<{
    isOpen: boolean;
    defaultMode: SaveAsMode;
    suggestedName?: string;
    notice: string | null;
  }>({
    isOpen: false,
    defaultMode: 'pdf_as_shown',
    notice: null,
  });
  const [saveExplorerTabs, setSaveExplorerTabs] = useState<ExplorerFolderTab[]>([]);
  const [appStatusNotice, setAppStatusNotice] = useState<{
    kind: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!appStatusNotice || appStatusNotice.kind === 'info') return;
    const t = window.setTimeout(() => setAppStatusNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [appStatusNotice]);

  const setActiveFileContext = (ctx: ActiveFileContext | null) => {
    setActiveFileContextState(ctx);
    saveActiveFileContext(ctx);
  };

  // Placed picture snippet images on canvas
  const [images, setImages] = useState<CanvasImage[]>([]);

  // Presenter tool state (laser / spotlight)
  const [presenterMode, setPresenterMode] = useState<PresenterMode>('none');

  // Presenter Settings (screens & audience view)
  const [presenterSettings, setPresenterSettings] = useState<PresenterSettings>({
    controlsVisibility: 'presenter_only',
    presenterViewScreen: 'this_screen',
    audienceViewScreen: 'hdmi_projector',
    availableScreens: FALLBACK_SCREENS,
    hasScreenPermission: null,
  });

  // Theme
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Touch controls state (defaults to original 2-finger touch mode and persists preference)
  const [touchInputMode, setTouchInputModeState] = useState<TouchInputMode>(() => {
    try {
      const saved = localStorage.getItem('noteteacher_touch_input_mode');
      if (
        saved === 'two_finger' ||
        saved === 'two_finger_stylus' ||
        saved === 'stylus_and_hand' ||
        saved === 'stylus_only'
      ) {
        return saved;
      }
    } catch {}
    return 'two_finger';
  });

  const setTouchInputMode = (m: TouchInputMode) => {
    setTouchInputModeState(m);
    try {
      localStorage.setItem('noteteacher_touch_input_mode', m);
    } catch {}
  };

  // Stylus detection & palm-rejection calibration configuration
  const [stylusConfig, setStylusConfigState] = useState<StylusDetectionConfig>(() => {
    try {
      const saved = localStorage.getItem('noteteacher_stylus_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          (parsed.detectionMode === 'active_pen' || parsed.detectionMode === 'smart_tip')
        ) {
          return {
            detectionMode: parsed.detectionMode,
            maxTipSizePx: typeof parsed.maxTipSizePx === 'number' ? parsed.maxTipSizePx : 14,
            allowMouseInput:
              typeof parsed.allowMouseInput === 'boolean' ? parsed.allowMouseInput : true,
          };
        }
      }
    } catch {}
    return {
      detectionMode: 'active_pen',
      maxTipSizePx: 14,
      allowMouseInput: true,
    };
  });

  const handleUpdateStylusConfig = (updated: Partial<StylusDetectionConfig>) => {
    setStylusConfigState((prev) => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem('noteteacher_stylus_config', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Palette colors (User-managed, not auto-filled)
  const [paletteColors, setPaletteColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('noteteacher_palette_colors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['#000000', '#2563EB', '#DC2626', '#16A34A', '#D97706', '#9333EA'];
  });

  const handleUpdatePaletteColors = (cols: string[]) => {
    setPaletteColors(cols);
    try {
      localStorage.setItem('noteteacher_palette_colors', JSON.stringify(cols));
    } catch {}
  };

  // Geometric Angle Tool Settings
  const [angleUnit, setAngleUnit] = useState<'deg' | 'rad'>('deg');
  const [angleNegativeDirection, setAngleNegativeDirection] =
    useState<AngleNegativeDirection>('counter_clockwise');
  const [allowNegativeAngles, setAllowNegativeAngles] = useState<boolean>(false);

  // Graph opacity
  const [graphOpacity, setGraphOpacity] = useState<number>(0.95);

  // Document Pages & Canvas Data
  const [pages, setPages] = useState<PageData[]>(INITIAL_PAGES);
  const [currentPageId, setCurrentPageId] = useState<string>(INITIAL_PAGES[0].id);

  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [shapes, setShapes] = useState<GeometricShape[]>([]);
  const [graphs, setGraphs] = useState<DesmosBox[]>([]);
  const [calculators, setCalculators] = useState<CalculatorBox[]>([]);
  const [dictatedTextBoxes, setDictatedTextBoxes] = useState<DictatedTextBox[]>([]);
  const [dictateSubMode, setDictateSubMode] = useState<DictateSubMode>('height');
  const [constantDictateFontSize, setConstantDictateFontSize] = useState<number>(24);
  const [activeDictateBoxId, setActiveDictateBoxId] = useState<string | null>(null);
  const [selectedDictateBoxId, setSelectedDictateBoxId] = useState<string | null>(null);
  const [editingDictateBoxId, setEditingDictateBoxId] = useState<string | null>(null);
  const [isGeometricEraserActive, setIsGeometricEraserActive] = useState<boolean>(false);
  const [isDictateEraserActive, setIsDictateEraserActive] = useState<boolean>(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const dictatedTextBoxesRef = useRef(dictatedTextBoxes);
  dictatedTextBoxesRef.current = dictatedTextBoxes;
  const activeDictateBoxIdRef = useRef(activeDictateBoxId);
  activeDictateBoxIdRef.current = activeDictateBoxId;
  const editingDictateBoxIdRef = useRef(editingDictateBoxId);
  editingDictateBoxIdRef.current = editingDictateBoxId;

  const {
    isListening: isDictating,
    micPermission,
    isRequestingPermission: isRequestingMicPermission,
    requestMicPermission,
    startDictation,
    stopDictation,
    syncBaseTextIfIdle,
  } = useSpeechDictation({
    onTranscriptUpdate: useCallback((targetBoxId: string, finalText: string, interimText: string) => {
      setDictatedTextBoxes((prev) =>
        prev.map((box) =>
          box.id === targetBoxId
            ? {
                ...box,
                text: finalText,
                interimText,
              }
            : box
        )
      );
    }, []),
    onStatusError: useCallback((message: string) => {
      setAppStatusNotice({ kind: 'error', message });
    }, []),
  });

  const handleSetMode = useCallback(
    (nextMode: AppMode) => {
      setEditingDictateBoxId(null);
      setEditingGridDims(null);
      if (nextMode !== 'dictate' && activeDictateBoxIdRef.current) {
        stopDictation();
        const curId = activeDictateBoxIdRef.current;
        setDictatedTextBoxes((prev) =>
          prev.map((b) => (b.id === curId ? { ...b, interimText: '' } : b))
        );
        setSelectedDictateBoxId(curId);
        setActiveDictateBoxId(null);
      }
      if (
        nextMode === 'dictate' &&
        (micPermission === 'prompt' || micPermission === 'unknown')
      ) {
        void requestMicPermission({ silentIfUnsupported: true });
      }
      syncColorForMode(nextMode);
      setMode(nextMode);
    },
    [stopDictation, micPermission, requestMicPermission, syncColorForMode]
  );

  const handleSetDictateEraserActive = useCallback(
    (active: boolean) => {
      if (active) {
        setEditingDictateBoxId(null);
        if (activeDictateBoxIdRef.current) {
          stopDictation();
          const curId = activeDictateBoxIdRef.current;
          setDictatedTextBoxes((prev) =>
            prev.map((b) => (b.id === curId ? { ...b, interimText: '' } : b))
          );
          setActiveDictateBoxId(null);
        }
      }
      setIsDictateEraserActive(active);
    },
    [stopDictation]
  );

  // Scroll container & viewport-virtualized page tracking
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const pageRefsMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const pageRatiosRef = useRef<Map<string, number>>(new Map());
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const manualScrollLockRef = useRef<boolean>(false);
  const manualScrollLockTimerRef = useRef<number | null>(null);

  const [visiblePageIds, setVisiblePageIds] = useState<Set<string>>(
    () => new Set(INITIAL_PAGES.length > 0 ? [INITIAL_PAGES[0].id] : [])
  );
  const currentPageIdRef = useRef(currentPageId);
  currentPageIdRef.current = currentPageId;

  // Right-edge swipe scrollbar & live page badge state
  const [isRightScrollbarVisible, setIsRightScrollbarVisible] = useState(false);
  const [scrollPageNumber, setScrollPageNumber] = useState(1);
  const lastRightEdgeInputAtRef = useRef<number>(0);
  const rightEdgeTouchStartRef = useRef<{ y: number; inZone: boolean } | null>(null);
  const rightEdgeSwipeRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    activeScrollDrag: boolean;
  } | null>(null);

  const scrollPageRafRef = useRef<number | null>(null);

  // Workspace viewport size & POV (Point-of-View) zoom state
  const [mainViewportSize, setMainViewportSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? Math.max(360, window.innerHeight - 108) : 700,
  });
  const [isFullPovMode, setIsFullPovMode] = useState<boolean>(false);
  const [povZoomFactor, setPovZoomFactor] = useState<number>(1);
  const povPinchRef = useRef<{ initialDist: number; initialZoom: number } | null>(null);
  const [isBottomAddPageOpen, setIsBottomAddPageOpen] = useState<boolean>(false);
  const bottomAddPageRef = useRef<HTMLDivElement | null>(null);

  const computeScrollPageIndicatorNow = useCallback(() => {
    const mainEl = mainScrollRef.current;
    const allPages = pagesRef.current;
    if (!mainEl || allPages.length === 0) return;

    const mRect = mainEl.getBoundingClientRect();
    const midY = mRect.top + mRect.height * 0.45;

    // O(log N) binary search over vertically ordered page slots
    let lo = 0;
    let hi = allPages.length - 1;
    let bestIdx = 0;
    let bestDist = Infinity;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = pageRefsMapRef.current.get(allPages[mid].id);
      if (!el) {
        // Fallback linear check if ref missing mid-mount
        lo++;
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.top <= midY && r.bottom >= midY) {
        bestIdx = mid;
        bestDist = 0;
        break;
      }
      const center = (r.top + r.bottom) / 2;
      const dist = Math.abs(center - midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = mid;
      }
      if (r.bottom < midY) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    setScrollPageNumber((prev) => (prev === bestIdx + 1 ? prev : bestIdx + 1));
  }, []);

  const updateScrollPageIndicator = useCallback(() => {
    if (scrollPageRafRef.current !== null) return;
    scrollPageRafRef.current = requestAnimationFrame(() => {
      scrollPageRafRef.current = null;
      computeScrollPageIndicatorNow();
    });
  }, [computeScrollPageIndicatorNow]);

  useEffect(() => {
    return () => {
      if (scrollPageRafRef.current !== null) {
        cancelAnimationFrame(scrollPageRafRef.current);
        scrollPageRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const idx = pages.findIndex((p) => p.id === currentPageId);
    if (idx !== -1) {
      setScrollPageNumber(idx + 1);
    }
  }, [pages, currentPageId]);

  const registerPageElement = useCallback((pageId: string, el: HTMLDivElement | null) => {
    const prevEl = pageRefsMapRef.current.get(pageId);
    if (prevEl && prevEl !== el && intersectionObserverRef.current) {
      intersectionObserverRef.current.unobserve(prevEl);
    }
    if (el) {
      pageRefsMapRef.current.set(pageId, el);
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.observe(el);
      }
    } else {
      pageRefsMapRef.current.delete(pageId);
      pageRatiosRef.current.delete(pageId);
    }
  }, []);

  const scrollToPage = useCallback((targetPageId: string, instant = false) => {
    manualScrollLockRef.current = true;
    if (manualScrollLockTimerRef.current !== null) {
      window.clearTimeout(manualScrollLockTimerRef.current);
    }
    manualScrollLockTimerRef.current = window.setTimeout(() => {
      manualScrollLockRef.current = false;
      manualScrollLockTimerRef.current = null;
    }, 650);

    setVisiblePageIds((prev) => {
      if (prev.has(targetPageId)) return prev;
      const next = new Set(prev);
      next.add(targetPageId);
      return next;
    });

    requestAnimationFrame(() => {
      const el = pageRefsMapRef.current.get(targetPageId);
      if (el) {
        el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'center' });
      }
    });
  }, []);

  // History Stack for Undo / Redo
  interface HistoryState {
    strokes: CanvasStroke[];
    shapes: GeometricShape[];
    graphs: DesmosBox[];
    calculators: CalculatorBox[];
    images: CanvasImage[];
    dictatedTextBoxes?: DictatedTextBox[];
  }
  const [historyStack, setHistoryStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  // Detect screens on mount
  useEffect(() => {
    detectConnectedScreens().then(({ screens, hasPermission }) => {
      setPresenterSettings((prev) => ({
        ...prev,
        availableScreens: screens,
        hasScreenPermission: hasPermission,
      }));
    });
  }, []);

  const handleRequestScreenPermission = async () => {
    const { screens, hasPermission } = await detectConnectedScreens();
    setPresenterSettings((prev) => ({
      ...prev,
      availableScreens: screens,
      hasScreenPermission: hasPermission,
    }));
  };

  // Check if current tab is the Canva-style dedicated audience viewer tab
  const isViewerTab =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'viewer';

  // Interactive first-launch tutorial & persistent top-right Creator Info hub
  const [tutorialStage, setTutorialStage] = useState<TutorialStage>(() =>
    !isViewerTab && !hasCompletedTutorialCookie() ? 'welcome' : 'idle'
  );
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number>(0);
  const [isCreatorInfoOpen, setIsCreatorInfoOpen] = useState<boolean>(false);
  const [creatorInfoJustLanded, setCreatorInfoJustLanded] = useState<boolean>(false);
  const [isModeBarCollapsed, setIsModeBarCollapsed] = useState<boolean>(false);
  const preTutorialRestoreRef = useRef<{
    mode: AppMode;
    shapeType: ShapeType;
    isGeometricEraserActive: boolean;
    isDictateEraserActive: boolean;
    isModeBarCollapsed: boolean;
  } | null>(null);

  const applyTutorialStepMode = useCallback(
    (idx: number) => {
      const step = TUTORIAL_STEPS[idx];
      if (!step) return;
      if (step.id === 'mode-bar-collapse') {
        setIsModeBarCollapsed(false);
      }
      if (step.switchMode) {
        setIsGeometricEraserActive(false);
        setIsDictateEraserActive(false);
        syncColorForMode(step.switchMode);
        setMode(step.switchMode);
      }
      if (step.shapeType) {
        setShapeType(step.shapeType);
      }
    },
    [syncColorForMode]
  );

  const restorePreTutorialState = useCallback(() => {
    const saved = preTutorialRestoreRef.current;
    if (saved) {
      syncColorForMode(saved.mode);
      setMode(saved.mode);
      setShapeType(saved.shapeType);
      setIsGeometricEraserActive(saved.isGeometricEraserActive);
      setIsDictateEraserActive(saved.isDictateEraserActive);
      setIsModeBarCollapsed(saved.isModeBarCollapsed);
      preTutorialRestoreRef.current = null;
    }
  }, [syncColorForMode]);

  const handleStartTutorial = useCallback(() => {
    preTutorialRestoreRef.current = {
      mode,
      shapeType,
      isGeometricEraserActive,
      isDictateEraserActive,
      isModeBarCollapsed,
    };
    setIsModeBarCollapsed(false);
    setTutorialStepIndex(0);
    setTutorialStage('tour');
    applyTutorialStepMode(0);
  }, [
    mode,
    shapeType,
    isGeometricEraserActive,
    isDictateEraserActive,
    isModeBarCollapsed,
    applyTutorialStepMode,
  ]);

  const handleLaterTutorial = useCallback(() => {
    setTutorialStage('idle');
  }, []);

  const handleChangeTutorialStep = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, nextIdx));
      setTutorialStepIndex(clamped);
      applyTutorialStepMode(clamped);
    },
    [applyTutorialStepMode]
  );

  const handleSkipTutorial = useCallback(() => {
    setTutorialStage('idle');
    restorePreTutorialState();
  }, [restorePreTutorialState]);

  const handleCompleteTutorialWithAnimation = useCallback(() => {
    setCompletedTutorialCookie();
    restorePreTutorialState();
    setTutorialStage('animating');
  }, [restorePreTutorialState]);

  const handleTutorialAnimationEnd = useCallback(() => {
    setTutorialStage('idle');
    setCreatorInfoJustLanded(true);
    window.setTimeout(() => setCreatorInfoJustLanded(false), 950);
  }, []);

  useEffect(() => {
    const mainEl = mainScrollRef.current;
    if (!mainEl) return;
    const syncSize = () => {
      if (mainEl.clientWidth > 0 && mainEl.clientHeight > 0) {
        setMainViewportSize((prev) =>
          prev.width === mainEl.clientWidth && prev.height === mainEl.clientHeight
            ? prev
            : { width: mainEl.clientWidth, height: mainEl.clientHeight }
        );
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(mainEl);
    window.addEventListener('resize', syncSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncSize);
    };
  }, [isViewerTab]);

  useEffect(() => {
    if (!isBottomAddPageOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (bottomAddPageRef.current && !bottomAddPageRef.current.contains(e.target as Node)) {
        setIsBottomAddPageOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside, { capture: true });
    return () => window.removeEventListener('pointerdown', handleOutside, { capture: true });
  }, [isBottomAddPageOpen]);

  // Allow two-finger pinch outside PDF/page boxes to zoom the entire workspace POV
  useEffect(() => {
    const mainEl = mainScrollRef.current;
    if (!mainEl || isViewerTab) return;

    const filterAllowedTouches = (touches: TouchList): Touch[] => {
      const list = Array.from(touches).filter(
        (t) => (t as Touch & { touchType?: string }).touchType !== 'stylus'
      );
      if (touchInputMode === 'two_finger_stylus') {
        if (stylusConfig.detectionMode === 'smart_tip') {
          const maxTip = stylusConfig.maxTipSizePx ?? 14;
          return list.filter((t) => {
            const rx = t.radiusX || 0;
            const ry = t.radiusY || 0;
            const maxR = Math.max(rx, ry);
            // Ignore placeholder <= 1.5px radii when identifying fingers vs passive tip
            return !(maxR > 1.5 && maxR * 2 <= maxTip);
          });
        }
      }
      return list;
    };

    const handleMainTouchStart = (e: TouchEvent) => {
      if (touchInputMode !== 'two_finger' && touchInputMode !== 'two_finger_stylus') {
        return;
      }
      const fingerTouches = filterAllowedTouches(e.touches);
      if (fingerTouches.length < 2) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('[data-page-id]')) return;
      e.preventDefault();
      const d = Math.hypot(
        fingerTouches[0].clientX - fingerTouches[1].clientX,
        fingerTouches[0].clientY - fingerTouches[1].clientY
      );
      povPinchRef.current = { initialDist: Math.max(1, d), initialZoom: povZoomFactor };
    };

    const handleMainTouchMove = (e: TouchEvent) => {
      if (touchInputMode !== 'two_finger' && touchInputMode !== 'two_finger_stylus') {
        povPinchRef.current = null;
        return;
      }
      const fingerTouches = filterAllowedTouches(e.touches);
      if (!povPinchRef.current || fingerTouches.length < 2) return;
      e.preventDefault();
      const d = Math.hypot(
        fingerTouches[0].clientX - fingerTouches[1].clientX,
        fingerTouches[0].clientY - fingerTouches[1].clientY
      );
      const nextFactor = Math.max(
        0.75,
        Math.min(2.5, povPinchRef.current.initialZoom * (d / povPinchRef.current.initialDist))
      );
      setPovZoomFactor(nextFactor);
    };

    const handleMainTouchEnd = (e: TouchEvent) => {
      const fingerTouches = filterAllowedTouches(e.touches);
      if (fingerTouches.length < 2) {
        povPinchRef.current = null;
      }
    };

    mainEl.addEventListener('touchstart', handleMainTouchStart, { passive: false });
    mainEl.addEventListener('touchmove', handleMainTouchMove, { passive: false });
    mainEl.addEventListener('touchend', handleMainTouchEnd);
    mainEl.addEventListener('touchcancel', handleMainTouchEnd);
    return () => {
      mainEl.removeEventListener('touchstart', handleMainTouchStart);
      mainEl.removeEventListener('touchmove', handleMainTouchMove);
      mainEl.removeEventListener('touchend', handleMainTouchEnd);
      mainEl.removeEventListener('touchcancel', handleMainTouchEnd);
    };
  }, [isViewerTab, povZoomFactor, touchInputMode, stylusConfig]);

  // Live Teacher Document Frame & Camera Viewport Sync for Audience View
  const [teacherViewportSize, setTeacherViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const teacherViewportSizeRef = useRef(teacherViewportSize);
  teacherViewportSizeRef.current = teacherViewportSize;

  const mainViewportSizeRef = useRef(mainViewportSize);
  mainViewportSizeRef.current = mainViewportSize;
  const isFullPovModeRef = useRef(isFullPovMode);
  isFullPovModeRef.current = isFullPovMode;
  const povZoomFactorRef = useRef(povZoomFactor);
  povZoomFactorRef.current = povZoomFactor;

  const [cameraView, setCameraView] = useState<CameraViewportState>({
    zoomScale: 1,
    panOffset: { x: 0, y: 0 },
    viewportWidth: 0,
    viewportHeight: 0,
    isFullPovMode: false,
    povZoomFactor: 1,
    povScale: 1,
    povScrollYFraction: 0.5,
  });
  const cameraViewRef = useRef(cameraView);
  cameraViewRef.current = cameraView;

  const [viewerWindowSize, setViewerWindowSize] = useState<{ width: number; height: number }>(() =>
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1280, height: 720 }
  );

  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const backupCameraTimerRef = useRef<number | null>(null);
  const idbSaveTimerRef = useRef<number | null>(null);
  const lastBroadcastAssetsSigRef = useRef<string>('');
  const hasReceivedLiveSyncRef = useRef<boolean>(false);

  const [syncedControlsVisibility, setSyncedControlsVisibility] =
    useState<ControlsVisibility>('presenter_only');
  const [liveOverlay, setLiveOverlay] = useState<LiveCanvasOverlay | null>(null);
  const [presenterToolState, setPresenterToolState] =
    useState<LivePresenterToolState | null>(null);
  const teacherLiveOverlayRef = useRef<LiveCanvasOverlay | null>(null);
  const teacherPresenterToolRef = useRef<LivePresenterToolState | null>(null);

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const preEraseBackupRef = useRef<{
    strokes: CanvasStroke[];
    shapes: GeometricShape[];
  } | null>(null);

  const latestSyncStateRef = useRef<{
    pages: PageData[];
    currentPageId: string;
    strokes: CanvasStroke[];
    shapes: GeometricShape[];
    graphs: DesmosBox[];
    calculators: CalculatorBox[];
    images: CanvasImage[];
    dictatedTextBoxes: DictatedTextBox[];
    presenterMode: PresenterMode;
    controlsVisibility: ControlsVisibility;
    isDarkMode: boolean;
    cameraView: CameraViewportState;
  }>({
    pages,
    currentPageId,
    strokes,
    shapes,
    graphs,
    calculators,
    images,
    dictatedTextBoxes,
    presenterMode,
    controlsVisibility: presenterSettings.controlsVisibility,
    isDarkMode,
    cameraView,
  });
  latestSyncStateRef.current = {
    pages,
    currentPageId,
    strokes,
    shapes,
    graphs,
    calculators,
    images,
    dictatedTextBoxes,
    presenterMode,
    controlsVisibility: presenterSettings.controlsVisibility,
    isDarkMode,
    cameraView,
  };

  // Observe page slot visibility inside <main> with zero rootMargin so only viewport-intersecting pages mount
  useEffect(() => {
    if (isViewerTab) return;
    const rootEl = mainScrollRef.current;
    if (!rootEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset.pageId;
          if (!id) return;
          pageRatiosRef.current.set(
            id,
            entry.isIntersecting ? Math.max(0.001, entry.intersectionRatio) : 0
          );
        });

        const nextVisible = new Set<string>();
        let bestId: string | null = null;
        let bestRatio = 0;

        pageRatiosRef.current.forEach((ratio, id) => {
          if (ratio > 0) {
            nextVisible.add(id);
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = id;
            }
          }
        });

        setVisiblePageIds((prev) => {
          if (prev.size === nextVisible.size && Array.from(nextVisible).every((id) => prev.has(id))) {
            return prev;
          }
          return nextVisible;
        });

        if (!manualScrollLockRef.current && bestId) {
          const curId = currentPageIdRef.current;
          const curRatio = pageRatiosRef.current.get(curId) || 0;
          if (bestId !== curId && (curRatio === 0 || (bestRatio > 0.35 && bestRatio > curRatio + 0.15))) {
            setCurrentPageId(bestId);
          }
        }
      },
      {
        root: rootEl,
        rootMargin: '0px',
        threshold: [0, 0.05, 0.25, 0.5, 0.75],
      }
    );

    intersectionObserverRef.current = observer;
    pageRefsMapRef.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (intersectionObserverRef.current === observer) {
        intersectionObserverRef.current = null;
      }
      if (manualScrollLockTimerRef.current !== null) {
        window.clearTimeout(manualScrollLockTimerRef.current);
        manualScrollLockTimerRef.current = null;
      }
    };
  }, [isViewerTab]);

  // Keep visiblePageIds & ratio map consistent when pages are added/deleted
  useEffect(() => {
    if (isViewerTab) return;
    const validIds = new Set(pages.map((p) => p.id));
    for (const key of Array.from(pageRatiosRef.current.keys())) {
      if (!validIds.has(key)) pageRatiosRef.current.delete(key);
    }
    setVisiblePageIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      if (next.size === 0 && currentPageId && validIds.has(currentPageId)) {
        next.add(currentPageId);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [pages, currentPageId, isViewerTab]);

  // Helper to compute exact Teacher camera + Full POV + vertical scroll fraction payload
  const buildCameraSyncPayload = useCallback(
    (zoomScale: number, panOffset: { x: number; y: number }): CameraViewportState => {
      const allPages = pagesRef.current;
      const curId = currentPageIdRef.current;
      const page = allPages.find((p) => p.id === curId) || allPages[0];
      const aspect =
        page?.aspectRatio && page.aspectRatio > 0
          ? page.aspectRatio
          : page?.pdfWidth && page?.pdfHeight && page.pdfHeight > 0
          ? page.pdfWidth / page.pdfHeight
          : 8.5 / 11;

      const mv = mainViewportSizeRef.current;
      const mainW = Math.max(320, mv.width);
      const mainH = Math.max(320, mv.height);
      const regularHorizPad = mainW >= 640 ? 112 : 88;
      const availRegularW = Math.max(240, mainW - regularHorizPad);
      const availRegularH = Math.max(320, mainH - 48);
      const regularWidthPx = Math.max(220, Math.min(availRegularW, availRegularH * aspect));
      const fullWidthPx = Math.max(regularWidthPx, mainW);
      const fullPov = isFullPovModeRef.current;
      const zoomFac = povZoomFactorRef.current;
      const baseScale = fullPov ? fullWidthPx / regularWidthPx : 1;
      const maxRegularFactor = fullWidthPx / regularWidthPx;
      const clampedFactor = fullPov ? zoomFac : Math.min(maxRegularFactor, Math.max(0.75, zoomFac));
      const povScale = baseScale * clampedFactor;

      const el = pageRefsMapRef.current.get(curId) || document.getElementById('document-sheet');
      const vw =
        el?.clientWidth ||
        Math.round(regularWidthPx * povScale) ||
        teacherViewportSizeRef.current.width ||
        0;
      const vh =
        el?.clientHeight ||
        Math.round((regularWidthPx / aspect) * povScale) ||
        teacherViewportSizeRef.current.height ||
        0;

      let povScrollYFraction = 0.5;
      const mainEl = mainScrollRef.current;
      if (el && mainEl) {
        const elRect = el.getBoundingClientRect();
        const mRect = mainEl.getBoundingClientRect();
        const overflowY = elRect.height - mRect.height;
        if (overflowY > 1) {
          const offsetY = Math.max(0, Math.min(overflowY, mRect.top - elRect.top));
          povScrollYFraction = offsetY / overflowY;
        }
      }

      return {
        zoomScale,
        panOffset,
        viewportWidth: vw,
        viewportHeight: vh,
        isFullPovMode: fullPov,
        povZoomFactor: clampedFactor,
        povScale,
        stageWidth: regularWidthPx,
        stageHeight: regularWidthPx / aspect,
        povScrollYFraction,
      };
    },
    []
  );

  const syncCameraNow = useCallback(
    (overrideZoom?: number, overridePan?: { x: number; y: number }) => {
      if (isViewerTab) return;
      const prev = cameraViewRef.current;
      const nextCamera = buildCameraSyncPayload(
        overrideZoom ?? prev.zoomScale,
        overridePan ?? prev.panOffset
      );

      const unchanged =
        Math.abs(prev.zoomScale - nextCamera.zoomScale) < 0.0001 &&
        Math.abs(prev.panOffset.x - nextCamera.panOffset.x) < 0.01 &&
        Math.abs(prev.panOffset.y - nextCamera.panOffset.y) < 0.01 &&
        prev.viewportWidth === nextCamera.viewportWidth &&
        prev.viewportHeight === nextCamera.viewportHeight &&
        Boolean(prev.isFullPovMode) === Boolean(nextCamera.isFullPovMode) &&
        Math.abs((prev.povZoomFactor ?? 1) - (nextCamera.povZoomFactor ?? 1)) < 0.0005 &&
        Math.abs((prev.povScale ?? 1) - (nextCamera.povScale ?? 1)) < 0.0005 &&
        Math.abs((prev.stageWidth ?? 0) - (nextCamera.stageWidth ?? 0)) < 0.5 &&
        Math.abs((prev.stageHeight ?? 0) - (nextCamera.stageHeight ?? 0)) < 0.5 &&
        Math.abs((prev.povScrollYFraction ?? 0.5) - (nextCamera.povScrollYFraction ?? 0.5)) < 0.002;

      if (unchanged) return;

      cameraViewRef.current = nextCamera;
      setCameraView(nextCamera);
      postSyncMessageSafe(syncChannelRef.current, { type: 'sync_camera', payload: nextCamera });

      if (backupCameraTimerRef.current) {
        window.clearTimeout(backupCameraTimerRef.current);
      }
      backupCameraTimerRef.current = window.setTimeout(() => {
        backupCameraTimerRef.current = null;
        const cur = latestSyncStateRef.current;
        const hydratedPages = cur.pages.map((p) => {
          if (p.id !== cur.currentPageId || p.template !== 'pdf') return p;
          const cached = getCachedFullPdfPageUrl(p);
          return cached && p.pdfDataUrl !== cached ? { ...p, pdfDataUrl: cached } : p;
        });
        const snap: LivestreamDocumentState = {
          ...cur,
          pages: hydratedPages,
          graphs: syncLiveDesmosBoxes(cur.graphs),
          cameraView: nextCamera,
          updatedAt: Date.now(),
        };
        void saveLivestreamSnapshotToDb(snap);
        saveSmallLocalStorageBackup(snap);
      }, 180);
    },
    [isViewerTab, buildCameraSyncPayload]
  );

  // Track exact pixel dimensions & POV state of Teacher's active page sheet container
  const isCurrentPageVisible = visiblePageIds.has(currentPageId);
  useEffect(() => {
    if (isViewerTab) return;
    const el = pageRefsMapRef.current.get(currentPageId) || document.getElementById('document-sheet');
    if (!el) return;

    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setTeacherViewportSize((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
      }
      syncCameraNow();
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [isViewerTab, currentPageId, isCurrentPageVisible, pages, isFullPovMode, povZoomFactor, mainViewportSize, syncCameraNow]);

  // Track Audience Viewer tab window resize / fullscreen changes
  useEffect(() => {
    if (!isViewerTab) return;
    const handleResize = () => {
      setViewerWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleResize);
    };
  }, [isViewerTab]);

  // Real-time synchronization via BroadcastChannel & IndexedDB Snapshot Store
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      syncChannelRef.current = channel;
    } catch {
      // BroadcastChannel unavailable
    }

    if (isViewerTab) {
      let retryTimer1: number | null = null;
      let retryTimer2: number | null = null;

      const applyIncomingState = (p: LivestreamDocumentState) => {
        const { mergedPages, mergedImages, missingAssets } = mergeIncomingLivestreamState(
          p,
          pagesRef.current,
          imagesRef.current
        );
        pagesRef.current = mergedPages;
        imagesRef.current = mergedImages;
        setPages(mergedPages);
        if (p.currentPageId) setCurrentPageId(p.currentPageId);
        if (p.strokes) setStrokes(p.strokes);
        if (p.shapes) setShapes(p.shapes);
        if (p.graphs) setGraphs(p.graphs);
        if (p.calculators) setCalculators(p.calculators);
        if (p.dictatedTextBoxes) setDictatedTextBoxes(p.dictatedTextBoxes);
        setImages(mergedImages);
        if (p.presenterMode !== undefined) {
          setPresenterMode(
            p.presenterMode === 'laser' || p.presenterMode === 'spotlight'
              ? p.presenterMode
              : 'none'
          );
        }
        if (p.controlsVisibility) setSyncedControlsVisibility(p.controlsVisibility);
        if (typeof p.isDarkMode === 'boolean') setIsDarkMode(p.isDarkMode);
        if (p.cameraView) setCameraView(p.cameraView);

        if (missingAssets) {
          postSyncMessageSafe(channel, { type: 'request_state', includeAssets: true });
        }
      };

      // Request full initial state from Teacher tab immediately (+ retries if teacher tab busy)
      postSyncMessageSafe(channel, { type: 'request_state', includeAssets: true });
      retryTimer1 = window.setTimeout(() => {
        if (!hasReceivedLiveSyncRef.current) {
          postSyncMessageSafe(channel, { type: 'request_state', includeAssets: true });
        }
      }, 250);
      retryTimer2 = window.setTimeout(() => {
        if (!hasReceivedLiveSyncRef.current) {
          postSyncMessageSafe(channel, { type: 'request_state', includeAssets: true });
        }
      }, 900);

      // Hydrate immediately from IndexedDB snapshot store (supports full multi-page PDFs)
      loadLivestreamSnapshotFromDb().then((saved) => {
        if (saved && !hasReceivedLiveSyncRef.current) {
          applyIncomingState(saved);
        }
      });

      const handleMessage = (e: MessageEvent<LivestreamMessage>) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === 'sync_state' && msg.payload) {
          hasReceivedLiveSyncRef.current = true;
          applyIncomingState(msg.payload);
        } else if (msg.type === 'sync_camera' && msg.payload) {
          setCameraView(msg.payload);
        } else if (msg.type === 'sync_live_overlay') {
          setLiveOverlay(msg.payload || null);
        } else if (msg.type === 'sync_presenter_overlay') {
          setPresenterToolState(msg.payload || null);
        }
      };

      channel?.addEventListener('message', handleMessage);
      return () => {
        if (retryTimer1) window.clearTimeout(retryTimer1);
        if (retryTimer2) window.clearTimeout(retryTimer2);
        channel?.removeEventListener('message', handleMessage);
        channel?.close();
        syncChannelRef.current = null;
      };
    } else {
      const handleMessage = (e: MessageEvent<LivestreamMessage>) => {
        if (e.data?.type === 'request_state') {
          const cur = latestSyncStateRef.current;
          const hydratedPages = cur.pages.map((p) => {
            if (p.id !== cur.currentPageId || p.template !== 'pdf') return p;
            const cached = getCachedFullPdfPageUrl(p);
            return cached && p.pdfDataUrl !== cached ? { ...p, pdfDataUrl: cached } : p;
          });
          const fullPayload: LivestreamDocumentState = {
            ...cur,
            pages: hydratedPages,
            graphs: syncLiveDesmosBoxes(cur.graphs),
            updatedAt: Date.now(),
          };
          postSyncMessageSafe(channel, {
            type: 'sync_state',
            payload: e.data.includeAssets === false ? buildCompactSyncPayload(fullPayload) : fullPayload,
          });

          const activePage = hydratedPages.find((p) => p.id === cur.currentPageId);
          if (activePage?.template === 'pdf' && (!activePage.pdfDataUrl || activePage.pdfDataUrl === '__CACHED__')) {
            void resolvePdfPageDataUrl(activePage).then((resolvedUrl) => {
              if (!resolvedUrl) return;
              const latest = latestSyncStateRef.current;
              const nextPages = latest.pages.map((p) =>
                p.id === activePage.id ? { ...p, pdfDataUrl: resolvedUrl } : p
              );
              const hydratedSnap: LivestreamDocumentState = {
                ...latest,
                pages: nextPages,
                graphs: syncLiveDesmosBoxes(latest.graphs),
                updatedAt: Date.now(),
              };
              lastBroadcastAssetsSigRef.current = computeAssetsSignature(nextPages, latest.images);
              postSyncMessageSafe(channel, { type: 'sync_state', payload: hydratedSnap });
              void saveLivestreamSnapshotToDb(hydratedSnap);
            });
          }

          if (teacherLiveOverlayRef.current) {
            postSyncMessageSafe(channel, {
              type: 'sync_live_overlay',
              payload: teacherLiveOverlayRef.current,
            });
          }
          if (teacherPresenterToolRef.current) {
            postSyncMessageSafe(channel, {
              type: 'sync_presenter_overlay',
              payload: teacherPresenterToolRef.current,
            });
          }
        }
      };

      channel?.addEventListener('message', handleMessage);
      return () => {
        channel?.removeEventListener('message', handleMessage);
        channel?.close();
        syncChannelRef.current = null;
        if (backupCameraTimerRef.current) {
          window.clearTimeout(backupCameraTimerRef.current);
        }
        if (idbSaveTimerRef.current) {
          window.clearTimeout(idbSaveTimerRef.current);
        }
      };
    }
  }, [isViewerTab]);

  // Clear presenter tool overlay stream when exiting presenter tool mode
  useEffect(() => {
    if (isViewerTab) return;
    if (presenterMode === 'none') {
      teacherPresenterToolRef.current = null;
      postSyncMessageSafe(syncChannelRef.current, {
        type: 'sync_presenter_overlay',
        payload: null,
      });
    }
  }, [presenterMode, isViewerTab]);

  // Broadcast state updates from presenter tab to viewer tab, hydrating the active PDF page cleanly
  useEffect(() => {
    if (isViewerTab) return;
    let cancelled = false;

    const hydratedPages = pages.map((p) => {
      if (p.id !== currentPageId || p.template !== 'pdf') return p;
      const cached = getCachedFullPdfPageUrl(p);
      return cached && p.pdfDataUrl !== cached ? { ...p, pdfDataUrl: cached } : p;
    });

    const fullPayload: LivestreamDocumentState = {
      pages: hydratedPages,
      currentPageId,
      strokes,
      shapes,
      graphs: syncLiveDesmosBoxes(graphs),
      calculators,
      images,
      dictatedTextBoxes,
      presenterMode,
      controlsVisibility: presenterSettings.controlsVisibility,
      isDarkMode,
      cameraView: cameraViewRef.current,
      updatedAt: Date.now(),
    };

    const assetsSig = computeAssetsSignature(hydratedPages, images);
    const assetsChanged = assetsSig !== lastBroadcastAssetsSigRef.current;

    if (assetsChanged) {
      lastBroadcastAssetsSigRef.current = assetsSig;
      postSyncMessageSafe(syncChannelRef.current, {
        type: 'sync_state',
        payload: fullPayload,
      });
      void saveLivestreamSnapshotToDb(fullPayload);
      saveSmallLocalStorageBackup(fullPayload);
    } else {
      postSyncMessageSafe(syncChannelRef.current, {
        type: 'sync_state',
        payload: buildCompactSyncPayload(fullPayload),
      });
      if (idbSaveTimerRef.current) {
        window.clearTimeout(idbSaveTimerRef.current);
      }
      idbSaveTimerRef.current = window.setTimeout(() => {
        idbSaveTimerRef.current = null;
        const cur = latestSyncStateRef.current;
        const syncHydratedPages = cur.pages.map((p) => {
          if (p.id !== cur.currentPageId || p.template !== 'pdf') return p;
          const cached = getCachedFullPdfPageUrl(p);
          return cached && p.pdfDataUrl !== cached ? { ...p, pdfDataUrl: cached } : p;
        });
        const snap: LivestreamDocumentState = {
          ...cur,
          pages: syncHydratedPages,
          graphs: syncLiveDesmosBoxes(cur.graphs),
          updatedAt: Date.now(),
        };
        void saveLivestreamSnapshotToDb(snap);
        saveSmallLocalStorageBackup(snap);
      }, 300);
    }

    // If active page is an uncached PDF, debounce + hydrate with cancellation so fast scrolling never stalls
    const activePage = hydratedPages.find((p) => p.id === currentPageId);
    let hydrateTimer: number | null = null;
    const hydrateAbortCtrl = new AbortController();

    if (activePage?.template === 'pdf' && (!activePage.pdfDataUrl || activePage.pdfDataUrl === '__CACHED__')) {
      hydrateTimer = window.setTimeout(() => {
        hydrateTimer = null;
        if (cancelled || hydrateAbortCtrl.signal.aborted) return;
        void resolvePdfPageDataUrl(activePage, hydrateAbortCtrl.signal).then((resolvedUrl) => {
          if (cancelled || hydrateAbortCtrl.signal.aborted || !resolvedUrl) return;
          const cur = latestSyncStateRef.current;
          if (cur.currentPageId !== activePage.id) return;
          const nextPages = cur.pages.map((p) =>
            p.id === activePage.id ? { ...p, pdfDataUrl: resolvedUrl } : p
          );
          const nextSig = computeAssetsSignature(nextPages, cur.images);
          if (nextSig === lastBroadcastAssetsSigRef.current) return;
          lastBroadcastAssetsSigRef.current = nextSig;

          const hydratedSnap: LivestreamDocumentState = {
            ...cur,
            pages: nextPages,
            graphs: syncLiveDesmosBoxes(cur.graphs),
            updatedAt: Date.now(),
          };
          postSyncMessageSafe(syncChannelRef.current, { type: 'sync_state', payload: hydratedSnap });
          void saveLivestreamSnapshotToDb(hydratedSnap);
        });
      }, 240);
    }

    return () => {
      cancelled = true;
      if (hydrateTimer !== null) {
        window.clearTimeout(hydrateTimer);
      }
      hydrateAbortCtrl.abort();
    };
  }, [
    pages,
    currentPageId,
    strokes,
    shapes,
    graphs,
    calculators,
    images,
    dictatedTextBoxes,
    presenterMode,
    presenterSettings.controlsVisibility,
    isDarkMode,
    isViewerTab,
  ]);

  // Stream instant zoom & pan changes from Teacher CanvasStage to Audience View
  const handleViewportChange = useCallback(
    (zoomScale: number, panOffset: { x: number; y: number }) => {
      syncCameraNow(zoomScale, panOffset);
    },
    [syncCameraNow]
  );

  // Stream live in-progress ink/shapes/angles/marquee overlays to Audience View
  const handleLiveOverlayChange = useCallback((overlay: LiveCanvasOverlay | null) => {
    teacherLiveOverlayRef.current = overlay;
    postSyncMessageSafe(syncChannelRef.current, { type: 'sync_live_overlay', payload: overlay });
  }, []);

  // Stream live Laser / Spotlight / Ruler / Protractor coordinates to Audience View
  const handlePresenterStateChange = useCallback((state: LivePresenterToolState) => {
    teacherPresenterToolRef.current = state;
    postSyncMessageSafe(syncChannelRef.current, { type: 'sync_presenter_overlay', payload: state });
  }, []);

  const handleOpenAudienceTab = () => {
    const cur = latestSyncStateRef.current;
    const hydratedPages = cur.pages.map((p) => {
      if (p.id !== cur.currentPageId || p.template !== 'pdf') return p;
      const cached = getCachedFullPdfPageUrl(p);
      return cached && p.pdfDataUrl !== cached ? { ...p, pdfDataUrl: cached } : p;
    });
    const fullSnapshot: LivestreamDocumentState = {
      ...cur,
      pages: hydratedPages,
      graphs: syncLiveDesmosBoxes(cur.graphs),
      updatedAt: Date.now(),
    };
    void saveLivestreamSnapshotToDb(fullSnapshot);
    saveSmallLocalStorageBackup(fullSnapshot);
    postSyncMessageSafe(syncChannelRef.current, { type: 'sync_state', payload: fullSnapshot });

    const url = `${window.location.origin}${window.location.pathname}?view=viewer`;
    window.open(url, '_blank');

    const activePage = hydratedPages.find((p) => p.id === cur.currentPageId);
    if (activePage?.template === 'pdf' && (!activePage.pdfDataUrl || activePage.pdfDataUrl === '__CACHED__')) {
      void resolvePdfPageDataUrl(activePage).then((resolvedUrl) => {
        if (!resolvedUrl) return;
        const latest = latestSyncStateRef.current;
        const nextPages = latest.pages.map((p) =>
          p.id === activePage.id ? { ...p, pdfDataUrl: resolvedUrl } : p
        );
        const snap: LivestreamDocumentState = {
          ...latest,
          pages: nextPages,
          graphs: syncLiveDesmosBoxes(latest.graphs),
          updatedAt: Date.now(),
        };
        lastBroadcastAssetsSigRef.current = computeAssetsSignature(nextPages, latest.images);
        void saveLivestreamSnapshotToDb(snap);
        postSyncMessageSafe(syncChannelRef.current, { type: 'sync_state', payload: snap });
      });
    }
  };

  // Push snapshot to undo stack
  const saveSnapshot = useCallback(() => {
    setHistoryStack((prev) => [
      ...prev.slice(-25),
      {
        strokes: cloneDocData(strokes),
        shapes: cloneDocData(shapes),
        graphs: cloneDocData(graphs),
        calculators: cloneDocData(calculators),
        images: cloneDocData(images),
        dictatedTextBoxes: cloneDocData(dictatedTextBoxes),
      },
    ]);
    setRedoStack([]);
  }, [strokes, shapes, graphs, calculators, images, dictatedTextBoxes]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    preEraseBackupRef.current = null;
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      {
        strokes: cloneDocData(strokes),
        shapes: cloneDocData(shapes),
        graphs: cloneDocData(graphs),
        calculators: cloneDocData(calculators),
        images: cloneDocData(images),
        dictatedTextBoxes: cloneDocData(dictatedTextBoxes),
      },
    ]);
    setStrokes(previous.strokes);
    setShapes(previous.shapes);
    setGraphs(previous.graphs);
    setCalculators(previous.calculators);
    setImages(previous.images || []);
    setDictatedTextBoxes(previous.dictatedTextBoxes || []);
    setHistoryStack((prev) => prev.slice(0, -1));
    invalidateAllWidgetSnapshots();
  }, [historyStack, strokes, shapes, graphs, calculators, images, dictatedTextBoxes]);

  const handleRedo = useCallback(() => {
    preEraseBackupRef.current = null;
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistoryStack((prev) => [
      ...prev,
      {
        strokes: cloneDocData(strokes),
        shapes: cloneDocData(shapes),
        graphs: cloneDocData(graphs),
        calculators: cloneDocData(calculators),
        images: cloneDocData(images),
        dictatedTextBoxes: cloneDocData(dictatedTextBoxes),
      },
    ]);
    setStrokes(next.strokes);
    setShapes(next.shapes);
    setGraphs(next.graphs);
    setCalculators(next.calculators);
    setImages(next.images || []);
    setDictatedTextBoxes(next.dictatedTextBoxes || []);
    setRedoStack((prev) => prev.slice(0, -1));
    invalidateAllWidgetSnapshots();
  }, [redoStack, strokes, shapes, graphs, calculators, images, dictatedTextBoxes]);

  // =========================================================================
  // EDIT MODE CLIPBOARD & DELETE HANDLERS (Cut, Copy, Paste, Delete)
  // =========================================================================
  const hasSelection =
    selectedItems.strokeIds.length > 0 ||
    selectedItems.shapeIds.length > 0 ||
    selectedItems.graphIds.length > 0 ||
    selectedItems.calcIds.length > 0 ||
    selectedItems.imageIds.length > 0 ||
    selectedItems.dictateIds.length > 0;

  const handleCopy = useCallback(() => {
    if (!hasSelection) return;
    const strokesToCopy = strokes.filter((s) => selectedItems.strokeIds.includes(s.id));
    const shapesToCopy = shapes.filter((sh) => selectedItems.shapeIds.includes(sh.id));
    const graphsToCopy = graphs.filter((g) => selectedItems.graphIds.includes(g.id));
    const calcsToCopy = calculators.filter((c) => selectedItems.calcIds.includes(c.id));
    const imagesToCopy = images.filter((img) => selectedItems.imageIds.includes(img.id));
    const dictatedToCopy = dictatedTextBoxes.filter((b) =>
      selectedItems.dictateIds.includes(b.id)
    );

    setClipboard({
      strokes: JSON.parse(JSON.stringify(strokesToCopy)),
      shapes: JSON.parse(JSON.stringify(shapesToCopy)),
      graphs: JSON.parse(JSON.stringify(graphsToCopy)),
      calculators: JSON.parse(JSON.stringify(calcsToCopy)),
      images: JSON.parse(JSON.stringify(imagesToCopy)),
      dictatedTextBoxes: JSON.parse(JSON.stringify(dictatedToCopy)),
    });
  }, [hasSelection, selectedItems, strokes, shapes, graphs, calculators, images, dictatedTextBoxes]);

  const handleDeleteSelected = useCallback(() => {
    if (!hasSelection) return;
    saveSnapshot();
    setStrokes((prev) => prev.filter((s) => !selectedItems.strokeIds.includes(s.id)));
    setShapes((prev) => prev.filter((sh) => !selectedItems.shapeIds.includes(sh.id)));
    setGraphs((prev) => prev.filter((g) => !selectedItems.graphIds.includes(g.id)));
    setCalculators((prev) => prev.filter((c) => !selectedItems.calcIds.includes(c.id)));
    setImages((prev) => prev.filter((img) => !selectedItems.imageIds.includes(img.id)));
    if (selectedItems.dictateIds.length > 0) {
      if (activeDictateBoxId && selectedItems.dictateIds.includes(activeDictateBoxId)) {
        stopDictation();
        setActiveDictateBoxId(null);
      }
      if (selectedDictateBoxId && selectedItems.dictateIds.includes(selectedDictateBoxId)) {
        setSelectedDictateBoxId(null);
      }
      if (editingDictateBoxId && selectedItems.dictateIds.includes(editingDictateBoxId)) {
        setEditingDictateBoxId(null);
      }
      setDictatedTextBoxes((prev) =>
        prev.filter((b) => !selectedItems.dictateIds.includes(b.id))
      );
    }
    setSelectedItems({
      strokeIds: [],
      shapeIds: [],
      graphIds: [],
      calcIds: [],
      imageIds: [],
      dictateIds: [],
    });
    setActiveSelection(null);
  }, [hasSelection, selectedItems, saveSnapshot, activeDictateBoxId, selectedDictateBoxId, stopDictation]);

  const handleCut = useCallback(() => {
    if (!hasSelection) return;
    handleCopy();
    handleDeleteSelected();
  }, [hasSelection, handleCopy, handleDeleteSelected]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    saveSnapshot();

    // Check if user has an empty box selected as paste target
    const targetBox =
      activeSelection &&
      activeSelection.strokeIds.length === 0 &&
      activeSelection.shapeIds.length === 0 &&
      activeSelection.graphIds.length === 0 &&
      (activeSelection.calculatorIds || []).length === 0 &&
      (activeSelection.dictateIds || []).length === 0
        ? activeSelection.bounds
        : null;

    let offsetX = 24;
    let offsetY = 24;

    if (targetBox) {
      // Find source bounding box to compute centering translation
      let srcMinX = Infinity, srcMinY = Infinity;
      clipboard.strokes.forEach(s => s.points.forEach(p => {
        srcMinX = Math.min(srcMinX, p.x);
        srcMinY = Math.min(srcMinY, p.y);
      }));
      clipboard.shapes.forEach(sh => {
        if (sh.points && sh.points.length > 0) {
          sh.points.forEach(p => {
            srcMinX = Math.min(srcMinX, p.x);
            srcMinY = Math.min(srcMinY, p.y);
          });
        } else {
          srcMinX = Math.min(srcMinX, Math.min(sh.x, sh.x + sh.width));
          srcMinY = Math.min(srcMinY, Math.min(sh.y, sh.y + sh.height));
        }
      });
      clipboard.graphs.forEach(g => {
        srcMinX = Math.min(srcMinX, g.x);
        srcMinY = Math.min(srcMinY, g.y);
      });
      clipboard.calculators.forEach(c => {
        srcMinX = Math.min(srcMinX, c.x);
        srcMinY = Math.min(srcMinY, c.y);
      });
      (clipboard.images || []).forEach(img => {
        srcMinX = Math.min(srcMinX, img.x);
        srcMinY = Math.min(srcMinY, img.y);
      });
      (clipboard.dictatedTextBoxes || []).forEach(b => {
        srcMinX = Math.min(srcMinX, b.x);
        srcMinY = Math.min(srcMinY, b.y);
      });

      if (isFinite(srcMinX) && isFinite(srcMinY)) {
        offsetX = targetBox.minX - srcMinX;
        offsetY = targetBox.minY - srcMinY;
      }
    }

    const newStrokes = clipboard.strokes.map((s) => ({
      ...s,
      id: `stroke-paste-${Date.now()}-${Math.random()}`,
      pageId: currentPageId,
      points: s.points.map((p) => ({ ...p, x: p.x + offsetX, y: p.y + offsetY })),
    }));

    const newShapes = clipboard.shapes.map((sh) => ({
      ...sh,
      id: `shape-paste-${Date.now()}-${Math.random()}`,
      pageId: currentPageId,
      x: sh.x + offsetX,
      y: sh.y + offsetY,
      points: sh.points
        ? sh.points.map((p) => ({ ...p, x: p.x + offsetX, y: p.y + offsetY }))
        : undefined,
    }));

    const newGraphs = clipboard.graphs.map((g) => ({
      ...g,
      id: `graph-paste-${Date.now()}-${Math.random()}`,
      pageId: currentPageId,
      x: g.x + offsetX,
      y: g.y + offsetY,
    }));

    const newCalcs = clipboard.calculators.map((c) => ({
      ...c,
      id: `calc-paste-${Date.now()}-${Math.random()}`,
      pageId: currentPageId,
      x: c.x + offsetX,
      y: c.y + offsetY,
    }));

    const newImages = (clipboard.images || []).map((img) => ({
      ...img,
      id: `image-paste-${Date.now()}-${Math.random()}`,
      pageId: currentPageId,
      x: img.x + offsetX,
      y: img.y + offsetY,
    }));

    const newDictated = (clipboard.dictatedTextBoxes || []).map((b) => ({
      ...b,
      id: `dictate-paste-${Date.now()}-${Math.random()}`,
      pageId: currentPageId,
      x: b.x + offsetX,
      y: b.y + offsetY,
      interimText: '',
    }));

    setStrokes((prev) => [...prev, ...newStrokes]);
    setShapes((prev) => [...prev, ...newShapes]);
    setGraphs((prev) => [...prev, ...newGraphs]);
    setCalculators((prev) => [...prev, ...newCalcs]);
    setImages((prev) => [...prev, ...newImages]);
    setDictatedTextBoxes((prev) => [...prev, ...newDictated]);

    // Select the newly pasted elements instead of the original copied ones
    const newStrokeIds = newStrokes.map((s) => s.id);
    const newShapeIds = newShapes.map((sh) => sh.id);
    const newGraphIds = newGraphs.map((g) => g.id);
    const newCalcIds = newCalcs.map((c) => c.id);
    const newImageIds = newImages.map((img) => img.id);
    const newDictateIds = newDictated.map((b) => b.id);

    setSelectedItems({
      strokeIds: newStrokeIds,
      shapeIds: newShapeIds,
      graphIds: newGraphIds,
      calcIds: newCalcIds,
      imageIds: newImageIds,
      dictateIds: newDictateIds,
    });

    // Compute bounding box for the newly pasted elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    newStrokes.forEach((s) =>
      s.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      })
    );
    newShapes.forEach((sh) => {
      if (sh.points && sh.points.length > 0) {
        sh.points.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
      } else {
        minX = Math.min(minX, Math.min(sh.x, sh.x + sh.width));
        minY = Math.min(minY, Math.min(sh.y, sh.y + sh.height));
        maxX = Math.max(maxX, Math.max(sh.x, sh.x + sh.width));
        maxY = Math.max(maxY, Math.max(sh.y, sh.y + sh.height));
      }
    });
    newGraphs.forEach((g) => {
      minX = Math.min(minX, g.x);
      minY = Math.min(minY, g.y);
      maxX = Math.max(maxX, g.x + g.width);
      maxY = Math.max(maxY, g.y + g.height);
    });
    newCalcs.forEach((c) => {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + CALC_BASE_WIDTH * (c.scale || 1));
      maxY = Math.max(maxY, c.y + CALC_BASE_HEIGHT * (c.scale || 1));
    });
    newImages.forEach((img) => {
      minX = Math.min(minX, img.x);
      minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.width);
      maxY = Math.max(maxY, img.y + img.height);
    });
    newDictated.forEach((b) => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    });

    if (isFinite(minX) && isFinite(minY)) {
      setActiveSelection({
        strokeIds: newStrokeIds,
        shapeIds: newShapeIds,
        graphIds: newGraphIds,
        calculatorIds: newCalcIds,
        imageIds: newImageIds,
        dictateIds: newDictateIds,
        bounds: { minX, minY, maxX, maxY },
      });
    }
  }, [clipboard, currentPageId, saveSnapshot, activeSelection]);

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing or active inside an interactive tool or input, ignore global shortcuts
      const activeEl = document.activeElement as HTMLElement | null;
      const targetEl = e.target as HTMLElement | null;
      const isInsideInteractiveTool = Boolean(
        activeEl?.closest('.desmos-box, .calculator-box, .dcg-container, .dcg-calculator-api-container') ||
        targetEl?.closest('.desmos-box, .calculator-box, .dcg-container, .dcg-calculator-api-container') ||
        ['input', 'textarea'].includes(targetEl?.tagName?.toLowerCase() || '')
      );
      if (isInsideInteractiveTool) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        if (hasSelection) {
          e.preventDefault();
          handleCut();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (hasSelection) {
          e.preventDefault();
          handleCopy();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard) {
          e.preventDefault();
          handlePaste();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasSelection) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleCut, handleCopy, handlePaste, handleDeleteSelected, hasSelection, clipboard]);

  // Native window paste listener for pasting images directly from system clipboard onto canvas
  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
              const dataUrl = loadEvent.target?.result as string;
              if (dataUrl) {
                const img = new Image();
                img.onload = () => {
                  const maxW = 420;
                  const naturalW = img.naturalWidth || 360;
                  const naturalH = img.naturalHeight || 280;
                  const aspect = naturalW / naturalH;
                  const width = Math.min(maxW, naturalW);
                  const height = width / aspect;

                  const newImg: CanvasImage = {
                    id: `img-clip-${Date.now()}`,
                    pageId: currentPageId,
                    dataUrl,
                    x: 180,
                    y: 160,
                    width,
                    height,
                  };
                  saveSnapshot();
                  setImages((prev) => [...prev, newImg]);
                };
                img.src = dataUrl;
              }
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [currentPageId, saveSnapshot]);

  // Un-ghost / restore unconfirmed partial erases on mode or page switch so nothing is ever lost or translucent
  useEffect(() => {
    if (isViewerTab) return;
    if (preEraseBackupRef.current) {
      const backup = preEraseBackupRef.current;
      strokesRef.current = backup.strokes;
      shapesRef.current = backup.shapes;
      setStrokes(backup.strokes);
      setShapes(backup.shapes);
      preEraseBackupRef.current = null;
    } else {
      setStrokes((prev) =>
        prev.some((s) => s.isGhosted)
          ? prev.map((s) => (s.isGhosted ? { ...s, isGhosted: false } : s))
          : prev
      );
      setShapes((prev) =>
        prev.some((sh) => sh.isGhosted)
          ? prev.map((sh) => (sh.isGhosted ? { ...sh, isGhosted: false } : sh))
          : prev
      );
      setDictatedTextBoxes((prev) =>
        prev.some((b) => b.isGhosted)
          ? prev.map((b) => (b.isGhosted ? { ...b, isGhosted: false } : b))
          : prev
      );
    }
  }, [mode, currentPageId, isViewerTab]);

  // Theme
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // All colors currently in use on the document (for the 3-dot overflow view)
  const documentColors = harvestDocumentColors(strokes, shapes, recentColors);

  // Stop auto-filling colors into palette per user instruction
  const handleColorUsed = (hex: string) => {
    // Intentionally no-op to stop auto-filling colors
  };

  const handleAddStroke = (stroke: CanvasStroke) => {
    saveSnapshot();
    setStrokes((prev) => [...prev, stroke]);
  };

  const handleAddShape = (shape: GeometricShape) => {
    saveSnapshot();
    setShapes((prev) => [...prev, shape]);
  };

  const handleAddGraph = (graph: DesmosBox) => {
    saveSnapshot();
    setGraphs((prev) => [...prev, graph]);
  };

  const handleAddDesmosBoxAtCenter = () => {
    saveSnapshot();
    const newGraph: DesmosBox = {
      id: `graph-${Date.now()}`,
      pageId: currentPageId,
      x: 180,
      y: 160,
      width: 520,
      height: 360,
      baseWidth: 520,
      baseHeight: 360,
      opacity: graphOpacity,
      isFormulaOpen: false,
      isSettingsOpen: false,
      showResizeHandles: false,
      expressions: [{ id: '1', latex: 'y = \\sin(x)', color: '#2563eb' }],
      settings: {
        showXAxis: true,
        showYAxis: true,
        showGrid: true,
        degreeMode: true,
      },
    };
    setGraphs((prev) => [...prev, newGraph]);
  };

  const handleAddCalculator = (calc: CalculatorBox) => {
    saveSnapshot();
    setCalculators((prev) => [...prev, calc]);
  };

  const handleAddCalculatorAtCenter = () => {
    saveSnapshot();
    const newCalc: CalculatorBox = {
      id: `calc-${Date.now()}`,
      pageId: currentPageId,
      x: 200,
      y: 140,
      scale: 1,
      expression: '',
      result: '0',
      history: [],
      isRad: false,
      angleMode: 'DEG',
    };
    setCalculators((prev) => [...prev, newCalc]);
  };

  const handleUpdateGraph = (id: string, updated: Partial<DesmosBox>) => {
    setGraphs((prev) => prev.map((g) => (g.id === id ? { ...g, ...updated } : g)));
  };

  const handleDeleteGraph = (id: string) => {
    saveSnapshot();
    setGraphs((prev) => prev.filter((g) => g.id !== id));
  };

  const handleUpdateShape = (id: string, updated: Partial<GeometricShape>) => {
    setShapes((prev) => prev.map((sh) => (sh.id === id ? { ...sh, ...updated } : sh)));
  };

  const handleDeleteShape = (id: string) => {
    saveSnapshot();
    setShapes((prev) => prev.filter((sh) => sh.id !== id));
  };

  const handleUpdateCalculator = (id: string, updated: Partial<CalculatorBox>) => {
    setCalculators((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
  };

  const handleDeleteCalculator = (id: string) => {
    saveSnapshot();
    setCalculators((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSelectionChange = useCallback(
    (sel: {
      strokeIds: string[];
      shapeIds: string[];
      graphIds: string[];
      calcIds: string[];
      imageIds: string[];
      dictateIds?: string[];
    }) => {
      setSelectedItems((prev) => {
        const imageIds = sel.imageIds || [];
        const dictateIds = sel.dictateIds || [];
        if (
          prev.strokeIds.length === sel.strokeIds.length &&
          prev.shapeIds.length === sel.shapeIds.length &&
          prev.graphIds.length === sel.graphIds.length &&
          prev.calcIds.length === sel.calcIds.length &&
          prev.imageIds.length === imageIds.length &&
          prev.dictateIds.length === dictateIds.length &&
          prev.strokeIds.every((id, i) => id === sel.strokeIds[i]) &&
          prev.shapeIds.every((id, i) => id === sel.shapeIds[i]) &&
          prev.graphIds.every((id, i) => id === sel.graphIds[i]) &&
          prev.calcIds.every((id, i) => id === sel.calcIds[i]) &&
          prev.imageIds.every((id, i) => id === imageIds[i]) &&
          prev.dictateIds.every((id, i) => id === dictateIds[i])
        ) {
          return prev;
        }
        return {
          strokeIds: sel.strokeIds,
          shapeIds: sel.shapeIds,
          graphIds: sel.graphIds,
          calcIds: sel.calcIds,
          imageIds,
          dictateIds,
        };
      });
    },
    []
  );

  const handleGhostItems = (
    strokeIds: string[],
    shapeIds: string[],
    dictateIds: string[] = []
  ) => {
    setStrokes((prev) =>
      prev.map((s) => (strokeIds.includes(s.id) ? { ...s, isGhosted: true } : s))
    );
    setShapes((prev) =>
      prev.map((sh) => (shapeIds.includes(sh.id) ? { ...sh, isGhosted: true } : sh))
    );
    if (dictateIds.length > 0) {
      setDictatedTextBoxes((prev) =>
        prev.map((b) => (dictateIds.includes(b.id) ? { ...b, isGhosted: true } : b))
      );
    }
  };

  const handleCircleEraseSweep = useCallback(
    (
      pageId: string,
      from: { x: number; y: number } | null,
      to: { x: number; y: number },
      radius: number
    ): boolean => {
      const curStrokes = strokesRef.current;
      const curShapes = shapesRef.current;
      const result = sweepCircleErase(pageId, curStrokes, curShapes, from, to, radius);
      if (!result.didModify) return false;

      if (!preEraseBackupRef.current) {
        preEraseBackupRef.current = {
          strokes: JSON.parse(JSON.stringify(curStrokes)),
          shapes: JSON.parse(JSON.stringify(curShapes)),
        };
      }

      strokesRef.current = result.strokes;
      shapesRef.current = result.shapes;
      setStrokes(result.strokes);
      setShapes(result.shapes);
      return true;
    },
    []
  );

  const handleConfirmDeleteGhosted = (selected?: {
    strokeIds: string[];
    shapeIds: string[];
    dictateIds?: string[];
  }) => {
    const backup = preEraseBackupRef.current;
    if (backup) {
      setHistoryStack((prev) => [
        ...prev.slice(-25),
        {
          strokes: backup.strokes,
          shapes: backup.shapes,
          graphs: JSON.parse(JSON.stringify(graphs)),
          calculators: JSON.parse(JSON.stringify(calculators)),
          images: JSON.parse(JSON.stringify(images)),
          dictatedTextBoxes: JSON.parse(JSON.stringify(dictatedTextBoxes)),
        },
      ]);
      setRedoStack([]);
    } else {
      saveSnapshot();
    }
    preEraseBackupRef.current = null;

    if (selected) {
      const delDictateIds = selected.dictateIds || [];
      setStrokes((prev) =>
        prev
          .filter((s) => !selected.strokeIds.includes(s.id))
          .map((s) => ({ ...s, isGhosted: false }))
      );
      setShapes((prev) =>
        prev
          .filter((sh) => !selected.shapeIds.includes(sh.id))
          .map((sh) => ({ ...sh, isGhosted: false }))
      );
      if (delDictateIds.length > 0) {
        if (activeDictateBoxId && delDictateIds.includes(activeDictateBoxId)) {
          stopDictation();
          setActiveDictateBoxId(null);
        }
        if (selectedDictateBoxId && delDictateIds.includes(selectedDictateBoxId)) {
          setSelectedDictateBoxId(null);
        }
        if (editingDictateBoxId && delDictateIds.includes(editingDictateBoxId)) {
          setEditingDictateBoxId(null);
        }
      }
      setDictatedTextBoxes((prev) =>
        prev
          .filter((b) => !delDictateIds.includes(b.id))
          .map((b) => ({ ...b, isGhosted: false }))
      );
    } else {
      setStrokes((prev) => prev.filter((s) => !s.isGhosted));
      setShapes((prev) => prev.filter((sh) => !sh.isGhosted));
      setDictatedTextBoxes((prev) => {
        const ghostIds = prev.filter((b) => b.isGhosted).map((b) => b.id);
        if (ghostIds.length > 0) {
          if (activeDictateBoxId && ghostIds.includes(activeDictateBoxId)) {
            stopDictation();
            setActiveDictateBoxId(null);
          }
          if (selectedDictateBoxId && ghostIds.includes(selectedDictateBoxId)) {
            setSelectedDictateBoxId(null);
          }
          if (editingDictateBoxId && ghostIds.includes(editingDictateBoxId)) {
            setEditingDictateBoxId(null);
          }
        }
        return prev.filter((b) => !b.isGhosted);
      });
    }
  };

  const handleCancelGhosted = () => {
    if (preEraseBackupRef.current) {
      const backup = preEraseBackupRef.current;
      strokesRef.current = backup.strokes;
      shapesRef.current = backup.shapes;
      setStrokes(backup.strokes);
      setShapes(backup.shapes);
      preEraseBackupRef.current = null;
    } else {
      setStrokes((prev) => prev.map((s) => ({ ...s, isGhosted: false })));
      setShapes((prev) => prev.map((sh) => ({ ...sh, isGhosted: false })));
    }
    setDictatedTextBoxes((prev) =>
      prev.some((b) => b.isGhosted) ? prev.map((b) => ({ ...b, isGhosted: false })) : prev
    );
  };

  const handleClearCurrentPageElements = () => {
    saveSnapshot();
    stopDictation();
    setActiveDictateBoxId(null);
    setSelectedDictateBoxId(null);
    setEditingDictateBoxId(null);
    setStrokes((prev) => prev.filter((s) => s.pageId !== currentPageId));
    setShapes((prev) => prev.filter((sh) => sh.pageId !== currentPageId));
    setGraphs((prev) => prev.filter((g) => g.pageId !== currentPageId));
    setCalculators((prev) => prev.filter((c) => c.pageId !== currentPageId));
    setImages((prev) => prev.filter((img) => img.pageId !== currentPageId));
    setDictatedTextBoxes((prev) => prev.filter((b) => b.pageId !== currentPageId));
    setSelectedItems({
      strokeIds: [],
      shapeIds: [],
      graphIds: [],
      calcIds: [],
      imageIds: [],
      dictateIds: [],
    });
    setActiveSelection(null);
  };

  const handleClearAllElements = () => {
    saveSnapshot();
    stopDictation();
    setActiveDictateBoxId(null);
    setSelectedDictateBoxId(null);
    setEditingDictateBoxId(null);
    setStrokes([]);
    setShapes([]);
    setGraphs([]);
    setCalculators([]);
    setImages([]);
    setDictatedTextBoxes([]);
    setSelectedItems({
      strokeIds: [],
      shapeIds: [],
      graphIds: [],
      calcIds: [],
      imageIds: [],
      dictateIds: [],
    });
    setActiveSelection(null);
  };

  const handleDeleteCurrentPage = () => {
    saveSnapshot();
    if (pages.length <= 1) {
      handleClearCurrentPageElements();
      return;
    }
    const deletedId = currentPageId;
    const remainingPages = pages.filter((p) => p.id !== deletedId);
    setPages(remainingPages);
    handleClearCurrentPageElements();
    releasePagePdfResources(deletedId);
    clearCachedPagePreview(deletedId);
    setCurrentPageId(remainingPages[0].id);
    scrollToPage(remainingPages[0].id);
  };

  const handleTransformItems = (
    strokeIds: string[],
    shapeIds: string[],
    graphIds: string[],
    calcIds: string[],
    dx: number,
    dy: number,
    imageIds: string[] = [],
    dictateIds: string[] = []
  ) => {
    setStrokes((prev) =>
      prev.map((s) => {
        if (!strokeIds.includes(s.id)) return s;
        return {
          ...s,
          points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
        };
      })
    );

    setShapes((prev) =>
      prev.map((sh) => {
        if (!shapeIds.includes(sh.id)) return sh;
        return {
          ...sh,
          x: sh.x + dx,
          y: sh.y + dy,
          points: sh.points
            ? sh.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
            : undefined,
        };
      })
    );

    setGraphs((prev) =>
      prev.map((g) => {
        if (!graphIds.includes(g.id)) return g;
        return {
          ...g,
          x: g.x + dx,
          y: g.y + dy,
        };
      })
    );

    setCalculators((prev) =>
      prev.map((c) => {
        if (!calcIds.includes(c.id)) return c;
        return {
          ...c,
          x: c.x + dx,
          y: c.y + dy,
        };
      })
    );

    if (imageIds.length > 0) {
      setImages((prev) =>
        prev.map((img) => {
          if (!imageIds.includes(img.id)) return img;
          return {
            ...img,
            x: img.x + dx,
            y: img.y + dy,
          };
        })
      );
    }

    if (dictateIds.length > 0) {
      setDictatedTextBoxes((prev) =>
        prev.map((box) => {
          if (!dictateIds.includes(box.id)) return box;
          return {
            ...box,
            x: box.x + dx,
            y: box.y + dy,
          };
        })
      );
    }
  };

  const handleRotateItems = (
    strokeIds: string[],
    shapeIds: string[],
    graphIds: string[],
    calcIds: string[],
    deltaDeg: number,
    pivotX: number,
    pivotY: number,
    imageIds: string[] = [],
    dictateIds: string[] = []
  ) => {
    const rad = (deltaDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotPt = (px: number, py: number) => ({
      x: pivotX + (px - pivotX) * cos - (py - pivotY) * sin,
      y: pivotY + (px - pivotX) * sin + (py - pivotY) * cos,
    });
    const normDeg = (deg: number) => (((deg % 360) + 360) % 360);

    if (strokeIds.length > 0) {
      setStrokes((prev) =>
        prev.map((s) => {
          if (!strokeIds.includes(s.id)) return s;
          return {
            ...s,
            points: s.points.map((p) => {
              const rp = rotPt(p.x, p.y);
              return { ...p, x: rp.x, y: rp.y };
            }),
          };
        })
      );
    }

    if (shapeIds.length > 0) {
      setShapes((prev) =>
        prev.map((sh) => {
          if (!shapeIds.includes(sh.id)) return sh;
          if (sh.type === 'polyline' && sh.points && sh.points.length > 0) {
            const newPts = sh.points.map((p) => {
              const rp = rotPt(p.x, p.y);
              return { ...p, x: rp.x, y: rp.y };
            });
            return { ...sh, points: newPts };
          }
          if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') {
            const p1 = rotPt(sh.x, sh.y);
            const p2 = rotPt(sh.x + sh.width, sh.y + sh.height);
            return {
              ...sh,
              x: p1.x,
              y: p1.y,
              width: p2.x - p1.x,
              height: p2.y - p1.y,
            };
          }
          if (sh.type === 'arc') {
            const cx = sh.centerX ?? sh.x + sh.width / 2;
            const cy = sh.centerY ?? sh.y + sh.height / 2;
            const r = sh.radius ?? Math.min(sh.width, sh.height) / 2;
            const nc = rotPt(cx, cy);
            return {
              ...sh,
              centerX: nc.x,
              centerY: nc.y,
              x: nc.x - r,
              y: nc.y - r,
              startAngle: (sh.startAngle ?? 0) + rad,
              endAngle: (sh.endAngle ?? Math.PI / 2) + rad,
            };
          }
          const cx = sh.x + sh.width / 2;
          const cy = sh.y + sh.height / 2;
          const nc = rotPt(cx, cy);
          return {
            ...sh,
            x: nc.x - sh.width / 2,
            y: nc.y - sh.height / 2,
            rotation: normDeg((sh.rotation || 0) + deltaDeg),
          };
        })
      );
    }

    if (graphIds.length > 0) {
      setGraphs((prev) =>
        prev.map((g) => {
          if (!graphIds.includes(g.id)) return g;
          const nc = rotPt(g.x + g.width / 2, g.y + g.height / 2);
          return {
            ...g,
            x: nc.x - g.width / 2,
            y: nc.y - g.height / 2,
            rotation: normDeg((g.rotation || 0) + deltaDeg),
          };
        })
      );
    }

    if (calcIds.length > 0) {
      setCalculators((prev) =>
        prev.map((c) => {
          if (!calcIds.includes(c.id)) return c;
          const w = CALC_BASE_WIDTH * (c.scale || 1);
          const h = CALC_BASE_HEIGHT * (c.scale || 1);
          const nc = rotPt(c.x + w / 2, c.y + h / 2);
          return {
            ...c,
            x: nc.x - w / 2,
            y: nc.y - h / 2,
            rotation: normDeg((c.rotation || 0) + deltaDeg),
          };
        })
      );
    }

    if (imageIds.length > 0) {
      setImages((prev) =>
        prev.map((img) => {
          if (!imageIds.includes(img.id)) return img;
          const nc = rotPt(img.x + img.width / 2, img.y + img.height / 2);
          return {
            ...img,
            x: nc.x - img.width / 2,
            y: nc.y - img.height / 2,
            rotation: normDeg((img.rotation || 0) + deltaDeg),
          };
        })
      );
    }

    if (dictateIds.length > 0) {
      setDictatedTextBoxes((prev) =>
        prev.map((box) => {
          if (!dictateIds.includes(box.id)) return box;
          const nc = rotPt(box.x + box.width / 2, box.y + box.height / 2);
          return {
            ...box,
            x: nc.x - box.width / 2,
            y: nc.y - box.height / 2,
            rotation: normDeg((box.rotation || 0) + deltaDeg),
          };
        })
      );
    }
  };

  const handleAddImage = (image: CanvasImage) => {
    saveSnapshot();
    setImages((prev) => [...prev, image]);
  };

  const handleUpdateImage = (id: string, updated: Partial<CanvasImage>) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...updated } : img)));
  };

  const handleDeleteImage = (id: string) => {
    saveSnapshot();
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // =========================================================================
  // DICTATE TEXT BOX LIFECYCLE HANDLERS
  // =========================================================================
  const handleAddDictatedTextBox = useCallback(
    (box: DictatedTextBox) => {
      saveSnapshot();
      setEditingDictateBoxId(null);
      setDictatedTextBoxes((prev) => [...prev, box]);
      setSelectedDictateBoxId(null);
      setActiveDictateBoxId(box.id);
      void startDictation(box.id, box.text);
    },
    [saveSnapshot, startDictation]
  );

  const handleUpdateDictatedTextBox = useCallback(
    (id: string, updated: Partial<DictatedTextBox>) => {
      setDictatedTextBoxes((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...updated } : b))
      );
    },
    []
  );

  const handleDeleteDictatedTextBox = useCallback(
    (id: string) => {
      saveSnapshot();
      if (activeDictateBoxId === id) {
        stopDictation();
        setActiveDictateBoxId(null);
      }
      if (selectedDictateBoxId === id) {
        setSelectedDictateBoxId(null);
      }
      if (editingDictateBoxId === id) {
        setEditingDictateBoxId(null);
      }
      setDictatedTextBoxes((prev) => prev.filter((b) => b.id !== id));
    },
    [saveSnapshot, activeDictateBoxId, selectedDictateBoxId, editingDictateBoxId, stopDictation]
  );

  const handleSelectDictateBoxForTransform = useCallback(
    (id: string) => {
      if (editingDictateBoxIdRef.current && editingDictateBoxIdRef.current !== id) {
        setEditingDictateBoxId(null);
      }
      if (activeDictateBoxIdRef.current) {
        const prevId = activeDictateBoxIdRef.current;
        stopDictation();
        setDictatedTextBoxes((prev) =>
          prev.map((b) => (b.id === prevId ? { ...b, interimText: '' } : b))
        );
        setActiveDictateBoxId(null);
      }
      setSelectedDictateBoxId(id);
    },
    [stopDictation]
  );

  const handleStartManualEditDictateBox = useCallback(
    (id: string) => {
      const target = dictatedTextBoxesRef.current.find((b) => b.id === id);
      if (!target) return;
      saveSnapshot();
      if (activeDictateBoxIdRef.current) {
        const prevId = activeDictateBoxIdRef.current;
        stopDictation();
        setDictatedTextBoxes((prev) =>
          prev.map((b) => (b.id === prevId ? { ...b, interimText: '' } : b))
        );
        setActiveDictateBoxId(null);
      }
      syncBaseTextIfIdle(id, target.text);
      setSelectedDictateBoxId(id);
      setEditingDictateBoxId(id);
    },
    [saveSnapshot, stopDictation, syncBaseTextIfIdle]
  );

  const handleStopManualEditDictateBox = useCallback(() => {
    const curId = editingDictateBoxIdRef.current;
    if (curId) {
      const target = dictatedTextBoxesRef.current.find((b) => b.id === curId);
      if (target) {
        syncBaseTextIfIdle(curId, target.text);
      }
      setEditingDictateBoxId(null);
    }
  }, [syncBaseTextIfIdle]);

  const [editingGridDims, setEditingGridDims] = useState<{
    shapeId: string;
    field: 'cols' | 'rows';
    draft: string;
    replaceOnFirstKey: boolean;
  } | null>(null);
  const editingGridDimsRef = useRef(editingGridDims);
  editingGridDimsRef.current = editingGridDims;
  const gridEditSnapshotTakenRef = useRef<string | null>(null);

  const applyGridDimDraft = useCallback(
    (shapeId: string, field: 'cols' | 'rows', draft: string) => {
      const clean = draft.replace(/[^0-9]/g, '').slice(0, 3);
      const parsed = parseInt(clean, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        const clamped = Math.max(1, Math.min(100, parsed));
        if (gridEditSnapshotTakenRef.current !== shapeId) {
          saveSnapshot();
          gridEditSnapshotTakenRef.current = shapeId;
        }
        setShapes((prev) =>
          prev.map((sh) => {
            if (sh.id !== shapeId) return sh;
            const curCols = sh.gridCols || Math.max(2, Math.round(Math.abs(sh.width) / 28));
            const curRows = sh.gridRows || Math.max(2, Math.round(Math.abs(sh.height) / 28));
            return {
              ...sh,
              gridCols: field === 'cols' ? clamped : curCols,
              gridRows: field === 'rows' ? clamped : curRows,
            };
          })
        );
      }
    },
    [saveSnapshot]
  );

  const handleStartEditGridDims = useCallback((shapeId: string, field: 'cols' | 'rows') => {
    setEditingDictateBoxId(null);
    const targetShape = shapesRef.current.find((sh) => sh.id === shapeId);
    if (!targetShape) return;
    const cols =
      targetShape.gridCols || Math.max(2, Math.round(Math.abs(targetShape.width) / 28));
    const rows =
      targetShape.gridRows || Math.max(2, Math.round(Math.abs(targetShape.height) / 28));
    setEditingGridDims({
      shapeId,
      field,
      draft: String(field === 'cols' ? cols : rows),
      replaceOnFirstKey: true,
    });
  }, []);

  const handleChangeGridDimsDraft = useCallback(
    (shapeId: string, field: 'cols' | 'rows', draft: string) => {
      const clean = draft.replace(/[^0-9]/g, '').slice(0, 3);
      setEditingGridDims({
        shapeId,
        field,
        draft: clean,
        replaceOnFirstKey: false,
      });
      applyGridDimDraft(shapeId, field, clean);
    },
    [applyGridDimDraft]
  );

  const handleStopEditGridDims = useCallback(() => {
    gridEditSnapshotTakenRef.current = null;
    setEditingGridDims(null);
  }, []);

  const handleVirtualKeyAction = useCallback(
    (action: VirtualKeyAction) => {
      const gridEdit = editingGridDimsRef.current;
      if (gridEdit) {
        if (action.type === 'char') {
          if (/^[0-9]$/.test(action.value)) {
            const nextRaw = gridEdit.replaceOnFirstKey
              ? action.value
              : (gridEdit.draft + action.value).slice(0, 3);
            setEditingGridDims({
              shapeId: gridEdit.shapeId,
              field: gridEdit.field,
              draft: nextRaw,
              replaceOnFirstKey: false,
            });
            applyGridDimDraft(gridEdit.shapeId, gridEdit.field, nextRaw);
          }
          return;
        }
        if (action.type === 'backspace') {
          const nextRaw = gridEdit.replaceOnFirstKey ? '' : gridEdit.draft.slice(0, -1);
          setEditingGridDims({
            shapeId: gridEdit.shapeId,
            field: gridEdit.field,
            draft: nextRaw,
            replaceOnFirstKey: false,
          });
          applyGridDimDraft(gridEdit.shapeId, gridEdit.field, nextRaw);
          return;
        }
        if (action.type === 'move_cursor') {
          const nextField: 'cols' | 'rows' = action.delta > 0 ? 'rows' : 'cols';
          handleStartEditGridDims(gridEdit.shapeId, nextField);
          return;
        }
        if (action.type === 'enter') {
          if (gridEdit.field === 'cols') {
            handleStartEditGridDims(gridEdit.shapeId, 'rows');
          } else {
            handleStopEditGridDims();
          }
        }
        return;
      }

      const boxId = editingDictateBoxIdRef.current;
      if (!boxId) return;
      const target = dictatedTextBoxesRef.current.find((b) => b.id === boxId);
      if (!target) return;

      const ta = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-dictate-editor="${boxId}"]`
      );
      const curText = target.text || '';
      const selStart = ta && typeof ta.selectionStart === 'number' ? ta.selectionStart : curText.length;
      const selEnd = ta && typeof ta.selectionEnd === 'number' ? ta.selectionEnd : curText.length;

      let nextText = curText;
      let nextCaret = selStart;

      if (action.type === 'char') {
        nextText = curText.slice(0, selStart) + action.value + curText.slice(selEnd);
        nextCaret = selStart + action.value.length;
      } else if (action.type === 'space') {
        nextText = curText.slice(0, selStart) + ' ' + curText.slice(selEnd);
        nextCaret = selStart + 1;
      } else if (action.type === 'enter') {
        nextText = curText.slice(0, selStart) + '\n' + curText.slice(selEnd);
        nextCaret = selStart + 1;
      } else if (action.type === 'backspace') {
        if (selEnd > selStart) {
          nextText = curText.slice(0, selStart) + curText.slice(selEnd);
          nextCaret = selStart;
        } else if (selStart > 0) {
          nextText = curText.slice(0, selStart - 1) + curText.slice(selStart);
          nextCaret = selStart - 1;
        }
      } else if (action.type === 'move_cursor') {
        const clamped = Math.max(0, Math.min(curText.length, selStart + action.delta));
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLTextAreaElement>(
            `textarea[data-dictate-editor="${boxId}"]`
          );
          if (el) {
            el.focus();
            el.setSelectionRange(clamped, clamped);
          }
        });
        return;
      }

      setDictatedTextBoxes((prev) =>
        prev.map((b) => (b.id === boxId ? { ...b, text: nextText, interimText: '' } : b))
      );
      syncBaseTextIfIdle(boxId, nextText);

      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>(
          `textarea[data-dictate-editor="${boxId}"]`
        );
        if (el) {
          el.focus();
          el.setSelectionRange(nextCaret, nextCaret);
        }
      });
    },
    [applyGridDimDraft, handleStartEditGridDims, handleStopEditGridDims, syncBaseTextIfIdle]
  );

  // Support physical keyboard typing directly while grid dimensions keypad is open
  useEffect(() => {
    if (!editingGridDims) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleVirtualKeyAction({ type: 'char', value: e.key });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleVirtualKeyAction({ type: 'backspace' });
      } else if (e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleVirtualKeyAction({ type: 'move_cursor', delta: 1 });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleVirtualKeyAction({ type: 'move_cursor', delta: -1 });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleVirtualKeyAction({ type: 'enter' });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleStopEditGridDims();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingGridDims, handleVirtualKeyAction, handleStopEditGridDims]);

  const handleClickOutsideDictateBox = useCallback(() => {
    setEditingDictateBoxId(null);
    if (activeDictateBoxIdRef.current) {
      const curId = activeDictateBoxIdRef.current;
      stopDictation();
      setDictatedTextBoxes((prev) =>
        prev.map((b) => (b.id === curId ? { ...b, interimText: '' } : b))
      );
      setSelectedDictateBoxId(curId);
      setActiveDictateBoxId(null);
    }
  }, [stopDictation]);

  const handleResumeDictateBox = useCallback(
    (id: string) => {
      const target = dictatedTextBoxesRef.current.find((b) => b.id === id);
      if (!target) return;
      setEditingDictateBoxId(null);
      setSelectedDictateBoxId(null);
      setActiveDictateBoxId(id);
      void startDictation(id, target.text);
    },
    [startDictation]
  );

  const handleDeselectDictateBox = useCallback(() => {
    setEditingDictateBoxId(null);
    setSelectedDictateBoxId(null);
  }, []);

  const handleToggleBottomMic = useCallback(() => {
    if (isDictating) {
      // Stopping dictation leaves activeDictateBoxId & controls open so user can tap mic again to continue
      stopDictation();
      return;
    }
    const targetId = activeDictateBoxId || selectedDictateBoxId;
    if (!targetId) {
      void requestMicPermission();
      return;
    }
    const target = dictatedTextBoxesRef.current.find((b) => b.id === targetId);
    if (!target) return;
    setEditingDictateBoxId(null);
    setSelectedDictateBoxId(null);
    setActiveDictateBoxId(target.id);
    void startDictation(target.id, target.text);
  }, [isDictating, stopDictation, activeDictateBoxId, selectedDictateBoxId, startDictation, requestMicPermission]);

  const handleActivatePage = useCallback((pageId: string) => {
    setCurrentPageId((prev) => (prev === pageId ? prev : pageId));
  }, []);

  const handleClosePresenter = useCallback(() => {
    setPresenterMode('none');
  }, []);

  // Page Operations (freeze mounted Desmos/Calculator snapshots & smoothly scroll to selected page)
  const handleSelectPage = async (id: string) => {
    if (id === currentPageId) {
      scrollToPage(id);
      return;
    }
    await captureAllMountedWidgets();
    setCurrentPageId(id);
    scrollToPage(id);
  };

  const handleAddPage = async (template: PaperTemplate) => {
    await captureAllMountedWidgets();
    const newPage: PageData = {
      id: `page-${Date.now()}`,
      title: `Page ${pages.length + 1}`,
      template,
      aspectRatio: 8.5 / 11,
    };
    setPages((prev) => [...prev, newPage]);
    setCurrentPageId(newPage.id);
    scrollToPage(newPage.id);
  };

  const handleDeletePage = async (id: string) => {
    if (pages.length <= 1) return;
    if (currentPageId === id) {
      await captureAllMountedWidgets();
      const remaining = pages.filter((p) => p.id !== id);
      setPages(remaining);
      setCurrentPageId(remaining[0].id);
      scrollToPage(remaining[0].id);
    } else {
      setPages((prev) => prev.filter((p) => p.id !== id));
    }
    releasePagePdfResources(id);
    clearCachedPagePreview(id);
  };

  const handleDuplicatePage = async (id: string) => {
    const source = pages.find((p) => p.id === id);
    if (!source) return;
    await captureAllMountedWidgets();
    const newId = `page-${Date.now()}`;
    const newPage: PageData = {
      ...source,
      id: newId,
      title: `${source.title} (Copy)`,
    };

    const pageStrokesToCopy = strokes
      .filter((s) => s.pageId === id)
      .map((s) => ({ ...s, id: `stroke-${Date.now()}-${Math.random()}`, pageId: newId }));
    const pageShapesToCopy = shapes
      .filter((sh) => sh.pageId === id)
      .map((sh) => ({ ...sh, id: `shape-${Date.now()}-${Math.random()}`, pageId: newId }));
    const pageGraphsToCopy = graphs
      .filter((g) => g.pageId === id)
      .map((g) => ({
        ...g,
        id: `graph-${Date.now()}-${Math.random()}`,
        pageId: newId,
        desmosState: g.desmosState ? JSON.parse(JSON.stringify(g.desmosState)) : undefined,
      }));
    const pageCalcsToCopy = calculators
      .filter((c) => c.pageId === id)
      .map((c) => ({ ...c, id: `calc-${Date.now()}-${Math.random()}`, pageId: newId }));
    const pageImagesToCopy = images
      .filter((img) => img.pageId === id)
      .map((img) => ({ ...img, id: `img-${Date.now()}-${Math.random()}`, pageId: newId }));
    const pageDictatedToCopy = dictatedTextBoxes
      .filter((b) => b.pageId === id)
      .map((b) => ({
        ...b,
        id: `dictate-${Date.now()}-${Math.random()}`,
        pageId: newId,
        interimText: '',
      }));

    saveSnapshot();
    setPages((prev) => [...prev, newPage]);
    setStrokes((prev) => [...prev, ...pageStrokesToCopy]);
    setShapes((prev) => [...prev, ...pageShapesToCopy]);
    setGraphs((prev) => [...prev, ...pageGraphsToCopy]);
    setCalculators((prev) => [...prev, ...pageCalcsToCopy]);
    setImages((prev) => [...prev, ...pageImagesToCopy]);
    setDictatedTextBoxes((prev) => [...prev, ...pageDictatedToCopy]);
    setCurrentPageId(newId);
    scrollToPage(newId);
  };

  const handleMovePage = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) return;
    const copy = [...pages];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setPages(copy);
  };

  const handleChangeTemplate = (tmpl: PaperTemplate) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== currentPageId) return p;
        // Preserve PDF pages cleanly: changing background template controls the pattern underneath the PDF
        if (p.template === 'pdf' || p.pdfSourceId || p.pdfDataUrl) {
          return { ...p, template: 'pdf', underlayTemplate: tmpl };
        }
        return { ...p, template: tmpl };
      })
    );
  };

  const releaseAllPagesCaches = (targetPages: PageData[]) => {
    targetPages.forEach((p) => {
      releasePagePdfResources(p.id);
      clearCachedPagePreview(p.id);
    });
  };

  const handleNewDocument = () => {
    saveSnapshot();
    stopDictation();
    setActiveDictateBoxId(null);
    setSelectedDictateBoxId(null);
    releaseAllPagesCaches(pages);
    const newPage: PageData = {
      id: `page-${Date.now()}`,
      title: 'Page 1',
      template: 'grid',
      aspectRatio: 8.5 / 11,
    };
    setPages([newPage]);
    setCurrentPageId(newPage.id);
    scrollToPage(newPage.id, true);
    setStrokes([]);
    setShapes([]);
    setGraphs([]);
    setCalculators([]);
    setImages([]);
    setDictatedTextBoxes([]);
    setActiveFileContext(null);
    invalidateAllWidgetSnapshots();
  };

  // Upload PDF / Document image with lazy PDF.js preview registration (full pages load only in view)
  const handleUploadPdf = async (file: File) => {
    try {
      await captureAllMountedWidgets();
      const renderedPages = await loadPdfPages(file);
      if (renderedPages && renderedPages.length > 0) {
        saveSnapshot();
        setPages((prev) => [...renderedPages, ...prev]);
        setCurrentPageId(renderedPages[0].id);
        scrollToPage(renderedPages[0].id, true);
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      setAppStatusNotice({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to load PDF document.',
      });
    }
  };

  const handleOpenImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : 1;
        const w = Math.min(520, Math.max(200, img.naturalWidth || 400));
        const h = w / aspect;
        handleAddImage({
          id: `img-${Date.now()}`,
          x: 120,
          y: 120,
          width: w,
          height: h,
          dataUrl,
          pageId: currentPageId,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data: ProjectData = JSON.parse(text);
        if (data.pages && Array.isArray(data.pages)) {
          saveSnapshot();
          stopDictation();
          setActiveDictateBoxId(null);
          setSelectedDictateBoxId(null);
          releaseAllPagesCaches(pages);
          setPages(data.pages);
          setStrokes(data.strokes || []);
          setShapes(data.shapes || []);
          setGraphs(data.graphs || []);
          setCalculators(data.calculators || []);
          setImages(data.images || []);
          setDictatedTextBoxes(data.dictatedTextBoxes || []);
          if (data.pages.length > 0) {
            setCurrentPageId(data.pages[0].id);
            scrollToPage(data.pages[0].id, true);
          }
          invalidateAllWidgetSnapshots();
        } else {
          setAppStatusNotice({
            kind: 'error',
            message: 'Selected file does not contain valid NoteTeacher pages.',
          });
        }
      } catch {
        setAppStatusNotice({
          kind: 'error',
          message: 'Invalid .noteteacher or .json project file format.',
        });
      }
    };
    reader.readAsText(file);
  };

  const openLoadedFile = async (file: File, extension: string) => {
    const ext = extension.toLowerCase();
    if (ext === '.pdf') {
      await handleUploadPdf(file);
    } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      handleOpenImageFile(file);
    } else {
      handleOpenProject(file);
    }
  };

  const handleOpenFileFromExplorer = async (fileItem: ExplorerFileItem, rawFile?: File) => {
    setActiveFileContext({
      id: fileItem.id,
      name: fileItem.name,
      extension: fileItem.extension,
      pathBreadcrumb: fileItem.pathBreadcrumb,
      sourceType: fileItem.sourceType,
      fileHandle: fileItem.fileHandle,
    });

    if (rawFile) {
      await openLoadedFile(rawFile, fileItem.extension);
      return;
    }

    if (fileItem.fileHandle) {
      try {
        const permitted = await verifyHandlePermission(fileItem.fileHandle, 'read', true);
        if (!permitted) {
          setAppStatusNotice({
            kind: 'error',
            message: `Read permission denied for "${fileItem.name}".`,
          });
          return;
        }
        const file = await fileItem.fileHandle.getFile();
        await openLoadedFile(file, fileItem.extension);
        return;
      } catch (err) {
        console.warn('Could not read file from handle:', err);
        setAppStatusNotice({
          kind: 'error',
          message: `Could not read "${fileItem.name}" from disk. Try reloading the folder tab.`,
        });
        return;
      }
    }

    setAppStatusNotice({
      kind: 'error',
      message: `"${fileItem.name}" needs to be re-shared before it can be opened.`,
    });
  };

  const refreshSaveExplorerTabs = useCallback(async () => {
    await runExplorerCleanupMigration();
    const saved = loadSavedFolderTabs();
    setSaveExplorerTabs(saved);
    const hydrated = await Promise.all(
      saved.map(async (tab) => {
        if (tab.sourceType === 'local_handle' && !tab.isSingleFileTab) {
          const dirHandle = await getDirectoryHandle(tab.id);
          if (dirHandle && (await queryHandlePermission(dirHandle, 'read'))) {
            const files = await scanDirectoryFiles(dirHandle, tab.pathBreadcrumb, tab.files);
            return {
              ...tab,
              dirHandle,
              files,
              missingCount: files.filter((f) => f.isMissing).length,
              accessState: 'granted' as const,
            };
          }
          return { ...tab, accessState: 'permission_required' as const };
        }
        return tab;
      })
    );
    setSaveExplorerTabs(hydrated);
  }, []);

  const openSaveExplorerModal = useCallback(
    (defaultMode: SaveAsMode, notice: string | null = null, suggestedName?: string) => {
      setSaveExplorerTabs(loadSavedFolderTabs());
      setSaveExplorerState({
        isOpen: true,
        defaultMode,
        suggestedName:
          suggestedName ||
          getDefaultSaveFileName(defaultMode, pages, currentPageId, activeFileContext?.name),
        notice,
      });
      void refreshSaveExplorerTabs();
    },
    [pages, currentPageId, activeFileContext?.name, refreshSaveExplorerTabs]
  );

  const handleAddLocalFolderFromSaveModal = useCallback(async (): Promise<ExplorerFolderTab | null> => {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      setAppStatusNotice({
        kind: 'info',
        message: 'Folder writing is unavailable in this browser. Use "Download to Device" to save your file.',
      });
      return null;
    }
    try {
      let dirHandle: FileSystemDirectoryHandle;
      try {
        // @ts-expect-error showDirectoryPicker options
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (permErr: unknown) {
        if ((permErr as Error)?.name === 'AbortError') return null;
        if ((permErr as Error)?.name === 'SecurityError') throw permErr;
        // @ts-expect-error showDirectoryPicker options
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      }
      const pathBreadcrumb = `/Local Device/${dirHandle.name}`;
      const existing = loadSavedFolderTabs();

      let matchedTab: ExplorerFolderTab | undefined;
      for (const t of existing) {
        if (t.isSingleFileTab) continue;
        const candidateHandle =
          t.dirHandle || (t.sourceType === 'local_handle' ? await getDirectoryHandle(t.id) : null);
        if (candidateHandle && typeof dirHandle.isSameEntry === 'function') {
          try {
            if (await dirHandle.isSameEntry(candidateHandle)) {
              matchedTab = t;
              break;
            }
          } catch {}
        }
      }
      if (!matchedTab) {
        matchedTab = existing.find(
          (t) =>
            !t.isSingleFileTab &&
            (t.pathBreadcrumb === pathBreadcrumb ||
              t.lastKnownPath === pathBreadcrumb ||
              t.name === dirHandle.name)
        );
      }

      const targetTabId = matchedTab ? matchedTab.id : `tab-dir-${Date.now()}`;
      const targetBreadcrumb = matchedTab?.pathBreadcrumb || pathBreadcrumb;
      const files = await scanDirectoryFiles(dirHandle, targetBreadcrumb, matchedTab?.files);
      await saveDirectoryHandle(targetTabId, dirHandle);
      const updatedTab: ExplorerFolderTab = {
        ...(matchedTab || {}),
        id: targetTabId,
        name: dirHandle.name,
        iconType: 'folder',
        sourceType: 'local_handle',
        pathBreadcrumb: targetBreadcrumb,
        dirHandle,
        files,
        missingCount: files.filter((f) => f.isMissing).length,
        accessState: 'granted',
        lastKnownPath: targetBreadcrumb,
      };
      const updated = matchedTab
        ? existing.map((t) => (t.id === matchedTab.id ? updatedTab : t))
        : [...existing, updatedTab];
      saveFolderTabs(updated);
      setSaveExplorerTabs((prev) =>
        matchedTab
          ? prev.map((t) => (t.id === matchedTab.id ? updatedTab : t))
          : [...prev.filter((t) => t.id !== targetTabId), updatedTab]
      );
      return updatedTab;
    } catch (err: unknown) {
      const errName = (err as Error)?.name;
      if (errName === 'AbortError') return null;
      setSaveExplorerState((prev) => ({
        ...prev,
        notice:
          errName === 'SecurityError'
            ? 'Your browser blocked the native folder dialog inside this embedded frame. Click "Download to Device" below to save directly.'
            : 'Unable to open native folder picker in this browser context. Use "Download to Device" below.',
      }));
      return null;
    }
  }, []);

  const handleSaveToDirectory = useCallback(
    async (
      dirHandle: FileSystemDirectoryHandle,
      fileName: string,
      saveMode: SaveAsMode,
      pathBreadcrumb: string
    ) => {
      const stageEl =
        pageRefsMapRef.current.get(currentPageId) ||
        pageRefsMapRef.current.values().next().value ||
        mainScrollRef.current;
      if (!stageEl) {
        throw new Error('Document stage is not ready yet.');
      }
      const { blob } = await buildSaveAsBlob(
        saveMode,
        stageEl,
        graphs,
        pages,
        strokes,
        shapes,
        calculators,
        currentPageId,
        images,
        fileName,
        dictatedTextBoxes
      );
      const fileHandle = await writeFileToDirectoryHandle(dirHandle, fileName, blob);
      setActiveFileContext({
        name: fileName,
        extension: extractFileExtension(fileName),
        pathBreadcrumb,
        sourceType: 'local_handle',
        fileHandle,
      });
      setAppStatusNotice({
        kind: 'success',
        message: `Saved "${fileName}" to ${pathBreadcrumb}`,
      });
    },
    [currentPageId, graphs, pages, strokes, shapes, calculators, images, dictatedTextBoxes]
  );

  const handleDownloadFallback = useCallback(
    async (fileName: string, saveMode: SaveAsMode) => {
      const stageEl =
        pageRefsMapRef.current.get(currentPageId) ||
        pageRefsMapRef.current.values().next().value ||
        mainScrollRef.current;
      if (!stageEl) {
        throw new Error('Document stage is not ready yet.');
      }
      const { blob } = await buildSaveAsBlob(
        saveMode,
        stageEl,
        graphs,
        pages,
        strokes,
        shapes,
        calculators,
        currentPageId,
        images,
        fileName,
        dictatedTextBoxes
      );
      triggerDirectBlobDownload(blob, fileName);
      setAppStatusNotice({
        kind: 'success',
        message: `Saved "${fileName}" to Downloads.`,
      });
    },
    [currentPageId, graphs, pages, strokes, shapes, calculators, images, dictatedTextBoxes]
  );

  const handleShareFallback = useCallback(
    async (fileName: string, saveMode: SaveAsMode) => {
      const stageEl =
        pageRefsMapRef.current.get(currentPageId) ||
        pageRefsMapRef.current.values().next().value ||
        mainScrollRef.current;
      if (!stageEl) {
        throw new Error('Document stage is not ready yet.');
      }
      const { blob, mimeType } = await buildSaveAsBlob(
        saveMode,
        stageEl,
        graphs,
        pages,
        strokes,
        shapes,
        calculators,
        currentPageId,
        images,
        fileName,
        dictatedTextBoxes
      );
      const shareResult = await shareFileWithSystemSheet(blob, fileName, mimeType);
      if (shareResult === 'shared') {
        setAppStatusNotice({
          kind: 'success',
          message: `Shared / saved "${fileName}".`,
        });
      } else if (shareResult === 'unsupported') {
        triggerDirectBlobDownload(blob, fileName);
        setAppStatusNotice({
          kind: 'info',
          message: `Share sheet unavailable here; saved "${fileName}" to Downloads instead.`,
        });
      }
    },
    [currentPageId, graphs, pages, strokes, shapes, calculators, images, dictatedTextBoxes]
  );

  const executeActualSaveAs = (saveMode: SaveAsMode, options?: { forceSaveAs?: boolean }) => {
    const stageEl =
      pageRefsMapRef.current.get(currentPageId) ||
      pageRefsMapRef.current.values().next().value ||
      mainScrollRef.current;
    if (!stageEl) return;

    const forceNew = Boolean(options?.forceSaveAs);
    const suggestedName = getDefaultSaveFileName(
      saveMode,
      pages,
      currentPageId,
      activeFileContext?.name
    );

    void executeSaveAs(
      saveMode,
      stageEl,
      graphs,
      setGraphs,
      pages,
      strokes,
      shapes,
      calculators,
      currentPageId,
      images,
      suggestedName,
      forceNew ? undefined : activeFileContext?.fileHandle,
      dictatedTextBoxes
    ).then((result) => {
      if (result.status === 'saved') {
        if (result.fileHandle) {
          setActiveFileContext({
            id: activeFileContext?.id,
            name: result.fileName,
            extension: extractFileExtension(result.fileName),
            pathBreadcrumb:
              result.method === 'handle_overwrite' && activeFileContext?.pathBreadcrumb
                ? activeFileContext.pathBreadcrumb
                : `/Local Device/${result.fileName}`,
            sourceType: 'local_handle',
            fileHandle: result.fileHandle,
          });
        }
        setAppStatusNotice({
          kind: 'success',
          message: `Saved "${result.fileName}".`,
        });
      } else if (result.status === 'needs_explorer_fallback') {
        const shareSupported = canShareFilesOnDevice();
        const notice =
          result.reason === 'blocked_in_iframe'
            ? shareSupported
              ? 'Your browser blocked the native Save dialog inside this embedded frame. Use "Save to Files / Share..." to pick a specific folder (Files, iCloud, Drive, OneDrive), choose a mounted folder below, or click "Download to Downloads".'
              : 'Your browser blocked opening the native OS Save dialog inside this embedded frame. Choose a mounted folder below to Save Copy Here, or click "Download to Downloads".'
            : shareSupported
            ? 'Direct folder picking is blocked on this mobile browser. Tap "Save to Files / Share..." below to choose an exact destination folder (Files, iCloud, Google Drive, OneDrive), or tap "Download to Downloads".'
            : 'Native File System Save dialog is unavailable in this browser. Choose a folder below or click "Download to Downloads".';
        openSaveExplorerModal(result.mode, notice, result.suggestedName);
      }
    });
  };

  const handleSaveAs = (saveMode: SaveAsMode) => {
    // Only prompt overwrite when the open file format matches the selected save mode
    if (
      activeFileContext &&
      activeFileContext.pathBreadcrumb &&
      doesHandleMatchSaveMode(activeFileContext.name, saveMode)
    ) {
      setPendingOverwriteSaveMode(saveMode);
      setShowOverwriteModal(true);
      return;
    }
    executeActualSaveAs(saveMode);
  };

  // Group document elements by pageId so unrelated page slots keep stable refs across scroll & edits
  const strokesByPage = useMemo(() => {
    const map = new Map<string, CanvasStroke[]>();
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      let arr = map.get(s.pageId);
      if (!arr) {
        arr = [];
        map.set(s.pageId, arr);
      }
      arr.push(s);
    }
    return map;
  }, [strokes]);

  const shapesByPage = useMemo(() => {
    const map = new Map<string, GeometricShape[]>();
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      let arr = map.get(sh.pageId);
      if (!arr) {
        arr = [];
        map.set(sh.pageId, arr);
      }
      arr.push(sh);
    }
    return map;
  }, [shapes]);

  const graphsByPage = useMemo(() => {
    const map = new Map<string, DesmosBox[]>();
    for (let i = 0; i < graphs.length; i++) {
      const g = graphs[i];
      let arr = map.get(g.pageId);
      if (!arr) {
        arr = [];
        map.set(g.pageId, arr);
      }
      arr.push(g);
    }
    return map;
  }, [graphs]);

  const calculatorsByPage = useMemo(() => {
    const map = new Map<string, CalculatorBox[]>();
    for (let i = 0; i < calculators.length; i++) {
      const c = calculators[i];
      let arr = map.get(c.pageId);
      if (!arr) {
        arr = [];
        map.set(c.pageId, arr);
      }
      arr.push(c);
    }
    return map;
  }, [calculators]);

  const imagesByPage = useMemo(() => {
    const map = new Map<string, CanvasImage[]>();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let arr = map.get(img.pageId);
      if (!arr) {
        arr = [];
        map.set(img.pageId, arr);
      }
      arr.push(img);
    }
    return map;
  }, [images]);

  const dictatedBoxesByPage = useMemo(() => {
    const map = new Map<string, DictatedTextBox[]>();
    for (let i = 0; i < dictatedTextBoxes.length; i++) {
      const box = dictatedTextBoxes[i];
      let arr = map.get(box.pageId);
      if (!arr) {
        arr = [];
        map.set(box.pageId, arr);
      }
      arr.push(box);
    }
    return map;
  }, [dictatedTextBoxes]);

  const stageMode = mode === 'presenter' ? 'drawing' : mode;
  const isBottomMicVisible =
    !isViewerTab &&
    editingDictateBoxId === null &&
    (activeDictateBoxId !== null || (mode === 'dictate' && selectedDictateBoxId !== null));
  const currentPage = pages.find((p) => p.id === currentPageId) || pages[0];

  // Calculate natural aspect ratio: never compressed horizontally or stretched vertically
  const pageAspectRatio =
    currentPage?.aspectRatio ||
    (currentPage?.pdfWidth && currentPage?.pdfHeight
      ? currentPage.pdfWidth / currentPage.pdfHeight
      : 8.5 / 11);

  if (isViewerTab) {
    const fallbackH = Math.max(400, viewerWindowSize.height - 110);
    const fallbackW = fallbackH * pageAspectRatio;
    const frameW = cameraView.viewportWidth > 0 ? cameraView.viewportWidth : fallbackW;
    const frameH = cameraView.viewportHeight > 0 ? cameraView.viewportHeight : fallbackH;
    const povScaleSynced = cameraView.povScale && cameraView.povScale > 0 ? cameraView.povScale : 1;
    const stageW =
      cameraView.stageWidth && cameraView.stageWidth > 0
        ? cameraView.stageWidth
        : frameW / povScaleSynced;
    const stageH =
      cameraView.stageHeight && cameraView.stageHeight > 0
        ? cameraView.stageHeight
        : frameH / povScaleSynced;

    const regularFitScale = Math.min(
      viewerWindowSize.width / Math.max(1, stageW),
      viewerWindowSize.height / Math.max(1, stageH)
    );
    const isFullPovSynced = Boolean(cameraView.isFullPovMode);
    const syncedPovZoom =
      cameraView.povZoomFactor && cameraView.povZoomFactor > 0 ? cameraView.povZoomFactor : 1;

    // Reflect Full POV mode cleanly: fill audience screen width edge-to-edge while preserving aspect ratio
    // and following the teacher's vertical scroll position; in Regular POV, mirror pinch-POV zoom smoothly.
    const fitScale = isFullPovSynced
      ? (viewerWindowSize.width / Math.max(1, stageW)) * syncedPovZoom
      : regularFitScale * povScaleSynced;

    const scaledW = stageW * fitScale;
    const scaledH = stageH * fitScale;
    const frameLeft = (viewerWindowSize.width - scaledW) / 2;
    const frameTop =
      scaledH > viewerWindowSize.height
        ? -Math.max(0, Math.min(1, cameraView.povScrollYFraction ?? 0)) *
          (scaledH - viewerWindowSize.height)
        : (viewerWindowSize.height - scaledH) / 2;

    return (
      <div className="h-screen w-screen bg-black relative overflow-hidden select-none">
        {/* Exact Teacher Viewport Frame reflecting Regular vs Full POV framing & scroll position */}
        <div
          style={{
            position: 'absolute',
            left: `${frameLeft}px`,
            top: `${frameTop}px`,
            width: `${scaledW}px`,
            height: `${scaledH}px`,
          }}
          className="overflow-hidden shadow-2xl bg-white dark:bg-slate-900"
        >
          <div
            style={{
              width: `${stageW}px`,
              height: `${stageH}px`,
              transform: `scale(${fitScale})`,
              transformOrigin: 'top left',
            }}
            className="relative overflow-hidden bg-white dark:bg-slate-900"
          >
            <CanvasStage
              mode="presenter"
              isAudienceViewer={true}
              isActivePage={true}
              hideAudienceChrome={syncedControlsVisibility === 'presenter_only'}
              externalZoomScale={cameraView.zoomScale}
              externalPanOffset={cameraView.panOffset}
              externalLiveOverlay={liveOverlay}
              externalPresenterState={presenterToolState}
              pageId={currentPageId}
              template={currentPage?.template || 'grid'}
              pdfSourceId={currentPage?.pdfSourceId}
              pdfPageNumber={currentPage?.pdfPageNumber}
              previewDataUrl={currentPage?.previewDataUrl}
              pdfDataUrl={currentPage?.pdfDataUrl}
              aspectRatio={pageAspectRatio}
              pdfWidth={currentPage?.pdfWidth}
              pdfHeight={currentPage?.pdfHeight}
              penType="pen"
              strokeWidth={3}
              currentColor="#0F172A"
              shapeType="rect"
              shapeStrokeWidth={3}
              shapeStyle="solid"
              shapeFill={false}
              shapeFillOpacity={0}
              eraserType="scrub"
              eraserSize={24}
              isMagicGrabActive={false}
              magicGrabMode="touch"
              isPictureCopyActive={false}
              presenterMode={presenterMode}
              onClosePresenter={() => {}}
              dictatedTextBoxes={dictatedBoxesByPage.get(currentPageId) ?? EMPTY_DICTATED}
              strokes={strokes}
              shapes={shapes}
              graphs={graphs}
              calculators={calculators}
              images={images}
              onAddStroke={() => {}}
              onAddShape={() => {}}
              onUpdateShape={() => {}}
              onDeleteShape={() => {}}
              onAddGraph={() => {}}
              onAddCalculator={() => {}}
              onAddImage={() => {}}
              onUpdateGraph={() => {}}
              onDeleteGraph={() => {}}
              onUpdateCalculator={() => {}}
              onDeleteCalculator={() => {}}
              onUpdateImage={() => {}}
              onDeleteImage={() => {}}
              onGhostItems={() => {}}
              onConfirmDeleteGhosted={() => {}}
              onCancelGhosted={() => {}}
              onTransformItems={() => {}}
              onColorUsed={() => {}}
            />
          </div>
        </div>

        {/* Subtle Minimalist Audience Fullscreen Pill */}
        <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2.5 bg-slate-900/80 hover:bg-slate-900/95 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/70 shadow-2xl text-[11px] text-slate-300 opacity-65 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">Audience View</span>
          </div>
          <span className="text-slate-600">•</span>
          <span className="font-mono text-slate-400">
            {Math.round(cameraView.zoomScale * 100)}%
          </span>
          <span className="text-slate-600">•</span>
          <span className="font-mono text-slate-400">
            Page {pages.findIndex((p) => p.id === currentPageId) + 1}/{pages.length}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            title="Toggle Fullscreen"
            className="p-1 hover:text-white rounded transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden overscroll-none bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans">
      {/* 1. TOP BAR RIBBON */}
      <TopBarRibbon
        mode={mode}
        onSetMode={handleSetMode}
        onSaveAs={handleSaveAs}
        onNewDocument={handleNewDocument}
        onOpenProject={handleOpenProject}
        pages={pages}
        currentPageId={currentPageId}
        onSelectPage={handleSelectPage}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        onDuplicatePage={handleDuplicatePage}
        onMovePage={handleMovePage}
        penType={penType}
        onSetPenType={handleSetPenType}
        strokeWidth={strokeWidth}
        onSetStrokeWidth={handleSetStrokeWidth}
        currentColor={currentColor}
        onSetCurrentColor={handleSetCurrentColor}
        documentColors={documentColors}
        paletteColors={paletteColors}
        onUpdatePaletteColors={handleUpdatePaletteColors}
        touchInputMode={touchInputMode}
        onSetTouchInputMode={setTouchInputMode}
        stylusConfig={stylusConfig}
        onUpdateStylusConfig={handleUpdateStylusConfig}
        angleUnit={angleUnit}
        onSetAngleUnit={setAngleUnit}
        angleNegativeDirection={angleNegativeDirection}
        onSetAngleNegativeDirection={setAngleNegativeDirection}
        allowNegativeAngles={allowNegativeAngles}
        onSetAllowNegativeAngles={setAllowNegativeAngles}
        onAddCalculatorAtCenter={handleAddCalculatorAtCenter}
        onAddDesmosBoxAtCenter={handleAddDesmosBoxAtCenter}
        graphOpacity={graphOpacity}
        onSetGraphOpacity={setGraphOpacity}
        shapeType={shapeType}
        onSetShapeType={setShapeType}
        shapeStrokeWidth={shapeStrokeWidth}
        onSetShapeStrokeWidth={setShapeStrokeWidth}
        shapeStyle={shapeStyle}
        onSetShapeStyle={setShapeStyle}
        shapeFill={shapeFill}
        onSetShapeFill={handleSetShapeFill}
        shapeFillOpacity={shapeFillOpacity}
        onSetShapeFillOpacity={setShapeFillOpacity}
        eraserType={eraserType}
        onSetEraserType={setEraserType}
        eraserSize={eraserSize}
        onSetEraserSize={setEraserSize}
        isMagicGrabActive={isMagicGrabActive}
        onSetMagicGrabActive={setIsMagicGrabActive}
        magicGrabMode={magicGrabMode}
        onSetMagicGrabMode={setMagicGrabMode}
        keepEmptyBox={keepEmptyBox}
        onSetKeepEmptyBox={setKeepEmptyBox}
        isPictureCopyActive={isPictureCopyActive}
        onSetPictureCopyActive={setIsPictureCopyActive}
        onClearPage={() => setIsClearModalOpen(true)}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDeleteSelected={handleDeleteSelected}
        hasSelection={hasSelection}
        canPaste={!!clipboard}
        presenterSettings={presenterSettings}
        onUpdatePresenterSettings={(updated) =>
          setPresenterSettings((prev) => ({ ...prev, ...updated }))
        }
        onRequestScreenPermission={handleRequestScreenPermission}
        onOpenAudienceTab={handleOpenAudienceTab}
        canUndo={historyStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        presenterMode={presenterMode}
        onSetPresenterMode={setPresenterMode}
        currentTemplate={currentPage?.template || 'grid'}
        currentUnderlayTemplate={currentPage?.underlayTemplate}
        onSetTemplate={handleChangeTemplate}
        onUploadPdf={handleUploadPdf}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onStatusNotice={(kind, message) => setAppStatusNotice({ kind, message })}
        onOpenFileFromExplorer={handleOpenFileFromExplorer}
        activeFileContext={activeFileContext}
        onOpenSaveExplorer={(saveMode) =>
          openSaveExplorerModal(
            saveMode,
            canShareFilesOnDevice()
              ? 'Select a local folder, tap "Save to Files / Share..." to choose any folder (Files, iCloud, Drive), or click "Download to Downloads".'
              : 'Select a local folder to save directly into, or click "Download to Downloads".'
          )
        }
        onSaveToDirectory={handleSaveToDirectory}
        onDownloadFallback={handleDownloadFallback}
        onShareFallback={canShareFilesOnDevice() ? handleShareFallback : undefined}
        dictateSubMode={dictateSubMode}
        onSetDictateSubMode={setDictateSubMode}
        constantDictateFontSize={constantDictateFontSize}
        onSetConstantDictateFontSize={setConstantDictateFontSize}
        micPermission={micPermission}
        isRequestingMicPermission={isRequestingMicPermission}
        onRequestMicPermission={() => void requestMicPermission()}
        isGeometricEraserActive={isGeometricEraserActive}
        onSetGeometricEraserActive={setIsGeometricEraserActive}
        isDictateEraserActive={isDictateEraserActive}
        onSetDictateEraserActive={handleSetDictateEraserActive}
        onOpenCreatorInfo={() => setIsCreatorInfoOpen(true)}
        isCreatorInfoOpen={isCreatorInfoOpen}
        creatorInfoJustLanded={creatorInfoJustLanded}
        isModeBarCollapsed={isModeBarCollapsed}
        onToggleModeBarCollapsed={() => setIsModeBarCollapsed((prev) => !prev)}
      />

      {/* 2. MAIN VIRTUALIZED WORKSPACE CANVAS (Only viewport-visible pages load; off-screen pages stay blurry placeholders) */}
      {(() => {
        const mainW = Math.max(320, mainViewportSize.width);
        const mainH = Math.max(320, mainViewportSize.height);
        const regularHorizPad = mainW >= 640 ? 112 : 88;
        const availRegularW = Math.max(240, mainW - regularHorizPad);
        const availRegularH = Math.max(320, mainH - 48);

        const computePagePovMetrics = (page: PageData) => {
          const aspect =
            page.aspectRatio && page.aspectRatio > 0
              ? page.aspectRatio
              : page.pdfWidth && page.pdfHeight && page.pdfHeight > 0
              ? page.pdfWidth / page.pdfHeight
              : 8.5 / 11;
          const regularWidthPx = Math.max(220, Math.min(availRegularW, availRegularH * aspect));
          const fullWidthPx = Math.max(regularWidthPx, mainW);
          const baseScale = isFullPovMode ? fullWidthPx / regularWidthPx : 1;
          const maxRegularFactor = fullWidthPx / regularWidthPx;
          const clampedFactor = isFullPovMode
            ? povZoomFactor
            : Math.min(maxRegularFactor, Math.max(0.75, povZoomFactor));
          const povScale = baseScale * clampedFactor;
          const renderedWidthPx = regularWidthPx * povScale;
          return { regularWidthPx, povScale, renderedWidthPx };
        };

        const activeVisiblePage =
          pages[Math.max(0, Math.min(pages.length - 1, scrollPageNumber - 1))] ||
          currentPage ||
          pages[0];
        const activeMetrics = activeVisiblePage
          ? computePagePovMetrics(activeVisiblePage)
          : { regularWidthPx: 600, povScale: 1, renderedWidthPx: 600 };

        const pageLeftPx = Math.max(44, (mainW - activeMetrics.renderedWidthPx) / 2);
        const pageRightPx = Math.min(mainW - 44, (mainW + activeMetrics.renderedWidthPx) / 2);
        const rightSpacePx = Math.max(0, mainW - pageRightPx);

        const handleToggleFullPov = () => {
          setIsFullPovMode((prev) => {
            const next = !prev;
            setPovZoomFactor(1);
            setIsBottomAddPageOpen(false);
            return next;
          });
        };

        return (
      <div className="flex-1 relative flex overflow-hidden overscroll-none">
        <main
          ref={mainScrollRef}
          data-tour-id="canvas-stage"
          onScroll={() => {
            updateScrollPageIndicator();
            syncCameraNow();
            if (Date.now() - lastRightEdgeInputAtRef.current < 1500) {
              setIsRightScrollbarVisible(true);
            }
          }}
          onWheel={(e) => {
            const mainEl = mainScrollRef.current;
            if (!mainEl) return;
            const rect = mainEl.getBoundingClientRect();
            if (e.clientX >= rect.right - 84 && Math.abs(e.deltaY) > 0) {
              lastRightEdgeInputAtRef.current = Date.now();
              setIsRightScrollbarVisible(true);
            }
          }}
          onTouchStart={(e) => {
            if (touchInputMode === 'stylus_only') {
              rightEdgeTouchStartRef.current = null;
              return;
            }
            const mainEl = mainScrollRef.current;
            if (!mainEl || e.touches.length !== 1) {
              rightEdgeTouchStartRef.current = null;
              return;
            }
            const rect = mainEl.getBoundingClientRect();
            const t = e.touches[0];
            const inZone = t.clientX >= rect.right - 84;
            rightEdgeTouchStartRef.current = { y: t.clientY, inZone };
            if (inZone) {
              lastRightEdgeInputAtRef.current = Date.now();
            }
          }}
          onTouchMove={(e) => {
            if (touchInputMode === 'stylus_only') return;
            const st = rightEdgeTouchStartRef.current;
            if (!st || !st.inZone || e.touches.length !== 1) return;
            const dy = Math.abs(e.touches[0].clientY - st.y);
            if (dy > 6) {
              lastRightEdgeInputAtRef.current = Date.now();
              setIsRightScrollbarVisible(true);
            }
          }}
          onTouchEnd={() => {
            rightEdgeTouchStartRef.current = null;
          }}
          onPointerDown={(e) => {
            const mainEl = mainScrollRef.current;
            if (!mainEl) return;
            const rect = mainEl.getBoundingClientRect();
            if (e.clientX >= rect.right - 84) {
              const targetEl = e.target as HTMLElement | null;
              const isInsideDrawingCanvas = Boolean(targetEl?.closest('.drawing-layer'));
              if (
                isInsideDrawingCanvas &&
                (e.pointerType === 'pen' ||
                  stageMode === 'drawing' ||
                  stageMode === 'geometric' ||
                  stageMode === 'dictate')
              ) {
                return;
              }
              lastRightEdgeInputAtRef.current = Date.now();
              const isInWidget = Boolean(
                targetEl?.closest('.desmos-box, .calculator-box, .image-box, [data-testid="right-edge-scrollbar"]')
              );
              if (e.pointerType !== 'touch' && !isInWidget && e.clientX >= rect.right - 64 && e.clientX < rect.right - 12) {
                rightEdgeSwipeRef.current = {
                  pointerId: e.pointerId,
                  startY: e.clientY,
                  lastY: e.clientY,
                  activeScrollDrag: false,
                };
              }
            }
          }}
          onPointerMove={(e) => {
            const swipe = rightEdgeSwipeRef.current;
            if (!swipe || swipe.pointerId !== e.pointerId) return;
            const mainEl = mainScrollRef.current;
            if (!mainEl) return;
            const totalDy = Math.abs(e.clientY - swipe.startY);
            const stepDy = e.clientY - swipe.lastY;
            swipe.lastY = e.clientY;
            if (totalDy > 6) {
              swipe.activeScrollDrag = true;
              lastRightEdgeInputAtRef.current = Date.now();
              mainEl.scrollTop -= stepDy;
              setIsRightScrollbarVisible(true);
            }
          }}
          onPointerUp={(e) => {
            if (rightEdgeSwipeRef.current?.pointerId === e.pointerId) {
              rightEdgeSwipeRef.current = null;
            }
          }}
          onPointerCancel={(e) => {
            if (rightEdgeSwipeRef.current?.pointerId === e.pointerId) {
              rightEdgeSwipeRef.current = null;
            }
          }}
          className={`flex-1 h-full overflow-y-auto overscroll-none ${
            touchInputMode === 'stylus_only' ? 'touch-none' : 'touch-pan-y'
          } bg-slate-200/70 dark:bg-slate-950 flex flex-col items-center gap-6 ${
            isFullPovMode
              ? 'px-0 py-2 overflow-x-auto'
              : 'px-11 sm:px-14 py-4 sm:py-6 overflow-x-hidden'
          }`}
        >
          {pages.map((page, idx) => {
            const isSlotActive = page.id === currentPageId;
            const { regularWidthPx, povScale } = computePagePovMetrics(page);
            return (
              <VirtualizedPageSlot
                key={page.id}
                page={page}
                pageIndex={idx}
                isVisibleInViewport={visiblePageIds.has(page.id)}
                isActivePage={isSlotActive}
                scrollContainerRef={mainScrollRef}
                onRegisterPageElement={registerPageElement}
                onActivatePage={handleActivatePage}
                regularWidthPx={regularWidthPx}
                povScale={povScale}
                isFullPovMode={isFullPovMode}
                mode={stageMode}
                touchInputMode={touchInputMode}
                stylusConfig={stylusConfig}
                onViewportChange={handleViewportChange}
                onLiveOverlayChange={handleLiveOverlayChange}
                onPresenterStateChange={handlePresenterStateChange}
                penType={penType}
                strokeWidth={strokeWidth}
                currentColor={currentColor}
                shapeType={shapeType}
                shapeStrokeWidth={shapeStrokeWidth}
                shapeStyle={shapeStyle}
                shapeFill={shapeFill}
                shapeFillOpacity={shapeFillOpacity}
                angleUnit={angleUnit}
                angleNegativeDirection={angleNegativeDirection}
                allowNegativeAngles={allowNegativeAngles}
                eraserType={eraserType}
                eraserSize={eraserSize}
                isGeometricEraserActive={isGeometricEraserActive}
                isDictateEraserActive={isDictateEraserActive}
                isMagicGrabActive={isMagicGrabActive}
                magicGrabMode={magicGrabMode}
                keepEmptyBox={keepEmptyBox}
                isPictureCopyActive={isPictureCopyActive}
                onSetPictureCopyActive={setIsPictureCopyActive}
                onSelectionChange={handleSelectionChange}
                activeSelectionProp={isSlotActive ? activeSelection : null}
                presenterMode={isSlotActive ? presenterMode : 'none'}
                onClosePresenter={handleClosePresenter}
                dictateSubMode={dictateSubMode}
                constantDictateFontSize={constantDictateFontSize}
                dictatedTextBoxes={dictatedBoxesByPage.get(page.id) ?? EMPTY_DICTATED}
                activeDictateBoxId={activeDictateBoxId}
                selectedDictateBoxId={selectedDictateBoxId}
                editingDictateBoxId={editingDictateBoxId}
                isDictating={isDictating}
                editingGridDims={editingGridDims}
                onStartEditGridDims={handleStartEditGridDims}
                onChangeGridDimsDraft={handleChangeGridDimsDraft}
                onStopEditGridDims={handleStopEditGridDims}
                onAddDictatedTextBox={handleAddDictatedTextBox}
                onUpdateDictatedTextBox={handleUpdateDictatedTextBox}
                onDeleteDictatedTextBox={handleDeleteDictatedTextBox}
                onSelectDictateBoxForTransform={handleSelectDictateBoxForTransform}
                onResumeDictateBox={handleResumeDictateBox}
                onStartManualEditDictateBox={handleStartManualEditDictateBox}
                onStopManualEditDictateBox={handleStopManualEditDictateBox}
                onClickOutsideDictateBox={handleClickOutsideDictateBox}
                onDeselectDictateBox={handleDeselectDictateBox}
                strokes={strokesByPage.get(page.id) ?? EMPTY_STROKES}
                shapes={shapesByPage.get(page.id) ?? EMPTY_SHAPES}
                graphs={graphsByPage.get(page.id) ?? EMPTY_GRAPHS}
                calculators={calculatorsByPage.get(page.id) ?? EMPTY_CALCULATORS}
                images={imagesByPage.get(page.id) ?? EMPTY_IMAGES}
                onAddStroke={handleAddStroke}
                onAddShape={handleAddShape}
                onUpdateShape={handleUpdateShape}
                onDeleteShape={handleDeleteShape}
                onAddGraph={handleAddGraph}
                onAddCalculator={handleAddCalculator}
                onAddImage={handleAddImage}
                onUpdateGraph={handleUpdateGraph}
                onDeleteGraph={handleDeleteGraph}
                onUpdateCalculator={handleUpdateCalculator}
                onDeleteCalculator={handleDeleteCalculator}
                onUpdateImage={handleUpdateImage}
                onDeleteImage={handleDeleteImage}
                onGhostItems={handleGhostItems}
                onCircleEraseSweep={handleCircleEraseSweep}
                onConfirmDeleteGhosted={handleConfirmDeleteGhosted}
                onCancelGhosted={handleCancelGhosted}
                onTransformItems={handleTransformItems}
                onRotateItems={handleRotateItems}
                onTransformEnd={saveSnapshot}
                onColorUsed={handleColorUsed}
              />
            );
          })}
        </main>

        {/* Left & Right POV Toggle Arrows (outward in regular POV -> inward at tab edges in Full POV) */}
        <button
          type="button"
          onClick={handleToggleFullPov}
          title={isFullPovMode ? 'Exit Full POV View' : 'Expand to Full POV View'}
          style={
            isFullPovMode
              ? {
                  left:
                    touchInputMode === 'stylus_and_hand' || touchInputMode === 'stylus_only'
                      ? '64px'
                      : '8px',
                }
              : { left: `${Math.max(8, pageLeftPx - 44)}px` }
          }
          className="absolute top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-lg flex items-center justify-center transition-colors cursor-pointer"
        >
          {isFullPovMode ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={handleToggleFullPov}
          data-tour-id={isFullPovMode ? 'pov-controls' : undefined}
          title={isFullPovMode ? 'Exit Full POV View' : 'Expand to Full POV View'}
          style={
            isFullPovMode
              ? { right: '8px' }
              : { left: `${Math.min(mainW - 44, pageRightPx + 8)}px` }
          }
          className="absolute top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-lg flex items-center justify-center transition-colors cursor-pointer"
        >
          {isFullPovMode ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
        </button>

        {/* Regular POV Bottom-Right Outside Controls: Page Number, Copy Current Page, Add Page + Background */}
        {!isFullPovMode && (
          <div
            ref={bottomAddPageRef}
            data-tour-id="pov-controls"
            style={
              rightSpacePx >= 260
                ? { left: `${pageRightPx + 14}px`, bottom: '16px' }
                : rightSpacePx >= 112
                ? { left: `${pageRightPx + 10}px`, bottom: '16px' }
                : { right: '10px', bottom: '14px' }
            }
            className="absolute z-40 flex flex-col items-end gap-1.5 select-none"
          >
            {isBottomAddPageOpen && (
              <div className="mb-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Add Page Background
                </div>
                {(
                  [
                    { id: 'blank', label: 'Blank Whiteboard', Icon: FileText },
                    { id: 'lined', label: 'Lined Notebook', Icon: AlignLeft },
                    { id: 'graph', label: 'Graph Paper', Icon: Grid },
                    { id: 'dotted', label: 'Dotted Grid', Icon: CircleDot },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setIsBottomAddPageOpen(false);
                      void handleAddPage(id);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}

            <div
              className={`flex ${
                rightSpacePx >= 260 ? 'flex-row items-center' : 'flex-col items-stretch'
              } gap-1.5 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-2.5 py-1.5 text-xs`}
            >
              <span className="font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap px-1">
                Page {scrollPageNumber} / {pages.length}
              </span>

              <button
                type="button"
                title="Copy current page"
                onClick={() => {
                  const target =
                    pages[Math.max(0, Math.min(pages.length - 1, scrollPageNumber - 1))] ||
                    currentPage;
                  if (target) {
                    void handleDuplicatePage(target.id);
                  }
                }}
                className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>

              <button
                type="button"
                title="Add new page and select background"
                onClick={() => setIsBottomAddPageOpen((prev) => !prev)}
                className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isBottomAddPageOpen
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-600/10 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Page</span>
              </button>
            </div>
          </div>
        )}

        {/* Right-edge swipe-triggered scrollbar with live left-side page badge */}
        <DocumentScrollBar
          isVisible={isRightScrollbarVisible}
          scrollContainerRef={mainScrollRef}
          currentPageNumber={scrollPageNumber}
          totalPages={pages.length}
          onDismiss={() => setIsRightScrollbarVisible(false)}
        />
      </div>
        );
      })()}

      {/* 3. THREE-STEP CONFIRMATION CLEAR PAGE MODAL */}
      <ClearPageModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        currentPageTitle={currentPage?.title || 'Current Page'}
        totalPages={pages.length}
        onClearCurrentPageElements={handleClearCurrentPageElements}
        onClearAllElements={handleClearAllElements}
        onDeleteCurrentPage={handleDeleteCurrentPage}
      />

      {/* 4. OVERWRITE EXISTING FILE CONFIRMATION MODAL */}
      {activeFileContext && (
        <OverwriteConfirmModal
          isOpen={showOverwriteModal}
          onClose={() => setShowOverwriteModal(false)}
          onConfirmOverwrite={() => {
            if (pendingOverwriteSaveMode) {
              executeActualSaveAs(pendingOverwriteSaveMode);
              setPendingOverwriteSaveMode(null);
            }
          }}
          onSaveAsNew={() => {
            if (pendingOverwriteSaveMode) {
              executeActualSaveAs(pendingOverwriteSaveMode, { forceSaveAs: true });
              setPendingOverwriteSaveMode(null);
            }
          }}
          fileContext={activeFileContext}
        />
      )}

      {/* 4B. IN-APP SAVE FILE EXPLORER MODAL (Opened when saving to explorer folder or when OS Save Picker is blocked/unsupported) */}
      <ClassicFileExplorerModal
        isOpen={saveExplorerState.isOpen}
        onClose={() => setSaveExplorerState((prev) => ({ ...prev, isOpen: false }))}
        folderTabs={saveExplorerTabs}
        onOpenFile={(file) => {
          void handleOpenFileFromExplorer(file);
        }}
        onRefreshExplorer={() => void refreshSaveExplorerTabs()}
        modalMode="save"
        initialSaveMode={saveExplorerState.defaultMode}
        suggestedSaveName={saveExplorerState.suggestedName}
        saveNotice={saveExplorerState.notice}
        onSaveToDirectory={handleSaveToDirectory}
        onDownloadFallback={handleDownloadFallback}
        onShareFallback={canShareFilesOnDevice() ? handleShareFallback : undefined}
        onAddLocalFolder={handleAddLocalFolderFromSaveModal}
      />

      {/* 5. BOTTOM-MIDDLE PULSING BLUE MICROPHONE CONTROL FOR LIVE DICTATION */}
      {isBottomMicVisible && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10002] flex flex-col items-center gap-2"
          data-testid="dictate-mic-dock"
        >
          {(micPermission === 'denied' || micPermission === 'prompt') && !isDictating && (
            <button
              type="button"
              disabled={isRequestingMicPermission}
              onClick={() => void requestMicPermission()}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg border transition-colors ${
                micPermission === 'denied'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-400'
                  : 'bg-sky-600 hover:bg-sky-700 text-white border-sky-400'
              }`}
            >
              {isRequestingMicPermission
                ? 'Requesting Microphone Permission...'
                : micPermission === 'denied'
                ? 'Microphone Blocked · Tap to Allow / View Help'
                : 'Allow Microphone Permission'}
            </button>
          )}
          <div className="relative flex items-center justify-center">
            {isDictating && (
              <>
                <span className="absolute inset-0 rounded-full bg-blue-500/45 animate-ping" />
                <span className="absolute -inset-2 rounded-full bg-blue-400/25 animate-pulse" />
              </>
            )}
            <button
              type="button"
              onClick={handleToggleBottomMic}
              title={
                isDictating
                  ? 'Stop Dictation (keeps controls open)'
                  : 'Resume Dictation from where you left off'
              }
              aria-label={isDictating ? 'Stop Dictation' : 'Resume Dictation'}
              className={`relative flex items-center gap-2.5 px-5 py-3.5 rounded-full font-semibold text-sm shadow-2xl border transition-all cursor-pointer active:scale-95 ${
                isDictating
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-400 shadow-blue-500/50 ring-4 ring-blue-500/30 animate-pulse'
                  : 'bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 border-blue-500 shadow-blue-500/20 ring-2 ring-blue-500/25'
              }`}
            >
              {isDictating ? (
                <Mic className="w-5 h-5 text-white shrink-0" />
              ) : (
                <MicOff className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <span>
                {isDictating ? 'Listening (English) • Tap to Stop' : 'Dictation Stopped • Tap Mic to Continue'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 5.5 BOTTOM ON-SCREEN KEYBOARD FOR TEXT BOXES & GRID DIMENSIONS */}
      {!isViewerTab && (editingDictateBoxId !== null || editingGridDims !== null) && (
        <OnScreenKeyboard
          headerTitle={
            editingGridDims
              ? `Grid ${editingGridDims.field === 'cols' ? 'Columns (X)' : 'Rows (Y)'} · On-Screen Keypad`
              : undefined
          }
          onKeyAction={handleVirtualKeyAction}
          onSwitchToDictate={
            editingDictateBoxId !== null
              ? () => {
                  const boxId = editingDictateBoxId;
                  setEditingDictateBoxId(null);
                  if (boxId) {
                    handleResumeDictateBox(boxId);
                  }
                }
              : undefined
          }
          onClose={() => {
            if (editingGridDims) handleStopEditGridDims();
            if (editingDictateBoxId) handleStopManualEditDictateBox();
          }}
        />
      )}

      {/* 6. NON-BLOCKING FILE STATUS TOAST */}
      {appStatusNotice && (
        <div
          className={`fixed ${
            editingDictateBoxId !== null || editingGridDims !== null
              ? 'top-20'
              : isBottomMicVisible
              ? 'bottom-24'
              : 'bottom-4'
          } left-1/2 -translate-x-1/2 z-[10006] flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl border text-xs font-medium max-w-md animate-in fade-in slide-in-from-bottom-2 duration-150 ${
            appStatusNotice.kind === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/95 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : appStatusNotice.kind === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/95 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
          }`}
        >
          {appStatusNotice.kind === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : appStatusNotice.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-blue-600" />
          )}
          <span className="truncate">{appStatusNotice.message}</span>
          <button
            type="button"
            onClick={() => setAppStatusNotice(null)}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 7. FIRST-LAUNCH INTERACTIVE TUTORIAL & TOP-RIGHT CREATOR INFO DIALOG */}
      {!isViewerTab && (
        <>
          <OnboardingTutorialModal
            stage={tutorialStage}
            stepIndex={tutorialStepIndex}
            onStartTour={handleStartTutorial}
            onLater={handleLaterTutorial}
            onStepChange={handleChangeTutorialStep}
            onSkipTour={handleSkipTutorial}
            onCompleteWithAnimation={handleCompleteTutorialWithAnimation}
            onAnimationEnd={handleTutorialAnimationEnd}
          />
          <CreatorInfoDialog
            isOpen={isCreatorInfoOpen}
            onClose={() => setIsCreatorInfoOpen(false)}
            onReplayTutorial={handleStartTutorial}
          />
        </>
      )}
    </div>
  );
}
