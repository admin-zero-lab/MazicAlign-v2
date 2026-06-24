import { useEffect, useRef, useState } from "react";

import {
  IDENTITY_TRANSFORM,
  transformsEqual,
  type TransformV2,
} from "../types/transform";

interface TransformPanelProps {
  /** 단일 선택된 STL. 없으면 안내문만 표시. */
  selected: {
    id: string;
    fileName: string;
    transform: TransformV2;
  } | null;

  /**
   * 즉시 (드래그 중) 호출. DB 저장은 안 하고 메쉬만 갱신.
   */
  onPreview: (id: string, t: TransformV2) => void;

  /**
   * 드래그가 끝났을 때 한 번 호출. (start, end) 가 다르면 DB 저장 +
   * undo 스택에 push.
   */
  onCommit: (id: string, start: TransformV2, end: TransformV2) => void;

  className?: string;
}

/**
 * 단일 선택 STL 의 Position / Rotation / Scale 슬라이더 + 숫자 입력.
 *
 * 좌표계는 Babylon (Y 가 "위"). 사용자에게도 그대로 표기.
 *
 * undo 단위 = 한 번의 포인터 드래그 (mousedown → mouseup).
 * 그 사이 onChange 는 메쉬만 미리보기로 갱신하고 commit 은
 * pointerup 에서 한 번만 일어난다.
 */
const TransformPanel: React.FC<TransformPanelProps> = ({
  selected,
  onPreview,
  onCommit,
  className = "",
}) => {
  // 패널 내부 표시값. selected 가 바뀌면 그 값으로 동기화.
  const [local, setLocal] = useState<TransformV2>(IDENTITY_TRANSFORM);
  const startRef = useRef<TransformV2 | null>(null);
  // Scale uniform 토글: ON 시 sx/sy/sz 가 한 값으로 동기 변경.
  const [uniformScale, setUniformScale] = useState(true);

  useEffect(() => {
    setLocal(selected ? selected.transform : IDENTITY_TRANSFORM);
    startRef.current = null;
  }, [selected]);

  if (!selected) {
    return (
      <div
        className={`p-4 bg-white rounded-lg shadow text-sm text-gray-500 ${className}`}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Transform</h3>
        <p>
          모델을 하나만 선택하면 위치 / 회전 / 스케일을 조정할 수 있습니다.
        </p>
      </div>
    );
  }

  function beginDrag() {
    startRef.current = { ...local };
  }

  function applyField<K extends keyof TransformV2>(key: K, value: number) {
    if (Number.isNaN(value)) return;
    setLocal((prev) => {
      // uniformScale ON + scale 축이면 세 축 동시 변경.
      const isScale = key === "sx" || key === "sy" || key === "sz";
      const next =
        uniformScale && isScale
          ? { ...prev, sx: value, sy: value, sz: value }
          : { ...prev, [key]: value };
      onPreview(selected!.id, next);
      return next;
    });
  }

  function endDrag() {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    if (transformsEqual(start, local)) return;
    onCommit(selected!.id, start, local);
  }

  function resetAll() {
    if (transformsEqual(local, IDENTITY_TRANSFORM)) return;
    const start = { ...local };
    setLocal(IDENTITY_TRANSFORM);
    onPreview(selected!.id, IDENTITY_TRANSFORM);
    onCommit(selected!.id, start, IDENTITY_TRANSFORM);
  }

  return (
    <div className={`p-4 bg-white rounded-lg shadow ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">Transform</h3>
        <button
          onClick={resetAll}
          disabled={transformsEqual(local, IDENTITY_TRANSFORM)}
          className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>
      <p className="text-xs text-gray-500 truncate mb-3" title={selected.fileName}>
        {selected.fileName}
      </p>

      <Section title="Position (mm)">
        {(["tx", "ty", "tz"] as const).map((k, i) => (
          <Row
            key={k}
            axis={"XYZ"[i]}
            value={local[k]}
            min={-200}
            max={200}
            step={0.1}
            onBegin={beginDrag}
            onChange={(v) => applyField(k, v)}
            onEnd={endDrag}
          />
        ))}
      </Section>

      <Section title="Rotation (deg)">
        {(["rx", "ry", "rz"] as const).map((k, i) => (
          <Row
            key={k}
            axis={"XYZ"[i]}
            value={local[k]}
            min={-180}
            max={180}
            step={1}
            onBegin={beginDrag}
            onChange={(v) => applyField(k, v)}
            onEnd={endDrag}
          />
        ))}
        <div className="flex flex-wrap gap-1 mt-1">
          {(
            [
              { key: "rx", delta: 90, label: "X +90°" },
              { key: "rx", delta: -90, label: "X −90°" },
              { key: "ry", delta: 90, label: "Y +90°" },
              { key: "ry", delta: -90, label: "Y −90°" },
              { key: "rz", delta: 90, label: "Z +90°" },
              { key: "rz", delta: -90, label: "Z −90°" },
            ] as const
          ).map(({ key, delta, label }) => (
            <button
              key={label}
              onClick={() => {
                const start = { ...local };
                let next = start[key] + delta;
                // ±180 안으로 정규화.
                while (next > 180) next -= 360;
                while (next <= -180) next += 360;
                const end = { ...start, [key]: next };
                setLocal(end);
                onPreview(selected!.id, end);
                onCommit(selected!.id, start, end);
              }}
              className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Scale (×)"
        right={
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={uniformScale}
              onChange={(e) => setUniformScale(e.target.checked)}
              className="accent-primary-600"
            />
            통합 조정
          </label>
        }
      >
        {uniformScale ? (
          <Row
            axis="XYZ"
            value={local.sx}
            min={0.1}
            max={5}
            step={0.01}
            onBegin={beginDrag}
            onChange={(v) => applyField("sx", v)}
            onEnd={endDrag}
          />
        ) : (
          (["sx", "sy", "sz"] as const).map((k, i) => (
            <Row
              key={k}
              axis={"XYZ"[i]}
              value={local[k]}
              min={0.1}
              max={5}
              step={0.01}
              onBegin={beginDrag}
              onChange={(v) => applyField(k, v)}
              onEnd={endDrag}
            />
          ))
        )}
      </Section>
    </div>
  );
};

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {title}
        </h4>
        {right}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

interface RowProps {
  axis: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onBegin: () => void;
  onChange: (v: number) => void;
  onEnd: () => void;
}

function Row({ axis, value, min, max, step, onBegin, onChange, onEnd }: RowProps) {
  return (
    <div className="flex items-center space-x-2">
      <span className="w-4 text-xs font-bold text-gray-600">{axis}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onBegin}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onFocus={onBegin}
        onBlur={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 px-1.5 py-0.5 text-xs border border-gray-300 rounded"
      />
    </div>
  );
}

export default TransformPanel;
