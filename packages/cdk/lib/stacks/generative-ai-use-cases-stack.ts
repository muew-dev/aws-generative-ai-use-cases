import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Auth, Api, Database } from '../construct/aws-resources';
import { Web } from '../construct/patterns';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { ProcessedStackInput } from '../utils/stack-input';

export interface GenerativeAiUseCasesStackProps extends StackProps {
  readonly params: ProcessedStackInput;
}

export class GenerativeAiUseCasesStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(
    scope: Construct,
    id: string,
    props: GenerativeAiUseCasesStackProps
  ) {
    super(scope, id, props);

    const params = props.params;

    // Auth (Cognito)
    const auth = new Auth(this, 'Auth', {
      selfSignUpEnabled: params.selfSignUpEnabled,
      allowedIpV4AddressRanges: params.allowedIpV4AddressRanges,
      allowedIpV6AddressRanges: params.allowedIpV6AddressRanges,
      allowedSignUpEmailDomains: params.allowedSignUpEmailDomains,
      samlAuthEnabled: params.samlAuthEnabled,
    });

    // Database (DynamoDB)
    const database = new Database(this, 'Database');

    // API (API Gateway + Lambda)
    const api = new Api(this, 'API', {
      modelRegion: params.modelRegion,
      modelIds: params.modelIds,
      crossAccountBedrockRoleArn: params.crossAccountBedrockRoleArn,
      allowedIpV4AddressRanges: params.allowedIpV4AddressRanges,
      allowedIpV6AddressRanges: params.allowedIpV6AddressRanges,
      userPool: auth.userPool,
      idPool: auth.idPool,
      userPoolClient: auth.client,
      table: database.table,
      statsTable: database.statsTable,
      guardrailIdentify: undefined,
      guardrailVersion: undefined,
    });

    // Web Frontend (CloudFront + S3)
    const web = new Web(this, 'Web', {
      // Auth
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.client.userPoolClientId,
      idPoolId: auth.idPool.identityPoolId,
      selfSignUpEnabled: params.selfSignUpEnabled,
      samlAuthEnabled: params.samlAuthEnabled,
      samlCognitoDomainName: params.samlCognitoDomainName,
      samlCognitoFederatedIdentityProviderName:
        params.samlCognitoFederatedIdentityProviderName,
      // Backend
      apiEndpointUrl: api.api.url,
      predictStreamFunctionArn: api.predictStreamFunction.functionArn,
      ragEnabled: false,
      ragKnowledgeBaseEnabled: false,
      agentEnabled: false,
      flows: [],
      flowStreamFunctionArn: api.predictStreamFunction.functionArn,
      optimizePromptFunctionArn: api.predictStreamFunction.functionArn,
      webAclId: undefined,
      modelRegion: api.modelRegion,
      modelIds: api.modelIds,
      imageGenerationModelIds: [],
      videoGenerationModelIds: [],
      endpointNames: [],
      agentNames: [],
      inlineAgents: false,
      useCaseBuilderEnabled: false,
      speechToSpeechNamespace: '',
      speechToSpeechEventApiEndpoint: '',
      speechToSpeechModelIds: [],
      agentCoreEnabled: false,
      agentCoreGenericRuntime: undefined,
      agentCoreExternalRuntimes: [],
      agentCoreRegion: '',
      // Frontend
      hiddenUseCases: params.hiddenUseCases,
      // Custom Domain (disabled for simplicity)
      cert: undefined,
      hostName: undefined,
      domainName: undefined,
      hostedZoneId: undefined,
      // Closed network (disabled for simplicity)
      webBucket: undefined,
      cognitoUserPoolProxyEndpoint: undefined,
      cognitoIdentityPoolProxyEndpoint: undefined,
    });

    // CloudFormation Outputs
    new CfnOutput(this, 'Region', {
      value: this.region,
    });

    new CfnOutput(this, 'WebUrl', {
      value: web.webUrl,
    });

    new CfnOutput(this, 'PredictStreamFunctionArn', {
      value: api.predictStreamFunction.functionArn,
    });

    new CfnOutput(this, 'SelfSignUpEnabled', {
      value: params.selfSignUpEnabled.toString(),
    });

    new CfnOutput(this, 'ModelRegion', {
      value: api.modelRegion,
    });

    new CfnOutput(this, 'ModelIds', {
      value: JSON.stringify(api.modelIds),
    });

    new CfnOutput(this, 'SamlAuthEnabled', {
      value: params.samlAuthEnabled.toString(),
    });

    // Simplified outputs - removed SpeechToSpeech and AgentCore outputs

    this.userPool = auth.userPool;
    this.userPoolClient = auth.client;

    this.exportValue(this.userPool.userPoolId);
    this.exportValue(this.userPoolClient.userPoolClientId);
  }
}
