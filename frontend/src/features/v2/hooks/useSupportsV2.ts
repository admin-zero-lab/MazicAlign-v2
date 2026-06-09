import { useCallback, useEffect, useState } from "react";

import * as repo from "../data/supports.repo";
import type { SupportPointV2 } from "../support/types";

/**
 * 한 프로젝트의 서포트 점 목록 + 일괄 add / 단일 remove / 전부 clear.
 */
export function useSupportsV2(projectId: string | undefined) {
  const [supports, setSupports] = useState<SupportPointV2[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSupports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSupports(await repo.listSupportsByProject(projectId));
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addMany = useCallback(
    async (points: SupportPointV2[]) => {
      if (points.length === 0) return;
      await repo.addSupports(points);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.deleteSupport(id);
      await refresh();
    },
    [refresh],
  );

  const clearAll = useCallback(async () => {
    if (!projectId) return;
    await repo.deleteSupportsByProject(projectId);
    await refresh();
  }, [projectId, refresh]);

  const clearForStl = useCallback(
    async (stlId: string) => {
      await repo.deleteSupportsByStl(stlId);
      await refresh();
    },
    [refresh],
  );

  return {
    supports,
    loading,
    error,
    refresh,
    addMany,
    remove,
    clearAll,
    clearForStl,
  };
}
