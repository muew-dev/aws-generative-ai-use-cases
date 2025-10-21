'use client';

import React from 'react';
import { useAuth } from './AuthProvider';
import { login } from '@/lib/auth';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface AuthWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function AuthWrapper({ children, fallback }: AuthWrapperProps) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback || <LoginPrompt />;
  }

  return <>{children}</>;
}

function LoginPrompt() {
  const handleLogin = () => {
    login();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">
            ログインが必要です
          </h1>
          <p className="mb-6 text-gray-600">
            チャット機能を利用するには、ログインしてください。
          </p>
          <button
            onClick={handleLogin}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700">
            ログイン
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthWrapper;
