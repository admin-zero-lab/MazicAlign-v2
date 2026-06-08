import { create } from "zustand";

/**
 * v2 Undo/Redo 스택.
 *
 * 각 entry 는 `undo` / `redo` 두 콜백을 들고 있다 — 인보크 하면 그
 * 변경을 되돌리거나 다시 적용한다. 데이터 스냅샷이 아니라 콜백
 * 기반이라 비동기 DB 변경에도 자연스럽다.
 *
 * push 시 future 는 비운다 (브랜치 끊김).
 */

type Cb = () => Promise<void> | void;

export interface UndoEntry {
  label: string;
  undo: Cb;
  redo: Cb;
}

interface UndoState {
  past: UndoEntry[];
  future: UndoEntry[];
  push: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  /** 디버그용. */
  _peek: () => { past: number; future: number };
}

const MAX_DEPTH = 100;

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],

  push: (entry) =>
    set((s) => {
      const past = [...s.past, entry];
      while (past.length > MAX_DEPTH) past.shift();
      return { past, future: [] };
    }),

  undo: async () => {
    const past = get().past;
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    await entry.undo();
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [...s.future, entry],
    }));
  },

  redo: async () => {
    const future = get().future;
    if (future.length === 0) return;
    const entry = future[future.length - 1];
    await entry.redo();
    set((s) => ({
      past: [...s.past, entry],
      future: s.future.slice(0, -1),
    }));
  },

  clear: () => set({ past: [], future: [] }),

  _peek: () => ({ past: get().past.length, future: get().future.length }),
}));
