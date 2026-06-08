import {
  ArcRotateCamera,
  Color3,
  Mesh,
  Scene,
  SceneLoader,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/STL";

/**
 * STL Blob → Babylon Mesh.
 *
 * STL 좌표계 (Z-up) 를 Babylon (Y-up) 에 맞추기 위해 X 축 -90° 회전
 * 을 vertex 에 베이크한다. 베이크 후 normal 도 갱신되므로 오버행
 * 판정에서 -Y 만 보면 된다.
 *
 * material 은 흰색 StandardMaterial 로 잡아 vertex color 가 그대로
 * 표면에 보이게 한다.
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
  const mesh = meshes[0];
  mesh.name = meshName;

  // STL Z-up → Babylon Y-up: X 축 -90° 회전 후 vertex 에 베이크.
  mesh.rotation.x = -Math.PI / 2;
  mesh.bakeCurrentTransformIntoVertices();

  const mat = new StandardMaterial(`${meshName}-mat`, scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.12, 0.12, 0.12);
  mat.backFaceCulling = true;
  mesh.material = mat;

  return mesh;
}

/**
 * 주어진 Mesh 의 AABB 를 카메라에 맞춰 보기 좋게 프레임한다.
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
