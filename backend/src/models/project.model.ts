/**
 * 프로젝트 데이터 모델
 */

export interface PatientInfo {
  name?: string;
  chartId?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  [key: string]: string | undefined;
}

export interface Project {
  projectId: string;
  ownerId: string;
  projectCode: string;
  projectName: string;
  patientInfo: PatientInfo;
  createdAt: Date;
  lastModified: Date;
}

export interface CreateProjectData {
  projectName: string;
  ownerId: string;
  patientInfo?: Partial<PatientInfo>;
}

export interface UpdateProjectData {
  projectName?: string;
  patientInfo?: Partial<PatientInfo>;
}
