/**
 * 작업 완료된 STL 내보내기 — 여러 메쉬(원본 모델 + 서포트 + 가로 빔 등)를 하나의
 * binary STL 파일로 병합 출력한다. 외부 슬라이서/뷰어에서 그대로 열 수 있도록
 * 일반적인 Z-up 좌표계로 변환한다.
 *
 * 좌표 변환 (Babylon → STL Z-up):
 *   STL.x =  Babylon.x   (사용자 X)
 *   STL.y = -Babylon.z   (사용자 Y)
 *   STL.z =  Babylon.y   (사용자 Z, 높이)
 */
import { Mesh, Vector3 } from '@babylonjs/core';

interface Tri {
  n: Vector3;
  v0: Vector3;
  v1: Vector3;
  v2: Vector3;
}

/** Babylon (y-up) → STL (z-up) 좌표 변환 */
const toStl = (v: Vector3): Vector3 => new Vector3(v.x, -v.z, v.y);

/**
 * 여러 메쉬를 하나의 binary STL Blob 으로 직렬화한다.
 * 메쉬는 world matrix 가 적용된 절대 좌표로 기록된다(부모-자식 결합 무관).
 */
export const exportMeshesToSTL = (meshes: Mesh[]): Blob => {
  const triangles: Tri[] = [];

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const positions = mesh.getVerticesData('position');
    const indices = mesh.getIndices();
    if (!positions || !indices) continue;

    const wm = mesh.getWorldMatrix();
    const tmp0 = new Vector3();
    const tmp1 = new Vector3();
    const tmp2 = new Vector3();

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;
      Vector3.TransformCoordinatesFromFloatsToRef(positions[a], positions[a + 1], positions[a + 2], wm, tmp0);
      Vector3.TransformCoordinatesFromFloatsToRef(positions[b], positions[b + 1], positions[b + 2], wm, tmp1);
      Vector3.TransformCoordinatesFromFloatsToRef(positions[c], positions[c + 1], positions[c + 2], wm, tmp2);

      // 좌표계 변환
      const v0 = toStl(tmp0);
      const v1 = toStl(tmp1);
      const v2 = toStl(tmp2);
      const e1 = v1.subtract(v0);
      const e2 = v2.subtract(v0);
      const n = Vector3.Cross(e1, e2);
      const len = n.length();
      if (len < 1e-12) continue; // 퇴화 삼각형 제외
      n.scaleInPlace(1 / len);
      triangles.push({ n, v0, v1, v2 });
    }
  }

  // binary STL: 80-byte header + uint32 triCount + 50 bytes per triangle
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  let off = 84;
  const writeVec = (v: Vector3) => {
    view.setFloat32(off, v.x, true); off += 4;
    view.setFloat32(off, v.y, true); off += 4;
    view.setFloat32(off, v.z, true); off += 4;
  };
  for (const t of triangles) {
    writeVec(t.n);
    writeVec(t.v0);
    writeVec(t.v1);
    writeVec(t.v2);
    view.setUint16(off, 0, true); off += 2; // attribute byte count
  }
  return new Blob([buffer], { type: 'model/stl' });
};

/** Blob 을 사용자에게 다운로드시킨다. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
