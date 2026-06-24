import type {
  STLFile,
  AdjustmentLog,
  AdjustmentType,
  DeltaValue,
} from '@apptypes/stl.types';

const API_BASE = '/api/stl';

/**
 * JSON 응답의 날짜 문자열을 Date로 변환
 */
const parseSTLFile = (data: Record<string, unknown>): STLFile => ({
  stlId: data.stlId as string,
  projectId: data.projectId as string,
  originalUrl: data.originalUrl as string,
  fileName: data.fileName as string,
  visibility: data.visibility as boolean,
  currentTransform: data.currentTransform as STLFile['currentTransform'],
  uploadedAt: data.uploadedAt ? new Date(data.uploadedAt as string) : undefined,
  fileSize: data.fileSize as number | undefined,
});

const DEFAULT_TRANSFORM: STLFile['currentTransform'] = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

const parseLog = (data: Record<string, unknown>): AdjustmentLog => ({
  logId: data.logId as string,
  projectId: data.projectId as string,
  stlId: data.stlId as string,
  userId: data.userId as string,
  adjustmentType: data.adjustmentType as AdjustmentType,
  deltaValue: data.deltaValue as DeltaValue,
  transform: (data.transform as STLFile['currentTransform']) ?? DEFAULT_TRANSFORM,
  timestamp: new Date(data.timestamp as string),
});

/**
 * STL 파일 업로드 (로컬 디스크 → 백엔드)
 */
export const uploadSTLFile = async (
  projectId: string,
  file: File,
  _userId: string
): Promise<STLFile> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('projectId', projectId);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to upload STL file');
  return parseSTLFile(json.data);
};

/**
 * 프로젝트의 STL 파일 목록 조회
 */
export const getSTLFilesByProjectId = async (projectId: string): Promise<STLFile[]> => {
  const res = await fetch(`${API_BASE}?projectId=${encodeURIComponent(projectId)}`);

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get STL files');
  return (json.data as Record<string, unknown>[]).map(parseSTLFile);
};

/**
 * STL 파일 가시성 토글
 */
export const toggleSTLVisibility = async (stlId: string, visibility: boolean): Promise<void> => {
  const res = await fetch(`${API_BASE}/${stlId}/visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to toggle visibility');
};

/**
 * STL 파일 삭제
 */
export const deleteSTLFile = async (stlId: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/${stlId}`, { method: 'DELETE' });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete STL file');
};

/**
 * STL Transform 업데이트
 */
export const updateSTLTransform = async (
  stlId: string,
  transform: STLFile['currentTransform']
): Promise<void> => {
  const res = await fetch(`${API_BASE}/${stlId}/transform`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transform }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update transform');
};

/**
 * 조정 로그 생성
 */
export const createAdjustmentLog = async (
  projectId: string,
  stlId: string,
  userId: string,
  adjustmentType: AdjustmentType,
  deltaValue: DeltaValue,
  transform: STLFile['currentTransform']
): Promise<AdjustmentLog> => {
  const res = await fetch(`${API_BASE}/${stlId}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, userId, adjustmentType, deltaValue, transform }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to create log');
  return parseLog(json.data);
};

/**
 * STL 파일의 조정 로그 조회
 */
export const getAdjustmentLogsBySTLId = async (stlId: string): Promise<AdjustmentLog[]> => {
  const res = await fetch(`${API_BASE}/${stlId}/logs`);

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get logs');
  return (json.data as Record<string, unknown>[]).map(parseLog);
};

/**
 * 조정 로그 단건 삭제
 */
export const deleteAdjustmentLog = async (logId: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/logs/${logId}`, { method: 'DELETE' });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete log');
};

/**
 * STL 파일의 모든 조정 로그 삭제
 */
export const deleteAllAdjustmentLogs = async (stlId: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/${stlId}/logs`, { method: 'DELETE' });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete all logs');
};

/**
 * STL 파일 복제 (Copy & Paste)
 * 원본 모델을 동일한 변환 상태로 통째로 복제한 새 STL 파일을 반환한다.
 */
export const duplicateSTLFile = async (stlId: string): Promise<STLFile> => {
  const res = await fetch(`${API_BASE}/${stlId}/duplicate`, { method: 'POST' });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to duplicate STL file');
  return parseSTLFile(json.data);
};

/**
 * 로컬 PC 경로에서 STL 파일 직접 가져오기
 */
export const importSTLFromPath = async (
  projectId: string,
  localPath: string
): Promise<STLFile> => {
  const res = await fetch(`${API_BASE}/import-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, localPath }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to import STL file');
  return parseSTLFile(json.data);
};
