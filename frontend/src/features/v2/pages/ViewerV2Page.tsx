import { useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { useStlFilesV2 } from "../hooks/useStlFilesV2";
import { useShortcutsListener } from "../hooks/useShortcuts";
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
 * 레이아웃 (좌→우):
 *   [STL 리스트 56]  [3D viewport]  [Support 패널 80]
 *
 * 파일 입력은 백엔드 /api/fs · /api/fs/read 경유. 받은 Blob 은
 * 즉시 IndexedDB(stl_files) 에 저장 → useStlFilesV2 가 자동 반영.
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sceneHandleRef = useRef<BabylonSceneHandle>(null);

  const overhangAngleDeg = useSupportParamsStore(
    (s) => s.params.overhangAngleDeg,
  );

  useShortcutsListener();

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  async function handlePicked(file: { name: string; blob: Blob }) {
    setBrowserOpen(false);
    const created = await addStlFile(file.name, file.blob);
    setSelectedId(created.id);
  }

  async function handleRemove(id: string) {
    await removeStlFile(id);
    if (selectedId === id) setSelectedId(null);
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
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={() => setBrowserOpen(true)}
          onRemove={handleRemove}
          loading={filesLoading}
        />

        <main className="flex-1 relative bg-gray-100">
          <BabylonScene
            ref={sceneHandleRef}
            files={files}
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

export default ViewerV2Page;
