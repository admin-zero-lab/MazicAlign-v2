import { useCallback, useEffect, useState } from "react";

import * as repo from "../data/projects.repo";
import type { ProjectV2, ProjectV2CreateInput } from "../types/project";

/**
 * v2 프로젝트 목록 + 생성·삭제 훅.
 *
 * 옛 useProjects 와 무관. IndexedDB 단일 출처.
 */
export function useProjectsV2() {
  const [projects, setProjects] = useState<ProjectV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await repo.listProjects());
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: ProjectV2CreateInput) => {
      const created = await repo.createProject(input);
      await refresh();
      return created;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.deleteProject(id);
      await refresh();
    },
    [refresh],
  );

  return { projects, loading, error, refresh, create, remove };
}

/** 단일 프로젝트 조회. */
export function useProjectV2(id: string | undefined) {
  const [project, setProject] = useState<ProjectV2 | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(id));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setProject(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    repo.getProject(id).then(
      (p) => {
        if (!cancelled) {
          setProject(p ?? null);
          setLoading(false);
        }
      },
      (e) => {
        if (!cancelled) {
          setError(e as Error);
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { project, loading, error };
}
