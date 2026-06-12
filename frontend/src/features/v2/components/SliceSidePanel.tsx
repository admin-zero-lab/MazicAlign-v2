import type { BabylonSceneHandle } from "./BabylonScene";
import SliceMaskPreview from "./SliceMaskPreview";

interface Props {
  onClose: () => void;
  sceneHandleRef: React.RefObject<BabylonSceneHandle | null>;

  sliceYNow: number;
  layerIdx: number;
  layerHeightMm: number;
  layerCount: number;
  sceneTopY: number;

  onLayerIdxChange: (i: number) => void;
  onLayerHeightChange: (mm: number) => void;

  onExportMasksZip: () => void;
  onExportCtb: () => void;
  batchBusy: boolean;
  batchDone: number;
  batchTotal: number;

  modelCount: number;
}

/**
 * Viewport 옆에 붙는 슬라이스 미리보기 사이드 패널 (modal 아님).
 *
 * 메인 viewport 가 가려지지 않도록 별도 좁은 column 으로 추가. 사용자가
 * 3D 뷰의 시점/배율을 그대로 유지한 채 layer scrub 을 할 수 있다.
 */
const SliceSidePanel: React.FC<Props> = ({
  onClose,
  sceneHandleRef,
  sliceYNow,
  layerIdx,
  layerHeightMm,
  layerCount,
  sceneTopY,
  onLayerIdxChange,
  onLayerHeightChange,
  onExportMasksZip,
  onExportCtb,
  batchBusy,
  batchDone,
  batchTotal,
  modelCount,
}) => {
  const safeLayerIdx = Math.min(layerIdx, Math.max(0, layerCount - 1));

  return (
    <aside className="w-[420px] border-l border-gray-200 bg-white flex flex-col overflow-y-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            슬라이스 미리보기
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            LCD 1bpp 마스크 (흰 = 모델 영역)
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={batchBusy}
          className="text-gray-400 hover:text-gray-700 text-lg leading-none disabled:opacity-30"
          title="닫기"
        >
          ×
        </button>
      </header>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-center bg-gray-50 rounded p-2">
          <SliceMaskPreview
            sceneHandleRef={sceneHandleRef}
            sliceY={sliceYNow}
            widthPx={380}
            heightPx={240}
          />
        </div>

        <Card title="레이어 두께">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.01}
              max={0.3}
              step={0.005}
              value={layerHeightMm}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v > 0) onLayerHeightChange(v);
              }}
              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
            />
            <span className="text-xs text-gray-500">mm</span>
            <span className="ml-auto text-xs text-gray-500">
              총 {layerCount} layer
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            모델 top: {sceneTopY.toFixed(2)} mm
          </p>
        </Card>

        <Card title="현재 레이어">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, layerCount - 1)}
              step={1}
              value={safeLayerIdx}
              onChange={(e) => onLayerIdxChange(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <input
              type="number"
              min={0}
              max={Math.max(0, layerCount - 1)}
              step={1}
              value={safeLayerIdx}
              onChange={(e) => onLayerIdxChange(Number(e.target.value))}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
            />
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Z = {sliceYNow.toFixed(3)} mm
          </p>
        </Card>

        <Card title="내보내기">
          {batchBusy ? (
            <div className="text-sm text-gray-700">
              진행 중… {batchDone} / {batchTotal}
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-primary-600 h-2 transition-all"
                  style={{
                    width:
                      batchTotal > 0
                        ? `${(batchDone / batchTotal) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={onExportMasksZip}
                disabled={modelCount === 0}
                className="px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                마스크 ZIP
              </button>
              <button
                onClick={onExportCtb}
                disabled
                title="ChiTuBox 강제 종료 — spec 재검토 중"
                className="px-3 py-2 text-sm border border-gray-300 text-gray-400 rounded cursor-not-allowed"
              >
                .ctb (검증 중)
              </button>
            </div>
          )}
        </Card>
      </div>
    </aside>
  );
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded p-3">
      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default SliceSidePanel;
