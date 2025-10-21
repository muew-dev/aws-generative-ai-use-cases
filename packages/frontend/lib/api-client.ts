import axios, { AxiosInstance } from 'axios';
import {
  ChatListResponse,
  ChatResponse,
  CreateChatRequest,
  CreateMessageRequest,
  DetailedHealthResponse,
  ErrorResponse,
  HealthResponse,
  MessageResponse,
  StreamRequestModel,
} from './types';

class APIClient {
  private client: AxiosInstance;

  constructor(baseURL?: string) {
    this.client = axios.create({
      baseURL:
        baseURL ||
        process.env.NEXT_PUBLIC_API_ENDPOINT ||
        'http://localhost:8000',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      // CloudFrontのCognito認証ヘッダーを自動で送信
      withCredentials: true,
    });

    // Request interceptor for development mode
    this.client.interceptors.request.use(async (config) => {
      // ローカル開発環境では認証をスキップ
      if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
        config.headers['X-Dev-Mode'] = 'true';
        config.headers['X-Dev-User-Id'] =
          process.env.NEXT_PUBLIC_DEV_USER_ID || 'dev-user-123';
      }

      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.data) {
          const errorData = error.response.data as ErrorResponse;
          console.error('API Error:', errorData);
        }
        return Promise.reject(error);
      }
    );
  }

  // Health check endpoints
  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health');
    return response.data;
  }

  async detailedHealthCheck(): Promise<DetailedHealthResponse> {
    const response =
      await this.client.get<DetailedHealthResponse>('/health/detailed');
    return response.data;
  }

  // Chat endpoints
  async createChat(request: CreateChatRequest = {}): Promise<ChatResponse> {
    const response = await this.client.post<ChatResponse>('/v1/chats', request);
    return response.data;
  }

  async listChats(offset?: number, limit?: number): Promise<ChatListResponse> {
    const params = new URLSearchParams();
    if (offset !== undefined) params.append('offset', offset.toString());
    if (limit !== undefined) params.append('limit', limit.toString());

    const response = await this.client.get<ChatListResponse>(
      `/v1/chats?${params}`
    );
    return response.data;
  }

  // Message endpoints
  async createMessage(
    chatId: string,
    request: CreateMessageRequest
  ): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>(
      `/v1/chats/${chatId}/messages`,
      request
    );
    return response.data;
  }

  // Streaming endpoint
  async streamMessage(request: StreamRequestModel): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.getAuthHeaders()),
    };

    const response = await fetch(
      `${this.client.defaults.baseURL}/api/predict-stream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        credentials: 'include', // CloudFrontのCognito認証クッキーを送信
      }
    );

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.statusText}`);
    }

    return response;
  }

  // Get streaming response for GET method
  async streamMessageGet(params: URLSearchParams): Promise<Response> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(
      `${this.client.defaults.baseURL}/api/predict-stream?${params}`,
      {
        method: 'GET',
        headers,
        credentials: 'include', // CloudFrontのCognito認証クッキーを送信
      }
    );

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.statusText}`);
    }

    return response;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    // ローカル開発環境では開発用ヘッダーを設定
    if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
      headers['X-Dev-Mode'] = 'true';
      headers['X-Dev-User-Id'] =
        process.env.NEXT_PUBLIC_DEV_USER_ID || 'dev-user-123';
    }

    return headers;
  }
}

// Singleton instance
export const apiClient = new APIClient();

export default APIClient;
