# CDK LocalStack コード詳細解説

CDK LocalStackデプロイ時のコード実行フローと各ファイルの役割を詳しく解説します。

## 実行フローの全体像

```bash
npm run cdk:localstack:deploy
↓
cd packages/cdk && source ../../.env && cdklocal deploy --all --require-approval never
```

### 1. cdk.json読み込み
```json
{
  "app": "npx ts-node --prefer-ts-exts bin/generative-ai-use-cases.ts"
}
```

### 2. エントリーポイント実行
`packages/cdk/bin/generative-ai-use-cases.ts`

### 3. パラメータ処理
`packages/cdk/parameter.ts`

### 4. スタック作成
`packages/cdk/lib/create-stacks.ts`

### 5. メインスタック構築
`packages/cdk/lib/generative-ai-use-cases-stack.ts`

### 6. 各構成要素の作成
- Auth（認証）
- Database（データベース）
- API（APIゲートウェイ）
- Web（フロントエンド）

---

## ファイル詳細解説

### 1. エントリーポイント
**ファイル**: `bin/generative-ai-use-cases.ts`

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getParams } from '../parameter';
import { createStacks } from '../lib/create-stacks';
import { TAG_KEY } from '../consts';

const app = new cdk.App();              // ①CDKアプリケーション作成
const params = getParams(app);          // ②設定値取得
if (params.tagValue) {                  // ③タグ付け
  cdk.Tags.of(app).add(TAG_KEY, params.tagValue, {
    excludeResourceTypes: ['AWS::OpenSearchServerless::Collection'],
  });
}
createStacks(app, params);              // ④スタック作成実行
```

**役割**:
- CDKアプリケーションの初期化
- 設定パラメータの取得
- 全体的なタグ付け
- スタック作成処理の開始

---

### 2. パラメータ処理
**ファイル**: `parameter.ts`

```typescript
// Get parameters from CDK Context
const getContext = (app: cdk.App): StackInput => {
  const params = stackInputSchema.parse(app.node.getAllContext());
  return params;
};

export const getParams = (app: cdk.App): ProcessedStackInput => {
  // By default, get parameters from CDK Context
  let params = getContext(app);           // ①cdk.jsonからパラメータ取得

  // If the env matches the ones defined in envs, use the parameters in envs
  if (envs[params.env]) {                 // ②環境別設定のオーバーライド
    params = stackInputSchema.parse({
      ...envs[params.env],
      env: params.env,
    });
  }
  
  // モデルID形式の統一処理
  return {
    ...params,
    modelIds: convertToModelConfiguration(params.modelIds, params.modelRegion),
    // その他の設定値変換...
  };
};
```

**役割**:
- `cdk.json`の`context`から設定値を取得
- 環境別設定（dev/staging/prod）の適用
- モデルID形式の統一化
- 設定値のバリデーション

**重要な設定項目**:
```typescript
// 主要パラメータ
account: "000000000000"           // AWSアカウントID（LocalStack用）
region: "us-east-1"              // デプロイリージョン
modelIds: [                      // 使用するAIモデル
  "anthropic.claude-3-sonnet-20240229-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0"
]
hiddenUseCases: {               // 無効化する機能
  webContent: true,
  image: true,
  video: true
}
```

---

### 3. スタック作成メイン処理
**ファイル**: `lib/create-stacks.ts`

```typescript
export const createStacks = (app: cdk.App, params: ProcessedStackInput) => {
  // ①各モデル地域用の推論プロファイルスタック作成
  const modelRegions = [...new Set([...params.modelIds.map(model => model.region)])];
  const inferenceProfileStacks = {};
  for (const region of modelRegions) {
    const applicationInferenceProfileStack = new ApplicationInferenceProfileStack(
      app, `ApplicationInferenceProfileStack${params.env}${region}`, { /*設定*/ }
    );
    inferenceProfileStacks[region] = applicationInferenceProfileStack;
  }

  // ②閉じたネットワーク用スタック（条件付き）
  let closedNetworkStack = undefined;
  if (params.closedNetworkMode) {
    closedNetworkStack = new ClosedNetworkStack(app, `ClosedNetworkStack${params.env}`, {});
  }

  // ③CloudFront WAFスタック（条件付き）
  const cloudFrontWafStack = (params.allowedIpV4AddressRanges || /*その他条件*/) && !params.closedNetworkMode
    ? new CloudFrontWafStack(app, `CloudFrontWafStack${params.env}`, {})
    : null;

  // ④メインスタック作成（必須）
  const generativeAiUseCasesStack = new GenerativeAiUseCasesStack(
    app, `GenerativeAiUseCasesStack${updatedParams.env}`, {
      env: { account: updatedParams.account, region: updatedParams.region },
      params: updatedParams,
      // 他スタックからの依存関係
      webAclId: cloudFrontWafStack?.webAclArn,
      cert: cloudFrontWafStack?.cert,
      vpc: closedNetworkStack?.vpc,
      // その他設定...
    }
  );

  // ⑤ダッシュボードスタック（条件付き）
  const dashboardStack = updatedParams.dashboard 
    ? new DashboardStack(app, `GenerativeAiUseCasesDashboardStack${updatedParams.env}`, {})
    : null;

  return { closedNetworkStack, cloudFrontWafStack, generativeAiUseCasesStack, dashboardStack };
};
```

**スタック作成順序と条件**:
1. **ApplicationInferenceProfileStack** - 各モデルリージョン用（必須）
2. **ClosedNetworkStack** - `closedNetworkMode: true`の場合のみ
3. **CloudFrontWafStack** - IP制限等がある場合のみ
4. **GenerativeAiUseCasesStack** - メインスタック（必須）
5. **DashboardStack** - `dashboard: true`の場合のみ

---

### 4. メインスタック
**ファイル**: `lib/generative-ai-use-cases-stack.ts`

```typescript
export class GenerativeAiUseCasesStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: GenerativeAiUseCasesStackProps) {
    super(scope, id, props);

    const params = props.params;

    // ①セキュリティグループ設定（VPCモード用）
    let securityGroups = undefined;
    if (props.vpc) {
      securityGroups = [new SecurityGroup(this, 'LambdaSecurityGroup', {})];
    }

    // ②認証システム作成
    const auth = new Auth(this, 'Auth', {
      selfSignUpEnabled: params.selfSignUpEnabled,
      allowedIpV4AddressRanges: params.allowedIpV4AddressRanges,
      allowedSignUpEmailDomains: params.allowedSignUpEmailDomains,
      samlAuthEnabled: params.samlAuthEnabled,
    });

    // ③データベース作成
    const database = new Database(this, 'Database');

    // ④API作成
    const api = new Api(this, 'API', {
      modelRegion: params.modelRegion,
      modelIds: params.modelIds,
      userPool: auth.userPool,
      idPool: auth.idPool,
      userPoolClient: auth.client,
      table: database.table,
      statsTable: database.statsTable,
      vpc: props.vpc,
      securityGroups,
      // その他多数の設定...
    });

    // ⑤WAF設定（条件付き）
    if (params.allowedIpV4AddressRanges) {
      const webAcl = new CommonWebAcl(this, 'WebAcl', {});
      // API GatewayにWAF関連付け
      new CfnWebACLAssociation(this, 'ApiWebAclAssociation', {});
    }

    // ⑥フロントエンド作成
    const web = new Web(this, 'Web', {
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.client.userPoolClientId,
      identityPoolId: auth.idPool.identityPoolId,
      apiEndpointUrl: api.api.url,
      // 他50以上の設定パラメータ...
    });

    // ⑦カスタムドメイン設定（条件付き）
    if (props.cert && params.hostName) {
      // カスタムドメインの設定処理
    }

    // ⑧出力値設定
    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'ApiEndpointUrl', { value: api.api.url });
    new CfnOutput(this, 'WebUrl', { value: web.cloudFrontWebDistribution.distributionDomainName });
    // その他の出力値...
  }
}
```

**構成要素の作成順序**:
1. **セキュリティグループ** - VPC用の通信制御
2. **Auth** - Cognito認証システム
3. **Database** - DynamoDBテーブル
4. **API** - API Gateway + Lambda関数群
5. **WAF** - Web Application Firewall（条件付き）
6. **Web** - CloudFront + S3フロントエンド
7. **カスタムドメイン** - 独自ドメイン設定（条件付き）
8. **出力値** - デプロイ後の接続情報

---

## 各構成要素の詳細

### Auth（認証システム）
**ファイル**: `lib/construct/auth.ts`

**作成されるリソース**:
```typescript
// ①Cognito User Pool
const userPool = new cognito.UserPool(this, 'UserPool', {
  passwordPolicy: {                    // パスワードポリシー
    minimumLength: 8,
    requireLowercase: true,
    requireUppercase: true, 
    requireDigits: true,
    requireSymbols: true,
  },
  signInAliases: { email: true },     // メールアドレスでサインイン
  selfSignUpEnabled: props.selfSignUpEnabled,
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
});

// ②User Pool Client
const client = userPool.addClient('UserPoolClient', {
  idTokenValidity: cdk.Duration.days(1),
  accessTokenValidity: cdk.Duration.days(1), 
  refreshTokenValidity: cdk.Duration.days(30),
});

// ③Identity Pool  
const idPool = new cognito.CfnIdentityPool(this, 'IdPool', {
  allowUnauthenticatedIdentities: false,
  cognitoIdentityProviders: [],
});

// ④IAMロール設定
const authenticatedRole = new iam.Role(this, 'CognitoDefaultAuthenticatedRole', {
  assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {}),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonPollyFullAccess')
  ],
});
```

**特徴**:
- セルフサインアップ制御
- Email domainフィルタリング
- SAML認証対応
- IP制限機能
- Polly（音声合成）権限の自動付与

---

### Database（データベース）
**ファイル**: `lib/construct/database.ts`

**作成されるリソース**:
```typescript
// ①メインテーブル
const table = new dynamodb.Table(this, 'Table', {
  tableName: `GenU${id}`,
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,  // オンデマンド課金
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'createdDate', type: dynamodb.AttributeType.NUMBER },
  removalPolicy: cdk.RemovalPolicy.DESTROY,          // 開発用設定
});

// ②GSI（Global Secondary Index）- フィードバック用
table.addGlobalSecondaryIndex({
  indexName: 'getFeedbackByIdGSI',
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'hasComment', type: dynamodb.AttributeType.NUMBER },
});

// ③統計テーブル
const statsTable = new dynamodb.Table(this, 'StatsTable', {
  tableName: `GenUStats${id}`,
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

**データ構造**:
- **メインテーブル**: チャット履歴、ユーザーデータ、共有データ
- **統計テーブル**: 使用量統計、トークン使用量
- **GSI**: フィードバック機能用のインデックス

---

### API（APIゲートウェイ）
**ファイル**: `lib/construct/api.ts`

**大規模なLambda関数群**:
```typescript
// 予測・生成系
const predict = new lambda.Function('predict', {});
const predictStream = new lambda.Function('predictStream', {});
const predictTitle = new lambda.Function('predictTitle', {});

// チャット管理系
const createChat = new lambda.Function('createChat', {});
const deleteChat = new lambda.Function('deleteChat', {});
const listChats = new lambda.Function('listChats', {});

// メッセージ管理系
const createMessages = new lambda.Function('createMessages', {});
const listMessages = new lambda.Function('listMessages', {});

// ファイル管理系
const getSignedUrl = new lambda.Function('getSignedUrl', {});
const deleteFile = new lambda.Function('deleteFile', {});

// システム系
const getSystemContext = new lambda.Function('getSystemContext', {});
const createSystemContext = new lambda.Function('createSystemContext', {});
// ...他20以上の関数
```

**API Gateway設定**:
```typescript
const api = new apigateway.RestApi(this, 'Api', {
  restApiName: `GenerativeAiUseCasesApi${id}`,
  deployOptions: { stageName: 'api' },
  defaultCorsPreflightOptions: {          // CORS設定
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['*'],
  },
  defaultMethodOptions: {                 // 認証設定
    authorizationType: apigateway.AuthorizationType.COGNITO,
    authorizer: new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
    }),
  },
});
```

**エンドポイント例**:
- `POST /predict` - AI予測実行
- `GET /chats` - チャット一覧取得
- `POST /chats` - チャット作成
- `DELETE /chats/{chatId}` - チャット削除
- `GET /messages` - メッセージ一覧取得
- `POST /signed-url` - ファイルアップロード用署名付きURL取得

---

### Web（フロントエンド）
**ファイル**: `lib/construct/web.ts`

**CodeBuildによる自動デプロイ**:
```typescript
const buildProject = new codebuild.Project(this, 'BuildProject', {
  source: codebuild.Source.s3({
    bucket: props.websiteBucket ?? websiteBucket,
    path: 'assets.zip',
  }),
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    computeType: codebuild.ComputeType.MEDIUM,
    environmentVariables: {
      // 50以上の環境変数を設定
      VITE_APP_API_ENDPOINT: { value: props.apiEndpointUrl },
      VITE_APP_USER_POOL_ID: { value: props.userPoolId },
      VITE_APP_USER_POOL_CLIENT_ID: { value: props.userPoolClientId },
      VITE_APP_IDENTITY_POOL_ID: { value: props.identityPoolId },
      VITE_APP_REGION: { value: cdk.Stack.of(this).region },
      // 機能の有効/無効制御
      VITE_APP_RAG_ENABLED: { value: props.ragEnabled.toString() },
      VITE_APP_AGENT_ENABLED: { value: props.agentEnabled.toString() },
      // モデル設定
      VITE_APP_MODEL_IDS: { value: JSON.stringify(props.modelIds) },
      // その他多数...
    },
  },
  buildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      install: { 'runtime-versions': { nodejs: '22' } },
      pre_build: { commands: ['npm ci'] },
      build: { commands: ['npm run web:build'] },
    },
    artifacts: {
      'base-directory': 'packages/web/dist',
      files: ['**/*'],
    },
  }),
});
```

**CloudFront配信**:
```typescript
const cloudFrontWebDistribution = new cloudfront.CloudFrontWebDistribution(this, 'CloudFrontWebDistribution', {
  viewerCertificate: props.domainName && props.hostedZoneId && certificate
    ? cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
        aliases: [props.domainName],
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      })
    : cloudfront.ViewerCertificate.fromCloudFrontDefaultCertificate(),
  
  defaultRootObject: 'index.html',
  errorConfigurations: [
    { errorCode: 404, responseCode: 200, responsePagePath: '/index.html', errorCachingMinTtl: 0 },
    { errorCode: 403, responseCode: 200, responsePagePath: '/index.html', errorCachingMinTtl: 0 },
  ],
  
  originConfigs: [{
    s3OriginSource: { s3BucketSource: websiteBucket },
    behaviors: [{
      isDefaultBehavior: true,
      compress: true,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy: responseHeadersPolicy,  // セキュリティヘッダー
    }],
  }],
});
```

---

## LocalStack特有の設定

### 環境変数（.env）
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
CDK_DEFAULT_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=000000000000
```

### cdk.json（LocalStack向け調整済み）
```json
{
  "context": {
    "hiddenUseCases": {
      "webContent": true,        // LocalStack未対応機能を無効
      "image": true,
      "video": true,
      "videoAnalyzer": true,
      "diagram": true,
      "meetingMinutes": true,
      "voiceChat": true
    },
    "modelIds": [                // LocalStack対応モデルのみ
      "anthropic.claude-3-sonnet-20240229-v1:0",
      "anthropic.claude-3-haiku-20240307-v1:0",
      "anthropic.claude-instant-v1"
    ],
    "modelRegion": "us-east-1"
  }
}
```

---

## 実行結果（LocalStackにデプロイされるリソース）

### 必須リソース
```bash
✅ ApplicationInferenceProfileStack-us-east-1
✅ GenerativeAiUseCasesStack
   ├── Cognito User Pool（認証）
   ├── Cognito Identity Pool（権限管理） 
   ├── DynamoDB Table（メインデータ）
   ├── DynamoDB Table（統計データ）
   ├── API Gateway（REST API）
   ├── Lambda関数 × 20以上（ビジネスロジック）
   ├── S3 Bucket（フロントエンド）
   ├── CloudFront Distribution（CDN）
   └── CodeBuild Project（自動デプロイ）
```

### 条件付きリソース
```bash
🔷 CloudFrontWafStack（IP制限がある場合）
🔷 ClosedNetworkStack（プライベートモードの場合）
🔷 DashboardStack（ダッシュボード有効の場合）
```

## まとめ

このCDKプロジェクトは以下の流れで実行されます：

1. **設定読み込み** - `cdk.json` → `parameter.ts`で環境固有の設定を適用
2. **スタック決定** - `create-stacks.ts`で条件に基づいて作成するスタックを決定
3. **リソース作成** - メインスタックで Auth → Database → API → Web の順で構成要素を作成
4. **依存関係解決** - CloudFormationが自動的にリソース作成順序を管理
5. **デプロイ完了** - LocalStackに全リソースが作成され、Webアプリケーションが利用可能

LocalStack環境では、AWS Bedrockの代わりにモックサーバーを使用し、不要な機能は`hiddenUseCases`で無効化することで、ローカル開発に最適化された環境が構築されます。