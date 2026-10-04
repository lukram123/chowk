import { config } from '../config';
import type { Backend } from './types';

/** Loads only the backend in use, so the demo data never ships to a configured build's first load. */
export async function loadBackend(): Promise<Backend | null> {
  if (config.backend === 'demo') {
    const { createDemoBackend } = await import('./demo');
    return createDemoBackend();
  }
  if (config.backend === 'firebase' && config.firebase) {
    const { createFirebaseBackend } = await import('./firebase');
    return createFirebaseBackend(config.firebase, config.functionsRegion);
  }
  return null;
}
