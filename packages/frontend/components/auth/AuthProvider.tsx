'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { checkCognitoAuth, logout, type AuthState } from '@/lib/auth';

interface AuthContextType extends AuthState {
  signOut: () => void;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  });

  const fetchAuthState = async () => {
    setAuthState((prev) => ({ ...prev, loading: true }));
    const newAuthState = await checkCognitoAuth();
    setAuthState(newAuthState);
  };

  const handleSignOut = () => {
    setAuthState({
      isAuthenticated: false,
      user: null,
      loading: false,
    });
    logout();
  };

  useEffect(() => {
    fetchAuthState();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        signOut: handleSignOut,
        refetch: fetchAuthState,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
