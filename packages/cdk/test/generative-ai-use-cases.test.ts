import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { GenerativeAiUseCasesStack } from '../lib/stacks/generative-ai-use-cases-stack';
import { getParams } from '../parameter';

describe('GenerativeAiUseCases - Chat Only', () => {
  test('Stack should be created for chat functionality', () => {
    const app = new cdk.App({
      context: {
        account: '123456890123',
        region: 'us-east-1',
        env: '',
        modelRegion: 'us-east-1',
        modelIds: ['anthropic.claude-3-5-sonnet-20241022-v2:0'],
        selfSignUpEnabled: true,
        samlAuthEnabled: false,
        hiddenUseCases: {
          generate: true,
          summarize: true,
          writer: true,
          translate: true,
          meetingMinutes: true,
          image: true,
          video: true,
          webContent: true,
          diagram: true,
          videoAnalyzer: true,
          voiceChat: true,
        },
      },
    });

    const params = getParams(app);
    const stack = new GenerativeAiUseCasesStack(
      app,
      'GenerativeAiUseCasesStack',
      {
        params: params,
      }
    );

    expect(stack).toBeDefined();

    const template = Template.fromStack(stack);

    // Check that basic resources are created
    template.hasResourceProperties('AWS::Cognito::UserPool', {});
    template.hasResourceProperties('AWS::DynamoDB::Table', {});
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {});
    template.hasResourceProperties('AWS::Lambda::Function', {});
    template.hasResourceProperties('AWS::S3::Bucket', {});
    template.hasResourceProperties('AWS::CloudFront::Distribution', {});
  });

  test('Snapshot test for chat-only configuration', () => {
    const app = new cdk.App({
      context: {
        account: '123456890123',
        region: 'us-east-1',
        env: 'test',
        modelRegion: 'us-east-1',
        modelIds: ['anthropic.claude-3-5-sonnet-20241022-v2:0'],
        selfSignUpEnabled: true,
        samlAuthEnabled: false,
        hiddenUseCases: {
          generate: true,
          summarize: true,
          writer: true,
          translate: true,
          meetingMinutes: true,
          image: true,
          video: true,
          webContent: true,
          diagram: true,
          videoAnalyzer: true,
          voiceChat: true,
        },
      },
    });

    const params = getParams(app);
    const stack = new GenerativeAiUseCasesStack(
      app,
      'GenerativeAiUseCasesStack',
      {
        params: params,
      }
    );

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
