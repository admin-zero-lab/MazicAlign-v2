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

  // 줌 속도 개선
  // wheelPrecision: default 50. Lower is faster.
  camera.wheelPrecision = 10;

  // 패닝 속도 및 관성 설정 (1:1 이동 느낌)
  // panningSensibility: default 1000. Lower is faster.
  // 10 was too fast (moved more than mouse). Increased to 50 to slow it down.
  camera.panningSensibility = 50;
  // panningInertia: default 0.9. 
  // User requested "smoothness" similar to rotation.
  // 0.1 was too stiff. 0.7 provides a good balance of 1:1 feel + smoothness.
  camera.panningInertia = 0.7;

  // 마우스 버튼 매핑
  // 0: Left, 1: Middle, 2: Right

  // Panning (이동): Middle Click (1)
  // Explicitly set property (and private property for older versions)
  (camera as any).panningMouseButton = 1;
  (camera as any)._panningMouseButton = 1;

  // Rotation (회전): Right Click (2)
  // Configure the pointers input to accept both Middle (Pan) and Right (Rotate)
  // Left Click (0) is excluded so it can be used for selection
  const pointersInput = (camera.inputs.attached.pointers as any);
  if (pointersInput) {
    pointersInput.buttons = [1, 2];
  }

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

  // 전면부 표시 — 정면(+Z) 가장자리 중앙, 바깥으로 돌출된 얇고 긴 직사각형 + "전면" 글자
  const frontW = 70; // 가로 길이(X) — 길게
  const frontD = 6; // 두께(Z 돌출 깊이) — 얇게
  const frontMarker = MeshBuilder.CreateBox(
    'stageFrontMarker',
    { width: frontW, height: borderH, depth: frontD },
    scene
  );
  frontMarker.position = new Vector3(0, 0, halfZ + borderW / 2 + frontD / 2);
  frontMarker.isPickable = false;

  // "전면" 텍스트 텍스처 (검정 배경 + 흰색 글자)
  const frontTex = new DynamicTexture('stageFrontTex', { width: 700, height: 60 }, scene, true);
  const fctx = frontTex.getContext();
  fctx.fillStyle = '#000000';
  fctx.fillRect(0, 0, 700, 60);
  frontTex.drawText('FRONT', null, 46, 'bold 46px sans-serif', '#ffffff', null, true);

  const frontMat = new StandardMaterial('stageFrontMat', scene);
  frontMat.diffuseTexture = frontTex;
  frontMat.emissiveTexture = frontTex; // 조명과 무관하게 글자 선명
  frontMat.specularColor = new Color3(0, 0, 0);
  frontMat.disableLighting = true;
  frontMarker.material = frontMat;

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
  gizmoManager.boundingBoxGizmoEnabled = true; // 바운딩 박스 표시 (조작 불가)

  const positionGizmo = gizmoManager.gizmos.positionGizmo;
  const rotationGizmo = gizmoManager.gizmos.rotationGizmo;
  const boundingBoxGizmo = gizmoManager.gizmos.boundingBoxGizmo;

  if (positionGizmo) {
    positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    // 이동 제한: X, Y축(바닥면) 직선 이동만 허용, Z축(상하) 이동 비활성화
    // 좌표 매핑: 사용자 Z(상하) = Babylon Y → yGizmo 비활성화
    positionGizmo.yGizmo.isEnabled = false;
  }

  if (rotationGizmo) {
    rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;
  }

  // Bounding Box는 시각적으로만 표시 (조작 핸들 비활성화)
  if (boundingBoxGizmo) {
    // 모든 스케일 박스 숨기기 (조작 포인트 제거)
    boundingBoxGizmo.setEnabledScaling(false);
    // 회전 핸들도 숨기기
    boundingBoxGizmo.setEnabledRotationAxis('');
    // 고정 크기로 표시
    boundingBoxGizmo.fixedDragMeshScreenSize = true;
  }

  // 본체(바운딩박스) 자유 드래그 무력화:
  // boundingBoxGizmoEnabled는 메쉬에 SixDofDragBehavior(6자유도 자유 드래그)를 자동
  // 추가하는데, 이것이 회전과 Z축(상하) 이동을 유발한다. disableMovement로 이동·회전을
  // 모두 끄고, 본체 드래그 이동은 STL 메쉬의 PointerDragBehavior(바닥면 평면 제한)로 처리한다.
  gizmoManager.boundingBoxDragBehavior.disableMovement = true;

  return gizmoManager;
};
