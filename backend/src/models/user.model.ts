/**
 * 사용자 데이터 모델
 */

export enum UserRole {
  MASTER = 'master',
  CLIENT = 'client',
}

export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  lastLogin?: Date;
}

export interface CreateUserData {
  email: string;
  displayName: string;
  role: UserRole;
}
