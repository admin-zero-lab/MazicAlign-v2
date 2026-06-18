import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
  Vector4,
} from "@babylonjs/core";

import type { SupportParams, SupportPointV2 } from "../support/types";

/**
 * 서포트 기둥. base → contact 방향으로 그려진다.
 *
 * Profile (Y 축 기본, Lathe):
 *   · source='auto'|'manual': baseDiameter (큰 바닥, 플레이트 접점)
 *     → trunk → tip (모델 접점, 가는 끝)
 *   · source='bridge'        : 양 끝 모두 tipDiameter (대칭).
 *     모델 두 지점을 잇는 cross-brace 용.
 *
 * 회전: Y-up 의 lathe 를 (contact - base) 방향으로 회전시켜 두
 * 점을 잇게 한다. (base.xz == contact.xz 인 수직 케이스는 자동으로
 * identity 회전이 되어 기존 동작과 같다.)
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

  const direction = contact.subtract(base);
  const length = Math.max(direction.length(), 0.01);

  let baseT = params.baseTransitionMm;
  let tipT = params.tipTransitionMm;
  const totalT = baseT + tipT;
  if (totalT >= length) {
    const scale = (length / totalT) * 0.95;
    baseT *= scale;
    tipT *= scale;
  }

  const isBridge = point.source === "bridge";

  // Bridge 는 trunk 굵기를 bridgeDiameterMm 로 별도 사용.
  const trunkR =
    (isBridge ? params.bridgeDiameterMm : params.trunkDiameterMm) * 0.5;
  const tipR = Math.min(params.tipDiameterMm * 0.5, trunkR);
  const baseR = Math.max(params.baseDiameterMm * 0.5, trunkR);

  // 시작 반지름: 브릿지는 양 끝 모두 tip 반지름 (양쪽 다 모델 자국 작음).
  const startR = isBridge ? tipR : baseR;

  const profile: Vector3[] = [
    new Vector3(startR, 0, 0),
    new Vector3(trunkR, baseT, 0),
    new Vector3(trunkR, length - tipT, 0),
    new Vector3(tipR, length, 0),
  ];

  const m = MeshBuilder.CreateLathe(
    `support_${point.id}`,
    {
      shape: profile,
      tessellation: 12,
      closed: true,
      cap: Mesh.CAP_ALL,
      sideOrientation: Mesh.DEFAULTSIDE,
      frontUVs: new Vector4(0, 0, 1, 1),
    },
    scene,
  );

  m.position.copyFrom(base);

  // up (lathe 의 +Y) 를 direction 으로 정렬. 수직 케이스는 identity.
  const dirNorm = direction.normalizeToNew();
  const up = new Vector3(0, 1, 0);
  const dot = Vector3.Dot(up, dirNorm);
  if (dot > 0.9999) {
    m.rotationQuaternion = Quaternion.Identity();
  } else if (dot < -0.9999) {
    // 완전 반대 방향 — X 축 180°.
    m.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  } else {
    const axis = Vector3.Cross(up, dirNorm);
    axis.normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    m.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
  }

  m.material = material;
  m.isPickable = false;
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
