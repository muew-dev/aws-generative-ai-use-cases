#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { getParams } from '../parameter';
import { GenerativeAiUseCasesStack } from '../lib/stacks/generative-ai-use-cases-stack';
import { TAG_KEY } from '../consts';

const app = new cdk.App();
const params = getParams(app);
if (params.tagValue) {
  cdk.Tags.of(app).add(TAG_KEY, params.tagValue, {
    // Exclude OpenSearchServerless Collection from tagging
    excludeResourceTypes: ['AWS::OpenSearchServerless::Collection'],
  });
}

new GenerativeAiUseCasesStack(app, 'GenerativeAiUseCasesStack', {
  params: params,
});
