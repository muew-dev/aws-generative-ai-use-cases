'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot } from 'lucide-react';
import { Chat, Message } from '@/lib/types';
import {
  useChatActions,
  transformChatResponse,
  createStreamingMessage,
} from '@/hooks/useApi';
import MessageItem from './MessageItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ChatWindowProps {
  chat: Chat | null;
  onChatCreated: (chat: Chat) => void;
}

export default function ChatWindow({ chat, onChatCreated }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { createChat, createMessage, streamMessage } = useChatActions();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (chat) {
      // TODO: Load messages for selected chat
      setMessages([]);
    } else {
      setMessages([]);
    }
  }, [chat]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessageContent = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    try {
      let currentChat = chat;

      // 新しいチャットの場合は作成
      if (!currentChat) {
        const chatResponse = await createChat({
          title:
            userMessageContent.slice(0, 50) +
            (userMessageContent.length > 50 ? '...' : ''),
        });
        currentChat = transformChatResponse(chatResponse);
        onChatCreated(currentChat);
      }

      // ユーザーメッセージを追加
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessageContent,
        timestamp: new Date(),
        chatId: currentChat.id,
      };

      setMessages((prev) => [...prev, userMessage]);

      // ストリーミングレスポンス用の空のアシスタントメッセージを作成
      const streamingMessage = createStreamingMessage(currentChat.id);
      setMessages((prev) => [...prev, streamingMessage]);

      // ストリーミングAPIを呼び出し
      const streamRequest = {
        messages: [
          {
            role: 'user',
            content: userMessageContent,
          },
        ],
        saveToHistory: true,
        chatId: currentChat.id,
      };

      let assistantContent = '';

      try {
        for await (const chunk of streamMessage(streamRequest)) {
          if (typeof chunk === 'string') {
            assistantContent += chunk;
          } else if (chunk?.content) {
            assistantContent += chunk.content;
          }

          // ストリーミング中のメッセージを更新
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMessage.id
                ? { ...msg, content: assistantContent }
                : msg
            )
          );
        }
      } catch (streamError) {
        console.error('Streaming error:', streamError);

        // ストリーミングに失敗した場合は通常のメッセージAPI を使用
        const messageResponse = await createMessage(currentChat.id, {
          role: 'user',
          content: [
            {
              contentType: 'text',
              body: userMessageContent,
            },
          ],
        });

        assistantContent = messageResponse.content.map((c) => c.body).join('');
      }

      // 最終的なアシスタントメッセージに更新
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === streamingMessage.id
            ? {
                ...msg,
                content: assistantContent,
                loading: false,
                id: `assistant-${Date.now()}`,
              }
            : msg
        )
      );
    } catch (error) {
      console.error('Error sending message:', error);

      // エラーメッセージを表示
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'エラーが発生しました。もう一度お試しください。',
        timestamp: new Date(),
        chatId: chat?.id || 'unknown',
      };

      setMessages((prev) => {
        // ローディング中のメッセージを削除
        const filtered = prev.filter((msg) => !msg.loading);
        return [...filtered, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!chat && messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-white">
        <div className="max-w-md text-center">
          <Bot className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h3 className="mb-2 text-xl font-semibold text-gray-900">
            新しいチャットを開始
          </h3>
          <p className="mb-8 text-gray-600">
            下のメッセージ入力欄に質問を入力してください
          </p>
        </div>

        <div className="w-full max-w-4xl px-4">
          <div className="flex space-x-4">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="メッセージを入力..."
              rows={3}
              className="flex-1 resize-none rounded-lg border border-gray-300 p-3 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="flex items-center rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {isLoading ? (
                <LoadingSpinner size="sm" text="" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex space-x-4">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力..."
            rows={3}
            className="flex-1 resize-none rounded-lg border border-gray-300 p-3 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="flex items-center rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isLoading ? (
              <LoadingSpinner size="sm" text="" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
