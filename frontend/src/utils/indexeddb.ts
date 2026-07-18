const DB_NAME = 'FxSovereignDB';
const DB_VERSION = 2;
const STORE_NAME = 'imported_transactions';

export interface ImportedFingerprint {
  id: string; // Composite key: `${org_id}#${hash}`
  org_id: string;
  hash: string;
  count: number; // The watermark (total imported count) of this signature
  imported_at: string;
}

/**
 * Opens or initializes the local IndexedDB instance.
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Batch checks which transaction hashes are already imported in the local database.
 * Returns a Map mapping the transaction hash to its saved watermark count.
 */
export async function checkDuplicates(orgId: string, hashes: string[]): Promise<Map<string, number>> {
  const db = await openDB();
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const watermarks = new Map<string, number>();

    const uniqueHashes = Array.from(new Set(hashes));
    if (uniqueHashes.length === 0) {
      resolve(watermarks);
      return;
    }

    let completedCount = 0;
    for (const hash of uniqueHashes) {
      const key = `${orgId}#${hash}`;
      const request = store.get(key);
      
      request.onsuccess = () => {
        if (request.result) {
          watermarks.set(hash, request.result.count || 0);
        } else {
          watermarks.set(hash, 0);
        }
        completedCount++;
        if (completedCount === uniqueHashes.length) resolve(watermarks);
      };
      
      request.onerror = () => {
        watermarks.set(hash, 0);
        completedCount++;
        if (completedCount === uniqueHashes.length) resolve(watermarks);
      };
    }
  });
}

/**
 * Batch saves successfully imported transaction fingerprints in the local database.
 * Accumulates watermarks for matching signatures.
 */
export async function saveFingerprints(orgId: string, importedHashes: string[]): Promise<void> {
  const db = await openDB();
  
  // Count how many times each hash appears in the current imported batch
  const currentBatchCounts = new Map<string, number>();
  for (const hash of importedHashes) {
    currentBatchCounts.set(hash, (currentBatchCounts.get(hash) || 0) + 1);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    const hashList = Array.from(currentBatchCounts.keys());
    if (hashList.length === 0) {
      resolve();
      return;
    }

    let processed = 0;
    for (const hash of hashList) {
      const key = `${orgId}#${hash}`;
      const getRequest = store.get(key);

      getRequest.onsuccess = () => {
        const addedCount = currentBatchCounts.get(hash) || 0;
        const existingCount = getRequest.result ? (getRequest.result.count || 0) : 0;
        
        store.put({
          id: key,
          org_id: orgId,
          hash,
          count: existingCount + addedCount, // Accumulate watermarks
          imported_at: now
        });

        processed++;
        if (processed === hashList.length) {
          // All puts dispatched; wait for transaction oncomplete
        }
      };

      getRequest.onerror = () => {
        reject(getRequest.error || new Error(`Failed to read fingerprint: ${hash}`));
      };
    }
  });
}

/**
 * Generates an idempotent, cryptographic SHA-256 hash based on stable raw transaction strings.
 */
export async function calculateTransactionHash(rawString: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(rawString.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Debug helper: logs all fingerprints saved in local IndexedDB.
 */
export async function logAllFingerprints(): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();
  request.onsuccess = () => {
    console.log('[IndexedDB DEBUG] Fingerprints in store:', request.result);
  };
  request.onerror = () => {
    console.error('[IndexedDB DEBUG] Failed to list fingerprints:', request.error);
  };
}
