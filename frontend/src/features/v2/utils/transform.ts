import { Mesh } from "@babylonjs/core";

import type { TransformV2 } from "../types/transform";

/** deg → rad. */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Babylon Mesh 에 v2 transform 을 적용한다.
 *
 * 회전 순서는 Babylon 의 기본 Yaw-Pitch-Roll (Y → X → Z) 가 아닌
 * 일반적인 XYZ 순서를 가정한다. Babylon 의 mesh.rotation 은 Euler
 * 를 직접 받고 setRotationXYZ 와 동등하게 동작한다.
 */
export function applyTransformToMesh(mesh: Mesh, t: TransformV2): void {
  mesh.position.set(t.tx, t.ty, t.tz);
  mesh.rotation.set(degToRad(t.rx), degToRad(t.ry), degToRad(t.rz));
  mesh.scaling.set(t.sx, t.sy, t.sz);
}
