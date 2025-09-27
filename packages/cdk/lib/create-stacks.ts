import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { GenerativeAiUseCasesStack } from './generative-ai-use-cases-stack';
// import { CloudFrontWafStack } from './cloud-front-waf-stack';  // LocalStackでは使用しない
// import { DashboardStack } from './dashboard-stack';  // LocalStackでは使用しない
import { ProcessedStackInput } from './stack-input';
import { ApplicationInferenceProfileStack } from './application-inference-profile-stack';
// import { ClosedNetworkStack } from './closed-network-stack';  // LocalStackでは使用しない

class DeletionPolicySetter implements cdk.IAspect {
  constructor(private readonly policy: cdk.RemovalPolicy) {}

  visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      node.applyRemovalPolicy(this.policy);
    }
  }
}

// 推論プロファイルARNをModelIdにマージして新しい配列を返す
const mergeModelIdsAndInferenceProfileArn = (
  modelIds: ProcessedStackInput['modelIds'],
  inferenceProfileStacks: Record<string, ApplicationInferenceProfileStack>
) => {
  return modelIds.map((modelId) => {
    const result = { ...modelId };
    const stack = inferenceProfileStacks[modelId.region];
    if (stack && stack.inferenceProfileArns[modelId.modelId]) {
      result.inferenceProfileArn = stack.inferenceProfileArns[modelId.modelId];
    }
    return result;
  });
};

export const createStacks = (app: cdk.App, params: ProcessedStackInput) => {
  // 使用するモデルの各リージョンに対してApplicationInferenceProfileを作成
  const modelRegions = [
    ...new Set([
      ...params.modelIds.map((model) => model.region),
    ]),
  ];
  const inferenceProfileStacks: Record<
    string,
    ApplicationInferenceProfileStack
  > = {};
  for (const region of modelRegions) {
    const applicationInferenceProfileStack =
      new ApplicationInferenceProfileStack(
        app,
        `ApplicationInferenceProfileStack${params.env}${region}`,
        {
          env: {
            account: params.account,
            region,
          },
          params,
        }
      );
    inferenceProfileStacks[region] = applicationInferenceProfileStack;
  }

  // モデルIDに推論プロファイルARNを設定
  const updatedParams: ProcessedStackInput = JSON.parse(JSON.stringify(params));
  updatedParams.modelIds = mergeModelIdsAndInferenceProfileArn(
    params.modelIds,
    inferenceProfileStacks
  );

  // GenU スタック
  const isSageMakerStudio = 'SAGEMAKER_APP_TYPE_LOWERCASE' in process.env;

  // LocalStackではClosedNetworkStackを無効化
  let closedNetworkStack: any | undefined = undefined; // LocalStack用に型を any に変更

  // LocalStackではClosedNetworkStackを無効化
  // if (false) { // params.closedNetworkMode を false に変更
  //   closedNetworkStack = new ClosedNetworkStack(
  //     app,
  //     `ClosedNetworkStack${params.env}`,
  //     {
  //       env: {
  //         account: params.account,
  //         region: params.region,
  //       },
  //       params,
  //       isSageMakerStudio,
  //     }
  //   );
  // }

  // LocalStackではCloudFront WAFを無効化
  const cloudFrontWafStack = null;
  // const cloudFrontWafStack =
  //   (params.allowedIpV4AddressRanges ||
  //     params.allowedIpV6AddressRanges ||
  //     params.allowedCountryCodes ||
  //     params.hostName) &&
  //   !params.closedNetworkMode
  //     ? new CloudFrontWafStack(app, `CloudFrontWafStack${params.env}`, {
  //         env: {
  //           account: updatedParams.account,
  //           region: 'us-east-1',
  //         },
  //         params: updatedParams,
  //         crossRegionReferences: true,
  //       })
  //     : null;


  const generativeAiUseCasesStack = new GenerativeAiUseCasesStack(
    app,
    `GenerativeAiUseCasesStack${updatedParams.env}`,
    {
      env: {
        account: updatedParams.account,
        region: updatedParams.region,
      },
      description: updatedParams.anonymousUsageTracking
        ? 'Generative AI Use Cases (uksb-1tupboc48)'
        : undefined,
      params: updatedParams,
      crossRegionReferences: true,
      // LocalStackではWAFとクローズドネットワークを無効化
      // webAclId: cloudFrontWafStack?.webAclArn,
      webAclId: undefined,
      // カスタムドメイン
      // cert: cloudFrontWafStack?.cert,
      cert: undefined,
      // イメージビルド環境
      isSageMakerStudio,
      // クローズドネットワーク
      // vpc: closedNetworkStack?.vpc,
      vpc: undefined,
      // apiGatewayVpcEndpoint: closedNetworkStack?.apiGatewayVpcEndpoint,
      apiGatewayVpcEndpoint: undefined,
      // webBucket: closedNetworkStack?.webBucket,
      webBucket: undefined,
      // cognitoUserPoolProxyEndpoint: closedNetworkStack?.cognitoUserPoolProxyApi?.url ?? '',
      cognitoUserPoolProxyEndpoint: undefined,
      // cognitoIdentityPoolProxyEndpoint: closedNetworkStack?.cognitoIdPoolProxyApi?.url ?? '',
      cognitoIdentityPoolProxyEndpoint: undefined,
    }
  );

  cdk.Aspects.of(generativeAiUseCasesStack).add(
    new DeletionPolicySetter(cdk.RemovalPolicy.DESTROY)
  );

  // LocalStackではダッシュボードスタックを無効化
  const dashboardStack = null;
  // const dashboardStack = updatedParams.dashboard
  //   ? new DashboardStack(
  //       app,
  //       `GenerativeAiUseCasesDashboardStack${updatedParams.env}`,
  //       {
  //         env: {
  //           account: updatedParams.account,
  //           region: updatedParams.modelRegion,
  //         },
  //         params: updatedParams,
  //         // LocalStackでは認証を無効化
  //         // userPool: generativeAiUseCasesStack.userPool,
  //         // userPoolClient: generativeAiUseCasesStack.userPoolClient,
  //         appRegion: updatedParams.region,
  //         crossRegionReferences: true,
  //       }
  //     )
  //   : null;

  return {
    closedNetworkStack,
    cloudFrontWafStack,
    generativeAiUseCasesStack,
    dashboardStack,
  };
};
