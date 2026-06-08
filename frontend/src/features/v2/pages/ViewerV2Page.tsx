import { useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { SupportParamsPanel, useSupportParamsStore } from "../support";
import BabylonScene, {
  type BabylonSceneHandle,
} from "../components/BabylonScene";
import LocalFileBrowser from "../components/LocalFileBrowser";
import ViewControls from "../components/ViewControls";

/**
 * v2 프로젝트 작업 화면.
 *
 * 파일 입력은 백엔드 /api/fs · /api/fs/read 를 경유하는 자기완결
 * LocalFileBrowser 로 받는다 (브라우저 표준 file picker 는 회사
 * 보안프로그램에 차단되는 환경 대응).
 */
const ViewerV2Page: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { project, loading, error } = useProjectV2(projectId);

  const [stlBlob, setStlBlob] = useState<Blob | null>(null);
  const [stlName, setStlName] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const sceneHandleRef = useRef<BabylonSceneHandle>(null);

  const overhangAngleDeg = useSupportParamsStore(
    (s) => s.params.overhangAngleDeg,
  );

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  function handleClear() {
    setStlBlob(null);
    setStlName(null);
  }

  function handlePicked(file: { name: string; blob: Blob }) {
    setStlBlob(file.blob);
    setStlName(file.name);
    setBrowserOpen(false);
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
            {stlName && (
              <span className="text-sm text-gray-600 truncate max-w-xs">
                {stlName}
              </span>
            )}
            {stlBlob && (
              <button
                onClick={handleClear}
                className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setBrowserOpen(true)}
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
            >
              {stlBlob ? "STL 변경" : "STL 불러오기"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 relative bg-gray-100">
          <BabylonScene
            ref={sceneHandleRef}
            stlBlob={stlBlob}
            overhangAngleDeg={overhangAngleDeg}
          />

          <ViewControls
            onSetView={(p) => sceneHandleRef.current?.setView(p)}
            onFit={() => sceneHandleRef.current?.fit()}
          />

          {stlBlob ? (
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
              상단의 'STL 불러오기' 버튼으로 파일을 가져오세요.
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
