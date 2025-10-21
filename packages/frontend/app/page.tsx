'use client';

import { MessageSquare, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-16 text-center">
          <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-6xl">
            AWS Generative AI
            <span className="text-blue-600"> Use Cases</span>
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            Pythonバックエンドを使用したチャット機能のプロトタイプ
          </p>
        </div>

        <div className="mb-16 grid gap-8 md:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow-lg">
            <MessageSquare className="mb-4 h-12 w-12 text-blue-500" />
            <h3 className="mb-2 text-xl font-semibold">チャット機能</h3>
            <p className="text-gray-600">
              AWS Bedrockと連携したリアルタイムチャット
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-lg">
            <Shield className="mb-4 h-12 w-12 text-green-500" />
            <h3 className="mb-2 text-xl font-semibold">セキュア認証</h3>
            <p className="text-gray-600">AWS Cognitoによる安全な認証システム</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-lg">
            <Zap className="mb-4 h-12 w-12 text-yellow-500" />
            <h3 className="mb-2 text-xl font-semibold">ストリーミング</h3>
            <p className="text-gray-600">
              Server-Sent Eventsによる高速レスポンス
            </p>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/auth"
            className="inline-block rounded-lg bg-blue-600 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-700">
            チャットを開始
          </Link>
        </div>
      </div>
    </div>
  );
}
