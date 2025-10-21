import * as cdk from 'aws-cdk-lib';
import { MainStack } from './main-stack';

import { AppParameters } from '../../parameter';

export interface CreateStacksProps {
  readonly app: cdk.App;
  readonly params: AppParameters;
}

/**
 * Stack作成のヘルパー関数
 */
export function createStacks(props: CreateStacksProps): MainStack {
  const { params } = props;

  // メインStack作成
  const mainStack = new MainStack(props.app, params.stackName, params);

  return mainStack;
}
