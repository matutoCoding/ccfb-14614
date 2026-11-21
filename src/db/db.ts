/**
 * IndexedDB 存储:电缆结构、工艺参数、实测记录。
 */

import { CableDesign } from '../core/cableModel';

export interface MeasurementRecord {
  id: string;
  cableId: string;
  name: string;
  /** 实测截面照片(dataURL) */
  imageDataUrl: string | null;
  /** 对齐参数:导体中心偏移与缩放 */
  align: { dx: number; dy: number; scale: number };
  measuredWireCount: number | null;
  measuredOd: number | null;
  /** 8 方向厚度实测(每层一组) */
  thicknessSamples: Record<string, number[]>;
  createdAt: number;
}

export interface ProcessRecord {
  id: string;
  cableId: string;
  name: string;
  params: Record<string, unknown>;
  createdAt: number;
}

const DB_NAME = 'cable-designer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cables')) {
        db.createObjectStore('cables', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('measurements')) {
        const s = db.createObjectStore('measurements', { keyPath: 'id' });
        s.createIndex('cableId', 'cableId', { unique: false });
      }
      if (!db.objectStoreNames.contains('process')) {
        const s = db.createObjectStore('process', { keyPath: 'id' });
        s.createIndex('cableId', 'cableId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function txAll<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return tx(store, 'readonly', fn);
}

export const db = {
  async saveCable(design: CableDesign): Promise<void> {
    design.updatedAt = Date.now();
    await tx('cables', 'readwrite', (s) => s.put(design));
  },
  async getCable(id: string): Promise<CableDesign | undefined> {
    return txAll('cables', (s) => s.get(id));
  },
  async listCables(): Promise<CableDesign[]> {
    return txAll('cables', (s) => s.getAll());
  },
  async deleteCable(id: string): Promise<void> {
    await tx('cables', 'readwrite', (s) => s.delete(id));
  },
  async saveMeasurement(m: MeasurementRecord): Promise<void> {
    await tx('measurements', 'readwrite', (s) => s.put(m));
  },
  async listMeasurements(cableId: string): Promise<MeasurementRecord[]> {
    const all = await txAll<MeasurementRecord[]>('measurements', (s) => s.getAll());
    return all.filter((m) => m.cableId === cableId);
  },
  async saveProcess(p: ProcessRecord): Promise<void> {
    await tx('process', 'readwrite', (s) => s.put(p));
  },
  async listProcess(cableId: string): Promise<ProcessRecord[]> {
    const all = await txAll<ProcessRecord[]>('process', (s) => s.getAll());
    return all.filter((p) => p.cableId === cableId);
  },
};
