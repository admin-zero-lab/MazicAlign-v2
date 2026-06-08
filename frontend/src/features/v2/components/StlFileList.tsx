import type { STLFileV2 } from "../types/stl";

interface StlFileListProps {
  files: STLFileV2[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  loading?: boolean;
  className?: string;
}

/**
 * 좌측 STL 리스트 패널.
 * 옛 STLFileList 와 무관. 자기완결.
 */
const StlFileList: React.FC<StlFileListProps> = ({
  files,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
  loading = false,
  className = "",
}) => {
  return (
    <aside
      className={`w-56 bg-white border-r border-gray-200 flex flex-col ${className}`}
    >
      <div className="px-3 py-3 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">
          모델
          <span className="ml-1 text-xs text-gray-400">({files.length})</span>
        </span>
        <button
          onClick={onAdd}
          className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
        >
          + 추가
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-3 py-4 text-xs text-gray-400">불러오는 중…</p>
        )}
        {!loading && files.length === 0 && (
          <p className="px-3 py-4 text-xs text-gray-400 leading-relaxed">
            아직 모델이 없습니다.
            <br />
            상단의 '+ 추가' 로 STL 을 가져오세요.
          </p>
        )}
        {!loading &&
          files.map((f) => {
            const isSelected = selectedId === f.id;
            return (
              <div
                key={f.id}
                onClick={() => onSelect(isSelected ? null : f.id)}
                className={`group px-3 py-2 cursor-pointer border-l-2 transition-colors ${
                  isSelected
                    ? "bg-primary-50 border-primary-500"
                    : "border-transparent hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm truncate ${
                      isSelected ? "text-primary-700 font-medium" : "text-gray-700"
                    }`}
                    title={f.fileName}
                  >
                    {f.fileName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`"${f.fileName}" 을(를) 삭제할까요?`)) {
                        onRemove(f.id);
                      }
                    }}
                    className="ml-2 opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-600 transition-opacity"
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatSize(f.fileSize)}
                </p>
              </div>
            );
          })}
      </div>
    </aside>
  );
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default StlFileList;
