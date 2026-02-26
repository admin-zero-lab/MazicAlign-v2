/**
 * STL 파일 및 조정 로그 데이터 모델
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  translation: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

export interface STLFile {
  stlId: string;
  projectId: string;
  originalUrl: string;
  fileName: string;
  visibility: boolean;
  currentTransform: Transform;
  uploadedAt?: Date;
  fileSize?: number;
}

export enum AdjustmentType {
  TRANSLATION = 'Translation',
  ROTATION = 'Rotation',
  SCALE = 'Scale',
}

export type DeltaValue = Partial<Vector3> | Partial<Quaternion>;

export interface AdjustmentLog {
  logId: string;
  projectId: string;
  stlId: string;
  userId: string;
  timestamp: Date;
  adjustmentType: AdjustmentType;
  deltaValue: DeltaValue;
}

export interface CreateSTLFileData {
  projectId: string;
  originalUrl: string;
  fileName: string;
  fileSize?: number;
}

export interface CreateAdjustmentLogData {
  projectId: string;
  stlId: string;
  userId: string;
  adjustmentType: AdjustmentType;
  deltaValue: DeltaValue;
}
