/**
 * Offline Support Utilities
 * IndexedDB sync queue, connection status, data caching
 */

const DB_NAME = 'villageclaq-offline';
const DB_VERSION = 1;
const SYNC_STORE = 'sync-queue';
const CACHE_STORE = 'cached-data';

export type SyncAction = {
  id: string;
  type: 'record_payment' | 'mark_attendance' | 'rsvp_event' | 'update_profile';
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
};

export type ConnectionStatus = 'online' | 'pending' | 'offline';

// ==================== IndexedDB ====================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToSyncQueue(action: Omit<SyncAction, 'id' | 'createdAt' | 'retries'>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  tx.objectStore(SYNC_STORE).add({
    ...action,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    retries: 0,
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });

  // Request background sync if available
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // Background Sync API — not yet in all TS type defs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (reg as any).sync?.register('villageclaq-sync');
    } catch {
      // Background sync not supported — will sync on next online event
    }
  }
}

export async function getSyncQueue(): Promise<SyncAction[]> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readonly');
  const store = tx.objectStore(SYNC_STORE);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeSyncAction(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  tx.objectStore(SYNC_STORE).delete(id);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  tx.objectStore(SYNC_STORE).clear();
}

// ==================== Data Caching ====================

export async function cacheData(key: string, data: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CACHE_STORE, 'readwrite');
  tx.objectStore(CACHE_STORE).put({ key, data, cachedAt: new Date().toISOString() });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const db = await openDB();
  const tx = db.transaction(CACHE_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const request = tx.objectStore(CACHE_STORE).get(key);
    request.onsuccess = () => resolve(request.result?.data ?? null);
    request.onerror = () => reject(request.error);
  });
}

// ==================== Connection Monitor ====================

export function getConnectionStatus(pendingCount: number): ConnectionStatus {
  if (!navigator.onLine) return 'offline';
  if (pendingCount > 0) return 'pending';
  return 'online';
}

// ==================== Service Worker Registration ====================

export async function registerServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      void registration; // SW registered successfully
    } catch (error) {
      console.error('[SW] Registration failed:', error);
    }
  }
}

// ==================== Data Saver Mode ====================

export function isDataSaverEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('villageclaq-data-saver') === 'true';
}

export function toggleDataSaver(enabled: boolean): void {
  localStorage.setItem('villageclaq-data-saver', String(enabled));
}

export async function compressImage(file: File, maxSizeKB = 200): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (blob && (blob.size / 1024 <= maxSizeKB || quality <= 0.1)) {
              resolve(blob);
            } else {
              quality -= 0.1;
              tryCompress();
            }
          },
          'image/webp',
          quality
        );
      };
      tryCompress();
    };
    img.src = URL.createObjectURL(file);
  });
}
