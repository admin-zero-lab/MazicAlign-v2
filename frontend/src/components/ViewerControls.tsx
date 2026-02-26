interface ViewerControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onToggleWireframe?: () => void;
  className?: string;
}

/**
 * 뷰어 컨트롤 컴포넌트
 * 3D 뷰어의 줌, 리셋 등 제어 버튼 제공
 */
const ViewerControls: React.FC<ViewerControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleWireframe,
  className = '',
}) => {
  const buttonClass =
    'p-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors';

  return (
    <div className={`flex flex-col space-y-2 ${className}`}>
      {/* 줌 인 */}
      {onZoomIn && (
        <button
          onClick={onZoomIn}
          className={buttonClass}
          title="Zoom In"
          aria-label="Zoom In"
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
            />
          </svg>
        </button>
      )}

      {/* 줌 아웃 */}
      {onZoomOut && (
        <button
          onClick={onZoomOut}
          className={buttonClass}
          title="Zoom Out"
          aria-label="Zoom Out"
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
            />
          </svg>
        </button>
      )}

      {/* 뷰 리셋 */}
      {onResetView && (
        <button
          onClick={onResetView}
          className={buttonClass}
          title="Reset View"
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
