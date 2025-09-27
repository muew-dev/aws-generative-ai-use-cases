import {
  ContentBlock,
  Message,
  SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import {
  CRI_PREFIX_PATTERN,
  SUPPORTED_CACHE_FIELDS,
} from '../../../common/src/index';

const CACHE_POINT = {
  cachePoint: { type: 'default' },
} as ContentBlock.CachePointMember;

const SYSTEM_CACHE_POINT = {
  cachePoint: { type: 'default' },
} as SystemContentBlock.CachePointMember;

const getSupportedCacheFields = (modelId: string) => {
  // CRIプレフィックスを削除
  const baseModelId = modelId.replace(CRI_PREFIX_PATTERN, '');
  return SUPPORTED_CACHE_FIELDS[baseModelId] || [];
};

export const applyAutoCacheToMessages = (
  messages: Message[],
  modelId: string
) => {
  const cacheFields = getSupportedCacheFields(modelId);
  if (!cacheFields.includes('messages') || messages.length === 0) {
    return messages;
  }

  // 最後の2つのユーザーメッセージにcachePointを挿入（それぞれキャッシュ読み取りと書き込み用）
  const isToolsSupported = cacheFields.includes('tools');
  const cachableIndices = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'user')
    .filter(
      ({ message }) =>
        isToolsSupported ||
        // Amazon Novaでは、toolResultの後にcachePointを配置することはサポートされていない
        !message.content?.some((block) => block.toolResult)
    )
    .slice(-2)
    .map(({ index }) => index);

  return messages.map((message, index) => {
    if (
      !cachableIndices.includes(index) ||
      message.content?.at(-1)?.cachePoint // 既に挿入済み
    ) {
      return message;
    }
    return {
      ...message,
      content: [...(message.content || []), CACHE_POINT],
    };
  });
};

export const applyAutoCacheToSystem = (
  system: SystemContentBlock[],
  modelId: string
) => {
  const cacheFields = getSupportedCacheFields(modelId);
  if (
    !cacheFields.includes('system') ||
    system.length === 0 ||
    system.at(-1)?.cachePoint // 既に挿入済み
  ) {
    return system;
  }
  return [...system, SYSTEM_CACHE_POINT];
};
