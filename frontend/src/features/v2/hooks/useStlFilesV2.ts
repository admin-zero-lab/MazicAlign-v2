import { useCallback, useEffect, useState } from "react";

import * as repo from "../data/stl-files.repo";
import * as supportRepo from "../data/supports.repo";
import type { STLFileV2 } from "../types/stl";
import type { TransformV2 } from "../types/transform";

/**
 * 한 프로젝트의 STL 파일 목록과 add / remove.
 */
export function useStlFilesV2(projectId: string | undefined) {
  const [files, setFiles] = useState<STLFileV2[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setFiles(await repo.listStlFilesByProject(projectId));
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (fileName: string, blob: Blob) => {
      if (!projectId) throw new Error("projectId 가 없습니다.");
      const created = await repo.createStlFile(projectId, fileName, blob);
      await refresh();
      return created;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      // 서포트 cascade — STL 삭제 시 그 위의 서포트도 같이 지운다.
      await supportRepo.deleteSupportsByStl(id);
      await repo.deleteStlFile(id);
      await refresh();
    },
    [refresh],
  );

  const updateTransform = useCallback(
    async (id: string, transform: TransformV2) => {
      await repo.updateStlFile(id, { transform });
      await refresh();
    },
    [refresh],
  );

  return { files, loading, error, refresh, add, remove, updateTransform };
}
