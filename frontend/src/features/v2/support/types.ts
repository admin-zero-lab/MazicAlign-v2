// v2 서포트 모듈 전용 타입.
// 옛 support.types.ts 와 무관.

/**
 * 서포트 파라미터.
 *
 * 자동 생성·시각화·수동 편집이 모두 이 값을 본다.
 */
export interface SupportParams {
  /** 오버행 판정 임계각 (deg). 면 법선이 -Y 와 이루는 각이 이 값
   *  이상이면 오버행으로 본다. 통상 35~55°. */
  overhangAngleDeg: number;

  /** 기둥(트렁크) 굵기. mm. */
  trunkDiameterMm: number;

  /** 모델 접점(팁) 지름. mm. 작을수록 표면 자국이 적지만 잘 떨어진다. */
  tipDiameterMm: number;

  /** 바닥(빌드플레이트) 접점 지름. mm. */
  baseDiameterMm: number;

  /** 팁 → 트렁크 굵기 전이 구간 길이. mm. */
  tipTransitionMm: number;

  /** 트렁크 → 바닥 굵기 전이 구간 길이. mm. */
  baseTransitionMm: number;

  /** 트렁크 굵기를 모델 크기에서 자동으로 결정할지 여부.
   *  true 일 때 trunkDiameterMm 는 무시된다. */
  autoSizeTrunk: boolean;

  /** 자동 생성 시 컨택트 포인트 간 최소 거리. mm.
   *  격자 샘플링의 격자 간격을 결정한다. 작을수록 서포트가 촘촘. */
  contactSpacingMm: number;

  /** 모델 base 를 빌드플레이트 위로 띄우는 높이. mm.
   *  서포트 기둥이 의미 있는 길이로 생기려면 필요. STL 로드 시
   *  적용되며 변경 후엔 다시 불러올 때부터 반영. */
  liftMm: number;
}

export type SupportParamKey = keyof SupportParams;

/**
 * 단일 서포트 점.
 *
 * contact: 모델 표면(오버행) 위에 닿는 끝점 (world 좌표).
 * base   : 빌드플레이트(Y=0) 위 또는 다른 모델 위 — 기둥의 다른 끝.
 */
export interface SupportPointV2 {
  id: string;
  projectId: string;
  /** 어느 STL 의 오버행 위에 붙어있는지. */
  stlId: string;
  contact: [number, number, number];
  base: [number, number, number];
  source: "auto" | "manual";
  addedAt: number;
}
