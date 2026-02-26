import { useState, useEffect } from 'react';
import { onAuthStateChange } from '@services/auth.service';
import type { AuthState } from '@types/auth.types';

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
  const logout = async () => {};

  return {
    user: authState.user,
    loading: authState.loading,
    error: authState.error,
    isAuthenticated: !!authState.user,
    logout,
  };
};
