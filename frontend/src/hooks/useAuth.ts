import { useState, useEffect } from 'react';
import { onAuthStateChange } from '@services/auth.service';
import type { AuthState, User, LoginRequest, RegisterRequest } from '@apptypes/auth.types';

/**
 * 인증 상태 관리 커스텀 훅 (로컬 전용)
 */
export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setAuthState({ user, loading: false, error: null });
    });
    return () => unsubscribe();
  }, []);

  // 로컬 전용: login/register/logout은 no-op (하위 호환)
  const logout = async (): Promise<void> => {};
  const login = async (_credentials: LoginRequest): Promise<User | null> => null;
  const register = async (_data: RegisterRequest): Promise<User | null> => null;

  return {
    user: authState.user,
    loading: authState.loading,
    error: authState.error,
    isAuthenticated: !!authState.user,
    logout,
    login,
    register,
  };
};
