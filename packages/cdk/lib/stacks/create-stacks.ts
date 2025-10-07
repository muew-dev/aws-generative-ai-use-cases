import * as cdk from 'aws-cdk-lib';
import { GenerativeAiUseCasesStack } from './generative-ai-use-cases-stack';
import { ProcessedStackInput } from '../utils/stack-input';

export const createStacks = (app: cdk.App, params: ProcessedStackInput) => {
  // Main stack for chat functionality only
  const generativeAiUseCasesStack = new GenerativeAiUseCasesStack(
    app,
    'GenerativeAiUseCasesStack',
    {
      env: {
        account: params.account || process.env.CDK_DEFAULT_ACCOUNT,
        region: params.region || process.env.CDK_DEFAULT_REGION,
      },
      description: params.anonymousUsageTracking
        ? 'Generative AI Use Cases - Chat Only (uksb-1tupboc48)'
        : undefined,
      params: params,
      crossRegionReferences: true,
    }
  );

  // Set deletion policy for development environment
  // Note: deletionPolicy removed from simplified configuration

  return {
    generativeAiUseCasesStack,
  };
};
