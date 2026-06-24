import { Mesh, VertexBuffer } from "@babylonjs/core";

/**
 * 면(face) 법선이 -Y (= 빌드플레이트 방향) 와 이루는 각이 `thresholdDeg`
 * 이하인 vertex 에 오버행 색을 칠한다. 그 외는 중성 회색.
 *
 * STL 은 통상 unindexed (vertex 3개가 1 face) 라 vertex normal 이 곧
 * face normal 이다. 따라서 vertex 단위 색칠로 곧바로 face 단위 색이 된다.
 *
 * 호출 측에서 mesh.material 의 diffuseColor 가 흰색이면 vertex color
 * 가 그대로 보인다.
 */
export function applyOverhangColors(mesh: Mesh, thresholdDeg: number): void {
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!normals) {
    console.warn("[v2/overhang] 메쉬에 normal 이 없음 — 색칠 건너뜀");
    return;
  }

  const vCount = normals.length / 3;
  const colors = new Float32Array(vCount * 4);

  // 오버행 조건: angle(normal, -Y) <= thresholdDeg
  //   ⇔ dot(normal, (0,-1,0)) >= cos(thresholdDeg)
  //   ⇔ -ny >= cos(thresholdDeg)
  //   ⇔ ny <= -cos(thresholdDeg)
  const angleRad = (thresholdDeg * Math.PI) / 180;
  const negCosThreshold = -Math.cos(angleRad);

  // 색 (RGBA, linear).
  const ovr = [1.0, 0.32, 0.32, 1.0];
  const safe = [0.78, 0.79, 0.83, 1.0];

  for (let i = 0; i < vCount; i++) {
    const ny = normals[i * 3 + 1];
    const isOverhang = ny <= negCosThreshold;
    const c = isOverhang ? ovr : safe;
    const o = i * 4;
    colors[o + 0] = c[0];
    colors[o + 1] = c[1];
    colors[o + 2] = c[2];
    colors[o + 3] = c[3];
  }

  // updatable=true 로 두면 임계각 변경 시 재할당 비용이 적다.
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);
  mesh.hasVertexAlpha = false;
}
