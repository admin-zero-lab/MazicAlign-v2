import { useEffect } from "react";
import { create } from "zustand";

/**
 * v2 키보드 단축키 인프라.
 *
 * - useShortcutsListener: 페이지 루트에서 한 번 호출. 글로벌
 *   keydown 리스너를 설치한다.
 * - useShortcutHandler:   각 기능 컴포넌트가 자기 액션 핸들러를
 *   등록·해제한다.
 *
 * 등록된 핸들러가 없으면 키 조합이 눌려도 아무 일 안 일어나고
 * 브라우저 기본 동작도 막지 않는다. 따라서 인프라만 설치해 두고
 * 액션은 다음 단계에서 채워 넣어도 안전하다.
 *
 * INPUT / TEXTAREA / contentEditable 위에서는 항상 패스해서
 * 브라우저의 텍스트 단축키(Ctrl+A 전체 선택 등)를 유지한다.
 */

export type ShortcutAction =
  | "undo"
  | "redo"
  | "selectAll"
  | "copy"
  | "cut"
  | "paste"
  | "delete";

type Handler = () => void;

interface ShortcutsState {
  handlers: Partial<Record<ShortcutAction, Handler>>;
  setHandler: (action: ShortcutAction, handler: Handler | undefined) => void;
}

const useShortcutsStore = create<ShortcutsState>((set) => ({
  handlers: {},
  setHandler: (action, handler) =>
    set((s) => {
      const next = { ...s.handlers };
      if (handler) {
        next[action] = handler;
      } else {
        delete next[action];
      }
      return { handlers: next };
    }),
}));

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

/** modifier 가 필요한 액션. Delete 는 단축키만으로 동작. */
function resolveAction(e: KeyboardEvent): {
  action: ShortcutAction;
  requiresMeta: boolean;
} | null {
  if (e.key === "Delete" || e.key === "Backspace") {
    return { action: "delete", requiresMeta: false };
  }
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey)
    return { action: "undo", requiresMeta: true };
  if (key === "y") return { action: "redo", requiresMeta: true };
  if (key === "z" && e.shiftKey) return { action: "redo", requiresMeta: true };
  if (key === "a") return { action: "selectAll", requiresMeta: true };
  if (key === "c") return { action: "copy", requiresMeta: true };
  if (key === "x") return { action: "cut", requiresMeta: true };
  if (key === "v") return { action: "paste", requiresMeta: true };
  return null;
}

/**
 * 페이지 루트(예: ViewerV2Page)에서 한 번 호출.
 */
export function useShortcutsListener(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 텍스트 입력에서는 브라우저 기본 동작 유지 (Delete 키 포함).
      if (isTextEditingTarget(e.target)) return;

      const resolved = resolveAction(e);
      if (!resolved) return;

      if (resolved.requiresMeta && !(e.ctrlKey || e.metaKey)) return;

      const handler = useShortcutsStore.getState().handlers[resolved.action];
      if (!handler) return;

      e.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * 액션 핸들러를 등록·해제한다.
 * handler 가 null / undefined 면 해제.
 *
 * 사용 예:
 *   useShortcutHandler('undo', () => undoStack.pop());
 */
export function useShortcutHandler(
  action: ShortcutAction,
  handler: Handler | null | undefined,
): void {
  const setHandler = useShortcutsStore((s) => s.setHandler);
  useEffect(() => {
    if (!handler) return;
    setHandler(action, handler);
    return () => setHandler(action, undefined);
  }, [action, handler, setHandler]);
}

/**
 * 테스트·디버그용. 현재 등록된 액션 목록.
 */
export function _peekRegisteredActions(): ShortcutAction[] {
  return Object.keys(useShortcutsStore.getState().handlers) as ShortcutAction[];
}
