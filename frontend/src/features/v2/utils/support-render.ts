import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

import type { SupportParams, SupportPointV2 } from "../support/types";

/**
 * 한 서포트 점을 시각화하는 단일 cylinder 메쉬.
 *
 * 첫 패스에서는 굵기 전이(tip/base) 없이 균일 trunkDiameter 의
 * 원기둥 1 개로 표시한다. Tip / Base 굵기 변화는 추후 별도 mesh
 * 또는 lathe 로 보강 예정.
 */
export function createSupportMesh(
  scene: Scene,
  point: SupportPointV2,
  params: SupportParams,
  material: StandardMaterial,
): Mesh {
  const contact = new Vector3(
    point.contact[0],
    point.contact[1],
    point.contact[2],
  );
  const base = new Vector3(point.base[0], point.base[1], point.base[2]);

  const center = Vector3.Center(contact, base);
  const direction = contact.subtract(base);
  const height = direction.length();
  const diameter = params.trunkDiameterMm;

  const m = MeshBuilder.CreateCylinder(
    `support_${point.id}`,
    {
      height: Math.max(height, 0.01),
      diameter,
      tessellation: 12,
    },
    scene,
  );
  m.position.copyFrom(center);

  // Babylon CreateCylinder 는 기본 Y 축으로 직립. 우리 base→contact
  // 방향에 맞추려면 회전이 필요한데, 우리 자동 생성은 항상 Y 수직
  // (base.x=contact.x, base.z=contact.z) 이라 회전 없이도 일치한다.
  // (수동 편집에서 비수직 서포트를 만들 경우 그때 회전 추가.)

  m.material = material;
  m.isPickable = false; // 서포트는 픽으로 선택되지 않음 (Step 8 에서 활성)
  return m;
}

export function createSupportMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial("v2_support_mat", scene);
  mat.diffuseColor = new Color3(0.45, 0.6, 0.85);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mat.ambientColor = new Color3(1, 1, 1);
  return mat;
}
