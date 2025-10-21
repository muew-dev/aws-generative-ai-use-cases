// API Types based on OpenAPI specification
// Note: All endpoints now require Cognito Bearer authentication

export interface MessageContentModel {
  contentType: string;
  body: string;
  mediaType?: string;
}

export interface ModelConfigModel {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface CreateChatRequest {
  title?: string;
}

export interface CreateMessageRequest {
  role: string;
  content: MessageContentModel[];
  systemPrompt?: string;
  model?: ModelConfigModel;
}

export interface StreamRequestModel {
  messages: Record<string, unknown>[];
  systemPrompt?: string;
  model?: ModelConfigModel;
  saveToHistory?: boolean;
  chatId?: string;
}

export interface ChatResponse {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface ChatListResponse {
  chats: ChatResponse[];
  total: number;
  offset: number;
  limit: number;
}

export interface MessageResponse {
  id: string;
  role: string;
  content: MessageContentModel[];
  createdAt: string;
  chatId: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

export interface DetailedHealthResponse extends HealthResponse {
  services: Record<string, string>;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export interface ErrorResponse {
  success?: boolean;
  error: ErrorDetail;
  timestamp: string;
  request_id?: string;
}

// UI Types
export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  chatId: string;
  loading?: boolean;
}
