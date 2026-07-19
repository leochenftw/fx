const DB_NAME = 'FxSovereignDB';
const DB_VERSION = 3;
const STORE_NAME = 'imported_transactions';
const ENTITY_LIST_STORE = 'entity_list';
const ENTITY_VERSION_STORE = 'entity_version';

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ENTITY_LIST_STORE)) {
        db.createObjectStore(ENTITY_LIST_STORE, { keyPath: 'org_id' });
      }
      if (!db.objectStoreNames.contains(ENTITY_VERSION_STORE)) {
        db.createObjectStore(ENTITY_VERSION_STORE, { keyPath: 'org_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gets the locally cached entity category mapping dictionary for an organisation.
 */
export async function getLocalEntityMap(orgId: string): Promise<Record<string, string>> {
  const db = await openDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(ENTITY_LIST_STORE, 'readonly');
      const store = transaction.objectStore(ENTITY_LIST_STORE);
      const request = store.get(orgId);

      request.onsuccess = () => {
        if (request.result && request.result.mapping) {
          resolve(request.result.mapping);
        } else {
          resolve({});
        }
      };
      request.onerror = () => {
        resolve({});
      };
    } catch (e) {
      resolve({});
    }
  });
}

/**
 * Gets the locally cached version string for an organisation.
 * If not found, falls back to generating a fresh timestamp version.
 */
export async function getLocalEntityVersion(orgId: string): Promise<string> {
  const db = await openDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(ENTITY_VERSION_STORE, 'readonly');
      const store = transaction.objectStore(ENTITY_VERSION_STORE);
      const request = store.get(orgId);

      request.onsuccess = () => {
        if (request.result && request.result.version) {
          resolve(request.result.version);
        } else {
          resolve('');
        }
      };
      request.onerror = () => {
        resolve('');
      };
    } catch (e) {
      resolve('');
    }
  });
}

/**
 * Saves both the entity category mapping and the version string to the local database.
 */
export async function saveLocalEntityMap(
  orgId: string,
  version: string,
  mapping: Record<string, string>
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([ENTITY_LIST_STORE, ENTITY_VERSION_STORE], 'readwrite');
      const listStore = transaction.objectStore(ENTITY_LIST_STORE);
      const versionStore = transaction.objectStore(ENTITY_VERSION_STORE);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      listStore.put({ org_id: orgId, mapping });
      versionStore.put({ org_id: orgId, version });
    } catch (e) {
      reject(e);
    }
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
