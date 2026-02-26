/**
 * 사용자 인증 및 권한 관련 타입 정의
 */

/**
 * 사용자 역할 열거형
 */
export enum UserRole {
  MASTER = 'master',
  CLIENT = 'client',
}

/**
 * 사용자 타입
 * Firestore: artifacts/{appId}/public/data/users
 */
export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  lastLogin?: Date;
}

/**
 * 로그인 요청 타입
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * 프로젝트 코드 로그인 요청 타입
 */
export interface ProjectCodeLoginRequest {
  projectCode: string;
}

/**
 * 회원가입 요청 타입
 */
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

/**
 * 인증 응답 타입
 */
export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * 인증 컨텍스트 상태 타입
 */
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}
