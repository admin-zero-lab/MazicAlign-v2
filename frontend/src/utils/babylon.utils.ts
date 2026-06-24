import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  UtilityLayerRenderer,
  GizmoManager,
} from '@babylonjs/core';
import '@babylonjs/loaders/STL';

/**
 * Babylon.js 엔진 초기화
 */
export const createEngine = (canvas: HTMLCanvasElement): Engine => {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  // 화면 크기 변경 시 엔진 리사이즈
  window.addEventListener('resize', () => {
    engine.resize();
  });

  return engine;
};

/**
 * 3D 씬 생성 및 기본 설정
 */
export const createScene = (engine: Engine): Scene => {
  const scene = new Scene(engine);

  // 배경색 설정 (연회색)
  scene.clearColor = new Color4(0.9, 0.9, 0.9, 1);

  return scene;
};

/**
 * 카메라 설정
 */
export const createCamera = (scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera => {
  const camera = new ArcRotateCamera(
    'camera',
    Math.PI / 2, // alpha (회전 각도)
    Math.PI / 3, // beta (상하 각도)
    50, // radius (거리)
    Vector3.Zero(), // target
    scene
  );

  // 카메라 제어 설정
  // attachControl(element, noPreventDefault, useCtrlForPanning)
  // useCtrlForPanning = false (Ctrl 키 없이 패닝)
  camera.attachControl(canvas, true, false);

  // 패닝(이동)은 휠클릭(1)에만 허용. 카메라와 PointersInput 양쪽 모두에 직접
  // panningMouseButton을 1로 박아, 우클릭이 화면을 평행이동시키는 회귀를 봉쇄한다.
  // (사용자 강조: "Transform 챕터에서 우클릭으로 화면 이동 금지")
  (camera as unknown as { _panningMouseButton: number })._panningMouseButton = 1;

  // 화살표 키는 모델의 Z축(상하) 이동 단축키로 사용하므로
  // 카메라 기본 키보드 이동 입력을 제거해 키 충돌을 방지한다.
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

  // 줌 — 휠 스크롤 + *마우스 커서 위치* 기준. zoomToMouseLocation=true 면 카메라가
  // 줌인할수록 마우스가 가리키는 지점이 화면에서 그대로 유지된다.
  // wheelPrecision: default 50. 낮을수록 빠름.
  camera.wheelPrecision = 10;
  camera.zoomToMouseLocation = true;

  // 패닝(시점 이동) — 휠클릭(1) 드래그로 활성. panningMouseButton 을 1 로 두고
  // pointersInput.buttons 에 1·2 를 함께 둔다. 우클릭(2)은 panningMouseButton 과
  // 다른 값이라 회전으로 동작.
  camera.panningSensibility = 50; // 낮을수록 빠름
  camera.panningInertia = 0.7;

  // 마우스 버튼 매핑 (0: 좌, 1: 휠, 2: 우):
  //  - 좌클릭(0): 모델 선택 + PointerDrag. 카메라 입력에서 제외.
  //  - 휠클릭(1): 카메라 패닝(시점 이동).
  //  - 우클릭(2): 카메라 회전.
  //  - 휠 스크롤  : 마우스 위치 기준 줌.
  const pointersInput = (camera.inputs.attached.pointers as unknown as {
    buttons?: number[];
    panningMouseButton?: number;
    _panningMouseButton?: number;
  });
  if (pointersInput) {
    pointersInput.buttons = [1, 2];
    pointersInput.panningMouseButton = 1;
    pointersInput._panningMouseButton = 1;
  }
  // 우클릭이 카메라 입력에서 빠졌어도 브라우저 기본 컨텍스트 메뉴가 뜨면
  // 작업 흐름이 끊기므로 차단한다.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  camera.minZ = 0.1; // 최소 클리핑 거리
  camera.maxZ = 3000; // 최대 클리핑 거리 (줌아웃 1000 거리 수용)

  // 카메라 이동 범위 제한
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 1000; // 축소(줌아웃) 범위 확장

  return camera;
};

/**
 * 조명 설정
 */
export const createLights = (scene: Scene): void => {
  // 주변광 (Ambient Light)
  const hemisphericLight = new HemisphericLight('hemisphericLight', new Vector3(0, 1, 0), scene);
  hemisphericLight.intensity = 0.7;
  hemisphericLight.diffuse = new Color3(1, 1, 1);
  hemisphericLight.specular = new Color3(0.5, 0.5, 0.5);

  // 방향성 조명 1 (앞쪽)
  const directionalLight1 = new DirectionalLight(
    'directionalLight1',
    new Vector3(-1, -2, -1),
    scene
  );
  directionalLight1.intensity = 0.5;

  // 방향성 조명 2 (뒤쪽)
  const directionalLight2 = new DirectionalLight(
    'directionalLight2',
    new Vector3(1, 2, 1),
    scene
  );
  directionalLight2.intensity = 0.3;
};

/**
 * 씬 렌더링 시작
 */
export const startRenderLoop = (engine: Engine, scene: Scene): void => {
  engine.runRenderLoop(() => {
    scene.render();
  });
};

/**
 * 엔진 및 씬 정리
 */
export const disposeScene = (engine: Engine, scene: Scene): void => {
  scene.dispose();
  engine.dispose();
};

/**
 * 빌드스테이지 그리드 생성 (XZ 평면, Y=0)
 * - 빌드스테이지 규격: X 143.430mm, Y(= Babylon Z) 89.6mm, 원점 중심
 * - 내부 격자: 20×20mm, 검정 실선
 * - 최외각 테두리: 두꺼운 검정 실선
 */
export const createGrid = (scene: Scene): void => {
  // 빌드스테이지 규격 (사용자 X = Babylon X, 사용자 Y = Babylon Z)
  const stageX = 143.430;
  const stageZ = 89.6;
  const halfX = stageX / 2; // 71.715
  const halfZ = stageZ / 2; // 44.8
  const cell = 10; // 10mm 격자

  // 내부 격자선 (20mm 간격 실선)
  const lines: Vector3[][] = [];

  // 세로선 (Z축 방향) — X = 0, ±20, ±40, ±60 ...
  lines.push([new Vector3(0, 0, -halfZ), new Vector3(0, 0, halfZ)]);
  for (let x = cell; x < halfX; x += cell) {
    lines.push([new Vector3(x, 0, -halfZ), new Vector3(x, 0, halfZ)]);
    lines.push([new Vector3(-x, 0, -halfZ), new Vector3(-x, 0, halfZ)]);
  }

  // 가로선 (X축 방향) — Z = 0, ±20, ±40 ...
  lines.push([new Vector3(-halfX, 0, 0), new Vector3(halfX, 0, 0)]);
  for (let z = cell; z < halfZ; z += cell) {
    lines.push([new Vector3(-halfX, 0, z), new Vector3(halfX, 0, z)]);
    lines.push([new Vector3(-halfX, 0, -z), new Vector3(halfX, 0, -z)]);
  }

  const grid = MeshBuilder.CreateLineSystem('buildStageGrid', { lines }, scene);
  grid.color = new Color3(0, 0, 0);
  grid.isPickable = false;

  // 검정 재질 (테두리·중앙점 공용, 조명과 무관하게 선명)
  const blackMat = new StandardMaterial('stageBlackMat', scene);
  blackMat.diffuseColor = new Color3(0, 0, 0);
  blackMat.emissiveColor = new Color3(0, 0, 0);
  blackMat.specularColor = new Color3(0, 0, 0);

  // 최외각 테두리 — 두꺼운 검정 실선 (납작한 프레임 박스 4개)
  const borderW = 1.5; // 테두리 두께(mm)
  const borderH = 0.2; // 높이 (살짝 도드라지게)
  const makeEdge = (name: string, w: number, d: number, x: number, z: number) => {
    const edge = MeshBuilder.CreateBox(name, { width: w, height: borderH, depth: d }, scene);
    edge.position = new Vector3(x, 0, z);
    edge.material = blackMat;
    edge.isPickable = false;
  };
  makeEdge('stageBorderTop', stageX + borderW, borderW, 0, halfZ);
  makeEdge('stageBorderBottom', stageX + borderW, borderW, 0, -halfZ);
  makeEdge('stageBorderLeft', borderW, stageZ + borderW, -halfX, 0);
  makeEdge('stageBorderRight', borderW, stageZ + borderW, halfX, 0);

  // 전면부 표시 — 정면(+Z) 가장자리 중앙
  // 규격: 좌우(X) 50mm × 폭(Z) 10mm
  const frontW = 50; // 좌우(X) 길이
  const frontD = 10; // 폭(Z 깊이)

  // 검정 박스 — 베이스(바닥면)와 평행하게 눕힌 납작한 막대
  const frontMarker = MeshBuilder.CreateBox(
    'stageFrontMarker',
    { width: frontW, height: borderH, depth: frontD },
    scene
  );
  frontMarker.position = new Vector3(0, 0, halfZ + borderW / 2 + frontD / 2);
  frontMarker.isPickable = false;
  frontMarker.material = blackMat; // 단색 검정 (베이스와 평행 유지)

  // "FRONT" 텍스트 — X축 기준 90° 세운 수직 평면 (박스는 그대로, 글자만 회전)
  // 텍스처 종횡비를 평면(frontW : frontD)과 동일하게 맞춰 글자 왜곡 방지
  const texScale = 16; // mm당 픽셀
  const fTexW = Math.round(frontW * texScale); // 평면 길이(좌우)
  const fTexH = Math.round(frontD * texScale); // 평면 높이
  const frontTex = new DynamicTexture('stageFrontTex', { width: fTexW, height: fTexH }, scene, true);
  const fctx = frontTex.getContext() as unknown as CanvasRenderingContext2D;

  // 검정 배경
  fctx.fillStyle = '#000000';
  fctx.fillRect(0, 0, fTexW, fTexH);

  // 글자가 평면을 벗어나지 않도록 폰트 크기 자동 계산
  // 가로쓰기: 글자 높이 → 평면 높이(fTexH), 글자 길이 → 평면 길이(fTexW)에 대응
  const frontText = 'FRONT';
  const marginRatio = 0.86; // 안쪽 여백(약 14%) 확보
  const capHeightFactor = 0.72; // 900 weight 대문자 실제 높이 ≈ 폰트 크기 × 0.72
  // 1) 평면 높이 기준 폰트 크기
  let fontSize = (fTexH * marginRatio) / capHeightFactor;
  // 2) 평면 길이를 넘으면 길이 기준으로 축소
  fctx.font = `900 ${fontSize}px sans-serif`;
  const lenLimit = fTexW * marginRatio;
  const measuredLen = fctx.measureText(frontText).width;
  if (measuredLen > lenLimit) {
    fontSize *= lenLimit / measuredLen;
  }
  fontSize = Math.floor(fontSize);

  // 흰색 글자 렌더링 — X축 기준 좌우반전 (가로쓰기, 평면 정중앙)
  fctx.font = `900 ${fontSize}px sans-serif`;
  fctx.textAlign = 'center';
  fctx.textBaseline = 'middle';
  fctx.fillStyle = '#ffffff';
  fctx.save();
  fctx.translate(fTexW, fTexH);
  fctx.scale(-1, -1); // X축 기준 좌우반전 + 상하 반전
  fctx.fillText(frontText, fTexW / 2, fTexH / 2);
  fctx.restore();
  frontTex.update();

  const frontMat = new StandardMaterial('stageFrontMat', scene);
  frontMat.diffuseTexture = frontTex;
  frontMat.emissiveTexture = frontTex; // 조명과 무관하게 글자 선명
  frontMat.specularColor = new Color3(0, 0, 0);
  frontMat.disableLighting = true;
  frontMat.backFaceCulling = false; // 양면 표시

  // "FRONT" 글자 평면 — 바닥과 평행하게 눕힌 수평 평면 (검정 박스 윗면)
  // CreatePlane은 기본적으로 XY평면(수직)에 생성됨 → X축으로 90° 눕혀 바닥과 평행
  const frontTextPlane = MeshBuilder.CreatePlane(
    'stageFrontText',
    { width: frontW, height: frontD, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  frontTextPlane.rotation.x = Math.PI / 2; // X축 기준 90° → 바닥과 평행
  // 검정 박스 윗면에 평행하게 배치 (Z-fighting 방지용 미세 오프셋)
  frontTextPlane.position = new Vector3(0, borderH / 2 + 0.02, halfZ + borderW / 2 + frontD / 2);
  frontTextPlane.isPickable = false;
  frontTextPlane.material = frontMat;

  // 바닥면 정중앙 표시 (검은색 점)
  const centerDot = MeshBuilder.CreateSphere('centerDot', { diameter: 6, segments: 24 }, scene);
  centerDot.position = new Vector3(0, 0, 0);
  centerDot.isPickable = false;
  centerDot.material = blackMat;
};

/**
 * 카메라를 특정 메쉬에 포커스
 */
export const focusOnMesh = (camera: ArcRotateCamera, mesh: Mesh): void => {
  // 메쉬의 바운딩 박스 계산
  const boundingInfo = mesh.getBoundingInfo();
  const center = boundingInfo.boundingBox.centerWorld;
  const radius = boundingInfo.boundingBox.extendSizeWorld.length();

  // 카메라 타겟 및 거리 설정
  camera.target = center;
  camera.radius = radius * 2.5; // 메쉬 크기의 2.5배 거리
};

/**
 * 씬의 모든 메쉬에 카메라 포커스
 * 카메라 target은 원점 (0,0,0)에 고정하고, radius만 조정
 */
export const focusOnAllMeshes = (camera: ArcRotateCamera, scene: Scene): void => {
  const meshes = scene.meshes.filter((m) => m.isVisible && m.getTotalVertices() > 0);

  if (meshes.length === 0) return;

  // 모든 메쉬의 바운딩 박스 합산
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  meshes.forEach((mesh) => {
    const boundingInfo = mesh.getBoundingInfo();
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;

    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);
  });

  const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  const radius = size.length();

  // 카메라 target은 항상 원점에 고정
  camera.target = Vector3.Zero();
  // 거리만 조정하여 모든 메쉬가 보이도록 설정
  camera.radius = Math.max(radius * 1.5, 50); // 최소 거리 50 유지
};

/**
 * Utility Layer 생성 (Gizmo용)
 */
export const createUtilityLayer = (scene: Scene): UtilityLayerRenderer => {
  const utilityLayer = new UtilityLayerRenderer(scene);
  return utilityLayer;
};

/**
 * Gizmo Manager 생성 및 설정
 */
export const createGizmoManager = (scene: Scene, utilityLayer: UtilityLayerRenderer): GizmoManager => {
  const gizmoManager = new GizmoManager(scene, 1, utilityLayer);

  // Disable auto-attach on click. We handle attachment manually based on selection.
  gizmoManager.usePointerToAttachGizmos = false;

  // Gizmo 활성화 설정
  gizmoManager.positionGizmoEnabled = true;
  gizmoManager.rotationGizmoEnabled = true;
  gizmoManager.scaleGizmoEnabled = false;
  // 선택 시 바운딩 박스(외곽선)는 표시하지 않는다.
  gizmoManager.boundingBoxGizmoEnabled = false;

  const positionGizmo = gizmoManager.gizmos.positionGizmo;
  const rotationGizmo = gizmoManager.gizmos.rotationGizmo;

  if (positionGizmo) {
    positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    // X·Y(바닥면) 및 Z(상하) 이동 화살표를 모두 표시한다.
    // 좌표 매핑: 사용자 Z(상하) = Babylon Y → yGizmo가 상하 이동을 담당한다.
  }

  if (rotationGizmo) {
    rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;
  }

  // boundingBoxGizmo를 꺼두면 메쉬에 SixDofDragBehavior(6자유도 자유 드래그)가
  // 자동 추가되지 않는다. 본체 드래그 이동은 STL 메쉬의 PointerDragBehavior
  // (바닥면 평면 제한)로 처리하며, 만일을 대비해 자유 드래그 이동도 꺼 둔다.
  gizmoManager.boundingBoxDragBehavior.disableMovement = true;

  return gizmoManager;
};
