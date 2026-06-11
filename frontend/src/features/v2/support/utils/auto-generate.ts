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

  // 진단 카운터
  let raysCast = 0;
  let totalHits = 0;
  let overhangHits = 0;
  let skippedTooLow = 0;

  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      const origin = new Vector3(x, yAbove, z);
      const ray = new Ray(origin, direction, rayLen);
      raysCast++;

      const hits =
        scene.multiPickWithRay(ray, predicate as (m: Mesh) => boolean) ?? [];
      totalHits += hits.length;

      for (const info of hits) {
        if (!info.hit || !info.pickedPoint) continue;
        const normal = info.getNormal(true, true);
        if (!normal) continue;

        // 오버행: 법선이 -Y 와 임계각 이내 → normal.y <= -cos(angle)
        if (normal.y > -overhangCos) continue;
        overhangHits++;

        // contact 가 빌드플레이트에 너무 붙어있으면 서포트가 0 길이라
        // 의미 없음 → skip. 기준은 0.5mm.
        if (info.pickedPoint.y <= 0.5) {
          skippedTooLow++;
          continue;
        }

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

  // eslint-disable-next-line no-console
  console.log(
    `[v2 auto] stl=${stlId.slice(0, 8)} ` +
      `rays=${raysCast} hits=${totalHits} overhang=${overhangHits} ` +
      `skipTooLow=${skippedTooLow} → points=${points.length} ` +
      `(spacing=${step}mm, angle≤${params.overhangAngleDeg}°)`,
  );
  console.log(
    `[v2 auto] world AABB X(${minX.toFixed(1)}..${maxX.toFixed(1)}) ` +
      `Y(${bb.minimumWorld.y.toFixed(1)}..${bb.maximumWorld.y.toFixed(1)}) ` +
      `Z(${minZ.toFixed(1)}..${maxZ.toFixed(1)})`,
  );

  return points;
}
