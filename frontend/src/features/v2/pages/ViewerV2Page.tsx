import { useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { SupportParamsPanel } from "../support";
import BabylonScene from "../components/BabylonScene";

/**
 * v2 프로젝트 작업 화면.
 *
 * 옛 ViewerPage 와 무관. 첫 패스: 헤더, STL 업로드, BabylonScene,
 * 우측 SupportParamsPanel.
 *
 * STL Blob 영속화 (IndexedDB 저장) 는 다음 commit. 지금은 메모리만.
 */
const ViewerV2Page: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { project, loading, error } = useProjectV2(projectId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stlBlob, setStlBlob] = useState<Blob | null>(null);
  const [stlName, setStlName] = useState<string | null>(null);

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStlBlob(file);
    setStlName(file.name);
    e.target.value = ""; // 같은 파일 재선택 가능하게
  }

  function handleClear() {
    setStlBlob(null);
    setStlName(null);
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
              onClick={handlePickFile}
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
            >
              {stlBlob ? "STL 변경" : "STL 불러오기"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".stl"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 relative bg-gray-100">
          {stlBlob ? (
            <BabylonScene stlBlob={stlBlob} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-sm">STL 파일을 불러오세요.</p>
                <p className="text-xs mt-2">
                  상단의 'STL 불러오기' 버튼을 누르면 화면에 표시됩니다.
                </p>
              </div>
            </div>
          )}
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
    </div>
  );
};

export default ViewerV2Page;
