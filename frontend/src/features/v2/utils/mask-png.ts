import type { SliceMask } from "./slice-rasterize";

/**
 * 1bpp mask → PNG Blob.
 *
 * 흰색 = 1 (모델 영역), 검정 = 0. 실제 LCD 스크린의 expose 마스크와
 * 같은 색 매핑이라 슬라이서 라이브러리 / UVTools 에서 그대로 비교
 * 가능.
 *
 * 브라우저 캔버스를 이용한다 — 의존성 없음. 비동기.
 */
export async function maskToPngBlob(mask: SliceMask): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const v = mask.data[i] ? 255 : 0;
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("canvas.toBlob failed"));
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}
