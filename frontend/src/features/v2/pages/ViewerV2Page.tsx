import { useCallback, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { useStlFilesV2 } from "../hooks/useStlFilesV2";
import {
  useShortcutsListener,
  useShortcutHandler,
} from "../hooks/useShortcuts";
import { useClipboardStore } from "../hooks/useClipboardStore";
import { SupportParamsPanel, useSupportParamsStore } from "../support";
import BabylonScene, {
  type BabylonSceneHandle,
} from "../components/BabylonScene";
import LocalFileBrowser from "../components/LocalFileBrowser";
import ViewControls from "../components/ViewControls";
import StlFileList from "../components/StlFileList";

/**
 * v2 프로젝트 작업 화면.
 *
 * 다중 선택 + 클립보드:
 *   · 좌클릭 (씬 또는 리스트)         → 단일 선택
 *   · Ctrl/Meta+좌클릭                → 토글
 *   · 빈 공간 좌클릭                  → 선택 해제
 *   · Ctrl+A                          → 전체 선택
 *   · Ctrl+C                          → 선택된 파일을 클립보드에 복사
 *   · Ctrl+X                          → 복사 + 원본 삭제
 *   · Ctrl+V                          → 클립보드 파일을 새 ID 로 추가
 */
const ViewerV2Page: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { project, loading, error } = useProjectV2(projectId);

  const {
    files,
    loading: filesLoading,
    add: addStlFile,
    remove: removeStlFile,
  } = useStlFilesV2(projectId);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const sceneHandleRef = useRef<BabylonSceneHandle>(null);

  const overhangAngleDeg = useSupportParamsStore(
    (s) => s.params.overhangAngleDeg,
  );

  useShortcutsListener();

  // ----- 선택 관리 -----
  const handlePick = useCallback(
    (id: string | null, opts: { multi: boolean }) => {
      setSelectedIds((prev) => {
        if (!id) return opts.multi ? prev : new Set();
        const next = new Set(prev);
        if (opts.multi) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        return new Set([id]);
      });
    },
    [],
  );

  // ----- 단축키 액션 -----
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(files.map((f) => f.id)));
  }, [files]);

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return;
    const items = files
      .filter((f) => selectedIds.has(f.id))
      .map((f) => ({ fileName: f.fileName, blob: f.blob }));
    useClipboardStore.getState().set(items);
  }, [files, selectedIds]);

  const handleCut = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const toCut = files.filter((f) => selectedIds.has(f.id));
    useClipboardStore.getState().set(
      toCut.map((f) => ({ fileName: f.fileName, blob: f.blob })),
    );
    for (const f of toCut) {
      await removeStlFile(f.id);
    }
    setSelectedIds(new Set());
  }, [files, selectedIds, removeStlFile]);

  const handlePaste = useCallback(async () => {
    const items = useClipboardStore.getState().items;
    if (items.length === 0) return;
    const newIds: string[] = [];
    for (const item of items) {
      const created = await addStlFile(
        addCopySuffix(item.fileName, files),
        item.blob,
      );
      newIds.push(created.id);
    }
    setSelectedIds(new Set(newIds));
  }, [files, addStlFile]);

  useShortcutHandler("selectAll", handleSelectAll);
  useShortcutHandler("copy", handleCopy);
  useShortcutHandler("cut", handleCut);
  useShortcutHandler("paste", handlePaste);

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  // ----- 파일 추가 / 삭제 -----
  async function handlePicked(file: { name: string; blob: Blob }) {
    setBrowserOpen(false);
    const created = await addStlFile(file.name, file.blob);
    setSelectedIds(new Set([created.id]));
  }

  async function handleRemove(id: string) {
    await removeStlFile(id);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/v2/projects")}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Projects
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {project?.name ?? (loading ? "Loading…" : "Unknown project")}
            </h1>
            {project && (
              <span className="text-xs text-gray-500 font-mono">
                {project.code}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setBrowserOpen(true)}
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
            >
              STL 불러오기
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <StlFileList
          files={files}
          selectedIds={selectedIds}
          onPick={(id, opts) => handlePick(id, opts)}
          onAdd={() => setBrowserOpen(true)}
          onRemove={handleRemove}
          loading={filesLoading}
        />

        <main className="flex-1 relative bg-gray-100">
          <BabylonScene
            ref={sceneHandleRef}
            files={files}
            selectedIds={selectedIds}
            onPick={handlePick}
            overhangAngleDeg={overhangAngleDeg}
          />

          <ViewControls
            onSetView={(p) => sceneHandleRef.current?.setView(p)}
            onFit={() => sceneHandleRef.current?.fit()}
          />

          {files.length > 0 ? (
            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-md shadow px-3 py-2 text-xs text-gray-700 space-y-1 pointer-events-none">
              <div className="flex items-center space-x-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: "rgb(255, 82, 82)" }}
                />
                <span>Overhang (≤ {overhangAngleDeg}°)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: "rgb(199, 202, 212)" }}
                />
                <span>Safe</span>
              </div>
            </div>
          ) : (
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-md shadow px-3 py-2 text-xs text-gray-600 pointer-events-none">
              좌측 '+ 추가' 또는 상단 'STL 불러오기' 로 파일을 가져오세요.
            </div>
          )}

          <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-md shadow px-3 py-2 text-xs text-gray-600 pointer-events-none">
            <div className="flex items-center space-x-2">
              <span
                className="inline-block w-3 h-1 rounded"
                style={{ background: "rgb(255,77,77)" }}
              />
              <span>X</span>
              <span
                className="inline-block w-3 h-1 rounded ml-2"
                style={{ background: "rgb(77,230,102)" }}
              />
              <span>Y (위)</span>
              <span
                className="inline-block w-3 h-1 rounded ml-2"
                style={{ background: "rgb(89,140,255)" }}
              />
              <span>Z</span>
            </div>
            <div className="mt-1 text-gray-500">
              플레이트 200 × 125 mm · 격자 10 mm
            </div>
          </div>
        </main>

        <aside className="w-80 border-l bg-white p-4 overflow-y-auto">
          {error && (
            <p className="text-red-600 text-sm mb-3">
              프로젝트 조회 실패: {error.message}
            </p>
          )}
          <SupportParamsPanel />
        </aside>
      </div>

      {browserOpen && (
        <LocalFileBrowser
          onSelect={handlePicked}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  );
};

/**
 * `model.stl` 이 이미 있을 때 `model (copy).stl`,
 * 그것도 있으면 `model (copy 2).stl` 식으로 이름 충돌을 피한다.
 */
function addCopySuffix(name: string, existing: { fileName: string }[]): string {
  const existingNames = new Set(existing.map((e) => e.fileName));
  if (!existingNames.has(name)) return name;

  const dotIdx = name.lastIndexOf(".");
  const stem = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";

  let candidate = `${stem} (copy)${ext}`;
  let i = 2;
  while (existingNames.has(candidate)) {
    candidate = `${stem} (copy ${i})${ext}`;
    i++;
  }
  return candidate;
}

export default ViewerV2Page;
