import { ScreenDevice } from '../types';

export const FALLBACK_SCREENS: ScreenDevice[] = [];

/**
 * Request Screen Details permission via Window Management API if supported,
 * otherwise return empty screen list with no permission (no fake screens).
 */
export async function detectConnectedScreens(): Promise<{
  screens: ScreenDevice[];
  hasPermission: boolean;
}> {
  // Check if Window Management API is supported
  if (typeof window !== 'undefined' && 'getScreenDetails' in window) {
    try {
      // @ts-expect-error - Window Management API
      const screenDetails = await window.getScreenDetails();
      if (screenDetails && screenDetails.screens && screenDetails.screens.length > 0) {
        // @ts-expect-error - Screen item
        const mapped: ScreenDevice[] = screenDetails.screens.map((s, index: number) => ({
          id: `screen-${index}`,
          name: s.label || (s.isPrimary ? 'Primary Display (This Screen)' : `External Display / Projector ${index}`),
          isPrimary: s.isPrimary,
          resolution: `${s.width} × ${s.height}`,
        }));
        return { screens: mapped, hasPermission: true };
      }
    } catch (err) {
      console.warn('Window Management permission denied or dismissed:', err);
      return { screens: [], hasPermission: false };
    }
  }

  return { screens: [], hasPermission: false };
}
