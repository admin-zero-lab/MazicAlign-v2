import { create } from "zustand";

import { DEFAULT_SUPPORT_V2_PARAMS } from "../utils/defaults";
import type { SupportV2Params } from "../types";

interface SupportV2ParamsState {
  params: SupportV2Params;
  setParam: <K extends keyof SupportV2Params>(
    key: K,
    value: SupportV2Params[K],
  ) => void;
  reset: () => void;
}

/**
 * 서포트 v2 의 파라미터 단일 출처(single source of truth).
 *
 * 패널 UI / 오버행 시각화 / 자동 생성 / 수동 편집이 모두 이 스토어에서
 * 값을 읽는다. 옛 v1 의 SupportSettings 스토어와 무관하다.
 */
export const useSupportV2ParamsStore = create<SupportV2ParamsState>((set) => ({
  params: DEFAULT_SUPPORT_V2_PARAMS,

  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value } })),

  reset: () => set({ params: DEFAULT_SUPPORT_V2_PARAMS }),
}));
