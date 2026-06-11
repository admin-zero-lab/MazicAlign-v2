import {
  Color3,
  Mesh,
  Scene,
  StandardMaterial,
  VertexData,
} from "@babylonjs/core";

import type { SlicePolygon } from "./slice-section";

/**
 * Polygon 을 Y=`y` 평면에 fan triangulation 으로 채워 mesh 로.
 *
 * 단순 fan (point[0] 기준) 이라 convex polygon 에서만 안정.
 * cube 사각형 / cylinder 원 / 일반적인 모델 단면은 대체로 convex 라
 * 첫 패스로 충분. 자가 교차·concave 처리는 추후 earcut 도입 검토.
 *
 * 시각적으로 단면을 막아 clipPlane 으로 잘린 모델 내부가 뚫려 보이는
 * 현상을 가린다.
 */
export function buildPolygonFillMesh(
  scene: Scene,
  polygon: SlicePolygon,
  y: number,
  material: StandardMaterial,
  name = "slice_fill",
): Mesh | null {
  const pts = polygon.points;
  const n = pts.length;
  if (n < 3) return null;

  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3 + 0] = pts[i][0];
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = pts[i][1];
  }

  const indices: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    // CCW / CW 무관하게 BackFace 도 보이도록 mesh 양면 처리.
    indices.push(0, i, i + 1);
  }

  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    normals[i * 3 + 1] = 1;
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh);

  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

/**
 * 단면 fill 용 material. 양면 렌더 (backFaceCulling=false) — fan
 * 방향이 polygon 순서에 따라 반대일 수 있어 안전한 default.
 */
export function createSliceFillMaterial(
  scene: Scene,
  diffuse: Color3,
  name: string,
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = diffuse;
  mat.specularColor = new Color3(0, 0, 0);
  mat.ambientColor = new Color3(1, 1, 1);
  mat.backFaceCulling = false;
  return mat;
}
