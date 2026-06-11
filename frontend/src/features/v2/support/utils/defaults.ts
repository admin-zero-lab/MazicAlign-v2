import type { SupportParams } from "../types";

/**
 * 일반적인 SLA 출력 기준의 무난한 시작 값.
 * 단위: deg / mm.
 */
export const DEFAULT_SUPPORT_PARAMS: SupportParams = {
  overhangAngleDeg: 45,
  trunkDiameterMm: 0.8,
  tipDiameterMm: 0.4,
  baseDiameterMm: 1.5,
  tipTransitionMm: 1.0,
  baseTransitionMm: 3.0,
  autoSizeTrunk: false,
  contactSpacingMm: 4.0,
  liftMm: 5.0,
};

/**
 * 각 파라미터의 허용 범위. UI 슬라이더 / 유효성 검사 양쪽에서 쓴다.
 */
export const SUPPORT_PARAM_LIMITS: Record<
  keyof Omit<SupportParams, "autoSizeTrunk">,
  { min: number; max: number; step: number; unit: string; label: string }
> = {
  overhangAngleDeg: { min: 10, max: 80, step: 1, unit: "°", label: "오버행 임계각" },
  trunkDiameterMm: { min: 0.3, max: 3.0, step: 0.05, unit: "mm", label: "기둥 굵기" },
  tipDiameterMm: { min: 0.1, max: 1.0, step: 0.05, unit: "mm", label: "팁 지름" },
  baseDiameterMm: { min: 0.5, max: 5.0, step: 0.1, unit: "mm", label: "바닥 지름" },
  tipTransitionMm: { min: 0.2, max: 5.0, step: 0.1, unit: "mm", label: "팁 전이 길이" },
  baseTransitionMm: { min: 0.5, max: 10.0, step: 0.1, unit: "mm", label: "바닥 전이 길이" },
  contactSpacingMm: { min: 1.5, max: 15.0, step: 0.5, unit: "mm", label: "접점 간격" },
  liftMm: { min: 0, max: 30, step: 0.5, unit: "mm", label: "모델 리프트" },
};
