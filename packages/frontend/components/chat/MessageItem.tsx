'use client';

import { Bot, User, Copy, Check } from 'lucide-react';
import { Message } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface MessageItemProps {
  message: Message;
}

export default function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} space-x-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 ${isUser ? 'ml-3' : 'mr-3'}`}>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isUser ? 'bg-blue-500' : 'bg-gray-500'
            }`}>
            {isUser ? (
              <User className="h-4 w-4 text-white" />
            ) : (
              <Bot className="h-4 w-4 text-white" />
            )}
          </div>
        </div>

        {/* Message Content */}
        <div className={`flex-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {/* Message Bubble */}
          <div
            className={`inline-block rounded-lg p-3 ${
              isUser
                ? 'bg-blue-600 text-white'
                : 'border bg-gray-100 text-gray-900'
            }`}>
            {message.loading ? (
              <div className="flex items-center space-x-2">
                <LoadingSpinner size="sm" text="" />
                <span className="text-sm">入力中...</span>
              </div>
            ) : isAssistant ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{message.content}</div>
            )}
          </div>

          {/* Actions and Timestamp */}
          <div
            className={`mt-1 flex items-center space-x-2 ${
              isUser ? 'justify-end' : 'justify-start'
            }`}>
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(message.timestamp, {
                addSuffix: true,
                locale: ja,
              })}
            </span>

            {/* Copy button for assistant messages */}
            {isAssistant && !message.loading && (
              <button
                onClick={handleCopy}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
                title="コピー">
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
