// support-v2 전용 타입.
// 옛 support.types.ts 와 무관하게 다시 정의한다.

/**
 * 서포트 파라미터.
 *
 * 첫 패스 (D 단계)에서 필요한 최소 집합. 자동 생성 / 수동 편집
 * 단계가 들어오면 그때 필드를 추가한다.
 */
export interface SupportV2Params {
  /** 오버행 판정 임계각 (deg). 면 법선이 -Z 와 이루는 각이 이 값
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
}

/** SupportV2Params 의 한 키만 부분 갱신할 때 쓰는 타입 헬퍼. */
export type SupportV2ParamKey = keyof SupportV2Params;
