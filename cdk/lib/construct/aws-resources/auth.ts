import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { CognitoConfig, Constants, EnvironmentType } from '../../constants';

export interface AuthProps {
  readonly userPoolName: string;
  readonly allowSelfSignUp: boolean;
  readonly requireEmailVerification: boolean;
  readonly passwordPolicy: cognito.PasswordPolicy;
  readonly environment: EnvironmentType; // 環境別設定用
  readonly domainPrefix: string; // Cognito Domain用プレフィックス
  readonly domain: string; // OAuth コールバック用ドメイン名
}

/**
 * Cognito Authentication L2 Construct
 * User Pool with unified JWT authentication
 */
export class Auth extends Construct {
  private readonly props: AuthProps;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);
    this.props = props;

    // User Pool作成
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,
      selfSignUpEnabled: props.allowSelfSignUp,
      signInAliases: {
        email: true,
        username: false, // Usernameをオプションに変更
      },
      autoVerify: {
        email: props.requireEmailVerification,
      },
      standardAttributes: {
        email: {
          required: true, // Emailを必須属性として明示的に設定
          mutable: true,
        },
        fullname: {
          required: false, // Display Name（フルネーム）をオプション属性として追加
          mutable: true,
        },
      },
      passwordPolicy: props.passwordPolicy,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // 全環境統一削除設定（開発効率重視）
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      customAttributes: {
        role: new cognito.StringAttribute({
          maxLen: 50,
        }),
      },
      lambdaTriggers: {},
    });

    // User Pool Client作成
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: Constants.USER_POOL_CLIENT_NAME,
      generateSecret: true, // ALB OIDC認証にはClient Secretが必要
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
        adminUserPassword: true,
      },
      // OAuth設定 - ALB OIDC認証用
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          // ALB OIDC認証のコールバックURL（環境別ドメイン対応）
          `https://${this.props.domain}/oauth2/idpresponse`,
          // ユーザー登録フロー用のコールバックURL（バックエンド経由でDB登録後フロントエンドにリダイレクト）
          `https://${this.props.domain}/api/auth/register/callback`,
        ],
        logoutUrls: [
          // ログアウト後のリダイレクト先（環境別ドメイン）
          `https://${this.props.domain}/`,
        ],
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(
        CognitoConfig.TOKEN_VALIDITY.REFRESH_TOKEN_DAYS
      ),
      accessTokenValidity: cdk.Duration.hours(
        CognitoConfig.TOKEN_VALIDITY.ACCESS_TOKEN_HOURS
      ),
      idTokenValidity: cdk.Duration.hours(
        CognitoConfig.TOKEN_VALIDITY.ID_TOKEN_HOURS
      ),
    });

    // User Pool Domain作成（ALB認証に必須）
    const domainPrefix = props.domainPrefix;
    this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
    });
  }
}
