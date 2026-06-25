import { Matrix, type Mesh, Vector3 } from "@babylonjs/core";

type Vec3 = [number, number, number];

/**
 * STL world 좌표 한 점을 그 STL 의 local 좌표로 변환.
 * (mesh.parent = stlMesh + position = local 로 두면 mesh 의 world
 * 가 우리가 원하는 STL transform 적용된 위치가 된다.)
 */
export function worldToStlLocal(world: Vec3, stlMesh: Mesh): Vec3 {
  stlMesh.computeWorldMatrix(true);
  const inv = Matrix.Invert(stlMesh.getWorldMatrix());
  const v = new Vector3(world[0], world[1], world[2]);
  const local = Vector3.TransformCoordinates(v, inv);
  return [local.x, local.y, local.z];
}

/**
 * STL local 좌표를 그 STL 의 현재 world 좌표로 변환.
 */
export function stlLocalToWorld(local: Vec3, stlMesh: Mesh): Vec3 {
  stlMesh.computeWorldMatrix(true);
  const v = new Vector3(local[0], local[1], local[2]);
  const w = Vector3.TransformCoordinates(v, stlMesh.getWorldMatrix());
  return [w.x, w.y, w.z];
}
