import { Scene, Mesh, Vector3, Quaternion, Color3, StandardMaterial, Material, MaterialPluginBase, PointerDragBehavior } from '@babylonjs/core';
import type { Nullable } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import type { Transform } from '@types/stl.types';

/**
 * 바닥면(월드 Y=0) 아래로 통과한 부분을 빨간색으로 표시하는 머티리얼 플러그인
 */
class FloorClipMaterialPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'FloorClip', 200, {});
    this._enable(true);
  }

  getClassName(): string {
    return 'FloorClipMaterialPlugin';
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
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:
          'if (vFloorWorldY < 0.0) { color.rgb = vec3(0.85, 0.1, 0.1); }',
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
        originalCenter.y = mesh.getBoundingInfo().boundingBox.extendSize.y;

        // 기본 재질 설정
        const material = new StandardMaterial(`${fileName}_material`, scene);
        // 연회색 배경에서 잘 보이면서 눈의 피로를 덜어주는 차분한 청록색(세이지 틸)
        material.diffuseColor = new Color3(0.42, 0.6, 0.56);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        // 바닥면 아래로 통과한 부분을 빨간색으로 표시
        new FloorClipMaterialPlugin(material);
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
      (scene, message, exception) => {
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
 *   사용자 X  →  Babylon X  (변환 없음)
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

  mesh.position = new Vector3(
    originalCenter.x + transform.translation.x,    // X
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
