import { useEffect } from "react";

import type { BabylonSceneHandle } from "./BabylonScene";
import SliceMaskPreview from "./SliceMaskPreview";

interface Props {
  open: boolean;
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
 * 슬라이스 미리보기 full-size modal.
 *
 * 좌측: 큰 canvas 미니맵 (800×500). 우측: 컨트롤 + export 버튼.
 * Esc / 빈공간 클릭 / 닫기 버튼으로 종료.
 */
const SlicePreviewDialog: React.FC<Props> = ({
  open,
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
  // Esc 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !batchBusy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, batchBusy]);

  if (!open) return null;

  const safeLayerIdx = Math.min(layerIdx, Math.max(0, layerCount - 1));

  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={() => !batchBusy && onClose()}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[1280px] max-w-full max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              슬라이스 미리보기
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              실제 LCD 출력 시 각 레이어가 받을 1bpp 마스크 — 흰색 = 모델 영역.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={batchBusy}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none disabled:opacity-30"
          >
            ×
          </button>
        </header>

        <div className="flex-1 flex gap-5 p-5 min-h-0">
          {/* 좌측: 큰 미니맵 */}
          <div className="flex-1 flex items-center justify-center bg-gray-50 rounded">
            <SliceMaskPreview
              sceneHandleRef={sceneHandleRef}
              sliceY={sliceYNow}
              widthPx={800}
              heightPx={500}
            />
          </div>

          {/* 우측: 컨트롤 패널 */}
          <aside className="w-80 flex flex-col gap-4">
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
                    마스크 ZIP (PNG 시퀀스)
                  </button>
                  <button
                    onClick={onExportCtb}
                    disabled
                    title="ChiTuBox 강제 종료 — spec 재검토 중. 별도 commit 으로 다시 활성화 예정."
                    className="px-3 py-2 text-sm border border-gray-300 text-gray-400 rounded cursor-not-allowed"
                  >
                    .ctb (검증 중)
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                .ctb 는 ChiTu 사유 포맷이라 spec 검증 진행 중. UVTools /
                ChiTuBox 결과를 알려주시면 점진 수정.
              </p>
            </Card>

            <button
              onClick={onClose}
              disabled={batchBusy}
              className="mt-auto px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30"
            >
              닫기 (Esc)
            </button>
          </aside>
        </div>
      </div>
    </div>
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

export default SlicePreviewDialog;
