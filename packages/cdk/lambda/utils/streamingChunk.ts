import { StreamingChunk } from '../../../types/src/index';

// JSONL形式
export const streamingChunk = (chunk: StreamingChunk): string => {
  return JSON.stringify(chunk) + '\n';
};
