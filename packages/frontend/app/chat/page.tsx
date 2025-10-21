'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import AuthWrapper from '@/components/auth/AuthWrapper';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import { useChats } from '@/hooks/useApi';
import { Chat } from '@/lib/types';
import { useState } from 'react';

export default function ChatPage() {
  const { user } = useAuth();
  const { data: chatsData, mutate } = useChats();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const chats =
    chatsData?.chats?.map((chat) => ({
      id: chat.id,
      title: chat.title || '新しいチャット',
      createdAt: new Date(chat.createdAt),
      updatedAt: new Date(chat.updatedAt),
    })) || [];

  return (
    <AuthWrapper>
      <div className="flex h-screen bg-gray-100">
        {/* Sidebar */}
        <div
          className={`${sidebarOpen ? 'w-80' : 'w-0'} overflow-hidden transition-all duration-300`}>
          <ChatSidebar
            chats={chats}
            selectedChat={selectedChat}
            onSelectChat={setSelectedChat}
            onNewChat={() => setSelectedChat(null)}
            onRefresh={() => mutate()}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg p-2 hover:bg-gray-100">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <h1 className="text-xl font-semibold">
                {selectedChat?.title || 'AWS Generative AI Chat'}
              </h1>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">{user?.email}</span>
              <button
                onClick={() => {}}
                className="text-sm text-gray-500 hover:text-gray-700">
                ログアウト
              </button>
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex-1">
            <ChatWindow
              chat={selectedChat}
              onChatCreated={(chat) => {
                setSelectedChat(chat);
                mutate(); // チャットリストを更新
              }}
            />
          </div>
        </div>
      </div>
    </AuthWrapper>
  );
}
