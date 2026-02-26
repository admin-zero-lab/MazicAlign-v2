import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@config/database.js';
import type { Project, CreateProjectData, UpdateProjectData } from '@models/project.model.js';

/**
 * 프로젝트 코드 생성 (8자리 랜덤 코드)
 */
const generateProjectCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * DB 행을 Project 타입으로 변환
 */
const rowToProject = (row: Record<string, unknown>): Project => ({
  projectId: row.projectId as string,
  ownerId: row.ownerId as string,
  projectCode: row.projectCode as string,
  projectName: row.projectName as string,
  patientInfo: JSON.parse((row.patientInfo as string) || '{}'),
  createdAt: new Date(row.createdAt as string),
  lastModified: new Date(row.lastModified as string),
});

/**
 * 프로젝트 생성
 */
export const createProject = async (data: CreateProjectData): Promise<Project> => {
  const db = getDb();
  const projectId = uuidv4();
  const projectCode = generateProjectCode();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO projects (projectId, ownerId, projectCode, projectName, patientInfo, createdAt, lastModified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, data.ownerId, projectCode, data.projectName, JSON.stringify(data.patientInfo || {}), now, now);

  return {
    projectId,
    ownerId: data.ownerId,
    projectCode,
    projectName: data.projectName,
    patientInfo: data.patientInfo || {},
    createdAt: new Date(now),
    lastModified: new Date(now),
  };
};

/**
 * 프로젝트 조회 (ID로)
 */
export const getProjectById = async (projectId: string): Promise<Project | null> => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE projectId = ?').get(projectId) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
};

/**
 * 사용자의 프로젝트 목록 조회
 */
export const getProjectsByOwnerId = async (ownerId: string): Promise<Project[]> => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects WHERE ownerId = ? ORDER BY lastModified DESC').all(ownerId) as Record<string, unknown>[];
  return rows.map(rowToProject);
};

/**
 * 프로젝트 업데이트
 */
export const updateProject = async (projectId: string, data: UpdateProjectData): Promise<void> => {
  const db = getDb();
  const now = new Date().toISOString();

  const fields: string[] = ['lastModified = ?'];
  const values: unknown[] = [now];

  if (data.projectName !== undefined) {
    fields.push('projectName = ?');
    values.push(data.projectName);
  }
  if (data.patientInfo !== undefined) {
    fields.push('patientInfo = ?');
    values.push(JSON.stringify(data.patientInfo));
  }

  values.push(projectId);
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE projectId = ?`).run(...values);
};

/**
 * 프로젝트 삭제
 */
export const deleteProject = async (projectId: string): Promise<void> => {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE projectId = ?').run(projectId);
};
