import { z } from 'zod';

// Simplified schema for chat functionality only
const baseStackInputSchema = z.object({
  // Basic settings
  account: z.string().default(process.env.CDK_DEFAULT_ACCOUNT ?? ''),
  region: z.string().default(process.env.CDK_DEFAULT_REGION ?? 'us-east-1'),
  env: z.string().default(''),
  anonymousUsageTracking: z.boolean().default(true),

  // Authentication
  selfSignUpEnabled: z.boolean().default(true),
  allowedSignUpEmailDomains: z.array(z.string()).nullish(),
  allowedIpV4AddressRanges: z.array(z.string()).nullish(),
  allowedIpV6AddressRanges: z.array(z.string()).nullish(),
  samlAuthEnabled: z.boolean().default(false),
  samlCognitoDomainName: z.string().nullish(),
  samlCognitoFederatedIdentityProviderName: z.string().nullish(),

  // Frontend
  hiddenUseCases: z
    .object({
      generate: z.boolean().optional(),
      summarize: z.boolean().optional(),
      writer: z.boolean().optional(),
      translate: z.boolean().optional(),
      webContent: z.boolean().optional(),
      image: z.boolean().optional(),
      video: z.boolean().optional(),
      videoAnalyzer: z.boolean().optional(),
      diagram: z.boolean().optional(),
      meetingMinutes: z.boolean().optional(),
      voiceChat: z.boolean().optional(),
    })
    .default({}),

  // AI Model Configuration
  modelRegion: z.string().default('us-east-1'),
  modelIds: z
    .array(
      z.union([
        z.string(),
        z.object({
          modelId: z.string(),
          region: z.string(),
        }),
      ])
    )
    .default(['anthropic.claude-3-5-sonnet-20241022-v2:0']),
  crossAccountBedrockRoleArn: z.string().default(''),

  // Custom Domain (optional)
  hostName: z.string().nullish(),
  domainName: z.string().nullish(),
  hostedZoneId: z.string().nullish(),

  // Tagging
  tagValue: z.string().nullish(),
});

// Validation with conditional logic
export const stackInputSchema = baseStackInputSchema.refine(
  (data) => {
    // SAML configuration validation
    if (data.samlAuthEnabled) {
      return (
        data.samlCognitoDomainName != null &&
        data.samlCognitoFederatedIdentityProviderName != null
      );
    }

    // Custom domain validation
    if (data.hostName || data.domainName || data.hostedZoneId) {
      return (
        data.hostName != null &&
        data.domainName != null &&
        data.hostedZoneId != null
      );
    }

    return true;
  },
  {
    message: 'Invalid configuration for SAML or Custom Domain settings',
  }
);

export type StackInput = z.infer<typeof baseStackInputSchema>;
export type ProcessedStackInput = z.infer<typeof stackInputSchema> & {
  modelIds: { modelId: string; region: string }[];
};
