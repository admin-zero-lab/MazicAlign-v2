// v2 umbrella public surface.
// 라우트 페이지 / 데이터 훅 / 서포트 진입점을 여기서 묶어 노출한다.

export * from "./support";
export { useProjectsV2, useProjectV2 } from "./hooks/useProjectsV2";
export type {
  ProjectV2,
  ProjectV2CreateInput,
} from "./types/project";

// pages 가 추가되면 여기서도 re-export.
