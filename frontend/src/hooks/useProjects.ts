import { useState, useEffect } from 'react';
import {
  createProject as createProjectService,
  getProjectsByOwnerId,
  getProjectById,
  updateProject as updateProjectService,
  deleteProject as deleteProjectService,
} from '@services/project.service';
import type { Project, CreateProjectRequest, UpdateProjectRequest } from '@types/project.types';

/**
 * 프로젝트 관리 커스텀 훅
 */
export const useProjects = (ownerId?: string) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 프로젝트 목록 조회
   */
  const fetchProjects = async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const projectList = await getProjectsByOwnerId(userId);
      setProjects(projectList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch projects';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 프로젝트 생성
   */
  const createProject = async (
    userId: string,
    data: CreateProjectRequest
  ): Promise<Project | null> => {
    setLoading(true);
    setError(null);
    try {
      const newProject = await createProjectService(userId, data);
      setProjects((prev) => [...prev, newProject]);
      return newProject;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create project';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * 프로젝트 업데이트
   */
  const updateProject = async (
    projectId: string,
    data: UpdateProjectRequest
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await updateProjectService(projectId, data);
      // 로컬 상태 업데이트
      setProjects((prev) =>
        prev.map((p) =>
          p.projectId === projectId
            ? { ...p, ...data, lastModified: new Date() }
            : p
        )
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update project';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * 프로젝트 삭제
   */
  const deleteProject = async (projectId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await deleteProjectService(projectId);
      setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete project';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ownerId가 제공되면 자동으로 프로젝트 목록 조회
  useEffect(() => {
    if (ownerId) {
      fetchProjects(ownerId);
    }
  }, [ownerId]);

  return {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  };
};

/**
 * 단일 프로젝트 조회 훅
 */
export const useProject = (projectId?: string) => {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const projectData = await getProjectById(id);
      setProject(projectData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch project';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
  }, [projectId]);

  return {
    project,
    loading,
    error,
    refetch: () => projectId && fetchProject(projectId),
  };
};
