#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getParams } from '../parameter';
import { createStacks } from '../lib/create-stacks';
import { TAG_KEY } from '../consts';

const app = new cdk.App();
const params = getParams(app);
if (params.tagValue) {
  cdk.Tags.of(app).add(TAG_KEY, params.tagValue, {
    // OpenSearchServerless Collectionをタグ付けから除外
    excludeResourceTypes: ['AWS::OpenSearchServerless::Collection'],
  });
}
createStacks(app, params);
