import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@config/database.js';
import type {
  STLFile,
  AdjustmentLog,
  CreateSTLFileData,
  CreateAdjustmentLogData,
  Transform,
} from '@models/stl.model.js';

const DEFAULT_TRANSFORM: Transform = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

/**
 * DB 행을 STLFile 타입으로 변환
 */
const rowToSTLFile = (row: Record<string, unknown>): STLFile => ({
  stlId: row.stlId as string,
  projectId: row.projectId as string,
  originalUrl: row.originalUrl as string,
  fileName: row.fileName as string,
  fileSize: row.fileSize as number,
  visibility: (row.visibility as number) === 1,
  currentTransform: JSON.parse((row.currentTransform as string) || JSON.stringify(DEFAULT_TRANSFORM)),
  uploadedAt: row.uploadedAt ? new Date(row.uploadedAt as string) : undefined,
});

/**
 * DB 행을 AdjustmentLog 타입으로 변환
 */
const rowToLog = (row: Record<string, unknown>): AdjustmentLog => ({
  logId: row.logId as string,
  projectId: row.projectId as string,
  stlId: row.stlId as string,
  userId: row.userId as string,
  adjustmentType: row.adjustmentType as AdjustmentLog['adjustmentType'],
  deltaValue: JSON.parse((row.deltaValue as string) || '{}'),
  timestamp: new Date(row.timestamp as string),
});

/**
 * STL 파일 생성 (메타데이터 저장)
 */
export const createSTLFile = async (data: CreateSTLFileData): Promise<STLFile> => {
  const db = getDb();
  const stlId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO stl_files (stlId, projectId, originalUrl, fileName, fileSize, visibility, currentTransform, uploadedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(stlId, data.projectId, data.originalUrl, data.fileName, data.fileSize || 0, 1, JSON.stringify(DEFAULT_TRANSFORM), now);

  return {
    stlId,
    projectId: data.projectId,
    originalUrl: data.originalUrl,
    fileName: data.fileName,
    fileSize: data.fileSize || 0,
    visibility: true,
    currentTransform: DEFAULT_TRANSFORM,
    uploadedAt: new Date(now),
  };
};

/**
 * 프로젝트의 STL 파일 목록 조회
 */
export const getSTLFilesByProjectId = async (projectId: string): Promise<STLFile[]> => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM stl_files WHERE projectId = ? ORDER BY uploadedAt ASC').all(projectId) as Record<string, unknown>[];
  return rows.map(rowToSTLFile);
};

/**
 * STL 파일 가시성 업데이트
 */
export const updateSTLVisibility = async (stlId: string, visibility: boolean): Promise<void> => {
  const db = getDb();
  db.prepare('UPDATE stl_files SET visibility = ? WHERE stlId = ?').run(visibility ? 1 : 0, stlId);
};

/**
 * STL Transform 업데이트
 */
export const updateSTLTransform = async (stlId: string, transform: Transform): Promise<void> => {
  const db = getDb();
  db.prepare('UPDATE stl_files SET currentTransform = ? WHERE stlId = ?').run(JSON.stringify(transform), stlId);
};

/**
 * STL 파일 삭제
 */
export const deleteSTLFile = async (stlId: string): Promise<void> => {
  const db = getDb();
  db.prepare('DELETE FROM stl_files WHERE stlId = ?').run(stlId);
};

/**
 * 조정 로그 생성
 */
export const createAdjustmentLog = async (data: CreateAdjustmentLogData): Promise<AdjustmentLog> => {
  const db = getDb();
  const logId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO adjustment_logs (logId, projectId, stlId, userId, adjustmentType, deltaValue, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(logId, data.projectId, data.stlId, data.userId, data.adjustmentType, JSON.stringify(data.deltaValue), now);

  return {
    logId,
    projectId: data.projectId,
    stlId: data.stlId,
    userId: data.userId,
    adjustmentType: data.adjustmentType,
    deltaValue: data.deltaValue,
    timestamp: new Date(now),
  };
};

/**
 * STL 파일의 조정 로그 조회 (최신순)
 */
export const getAdjustmentLogsBySTLId = async (stlId: string): Promise<AdjustmentLog[]> => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM adjustment_logs WHERE stlId = ? ORDER BY timestamp DESC').all(stlId) as Record<string, unknown>[];
  return rows.map(rowToLog);
};

/**
 * 조정 로그 단건 삭제
 */
export const deleteAdjustmentLog = async (logId: string): Promise<void> => {
  const db = getDb();
  db.prepare('DELETE FROM adjustment_logs WHERE logId = ?').run(logId);
};

/**
 * STL의 모든 조정 로그 삭제
 */
export const deleteAllAdjustmentLogs = async (stlId: string): Promise<void> => {
  const db = getDb();
  db.prepare('DELETE FROM adjustment_logs WHERE stlId = ?').run(stlId);
};
