import {
  ArcRotateCamera,
  Mesh,
  Scene,
  SceneLoader,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/STL";

/**
 * STL Blob → Babylon Mesh. 옛 stl-loader.utils.ts 와 무관하게 다시
 * 짠다. Babylon 의 자체 STL 로더(@babylonjs/loaders) 를 사용한다.
 *
 * 반환 Mesh 는 scene 에 추가된 상태. 호출 측에서 dispose 책임.
 */
export async function loadStlIntoScene(
  scene: Scene,
  blob: Blob,
  meshName = "model",
): Promise<Mesh> {
  const file = new File([blob], `${meshName}.stl`, { type: "model/stl" });
  const result = await SceneLoader.ImportMeshAsync(
    "",
    "",
    file,
    scene,
    undefined,
    ".stl",
  );

  const meshes = result.meshes.filter((m): m is Mesh => m instanceof Mesh);
  if (meshes.length === 0) {
    throw new Error("STL 로드 결과에 메쉬가 없습니다.");
  }

  // STL 은 보통 하나의 메쉬. 여러 개라면 첫 번째.
  const mesh = meshes[0];
  mesh.name = meshName;
  return mesh;
}

/**
 * 주어진 Mesh 의 AABB 를 카메라에 맞춰 보기 좋게 프레임한다.
 *
 * STL 출력 좌표는 통상 Z-up 인데, Babylon 은 Y-up 이라 import 시점에
 * 90° 회전되어 들어온다. 우리는 Babylon 좌표계 그대로 보여준다.
 */
export function frameCameraToMesh(camera: ArcRotateCamera, mesh: Mesh): void {
  mesh.computeWorldMatrix(true);
  const bb = mesh.getBoundingInfo().boundingBox;
  const min = bb.minimumWorld;
  const max = bb.maximumWorld;

  const center = Vector3.Center(min, max);
  const diag = max.subtract(min).length();

  camera.target.copyFrom(center);
  camera.radius = diag * 1.8;
  camera.alpha = -Math.PI / 4;
  camera.beta = Math.PI / 3;
  camera.lowerRadiusLimit = diag * 0.3;
  camera.upperRadiusLimit = diag * 6;
}
