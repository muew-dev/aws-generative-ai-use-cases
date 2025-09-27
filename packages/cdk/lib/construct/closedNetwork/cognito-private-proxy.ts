import * as cdk from 'aws-cdk-lib';
import * as agw from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CognitoPrivateProxyProps {
  readonly vpcEndpoint: ec2.IInterfaceVpcEndpoint;
}

export class CognitoPrivateProxy extends Construct {
  public readonly cognitoUserPoolProxyApi: agw.RestApi;
  public readonly cognitoIdPoolProxyApi: agw.RestApi;

  constructor(scope: Construct, id: string, props: CognitoPrivateProxyProps) {
    super(scope, id);

    const region = cdk.Stack.of(this).region;
    const cognitoUserPoolEndpoint = `https://cognito-idp.${region}.amazonaws.com`;
    const cognitoIdPoolEndpoint = `https://cognito-identity.${region}.amazonaws.com`;

    this.cognitoUserPoolProxyApi = new agw.RestApi(
      this,
      'CognitoUserPoolProxyApi',
      {
        restApiName: 'GenU Cognito UserPool Proxy API',
        defaultCorsPreflightOptions: {
          allowOrigins: agw.Cors.ALL_ORIGINS,
          allowMethods: ['GET', 'POST', 'OPTIONS'],
          allowHeaders: [
            'amz-sdk-invocation-id',
            'amz-sdk-request',
            'cache-control',
            'content-type',
            'x-amz-target',
            'x-amz-user-agent',
          ],
        },
        endpointConfiguration: {
          types: [agw.EndpointType.PRIVATE],
          vpcEndpoints: [props.vpcEndpoint],
        },
        policy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.DENY,
              principals: [new iam.AnyPrincipal()],
              actions: ['execute-api:Invoke'],
              resources: ['execute-api:/*'],
              conditions: {
                StringNotEquals: {
                  'aws:SourceVpce': props.vpcEndpoint.vpcEndpointId,
                },
              },
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              principals: [new iam.AnyPrincipal()],
              actions: ['execute-api:Invoke'],
              resources: ['execute-api:/*'],
            }),
          ],
        }),
      }
    );

    const userPoolResource =
      this.cognitoUserPoolProxyApi.root.addResource('{userPoolId}');
    const wellKnownResource = userPoolResource.addResource('.well-known');
    const jwksResource = wellKnownResource.addResource('jwks.json');

    // jwtks.jsonを提供するためにルートリソースにGETメソッドを追加
    jwksResource.addMethod(
      'GET',
      new agw.HttpIntegration(
        `${cognitoUserPoolEndpoint}/{userPoolId}/.well-known/jwks.json`,
        {
          proxy: false,
          httpMethod: 'GET',
          options: {
            requestParameters: {
              'integration.request.path.userPoolId':
                'method.request.path.userPoolId',
            },
            integrationResponses: [
              {
                statusCode: '200',
              },
            ],
          },
        }
      ),
      {
        requestParameters: {
          'method.request.path.userPoolId': true,
        },
        methodResponses: [
          {
            statusCode: '200',
          },
        ],
      }
    );

    // Cognito UserPoolリクエストをプロキシするためにルートリソースにPOSTメソッドを追加
    this.cognitoUserPoolProxyApi.root.addMethod(
      'POST',
      new agw.HttpIntegration(cognitoUserPoolEndpoint, {
        proxy: true,
        httpMethod: 'POST',
        options: {
          requestParameters: {
            'integration.request.header.Authorization':
              'method.request.header.Authorization',
            'integration.request.header.Content-Type':
              'method.request.header.Content-Type',
            'integration.request.header.X-Amz-Target':
              'method.request.header.X-Amz-Target',
            'integration.request.header.X-Amz-User-Agent':
              'method.request.header.X-Amz-User-Agent',
          },
          passthroughBehavior: agw.PassthroughBehavior.WHEN_NO_MATCH,
          integrationResponses: [
            {
              statusCode: '200',
              responseParameters: {
                'method.response.header.Access-Control-Allow-Origin': `'*'`,
                'method.response.header.Access-Control-Allow-Headers':
                  "'Content-Type,Authorization,Cache-Control,X-Amz-Target,X-Amz-User-Agent'",
                'method.response.header.Access-Control-Allow-Methods':
                  "'POST,OPTIONS'",
              },
            },
          ],
        },
      }),
      {
        requestParameters: {
          'method.request.header.Authorization': false,
          'method.request.header.Content-Type': false,
          'method.request.header.X-Amz-Target': false,
          'method.request.header.X-Amz-User-Agent': false,
        },
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Methods': true,
            },
          },
        ],
      }
    );

    // 拡張ログ機能付きCognito Identity Poolプロキシ用のプライベートAPI Gatewayを作成
    this.cognitoIdPoolProxyApi = new agw.RestApi(
      this,
      'CognitoIdPoolProxyApi',
      {
        restApiName: 'GenU Cognito ID Pool Proxy API',
        defaultCorsPreflightOptions: {
          allowOrigins: agw.Cors.ALL_ORIGINS,
          allowMethods: ['POST', 'OPTIONS'],
          allowHeaders: [
            'amz-sdk-invocation-id',
            'amz-sdk-request',
            'cache-control',
            'content-type',
            'x-amz-target',
            'x-amz-user-agent',
          ],
        },
        endpointConfiguration: {
          types: [agw.EndpointType.PRIVATE],
          vpcEndpoints: [props.vpcEndpoint],
        },
        policy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.DENY,
              principals: [new iam.AnyPrincipal()],
              actions: ['execute-api:Invoke'],
              resources: ['execute-api:/*'],
              conditions: {
                StringNotEquals: {
                  'aws:SourceVpce': props.vpcEndpoint.vpcEndpointId,
                },
              },
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              principals: [new iam.AnyPrincipal()],
              actions: ['execute-api:Invoke'],
              resources: ['execute-api:/*'],
            }),
          ],
        }),
      }
    );

    // Cognito Identity PoolリクエストをプロキシするためにルートリソースにPOSTメソッドを追加
    this.cognitoIdPoolProxyApi.root.addMethod(
      'POST',
      new agw.HttpIntegration(cognitoIdPoolEndpoint, {
        proxy: true,
        httpMethod: 'POST',
        options: {
          requestParameters: {
            'integration.request.header.Authorization':
              'method.request.header.Authorization',
            'integration.request.header.Content-Type':
              'method.request.header.Content-Type',
            'integration.request.header.X-Amz-Target':
              'method.request.header.X-Amz-Target',
            'integration.request.header.X-Amz-User-Agent':
              'method.request.header.X-Amz-User-Agent',
          },
          passthroughBehavior: agw.PassthroughBehavior.WHEN_NO_MATCH,
          integrationResponses: [
            {
              statusCode: '200',
              responseParameters: {
                'method.response.header.Access-Control-Allow-Origin': `'*'`,
                'method.response.header.Access-Control-Allow-Headers':
                  "'Content-Type,Authorization,Cache-Control,X-Amz-Target,X-Amz-User-Agent'",
                'method.response.header.Access-Control-Allow-Methods':
                  "'POST,OPTIONS'",
              },
            },
          ],
        },
      }),
      {
        requestParameters: {
          'method.request.header.Authorization': false,
          'method.request.header.Content-Type': false,
          'method.request.header.X-Amz-Target': false,
          'method.request.header.X-Amz-User-Agent': false,
        },
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Methods': true,
            },
          },
        ],
      }
    );
  }
}
