import { Mesh, Vector3, VertexBuffer } from "@babylonjs/core";

/**
 * 평면 Y = `y` 와 삼각형의 교차로 얻는 선분 한 개.
 * 점은 world 좌표의 (X, Z) — 평면 위라 Y 는 생략.
 */
export interface SliceSegment {
  a: [number, number];
  b: [number, number];
}

const EPS = 1e-6;

/**
 * 한 mesh 를 Y=`y` 평면으로 자른 결과의 line segment 들.
 *
 * 알고리즘 (표준 marching triangles):
 *   1) 각 삼각형의 세 vertex 를 world 로 변환.
 *   2) 각 vertex 와 평면의 부호 거리(d = y_v - y).
 *   3) 부호가 다른 두 vertex 의 edge → 평면과의 교차점 1 개씩.
 *   4) 교차점 2 개가 모이면 line segment.
 *
 * vertex 가 정확히 평면 위 (|d| < EPS) 인 경우는 1 회만 카운트.
 * triangle 전체가 코플레너 (3 vertex 다 평면 위) 인 경우 skip.
 */
export function sliceMeshAtY(mesh: Mesh, y: number): SliceSegment[] {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices) return [];

  mesh.computeWorldMatrix(true);
  const world = mesh.getWorldMatrix();

  const out: SliceSegment[] = [];

  // 재사용 vector 들 — GC 압박 줄이기.
  const v0 = new Vector3();
  const v1 = new Vector3();
  const v2 = new Vector3();

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

    const d0 = v0.y - y;
    const d1 = v1.y - y;
    const d2 = v2.y - y;

    // 모두 같은 쪽이면 평면과 교차 안 함.
    if (d0 > EPS && d1 > EPS && d2 > EPS) continue;
    if (d0 < -EPS && d1 < -EPS && d2 < -EPS) continue;

    // 코플레너 (3 vertex 모두 평면) → skip.
    if (Math.abs(d0) < EPS && Math.abs(d1) < EPS && Math.abs(d2) < EPS) continue;

    const cross: [number, number][] = [];

    const tryEdge = (a: Vector3, b: Vector3, da: number, db: number) => {
      // 부호가 다른 edge: 정확히 t 비율로 교차.
      if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
        const t = da / (da - db);
        cross.push([a.x + t * (b.x - a.x), a.z + t * (b.z - a.z)]);
      } else if (Math.abs(da) < EPS) {
        // 시작 vertex 가 평면 위. 중복 방지를 위해 시작 쪽에서만 1 회.
        cross.push([a.x, a.z]);
      }
    };

    tryEdge(v0, v1, d0, d1);
    tryEdge(v1, v2, d1, d2);
    tryEdge(v2, v0, d2, d0);

    if (cross.length >= 2) {
      out.push({ a: cross[0], b: cross[1] });
    }
  }

  return out;
}
