import { useState, useEffect } from 'react';

interface FsItem {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  size: number | null;
}

interface FsResponse {
  success: boolean;
  currentPath: string;
  parentPath: string | null;
  items: FsItem[];
}

interface Props {
  onSelect: (paths: string[]) => void;
  onClose: () => void;
}

const formatSize = (bytes: number | null): string => {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * 로컬 PC 파일시스템 탐색기
 * 백엔드 /api/fs 를 통해 실제 PC 폴더를 탐색
 */
const LocalFileBrowser: React.FC<Props> = ({ onSelect, onClose }) => {
  const [, setCurrentPath] = useState<string>('/');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<FsItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('/');

  const browse = async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = p === '/'
        ? '/api/fs'
        : `/api/fs?path=${encodeURIComponent(p)}`;
      const res = await fetch(url);
      const data: FsResponse = await res.json();
      if (!data.success) throw new Error('디렉토리를 읽을 수 없습니다.');
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setPathInput(data.currentPath);
      setItems(data.items);
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    browse('/');
  }, []);

  const handleItemClick = (item: FsItem) => {
    if (item.isDirectory) {
      browse(item.fullPath);
    } else {
      // STL 파일 선택 토글
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(item.fullPath)) {
          next.delete(item.fullPath);
        } else {
          next.add(item.fullPath);
        }
        return next;
      });
    }
  };

  const handleConfirm = () => {
    if (selected.size > 0) {
      onSelect(Array.from(selected));
    }
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    browse(pathInput);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">로컬 STL 파일 열기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Path bar */}
        <form onSubmit={handlePathSubmit} className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
          <button
            type="button"
            onClick={() => parentPath && browse(parentPath)}
            disabled={!parentPath}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"
            title="상위 폴더"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary-400"
            placeholder="경로 입력 후 Enter"
          />
          <button type="submit" className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded">이동</button>
        </form>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading && (
            <div className="text-center py-8 text-gray-400 text-sm">불러오는 중...</div>
          )}
          {error && (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">STL 파일이 없습니다.</div>
          )}
          {!loading && !error && items.map((item) => (
            <div
              key={item.fullPath}
              onClick={() => handleItemClick(item)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                selected.has(item.fullPath)
                  ? 'bg-primary-100 border border-primary-400'
                  : 'hover:bg-gray-50'
              }`}
            >
              {/* 아이콘 */}
              {item.isDirectory ? (
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}

              <span className="flex-1 text-sm text-gray-800 truncate">{item.name}</span>

              {!item.isDirectory && (
                <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(item.size)}</span>
              )}

              {item.isDirectory && (
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <span className="text-sm text-gray-500">
            {selected.size > 0
              ? `${selected.size}개 파일 선택됨`
              : 'STL 파일을 클릭하여 선택'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              열기 ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocalFileBrowser;
