import { Curve3, Vector3 } from "@babylonjs/core";

type Vec3 = [number, number, number];
type Cps = Vec3[];

/**
 * t 비율 (i+1)/(n+1) 의 균등 분할 t 배열을 반환. 가변 길이 변곡점 케이스.
 */
function evenTs(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i + 1) / (n + 1));
  return out;
}

/**
 * Bridge 의 base / cps / contact 점들로 Catmull-Rom spline 을 만들어
 * 그 path 의 보간 점들을 반환한다. cps 가 비어있으면 base→contact
 * 2 점만 사용 (직선).
 */
function buildPath(base: Vec3, cps: Cps | undefined, contact: Vec3): Vector3[] {
  const points: Vector3[] = [new Vector3(base[0], base[1], base[2])];
  if (cps) {
    for (const cp of cps) points.push(new Vector3(cp[0], cp[1], cp[2]));
  }
  points.push(new Vector3(contact[0], contact[1], contact[2]));
  if (points.length < 2) return points;
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
 * 변곡점 n 개가 base→contact 직선상 균등 분할 ((i+1)/(n+1)) 위치에
 * 있는지 판정. 임계 0.1mm² (각 변곡점 ≈ 0.32mm 이내). follow 시
 * 직선이면 새 직선 reset, 곡선이면 끝점 비례 이동.
 */
export function isStraightCps(
  base: Vec3,
  cps: Cps,
  contact: Vec3,
): boolean {
  const ts = evenTs(cps.length);
  for (let i = 0; i < cps.length; i++) {
    const t = ts[i];
    const ex = base[0] + (contact[0] - base[0]) * t;
    const ey = base[1] + (contact[1] - base[1]) * t;
    const ez = base[2] + (contact[2] - base[2]) * t;
    const dx = cps[i][0] - ex;
    const dy = cps[i][1] - ey;
    const dz = cps[i][2] - ez;
    if (dx * dx + dy * dy + dz * dz > 0.1) return false;
  }
  return true;
}

/**
 * base→contact 직선상 균등 분할 위치로 변곡점 n 개 생성. 기본 n=3.
 */
export function straightCps(base: Vec3, contact: Vec3, n = 3): Cps {
  const ts = evenTs(n);
  return ts.map((t): Vec3 => [
    base[0] + (contact[0] - base[0]) * t,
    base[1] + (contact[1] - base[1]) * t,
    base[2] + (contact[2] - base[2]) * t,
  ]);
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

/**
 * t 비율 위치에 새 변곡점 삽입. 새 cps 배열 반환 (원본 미변경).
 * insert 위치 = path 위 t 점 좌표. cps 안에서 t 와 가장 가까운 위치에 삽입.
 */
export function insertControlPoint(
  base: Vec3,
  cps: Cps | undefined,
  contact: Vec3,
  t: number,
): Cps {
  const newPos = getBridgePathPoint(base, cps, contact, t);
  const existing = cps ?? [];
  // 새 변곡점이 t 비율 위치 → existing 안에서 그 위치보다 큰 t 가진
  // 변곡점들 앞에 삽입. 각 existing cp 의 t 를 path 위에서 다시 추정.
  const out: Cps = [];
  let inserted = false;
  for (const cp of existing) {
    const cpT = findClosestT(base, existing, contact, cp);
    if (!inserted && t < cpT) {
      out.push(newPos);
      inserted = true;
    }
    out.push(cp);
  }
  if (!inserted) out.push(newPos);
  return out;
}

/** 변곡점 idx 제거. 새 cps 배열 반환. */
export function removeControlPoint(cps: Cps, idx: number): Cps {
  return cps.filter((_, i) => i !== idx);
}
