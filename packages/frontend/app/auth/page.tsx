'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import AuthWrapper from '@/components/auth/AuthWrapper';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AuthPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/chat');
    }
  }, [user, router]);

  return (
    <AuthWrapper>
      <div className="text-center">
        <p>認証に成功しました。チャットページに移動しています...</p>
      </div>
    </AuthWrapper>
  );
}
