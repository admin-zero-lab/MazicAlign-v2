import { Mesh, Ray, Scene, Vector3 } from "@babylonjs/core";

import type { SupportParams, SupportPointV2 } from "../types";

/**
 * 자동 서포트 점 생성.
 *
 * 알고리즘:
 *   1. 모델의 world AABB 의 XZ 범위에 contactSpacingMm 간격 격자.
 *   2. 각 격자 칸 중심에서 위쪽 (+Y 너머) 에서 아래로 ray 발사.
 *   3. multi-pick 으로 모델과의 모든 hit 점 수집.
 *   4. 각 hit 의 면 법선이 -Y 와 임계각 이내이면 오버행으로 인정 →
 *      그 hit point 를 contact 로 등록.
 *   5. base 는 contact 의 (x, 0, z) — 빌드플레이트.
 *
 * mesh.isPickable = true 가 보장돼 있어야 한다 (BabylonScene 이
 * 모든 STL 메쉬에 적용 중).
 */
export function autoGenerateSupportPoints(
  scene: Scene,
  mesh: Mesh,
  params: SupportParams,
  projectId: string,
  stlId: string,
): SupportPointV2[] {
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  const minX = bb.minimumWorld.x;
  const maxX = bb.maximumWorld.x;
  const minZ = bb.minimumWorld.z;
  const maxZ = bb.maximumWorld.z;
  const yAbove = bb.maximumWorld.y + 1;
  const yBelow = bb.minimumWorld.y - 1;
  const rayLen = yAbove - yBelow;

  const step = params.contactSpacingMm;
  if (step <= 0) return [];
  const overhangCos = Math.cos((params.overhangAngleDeg * Math.PI) / 180);

  const points: SupportPointV2[] = [];
  const now = Date.now();
  const direction = new Vector3(0, -1, 0);
  const predicate = (m: unknown) => m === mesh;

  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      const origin = new Vector3(x, yAbove, z);
      const ray = new Ray(origin, direction, rayLen);

      const hits =
        (scene.multiPickWithRay(ray, predicate as (m: Mesh) => boolean) ?? []);

      for (const info of hits) {
        if (!info.hit || !info.pickedPoint) continue;
        const normal = info.getNormal(true, true);
        if (!normal) continue;

        // 오버행: 법선이 -Y 와 임계각 이내 → normal.y <= -cos(angle)
        if (normal.y > -overhangCos) continue;

        // contact 가 이미 빌드플레이트 아래(또는 거의)면 자기 자신이
        // 베드라서 서포트 의미 없음 → skip.
        if (info.pickedPoint.y <= 0.05) continue;

        points.push({
          id: crypto.randomUUID(),
          projectId,
          stlId,
          contact: [
            info.pickedPoint.x,
            info.pickedPoint.y,
            info.pickedPoint.z,
          ],
          base: [info.pickedPoint.x, 0, info.pickedPoint.z],
          source: "auto",
          addedAt: now,
        });
      }
    }
  }

  return points;
}
