import { config } from '../config';
import type { ShopBackend } from './types';

export async function loadShopBackend(): Promise<ShopBackend | null> {
  if (config.backend === 'demo') {
    const { createDemoShopBackend } = await import('./demo');
    return createDemoShopBackend();
  }
  if (config.backend === 'firebase' && config.firebase) {
    const { createFirebaseShopBackend } = await import('./firebase');
    return createFirebaseShopBackend(config.firebase, config.functionsRegion);
  }
  return null;
}
