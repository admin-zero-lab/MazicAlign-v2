import {
  Scene,
  Mesh,
  Vector3,
  Ray,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { SupportSettings, SupportPoint } from '@apptypes/support.types';

/** 빌드플레이트(Y=0)에 거의 닿은 면은 이미 지지되므로 서포트 대상에서 제외 */
const FLOOR_SKIP_HEIGHT = 0.4;

/** 오버행 후보 점 (월드 좌표 + 삼각형 넓이) */
interface OverhangPoint {
  x: number;
  y: number;
  z: number;
  area: number;
}

/**
 * 메쉬에서 오버행(처짐) 면을 찾아 각 삼각형 중심점을 후보로 수집한다.
 * - 면 노멀이 아래(−Y)를 향하고
 * - 면의 수평면 대비 기울기가 angleDeg 이하이면 서포트가 필요한 오버행으로 본다.
 */
export const detectOverhangPoints = (mesh: Mesh, angleDeg: number): OverhangPoint[] => {
  mesh.computeWorldMatrix(true);
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions || !indices) return [];

  const wm = mesh.getWorldMatrix();
  const points: OverhangPoint[] = [];

  const v0 = new Vector3();
  const v1 = new Vector3();
  const v2 = new Vector3();

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;

    Vector3.TransformCoordinatesFromFloatsToRef(positions[a], positions[a + 1], positions[a + 2], wm, v0);
    Vector3.TransformCoordinatesFromFloatsToRef(positions[b], positions[b + 1], positions[b + 2], wm, v1);
    Vector3.TransformCoordinatesFromFloatsToRef(positions[c], positions[c + 1], positions[c + 2], wm, v2);

    const e1 = v1.subtract(v0);
    const e2 = v2.subtract(v0);
    const cross = Vector3.Cross(e1, e2);
    const crossLen = cross.length();
    if (crossLen < 1e-9) continue;

    // 아래를 향하는 면만 대상 (노멀 Y < 0)
    const ny = cross.y / crossLen;
    if (ny >= 0) continue;

    // 면의 수평면 대비 기울기: 0° = 완전 수평(천장), 90° = 수직 벽
    const surfaceAngle = (Math.acos(Math.min(1, Math.abs(ny))) * 180) / Math.PI;
    if (surfaceAngle > angleDeg) continue;

    const cy = (v0.y + v1.y + v2.y) / 3;
    if (cy <= FLOOR_SKIP_HEIGHT) continue; // 바닥에 붙은 면은 제외

    points.push({
      x: (v0.x + v1.x + v2.x) / 3,
      y: cy,
      z: (v0.z + v1.z + v2.z) / 3,
      area: crossLen / 2,
    });
  }

  return points;
};

/**
 * 후보 점을 최소 간격(spacing) 기준으로 솎아낸다.
 * 넓은 오버행면(넓이 큰 삼각형)을 우선 채택하여 균형 있게 분포시킨다.
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
 * @param platformOnly true면 모든 서포트를 빌드플레이트(Y=0)까지 곧장 내린다.
 */
export const generateAutoSupports = (
  scene: Scene,
  modelMesh: Mesh,
  stlId: string,
  allModelMeshes: Mesh[],
  settings: SupportSettings,
  platformOnly: boolean
): SupportPoint[] => {
  const overhangs = detectOverhangPoints(modelMesh, settings.overhangAngle);
  if (overhangs.length === 0) return [];

  // 밀도가 높을수록 간격이 좁아진다. 크로스 너비를 기준 간격으로 사용.
  const spacing = Math.max(
    settings.contactDiameter * 2,
    settings.crossWidth * (100 / Math.max(settings.density, 1))
  );
  const thinned = thinPoints(overhangs, spacing);

  return thinned.map((p) => {
    const contact = { x: p.x, y: p.y, z: p.z };
    let base = { x: p.x, y: 0, z: p.z };

    if (!platformOnly) {
      // 접점 바로 아래에서 광선을 쏴 하부 모델 표면에 착지 시도
      const hit = raycastDown(scene, new Vector3(p.x, p.y - 0.5, p.z), allModelMeshes);
      if (hit && hit.y < p.y - 0.2 && hit.y > 0.05) {
        base = { x: hit.x, y: hit.y, z: hit.z };
      }
    }

    return {
      id: crypto.randomUUID(),
      stlId,
      contact,
      base,
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
  const connLen = Math.min(settings.connectionLength, total);

  // 1) 접점 팁 — 모델 표면에 닿는 끝부분
  if (settings.contactShape === 'sphere') {
    const tip = MeshBuilder.CreateSphere('tip', { diameter: settings.contactDiameter, segments: 8 }, scene);
    tip.position = contact.clone();
    parts.push(tip);
  } else {
    const tip = MeshBuilder.CreateCylinder(
      'tip',
      { height: settings.contactDiameter, diameterTop: 0, diameterBottom: settings.contactDiameter, tessellation: 8 },
      scene
    );
    tip.position = new Vector3(contact.x, contact.y - settings.contactDiameter / 2, contact.z);
    parts.push(tip);
  }

  // 2) 연결부 — 원뿔형(테이퍼) 또는 원기둥형
  const connTopD = settings.connectionShape === 'cone' ? settings.topDiameter : settings.bottomDiameter;
  const conn = MeshBuilder.CreateCylinder(
    'conn',
    { height: connLen, diameterTop: connTopD, diameterBottom: settings.bottomDiameter, tessellation: 8 },
    scene
  );
  conn.position = new Vector3(contact.x, contact.y - connLen / 2, contact.z);
  parts.push(conn);

  // 3) 기둥 — 연결부 아래부터 착지점까지
  const pillarH = total - connLen;
  if (pillarH > 0.05) {
    const pillarD = Math.max(settings.middleDiameter, 0.05);
    const pillar = MeshBuilder.CreateCylinder('pillar', { height: pillarH, diameter: pillarD, tessellation: 8 }, scene);
    pillar.position = new Vector3(base.x, base.y + pillarH / 2, base.z);
    parts.push(pillar);
  }

  // 4) 바닥 부착부 — 빌드플레이트에 착지한 경우에만
  if (base.y < 0.5 && settings.baseThickness > 0) {
    const foot = MeshBuilder.CreateCylinder(
      'foot',
      { height: settings.baseThickness, diameter: settings.baseDiameter, tessellation: 12 },
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

/** SupportController.generate 가 받는 대상 모델 */
export interface SupportTarget {
  stlId: string;
  mesh: Mesh;
}

/**
 * 한 씬의 서포트 메쉬 전체를 관리하는 컨트롤러.
 *
 * 자동 생성·수동 추가/삭제·표시 토글·일괄 제거를 담당하며,
 * 서포트 개수가 바뀔 때마다 onCountChange 콜백으로 알린다.
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
