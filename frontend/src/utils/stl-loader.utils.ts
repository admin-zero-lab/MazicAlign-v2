import { Scene, Mesh, Vector3, Quaternion, Color3, StandardMaterial } from '@babylonjs/core';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import type { Transform } from '@types/stl.types';

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

        // 기본 재질 설정
        const material = new StandardMaterial(`${fileName}_material`, scene);
        material.diffuseColor = new Color3(0.8, 0.8, 0.9);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        mesh.material = material;

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
