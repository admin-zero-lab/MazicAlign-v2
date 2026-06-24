/**
 * v2 모델 변환.
 *
 * 좌표계는 Babylon (Y-up). 사용자 UI 에서도 Y 가 "위" 라고 안내한다.
 * 회전은 Euler degrees, XYZ 순서.
 *
 * 옛 Transform 과 무관. quaternion 이 아닌 Euler 로 보관해 UI 표시가
 * 단순하다.
 */
export interface TransformV2 {
  tx: number; ty: number; tz: number; // mm
  rx: number; ry: number; rz: number; // deg
  sx: number; sy: number; sz: number; // 배율
}

export const IDENTITY_TRANSFORM: TransformV2 = {
  tx: 0, ty: 0, tz: 0,
  rx: 0, ry: 0, rz: 0,
  sx: 1, sy: 1, sz: 1,
};

export function isIdentity(t: TransformV2): boolean {
  return (
    t.tx === 0 && t.ty === 0 && t.tz === 0 &&
    t.rx === 0 && t.ry === 0 && t.rz === 0 &&
    t.sx === 1 && t.sy === 1 && t.sz === 1
  );
}

export function transformsEqual(a: TransformV2, b: TransformV2): boolean {
  return (
    a.tx === b.tx && a.ty === b.ty && a.tz === b.tz &&
    a.rx === b.rx && a.ry === b.ry && a.rz === b.rz &&
    a.sx === b.sx && a.sy === b.sy && a.sz === b.sz
  );
}
