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

const TRANSFORM_EPSILON = 1e-6;

/**
 * 두 변환이 (오차 범위 내에서) 동일한지 비교
 */
const transformsEqual = (a: Transform, b: Transform): boolean =>
  Math.abs(a.translation.x - b.translation.x) < TRANSFORM_EPSILON &&
  Math.abs(a.translation.y - b.translation.y) < TRANSFORM_EPSILON &&
  Math.abs(a.translation.z - b.translation.z) < TRANSFORM_EPSILON &&
  Math.abs(a.rotation.x - b.rotation.x) < TRANSFORM_EPSILON &&
  Math.abs(a.rotation.y - b.rotation.y) < TRANSFORM_EPSILON &&
  Math.abs(a.rotation.z - b.rotation.z) < TRANSFORM_EPSILON &&
  Math.abs(a.rotation.w - b.rotation.w) < TRANSFORM_EPSILON &&
  Math.abs(a.scale.x - b.scale.x) < TRANSFORM_EPSILON &&
  Math.abs(a.scale.y - b.scale.y) < TRANSFORM_EPSILON &&
  Math.abs(a.scale.z - b.scale.z) < TRANSFORM_EPSILON;

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
  transform: row.transform
    ? JSON.parse(row.transform as string)
    : { ...DEFAULT_TRANSFORM },
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
 * STL 파일 단건 조회
 */
export const getSTLFileById = async (stlId: string): Promise<STLFile | null> => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM stl_files WHERE stlId = ?').get(stlId) as Record<string, unknown> | undefined;
  return row ? rowToSTLFile(row) : null;
};

/**
 * STL 파일 생성 (특정 변환 상태로 — 복제 시 원본 변환 유지용)
 */
export const createSTLFileWithTransform = async (
  data: CreateSTLFileData,
  transform: Transform
): Promise<STLFile> => {
  const db = getDb();
  const stlId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO stl_files (stlId, projectId, originalUrl, fileName, fileSize, visibility, currentTransform, uploadedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(stlId, data.projectId, data.originalUrl, data.fileName, data.fileSize || 0, 1, JSON.stringify(transform), now);

  return {
    stlId,
    projectId: data.projectId,
    originalUrl: data.originalUrl,
    fileName: data.fileName,
    fileSize: data.fileSize || 0,
    visibility: true,
    currentTransform: transform,
    uploadedAt: new Date(now),
  };
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
 *
 * Undo로 과거 시점에 머문 상태에서 새 조정을 하면, 그 이후의 "미래" 로그는
 * 더 이상 Redo 대상이 될 수 없으므로 가지치기(prune)한다.
 * 조정 전(old) 변환 상태와 일치하는 로그를 찾아 그 다음 로그들을 삭제한다.
 */
export const createAdjustmentLog = async (data: CreateAdjustmentLogData): Promise<AdjustmentLog> => {
  const db = getDb();
  const logId = uuidv4();
  const now = new Date().toISOString();

  // 조정 전(현재 DB에 저장된) 변환 상태 확인
  // createAdjustmentLog는 updateSTLTransform보다 먼저 호출되므로 currentTransform은 아직 old 값이다.
  const stlRow = db
    .prepare('SELECT currentTransform FROM stl_files WHERE stlId = ?')
    .get(data.stlId) as { currentTransform?: string } | undefined;

  if (stlRow?.currentTransform) {
    const oldTransform: Transform = JSON.parse(stlRow.currentTransform);
    const existing = db
      .prepare('SELECT logId, transform FROM adjustment_logs WHERE stlId = ? ORDER BY timestamp ASC')
      .all(data.stlId) as { logId: string; transform: string | null }[];

    // 현재 상태와 일치하는 로그 다음의 로그들 = 가지치기 대상
    const matchIdx = existing.findIndex(
      (row) => row.transform && transformsEqual(JSON.parse(row.transform), oldTransform)
    );
    const del = db.prepare('DELETE FROM adjustment_logs WHERE logId = ?');
    if (matchIdx !== -1) {
      // 현재 상태 이후의 로그(미래 분기)를 삭제
      for (const row of existing.slice(matchIdx + 1)) del.run(row.logId);
    } else if (existing.length > 0 && transformsEqual(oldTransform, DEFAULT_TRANSFORM)) {
      // Undo로 시작점(기본 변환)까지 되돌아온 상태에서 새 조정을 한 경우.
      // 기본 변환은 로그로 저장되지 않아 위 findIndex로는 잡히지 않으므로,
      // 기존 로그 전체가 더 이상 Redo 대상이 아닌 미래 분기 → 모두 삭제한다.
      for (const row of existing) del.run(row.logId);
    }
  }

  db.prepare(`
    INSERT INTO adjustment_logs (logId, projectId, stlId, userId, adjustmentType, deltaValue, transform, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    data.projectId,
    data.stlId,
    data.userId,
    data.adjustmentType,
    JSON.stringify(data.deltaValue),
    JSON.stringify(data.transform),
    now
  );

  return {
    logId,
    projectId: data.projectId,
    stlId: data.stlId,
    userId: data.userId,
    adjustmentType: data.adjustmentType,
    deltaValue: data.deltaValue,
    transform: data.transform,
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
