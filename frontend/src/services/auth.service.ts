import type { User } from '@apptypes/auth.types';
import { UserRole } from '@apptypes/auth.types';

/**
 * 로컬 고정 유저 (인터넷 불필요, 인증 없이 바로 사용)
 */
const LOCAL_USER: User = {
  userId: 'local-master',
  email: 'local@mazicalign',
  displayName: 'Local User',
  role: UserRole.MASTER,
  createdAt: new Date(),
};

export const signInAsGuest = async (): Promise<void> => {};

export const logout = async (): Promise<void> => {};

export const getCurrentUser = async (): Promise<User | null> => LOCAL_USER;

export const onAuthStateChange = (callback: (user: User | null) => void): (() => void) => {
  callback(LOCAL_USER);
  return () => {};
};
