/**
 * STL 파일 및 3D 변환 관련 타입 정의
 */

/**
 * 3D 벡터 타입
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 쿼터니언 (회전) 타입
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * 3D 변환 정보 타입
 */
export interface Transform {
  translation: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

/**
 * STL 파일 타입
 * Firestore: artifacts/{appId}/public/data/stlFiles
 */
export interface STLFile {
  stlId: string;
  projectId: string;
  originalUrl: string;
  fileName: string;
  visibility: boolean;
  currentTransform: Transform;
  previewTransform?: Transform; // For real-time updates without logging
  uploadedAt?: Date;
  fileSize?: number;
}

/**
 * STL 업로드 요청 타입
 */
export interface UploadSTLRequest {
  projectId: string;
  file: File;
  fileName: string;
}

/**
 * STL 조정 타입 열거형
 */
export enum AdjustmentType {
  TRANSLATION = 'Translation',
  ROTATION = 'Rotation',
  SCALE = 'Scale',
}

/**
 * Delta 값 타입 (변경된 값)
 */
export type DeltaValue = Partial<Vector3> | Partial<Quaternion>;

/**
 * 조정 로그 타입
 * Firestore: artifacts/{appId}/public/data/adjustmentLogs
 */
export interface AdjustmentLog {
  logId: string;
  projectId: string;
  stlId: string;
  userId: string;
  timestamp: Date;
  adjustmentType: AdjustmentType;
  deltaValue: DeltaValue;
  /** 이 조정이 적용된 직후의 전체 변환 스냅샷 (Undo/Redo 복원용) */
  transform: Transform;
}

/**
 * STL 조정 요청 타입
 */
export interface AdjustSTLRequest {
  stlId: string;
  adjustmentType: AdjustmentType;
  deltaValue: DeltaValue;
}
