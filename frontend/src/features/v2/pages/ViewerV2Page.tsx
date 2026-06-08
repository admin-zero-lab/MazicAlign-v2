import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { SupportParamsPanel } from "../support";

/**
 * v2 프로젝트 작업 화면 (셸).
 *
 * 옛 ViewerPage 와 무관하게 다시 짠다. 우선은 헤더 + 우측 Support
 * 패널만. STL 로드 / 변환 / 뷰어 / 슬라이서는 다음 단계에서 v2
 * 자기완결로 추가.
 */
const ViewerV2Page: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { project, loading, error } = useProjectV2(projectId);

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-full px-6 py-3 flex items-center justify-between">
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
        </div>
      </header>

      <div className="flex-1 flex">
        {/* 좌: 뷰포트 자리 (다음 단계에서 STLViewer v2 자기완결 컴포넌트 들어옴) */}
        <main className="flex-1 flex items-center justify-center text-gray-400 bg-gray-100">
          <div className="text-center">
            <p className="text-sm">3D viewport placeholder</p>
            <p className="text-xs mt-2">
              다음 단계에서 STL 로드 / 표시 기능이 들어옵니다.
            </p>
          </div>
        </main>

        {/* 우: 패널 */}
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
