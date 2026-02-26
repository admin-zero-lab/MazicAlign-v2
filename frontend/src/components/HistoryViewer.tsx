import { useAdjustmentLogs } from '@hooks/useAdjustmentLogs';
import type { AdjustmentLog } from '@types/stl.types';

interface HistoryViewerProps {
  stlId?: string;
  onRestore?: (log: AdjustmentLog) => void;
  isMaster?: boolean;
  className?: string;
}

/**
 * 히스토리 뷰어 컴포넌트
 * STL 파일의 조정 이력 표시
 */
const HistoryViewer: React.FC<HistoryViewerProps> = ({
  stlId,
  onRestore,
  isMaster = false,
  className = '',
}) => {
  const { logs, loading, error, refreshLogs, deleteLog, clearHistory } = useAdjustmentLogs(stlId);

  /**
   * 시간 포맷팅
   */
  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'Just now';
  };

  /**
   * Delta 값 포맷팅
   */
  const formatDelta = (deltaValue: any): string => {
    if (!deltaValue) return '';

    const values = [];
    if (deltaValue.x !== undefined) values.push(`X:${deltaValue.x.toFixed(2)}`);
    if (deltaValue.y !== undefined) values.push(`Y:${deltaValue.y.toFixed(2)}`);
    if (deltaValue.z !== undefined) values.push(`Z:${deltaValue.z.toFixed(2)}`);

    return values.join(', ');
  };

  /**
   * 조정 타입별 아이콘
   */
  const getAdjustmentIcon = (type: string) => {
    switch (type) {
      case 'Translation':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
            />
          </svg>
        );
      case 'Rotation':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
      case 'Scale':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  if (!stlId) {
    return (
      <div className={`p-4 text-center text-gray-400 ${className}`}>
        Select a file to view history
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`p-4 text-center text-gray-600 ${className}`}>
        Loading history...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-400 ${className}`}>
        No adjustment history
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 헤더 */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">History</h3>
        <div className="flex items-center space-x-2">
          {isMaster && logs.length > 0 && (
            <button
              onClick={async () => {
                if (confirm('Are you sure you want to delete ALL history logs for this file?')) {
                  await clearHistory();
                }
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Delete All
            </button>
          )}
          <button
            onClick={refreshLogs}
            className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 로그 목록 */}
      <div className="overflow-y-auto max-h-96">
        {logs.map((log) => (
          <div
            key={log.logId}
            className="p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start space-x-3">
              {/* 아이콘 */}
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
                {getAdjustmentIcon(log.adjustmentType)}
              </div>

              {/* 내용 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">
                    {log.adjustmentType}
                  </p>
                  <span className="text-xs text-gray-500">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {formatDelta(log.deltaValue)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  by User {log.userId.substring(0, 8)}
                </p>
              </div>

              {/* 복원 버튼 */}
              {onRestore && (
                <button
                  onClick={() => onRestore(log)}
                  className="flex-shrink-0 px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded transition-colors"
                  title="Restore to this point"
                >
                  Restore
                </button>
              )}

              {/* 삭제 버튼 (Master Only) */}
              {isMaster && (
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to delete this log?')) {
                      await deleteLog(log.logId);
                    }
                  }}
                  className="flex-shrink-0 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete log"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 통계 */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-600">
          Total adjustments: <span className="font-semibold">{logs.length}</span>
        </p>
      </div>
    </div>
  );
};

export default HistoryViewer;
