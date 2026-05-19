interface ViewerControlsProps {
  onResetView?: () => void;
  onHome?: () => void;
  onToggleWireframe?: () => void;
  className?: string;
}

/**
 * 뷰어 컨트롤 컴포넌트
 * 3D 뷰어의 리셋 등 제어 버튼 제공
 */
const ViewerControls: React.FC<ViewerControlsProps> = ({
  onResetView,
  onHome,
  onToggleWireframe,
  className = '',
}) => {
  const buttonClass =
    'p-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors';

  return (
    <div className={`flex flex-col space-y-2 ${className}`}>
      {/* HOME — 뷰어(카메라)를 기본 위치로 초기화 */}
      {onHome && (
        <button
          onClick={onHome}
          className={buttonClass}
          title="Home View"
          aria-label="Home View"
        >
          <svg
            className="w-5 h-5 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>
      )}

      {/* 초기화 — 입력된 STL 파일들을 정중앙으로 배열 */}
      {onResetView && (
        <button
          onClick={onResetView}
          className={buttonClass}
          title="초기화 (정중앙 배열)"
          aria-label="Reset View"
        >
          <svg
            className="w-5 h-5 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      )}

      {/* 와이어프레임 토글 */}
      {onToggleWireframe && (
        <button
          onClick={onToggleWireframe}
          className={buttonClass}
          title="Toggle Wireframe"
          aria-label="Toggle Wireframe"
        >
          <svg
            className="w-5 h-5 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ViewerControls;
