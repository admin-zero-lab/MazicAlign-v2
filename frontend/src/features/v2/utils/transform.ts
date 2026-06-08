import { Mesh, Quaternion } from "@babylonjs/core";

import type { TransformV2 } from "../types/transform";

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Babylon Mesh 에 v2 transform 을 적용한다.
 *
 * Gizmo 가 rotationQuaternion 으로 동작하므로 우리도 quaternion 으로
 * 통일한다. Euler 는 UI 표시 용도로만 변환.
 */
export function applyTransformToMesh(mesh: Mesh, t: TransformV2): void {
  mesh.position.set(t.tx, t.ty, t.tz);
  mesh.rotationQuaternion = Quaternion.FromEulerAngles(
    degToRad(t.rx),
    degToRad(t.ry),
    degToRad(t.rz),
  );
  mesh.scaling.set(t.sx, t.sy, t.sz);
}

/**
 * Babylon Mesh 의 현재 자세를 읽어 TransformV2 로 변환한다.
 * Gizmo 드래그 종료 시점에 사용.
 */
export function readMeshTransform(mesh: Mesh): TransformV2 {
  const q = mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation);
  const euler = q.toEulerAngles();
  return {
    tx: mesh.position.x,
    ty: mesh.position.y,
    tz: mesh.position.z,
    rx: radToDeg(euler.x),
    ry: radToDeg(euler.y),
    rz: radToDeg(euler.z),
    sx: mesh.scaling.x,
    sy: mesh.scaling.y,
    sz: mesh.scaling.z,
  };
}
