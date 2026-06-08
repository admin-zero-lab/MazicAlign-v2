/**
 * v2 IndexedDB 진입점.
 *
 * 단일 DB 'resinforge' 안에 v2 모든 데이터를 격리해서 보관한다.
 * 옛 백엔드 API 는 사용하지 않는다. 라이브러리 의존성 없이 raw
 * IndexedDB API 위에 얇은 Promise 래퍼만 둔다.
 */

export const DB_NAME = "resinforge";
export const DB_VERSION = 2;

export const STORE_PROJECTS = "projects";
export const STORE_STL_FILES = "stl_files";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * DB 핸들을 한 번만 연다. 후속 호출은 같은 Promise 를 재사용.
 *
 * onupgradeneeded 에서 스키마를 만들고 oldVersion 별로 마이그레이션.
 */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // v0 → v1: projects 스토어
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
        store.createIndex("by_lastModifiedAt", "lastModifiedAt");
        store.createIndex("by_code", "code", { unique: true });
      }

      // v1 → v2: stl_files 스토어
      if (oldVersion < 2) {
        const stlStore = db.createObjectStore(STORE_STL_FILES, {
          keyPath: "id",
        });
        stlStore.createIndex("by_project", "projectId");
        stlStore.createIndex("by_addedAt", "addedAt");
      }
    };

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });

  return dbPromise;
}

/**
 * 단일 스토어에 대한 readonly / readwrite 트랜잭션을 Promise 로
 * 감싼다. fn 이 반환한 IDBRequest 의 결과를 await 결과로 돌려준다.
 */
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    let result: T | undefined;
    let resolved = false;

    Promise.resolve(fn(store)).then(
      (req) => {
        if (req instanceof IDBRequest) {
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => reject(req.error);
        } else {
          result = req as T;
          resolved = true;
        }
      },
      (err) => reject(err),
    );

    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));

    void resolved;
  });
}

/**
 * 테스트·디버그용.
 */
export async function _wipeAll(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_STL_FILES], "readwrite");
    tx.objectStore(STORE_PROJECTS).clear();
    tx.objectStore(STORE_STL_FILES).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
