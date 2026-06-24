import { Matrix, Mesh, Quaternion, Vector3 } from "@babylonjs/core";

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
/**
 * TransformV2 → world matrix (scale → rotate → translate 순으로 합성).
 */
export function matrixFromTransform(t: TransformV2): Matrix {
  return Matrix.Compose(
    new Vector3(t.sx, t.sy, t.sz),
    Quaternion.FromEulerAngles(
      degToRad(t.rx),
      degToRad(t.ry),
      degToRad(t.rz),
    ),
    new Vector3(t.tx, t.ty, t.tz),
  );
}

/**
 * old transform 기준 world 좌표 p 를 new transform 기준 world 좌표로
 * 변환. 즉 p 가 모델에 부착돼 있을 때, 모델 transform 이 old→new 로
 * 바뀐 후의 새 world 좌표.
 */
export function transformPointBetween(
  p: [number, number, number],
  oldT: TransformV2,
  newT: TransformV2,
): [number, number, number] {
  const oldMat = matrixFromTransform(oldT);
  const newMat = matrixFromTransform(newT);
  const oldInv = Matrix.Invert(oldMat);
  const v = new Vector3(p[0], p[1], p[2]);
  const local = Vector3.TransformCoordinates(v, oldInv);
  const w = Vector3.TransformCoordinates(local, newMat);
  return [w.x, w.y, w.z];
}

/**
 * Mesh 의 한 face 의 world normal n 이 -Y (바닥 방향) 가 되도록
 * 회전 + AABB minY 가 0 이 되도록 Y 이동한 새 TransformV2 반환.
 *
 * 알고리즘:
 *   1. axis = n × (-Y), angle = arccos(n · -Y) 의 quaternion 으로
 *      현재 mesh rotation 에 곱해서 새 rotation 결정.
 *   2. 새 rotation 으로 가상 변환 → 새 world bounding box 의 minY
 *      구함. translation Y 를 -minY 만큼 보정해 base 가 Y=0 위에.
 *   3. translation X, Z 는 그대로 유지.
 */
export function computeAlignFloorTransform(
  mesh: Mesh,
  worldNormal: Vector3,
): TransformV2 {
  const n = worldNormal.clone().normalize();
  const target = new Vector3(0, -1, 0);
  const dot = Vector3.Dot(n, target);

  let deltaQ: Quaternion;
  if (dot > 0.9999) {
    // 이미 바닥 방향 — 회전 X.
    deltaQ = Quaternion.Identity();
  } else if (dot < -0.9999) {
    // 정반대 (위로 향함) — X 축 180°.
    deltaQ = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  } else {
    const axis = Vector3.Cross(n, target);
    axis.normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    deltaQ = Quaternion.RotationAxis(axis, angle);
  }

  // 현재 회전 quaternion.
  const curQ =
    mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation);
  const newQ = deltaQ.multiply(curQ);
  const eul = newQ.toEulerAngles();

  // 새 회전 적용한 가상 transform 으로 bounding box 의 minY 계산.
  // mesh 의 vertex local AABB 를 새 rotation 으로 변환 후 minY.
  mesh.refreshBoundingInfo();
  const localBB = mesh.getBoundingInfo().boundingBox;
  const localCorners = [
    new Vector3(localBB.minimum.x, localBB.minimum.y, localBB.minimum.z),
    new Vector3(localBB.maximum.x, localBB.minimum.y, localBB.minimum.z),
    new Vector3(localBB.minimum.x, localBB.maximum.y, localBB.minimum.z),
    new Vector3(localBB.minimum.x, localBB.minimum.y, localBB.maximum.z),
    new Vector3(localBB.maximum.x, localBB.maximum.y, localBB.minimum.z),
    new Vector3(localBB.maximum.x, localBB.minimum.y, localBB.maximum.z),
    new Vector3(localBB.minimum.x, localBB.maximum.y, localBB.maximum.z),
    new Vector3(localBB.maximum.x, localBB.maximum.y, localBB.maximum.z),
  ];
  const sx = mesh.scaling.x;
  const sy = mesh.scaling.y;
  const sz = mesh.scaling.z;
  const rotMat = Matrix.Identity();
  newQ.toRotationMatrix(rotMat);
  let minY = Infinity;
  for (const c of localCorners) {
    const scaled = new Vector3(c.x * sx, c.y * sy, c.z * sz);
    const rotated = Vector3.TransformCoordinates(scaled, rotMat);
    if (rotated.y < minY) minY = rotated.y;
  }

  return {
    tx: mesh.position.x,
    ty: -minY, // base 가 Y=0 위에 정확히 놓이도록
    tz: mesh.position.z,
    rx: radToDeg(eul.x),
    ry: radToDeg(eul.y),
    rz: radToDeg(eul.z),
    sx,
    sy,
    sz,
  };
}

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
