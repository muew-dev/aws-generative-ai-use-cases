import * as cdk from 'aws-cdk-lib';
import {
  StackInput,
  stackInputSchema,
  ProcessedStackInput,
} from './lib/stack-input';
import { ModelConfiguration } from 'generative-ai-use-cases';

// Get parameters from CDK Context
const getContext = (app: cdk.App): StackInput => {
  const params = stackInputSchema.parse(app.node.getAllContext());
  return params;
};

// If you want to define parameters directly
const envs: Record<string, Partial<StackInput>> = {
  // If you want to define an anonymous environment, uncomment the following and the content of cdk.json will be ignored.
  '': {
    // Default environment parameters (overrides cdk.json)
    ragEnabled: false,
    kendraIndexLanguage: 'ja',
    kendraIndexScheduleEnabled: false,
    ragKnowledgeBaseEnabled: true,
    ragKnowledgeBaseStandbyReplicas: false,
    ragKnowledgeBaseAdvancedParsing: false,
    ragKnowledgeBaseAdvancedParsingModelId:
      'anthropic.claude-3-sonnet-20240229-v1:0',
    ragKnowledgeBaseBinaryVector: false,
    embeddingModelId: 'amazon.titan-embed-text-v2:0',
    queryDecompositionEnabled: false,
    selfSignUpEnabled: true,
    samlAuthEnabled: false,
    samlCognitoDomainName: '',
    samlCognitoFederatedIdentityProviderName: '',
    hiddenUseCases: {},
    modelRegion: 'ap-northeast-1',
    modelIds: [
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'anthropic.claude-3-sonnet-20240229-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
    ],
    imageGenerationModelIds: ['amazon.titan-image-generator-v1'],
    videoGenerationModelIds: [],
    speechToSpeechModelIds: [],
    endpointNames: [],
    agentEnabled: true,
    searchAgentEnabled: false,
    searchEngine: 'Brave',
    searchApiKey: '',
    agents: [],
    inlineAgents: false,
    flows: [],
    createGenericAgentCoreRuntime: false,
    agentCoreExternalRuntimes: [],
    dashboard: false,
    anonymousUsageTracking: true,
    guardrailEnabled: false,
    crossAccountBedrockRoleArn: '',
    useCaseBuilderEnabled: true,
    closedNetworkMode: false,
    closedNetworkVpcIpv4Cidr: '10.0.0.0/16',
    closedNetworkCreateTestEnvironment: true,
    closedNetworkCreateResolverEndpoint: true,
  },
  dev: {
    // Development environment - inherits from default above
    agentEnabled: true,
    guardrailEnabled: false,
    dashboard: false,
  },
  staging: {
    // Staging environment
    agentEnabled: true,
    guardrailEnabled: false,
    dashboard: true,
    anonymousUsageTracking: false,
  },
  prod: {
    // Production environment
    agentEnabled: true,
    guardrailEnabled: true,
    dashboard: true,
    anonymousUsageTracking: false,
  },
  // If you need other environments, customize them as needed
};

// For backward compatibility, get parameters from CDK Context > parameter.ts
export const getParams = (app: cdk.App): ProcessedStackInput => {
  // By default, get parameters from CDK Context
  let params = getContext(app);

  // If the env matches the ones defined in envs, use the parameters in envs instead of the ones in context
  if (envs[params.env]) {
    params = stackInputSchema.parse({
      ...envs[params.env],
      env: params.env,
    });
  }
  // Make the format of modelIds, imageGenerationModelIds consistent
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
    // Process agentCoreRegion: null -> modelRegion
    agentCoreRegion: params.agentCoreRegion || params.modelRegion,
  };
};
