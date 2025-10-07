import * as cdk from 'aws-cdk-lib';
import {
  StackInput,
  stackInputSchema,
  ProcessedStackInput,
} from './lib/utils/stack-input';
import { ModelConfiguration } from 'generative-ai-use-cases';

// Get parameters from CDK Context
const getContext = (app: cdk.App): StackInput => {
  const params = stackInputSchema.parse(app.node.getAllContext());
  return params;
};

// Simplified environment configurations for chat functionality
const envs: Record<string, Partial<StackInput>> = {
  // Default environment - chat only
  '': {
    selfSignUpEnabled: true,
    samlAuthEnabled: false,
    modelRegion: 'us-east-1',
    modelIds: ['anthropic.claude-3-5-sonnet-20241022-v2:0'],
    anonymousUsageTracking: true,
    hiddenUseCases: {
      // Hide all non-chat features
      generate: true,
      summarize: true,
      writer: true,
      translate: true,
      webContent: true,
      image: true,
      video: true,
      videoAnalyzer: true,
      diagram: true,
      meetingMinutes: true,
      voiceChat: true,
    },
  },
  dev: {
    // Development environment - same as default
    anonymousUsageTracking: false,
  },
  staging: {
    // Staging environment
    anonymousUsageTracking: false,
  },
  prod: {
    // Production environment
    anonymousUsageTracking: false,
    selfSignUpEnabled: false, // Disable self signup in production
  },
};

// Simplified parameter processing
export const getParams = (app: cdk.App): ProcessedStackInput => {
  // Get parameters from CDK Context
  let params = getContext(app);

  // Override with environment-specific settings
  if (envs[params.env]) {
    params = stackInputSchema.parse({
      ...envs[params.env],
      env: params.env,
    });
  }

  // Convert model IDs to ModelConfiguration format
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
  };
};
