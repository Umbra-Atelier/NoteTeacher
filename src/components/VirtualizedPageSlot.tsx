import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AngleNegativeDirection,
  AppMode,
  CalculatorBox,
  CanvasImage,
  CanvasStroke,
  DesmosBox,
  DictatedTextBox,
  DictateSubMode,
  EraserType,
  GeometricShape,
  GrabbedSelection,
  LiveCanvasOverlay,
  LivePresenterToolState,
  MagicGrabMode,
  PageData,
  PenType,
  PresenterMode,
  ShapeType,
  StylusDetectionConfig,
  TouchInputMode,
} from '../types';
import { CanvasStage } from './CanvasStage';
import {
  getCachedPagePreviewSync,
  renderLowResPageCompositePreview,
} from '../utils/pagePreviewRenderer';
import { releasePagePdfResources } from '../utils/pdfPageCache';
import { captureAllMountedWidgets } from '../utils/widgetSnapshotCache';

interface VirtualizedPageSlotProps {
  page: PageData;
  pageIndex: number;
  isVisibleInViewport: boolean;
  isActivePage: boolean;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  onRegisterPageElement: (pageId: string, el: HTMLDivElement | null) => void;
  onActivatePage: (pageId: string) => void;
  regularWidthPx?: number;
  povScale?: number;
  isFullPovMode?: boolean;

  // Shared workspace state & tool props
  mode: AppMode;
  touchInputMode: TouchInputMode;
  stylusConfig: StylusDetectionConfig;
  penType: PenType;
  strokeWidth: number;
  currentColor: string;
  shapeType: ShapeType;
  shapeStrokeWidth: number;
  shapeStyle: 'solid' | 'dashed' | 'dotted';
  shapeFill: boolean;
  shapeFillOpacity?: number;
  angleUnit: 'deg' | 'rad';
  angleNegativeDirection: AngleNegativeDirection;
  allowNegativeAngles: boolean;
  eraserType: EraserType;
  eraserSize: number;
  isMagicGrabActive: boolean;
  magicGrabMode: MagicGrabMode;
  keepEmptyBox: boolean;
  isPictureCopyActive: boolean;
  presenterMode: PresenterMode;
  activeSelectionProp: GrabbedSelection | null;
  isGeometricEraserActive?: boolean;
  isDictateEraserActive?: boolean;
  dictateSubMode?: DictateSubMode;
  constantDictateFontSize?: number;
  dictatedTextBoxes?: DictatedTextBox[];
  activeDictateBoxId?: string | null;
  selectedDictateBoxId?: string | null;
  editingDictateBoxId?: string | null;
  isDictating?: boolean;
  editingGridDims?: { shapeId: string; field: 'cols' | 'rows'; draft: string } | null;

  // Document or pre-grouped per-page element collections
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images: CanvasImage[];

  // Callbacks
  onViewportChange: (zoomScale: number, panOffset: { x: number; y: number }) => void;
  onLiveOverlayChange: (overlay: LiveCanvasOverlay | null) => void;
  onPresenterStateChange: (state: LivePresenterToolState) => void;
  onSetPictureCopyActive: (active: boolean) => void;
  onSelectionChange: (sel: {
    strokeIds: string[];
    shapeIds: string[];
    graphIds: string[];
    calcIds: string[];
    imageIds: string[];
    dictateIds?: string[];
  }) => void;
  onClosePresenter: () => void;
  onAddDictatedTextBox?: (box: DictatedTextBox) => void;
  onUpdateDictatedTextBox?: (id: string, updated: Partial<DictatedTextBox>) => void;
  onDeleteDictatedTextBox?: (id: string) => void;
  onSelectDictateBoxForTransform?: (id: string) => void;
  onResumeDictateBox?: (id: string) => void;
  onStartManualEditDictateBox?: (id: string) => void;
  onStopManualEditDictateBox?: () => void;
  onClickOutsideDictateBox?: () => void;
  onDeselectDictateBox?: () => void;
  onStartEditGridDims?: (shapeId: string, field: 'cols' | 'rows') => void;
  onChangeGridDimsDraft?: (shapeId: string, field: 'cols' | 'rows', draft: string) => void;
  onStopEditGridDims?: () => void;
  onAddStroke: (stroke: CanvasStroke) => void;
  onAddShape: (shape: GeometricShape) => void;
  onUpdateShape: (id: string, updated: Partial<GeometricShape>) => void;
  onDeleteShape: (id: string) => void;
  onAddGraph: (graph: DesmosBox) => void;
  onAddCalculator: (calc: CalculatorBox) => void;
  onAddImage: (img: CanvasImage) => void;
  onUpdateGraph: (id: string, updated: Partial<DesmosBox>) => void;
  onDeleteGraph: (id: string) => void;
  onUpdateCalculator: (id: string, updated: Partial<CalculatorBox>) => void;
  onDeleteCalculator: (id: string) => void;
  onUpdateImage: (id: string, updated: Partial<CanvasImage>) => void;
  onDeleteImage: (id: string) => void;
  onGhostItems: (strokeIds: string[], shapeIds: string[], dictateIds?: string[]) => void;
  onCircleEraseSweep: (
    pageId: string,
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
  onTransformEnd: () => void;
  onColorUsed: (hex: string) => void;
}

const STAGE_MOUNT_DELAY_MS = 40;

const VirtualizedPageSlotInner: React.FC<VirtualizedPageSlotProps> = ({
  page,
  isVisibleInViewport,
  isActivePage,
  scrollContainerRef,
  onRegisterPageElement,
  onActivatePage,
  regularWidthPx,
  povScale = 1,
  isFullPovMode = false,
  mode,
  touchInputMode,
  stylusConfig,
  penType,
  strokeWidth,
  currentColor,
  shapeType,
  shapeStrokeWidth,
  shapeStyle,
  shapeFill,
  shapeFillOpacity = 25,
  angleUnit,
  angleNegativeDirection,
  allowNegativeAngles,
  eraserType,
  eraserSize,
  isMagicGrabActive,
  magicGrabMode,
  keepEmptyBox,
  isPictureCopyActive,
  presenterMode,
  activeSelectionProp,
  isGeometricEraserActive = false,
  isDictateEraserActive = false,
  dictateSubMode = 'height',
  constantDictateFontSize = 24,
  dictatedTextBoxes = [],
  activeDictateBoxId = null,
  selectedDictateBoxId = null,
  editingDictateBoxId = null,
  isDictating = false,
  editingGridDims = null,
  strokes,
  shapes,
  graphs,
  calculators,
  images,
  onViewportChange,
  onLiveOverlayChange,
  onPresenterStateChange,
  onSetPictureCopyActive,
  onSelectionChange,
  onClosePresenter,
  onAddDictatedTextBox,
  onUpdateDictatedTextBox,
  onDeleteDictatedTextBox,
  onSelectDictateBoxForTransform,
  onResumeDictateBox,
  onStartManualEditDictateBox,
  onStopManualEditDictateBox,
  onClickOutsideDictateBox,
  onDeselectDictateBox,
  onStartEditGridDims,
  onChangeGridDimsDraft,
  onStopEditGridDims,
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
  const pageAspect =
    page.aspectRatio && page.aspectRatio > 0
      ? page.aspectRatio
      : page.pdfWidth && page.pdfHeight && page.pdfHeight > 0
      ? page.pdfWidth / page.pdfHeight
      : 8.5 / 11;

  const pageStrokes = useMemo(
    () => (strokes.length === 0 ? strokes : strokes.filter((s) => s.pageId === page.id)),
    [strokes, page.id]
  );
  const pageShapes = useMemo(
    () => (shapes.length === 0 ? shapes : shapes.filter((sh) => sh.pageId === page.id)),
    [shapes, page.id]
  );
  const pageGraphs = useMemo(
    () => (graphs.length === 0 ? graphs : graphs.filter((g) => g.pageId === page.id)),
    [graphs, page.id]
  );
  const pageCalculators = useMemo(
    () =>
      calculators.length === 0
        ? calculators
        : calculators.filter((c) => c.pageId === page.id),
    [calculators, page.id]
  );
  const pageImages = useMemo(
    () => (images.length === 0 ? images : images.filter((img) => img.pageId === page.id)),
    [images, page.id]
  );
  const pageDictatedTextBoxes = useMemo(
    () =>
      dictatedTextBoxes.length === 0
        ? dictatedTextBoxes
        : dictatedTextBoxes.filter((b) => b.pageId === page.id),
    [dictatedTextBoxes, page.id]
  );

  const hasPageAnnotations =
    pageStrokes.length > 0 ||
    pageShapes.length > 0 ||
    pageGraphs.length > 0 ||
    pageCalculators.length > 0 ||
    pageImages.length > 0 ||
    pageDictatedTextBoxes.length > 0;

  // Progressive blurry-to-crisp lifecycle:
  // When entering viewport, wait briefly (40ms) before mounting heavy CanvasStage so ultra-fast
  // flicks across dozens of pages don't block the main thread; briefly viewed pages start loading
  // right away and cancel gracefully the instant they leave the viewport.
  const [shouldMountStage, setShouldMountStage] = useState<boolean>(
    () => Boolean(isVisibleInViewport && isActivePage)
  );
  const [stageReady, setStageReady] = useState<boolean>(
    () => Boolean(isVisibleInViewport && isActivePage)
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    () =>
      getCachedPagePreviewSync(page.id) ||
      (page.template === 'pdf'
        ? page.previewDataUrl ||
          (page.pdfDataUrl && page.pdfDataUrl !== '__CACHED__' ? page.pdfDataUrl : null)
        : null)
  );

  const settleTimerRef = useRef<number | null>(null);
  const readyRafRef = useRef<number | null>(null);
  const hasMountedOnceRef = useRef<boolean>(Boolean(isVisibleInViewport && isActivePage));

  useEffect(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (readyRafRef.current !== null) {
      cancelAnimationFrame(readyRafRef.current);
      readyRafRef.current = null;
    }

    if (!isVisibleInViewport) {
      setStageReady(false);
      setShouldMountStage(false);
      releasePagePdfResources(page.id);
      return;
    }

    if (shouldMountStage) {
      hasMountedOnceRef.current = true;
      readyRafRef.current = requestAnimationFrame(() => {
        readyRafRef.current = null;
        setStageReady(true);
      });
      return;
    }

    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      hasMountedOnceRef.current = true;
      setShouldMountStage(true);
    }, STAGE_MOUNT_DELAY_MS);

    return () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (readyRafRef.current !== null) {
        cancelAnimationFrame(readyRafRef.current);
        readyRafRef.current = null;
      }
    };
  }, [isVisibleInViewport, shouldMountStage, page.id]);

  // Ensure any active loads are cancelled cleanly if slot itself unmounts
  useEffect(() => {
    return () => {
      releasePagePdfResources(page.id);
    };
  }, [page.id]);

  // Only generate low-res composite previews when needed (pages with annotations or already-visited
  // pages), avoiding a 100-page offscreen canvas encode storm on initial document load.
  useEffect(() => {
    if (!hasPageAnnotations) {
      if (page.template === 'pdf') {
        const directPreview =
          page.previewDataUrl ||
          (page.pdfDataUrl && page.pdfDataUrl !== '__CACHED__' ? page.pdfDataUrl : null);
        if (directPreview) {
          setPreviewUrl((prev) => (prev === directPreview ? prev : directPreview));
        }
        return;
      }
      if (!isVisibleInViewport && !hasMountedOnceRef.current) {
        return;
      }
    }

    let cancelled = false;
    const delay = isVisibleInViewport ? 380 : 50;

    const timer = window.setTimeout(() => {
      void renderLowResPageCompositePreview(
        page,
        pageStrokes,
        pageShapes,
        pageGraphs,
        pageCalculators,
        pageImages,
        pageDictatedTextBoxes
      ).then((url) => {
        if (!cancelled && url) {
          setPreviewUrl((prev) => (prev === url ? prev : url));
        }
      });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isVisibleInViewport,
    hasPageAnnotations,
    page,
    pageStrokes,
    pageShapes,
    pageGraphs,
    pageCalculators,
    pageImages,
    pageDictatedTextBoxes,
  ]);

  // Periodically snapshot live Desmos / Calculator DOM states while this slot is mounted
  // so scrolling away leaves accurate widget previews on the blurry off-screen placeholder.
  useEffect(() => {
    if (!isVisibleInViewport || !shouldMountStage || !stageReady) return;
    if (pageGraphs.length === 0 && pageCalculators.length === 0) return;

    const timer = window.setTimeout(() => {
      void captureAllMountedWidgets();
    }, 750);

    return () => window.clearTimeout(timer);
  }, [
    isVisibleInViewport,
    shouldMountStage,
    stageReady,
    pageGraphs,
    pageCalculators,
  ]);

  const slotRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      onRegisterPageElement(page.id, el);
    },
    [onRegisterPageElement, page.id]
  );

  const handleActivateThisPage = useCallback(() => {
    onActivatePage(page.id);
  }, [onActivatePage, page.id]);

  const handleCircleEraseForPage = useCallback(
    (from: { x: number; y: number } | null, to: { x: number; y: number }, radius: number) =>
      onCircleEraseSweep(page.id, from, to, radius),
    [onCircleEraseSweep, page.id]
  );

  const hasExplicitDimensions = typeof regularWidthPx === 'number' && regularWidthPx > 0;
  const innerWidthPx = hasExplicitDimensions ? regularWidthPx : 0;
  const innerHeightPx = hasExplicitDimensions ? regularWidthPx / pageAspect : 0;

  return (
    <div
      id={isActivePage ? 'document-sheet' : undefined}
      data-page-id={page.id}
      ref={slotRefCallback}
      onPointerDownCapture={() => {
        if (!isActivePage) {
          onActivatePage(page.id);
        }
      }}
      style={
        hasExplicitDimensions
          ? {
              width: `${innerWidthPx * povScale}px`,
              height: `${innerHeightPx * povScale}px`,
              contain: 'layout style',
            }
          : {
              aspectRatio: `${pageAspect}`,
              maxWidth: `calc((100vh - 110px) * ${pageAspect})`,
              width: '100%',
              height: 'auto',
              contain: 'layout style',
            }
      }
      className={`shrink-0 bg-white dark:bg-slate-900 shadow-2xl border relative overflow-hidden ${
        isFullPovMode ? 'rounded-none border-x-0' : 'rounded-xl'
      } ${
        isActivePage
          ? 'border-slate-300 dark:border-slate-700 ring-1 ring-blue-500/20'
          : 'border-slate-300 dark:border-slate-800'
      }`}
    >
      <div
        style={
          hasExplicitDimensions
            ? {
                width: `${innerWidthPx}px`,
                height: `${innerHeightPx}px`,
                transform: povScale !== 1 ? `scale(${povScale})` : undefined,
                transformOrigin: 'top left',
              }
            : undefined
        }
        className={hasExplicitDimensions ? 'relative overflow-hidden' : 'relative w-full h-full'}
      >
      {/* Persistent Low-Res Blurry Visual Placeholder (reserves exact page space when off-screen & during entry fade) */}
      {(!shouldMountStage || !stageReady) && (
        <div
          aria-hidden={!shouldMountStage ? undefined : true}
          className="absolute inset-0 z-0 overflow-hidden bg-white select-none pointer-events-none flex items-center justify-center"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={page.title || 'Page Placeholder'}
              draggable={false}
              decoding="async"
              className="w-full h-full object-fill select-none pointer-events-none"
              style={{
                filter: 'blur(4px)',
                transform: 'scale(1.03)',
                opacity: 0.96,
              }}
            />
          ) : (
            <div className="w-full h-full bg-slate-50/90" />
          )}
        </div>
      )}

      {/* Heavy Interactive Stage (Mounted ONLY when page intersects viewport) */}
      {isVisibleInViewport && shouldMountStage && (
        <div
          className={`relative z-10 w-full h-full transition-opacity duration-150 ${
            stageReady ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <CanvasStage
            mode={mode}
            isActivePage={isActivePage}
            isVisibleInViewport={isVisibleInViewport}
            isFullPovMode={isFullPovMode}
            touchInputMode={touchInputMode}
            stylusConfig={stylusConfig}
            scrollContainerRef={scrollContainerRef}
            onActivatePage={handleActivateThisPage}
            onViewportChange={onViewportChange}
            onLiveOverlayChange={onLiveOverlayChange}
            onPresenterStateChange={onPresenterStateChange}
            pageId={page.id}
            template={page.template || 'grid'}
            underlayTemplate={page.underlayTemplate || 'blank'}
            povScale={povScale}
            pdfSourceId={page.pdfSourceId}
            pdfPageNumber={page.pdfPageNumber}
            previewDataUrl={page.previewDataUrl}
            pdfDataUrl={page.pdfDataUrl}
            aspectRatio={pageAspect}
            pdfWidth={page.pdfWidth}
            pdfHeight={page.pdfHeight}
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
            isMagicGrabActive={isMagicGrabActive}
            magicGrabMode={magicGrabMode}
            keepEmptyBox={keepEmptyBox}
            isPictureCopyActive={isPictureCopyActive}
            onSetPictureCopyActive={onSetPictureCopyActive}
            onSelectionChange={onSelectionChange}
            activeSelectionProp={isActivePage ? activeSelectionProp : null}
            presenterMode={isActivePage ? presenterMode : 'none'}
            onClosePresenter={onClosePresenter}
            isGeometricEraserActive={isGeometricEraserActive}
            isDictateEraserActive={isDictateEraserActive}
            dictateSubMode={dictateSubMode}
            constantDictateFontSize={constantDictateFontSize}
            dictatedTextBoxes={pageDictatedTextBoxes}
            activeDictateBoxId={activeDictateBoxId}
            selectedDictateBoxId={selectedDictateBoxId}
            editingDictateBoxId={editingDictateBoxId}
            isDictating={isDictating}
            editingGridDims={editingGridDims}
            onStartEditGridDims={onStartEditGridDims}
            onChangeGridDimsDraft={onChangeGridDimsDraft}
            onStopEditGridDims={onStopEditGridDims}
            onAddDictatedTextBox={onAddDictatedTextBox}
            onUpdateDictatedTextBox={onUpdateDictatedTextBox}
            onDeleteDictatedTextBox={onDeleteDictatedTextBox}
            onSelectDictateBoxForTransform={onSelectDictateBoxForTransform}
            onResumeDictateBox={onResumeDictateBox}
            onStartManualEditDictateBox={onStartManualEditDictateBox}
            onStopManualEditDictateBox={onStopManualEditDictateBox}
            onClickOutsideDictateBox={onClickOutsideDictateBox}
            onDeselectDictateBox={onDeselectDictateBox}
            strokes={pageStrokes}
            shapes={pageShapes}
            graphs={pageGraphs}
            calculators={pageCalculators}
            images={pageImages}
            onAddStroke={onAddStroke}
            onAddShape={onAddShape}
            onUpdateShape={onUpdateShape}
            onDeleteShape={onDeleteShape}
            onAddGraph={onAddGraph}
            onAddCalculator={onAddCalculator}
            onAddImage={onAddImage}
            onUpdateGraph={onUpdateGraph}
            onDeleteGraph={onDeleteGraph}
            onUpdateCalculator={onUpdateCalculator}
            onDeleteCalculator={onDeleteCalculator}
            onUpdateImage={onUpdateImage}
            onDeleteImage={onDeleteImage}
            onGhostItems={onGhostItems}
            onCircleEraseSweep={handleCircleEraseForPage}
            onConfirmDeleteGhosted={onConfirmDeleteGhosted}
            onCancelGhosted={onCancelGhosted}
            onTransformItems={onTransformItems}
            onRotateItems={onRotateItems}
            onTransformEnd={onTransformEnd}
            onColorUsed={onColorUsed}
          />
        </div>
      )}
      </div>
    </div>
  );
};

export const VirtualizedPageSlot = React.memo(
  VirtualizedPageSlotInner,
  (prev, next) => {
    // When a slot stays completely off-screen and inactive before and after a render,
    // skip re-rendering unless its page metadata or its own elements changed.
    if (
      !prev.isVisibleInViewport &&
      !next.isVisibleInViewport &&
      !prev.isActivePage &&
      !next.isActivePage
    ) {
      return (
        prev.page === next.page &&
        prev.pageIndex === next.pageIndex &&
        prev.regularWidthPx === next.regularWidthPx &&
        prev.povScale === next.povScale &&
        prev.isFullPovMode === next.isFullPovMode &&
        prev.strokes === next.strokes &&
        prev.shapes === next.shapes &&
        prev.graphs === next.graphs &&
        prev.calculators === next.calculators &&
        prev.images === next.images &&
        prev.dictatedTextBoxes === next.dictatedTextBoxes
      );
    }

    // Standard shallow prop comparison for visible or active slots
    const keys = Object.keys(prev) as (keyof VirtualizedPageSlotProps)[];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!Object.is(prev[k], next[k])) return false;
    }
    return true;
  }
);
