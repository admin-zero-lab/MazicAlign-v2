/**
 * API 응답 관련 타입 정의
 */

/**
 * 기본 API 응답 타입
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 페이지네이션 정보 타입
 */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * 페이지네이션 응답 타입
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationInfo;
}

/**
 * 파일 업로드 응답 타입
 */
export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
}

/**
 * 에러 응답 타입
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}
