#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { Environment } from '../lib/constants';
import { createStacks } from '../lib/stacks/create-stacks';
import { getAppParameters } from '../parameter';

const app = new cdk.App();

// CDK Contextから環境を取得（デプロイコマンドで指定）
const env = app.node.tryGetContext('env') || Environment.DEV;
const params = getAppParameters(env);


// メインStackを作成
createStacks({
  app,
  params,
});

console.log(`✅ CDK App initialized successfully`);
console.log(`Environment: ${params.environment}`);
console.log(`Stack Name: ${params.stackName}`);
