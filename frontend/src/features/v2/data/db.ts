/**
 * v2 IndexedDB 진입점.
 *
 * 단일 DB 'resinforge' 안에 v2 모든 데이터를 격리해서 보관한다.
 * 옛 백엔드 API 는 사용하지 않는다. 라이브러리 의존성 없이 raw
 * IndexedDB API 위에 얇은 Promise 래퍼만 둔다.
 */

export const DB_NAME = "resinforge";
export const DB_VERSION = 1;

export const STORE_PROJECTS = "projects";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * DB 핸들을 한 번만 연다. 후속 호출은 같은 Promise 를 재사용.
 *
 * onupgradeneeded 에서 스키마를 만들고, 이후 DB_VERSION 을 올릴 때
 * 마이그레이션도 여기서 처리한다.
 */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
        store.createIndex("by_lastModifiedAt", "lastModifiedAt");
        store.createIndex("by_code", "code", { unique: true });
      }

      // 향후 stl_files, supports 스토어가 추가되면 여기서 분기.
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
          // fn 이 이미 resolved 된 값을 돌려준 경우
          result = req as T;
          resolved = true;
        }
      },
      (err) => reject(err),
    );

    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));

    // resolved 가 즉시 true 면 트랜잭션 commit 을 기다린 뒤 oncomplete 가 발화.
    void resolved;
  });
}

/**
 * 테스트·디버그용. 운영 코드에서는 호출하지 않는다.
 */
export async function _wipeAll(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], "readwrite");
    tx.objectStore(STORE_PROJECTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
