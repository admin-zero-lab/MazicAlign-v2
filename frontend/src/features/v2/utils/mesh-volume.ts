import { Mesh, Vector3, VertexBuffer } from "@babylonjs/core";

/**
 * 닫힌 mesh 의 부피 (mm³).
 *
 * 알고리즘: signed tetrahedron volume from origin.
 *   각 삼각형 (v0, v1, v2) 에 대해 V_i = (v0 · (v1 × v2)) / 6.
 *   닫힌 mesh 라면 부호 합이 안쪽 = 양수.
 *   외향성이 반대로 baked 된 경우엔 음수 → 절댓값.
 *
 * 비닫 mesh (구멍 등) 에서는 의미 작지만 어림값으로는 동작.
 */
export function computeMeshVolumeMm3(mesh: Mesh): number {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices) return 0;

  mesh.computeWorldMatrix(true);
  const world = mesh.getWorldMatrix();

  const v0 = new Vector3();
  const v1 = new Vector3();
  const v2 = new Vector3();
  const cross = new Vector3();
  let volume = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i0],
      positions[i0 + 1],
      positions[i0 + 2],
      world,
      v0,
    );
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i1],
      positions[i1 + 1],
      positions[i1 + 2],
      world,
      v1,
    );
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i2],
      positions[i2 + 1],
      positions[i2 + 2],
      world,
      v2,
    );

    Vector3.CrossToRef(v1, v2, cross);
    volume += Vector3.Dot(v0, cross) / 6;
  }

  return Math.abs(volume);
}
