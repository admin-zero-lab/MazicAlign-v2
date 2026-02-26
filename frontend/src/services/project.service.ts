import type { Project, CreateProjectRequest, UpdateProjectRequest } from '@types/project.types';

const API_BASE = '/api/projects';

/**
 * JSON 응답의 날짜 문자열을 Date 객체로 변환
 */
const parseProject = (data: Record<string, unknown>): Project => ({
  projectId: data.projectId as string,
  ownerId: data.ownerId as string,
  projectCode: data.projectCode as string,
  projectName: data.projectName as string,
  patientInfo: (data.patientInfo as Record<string, unknown>) || {},
  createdAt: new Date(data.createdAt as string),
  lastModified: new Date(data.lastModified as string),
});

/**
 * 프로젝트 생성
 */
export const createProject = async (
  ownerId: string,
  data: CreateProjectRequest
): Promise<Project> => {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId, ...data }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to create project');
  return parseProject(json.data);
};

/**
 * 프로젝트 조회 (ID로)
 */
export const getProjectById = async (projectId: string): Promise<Project | null> => {
  const res = await fetch(`${API_BASE}/${projectId}`);
  if (res.status === 404) return null;

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get project');
  return parseProject(json.data);
};

/**
 * 사용자의 프로젝트 목록 조회
 */
export const getProjectsByOwnerId = async (ownerId: string): Promise<Project[]> => {
  const res = await fetch(`${API_BASE}?ownerId=${encodeURIComponent(ownerId)}`);

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get projects');
  return (json.data as Record<string, unknown>[]).map(parseProject);
};

/**
 * 프로젝트 코드로 프로젝트 조회
 */
export const getProjectByCode = async (_projectCode: string): Promise<Project | null> => {
  return null;
};

/**
 * 프로젝트 업데이트
 */
export const updateProject = async (
  projectId: string,
  data: UpdateProjectRequest
): Promise<void> => {
  const res = await fetch(`${API_BASE}/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update project');
};

/**
 * 프로젝트 삭제
 */
export const deleteProject = async (projectId: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/${projectId}`, { method: 'DELETE' });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete project');
};
