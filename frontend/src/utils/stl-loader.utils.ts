import { Scene, Mesh, Vector3, Quaternion, Color3, StandardMaterial, Material, MaterialPluginBase, PointerDragBehavior } from '@babylonjs/core';
import type { Nullable } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import type { Transform } from '@apptypes/stl.types';

/**
 * 바닥면(월드 Y=0)에 닿는 부분을 STL 색상의 보색(complementary color)으로 표시하는
 * 머티리얼 플러그인. 바닥면으로부터 FLOOR_CONTACT_BAND(mm) 이내의 영역이 대상이다.
 */
const FLOOR_CONTACT_BAND = 1.0; // 바닥면 접촉으로 간주하는 높이 범위(mm)

class FloorContactMaterialPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'FloorContact', 200, {});
    this._enable(true);
  }

  getClassName(): string {
    return 'FloorContactMaterialPlugin';
  }

  getCustomCode(shaderType: string): Nullable<{ [pointName: string]: string }> {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: 'varying float vFloorWorldY;',
        CUSTOM_VERTEX_MAIN_END: 'vFloorWorldY = worldPos.y;',
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: 'varying float vFloorWorldY;',
        // 바닥면 접촉 영역 → STL 색상(vDiffuseColor)의 보색으로 표시
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:
          `if (vFloorWorldY < ${FLOOR_CONTACT_BAND.toFixed(1)}) { color.rgb = vec3(1.0) - vDiffuseColor.rgb; }`,
      };
    }
    return null;
  }
}

/**
 * STL 파일 로드
 */
export const loadSTLFile = async (
  scene: Scene,
  fileUrl: string,
  fileName: string
): Promise<Mesh> => {
  // Check if scene is already disposed
  if (scene.isDisposed) {
    throw new Error('Scene has been disposed, cannot load file');
  }

  const loadUrl = fileUrl;

  return new Promise((resolve, reject) => {
    SceneLoader.ImportMesh(
      '',
      loadUrl,
      '',
      scene,
      (meshes) => {
        if (meshes.length === 0) {
          reject(new Error('No meshes loaded from STL file'));
          return;
        }

        // 첫 번째 메쉬를 가져오거나 모든 메쉬를 병합
        let mesh: Mesh;
        if (meshes.length === 1) {
          mesh = meshes[0] as Mesh;
        } else {
          // 여러 메쉬를 하나로 병합
          mesh = Mesh.MergeMeshes(
            meshes as Mesh[],
            true,
            true,
            undefined,
            false,
            true
          ) as Mesh;
        }

        // 메쉬 이름 설정
        mesh.name = fileName;

        // **바운딩박스 중심을 로컬 원점으로 설정 (회전 축 중심화)**
        // 1. 원래 바운딩박스 중심 계산
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo();
        const boundingInfo = mesh.getBoundingInfo();
        const originalCenter = boundingInfo.boundingBox.center.clone();

        // 2. 원래 중심을 metadata에 저장 (나중에 applyTransform에서 사용)
        mesh.metadata = {
          ...mesh.metadata,
          originalCenter: originalCenter
        };

        // 3. 버텍스를 원점 기준으로 재배치 (로컬 원점 = 바운딩박스 중심)
        const positions = mesh.getVerticesData('position');
        if (positions) {
          for (let i = 0; i < positions.length; i += 3) {
            positions[i] -= originalCenter.x;
            positions[i + 1] -= originalCenter.y;
            positions[i + 2] -= originalCenter.z;
          }
          mesh.setVerticesData('position', positions);
        }

        // 4. Mesh position 초기화 (applyTransform이 offset + translation 적용할 것임)
        mesh.position.set(0, 0, 0);
        mesh.refreshBoundingInfo();

        // 5. 빌드스테이지 바닥면 안착 보정
        //    버텍스를 바운딩박스 '중심'으로 재배치했기 때문에, originalCenter.y 를 그대로 두면
        //    applyTransform에서 객체 '중심'이 바닥면(Y=0)에 놓여 절반이 바닥 아래로 잠긴다.
        //    originalCenter.y 를 로컬 반높이로 보정하면 translation.z=0 일 때 객체 '바닥'이
        //    Y=0(빌드스테이지 바닥면)에 정확히 닿는다. applyTransform/getTransformFromMesh 가
        //    동일한 originalCenter 를 사용하므로 변환 왕복 일관성은 그대로 유지된다.
        //    x, z = 0 으로 두면 translation(0,0) 일 때 객체가 빌드스테이지 정중앙(검정 점)에 위치.
        originalCenter.x = 0;
        originalCenter.z = 0;
        originalCenter.y = mesh.getBoundingInfo().boundingBox.extendSize.y;

        // 기본 재질 설정
        const material = new StandardMaterial(`${fileName}_material`, scene);
        // 연회색 배경에서 잘 보이면서 눈의 피로를 덜어주는 차분한 청록색(세이지 틸)
        material.diffuseColor = new Color3(0.42, 0.6, 0.56);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        // 바닥면에 닿는 부분을 STL 색상의 보색으로 표시
        new FloorContactMaterialPlugin(material);
        mesh.material = material;

        // 바닥면(월드 XZ 평면) 위에서만 이동하는 드래그 비헤이비어
        // dragPlaneNormal=(0,1,0) → 마우스 광선을 수평면에 투영
        // moveAttached=false → behavior가 메쉬를 직접 옮기지 않음. 드래그 delta 중
        // X·Z 성분만 직접 적용하여 Y(상하) 이동을 원천적으로 차단(회전도 발생하지 않음).
        const floorDragBehavior = new PointerDragBehavior({
          dragPlaneNormal: new Vector3(0, 1, 0),
        });
        floorDragBehavior.useObjectOrientationForDragging = false; // 월드 기준 평면 고정
        floorDragBehavior.detachCameraControls = false; // 카메라 제어와 분리
        floorDragBehavior.moveAttached = false; // 위치는 아래에서 직접 제어
        floorDragBehavior.updateDragPlane = false; // 드래그 평면을 수평으로 고정
        floorDragBehavior.enabled = false; // 선택 시에만 활성화

        // 드래그 시 X·Z(바닥면)만 이동 — mesh.position.y 는 절대 변경하지 않음
        const dragTargetMesh = mesh;
        let dragLockedY = 0;
        floorDragBehavior.onDragStartObservable.add(() => {
          // 드래그 시작 시점의 높이(Y)를 기록
          dragLockedY = dragTargetMesh.position.y;
        });
        floorDragBehavior.onDragObservable.add((event) => {
          dragTargetMesh.position.x += event.delta.x;
          dragTargetMesh.position.z += event.delta.z;
          // 매 드래그 프레임마다 Y를 시작값으로 강제 고정 (상하 이동 원천 차단)
          dragTargetMesh.position.y = dragLockedY;
        });

        mesh.addBehavior(floorDragBehavior);

        // 메쉬 최적화
        mesh.convertToFlatShadedMesh();

        resolve(mesh);
      },
      null,
      (_scene, message) => {
        reject(new Error(`Failed to load STL: ${message}`));
      },
      '.stl'
    );
  });
};

/**
 * 메쉬에 Transform 적용
 * 
 * 좌표계 변환:
 * 사용자 좌표계 (UI):          Babylon.js 좌표계:
 *   Z (위)                       Y (위)
 *   |                            |
 *   |                            |
 *   +---- X (오른쪽)        →    +---- X (오른쪽)
 *  /                            /
 * Y (화면 밖, 카메라)          Z (화면 안쪽)
 * 
 * 축 매핑:
 *   사용자 X  →  Babylon X  (정방향: 홈 탑뷰의 좌우 방향을 반전)
 *   사용자 Y  →  Babylon -Z (Y→Z, 반전: 화면 밖 = Z-)
 *   사용자 Z  →  Babylon Y  (Z→Y, 위)
 */
export const applyTransform = (mesh: Mesh, transform: Transform): void => {
  // 원래 바운딩박스 중심 offset 가져오기
  const originalCenter = mesh.metadata?.originalCenter || new Vector3(0, 0, 0);

  // Translation 적용 (좌표계 변환 + 원래 중심 offset)
  // User X -> Babylon X
  // User Y -> Babylon Z (Forward/Backward) - Note: Usually Y is Forward in CAD, Z is Up. But here code comments said Y->-Z.
  // Let's stick to the mapping: User(x,y,z) -> Babylon(x, z, y) based on "Z (Up) -> Babylon Y (Up)"
  // Wait, the previous code had:
  // User Z (Up) -> Babylon Y (Up)
  // User Y (Camera?) -> Babylon Z (Screen In/Out)

  // Let's assume standard mapping:
  // User X -> Babylon X
  // User Y -> Babylon -Z (if Y is forward/depth)
  // User Z -> Babylon Y (Up)

  // 사용자 X 축은 Babylon X 와 부호를 동일하게 매핑한다.
  // (이전에는 반전 매핑이었으나, 홈 탑뷰의 좌우 방향이 반대로 보여 정방향으로 변경)
  mesh.position = new Vector3(
    originalCenter.x + transform.translation.x,    // User X -> Babylon X
    originalCenter.y + transform.translation.z,    // User Z -> Babylon Y
    originalCenter.z - transform.translation.y     // User Y -> Babylon -Z
  );

  // Rotation 적용 (Quaternion)
  // 축 매핑에 따라 quaternion 성분도 재배치
  mesh.rotationQuaternion = new Quaternion(
    transform.rotation.x,       // X축 회전 유지
    transform.rotation.z,       // Z축 회전 → Y축 회전
    -transform.rotation.y,      // Y축 회전 → -Z축 회전
    transform.rotation.w        // W 유지
  );

  // Scale 적용 (축 매핑)
  mesh.scaling = new Vector3(
    transform.scale.x,          // X: 변환 없음
    transform.scale.z,          // Z → Y
    transform.scale.y           // Y → Z
  );
};

/**
 * 메쉬에서 현재 Transform 가져오기
 * (applyTransform의 역변환)
 * 
 * Babylon → 사용자 좌표계:
 *   Babylon X → 사용자 X
 *   Babylon Y → 사용자 Z
 *   Babylon Z → 사용자 -Y
 */
export const getTransformFromMesh = (mesh: Mesh): Transform => {
  const rotation = mesh.rotationQuaternion || Quaternion.Identity();
  const originalCenter = mesh.metadata?.originalCenter || new Vector3(0, 0, 0);

  // Calculate relative translation by subtracting originalCenter
  const relativePos = mesh.position.subtract(originalCenter);

  return {
    translation: {
      x: relativePos.x,           // Babylon X -> User X
      y: -relativePos.z,          // Babylon Z -> User -Y (Reverse of Y->-Z)
      z: relativePos.y,           // Babylon Y -> User Z
    },
    rotation: {
      x: rotation.x,            // X축 회전 유지
      y: -rotation.z,           // Babylon Z축 회전 → 사용자 Y축 회전 (반전)
      z: rotation.y,            // Babylon Y축 회전 → 사용자 Z축 회전
      w: rotation.w,            // W 유지
    },
    scale: {
      x: mesh.scaling.x,        // X: 변환 없음
      y: mesh.scaling.z,        // Babylon Z → 사용자 Y
      z: mesh.scaling.y,        // Babylon Y → 사용자 Z
    },
  };
};

/**
 * 메쉬를 빌드스테이지 정중앙(X=0, Z=0) + 바닥면(Y=0) 위에 정렬
 */
export const centerMeshOnFloor = (mesh: Mesh): void => {
  mesh.position.x = 0;
  mesh.position.z = 0;
  mesh.computeWorldMatrix(true);
  // 바닥면(Y=0) 위에 안착하도록 높이 보정
  const minY = mesh.getBoundingInfo().boundingBox.minimumWorld.y;
  mesh.position.y -= minY;
  mesh.computeWorldMatrix(true);
};

/**
 * 리셋용 배열 함수.
 * 입력된 모든 메쉬의 회전을 0(기본 자세)으로 되돌린 뒤, X축을 따라 빌드스테이지
 * 정중앙(원점)을 기준으로 gap(mm) 간격을 유지하며 일렬로 배열하고, 각 메쉬를
 * 바닥면(Y=0)에 안착시킨다.
 */
export const arrangeMeshesCentered = (meshes: Mesh[], gap: number): void => {
  if (meshes.length === 0) return;

  // 1) 회전 초기화 — 축 정렬 폭을 정확히 측정하기 위해 먼저 수행
  meshes.forEach((mesh) => {
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.computeWorldMatrix(true);
  });

  // 2) 각 메쉬의 X축 폭 측정 (위치와 무관하게 max-min)
  const widths = meshes.map((mesh) => {
    const bb = mesh.getBoundingInfo().boundingBox;
    return bb.maximumWorld.x - bb.minimumWorld.x;
  });

  // 3) 전체 배열 폭 → 중앙 기준 좌측 시작점
  const totalWidth =
    widths.reduce((sum, w) => sum + w, 0) + gap * (meshes.length - 1);
  let cursor = -totalWidth / 2;

  // 4) 좌→우로 배치하고 각 메쉬를 바닥면에 안착
  meshes.forEach((mesh, i) => {
    const w = widths[i];
    // 메쉬 로컬 원점 = 바운딩박스 중심이므로 position.x = 배치 중심 X
    mesh.position.x = cursor + w / 2;
    mesh.position.z = 0;
    cursor += w + gap;
    mesh.computeWorldMatrix(true);
    // 바닥면(Y=0) 위에 안착
    const minY = mesh.getBoundingInfo().boundingBox.minimumWorld.y;
    mesh.position.y -= minY;
    mesh.computeWorldMatrix(true);
  });
};

/**
 * 메쉬가 바닥면(Y=0) 아래로 침투한 경우 위로 들어올려 안착시킨다.
 * 일반 이동·회전으로 인한 바닥면 침투를 막는 용도. 사용자가 Z(높이) 축에 음수
 * 값을 명시적으로 입력한 경우에는 이 함수를 호출하지 않아 침투를 허용한다.
 */
export const clampMeshAboveFloor = (mesh: Mesh): void => {
  mesh.computeWorldMatrix(true);
  const minY = mesh.getBoundingInfo().boundingBox.minimumWorld.y;
  if (minY < -0.0001) {
    mesh.position.y -= minY;
    mesh.computeWorldMatrix(true);
  }
};

/**
 * 메쉬 이동
 */
export const translateMesh = (mesh: Mesh, delta: Vector3): void => {
  mesh.position.addInPlace(delta);
};

/**
 * 메쉬 회전 (Quaternion)
 */
export const rotateMesh = (mesh: Mesh, deltaQuaternion: Quaternion): void => {
  if (!mesh.rotationQuaternion) {
    mesh.rotationQuaternion = Quaternion.Identity();
  }
  mesh.rotationQuaternion = mesh.rotationQuaternion.multiply(deltaQuaternion);
};

/**
 * 메쉬 스케일
 */
export const scaleMesh = (mesh: Mesh, scaleFactors: Vector3): void => {
  mesh.scaling.multiplyInPlace(scaleFactors);
};

/**
 * 메쉬 색상 변경
 */
export const setMeshColor = (mesh: Mesh, color: Color3): void => {
  if (mesh.material instanceof StandardMaterial) {
    mesh.material.diffuseColor = color;
  } else {
    const material = new StandardMaterial(`${mesh.name}_material`, mesh.getScene());
    material.diffuseColor = color;
    mesh.material = material;
  }
};

/**
 * 메쉬 하이라이트 (선택 시)
 */
export const highlightMesh = (mesh: Mesh, highlight: boolean): void => {
  if (highlight) {
    setMeshColor(mesh, new Color3(0.3, 0.7, 1.0)); // 파란색
  } else {
    setMeshColor(mesh, new Color3(0.8, 0.8, 0.9)); // 기본 회색
  }
};

/**
 * 메쉬 가시성 설정
 */
export const setMeshVisibility = (mesh: Mesh, visible: boolean): void => {
  mesh.isVisible = visible;
};

/**
 * 메쉬 투명도 설정
 */
export const setMeshOpacity = (mesh: Mesh, alpha: number): void => {
  // Use mesh.visibility for simpler and more reliable transparency
  mesh.visibility = alpha;

  // Also set material alpha if available, just in case
  if (mesh.material instanceof StandardMaterial) {
    mesh.material.alpha = alpha;
  }
};
