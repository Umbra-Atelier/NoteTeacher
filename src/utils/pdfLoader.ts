import { PageData } from '../types';
import { registerPdfDocumentSource } from './pdfPageCache';

/**
 * Loads a PDF or image file lazily, generating only lightweight low-resolution blurry
 * previews and exact page geometry upfront so off-screen pages stay unloaded until viewed.
 */
export async function loadPdfPages(file: File): Promise<PageData[]> {
  return registerPdfDocumentSource(file);
}

