import { create } from "zustand";

import { DEFAULT_SUPPORT_PARAMS } from "../utils/defaults";
import type { SupportParams } from "../types";

interface SupportParamsState {
  params: SupportParams;
  setParam: <K extends keyof SupportParams>(
    key: K,
    value: SupportParams[K],
  ) => void;
  reset: () => void;
}

/**
 * 서포트 파라미터 단일 출처.
 *
 * v2 서포트 모듈(파라미터 패널 · 오버행 시각화 · 자동 생성 · 수동 편집)이
 * 모두 이 스토어를 본다. 옛 v1 스토어와 무관.
 */
export const useSupportParamsStore = create<SupportParamsState>((set) => ({
  params: DEFAULT_SUPPORT_PARAMS,

  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value } })),

  reset: () => set({ params: DEFAULT_SUPPORT_PARAMS }),
}));
