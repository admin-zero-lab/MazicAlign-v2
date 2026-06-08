/**
 * 프린트 출력용 서포트(지지대) 타입 정의
 * ChiTuBox 1.9.5 서포트 설정 UI를 기준으로 모델링한다.
 */

/** 서포트 굵기 프리셋 */
export type SupportThickness = 'thin' | 'medium' | 'thick';

/** 접점(모델에 닿는 끝부분) 형태 */
export type ContactShape = 'sphere' | 'cone';

/** 연결부(기둥 상단 테이퍼) 형태 */
export type ConnectionShape = 'cone' | 'cylinder';

/** 서포트 설정 패널의 하위 탭 */
export type SupportSubTab = 'top' | 'middle' | 'bottom' | 'raft';

/** 서포트 편집 모드 (뷰어 상호작용) */
export type SupportMode = 'off' | 'add' | 'delete';

/** 서포트 생성/형상 설정 */
export interface SupportSettings {
  /** Z축 이동 높이(mm) — 프린터가 레이어 사이 들어올리는 높이 */
  zLiftHeight: number;
  /** 서포트 굵기 프리셋 */
  thickness: SupportThickness;

  // 상단(Top) — 접점 + 연결부
  contactShape: ContactShape;
  contactDiameter: number; // 접점 직경(mm)
  contactDepth: number;    // 접점 깊이(mm) — 모델 표면을 파고드는 깊이
  connectionShape: ConnectionShape;
  topDiameter: number;     // 연결부 상단 직경(mm)
  bottomDiameter: number;  // 연결부 하단 직경(mm)
  connectionLength: number; // 연결부(테이퍼) 길이(mm)

  // 중앙(Middle) — 기둥
  middleDiameter: number;  // 기둥 직경(mm)

  // 바닥(Bottom) — 바닥 부착부
  baseDiameter: number;    // 바닥 직경(mm)
  baseThickness: number;   // 바닥 두께(mm)

  // 라프트(Raft)
  raftEnabled: boolean;    // 라프트 사용 여부
  raftThickness: number;   // 라프트 두께(mm)
  raftMargin: number;      // 라프트 여백(mm)

  // 자동/수동 지원
  crossWidth: number;      // 크로스 너비(mm) — 서포트 간 기본 간격
  gridStartHeight: number; // 격자서포트 시작 높이(mm)
  density: number;         // 밀도(%) — 높을수록 서포트가 촘촘함
  overhangAngle: number;   // 각도(°) — 이 각도 이하의 오버행면에 서포트 생성

  // 자동 사이징 — 모델 크기에 비례해 spacing/직경을 자동 결정
  autoSize: boolean;
}

/** 개별 서포트 1개 — 접점(모델 표면)과 바닥(착지점)을 잇는 지지대 */
export interface SupportPoint {
  id: string;
  /** 소유 모델의 stlId */
  stlId: string;
  /** 모델 표면 접점 (Babylon 월드 좌표) */
  contact: { x: number; y: number; z: number };
  /** 착지점 — 빌드플레이트(Y=0) 또는 하부 모델 표면 (Babylon 월드 좌표) */
  base: { x: number; y: number; z: number };
  /** contact 표면 외향 법선. 콘이 이 방향으로 기울어진다. 없으면 수직. */
  normal?: { x: number; y: number; z: number };
}

/** 굵기 프리셋별 기본 직경값 (ChiTuBox 1.9.5 기준 근사) */
export const THICKNESS_PRESETS: Record<
  SupportThickness,
  Pick<SupportSettings, 'contactDiameter' | 'topDiameter' | 'bottomDiameter' | 'middleDiameter'>
> = {
  thin: { contactDiameter: 0.2, topDiameter: 0.2, bottomDiameter: 0.8, middleDiameter: 0.8 },
  medium: { contactDiameter: 0.3, topDiameter: 0.3, bottomDiameter: 1.0, middleDiameter: 1.0 },
  thick: { contactDiameter: 0.4, topDiameter: 0.4, bottomDiameter: 1.5, middleDiameter: 1.5 },
};

/** 서포트 설정 기본값 (ChiTuBox 1.9.5 화면 기준) */
export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  zLiftHeight: 5.0,
  thickness: 'thick',
  contactShape: 'sphere',
  contactDiameter: 0.4,
  contactDepth: 0.1,
  connectionShape: 'cone',
  topDiameter: 0.4,
  bottomDiameter: 1.5,
  connectionLength: 3.0,
  middleDiameter: 1.5,
  baseDiameter: 3.0,
  baseThickness: 0.5,
  raftEnabled: false,
  raftThickness: 0.5,
  raftMargin: 2.0,
  crossWidth: 4.0,
  gridStartHeight: 3.0,
  density: 95.0,
  overhangAngle: 45.0,
  autoSize: false,
};
