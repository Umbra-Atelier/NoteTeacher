import {
  CalculatorBox,
  CameraViewportState,
  CanvasImage,
  CanvasStroke,
  ControlsVisibility,
  DesmosBox,
  DictatedTextBox,
  GeometricShape,
  LiveCanvasOverlay,
  LivePresenterToolState,
  PageData,
  PdfImageElement,
  PdfTextElement,
  PresenterMode,
} from '../types';

export interface LivestreamDocumentState {
  pages: PageData[];
  currentPageId: string;
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images: CanvasImage[];
  dictatedTextBoxes?: DictatedTextBox[];
  pdfTextElements?: PdfTextElement[];
  pdfImageElements?: PdfImageElement[];
  presenterMode: PresenterMode;
  controlsVisibility: ControlsVisibility;
  isDarkMode: boolean;
  cameraView: CameraViewportState;
  updatedAt?: number;
  assetsOmitted?: boolean;
}

export type LivestreamMessage =
  | { type: 'request_state'; includeAssets?: boolean }
  | { type: 'sync_state'; payload: LivestreamDocumentState }
  | { type: 'sync_camera'; payload: CameraViewportState }
  | { type: 'sync_live_overlay'; payload: LiveCanvasOverlay | null }
  | { type: 'sync_presenter_overlay'; payload: LivePresenterToolState | null };

export const SYNC_CHANNEL_NAME = 'noteteacher_sync';
const IDB_NAME = 'noteteacher_livestream_db';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'latest';
const LS_BACKUP_KEY = 'noteteacher_sync_backup';

function openLivestreamDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveLivestreamSnapshotToDb(
  state: LivestreamDocumentState
): Promise<void> {
  const db = await openLivestreamDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ ...state, assetsOmitted: false, updatedAt: Date.now() }, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadLivestreamSnapshotFromDb(): Promise<LivestreamDocumentState | null> {
  const db = await openLivestreamDb();
  if (db) {
    const idbData = await new Promise<LivestreamDocumentState | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(IDB_KEY);
        req.onsuccess = () => resolve((req.result as LivestreamDocumentState) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (idbData) return idbData;
  }

  try {
    const saved = localStorage.getItem(LS_BACKUP_KEY);
    if (saved) {
      return JSON.parse(saved) as LivestreamDocumentState;
    }
  } catch {}
  return null;
}

export function postSyncMessageSafe(
  channel: BroadcastChannel | null,
  msg: LivestreamMessage
): boolean {
  if (!channel) return false;
  try {
    channel.postMessage(msg);
    return true;
  } catch {
    try {
      channel.postMessage(JSON.parse(JSON.stringify(msg)));
      return true;
    } catch {
      return false;
    }
  }
}

export function saveSmallLocalStorageBackup(state: LivestreamDocumentState): void {
  try {
    const serialized = JSON.stringify(state);
    if (serialized.length < 2_500_000) {
      localStorage.setItem(LS_BACKUP_KEY, serialized);
    }
  } catch {
    // Ignore localStorage quota limits; BroadcastChannel and IndexedDB carry full state
  }
}

export function computeAssetsSignature(
  pages: PageData[],
  images: CanvasImage[],
  pdfImageElements: PdfImageElement[] = []
): string {
  const pSig = pages
    .map((p) => `${p.id}:${p.template}:${p.pdfDataUrl ? p.pdfDataUrl.length : 0}`)
    .join('|');
  const iSig = images
    .map((img) => `${img.id}:${img.dataUrl ? img.dataUrl.length : 0}`)
    .join('|');
  const piSig = pdfImageElements
    .map((img) => `${img.id}:${img.dataUrl ? img.dataUrl.length : 0}`)
    .join('|');
  return `${pSig}##${iSig}##${piSig}`;
}

/**
 * Strips heavy base64 strings from high-frequency stroke/widget delta messages
 * so large multi-page PDFs never bog down 60fps livestreaming once assets are synced.
 */
export function buildCompactSyncPayload(
  state: LivestreamDocumentState
): LivestreamDocumentState {
  return {
    ...state,
    assetsOmitted: true,
    pages: state.pages.map((p) => ({
      ...p,
      pdfDataUrl: p.pdfDataUrl ? '__CACHED__' : undefined,
    })),
    images: state.images.map((img) => ({
      ...img,
      dataUrl: img.dataUrl ? '__CACHED__' : '',
    })),
    pdfImageElements: state.pdfImageElements?.map((img) => ({
      ...img,
      dataUrl: img.dataUrl ? '__CACHED__' : '',
    })),
  };
}

/**
 * Merges incoming state (full or compact) with any already-hydrated local PDF/image URLs.
 * Reports missing asset IDs if the viewer needs the teacher to resend full assets.
 */
export function mergeIncomingLivestreamState(
  incoming: LivestreamDocumentState,
  prevPages: PageData[],
  prevImages: CanvasImage[],
  prevPdfImages: PdfImageElement[] = []
): {
  mergedPages: PageData[];
  mergedImages: CanvasImage[];
  mergedPdfImages: PdfImageElement[];
  missingAssets: boolean;
} {
  let missingAssets = false;
  const prevPageMap = new Map(prevPages.map((p) => [p.id, p]));
  const prevImgMap = new Map(prevImages.map((img) => [img.id, img]));
  const prevPdfImgMap = new Map(prevPdfImages.map((img) => [img.id, img]));

  const mergedPages = (incoming.pages || []).map((p) => {
    if (p.pdfDataUrl === '__CACHED__') {
      const existing = prevPageMap.get(p.id);
      if (existing?.pdfDataUrl && existing.pdfDataUrl !== '__CACHED__') {
        return { ...p, pdfDataUrl: existing.pdfDataUrl };
      }
      missingAssets = true;
      return { ...p, pdfDataUrl: undefined };
    }
    return p;
  });

  const mergedImages = (incoming.images || []).map((img) => {
    if (img.dataUrl === '__CACHED__') {
      const existing = prevImgMap.get(img.id);
      if (existing?.dataUrl && existing.dataUrl !== '__CACHED__') {
        return { ...img, dataUrl: existing.dataUrl };
      }
      missingAssets = true;
      return { ...img, dataUrl: '' };
    }
    return img;
  });

  const mergedPdfImages = (incoming.pdfImageElements || []).map((img) => {
    if (img.dataUrl === '__CACHED__') {
      const existing = prevPdfImgMap.get(img.id);
      if (existing?.dataUrl && existing.dataUrl !== '__CACHED__') {
        return { ...img, dataUrl: existing.dataUrl };
      }
      missingAssets = true;
      return { ...img, dataUrl: '' };
    }
    return img;
  });

  return { mergedPages, mergedImages, mergedPdfImages, missingAssets };
}
