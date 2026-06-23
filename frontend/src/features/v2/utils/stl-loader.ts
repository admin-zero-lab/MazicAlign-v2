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
 *  2. 빌드플레이트 정렬 (vertex shift):
 *       · X, Z = AABB center (모델이 플레이트 한가운데로)
 *       · Y    = AABB minimum → base 를 Y = liftMm 에 정렬
 *         (liftMm=0 이면 base 가 Y=0, liftMm=5 면 base 가 Y=5 위)
 *     mesh.position 은 (0,0,0) 으로 시작 → Transform Reset 시에도
 *     자동으로 base 가 다시 liftMm 위치로 복귀.
 *  3. 흰색 StandardMaterial 적용 → vertex color 그대로 보임.
 */
export async function loadStlIntoScene(
  scene: Scene,
  blob: Blob,
  meshName = "model",
  liftMm = 0,
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

  // 0) Babylon STL 로더가 face normal 을 (0,0,0) 영벡터로 import
  //    하는 STL (cylinder.STL 등) 에 대비해 vertex normal 을
  //    강제 재계산. 이미 정상 normal 이 있어도 멱등.
  mesh.createNormals(true);

  // 1) STL Z-up → Babylon Y-up.
  mesh.rotation.x = -Math.PI / 2;
  mesh.bakeCurrentTransformIntoVertices();

  // 1.5) auto-orient: 이미 Y-up 으로 export 된 STL 은 위 회전으로
  //      옆으로 누운 상태가 된다. AABB 분석으로 가장 긴 축이 Y 가
  //      아니면 추가 회전. 1.5× 임계로 대칭 모델 (cube 등) 보호.
  autoOrientUpright(mesh);

  // 2) 빌드플레이트에 정렬 (XZ center, Y base=liftMm).
  alignMeshToPlate(mesh, liftMm);

  // 3) Material — ChiTuBox 풍 청록빛 파란색.
  const mat = new StandardMaterial(`${meshName}-mat`, scene);
  mat.diffuseColor = new Color3(0.19, 0.55, 0.82); // 청록빛 파랑
  mat.specularColor = new Color3(0.04, 0.04, 0.04); // 거의 무광 (matte)
  // scene.ambientColor 가 적용되려면 material 측의 ambientColor 가
  // 0 이 아니어야 한다 (둘은 곱셈으로 결합).
  mat.ambientColor = new Color3(1, 1, 1);
  mat.backFaceCulling = true;
  mesh.material = mat;

  return mesh;
}

/**
 * AABB 분석으로 가장 긴 축이 Y 가 되게 추가 회전.
 *
 * Z-up 가정의 X 축 -90° 회전 후, 이미 Y-up 으로 export 된 STL 은
 * 옆으로 누워있다 (cylinder.STL 등). 가장 긴 축 (= 출력 방향 추정)
 * 이 Y 가 아니면 그 축을 Y 로 돌린다.
 *
 * 임계 RATIO = 1.5 — 가장 긴 축이 Y 보다 1.5× 이상 길어야 회전.
 * cube / 거의 등방인 모델은 그대로 둠 (사용자 의도 보호).
 */
function autoOrientUpright(mesh: Mesh): void {
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  const dx = bb.maximum.x - bb.minimum.x;
  const dy = bb.maximum.y - bb.minimum.y;
  const dz = bb.maximum.z - bb.minimum.z;
  const RATIO = 1.5;

  if (dx > dy * RATIO && dx >= dz) {
    // X 가 가장 길다 → Z 축 -90° 회전 → X 가 Y 가 됨.
    mesh.rotation.z = -Math.PI / 2;
    mesh.bakeCurrentTransformIntoVertices();
  } else if (dz > dy * RATIO && dz > dx) {
    // Z 가 가장 길다 → X 축 +90° 회전 → Z 가 Y 가 됨.
    mesh.rotation.x = Math.PI / 2;
    mesh.bakeCurrentTransformIntoVertices();
  }
}

/**
 * Mesh 의 vertex 를 빌드플레이트 정렬한다.
 *   · XZ: AABB center → 0     (모델이 플레이트 한가운데)
 *   · Y : AABB minimum → liftMm (base 가 Y=liftMm)
 * Normal 은 그대로 (translation 은 normal 에 영향 없음).
 */
function alignMeshToPlate(mesh: Mesh, liftMm: number): void {
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  const dx = bb.center.x;
  const dy = bb.minimum.y - liftMm;
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
