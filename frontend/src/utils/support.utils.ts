import {
  Scene,
  Mesh,
  Vector3,
  Quaternion,
  Ray,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { SupportSettings, SupportPoint } from '@apptypes/support.types';
import { SliceEngine } from '@services/slicer/SliceEngine';
import type { SliceSettings, Point as Point2D } from '@services/slicer/types';

/** 빌드플레이트(Y=0)에 거의 닿은 면은 이미 지지되므로 서포트 대상에서 제외 */
const FLOOR_SKIP_HEIGHT = 0.4;

/** 오버행 후보 점 (월드 좌표 + 삼각형 넓이 + 표면 외향 법선) */
interface OverhangPoint {
  x: number;
  y: number;
  z: number;
  area: number;
  nx?: number;
  ny?: number;
  nz?: number;
}

/** cylinder 의 기본 축(+Y) 을 target 단위 방향으로 회전시키는 쿼터니언.
 *  Rodrigues 공식: axis = (0,1,0) × target = (t.z, 0, -t.x), angle = arccos(t.y) */
const quaternionFromYAxisTo = (target: Vector3): Quaternion => {
  const t = target.clone().normalize();
  const dot = t.y;
  if (dot > 0.999999) return Quaternion.Identity();
  if (dot < -0.999999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  const ax = t.z;
  const az = -t.x;
  const len = Math.sqrt(ax * ax + az * az);
  const axis = new Vector3(ax / len, 0, az / len);
  return Quaternion.RotationAxis(axis, Math.acos(dot));
};

/** XZ 평면에서 점(px,pz)이 삼각형 abc 내부에 있는지 검사. */
const pointInTriangleXZ = (
  px: number,
  pz: number,
  a: Vector3,
  b: Vector3,
  c: Vector3
): boolean => {
  const v0x = c.x - a.x;
  const v0z = c.z - a.z;
  const v1x = b.x - a.x;
  const v1z = b.z - a.z;
  const v2x = px - a.x;
  const v2z = pz - a.z;
  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return false;
  const u = (dot11 * dot02 - dot01 * dot12) / denom;
  const v = (dot00 * dot12 - dot01 * dot02) / denom;
  return u >= 0 && v >= 0 && u + v <= 1;
};

/** 삼각형 abc 위의 (px,pz) 에서 barycentric Y 보간. */
const interpolateYAtXZ = (
  px: number,
  pz: number,
  a: Vector3,
  b: Vector3,
  c: Vector3
): number => {
  const denom = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(denom) < 1e-12) return a.y;
  const w0 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / denom;
  const w1 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / denom;
  const w2 = 1 - w0 - w1;
  return w0 * a.y + w1 * b.y + w2 * c.y;
};

/**
 * 메쉬 표면을 XZ 평면 격자로 균일 샘플링해 contact 후보점을 만든다.
 *
 * 단계:
 *   1) winding 외향성 다수결 판정 → 내향 메쉬는 노멀 부호 보정 (flipSign)
 *   2) *모든* 표면 삼각형 수집 (각도/노멀 부호 필터 없음 — 회전 모델 전체 지지 위해)
 *   3) AABB 중심 기준 spacing 격자 (박스 안 균일·박스 간 동일 상대 패턴)
 *   4) 각 격자점에서 위 광선 첫 교차 = 가장 낮은 Y 면 + 그 면의 외향 법선
 *
 * `angleDeg` 는 현재 미사용 (UI 슬라이더 효과 없음 — 향후 오버행 전용 모드 추가 시 부활).
 * `spacing` ≤ 0 이면 빈 배열. 결과는 결정론적·균일.
 */
export const detectOverhangPoints = (
  mesh: Mesh,
  // `_angleDeg` 는 현재 미사용 (UI 슬라이더 효과 없음 — 향후 오버행 전용 모드용).
  _angleDeg: number,
  spacing: number
): OverhangPoint[] => {
  if (spacing <= 0) return [];
  mesh.computeWorldMatrix(true);
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions || !indices) return [];

  const wm = mesh.getWorldMatrix();

  // 외부 도구에서 export 된 STL 중 face winding 이 뒤집힌 경우(노멀이 내부 향함)가
  // 있어, 메쉬 중심 기준 다수결로 외향/내향을 판정해 부호 보정한다.
  const bbCenter = mesh.getBoundingInfo().boundingBox.center;
  let outwardVotes = 0;
  let inwardVotes = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny0 = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const fcx = (positions[a] + positions[b] + positions[c]) / 3;
    const fcy = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
    const fcz = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
    const dot = nx * (fcx - bbCenter.x) + ny0 * (fcy - bbCenter.y) + nz * (fcz - bbCenter.z);
    if (dot > 0) outwardVotes++;
    else if (dot < 0) inwardVotes++;
  }
  const flipSign = inwardVotes > outwardVotes ? -1 : 1;

  // 2) 모든 모델 표면 삼각형 수집 (월드 좌표).
  //    angleDeg/노멀 부호 필터는 적용하지 않는다 — 회전된 모델·복잡 형상에서
  //    AABB 격자점에서 위로 광선이 가장 먼저 닿는 모델 표면을 contact 로 잡아
  //    "라프트 면적(=모델 AABB X·Z) 전체에 서포트"가 깔리도록 한다.
  //    samplePointOnOverhang 이 격자점별로 *가장 낮은 Y* 면을 자동 선택하므로
  //    위쪽 향한 천장 면은 자연스럽게 contact 가 되지 않는다.
  //    (flipSign 은 samplePointOnOverhang 의 closure 안에서 외향 법선 부호 보정에 사용)
  type Tri = { a: Vector3; b: Vector3; c: Vector3 };
  const tris: Tri[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const vt0 = new Vector3();
  const vt1 = new Vector3();
  const vt2 = new Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    Vector3.TransformCoordinatesFromFloatsToRef(positions[a], positions[a + 1], positions[a + 2], wm, vt0);
    Vector3.TransformCoordinatesFromFloatsToRef(positions[b], positions[b + 1], positions[b + 2], wm, vt1);
    Vector3.TransformCoordinatesFromFloatsToRef(positions[c], positions[c + 1], positions[c + 2], wm, vt2);

    const e1 = vt1.subtract(vt0);
    const e2 = vt2.subtract(vt0);
    const crossLen = Vector3.Cross(e1, e2).length();
    if (crossLen < 1e-9) continue;

    tris.push({ a: vt0.clone(), b: vt1.clone(), c: vt2.clone() });
    if (vt0.x < minX) minX = vt0.x;
    if (vt1.x < minX) minX = vt1.x;
    if (vt2.x < minX) minX = vt2.x;
    if (vt0.x > maxX) maxX = vt0.x;
    if (vt1.x > maxX) maxX = vt1.x;
    if (vt2.x > maxX) maxX = vt2.x;
    if (vt0.z < minZ) minZ = vt0.z;
    if (vt1.z < minZ) minZ = vt1.z;
    if (vt2.z < minZ) minZ = vt2.z;
    if (vt0.z > maxZ) maxZ = vt0.z;
    if (vt1.z > maxZ) maxZ = vt1.z;
    if (vt2.z > maxZ) maxZ = vt2.z;
  }
  if (tris.length === 0) return [];

  // 헬퍼 — 한 점이 어느 오버행 삼각형 위에 있으면 (X,Z,Y) + 외향 법선 반환.
  const samplePointOnOverhang = (
    x: number,
    z: number
  ): { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null => {
    let bestY = Infinity;
    let bestNx = 0;
    let bestNy = -1;
    let bestNz = 0;
    for (const t of tris) {
      if (!pointInTriangleXZ(x, z, t.a, t.b, t.c)) continue;
      const y = interpolateYAtXZ(x, z, t.a, t.b, t.c);
      if (y >= bestY) continue;
      bestY = y;
      const e1x = t.b.x - t.a.x;
      const e1y = t.b.y - t.a.y;
      const e1z = t.b.z - t.a.z;
      const e2x = t.c.x - t.a.x;
      const e2y = t.c.y - t.a.y;
      const e2z = t.c.z - t.a.z;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      bestNx = (nx / len) * flipSign;
      bestNy = (ny / len) * flipSign;
      bestNz = (nz / len) * flipSign;
    }
    if (bestY === Infinity || bestY <= FLOOR_SKIP_HEIGHT) return null;
    return { x, y: bestY, z, nx: bestNx, ny: bestNy, nz: bestNz };
  };

  // 3) XZ 격자 — 모델 AABB 중심 기준 정렬. 박스 안에서 균일하고, 박스가 월드에
  //    어디 놓이든 동일한 *상대* 격자 패턴이 된다. (월드 (0,0) 절대 정렬 + boundary
  //    이중 origin 혼합 방식은 박스 위치에 따라 패턴이 달라져서 제거함.)
  const points: OverhangPoint[] = [];
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const halfX = Math.floor((maxX - centerX) / spacing);
  const halfZ = Math.floor((maxZ - centerZ) / spacing);
  for (let ix = -halfX; ix <= halfX; ix++) {
    const x = centerX + ix * spacing;
    for (let iz = -halfZ; iz <= halfZ; iz++) {
      const z = centerZ + iz * spacing;
      const s = samplePointOnOverhang(x, z);
      if (s) points.push({ x: s.x, y: s.y, z: s.z, area: spacing * spacing, nx: s.nx, ny: s.ny, nz: s.nz });
    }
  }
  return points;
};

/**
 * @deprecated 현재 미사용. 격자 균일 분포(detectOverhangPoints 가 AABB 중심 기준
 * spacing 격자로 직접 샘플)로 대체되어 그리디 거리 솎아내기는 불필요.
 * 외부 호출처 없음 — 사용자 동의 시 제거 예정.
 */
export const thinPoints = (points: OverhangPoint[], spacing: number): OverhangPoint[] => {
  const sorted = [...points].sort((p, q) => q.area - p.area);
  const accepted: OverhangPoint[] = [];
  const minSq = spacing * spacing;

  for (const p of sorted) {
    let tooClose = false;
    for (const acc of accepted) {
      const dx = p.x - acc.x;
      const dy = p.y - acc.y;
      const dz = p.z - acc.z;
      if (dx * dx + dy * dy + dz * dz < minSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) accepted.push(p);
  }

  return accepted;
};

/** Ray casting 알고리즘으로 점 (px, py) 가 2D 폴리곤 안에 있는지 검사. */
const pointInPolygon2D = (px: number, py: number, poly: Point2D[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * 모델을 미리 슬라이스해 *공중에서 처음 출력되는 영역(=새 폴리곤)* 과 *섬(=이전 층 폴리곤
 * 어디에도 포함되지 않는 고립 폴리곤)* 의 위치를 contact 후보로 검출한다.
 *
 * 격자 분포가 놓치는 작은 고립 영역까지 우선 서포트 보장하기 위함. 기존 격자 결과와
 * 병합 사용(generateAutoSupports 안에서 거리 솎아냄).
 *
 * @param mesh 검출 대상 모델 메쉬
 * @param layerHeight 슬라이스 간격(mm) — Slicer 의 layerHeight 와 동일 권장
 * @returns 섬·새 폴리곤 위치의 contact 다발 (Babylon 월드 좌표). layerHeight ≤ 0 또는
 *          정점·인덱스가 없으면 빈 배열.
 */
export const detectIslandsFromSlicing = (
  mesh: Mesh,
  layerHeight: number
): OverhangPoint[] => {
  if (layerHeight <= 0.001) return [];
  mesh.computeWorldMatrix(true);
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions || !indices) return [];

  // 1) 정점을 world 좌표로 변환 + Babylon(Y-up) → Slicer(Z-up) 매핑.
  //    SliceEngine 은 flat positions Float32Array (삼각형마다 3 정점 X 3 좌표) 를 받는다.
  const wm = mesh.getWorldMatrix();
  const flat = new Float32Array(indices.length * 3);
  const tv = new Vector3();
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i] * 3;
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[idx],
      positions[idx + 1],
      positions[idx + 2],
      wm,
      tv
    );
    // Babylon (X, Y_up, Z) → Slicer (X, Y, Z_up) — Babylon Z 가 Slicer Y, Babylon Y 가 Slicer Z
    flat[i * 3] = tv.x;
    flat[i * 3 + 1] = tv.z;
    flat[i * 3 + 2] = tv.y;
  }

  // 2) SliceEngine 호출. layerHeight 외 다른 필드는 슬라이스 결과에 영향 없으므로 더미.
  const sliceSettings: SliceSettings = {
    layerHeight,
    buildWidth: 1000,
    buildDepth: 1000,
    buildHeight: 1000,
    fdmSpeed: 0,
    fdmExtrusionRate: 0,
    nozzleDiameter: 0,
    wallCount: 0,
    infillPercentage: 0,
    infillPattern: 'lines',
    infillOverlapPercentage: 0,
    wallOverlapPercentage: 0,
    outerWallOverlapPercentage: 0,
    wallPrintOrder: 'outer-to-inner',
    printOrder: 'walls-first',
    enableGapFilling: false,
    resolutionX: 0,
    resolutionY: 0,
    pixelSize: 0,
    lightPower: 0,
    exposureTime: 0,
    zLiftSpeed: 0,
  };
  let layers;
  try {
    const engine = new SliceEngine(flat, sliceSettings);
    layers = engine.slice();
  } catch {
    return [];
  }
  if (!layers || layers.length === 0) return [];

  // 3) 층별 *새 폴리곤* 검출.
  //    - layer.z <= FLOOR_SKIP_HEIGHT (빌드플레이트 닿음) 은 스킵
  //    - *유효 첫 층* (prevValidLayer === null) 의 모든 폴리곤은 *무조건* contact 등록.
  //      (회전 박스 꼭짓점 같이 볼록 모델의 첫 출력 영역이 누락되는 것 방지)
  //    - 그 이후 층은 centroid-in-prev 검사 — 이전 유효 층의 어떤 폴리곤 안에도 안
  //      들어가면 새 폴리곤(섬 또는 측면 캔틸레버 시작).
  const islands: OverhangPoint[] = [];
  let prevValidLayer: typeof layers[number] | null = null;
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    if (layer.z <= FLOOR_SKIP_HEIGHT) continue;

    for (const poly of layer.polygons) {
      if (poly.length < 3) continue;
      let cx = 0;
      let cy = 0;
      for (const p of poly) {
        cx += p.x;
        cy += p.y;
      }
      cx /= poly.length;
      cy /= poly.length;

      let isNew = true;
      if (prevValidLayer) {
        for (const prevPoly of prevValidLayer.polygons) {
          if (pointInPolygon2D(cx, cy, prevPoly)) {
            isNew = false;
            break;
          }
        }
      }
      if (!isNew) continue;

      // 4) Slicer (X, Y, Z_up) → Babylon (X, Y_up=Z, Z=Y) 역변환.
      islands.push({
        x: cx,
        y: layer.z,
        z: cy,
        area: 0,
      });
    }

    prevValidLayer = layer;
  }
  return islands;
};

/**
 * 모델 정점 중 *가장 낮은 Y* 위치에 무조건 contact 후보를 등록한다.
 * 격자·슬라이스 검출이 어떤 이유로든 잡지 못한 경우에도 *첫 출력점* 서포트 보장.
 *
 * - minY <= FLOOR_SKIP_HEIGHT 면 빌드플레이트 닿음 → 등록 안 함
 * - 같은 Y(±0.01mm) 정점이 여러 개면 X·Z 1mm 안쪽은 한 점으로 통합
 * - 결과 contact 는 normal 미지정 → buildSupportMesh 가 수직 fallback
 */
export const detectFirstPrintContacts = (mesh: Mesh): OverhangPoint[] => {
  mesh.computeWorldMatrix(true);
  const positions = mesh.getVerticesData('position');
  if (!positions) return [];
  const wm = mesh.getWorldMatrix();

  const tv = new Vector3();
  let minY = Infinity;
  const verts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], wm, tv);
    verts.push({ x: tv.x, y: tv.y, z: tv.z });
    if (tv.y < minY) minY = tv.y;
  }
  if (minY === Infinity || minY <= FLOOR_SKIP_HEIGHT) return [];

  const yTol = 0.01;
  const xzTol2 = 1.0; // 1mm 거리
  const result: OverhangPoint[] = [];
  for (const v of verts) {
    if (v.y > minY + yTol) continue;
    let close = false;
    for (const r of result) {
      const dx = v.x - r.x;
      const dz = v.z - r.z;
      if (dx * dx + dz * dz < xzTol2) {
        close = true;
        break;
      }
    }
    if (!close) result.push({ x: v.x, y: v.y, z: v.z, area: 0 });
  }
  return result;
};

/**
 * 한 점에서 수직 아래로 광선을 쏴 모델 표면 착지점을 찾는다.
 * 모델에 막히지 않으면 null (→ 빌드플레이트에 착지).
 */
export const raycastDown = (
  scene: Scene,
  from: Vector3,
  modelMeshes: Mesh[]
): Vector3 | null => {
  const meshSet = new Set<Mesh>(modelMeshes);
  const ray = new Ray(from, new Vector3(0, -1, 0), 100000);
  const info = scene.pickWithRay(ray, (m) => meshSet.has(m as Mesh));
  if (info && info.hit && info.pickedPoint) return info.pickedPoint;
  return null;
};

/**
 * 자동 서포트 생성 — 모델의 오버행을 분석해 서포트 점 목록을 만든다.
 *
 * 검출 우선순위:
 *   1) 슬라이스 기반 *섬·공중 시작 폴리곤* (layerHeight 가 주어진 경우만)
 *   2) XZ 평면 격자 (모델 AABB 전체 면적 균일 분포)
 *   두 결과를 병합하되 격자 점과 spacing*0.5 이내의 섬은 중복 제거.
 *
 * @param platformOnly true면 모든 서포트를 빌드플레이트(Y=0)까지 곧장 내린다.
 * @param layerHeight 슬라이스 간격(mm). 0 또는 미전달이면 슬라이스 검출 생략.
 */
export const generateAutoSupports = (
  scene: Scene,
  modelMesh: Mesh,
  stlId: string,
  allModelMeshes: Mesh[],
  settings: SupportSettings,
  platformOnly: boolean,
  layerHeight = 0
): SupportPoint[] => {
  // 밀도가 높을수록 간격이 좁아진다. 크로스 너비를 기준 간격으로 사용.
  const spacing = Math.max(
    settings.contactDiameter * 2,
    settings.crossWidth * (100 / Math.max(settings.density, 1))
  );
  // 2순위 — XZ 평면 격자 (메쉬 세분화 무관 균일 분포)
  const gridOverhangs = detectOverhangPoints(modelMesh, settings.overhangAngle, spacing);

  // 0순위 — *첫 출력 영역* 보장: 모델 minY 정점들 무조건 contact 추가.
  // 격자·슬라이스 검출이 어떤 이유로든 잡지 못한 경우에도 회전 박스 꼭짓점 같은
  // *가장 낮은 시작점* 에 서포트가 항상 형성된다.
  let firstPrintOverhangs = detectFirstPrintContacts(modelMesh);

  // 1순위 — 슬라이스 기반 섬·공중 시작 폴리곤 (layerHeight 전달 시)
  let islandOverhangs: OverhangPoint[] = [];
  if (layerHeight > 0.001) {
    islandOverhangs = detectIslandsFromSlicing(modelMesh, layerHeight);
  }

  // normal 보강 — 0순위/1순위 contact 는 normal 없어서 수직 fallback. 회전 모델 경사면에서
  // 콘이 표면 옆으로 빠짐. 격자(2순위)의 normal 을 *근처 점*에서 빌려와 보강.
  const enrichSq = spacing * spacing; // 격자 1칸 거리
  const enrichNormal = (o: OverhangPoint): OverhangPoint => {
    if (o.nx !== undefined && o.ny !== undefined && o.nz !== undefined) return o;
    let bestG: OverhangPoint | null = null;
    let bestDist2 = Infinity;
    for (const g of gridOverhangs) {
      const dx = o.x - g.x;
      const dz = o.z - g.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < enrichSq && d2 < bestDist2) {
        bestG = g;
        bestDist2 = d2;
      }
    }
    if (bestG && bestG.ny !== undefined) {
      return { ...o, nx: bestG.nx, ny: bestG.ny, nz: bestG.nz };
    }
    return o;
  };
  firstPrintOverhangs = firstPrintOverhangs.map(enrichNormal);
  islandOverhangs = islandOverhangs.map(enrichNormal);

  // 우선순위 병합: 0순위(첫 출력) → 1순위(섬·슬라이스) → 2순위(격자).
  // 0순위에 *너무 가까운* 1·2 순위는 제거(spacing × 0.3 = 강한 보존).
  // 0순위는 *어떤 경우에도 제거되지 않음*.
  const preserve2 = spacing * 0.3;
  const preserveSq = preserve2 * preserve2;
  const islandsFiltered = islandOverhangs.filter((isl) => {
    for (const f of firstPrintOverhangs) {
      const dx = isl.x - f.x;
      const dz = isl.z - f.z;
      if (dx * dx + dz * dz < preserveSq) return false;
    }
    return true;
  });
  const gridFiltered = gridOverhangs.filter((g) => {
    for (const f of firstPrintOverhangs) {
      const dx = g.x - f.x;
      const dz = g.z - f.z;
      if (dx * dx + dz * dz < preserveSq) return false;
    }
    for (const isl of islandsFiltered) {
      const dx = g.x - isl.x;
      const dz = g.z - isl.z;
      if (dx * dx + dz * dz < preserveSq) return false;
    }
    return true;
  });

  const overhangs: OverhangPoint[] = [...firstPrintOverhangs, ...islandsFiltered, ...gridFiltered];
  if (overhangs.length === 0) return [];

  return overhangs.map((p) => {
    const contact = { x: p.x, y: p.y, z: p.z };
    let base = { x: p.x, y: 0, z: p.z };

    if (!platformOnly) {
      const hit = raycastDown(scene, new Vector3(p.x, p.y - 0.5, p.z), allModelMeshes);
      if (hit && hit.y < p.y - 0.2 && hit.y > 0.05) {
        base = { x: hit.x, y: hit.y, z: hit.z };
      }
    }

    // contact 표면 법선이 있고 표면이 아래 향함 + base 가 빌드플레이트(Y≈0)이면,
    // base.X·Z 를 콘 아래 끝 위치(contact + n × connectionLength) 로 이동.
    // pillar 가 콘 아래 끝의 수직 아래에 정렬되어 X·Z·직경 모두 매끄럽게 연결된다.
    // 모델 위 착지(base.y > 0.05) 케이스는 수직 fallback — platformOnly 모드 무관 일관.
    let normal: { x: number; y: number; z: number } | undefined;
    if (
      p.nx !== undefined &&
      p.ny !== undefined &&
      p.nz !== undefined &&
      p.ny < -0.05 &&
      base.y < 0.05
    ) {
      normal = { x: p.nx, y: p.ny, z: p.nz };
      base = {
        x: contact.x + p.nx * settings.connectionLength,
        y: 0,
        z: contact.z + p.nz * settings.connectionLength,
      };
    }

    return {
      id: crypto.randomUUID(),
      stlId,
      contact,
      base,
      normal,
    };
  });
};

/** 서포트 메쉬 공용 머티리얼 (씬당 1개 캐시) */
export const getSupportMaterial = (scene: Scene): StandardMaterial => {
  const existing = scene.getMaterialByName('supportMaterial');
  if (existing instanceof StandardMaterial) return existing;

  const mat = new StandardMaterial('supportMaterial', scene);
  mat.diffuseColor = new Color3(0.18, 0.55, 0.42); // 모델과 구분되는 초록 계열
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  return mat;
};

/**
 * 서포트 점 1개를 실제 3D 메쉬로 만든다.
 * 구성: 접점 팁 + 테이퍼 연결부 + 기둥 + (바닥 착지 시) 바닥 부착부.
 * 모든 파트를 하나의 메쉬로 병합해 반환한다 (없으면 null).
 */
export const buildSupportMesh = (
  scene: Scene,
  sp: SupportPoint,
  settings: SupportSettings,
  material: StandardMaterial
): Mesh | null => {
  const contact = new Vector3(sp.contact.x, sp.contact.y, sp.contact.z);
  const base = new Vector3(sp.base.x, sp.base.y, sp.base.z);
  const total = contact.y - base.y;
  if (total < 0.2) return null;

  const parts: Mesh[] = [];
  const pillarD = Math.max(settings.middleDiameter, 0.05);
  // 콘 아래 직경 = pillar 직경 (시각적 매끄러운 연결을 위해 강제 일치).
  const coneBottomD = pillarD;

  // 표면 법선 — 콘 기울임. 없거나 거의 수평이면 수직.
  const hasN = !!sp.normal && sp.normal.y < -0.05;
  const n = hasN ? new Vector3(sp.normal!.x, sp.normal!.y, sp.normal!.z) : new Vector3(0, -1, 0);
  const isTilted = hasN && Math.abs(n.x) + Math.abs(n.z) > 0.01;
  // 콘 길이 — 사용자 설정 connectionLength (단 contact ~ base 길이를 넘지 않도록 clamp).
  const L = Math.min(settings.connectionLength, total);
  // 콘 아래 끝 = contact + n × L. base.X·Z 와 이 값의 X·Z 는 일치 (generateAutoSupports 에서 보장).
  const connEnd = contact.add(n.scale(L));
  // 회전: cylinder +Y(top, 얇음) 가 contact 향함.
  const rot = isTilted ? quaternionFromYAxisTo(contact.subtract(connEnd).normalize()) : null;

  // 1) 접점 팁 (tip) — contactShape 별로 모양·크기·후속 connection 시작 위치 다름.
  //    표면 법선 따라 정렬(rot 적용).
  let connStart: Vector3;
  let connTopD: number;
  if (settings.contactShape === 'sphere') {
    // 반구(dome) — 직경 = 상단 직경(topDiameter). 콘 위 끝(반구 둥근 정점)이 *항상 contact*
    // 위치(=모델 표면)에 고정되어 지지대 본분(모델에 닿음) 보장.
    //
    // 평평한 면 위치 = contact + n × radius (n = 외향 법선, 모델 외부 radius 거리).
    // 회전 적용 시 cylinder +Y(반구 둥근 끝 방향) = -n → 위 끝 = 평평한 면 + (-n)×radius = contact.
    // 수직 모드(rot=null) 일 때도 n=(0,-1,0), +Y=(0,1,0) 로 같은 결과: 위 끝 = contact.
    const tipDiam = Math.max(settings.topDiameter, 0.1);
    const radius = tipDiam / 2;
    const tip = MeshBuilder.CreateSphere(
      'tip',
      { diameter: tipDiam, segments: 12, slice: 0.5 },
      scene
    );
    tip.position = contact.add(n.scale(radius));
    if (rot) tip.rotationQuaternion = rot;
    parts.push(tip);
    // connection 시작 = 반구 평평한 면 위치, 위 끝 직경 = 반구 직경.
    connStart = tip.position.clone();
    connTopD = tipDiam;
  } else {
    // 송곳 콘 — 정점 = contact, 베이스 = contactDiameter, 길이 = contactDiameter × 1.5.
    const tipLen = settings.contactDiameter * 1.5;
    const tip = MeshBuilder.CreateCylinder(
      'tip',
      { height: tipLen, diameterTop: 0, diameterBottom: settings.contactDiameter, tessellation: 8 },
      scene
    );
    tip.position = contact.add(n.scale(tipLen / 2));
    if (rot) tip.rotationQuaternion = rot;
    parts.push(tip);
    // connection 은 콘 베이스 위치부터. 위 끝 직경 = contactDiameter (콘 베이스와 연속).
    connStart = contact.add(n.scale(tipLen));
    connTopD = settings.connectionShape === 'cone' ? settings.contactDiameter : coneBottomD;
  }

  // 2) 연결부 — connStart ~ connEnd. connectionShape: 'cone' = 테이퍼, 'cylinder' = 직립.
  const connLen = Math.max(0.05, Vector3.Distance(connStart, connEnd));
  const conn = MeshBuilder.CreateCylinder(
    'conn',
    { height: connLen, diameterTop: connTopD, diameterBottom: coneBottomD, tessellation: 8 },
    scene
  );
  conn.position = Vector3.Center(connStart, connEnd);
  if (rot) conn.rotationQuaternion = rot;
  parts.push(conn);

  // 3) pillar — 콘 아래 끝(connEnd) 의 수직 아래로 빌드플레이트까지. 동일 직경.
  const pillarH = connEnd.y - base.y;
  if (pillarH > 0.05) {
    const pillar = MeshBuilder.CreateCylinder('pillar', { height: pillarH, diameter: pillarD, tessellation: 8 }, scene);
    pillar.position = new Vector3(base.x, base.y + pillarH / 2, base.z);
    parts.push(pillar);

    // 3-a) 기울기 모드 한정 — 콘 아래 끝과 pillar 상단의 *축 차이* (콘=법선, pillar=수직)로
    //      발생하는 단면 어긋남을 sphere 가 덮는다. 수직 모드는 이미 매끄러워 sphere 불필요.
    if (isTilted) {
      const joint = MeshBuilder.CreateSphere('joint', { diameter: pillarD, segments: 8 }, scene);
      joint.position = connEnd.clone();
      parts.push(joint);
    }
  }

  // 4) 바닥 부착부 — 역원뿔(위 = pillar 직경, 아래 = baseDiameter)로 ChiTuBox 식 펴짐.
  //    foot 의 X·Z 도 base 와 일치 (= 콘 아래 끝 X·Z 의 수직 아래).
  if (base.y < 0.5 && settings.baseThickness > 0) {
    const foot = MeshBuilder.CreateCylinder(
      'foot',
      {
        height: settings.baseThickness,
        diameterTop: pillarD,
        diameterBottom: settings.baseDiameter,
        tessellation: 16,
      },
      scene
    );
    foot.position = new Vector3(base.x, base.y + settings.baseThickness / 2, base.z);
    parts.push(foot);
  }

  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) return null;

  merged.name = `support_${sp.id}`;
  merged.material = material;
  merged.metadata = { supportId: sp.id, stlId: sp.stlId };
  merged.isPickable = true;
  return merged;
};

/**
 * 라프트(Raft) 메시 빌드 — 모델 바닥에 깔리는 얇은 사각판.
 * 모델의 월드 AABB X·Z 를 raftMargin 만큼 확장해 raftThickness 두께로 압출하며,
 * 모델의 현재 Y 위치(예: supportStage Z-lift 5mm)와 무관하게 빌드플레이트(Y=0)
 * 바로 위에 배치한다. 부모-자식 결합은 하지 않는다.
 */
export const buildRaftMesh = (
  scene: Scene,
  owner: Mesh,
  settings: SupportSettings,
  material: StandardMaterial
): Mesh | null => {
  if (!settings.raftEnabled || settings.raftThickness <= 0.01) return null;

  owner.computeWorldMatrix(true);
  const bb = owner.getBoundingInfo().boundingBox;
  // 콘이 표면 법선 따라 기울어지면 모서리 contact 의 base.X·Z 가 모델 AABB 밖으로
  // 최대 (connectionLength × sin45 ≈ × 0.707) 만큼 나갈 수 있어 모서리 foot 이 라프트
  // 밖으로 새는 것을 막기 위해 자동 보강. 사용자 raftMargin 과 max 비교.
  const tiltOutset = Math.SQRT1_2 * settings.connectionLength;
  const effectiveMargin = Math.max(settings.raftMargin, tiltOutset + 0.5);
  const minX = bb.minimumWorld.x - effectiveMargin;
  const maxX = bb.maximumWorld.x + effectiveMargin;
  const minZ = bb.minimumWorld.z - effectiveMargin;
  const maxZ = bb.maximumWorld.z + effectiveMargin;

  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (width <= 0 || depth <= 0) return null;

  const stlId = (owner.metadata?.stlId as string | undefined) ?? owner.name;
  const raft = MeshBuilder.CreateBox(
    `raft_${stlId}`,
    { width, height: settings.raftThickness, depth },
    scene
  );
  raft.position = new Vector3((minX + maxX) / 2, settings.raftThickness / 2, (minZ + maxZ) / 2);
  raft.material = material;
  raft.metadata = { stlId, kind: 'raft' };
  raft.isPickable = false;
  return raft;
};

/** SupportController.generate 가 받는 대상 모델 */
export interface SupportTarget {
  stlId: string;
  mesh: Mesh;
}

/**
 * @deprecated 현재 어떤 컴포넌트도 import 하지 않음. ViewerPage/STLViewer 는
 * supports 배열 상태 + STLViewer.generateSupports() 패턴을 직접 사용 중.
 * 사용자 동의 시 제거 예정.
 */
export class SupportController {
  private readonly scene: Scene;
  private readonly material: StandardMaterial;
  /** supportId → 병합 메쉬 */
  private readonly meshes = new Map<string, Mesh>();
  /** supportId → 서포트 점 데이터 */
  private readonly points = new Map<string, SupportPoint>();
  private visible = true;
  private readonly onCountChange?: (count: number) => void;

  constructor(scene: Scene, onCountChange?: (count: number) => void) {
    this.scene = scene;
    this.material = getSupportMaterial(scene);
    this.onCountChange = onCountChange;
  }

  /** 현재 서포트 개수 */
  get count(): number {
    return this.meshes.size;
  }

  /** 주어진 메쉬가 (이 컨트롤러가 관리하는) 서포트 메쉬인지 판별한다. */
  isSupportMesh(mesh: Mesh): boolean {
    const id = mesh.metadata?.supportId as string | undefined;
    return !!id && this.meshes.has(id);
  }

  /**
   * 자동 서포트 생성. 기존 서포트는 모두 제거하고 다시 만든다.
   * @param platformOnly true면 모든 서포트를 빌드플레이트까지 곧장 내린다.
   * @returns 생성된 서포트 개수
   */
  generate(targets: SupportTarget[], settings: SupportSettings, platformOnly: boolean): number {
    this.disposeAll();
    const allMeshes = targets.map((t) => t.mesh);
    for (const { stlId, mesh } of targets) {
      const pts = generateAutoSupports(this.scene, mesh, stlId, allMeshes, settings, platformOnly);
      for (const sp of pts) {
        this.addPoint(sp, settings);
      }
    }
    this.notify();
    return this.meshes.size;
  }

  /**
   * 수동 서포트 1개 추가. 접점에서 아래로 광선을 쏴 착지점을 정한다.
   * @returns 실제로 생성되었으면 true
   */
  addManual(
    stlId: string,
    contact: Vector3,
    modelMeshes: Mesh[],
    settings: SupportSettings
  ): boolean {
    let base = { x: contact.x, y: 0, z: contact.z };
    const hit = raycastDown(
      this.scene,
      new Vector3(contact.x, contact.y - 0.5, contact.z),
      modelMeshes
    );
    if (hit && hit.y < contact.y - 0.2 && hit.y > 0.05) {
      base = { x: hit.x, y: hit.y, z: hit.z };
    }
    const sp: SupportPoint = {
      id: crypto.randomUUID(),
      stlId,
      contact: { x: contact.x, y: contact.y, z: contact.z },
      base,
    };
    const ok = this.addPoint(sp, settings);
    if (ok) this.notify();
    return ok;
  }

  /** 특정 서포트 메쉬를 제거한다 (수동 삭제). */
  removeByMesh(mesh: Mesh): void {
    const id = mesh.metadata?.supportId as string | undefined;
    if (id && this.meshes.has(id)) {
      this.meshes.get(id)!.dispose();
      this.meshes.delete(id);
      this.points.delete(id);
      this.notify();
    }
  }

  /** 특정 모델(stlId)에 속한 모든 서포트를 제거한다 (모델 삭제 시). */
  removeByStlId(stlId: string): void {
    let changed = false;
    for (const [id, sp] of [...this.points]) {
      if (sp.stlId === stlId) {
        this.meshes.get(id)?.dispose();
        this.meshes.delete(id);
        this.points.delete(id);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  /** 서포트 표시/숨김 */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const mesh of this.meshes.values()) {
      mesh.isVisible = visible;
    }
  }

  /** 모든 서포트 제거 */
  clear(): void {
    this.disposeAll();
    this.notify();
  }

  /** 컨트롤러 자원 정리 (씬 dispose 시) */
  dispose(): void {
    this.disposeAll();
  }

  // --------------------------------------------------------------------

  private addPoint(sp: SupportPoint, settings: SupportSettings): boolean {
    const mesh = buildSupportMesh(this.scene, sp, settings, this.material);
    if (!mesh) return false;
    mesh.isVisible = this.visible;
    this.meshes.set(sp.id, mesh);
    this.points.set(sp.id, sp);
    return true;
  }

  private disposeAll(): void {
    for (const mesh of this.meshes.values()) {
      mesh.dispose();
    }
    this.meshes.clear();
    this.points.clear();
  }

  private notify(): void {
    this.onCountChange?.(this.meshes.size);
  }
}
