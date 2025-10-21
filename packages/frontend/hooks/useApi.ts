import { useCallback } from 'react';
import useSWR, { SWRConfiguration } from 'swr';
import { apiClient } from '@/lib/api-client';
import {
  CreateChatRequest,
  CreateMessageRequest,
  StreamRequestModel,
  ChatResponse,
  ChatListResponse,
  MessageResponse,
  Chat,
  Message,
} from '@/lib/types';

export function useHealthCheck() {
  return useSWR('health', () => apiClient.healthCheck(), {
    refreshInterval: 30000, // 30秒ごとに更新
    revalidateIfStale: true,
  });
}

export function useChats(config?: SWRConfiguration) {
  return useSWR('chats', () => apiClient.listChats(), {
    revalidateIfStale: false,
    ...config,
  });
}

export function useChatActions() {
  const createChat = useCallback(async (request: CreateChatRequest = {}) => {
    return await apiClient.createChat(request);
  }, []);

  const createMessage = useCallback(
    async (chatId: string, request: CreateMessageRequest) => {
      return await apiClient.createMessage(chatId, request);
    },
    []
  );

  const streamMessage = useCallback(async function* (
    request: StreamRequestModel
  ) {
    const response = await apiClient.streamMessage(request);

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() === '') continue;

          // Server-Sent Events format: data: {...}
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix
            try {
              const parsed = JSON.parse(data);
              yield parsed;
            } catch (error) {
              // テキストデータの場合はそのまま返す
              yield data;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  return {
    createChat,
    createMessage,
    streamMessage,
  };
}

// チャットデータを変換するユーティリティ
export function transformChatResponse(response: ChatResponse): Chat {
  return {
    id: response.id,
    title: response.title || '新しいチャット',
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  };
}

export function transformMessageResponse(response: MessageResponse): Message {
  return {
    id: response.id,
    role: response.role as 'user' | 'assistant' | 'system',
    content: response.content.map((c) => c.body).join(''),
    timestamp: new Date(response.createdAt),
    chatId: response.chatId,
  };
}

// ストリーミング用のメッセージ変換
export function createStreamingMessage(
  chatId: string,
  role: 'user' | 'assistant' = 'assistant',
  initialContent: string = ''
): Message {
  return {
    id: `streaming-${Date.now()}`,
    role,
    content: initialContent,
    timestamp: new Date(),
    chatId,
    loading: true,
  };
}
