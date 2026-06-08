import { useSupportParamsStore } from "../hooks/useSupportParamsStore";
import {
  SUPPORT_PARAM_LIMITS,
  DEFAULT_SUPPORT_PARAMS,
} from "../utils/defaults";

interface SupportParamsPanelProps {
  className?: string;
}

/**
 * 서포트 파라미터 패널.
 *
 * 모든 값은 useSupportParamsStore 에서 읽고 쓴다. 오버행 시각화 /
 * 자동 생성 / 수동 편집도 같은 스토어를 본다.
 */
const SupportParamsPanel: React.FC<SupportParamsPanelProps> = ({
  className = "",
}) => {
  const params = useSupportParamsStore((s) => s.params);
  const setParam = useSupportParamsStore((s) => s.setParam);
  const reset = useSupportParamsStore((s) => s.reset);

  const isAtDefault =
    JSON.stringify(params) === JSON.stringify(DEFAULT_SUPPORT_PARAMS);

  return (
    <div className={`p-4 bg-white rounded-lg shadow ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Support</h3>
        <button
          onClick={reset}
          disabled={isAtDefault}
          className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <label
          htmlFor="support-auto-trunk"
          className="text-sm font-medium text-gray-700 cursor-pointer"
        >
          기둥 굵기 자동 조정
        </label>
        <input
          id="support-auto-trunk"
          type="checkbox"
          checked={params.autoSizeTrunk}
          onChange={(e) => setParam("autoSizeTrunk", e.target.checked)}
          className="w-4 h-4 text-primary-600 rounded cursor-pointer"
        />
      </div>

      <div className="space-y-3">
        {(Object.keys(SUPPORT_PARAM_LIMITS) as Array<
          keyof typeof SUPPORT_PARAM_LIMITS
        >).map((key) => (
          <ParamRow
            key={key}
            paramKey={key}
            value={params[key]}
            disabled={key === "trunkDiameterMm" && params.autoSizeTrunk}
            onChange={(v) => setParam(key, v)}
          />
        ))}
      </div>
    </div>
  );
};

interface ParamRowProps {
  paramKey: keyof typeof SUPPORT_PARAM_LIMITS;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}

const ParamRow: React.FC<ParamRowProps> = ({
  paramKey,
  value,
  disabled,
  onChange,
}) => {
  const limit = SUPPORT_PARAM_LIMITS[paramKey];

  const commit = (raw: number) => {
    if (Number.isNaN(raw)) return;
    const clamped = Math.min(Math.max(raw, limit.min), limit.max);
    const stepped = Math.round(clamped / limit.step) * limit.step;
    onChange(Number(stepped.toFixed(3)));
  };

  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">{limit.label}</label>
        <span className="text-xs text-gray-500">
          {limit.min}–{limit.max} {limit.unit}
        </span>
      </div>
      <div className="flex items-center space-x-3">
        <input
          type="range"
          min={limit.min}
          max={limit.max}
          step={limit.step}
          value={value}
          disabled={disabled}
          onChange={(e) => commit(Number(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
        />
        <input
          type="number"
          min={limit.min}
          max={limit.max}
          step={limit.step}
          value={value}
          disabled={disabled}
          onChange={(e) => commit(Number(e.target.value))}
          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <span className="w-6 text-xs text-gray-500">{limit.unit}</span>
      </div>
    </div>
  );
};

export default SupportParamsPanel;
