import {
  Color3,
  Mesh,
  Scene,
  SceneLoader,
  StandardMaterial,
  VertexBuffer,
} from "@babylonjs/core";
import "@babylonjs/loaders/STL";

/**
 * STL Blob → Babylon Mesh.
 *
 *  1. STL Z-up → Babylon Y-up: X 축 -90° 회전을 vertex 에 베이크.
 *  2. AABB 중심을 local origin 으로 이동 (vertex shift) — Gizmo 가
 *     mesh.position 위치에 표시되므로 모델 중심에 정확히 떨어진다.
 *     이동량(centerOffset) 은 vertex 에 베이크되므로 mesh.position
 *     은 (0,0,0) 으로 시작한다.
 *  3. 흰색 StandardMaterial 적용 → vertex color 그대로 보임.
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

  // 1) STL Z-up → Babylon Y-up.
  mesh.rotation.x = -Math.PI / 2;
  mesh.bakeCurrentTransformIntoVertices();

  // 2) AABB 중심을 local origin 으로 이동.
  centerMeshOnOrigin(mesh);

  // 3) Material.
  const mat = new StandardMaterial(`${meshName}-mat`, scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.12, 0.12, 0.12);
  mat.backFaceCulling = true;
  mesh.material = mat;

  return mesh;
}

/**
 * Mesh 의 vertex 를 AABB 중심이 (0,0,0) 이 되도록 shift 한다.
 * Normal 은 그대로 (translation 은 normal 에 영향 없음).
 */
function centerMeshOnOrigin(mesh: Mesh): void {
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  const dx = bb.center.x;
  const dy = bb.center.y;
  const dz = bb.center.z;
  if (dx === 0 && dy === 0 && dz === 0) return;

  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;

  const shifted = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    shifted[i] = positions[i] - dx;
    shifted[i + 1] = positions[i + 1] - dy;
    shifted[i + 2] = positions[i + 2] - dz;
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, shifted, true);
  mesh.refreshBoundingInfo();
}
