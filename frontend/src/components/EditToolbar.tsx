interface EditToolbarProps {
  onSelectAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** 전체선택 가능 여부 (불러온 파일이 있을 때) */
  canSelectAll: boolean;
  /** 복사 가능 여부 (선택된 파일이 있을 때) */
  canCopy: boolean;
  /** 붙여넣기 가능 여부 (클립보드에 복사된 모델이 있을 때) */
  canPaste: boolean;
  /** Undo/Redo 가능 여부 (선택된 파일이 있을 때) */
  canHistory: boolean;
  className?: string;
}

/**
 * 맞춤 편집 툴바
 * 전체선택 / 복사 / 붙여넣기 / 실행취소 / 다시실행 버튼을 상단에 제공한다.
 * 키보드 단축키(Ctrl+A/C/V/Z/Y)와 동일한 동작을 수행한다.
 */
const EditToolbar: React.FC<EditToolbarProps> = ({
  onSelectAll,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  canSelectAll,
  canCopy,
  canPaste,
  canHistory,
  className = '',
}) => {
  const buttonClass =
    'flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm text-gray-700 ' +
    'hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      {/* 전체선택 */}
      <button
        onClick={onSelectAll}
        disabled={!canSelectAll}
        className={buttonClass}
        title="전체선택 — 불러온 모든 STL 파일 (Ctrl+A)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m-4 12h2a2 2 0 002-2v-2M9 12l2 2 4-4"
          />
        </svg>
        <span>전체선택</span>
      </button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* 복사 */}
      <button
        onClick={onCopy}
        disabled={!canCopy}
        className={buttonClass}
        title="복사 (Ctrl+C)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span>복사</span>
      </button>

      {/* 붙여넣기 */}
      <button
        onClick={onPaste}
        disabled={!canPaste}
        className={buttonClass}
        title="붙여넣기 (Ctrl+V)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <span>붙여넣기</span>
      </button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* 실행취소 */}
      <button
        onClick={onUndo}
        disabled={!canHistory}
        className={buttonClass}
        title="실행취소 — 바로 이전 단계로 (Ctrl+Z)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5"
          />
        </svg>
        <span>실행취소</span>
      </button>

      {/* 다시실행 */}
      <button
        onClick={onRedo}
        disabled={!canHistory}
        className={buttonClass}
        title="다시실행 — 바로 다음 단계로 (Ctrl+Y)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 10H11a5 5 0 00-5 5v2m15-7l-5-5m5 5l-5 5"
          />
        </svg>
        <span>다시실행</span>
      </button>
    </div>
  );
};

export default EditToolbar;
