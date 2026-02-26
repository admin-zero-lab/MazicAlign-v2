/**
 * 프로젝트 관련 타입 정의
 */

/**
 * 환자 정보 타입
 */
export interface PatientInfo {
  name?: string;
  chartId?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  [key: string]: string | undefined;
}

/**
 * 프로젝트 타입
 * Firestore: artifacts/{appId}/public/data/projects
 */
export interface Project {
  projectId: string;
  ownerId: string;
  projectCode: string;
  projectName: string;
  patientInfo: PatientInfo;
  createdAt: Date;
  lastModified: Date;
}

/**
 * 프로젝트 생성 요청 타입
 */
export interface CreateProjectRequest {
  projectName: string;
  patientInfo?: Partial<PatientInfo>;
}

/**
 * 프로젝트 업데이트 요청 타입
 */
export interface UpdateProjectRequest {
  projectName?: string;
  patientInfo?: Partial<PatientInfo>;
}
