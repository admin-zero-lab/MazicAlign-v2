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

  /** Bridge 서포트(두 지점 잇는 cross-brace)의 본체 굵기. mm.
   *  원형 단면. 일반 서포트의 trunk 와 분리해 두꺼운 보강용으로
   *  쓰기 좋다. */
  bridgeDiameterMm: number;
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
  /** contact 쪽이 닿아있는 STL. 자동/단점/브릿지 모두 필수. */
  stlId: string;
  /**
   * 브릿지의 경우 base 쪽이 닿아있는 STL (contact 와 다를 수 있음).
   * 자동/단점은 base 가 빌드플레이트라 undefined.
   * 둘 중 어느 STL 이 삭제돼도 cascade 로 같이 사라진다.
   */
  baseStlId?: string;
  contact: [number, number, number];
  base: [number, number, number];
  source: "auto" | "manual" | "bridge";
  addedAt: number;
  /**
   * Bridge 곡선용 변곡점 3 개 (옵셔널).
   *
   * base 와 contact 사이의 t = 0.25 / 0.50 / 0.75 위치에 자동
   * 배치된 뒤, 사용자가 드래그해 곡선 형태를 만든다. 정의되어 있지
   * 않거나 모두 lerp 위치에 있으면 결과는 직선과 동일.
   *
   * 렌더 시 [base, ...curveControlPoints, contact] 5 점을 통과하는
   * Catmull-Rom spline 의 Tube 가 만들어진다.
   *
   * source !== 'bridge' 인 점에서는 무시된다.
   */
  curveControlPoints?: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  /**
   * Contact 위치의 표면 normal (모델 외부 방향, 단위 벡터).
   * 옵셔널 — 옛 데이터는 undefined. 시각화 sphere 를 표면 밖으로
   * lift 하는 데 쓰임. 저장된 contact 좌표 자체는 표면 안쪽 push 된
   * 상태를 유지해서 서포트 메시 cap 이 void 없이 부착된다.
   */
  contactNormal?: [number, number, number];
  /** Base 위치 normal (Bridge 전용). undefined 면 (0, 1, 0). */
  baseNormal?: [number, number, number];
}
