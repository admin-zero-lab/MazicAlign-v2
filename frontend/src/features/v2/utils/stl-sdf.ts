import { Mesh, VertexBuffer } from "@babylonjs/core";

/**
 * STL inside/outside voxel grid (STL local 좌표 기준).
 * Bridge fragment shader 가 STL inverse world matrix 곱해 lookup → discard.
 *
 * 형식:
 *   data: Uint8Array, 0 = outside, 255 = inside
 *   dims: [x, y, z] voxel count
 *   origin: STL local 좌표 bbox.min (voxel grid 의 (0,0,0) 위치)
 *   voxelSize: mm per voxel
 */
export type StlInsideGrid = {
  data: Uint8Array;
  dims: [number, number, number];
  origin: [number, number, number];
  voxelSize: number;
};

/**
 * STL mesh → inside/outside voxel grid.
 *
 * 알고리즘:
 *   각 (y, z) 줄에 대해 STL 모든 triangle 과 +X 방향 ray 의 교차 x 좌표
 *   모은 후 정렬. 그 줄의 voxel x 를 좌→우 스캔, parity 토글 = inside.
 *
 * 성능:
 *   triangle × (y rows × z slices). 100k triangle × 50×50 = 250M ops.
 *   bbox prune 으로 평균 ~1/10 = ~25M ops × ~수μs = 수초. 한 번만.
 */
export function buildStlInsideGrid(
  stl: Mesh,
  voxelSize = 1.0,
): StlInsideGrid {
  const positions = stl.getVerticesData(VertexBuffer.PositionKind);
  const indices = stl.getIndices();
  if (!positions || !indices) {
    throw new Error("[stl-sdf] STL has no positions/indices");
  }

  // STL local bbox
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // bbox 가장자리 여유 — voxel grid 의 (0,0,0) edge 부분도 정확
  const margin = voxelSize * 2;
  minX -= margin; minY -= margin; minZ -= margin;
  maxX += margin; maxY += margin; maxZ += margin;

  const dx = Math.max(1, Math.ceil((maxX - minX) / voxelSize));
  const dy = Math.max(1, Math.ceil((maxY - minY) / voxelSize));
  const dz = Math.max(1, Math.ceil((maxZ - minZ) / voxelSize));

  const data = new Uint8Array(dx * dy * dz);

  // triangle 사전 추출 — 매 inner loop 마다 indices 접근 안 함
  const triCount = indices.length / 3;
  const tris = new Float32Array(triCount * 9);
  // 각 triangle 의 y, z range — bbox prune
  const triYMin = new Float32Array(triCount);
  const triYMax = new Float32Array(triCount);
  const triZMin = new Float32Array(triCount);
  const triZMax = new Float32Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1], by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2], cy = positions[i2 + 1], cz = positions[i2 + 2];
    const off = t * 9;
    tris[off] = ax; tris[off + 1] = ay; tris[off + 2] = az;
    tris[off + 3] = bx; tris[off + 4] = by; tris[off + 5] = bz;
    tris[off + 6] = cx; tris[off + 7] = cy; tris[off + 8] = cz;
    triYMin[t] = Math.min(ay, by, cy);
    triYMax[t] = Math.max(ay, by, cy);
    triZMin[t] = Math.min(az, bz, cz);
    triZMax[t] = Math.max(az, bz, cz);
  }

  // 각 (y, z) row 에 대해 +X ray triangle 교차 x 모음 → 정렬 → scan line fill
  const xHits: number[] = new Array(64);
  for (let zi = 0; zi < dz; zi++) {
    const z = minZ + (zi + 0.5) * voxelSize;
    for (let yi = 0; yi < dy; yi++) {
      const y = minY + (yi + 0.5) * voxelSize;
      let hitCount = 0;
      for (let t = 0; t < triCount; t++) {
        if (z < triZMin[t] || z > triZMax[t]) continue;
        if (y < triYMin[t] || y > triYMax[t]) continue;
        const off = t * 9;
        const ax = tris[off], ay = tris[off + 1], az = tris[off + 2];
        const bx = tris[off + 3], by = tris[off + 4], bz = tris[off + 5];
        const cx = tris[off + 6], cy = tris[off + 7], cz = tris[off + 8];
        // Cramer's rule: (y, z) 를 triangle 의 Y-Z plane barycentric 으로
        const v1y = by - ay, v1z = bz - az;
        const v2y = cy - ay, v2z = cz - az;
        const denom = v1y * v2z - v1z * v2y;
        if (Math.abs(denom) < 1e-10) continue;
        const dy_ = y - ay, dz_ = z - az;
        const inv = 1 / denom;
        const u = (dy_ * v2z - dz_ * v2y) * inv;
        const v = (v1y * dz_ - v1z * dy_) * inv;
        if (u < 0 || v < 0 || u + v > 1) continue;
        xHits[hitCount++] = ax + u * (bx - ax) + v * (cx - ax);
      }
      if (hitCount === 0) continue;
      // 정렬 (xHits[0..hitCount-1])
      xHits.length = hitCount;
      xHits.sort((a, b) => a - b);
      // scan line fill — parity 토글
      let hitIdx = 0;
      let inside = false;
      const rowBase = zi * dx * dy + yi * dx;
      for (let xi = 0; xi < dx; xi++) {
        const x = minX + (xi + 0.5) * voxelSize;
        while (hitIdx < hitCount && xHits[hitIdx] <= x) {
          inside = !inside;
          hitIdx++;
        }
        if (inside) data[rowBase + xi] = 255;
      }
    }
  }

  return {
    data,
    dims: [dx, dy, dz],
    origin: [minX, minY, minZ],
    voxelSize,
  };
}
