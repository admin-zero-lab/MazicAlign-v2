import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Vector4,
} from "@babylonjs/core";

import type { SupportParams, SupportPointV2 } from "../support/types";

/**
 * 서포트 기둥의 단면 프로파일.
 *
 *   base (Y=0)            ─┐  diameter = baseDiameter
 *     │  baseTransition    │      (전이 구간: 굵기 변화)
 *   trunk                  ─┤  diameter = trunkDiameter
 *     │  (중앙)            │
 *   tip end                ─┤  diameter = trunkDiameter
 *     │  tipTransition     │      (전이 구간)
 *   contact                ─┘  diameter = tipDiameter
 *
 * Lathe(회전체) 로 만든다 — 한 mesh 로 매끄러운 윤곽.
 *
 * 자동 생성 결과는 base.xz == contact.xz 라 수직 (회전 불필요).
 * 수동 추가에서도 우리는 base 를 (contact.x, 0, contact.z) 로 두므로
 * 항상 수직.
 */
export function createSupportMesh(
  scene: Scene,
  point: SupportPointV2,
  params: SupportParams,
  material: StandardMaterial,
): Mesh {
  const base = new Vector3(point.base[0], point.base[1], point.base[2]);
  const contact = new Vector3(
    point.contact[0],
    point.contact[1],
    point.contact[2],
  );

  const height = Math.max(contact.y - base.y, 0.01);

  // 전이 길이가 전체 높이보다 커지지 않도록 안전하게 축소.
  let baseT = params.baseTransitionMm;
  let tipT = params.tipTransitionMm;
  const totalT = baseT + tipT;
  if (totalT >= height) {
    const scale = (height / totalT) * 0.95;
    baseT *= scale;
    tipT *= scale;
  }

  const trunkR = params.trunkDiameterMm * 0.5;
  const baseR = Math.max(params.baseDiameterMm * 0.5, trunkR);
  const tipR = Math.min(params.tipDiameterMm * 0.5, trunkR);

  // Lathe profile points (X = radius, Y = height along axis).
  const profile: Vector3[] = [
    new Vector3(baseR, 0, 0),
    new Vector3(trunkR, baseT, 0),
    new Vector3(trunkR, height - tipT, 0),
    new Vector3(tipR, height, 0),
  ];

  const m = MeshBuilder.CreateLathe(
    `support_${point.id}`,
    {
      shape: profile,
      tessellation: 12,
      closed: true,
      cap: Mesh.CAP_ALL,
      // sideOrientation must be set so the inside is not flipped.
      sideOrientation: Mesh.DEFAULTSIDE,
      // frontUVs / backUVs are required by the type for cap modes.
      frontUVs: new Vector4(0, 0, 1, 1),
    },
    scene,
  );

  m.position.copyFrom(base);
  m.material = material;
  m.isPickable = false; // 'support' 모드일 때만 BabylonScene 이 토글
  m.metadata = { type: "support", supportId: point.id };
  return m;
}

export function createSupportMaterial(scene: Scene): StandardMaterial {
  const mat = new StandardMaterial("v2_support_mat", scene);
  mat.diffuseColor = new Color3(0.45, 0.6, 0.85);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  mat.ambientColor = new Color3(1, 1, 1);
  return mat;
}
