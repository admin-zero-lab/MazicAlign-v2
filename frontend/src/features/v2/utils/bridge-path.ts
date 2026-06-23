import { Curve3, Vector3 } from "@babylonjs/core";

type Vec3 = [number, number, number];
type Cps = [Vec3, Vec3, Vec3];

/**
 * Bridge 의 base / cps / contact 5 점 (또는 cps 없으면 2 점) 으로
 * Catmull-Rom spline 을 만들어 그 path 의 보간 점들을 반환한다.
 * 모든 follow / attach 계산이 이 공통 path 를 본다.
 */
function buildPath(base: Vec3, cps: Cps | undefined, contact: Vec3): Vector3[] {
  const points = cps
    ? [
        new Vector3(base[0], base[1], base[2]),
        new Vector3(cps[0][0], cps[0][1], cps[0][2]),
        new Vector3(cps[1][0], cps[1][1], cps[1][2]),
        new Vector3(cps[2][0], cps[2][1], cps[2][2]),
        new Vector3(contact[0], contact[1], contact[2]),
      ]
    : [
        new Vector3(base[0], base[1], base[2]),
        new Vector3(contact[0], contact[1], contact[2]),
      ];
  return Curve3.CreateCatmullRomSpline(points, 24, false).getPoints();
}

/**
 * t 비율 위치의 좌표. t ∈ [0, 1]. linear 보간으로 보간 점 사이를
 * 채운다.
 */
export function getBridgePathPoint(
  base: Vec3,
  cps: Cps | undefined,
  contact: Vec3,
  t: number,
): Vec3 {
  const path = buildPath(base, cps, contact);
  const tt = Math.max(0, Math.min(1, t));
  const last = path.length - 1;
  const f = tt * last;
  const i0 = Math.floor(f);
  const i1 = Math.min(last, i0 + 1);
  const frac = f - i0;
  const x = path[i0].x * (1 - frac) + path[i1].x * frac;
  const y = path[i0].y * (1 - frac) + path[i1].y * frac;
  const z = path[i0].z * (1 - frac) + path[i1].z * frac;
  return [x, y, z];
}

/**
 * target 좌표에 가장 가까운 path 위 점의 t 비율 (0..1).
 * 부착 시점에 한 번 계산해서 SupportPointV2.contactAttachedTo.t 에
 * 저장한다.
 */
export function findClosestT(
  base: Vec3,
  cps: Cps | undefined,
  contact: Vec3,
  target: Vec3,
): number {
  const path = buildPath(base, cps, contact);
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const dx = path[i].x - target[0];
    const dy = path[i].y - target[1];
    const dz = path[i].z - target[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx / (path.length - 1);
}
