// @types/js-clipper는 전역 `ClipperLib` 네임스페이스만 선언할 뿐 모듈 export가
// 없고, 선언 내용도 실제 런타임 API(ClipperOffset·EndType·Paths·AddPaths 등)와
// 불일치한다. 런타임 진입점(clipper.js)은 `module.exports = ClipperLib`를
// 수행하므로, 모듈명 'js-clipper'를 느슨한 타입으로 직접 선언해 보정한다.
declare module 'js-clipper' {
  const ClipperLib: any;
  export = ClipperLib;
}
