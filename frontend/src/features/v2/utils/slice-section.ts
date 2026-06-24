import { Mesh, Vector3, VertexBuffer } from "@babylonjs/core";

/**
 * 평면 Y = `y` 와 삼각형의 교차로 얻는 선분 한 개.
 * 점은 world 좌표의 (X, Z) — 평면 위라 Y 는 생략.
 */
export interface SliceSegment {
  a: [number, number];
  b: [number, number];
}

/** 닫힌 polygon (시계/반시계 무관, 마지막 점은 첫 점과 연결된 것으로 본다). */
export interface SlicePolygon {
  points: [number, number][];
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

/**
 * Segment 들을 endpoint matching 으로 연결해 닫힌 polygon 들로 만든다.
 *
 * 좌표를 1 µm (1e-3 mm) 단위로 양자화하여 endpoint 동등성 비교를 안전
 * 하게 한다. 한 점에 segment 가 정확히 2 개 incident 면 그 점은 폴리곤
 * 위. 시작점에서 한쪽으로 따라가다 시작점으로 돌아오면 폴리곤 1 개 완성.
 */
export function chainSegments(segs: SliceSegment[]): SlicePolygon[] {
  const QUANT = 1000; // 1µm

  // 양자화된 (qx, qz) → 점 ID
  const idMap = new Map<string, number>();
  const points: [number, number][] = [];

  const qkey = (p: [number, number]) =>
    `${Math.round(p[0] * QUANT)}_${Math.round(p[1] * QUANT)}`;

  function ensureId(p: [number, number]): number {
    const k = qkey(p);
    let id = idMap.get(k);
    if (id === undefined) {
      id = points.length;
      idMap.set(k, id);
      points.push(p);
    }
    return id;
  }

  // adjacency 리스트 (각 점에 인접한 점 ID).
  const adj = new Map<number, number[]>();
  for (const s of segs) {
    const ia = ensureId(s.a);
    const ib = ensureId(s.b);
    if (ia === ib) continue;
    if (!adj.has(ia)) adj.set(ia, []);
    if (!adj.has(ib)) adj.set(ib, []);
    adj.get(ia)!.push(ib);
    adj.get(ib)!.push(ia);
  }

  const visited = new Set<number>();
  const polygons: SlicePolygon[] = [];

  for (const startId of adj.keys()) {
    if (visited.has(startId)) continue;

    const polygon: [number, number][] = [];
    let prev = -1;
    let curr = startId;
    let safety = adj.size + 4; // 안전 카운터

    while (safety-- > 0) {
      visited.add(curr);
      polygon.push(points[curr]);

      const neighbors = adj.get(curr) ?? [];
      let next = -1;
      for (const n of neighbors) {
        if (n === prev) continue;
        if (n === startId && polygon.length > 2) {
          next = n;
          break;
        }
        if (!visited.has(n)) {
          next = n;
          break;
        }
      }

      if (next === -1 || next === startId) break;
      prev = curr;
      curr = next;
    }

    if (polygon.length >= 3) polygons.push({ points: polygon });
  }

  return polygons;
}

