import { Duration } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  RestApi,
  EndpointType,
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';

import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IdentityPool } from 'aws-cdk-lib/aws-cognito-identitypool';
import {} from 'aws-cdk-lib/aws-iam';
import { HttpMethods } from 'aws-cdk-lib/aws-s3';
import { ModelConfiguration } from 'generative-ai-use-cases';
import { LAMBDA_RUNTIME_NODEJS } from '../../../consts';
import {
  InterfaceVpcEndpoint,
  IVpc,
  ISecurityGroup,
} from 'aws-cdk-lib/aws-ec2';

export interface BackendApiProps {
  // Context Params
  readonly modelRegion: string;
  readonly modelIds: ModelConfiguration[];
  readonly crossAccountBedrockRoleArn?: string | null;
  readonly allowedIpV4AddressRanges?: string[] | null;
  readonly allowedIpV6AddressRanges?: string[] | null;

  // Resource
  readonly userPool: UserPool;
  readonly idPool: IdentityPool;
  readonly userPoolClient: UserPoolClient;
  readonly table: Table;
  readonly statsTable: Table;
  readonly guardrailIdentify?: string;
  readonly guardrailVersion?: string;

  // Closed network
  readonly vpc?: IVpc;
  readonly securityGroups?: ISecurityGroup[];
  readonly apiGatewayVpcEndpoint?: InterfaceVpcEndpoint;
  readonly cognitoUserPoolProxyEndpoint?: string;
}

export class Api extends Construct {
  readonly api: RestApi;
  readonly predictStreamFunction: NodejsFunction;
  readonly modelRegion: string;
  readonly modelIds: ModelConfiguration[];

  constructor(scope: Construct, id: string, props: BackendApiProps) {
    super(scope, id);

    const {
      modelRegion,
      modelIds,
      crossAccountBedrockRoleArn,
      userPool,
      userPoolClient,
      idPool,
      table,
      statsTable,
      vpc,
      securityGroups,
    } = props;

    this.modelRegion = modelRegion;
    this.modelIds = modelIds;

    // API Gateway
    const api = new RestApi(this, 'RestApi', {
      cloudWatchRole: false,
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
        vpcEndpoints: props.apiGatewayVpcEndpoint
          ? [props.apiGatewayVpcEndpoint]
          : undefined,
      },
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 2000,
        throttlingBurstLimit: 5000,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: [
          HttpMethods.GET,
          HttpMethods.POST,
          HttpMethods.PUT,
          HttpMethods.DELETE,
        ],
        allowHeaders: ['*'],
        exposeHeaders: [],
        maxAge: Duration.seconds(3000),
      },
    });

    // Lambda Functions for Chat Functionality

    // WebSocket Streaming Function
    const predictStreamFunction = new NodejsFunction(this, 'PredictStream', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/streaming/predictStream.ts',
      timeout: Duration.minutes(15),
      memorySize: 256,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        USER_POOL_PROXY_ENDPOINT: props.cognitoUserPoolProxyEndpoint ?? '',
        MODEL_REGION: modelRegion,
        MODEL_IDS: JSON.stringify(modelIds),
        CROSS_ACCOUNT_BEDROCK_ROLE_ARN: crossAccountBedrockRoleArn ?? '',
        ...(props.guardrailIdentify
          ? { GUARDRAIL_IDENTIFIER: props.guardrailIdentify }
          : {}),
        ...(props.guardrailVersion
          ? { GUARDRAIL_VERSION: props.guardrailVersion }
          : {}),
      },
      bundling: {
        nodeModules: ['@aws-sdk/client-bedrock-runtime'],
      },
      vpc,
      securityGroups,
    });
    predictStreamFunction.grantInvoke(idPool.authenticatedRole);

    // Chat CRUD Functions
    const createChatFunction = new NodejsFunction(this, 'CreateChat', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/api-gateway/chat/createChat.ts',
      timeout: Duration.minutes(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      vpc,
      securityGroups,
    });
    table.grantWriteData(createChatFunction);

    const deleteChatFunction = new NodejsFunction(this, 'DeleteChat', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/api-gateway/chat/deleteChat.ts',
      timeout: Duration.minutes(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      vpc,
      securityGroups,
    });
    table.grantWriteData(deleteChatFunction);

    const createMessagesFunction = new NodejsFunction(this, 'CreateMessages', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/api-gateway/chat/createMessages.ts',
      timeout: Duration.minutes(15),
      environment: {
        TABLE_NAME: table.tableName,
        STATS_TABLE_NAME: statsTable.tableName,
      },
      vpc,
      securityGroups,
    });
    table.grantWriteData(createMessagesFunction);
    statsTable.grantWriteData(createMessagesFunction);

    const updateChatTitleFunction = new NodejsFunction(
      this,
      'UpdateChatTitle',
      {
        runtime: LAMBDA_RUNTIME_NODEJS,
        entry: '../lambda/src/api-gateway/chat/updateTitle.ts',
        timeout: Duration.minutes(15),
        environment: {
          TABLE_NAME: table.tableName,
        },
        vpc,
        securityGroups,
      }
    );
    table.grantWriteData(updateChatTitleFunction);

    const listChatsFunction = new NodejsFunction(this, 'ListChats', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/api-gateway/chat/listChats.ts',
      timeout: Duration.minutes(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      vpc,
      securityGroups,
    });
    table.grantReadData(listChatsFunction);

    const findChatbyIdFunction = new NodejsFunction(this, 'FindChatbyId', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/api-gateway/chat/findChatById.ts',
      timeout: Duration.minutes(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      vpc,
      securityGroups,
    });
    table.grantReadData(findChatbyIdFunction);

    const listMessagesFunction = new NodejsFunction(this, 'ListMessages', {
      runtime: LAMBDA_RUNTIME_NODEJS,
      entry: '../lambda/src/api-gateway/chat/listMessages.ts',
      timeout: Duration.minutes(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      vpc,
      securityGroups,
    });
    table.grantReadData(listMessagesFunction);

    // Cognito Authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });

    // API Endpoints
    const chatsResource = api.root.addResource('chats');
    const chatResource = chatsResource.addResource('{chatId}');
    const messagesResource = chatResource.addResource('messages');
    const titleResource = chatResource.addResource('title');

    // Chat endpoints
    chatsResource.addMethod('POST', new LambdaIntegration(createChatFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    chatsResource.addMethod('GET', new LambdaIntegration(listChatsFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    chatResource.addMethod('GET', new LambdaIntegration(findChatbyIdFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer,
    });

    chatResource.addMethod(
      'DELETE',
      new LambdaIntegration(deleteChatFunction),
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer,
      }
    );

    titleResource.addMethod(
      'PUT',
      new LambdaIntegration(updateChatTitleFunction),
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer,
      }
    );

    // Message endpoints
    messagesResource.addMethod(
      'GET',
      new LambdaIntegration(listMessagesFunction),
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer,
      }
    );

    messagesResource.addMethod(
      'POST',
      new LambdaIntegration(createMessagesFunction),
      {
        authorizationType: AuthorizationType.COGNITO,
        authorizer,
      }
    );

    this.api = api;
    this.predictStreamFunction = predictStreamFunction;
  }
}
