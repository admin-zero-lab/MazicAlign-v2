import { openDb, STORE_STL_FILES } from "./db";
import type { STLFileV2 } from "../types/stl";

/** 프로젝트의 STL 파일을 추가된 순서대로 반환. */
export async function listStlFilesByProject(
  projectId: string,
): Promise<STLFileV2[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STL_FILES, "readonly");
    const idx = tx.objectStore(STORE_STL_FILES).index("by_project");
    const out: STLFileV2[] = [];
    idx.openCursor(IDBKeyRange.only(projectId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        out.push(cursor.value as STLFileV2);
        cursor.continue();
      }
    };
    tx.oncomplete = () =>
      resolve(out.sort((a, b) => a.addedAt - b.addedAt));
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStlFile(id: string): Promise<STLFileV2 | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STL_FILES, "readonly");
    const req = tx.objectStore(STORE_STL_FILES).get(id);
    req.onsuccess = () => resolve(req.result as STLFileV2 | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function createStlFile(
  projectId: string,
  fileName: string,
  blob: Blob,
): Promise<STLFileV2> {
  const stlFile: STLFileV2 = {
    id: crypto.randomUUID(),
    projectId,
    fileName,
    blob,
    fileSize: blob.size,
    addedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_STL_FILES, "readwrite");
    tx.objectStore(STORE_STL_FILES).add(stlFile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return stlFile;
}

export async function deleteStlFile(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STL_FILES, "readwrite");
    tx.objectStore(STORE_STL_FILES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 프로젝트 삭제 시 cascade. */
export async function deleteStlFilesByProject(
  projectId: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STL_FILES, "readwrite");
    const idx = tx.objectStore(STORE_STL_FILES).index("by_project");
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
