'use client';

import { MessageSquare, Plus, RefreshCw } from 'lucide-react';
import { Chat } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ChatSidebarProps {
  chats: Chat[];
  selectedChat: Chat | null;
  onSelectChat: (chat: Chat) => void;
  onNewChat: () => void;
  onRefresh: () => void;
}

export default function ChatSidebar({
  chats,
  selectedChat,
  onSelectChat,
  onNewChat,
  onRefresh,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">チャット</h2>
          <button
            onClick={onRefresh}
            className="rounded-lg p-2 hover:bg-gray-100">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={onNewChat}
          className="flex w-full items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          <span>新しいチャット</span>
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageSquare className="mx-auto mb-2 h-12 w-12 opacity-30" />
            <p>チャットがありません</p>
            <p className="text-sm">新しいチャットを開始してください</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={`w-full rounded-lg p-3 text-left transition-colors ${
                  selectedChat?.id === chat.id
                    ? 'border border-blue-200 bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}>
                <div className="flex items-start space-x-3">
                  <MessageSquare className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {chat.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDistanceToNow(chat.updatedAt, {
                        addSuffix: true,
                        locale: ja,
                      })}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
