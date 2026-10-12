/**
 * Recording Recovery Service
 * Crash-proof chunk buffering and session restoration using native IndexedDB.
 * Protects creators against accidental tab refreshes, navigation, or browser crashes.
 */

export interface SessionMetadata {
  id: string;
  startedAt: number;
  updatedAt: number;
  durationSeconds: number;
  mimeType: string;
  layoutMode: string;
  templateId?: string;
  chunkCount: number;
  totalBytes: number;
  completed: boolean;
}

const DB_NAME = 'clipdesk_recovery_v1';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const CHUNKS_STORE = 'chunks';

class RecordingRecoveryService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private currentSessionId: string | null = null;
  private chunkIndex = 0;
  private totalBytes = 0;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          const store = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' });
          store.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Initializes a new recording recovery session before recording begins.
   */
  public async startSession(
    sessionId: string,
    metadata: {
      mimeType: string;
      layoutMode: string;
      templateId?: string;
    }
  ): Promise<void> {
    this.currentSessionId = sessionId;
    this.chunkIndex = 0;
    this.totalBytes = 0;

    const db = await this.getDB();
    const tx = db.transaction([SESSIONS_STORE], 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);

    const record: SessionMetadata = {
      id: sessionId,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      durationSeconds: 0,
      mimeType: metadata.mimeType,
      layoutMode: metadata.layoutMode,
      templateId: metadata.templateId,
      chunkCount: 0,
      totalBytes: 0,
      completed: false
    };

    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Appends an in-flight video/audio chunk to IndexedDB as it arrives from MediaRecorder.
   */
  public async saveChunk(chunk: Blob): Promise<void> {
    if (!this.currentSessionId || chunk.size === 0) return;

    const sessionId = this.currentSessionId;
    const index = this.chunkIndex++;
    this.totalBytes += chunk.size;

    const db = await this.getDB();
    const tx = db.transaction([CHUNKS_STORE, SESSIONS_STORE], 'readwrite');

    const chunksStore = tx.objectStore(CHUNKS_STORE);
    chunksStore.put({
      id: `${sessionId}_${index.toString().padStart(6, '0')}`,
      sessionId,
      index,
      data: chunk,
      size: chunk.size,
      timestamp: Date.now()
    });

    const sessionsStore = tx.objectStore(SESSIONS_STORE);
    const getReq = sessionsStore.get(sessionId);
    getReq.onsuccess = () => {
      const session = getReq.result as SessionMetadata | undefined;
      if (session) {
        session.chunkCount = index + 1;
        session.totalBytes = this.totalBytes;
        session.updatedAt = Date.now();
        sessionsStore.put(session);
      }
    };

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Non-blocking failure tolerance
    });
  }

  /**
   * Finalizes the current session upon successful recording completion.
   */
  public async finalizeSession(durationSeconds: number): Promise<void> {
    if (!this.currentSessionId) return;

    const sessionId = this.currentSessionId;
    const db = await this.getDB();
    const tx = db.transaction([SESSIONS_STORE], 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);

    return new Promise((resolve) => {
      const getReq = store.get(sessionId);
      getReq.onsuccess = () => {
        const session = getReq.result as SessionMetadata | undefined;
        if (session) {
          session.durationSeconds = durationSeconds;
          session.updatedAt = Date.now();
          session.completed = true;
          store.put(session);
        }
        resolve();
      };
      getReq.onerror = () => resolve();
    });
  }

  /**
   * Inspects IndexedDB for un-exported or interrupted recording sessions from previous tab crashes/reloads.
   */
  public async getRecoverableSession(): Promise<{ metadata: SessionMetadata; blob: Blob } | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([SESSIONS_STORE, CHUNKS_STORE], 'readonly');
      const sessionsStore = tx.objectStore(SESSIONS_STORE);

      const sessions: SessionMetadata[] = await new Promise((resolve, reject) => {
        const req = sessionsStore.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      // Find the most recent session with recorded bytes (within last 48 hours)
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      const candidates = sessions
        .filter((s) => s.totalBytes > 10000 && s.updatedAt > cutoff)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (candidates.length === 0) return null;
      const targetSession = candidates[0];

      // Reassemble chunks
      const chunksStore = tx.objectStore(CHUNKS_STORE);
      const index = chunksStore.index('sessionId');
      const chunksData: Array<{ index: number; data: Blob }> = await new Promise((resolve, reject) => {
        const req = index.getAll(IDBKeyRange.only(targetSession.id));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      if (chunksData.length === 0) return null;

      chunksData.sort((a, b) => a.index - b.index);
      const blobParts = chunksData.map((c) => c.data);
      const mime = targetSession.mimeType || 'video/webm';
      const reconstructedBlob = new Blob(blobParts, { type: mime.split(';')[0] });

      return {
        metadata: targetSession,
        blob: reconstructedBlob
      };
    } catch (err) {
      console.warn('Failed to inspect recoverable recording session:', err);
      return null;
    }
  }

  /**
   * Cleans up all stored chunks and session metadata after user downloads or explicitly discards.
   */
  public async clearSession(sessionId?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([SESSIONS_STORE, CHUNKS_STORE], 'readwrite');
      const sessionsStore = tx.objectStore(SESSIONS_STORE);
      const chunksStore = tx.objectStore(CHUNKS_STORE);

      const targetId = sessionId || this.currentSessionId;
      if (targetId) {
        sessionsStore.delete(targetId);
        const index = chunksStore.index('sessionId');
        const req = index.openCursor(IDBKeyRange.only(targetId));
        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      } else {
        sessionsStore.clear();
        chunksStore.clear();
      }

      if (targetId === this.currentSessionId) {
        this.currentSessionId = null;
        this.chunkIndex = 0;
        this.totalBytes = 0;
      }
    } catch (err) {
      console.warn('Failed to clear recovery session:', err);
    }
  }
}

export const recoveryService = new RecordingRecoveryService();
