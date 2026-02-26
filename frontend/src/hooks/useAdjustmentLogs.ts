import { useState, useEffect } from 'react';
import { getAdjustmentLogsBySTLId, deleteAdjustmentLog, deleteAllAdjustmentLogs } from '@services/stl.service';
import type { AdjustmentLog } from '@types/stl.types';

/**
 * 조정 로그 관리 커스텀 훅
 */
export const useAdjustmentLogs = (stlId?: string) => {
  const [logs, setLogs] = useState<AdjustmentLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 조정 로그 목록 조회
   */
  const fetchLogs = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const logList = await getAdjustmentLogsBySTLId(id);
      // 최신순으로 정렬
      setLogs(logList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch logs';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 로그 삭제
   */
  const deleteLog = async (logId: string) => {
    try {
      await deleteAdjustmentLog(logId);
      setLogs((prev) => prev.filter((log) => log.logId !== logId));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete log';
      setError(errorMessage);
      return false;
    }
  };

  /**
   * 히스토리 전체 삭제
   */
  const clearHistory = async () => {
    if (!stlId) return false;
    try {
      await deleteAllAdjustmentLogs(stlId);
      setLogs([]);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear history';
      setError(errorMessage);
      return false;
    }
  };

  /**
   * 로그 새로고침
   */
  const refreshLogs = () => {
    if (stlId) {
      fetchLogs(stlId);
    }
  };

  // stlId가 변경되면 자동으로 로그 조회
  useEffect(() => {
    if (stlId) {
      fetchLogs(stlId);
    } else {
      setLogs([]);
    }
  }, [stlId]);

  return {
    logs,
    loading,
    error,
    refreshLogs,
    deleteLog,
    clearHistory,
  };
};
