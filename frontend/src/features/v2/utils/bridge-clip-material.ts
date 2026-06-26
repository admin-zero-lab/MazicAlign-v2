import {
  Constants,
  Effect,
  Matrix,
  RawTexture3D,
  Scene,
  ShaderMaterial,
  Vector3,
} from "@babylonjs/core";

import type { StlInsideGrid } from "./stl-sdf";

/**
 * Bridge tube fragment shader 가 STL 의 SDF texture 를 lookup 해서 inside 면
 * discard. tube 의 직선 모양은 유지하면서 STL 침투 부분만 시각적으로 제거.
 *
 * 비용:
 *   · STL 로드 시 SDF 생성 1회 (수초 freeze, 한 번만)
 *   · 매 frame fragment 마다 texture3D sample 1회 (GPU)
 *   · CSG 와 달리 transform/굵기/변곡점 변화에 비용 0
 */

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorldPos;
varying vec3 vNormalW;
void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

// STL SDF lookup — STL local 좌표로 변환 후 voxel grid index 0..1 정규화.
// bbox 밖이면 outside (clip X). uniform sdfHasTex 가 0 이면 SDF 비활성 (clip X).
const FRAGMENT = `
precision highp float;
precision highp sampler3D;
varying vec3 vWorldPos;
varying vec3 vNormalW;
uniform mat4 stlInvWorld;
uniform vec3 sdfOrigin;
uniform vec3 sdfBoxSize;    // dims * voxelSize (mm)
uniform float sdfHasTex;
uniform sampler3D sdfTexture;
uniform vec3 diffuseColor;
uniform vec3 lightDir;
void main(void) {
  if (sdfHasTex > 0.5) {
    vec3 stlLocal = (stlInvWorld * vec4(vWorldPos, 1.0)).xyz;
    vec3 gridUv = (stlLocal - sdfOrigin) / sdfBoxSize;
    if (gridUv.x >= 0.0 && gridUv.x <= 1.0 &&
        gridUv.y >= 0.0 && gridUv.y <= 1.0 &&
        gridUv.z >= 0.0 && gridUv.z <= 1.0) {
      float v = texture(sdfTexture, gridUv).r;
      if (v > 0.5) discard;
    }
  }
  vec3 nrm = normalize(vNormalW);
  float ndl = max(dot(nrm, -normalize(lightDir)), 0.0);
  vec3 col = diffuseColor * (0.35 + 0.65 * ndl);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SHADER_REGISTERED = { done: false };
function registerShader(): void {
  if (SHADER_REGISTERED.done) return;
  Effect.ShadersStore["bridgeClipVertexShader"] = VERTEX;
  Effect.ShadersStore["bridgeClipFragmentShader"] = FRAGMENT;
  SHADER_REGISTERED.done = true;
}

/** SDF data → 3D texture (Red channel, Uint8). */
export function createSdfTexture(
  scene: Scene,
  grid: StlInsideGrid,
): RawTexture3D {
  const [dx, dy, dz] = grid.dims;
  const tex = new RawTexture3D(
    grid.data,
    dx, dy, dz,
    Constants.TEXTUREFORMAT_R,
    scene,
    false, // generateMipMaps
    false, // invertY
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  tex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  tex.wrapR = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  return tex;
}

export type StlClipData = {
  grid: StlInsideGrid;
  texture: RawTexture3D;
};

/**
 * Bridge ShaderMaterial 생성.
 * onBindObservable 에서 mesh.metadata.stlId 의 SDF 데이터 + STL inv world
 * matrix 를 uniform 으로 set.
 */
export function createBridgeClipMaterial(
  scene: Scene,
  getStlData: (stlId: string) => {
    inv: Matrix;
    clip: StlClipData;
  } | null,
): ShaderMaterial {
  registerShader();
  const mat = new ShaderMaterial(
    "bridgeClip",
    scene,
    { vertex: "bridgeClip", fragment: "bridgeClip" },
    {
      attributes: ["position", "normal"],
      uniforms: [
        "world", "worldViewProjection",
        "stlInvWorld", "sdfOrigin", "sdfBoxSize", "sdfHasTex",
        "diffuseColor", "lightDir",
      ],
      samplers: ["sdfTexture"],
    },
  );

  mat.setVector3("diffuseColor", new Vector3(0.45, 0.6, 0.85));
  mat.setVector3("lightDir", new Vector3(0.3, -1, 0.5).normalize());
  mat.setFloat("sdfHasTex", 0);
  // initial dummy 값 — 실제로는 onBind 에서 매 frame set
  mat.setVector3("sdfOrigin", Vector3.Zero());
  mat.setVector3("sdfBoxSize", new Vector3(1, 1, 1));
  mat.setMatrix("stlInvWorld", Matrix.Identity());

  mat.onBindObservable.add((mesh) => {
    const stlId = (mesh.metadata as { stlId?: string } | null | undefined)
      ?.stlId;
    if (!stlId) {
      mat.setFloat("sdfHasTex", 0);
      return;
    }
    const data = getStlData(stlId);
    if (!data) {
      mat.setFloat("sdfHasTex", 0);
      return;
    }
    mat.setFloat("sdfHasTex", 1);
    mat.setMatrix("stlInvWorld", data.inv);
    const g = data.clip.grid;
    mat.setVector3("sdfOrigin", new Vector3(...g.origin));
    mat.setVector3(
      "sdfBoxSize",
      new Vector3(
        g.dims[0] * g.voxelSize,
        g.dims[1] * g.voxelSize,
        g.dims[2] * g.voxelSize,
      ),
    );
    mat.setTexture("sdfTexture", data.clip.texture);
  });

  return mat;
}
