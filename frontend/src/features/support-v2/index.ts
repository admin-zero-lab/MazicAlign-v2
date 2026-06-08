// support-v2 public surface.
// ViewerPage 등 바깥에서는 이 파일을 통해서만 가져간다.

export { default as SupportV2Panel } from "./components/SupportV2Panel";
export { useSupportV2ParamsStore } from "./hooks/useSupportV2ParamsStore";

export type { SupportV2Params, SupportV2ParamKey } from "./types";
export {
  DEFAULT_SUPPORT_V2_PARAMS,
  SUPPORT_V2_PARAM_LIMITS,
} from "./utils/defaults";
