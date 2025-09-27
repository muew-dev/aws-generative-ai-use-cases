import bedrockApi from './bedrockApi';
// import bedrockAgentApi from './bedrockAgentApi'; // LocalStackでは使用しない
// import bedrockKbApi from './bedrockKbApi'; // LocalStackでは使用しない
import sagemakerApi from './sagemakerApi';

const api = {
  bedrock: bedrockApi,
  // bedrockAgent: bedrockAgentApi, // LocalStackでは使用しない
  // bedrockKb: bedrockKbApi, // LocalStackでは使用しない
  sagemaker: sagemakerApi,
};

export default api;
