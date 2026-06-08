import type { SupportV2Params } from "../types";

/**
 * 일반적인 SLA 출력 기준의 무난한 시작 값.
 *
 * 단위: deg / mm. 의도적으로 옛 support v1 의 기본값을 보지 않고
 * SLA 가이드라인의 통용 수치로 잡았다.
 */
export const DEFAULT_SUPPORT_V2_PARAMS: SupportV2Params = {
  overhangAngleDeg: 45,
  trunkDiameterMm: 0.8,
  tipDiameterMm: 0.4,
  baseDiameterMm: 1.5,
  tipTransitionMm: 1.0,
  baseTransitionMm: 3.0,
  autoSizeTrunk: false,
};

/**
 * 각 파라미터의 허용 범위. UI 슬라이더 / 입력 유효성 검사 양쪽에서 쓴다.
 */
export const SUPPORT_V2_PARAM_LIMITS: Record<
  keyof Omit<SupportV2Params, "autoSizeTrunk">,
  { min: number; max: number; step: number; unit: string; label: string }
> = {
  overhangAngleDeg: { min: 10, max: 80, step: 1, unit: "°", label: "오버행 임계각" },
  trunkDiameterMm: { min: 0.3, max: 3.0, step: 0.05, unit: "mm", label: "기둥 굵기" },
  tipDiameterMm: { min: 0.1, max: 1.0, step: 0.05, unit: "mm", label: "팁 지름" },
  baseDiameterMm: { min: 0.5, max: 5.0, step: 0.1, unit: "mm", label: "바닥 지름" },
  tipTransitionMm: { min: 0.2, max: 5.0, step: 0.1, unit: "mm", label: "팁 전이 길이" },
  baseTransitionMm: { min: 0.5, max: 10.0, step: 0.1, unit: "mm", label: "바닥 전이 길이" },
};
