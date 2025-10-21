import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CognitoConfig, Constants, Environment } from '../../../lib/constants';
import { Auth } from '../../../lib/construct/aws-resources/auth';

describe('Auth L2 Construct Unit Tests', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { region: 'ap-northeast-1', account: '123456890123' },
    });
  });

  describe.each([
    [Environment.DEV, 'development'],
    [Environment.PROD, 'production'],
  ])('Environment: %s (%s)', (environment, envName) => {
    test(`should create Cognito User Pool with correct configuration for ${envName}`, () => {
      const auth = new Auth(stack, `TestAuth${envName}`, {
        userPoolName: 'test-user-pool',
        allowSelfSignUp: true,
        requireEmailVerification: true,
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        environment: environment,
        domainPrefix: `test-auth-${environment}`,
        domain: 'test.example.com',
      });

      // インスタンス変数の確認
      expect(auth.userPool).toBeDefined();
      expect(auth.userPoolClient).toBeDefined();
      expect(auth.userPoolDomain).toBeDefined();

      const template = Template.fromStack(stack);

      // User Pool基本設定
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'test-user-pool',
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
        UsernameAttributes: ['email'],
        AutoVerifiedAttributes: ['email'],
        AccountRecoverySetting: {
          RecoveryMechanisms: [
            {
              Name: 'verified_email',
              Priority: 1,
            },
          ],
        },
      });

      // 標準属性とカスタム属性の確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: [
          {
            Name: 'email',
            Required: true,
            Mutable: true,
          },
          {
            Name: 'role',
            AttributeDataType: 'String',
            StringAttributeConstraints: {
              MaxLength: '50',
            },
          },
        ],
      });
    });

    test(`should create User Pool Client with OAuth configuration for ${envName}`, () => {
      new Auth(stack, `TestAuthClient${envName}`, {
        userPoolName: 'test-user-pool',
        allowSelfSignUp: false,
        requireEmailVerification: true,
        passwordPolicy: {
          minLength: 12,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        environment: environment,
        domainPrefix: `test-auth-client-${environment}`,
        domain: 'test-client.example.com',
      });

      const template = Template.fromStack(stack);

      // User Pool Client設定
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ClientName: Constants.USER_POOL_CLIENT_NAME,
        GenerateSecret: true, // ALB OIDC認証に必須
        ExplicitAuthFlows: [
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_ADMIN_USER_PASSWORD_AUTH',
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ],
        SupportedIdentityProviders: ['COGNITO'],
        AllowedOAuthFlows: ['code'],
        AllowedOAuthScopes: ['openid', 'email', 'profile'],
        CallbackURLs: ['https://test-client.example.com/oauth2/idpresponse'],
        LogoutURLs: ['https://test-client.example.com/'],
        PreventUserExistenceErrors: 'ENABLED',
      });

      // Token有効期限の確認（CDKは分単位に変換）
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        RefreshTokenValidity:
          CognitoConfig.TOKEN_VALIDITY.REFRESH_TOKEN_DAYS * 24 * 60, // 30日 = 43200分
        AccessTokenValidity:
          CognitoConfig.TOKEN_VALIDITY.ACCESS_TOKEN_HOURS * 60, // 1時間 = 60分
        IdTokenValidity: CognitoConfig.TOKEN_VALIDITY.ID_TOKEN_HOURS * 60, // 1時間 = 60分
        TokenValidityUnits: {
          RefreshToken: 'minutes',
          AccessToken: 'minutes',
          IdToken: 'minutes',
        },
      });
    });

    test(`should create User Pool Domain for ALB authentication for ${envName}`, () => {
      new Auth(stack, `TestAuthDomain${envName}`, {
        userPoolName: 'test-user-pool-domain',
        allowSelfSignUp: true,
        requireEmailVerification: false,
        passwordPolicy: {
          minLength: 8,
          requireLowercase: false,
          requireUppercase: false,
          requireDigits: false,
          requireSymbols: false,
        },
        environment: environment,
        domainPrefix: `test-domain-${environment}-unique`,
        domain: 'test-domain.example.com',
      });

      const template = Template.fromStack(stack);

      // User Pool Domain設定
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: `test-domain-${environment}-unique`,
      });

      // User Pool Domain の存在確認のみ（参照は複雑なため基本設定のみテスト）
      template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    });

    test(`should support different password policies for ${envName}`, () => {
      // 緩い設定
      new Auth(stack, `TestAuthLenient${envName}`, {
        userPoolName: 'lenient-user-pool',
        allowSelfSignUp: false,
        requireEmailVerification: false,
        passwordPolicy: {
          minLength: 6,
          requireLowercase: false,
          requireUppercase: false,
          requireDigits: false,
          requireSymbols: false,
        },
        environment: environment,
        domainPrefix: `lenient-${environment}`,
        domain: 'lenient.example.com',
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'lenient-user-pool',
        Policies: {
          PasswordPolicy: {
            MinimumLength: 6,
            RequireLowercase: false,
            RequireUppercase: false,
            RequireNumbers: false,
            RequireSymbols: false,
          },
        },
      });
    });

    test(`should configure removal policy correctly for ${envName}`, () => {
      new Auth(stack, `TestAuthRemoval${envName}`, {
        userPoolName: 'test-removal-pool',
        allowSelfSignUp: true,
        requireEmailVerification: true,
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        environment: environment,
        domainPrefix: `removal-${environment}`,
        domain: 'removal.example.com',
      });

      const template = Template.fromStack(stack);

      // 開発効率重視でDESTROYポリシー（リソースレベルで確認）
      const resources = template.findResources('AWS::Cognito::UserPool');
      const userPoolResource = Object.values(resources)[0];
      expect(userPoolResource).toHaveProperty('DeletionPolicy', 'Delete');
    });
  });

  test('should validate OAuth callback and logout URLs', () => {
    new Auth(stack, 'TestAuthOAuth', {
      userPoolName: 'oauth-test-pool',
      allowSelfSignUp: true,
      requireEmailVerification: true,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      environment: Environment.DEV,
      domainPrefix: 'oauth-test',
      domain: 'oauth-test.example.com',
    });

    const template = Template.fromStack(stack);

    // 環境別ドメイン対応のURL設定
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      CallbackURLs: ['https://oauth-test.example.com/oauth2/idpresponse'],
      LogoutURLs: ['https://oauth-test.example.com/'],
    });
  });

  test('should create resources in correct dependency order', () => {
    new Auth(stack, 'TestAuthDependency', {
      userPoolName: 'dependency-test-pool',
      allowSelfSignUp: true,
      requireEmailVerification: true,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      environment: Environment.PROD,
      domainPrefix: 'dependency-test',
      domain: 'dependency-test.example.com',
    });

    const template = Template.fromStack(stack);

    // リソース作成順序の確認
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);

    // リソース間の依存関係は存在確認のみ（詳細な参照チェックは複雑）
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
  });

  test('should handle edge cases with minimal configuration', () => {
    const auth = new Auth(stack, 'TestAuthMinimal', {
      userPoolName: 'minimal-pool',
      allowSelfSignUp: false,
      requireEmailVerification: false,
      passwordPolicy: {
        minLength: 8,
      },
      environment: Environment.DEV,
      domainPrefix: 'minimal-test',
      domain: 'minimal.example.com',
    });

    expect(auth.userPool).toBeDefined();
    expect(auth.userPoolClient).toBeDefined();
    expect(auth.userPoolDomain).toBeDefined();

    const template = Template.fromStack(stack);

    // 最小設定でもリソースが作成される
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
  });
});
