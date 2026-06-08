import { useCallback, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { useStlFilesV2 } from "../hooks/useStlFilesV2";
import {
  useShortcutsListener,
  useShortcutHandler,
} from "../hooks/useShortcuts";
import { useClipboardStore } from "../hooks/useClipboardStore";
import { useUndoStore } from "../hooks/useUndoStore";
import { SupportParamsPanel, useSupportParamsStore } from "../support";
import BabylonScene, {
  type BabylonSceneHandle,
} from "../components/BabylonScene";
import LocalFileBrowser from "../components/LocalFileBrowser";
import ViewControls from "../components/ViewControls";
import StlFileList from "../components/StlFileList";
import TransformPanel from "../components/TransformPanel";
import { IDENTITY_TRANSFORM, type TransformV2 } from "../types/transform";

/**
 * v2 프로젝트 작업 화면.
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
    updateTransform,
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

  // ----- 선택 -----
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

  // ----- 클립보드 -----
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
    useClipboardStore
      .getState()
      .set(toCut.map((f) => ({ fileName: f.fileName, blob: f.blob })));
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

  // ----- Undo / Redo -----
  const handleUndo = useCallback(() => {
    void useUndoStore.getState().undo();
  }, []);
  const handleRedo = useCallback(() => {
    void useUndoStore.getState().redo();
  }, []);

  useShortcutHandler("selectAll", handleSelectAll);
  useShortcutHandler("copy", handleCopy);
  useShortcutHandler("cut", handleCut);
  useShortcutHandler("paste", handlePaste);
  useShortcutHandler("undo", handleUndo);
  useShortcutHandler("redo", handleRedo);

  // ----- Transform -----
  const handlePreviewTransform = useCallback(
    (id: string, t: TransformV2) => {
      sceneHandleRef.current?.previewTransform(id, t);
    },
    [],
  );

  const handleCommitTransform = useCallback(
    (id: string, start: TransformV2, end: TransformV2) => {
      // 즉시 DB 반영. (그 사이 메쉬는 이미 preview 로 반영돼 있음)
      void updateTransform(id, end);
      // Undo entry 등록 — undo/redo 모두 DB 반영 (씬도 따라 갱신)
      useUndoStore.getState().push({
        label: "transform",
        undo: async () => {
          await updateTransform(id, start);
        },
        redo: async () => {
          await updateTransform(id, end);
        },
      });
    },
    [updateTransform],
  );

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  // ----- 파일 추가/삭제 -----
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

  // 단일 선택만 Transform 패널에 표시.
  const selectedFile =
    selectedIds.size === 1
      ? files.find((f) => selectedIds.has(f.id)) ?? null
      : null;
  const transformPanelSelected = selectedFile
    ? {
        id: selectedFile.id,
        fileName: selectedFile.fileName,
        transform: selectedFile.transform ?? IDENTITY_TRANSFORM,
      }
    : null;

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

        <aside className="w-80 border-l bg-white overflow-y-auto">
          {error && (
            <p className="text-red-600 text-sm m-4">
              프로젝트 조회 실패: {error.message}
            </p>
          )}
          <div className="p-4 space-y-4">
            <TransformPanel
              selected={transformPanelSelected}
              onPreview={handlePreviewTransform}
              onCommit={handleCommitTransform}
            />
            <SupportParamsPanel />
          </div>
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
