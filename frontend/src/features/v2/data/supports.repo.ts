import { openDb, STORE_SUPPORTS } from "./db";
import type { SupportPointV2 } from "../support/types";

/** 프로젝트의 모든 서포트 점. */
export async function listSupportsByProject(
  projectId: string,
): Promise<SupportPointV2[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUPPORTS, "readonly");
    const idx = tx.objectStore(STORE_SUPPORTS).index("by_project");
    const out: SupportPointV2[] = [];
    idx.openCursor(IDBKeyRange.only(projectId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        out.push(cursor.value as SupportPointV2);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

/** 단일 STL 의 서포트 점만. */
export async function listSupportsByStl(
  stlId: string,
): Promise<SupportPointV2[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUPPORTS, "readonly");
    const idx = tx.objectStore(STORE_SUPPORTS).index("by_stl");
    const out: SupportPointV2[] = [];
    idx.openCursor(IDBKeyRange.only(stlId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        out.push(cursor.value as SupportPointV2);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

/** 여러 점을 한 transaction 으로 일괄 추가 (자동 생성 시 유리). */
export async function addSupports(
  points: SupportPointV2[],
): Promise<void> {
  if (points.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUPPORTS, "readwrite");
    const store = tx.objectStore(STORE_SUPPORTS);
    for (const p of points) {
      store.add(p);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSupport(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUPPORTS, "readwrite");
    tx.objectStore(STORE_SUPPORTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 한 프로젝트의 모든 서포트 삭제. */
export async function deleteSupportsByProject(projectId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUPPORTS, "readwrite");
    const idx = tx.objectStore(STORE_SUPPORTS).index("by_project");
    idx.openCursor(IDBKeyRange.only(projectId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 단일 STL 의 서포트만 삭제 (예: 모델 삭제 cascade). */
export async function deleteSupportsByStl(stlId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUPPORTS, "readwrite");
    const idx = tx.objectStore(STORE_SUPPORTS).index("by_stl");
    idx.openCursor(IDBKeyRange.only(stlId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
