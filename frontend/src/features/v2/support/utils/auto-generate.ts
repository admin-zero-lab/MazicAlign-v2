import { Mesh, Ray, Scene, Vector3 } from "@babylonjs/core";

import type { SupportParams, SupportPointV2 } from "../types";

/**
 * 자동 서포트 점 생성.
 *
 * 알고리즘:
 *   1. 모델의 world AABB 의 XZ 범위에 contactSpacingMm 간격 격자.
 *   2. 각 격자 칸 중심에서 모델 아래 (-Y 너머) 에서 위로 ray 발사.
 *   3. scene.pickWithRay 의 first hit = 모델 아랫면 후보.
 *   4. 그 hit 의 면 법선이 -Y 와 임계각 이내이면 오버행 → contact 등록.
 *   5. base 는 (contact.x, 0, contact.z) — 빌드플레이트.
 *
 * 위 → 아래로 쏘면 multiPickWithRay 가 mesh 당 first hit (= 윗면)
 * 만 주기 때문에 0 개가 나온다. 그래서 아래 → 위 방향으로 픽한다.
 *
 * mesh.isPickable = true 가 보장돼 있어야 한다.
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
  const yTop = bb.maximumWorld.y + 1;
  const yBelow = bb.minimumWorld.y - 1;
  const rayLen = yTop - yBelow;

  const step = params.contactSpacingMm;
  if (step <= 0) return [];
  const overhangCos = Math.cos((params.overhangAngleDeg * Math.PI) / 180);


  const points: SupportPointV2[] = [];
  const now = Date.now();
  const direction = new Vector3(0, 1, 0); // 아래에서 위로
  const predicate = (m: unknown) => m === mesh;

  // 진단 카운터
  let raysCast = 0;
  let totalHits = 0;
  let overhangHits = 0;
  let skippedTooLow = 0;
  let firstNormalSamples = 0;

  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      const origin = new Vector3(x, yBelow, z);
      const ray = new Ray(origin, direction, rayLen);
      raysCast++;

      const info = scene.pickWithRay(
        ray,
        predicate as (m: Mesh) => boolean,
      );
      if (!info?.hit || !info.pickedPoint) continue;
      totalHits++;

      const normal = info.getNormal(true, true);
      if (!normal) continue;

      // 진단: 처음 몇 개의 hit normal 만 콘솔에 찍어본다.
      if (firstNormalSamples < 4) {
        // eslint-disable-next-line no-console
        console.log(
          `[v2 auto sample] hit y=${info.pickedPoint.y.toFixed(2)} ` +
            `normal=(${normal.x.toFixed(2)},${normal.y.toFixed(2)},${normal.z.toFixed(2)})`,
        );
        firstNormalSamples++;
      }

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
