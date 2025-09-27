import * as cdk from 'aws-cdk-lib';
import {
  StackInput,
  stackInputSchema,
  ProcessedStackInput,
} from './lib/stack-input';
import { ModelConfiguration } from '../types/src/model.d';

// CDK Contextからパラメータを取得
const getContext = (app: cdk.App): StackInput => {
  const params = stackInputSchema.parse(app.node.getAllContext());
  return params;
};

// パラメータを直接定義したい場合
const envs: Record<string, Partial<StackInput>> = {
  // 匿名環境を定義したい場合は、以下のコメントアウトを外してください。cdk.jsonの内容は無視されます。
  // parameter.tsで匿名環境を定義したい場合は、以下のコメントアウトを外してください。cdk.jsonの内容は無視されます。
  // '': {
  //   // 匿名環境用のパラメータ
  //   // デフォルト設定を上書きしたい場合は、以下を追加してください
  // },
  dev: {
    // 開発環境用のパラメータ
  },
  staging: {
    // ステージング環境用のパラメータ
  },
  prod: {
    // 本番環境用のパラメータ
  },
  // 他の環境が必要な場合は、必要に応じてカスタマイズしてください
};

// 後方互換性のため、CDK Context > parameter.tsからパラメータを取得
export const getParams = (app: cdk.App): ProcessedStackInput => {
  // デフォルトでは、CDK Contextからパラメータを取得
  let params = getContext(app);

  // envがenvsで定義されているものと一致する場合、contextではなくenvsのパラメータを使用
  if (envs[params.env]) {
    params = stackInputSchema.parse({
      ...envs[params.env],
      env: params.env,
    });
  }
  // modelIds、imageGenerationModelIdsの形式を統一
  const convertToModelConfiguration = (
    models: (string | ModelConfiguration)[],
    defaultRegion: string
  ): ModelConfiguration[] => {
    return models.map((model) =>
      typeof model === 'string'
        ? { modelId: model, region: defaultRegion }
        : model
    );
  };

  return {
    ...params,
    modelIds: convertToModelConfiguration(params.modelIds, params.modelRegion),
    imageGenerationModelIds: convertToModelConfiguration(
      params.imageGenerationModelIds,
      params.modelRegion
    ),
    videoGenerationModelIds: convertToModelConfiguration(
      params.videoGenerationModelIds,
      params.modelRegion
    ),
    speechToSpeechModelIds: convertToModelConfiguration(
      params.speechToSpeechModelIds,
      params.modelRegion
    ),
    endpointNames: convertToModelConfiguration(
      params.endpointNames,
      params.modelRegion
    ),
    // agentCoreRegionを処理: null -> modelRegion
    agentCoreRegion: params.agentCoreRegion || params.modelRegion,
  };
};
