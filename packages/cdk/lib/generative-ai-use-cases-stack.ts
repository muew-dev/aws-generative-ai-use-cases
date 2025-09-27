import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Api, Database } from './construct';
// import { Auth, Web, CommonWebAcl } from './construct'; // LocalStackでは使用しない
// import { CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2'; // LocalStackでは使用しない
// import * as cognito from 'aws-cdk-lib/aws-cognito'; // LocalStackでは使用しない
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ProcessedStackInput } from './stack-input';
import {
  InterfaceVpcEndpoint,
  IVpc,
  ISecurityGroup,
  SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export interface GenerativeAiUseCasesStackProps extends StackProps {
  readonly params: ProcessedStackInput;
  // WAF
  readonly webAclId?: string;
  // カスタムドメイン
  readonly cert?: ICertificate;
  // イメージビルド環境
  readonly isSageMakerStudio: boolean;
  // クローズドネットワーク
  readonly vpc?: IVpc;
  readonly apiGatewayVpcEndpoint?: InterfaceVpcEndpoint;
  readonly webBucket?: Bucket;
  readonly cognitoUserPoolProxyEndpoint?: string;
  readonly cognitoIdentityPoolProxyEndpoint?: string;
}

export class GenerativeAiUseCasesStack extends Stack {
  // LocalStackでは認証プロパティを無効化
  // public readonly userPool: cognito.UserPool;
  // public readonly userPoolClient: cognito.UserPoolClient;

  constructor(
    scope: Construct,
    id: string,
    props: GenerativeAiUseCasesStackProps
  ) {
    super(scope, id, props);
    process.env.overrideWarningsEnabled = 'false';

    const params = props.params;

    // クローズドネットワークモードでENI保存用の共通セキュリティグループ
    let securityGroups: ISecurityGroup[] | undefined = undefined;
    if (props.vpc) {
      securityGroups = [
        new SecurityGroup(this, 'LambdaSeurityGroup', {
          vpc: props.vpc,
          description: 'GenU Lambda Security Group',
          allowAllOutbound: true,
        }),
      ];
    }

    // LocalStackでは認証機能を無効化
    // const auth = new Auth(this, 'Auth', {
    //   selfSignUpEnabled: params.selfSignUpEnabled,
    //   allowedIpV4AddressRanges: params.allowedIpV4AddressRanges,
    //   allowedIpV6AddressRanges: params.allowedIpV6AddressRanges,
    //   allowedSignUpEmailDomains: params.allowedSignUpEmailDomains,
    //   samlAuthEnabled: params.samlAuthEnabled,
    // });

    // データベース
    const database = new Database(this, 'Database');

    // API
    const api = new Api(this, 'API', {
      modelRegion: params.modelRegion,
      modelIds: params.modelIds,
      imageGenerationModelIds: params.imageGenerationModelIds,
      videoGenerationModelIds: params.videoGenerationModelIds,
      videoBucketRegionMap: {},
      endpointNames: params.endpointNames,
      crossAccountBedrockRoleArn: params.crossAccountBedrockRoleArn,
      queryDecompositionEnabled: params.queryDecompositionEnabled,
      customAgents: [],
      allowedIpV4AddressRanges: params.allowedIpV4AddressRanges,
      allowedIpV6AddressRanges: params.allowedIpV6AddressRanges,
      userPool: undefined, // LocalStackでは認証を無効化
      idPool: undefined, // LocalStackでは認証を無効化
      userPoolClient: undefined, // LocalStackでは認証を無効化
      table: database.table,
      statsTable: database.statsTable,
      vpc: props.vpc,
      securityGroups,
      apiGatewayVpcEndpoint: props.apiGatewayVpcEndpoint,
      cognitoUserPoolProxyEndpoint: props.cognitoUserPoolProxyEndpoint,
    });

    // WAF
    // LocalStackではWAF機能を無効化
    // if (
    //   params.allowedIpV4AddressRanges ||
    //   params.allowedIpV6AddressRanges ||
    //   params.allowedCountryCodes
    // ) {
    //   const regionalWaf = new CommonWebAcl(this, 'RegionalWaf', {
    //     scope: 'REGIONAL',
    //     allowedIpV4AddressRanges: params.allowedIpV4AddressRanges,
    //     allowedIpV6AddressRanges: params.allowedIpV6AddressRanges,
    //     allowedCountryCodes: params.allowedCountryCodes,
    //   });
    //   new CfnWebACLAssociation(this, 'ApiWafAssociation', {
    //     resourceArn: api.api.deploymentStage.stageArn,
    //     webAclArn: regionalWaf.webAclArn,
    //   });
    //   new CfnWebACLAssociation(this, 'UserPoolWafAssociation', {
    //     resourceArn: auth.userPool.userPoolArn,
    //     webAclArn: regionalWaf.webAclArn,
    //   });
    // }

    // LocalStackではWebフロントエンドを無効化
    // const web = new Web(this, 'Api', {
    //   // 認証
    //   userPoolId: auth.userPool.userPoolId,
    //   userPoolClientId: auth.client.userPoolClientId,
    //   idPoolId: auth.idPool.identityPoolId,
    //   selfSignUpEnabled: params.selfSignUpEnabled,
    //   samlAuthEnabled: params.samlAuthEnabled,
    //   samlCognitoDomainName: params.samlCognitoDomainName,
    //   samlCognitoFederatedIdentityProviderName:
    //     params.samlCognitoFederatedIdentityProviderName,
    //   // バックエンド
    //   apiEndpointUrl: api.api.url,
    //   predictStreamFunctionArn: api.predictStreamFunction.functionArn,
    //   flowStreamFunctionArn: '',
    //   optimizePromptFunctionArn: api.optimizePromptFunction.functionArn,
    //   webAclId: props.webAclId,
    //   modelRegion: api.modelRegion,
    //   modelIds: api.modelIds,
    //   imageGenerationModelIds: params.imageGenerationModelIds,
    //   videoGenerationModelIds: params.videoGenerationModelIds,
    //   endpointNames: api.endpointNames,
    //   // LocalStack用のダミー値
    //   ragEnabled: params.ragEnabled,
    //   ragKnowledgeBaseEnabled: params.ragKnowledgeBaseEnabled,
    //   agentEnabled: params.agentEnabled,
    //   agentNames: [],
    //   inlineAgents: params.inlineAgents,
    //   speechToSpeechNamespace: '',
    //   speechToSpeechEventApiEndpoint: '',
    //   speechToSpeechModelIds: params.speechToSpeechModelIds,
    //   mcpEnabled: params.mcpEnabled,
    //   mcpEndpoint: null,
    //   useCaseBuilderEnabled: params.useCaseBuilderEnabled,
    //   // フロントエンド
    //   hiddenUseCases: params.hiddenUseCases,
    //   // カスタムドメイン
    //   cert: props.cert,
    //   hostName: params.hostName,
    //   domainName: params.domainName,
    //   hostedZoneId: params.hostedZoneId,
    //   // クローズドネットワーク
    //   webBucket: props.webBucket,
    //   cognitoUserPoolProxyEndpoint: props.cognitoUserPoolProxyEndpoint,
    //   cognitoIdentityPoolProxyEndpoint: props.cognitoIdentityPoolProxyEndpoint,
    // });

    // CloudFormation出力
    new CfnOutput(this, 'Region', {
      value: this.region,
    });

    // LocalStackではWeb URLは無効化
    // new CfnOutput(this, 'WebUrl', {
    //   value: web.webUrl,
    // });

    new CfnOutput(this, 'ApiEndpoint', {
      value: api.api.url,
    });

    // LocalStackでは認証関連出力を無効化
    // new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    // new CfnOutput(this, 'UserPoolClientId', {
    //   value: auth.client.userPoolClientId,
    // });
    // new CfnOutput(this, 'IdPoolId', { value: auth.idPool.identityPoolId });

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

    new CfnOutput(this, 'EndpointNames', {
      value: JSON.stringify(api.endpointNames),
    });

    new CfnOutput(this, 'SamlAuthEnabled', {
      value: params.samlAuthEnabled.toString(),
    });

    new CfnOutput(this, 'SamlCognitoDomainName', {
      value: params.samlCognitoDomainName ?? '',
    });

    new CfnOutput(this, 'SamlCognitoFederatedIdentityProviderName', {
      value: params.samlCognitoFederatedIdentityProviderName ?? '',
    });

    new CfnOutput(this, 'HiddenUseCases', {
      value: JSON.stringify(params.hiddenUseCases),
    });

    // LocalStackでは認証を無効化
    // this.userPool = auth.userPool;
    // this.userPoolClient = auth.client;

    // this.exportValue(this.userPool.userPoolId);
    // this.exportValue(this.userPoolClient.userPoolClientId);
  }
}
