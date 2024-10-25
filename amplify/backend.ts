import path from 'path';
import { fileURLToPath } from 'url';

import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import {
  data,
  invokeBedrockAgentFunction,
  getStructuredOutputFromLangchainFunction,
  productionAgentFunction,
  dummyFunction
  // convertPdfToImagesAndAddMessagesFunction
} from './data/resource';
import { storage } from './storage/resource';

import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as appsync from 'aws-cdk-lib/aws-appsync';

import { productionAgentBuilder } from "./custom/productionAgent"

const resourceTags = {
  Project: 'agents-for-energy',
  Environment: 'dev',
}

const backend = defineBackend({
  auth,
  data,
  storage,
  invokeBedrockAgentFunction,
  getStructuredOutputFromLangchainFunction,
  productionAgentFunction,
  dummyFunction

  // convertPdfToImagesAndAddMessagesFunction
});

backend.addOutput({
  custom: {
    api_id: backend.data.resources.graphqlApi.apiId,
  },
});

const bedrockRuntimeDataSource = backend.data.resources.graphqlApi.addHttpDataSource(
  "bedrockRuntimeDS",
  `https://bedrock-runtime.${backend.auth.stack.region}.amazonaws.com`,
  {
    authorizationConfig: {
      signingRegion: backend.auth.stack.region,
      signingServiceName: "bedrock",
    },
  }
);

const bedrockAgentDataSource = backend.data.resources.graphqlApi.addHttpDataSource(
  "bedrockAgentDS",
  `https://bedrock-agent.${backend.auth.stack.region}.amazonaws.com`,
  {
    authorizationConfig: {
      signingRegion: backend.auth.stack.region,
      signingServiceName: "bedrock",
    },
  }
);

const bedrockAgentRuntimeDataSource = backend.data.resources.graphqlApi.addHttpDataSource(
  "bedrockAgentRuntimeDS",
  `https://bedrock-agent-runtime.${backend.auth.stack.region}.amazonaws.com`,
  {
    authorizationConfig: {
      signingRegion: backend.auth.stack.region,
      signingServiceName: "bedrock",
    },
  }
);


const noneDS = backend.data.resources.graphqlApi.addNoneDataSource(
  "noneDS"
);

bedrockRuntimeDataSource.grantPrincipal.addToPrincipalPolicy(
  new iam.PolicyStatement({
    resources: [
      `arn:aws:bedrock:${backend.auth.stack.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
    ],
    actions: ["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],
  })
);

bedrockAgentDataSource.grantPrincipal.addToPrincipalPolicy(
  new iam.PolicyStatement({
    resources: [
      `arn:aws:bedrock:${backend.auth.stack.region}:${backend.auth.stack.account}:*`,
    ],
    actions: [
      "bedrock:ListAgents",
      "bedrock:ListAgentAliases"
    ],
  })
);

bedrockAgentRuntimeDataSource.grantPrincipal.addToPrincipalPolicy(
  new iam.PolicyStatement({
    resources: [
      `arn:aws:bedrock:${backend.auth.stack.region}:${backend.auth.stack.account}:agent-alias/*`,
    ],
    actions: [
      "bedrock:InvokeAgent",
    ],

  })
);

backend.invokeBedrockAgentFunction.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    resources: [
      `arn:aws:bedrock:${backend.auth.stack.region}:${backend.auth.stack.account}:agent-alias/*`,
    ],
    actions: [
      "bedrock:InvokeAgent",
    ],
  }
  )
)

backend.getStructuredOutputFromLangchainFunction.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    resources: [
      `arn:aws:bedrock:${backend.auth.stack.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
      `arn:aws:bedrock:${backend.auth.stack.region}::foundation-model/*`,
    ],
    actions: ["bedrock:InvokeModel"],

  })
)

function applyTagsToRootStack(targetStack: cdk.Stack) {
  const rootStack = cdk.Stack.of(targetStack).nestedStackParent
  if (!rootStack) throw new Error('Root stack not found')
  //Apply tags to all the nested stacks
  Object.entries(resourceTags).map(([key, value]) => {
    cdk.Tags.of(rootStack).add(key, value)
  })
  cdk.Tags.of(rootStack).add('rootStackName', rootStack.stackName)
}

const customStack = backend.createStack('customStack')
applyTagsToRootStack(customStack)

//Deploy the test data to the s3 bucket
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
new s3Deployment.BucketDeployment(customStack, 'test-file-deployment', {
  sources: [s3Deployment.Source.asset(path.join(rootDir, 'testData'))],
  destinationBucket: backend.storage.resources.bucket,
  // destinationKeyPrefix: '/'
});

const { queryImagesStateMachineArn, getInfoFromPdfFunction, convertPdfToJsonFunction } = productionAgentBuilder(customStack, {
  s3BucketName: backend.storage.resources.bucket.bucketName
})

backend.productionAgentFunction.addEnvironment('DATA_BUCKET_NAME', backend.storage.resources.bucket.bucketName)
backend.productionAgentFunction.addEnvironment('STEP_FUNCTION_ARN', queryImagesStateMachineArn)
backend.productionAgentFunction.addEnvironment('CONVERT_PDF_TO_JSON_LAMBDA_ARN', convertPdfToJsonFunction.functionArn)
// if (backend.data.apiKey) backend.productionAgentFunction.addEnvironment('API_KEY',backend.data.apiKey)

backend.productionAgentFunction.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],
    resources: [
      `arn:aws:bedrock:${backend.auth.stack.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
      `arn:aws:bedrock:${backend.auth.stack.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
      `arn:aws:bedrock:${backend.auth.stack.region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`
    ],
  })
)

backend.productionAgentFunction.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["states:StartSyncExecution"],
    resources: [queryImagesStateMachineArn],
  })
)

backend.productionAgentFunction.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["s3:GetObject"],
    resources: [
      `arn:aws:s3:::${backend.storage.resources.bucket.bucketName}/*`
    ],
  }),
)

backend.productionAgentFunction.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["lambda:InvokeFunction"],
    resources: [
      convertPdfToJsonFunction.functionArn
    ],
  }),
)

//Create data sources and resolvers for the lambdas created in the production agent stack
const convertPdfToImageDS = backend.data.addLambdaDataSource(
  'convertPdfToImageDS',
  getInfoFromPdfFunction
)

convertPdfToImageDS.createResolver(
  'getInfoFromPdfResolver',
  {
    typeName: 'Query',
    fieldName: 'getInfoFromPdf'
  }
)

const convertPdfToJsonFunctionDS = backend.data.addLambdaDataSource(
  'convertPdfToImagesFunctionDS',
  convertPdfToJsonFunction
)

convertPdfToJsonFunctionDS.createResolver(
  'convertPdfToJsonFunctionResolver',
  {
    typeName: 'Query',
    fieldName: 'convertPdfToJson',
  }
)

// new appsync.Resolver(customStack, 'publishResponseStreamChunkResolver', {
//   api: backend.data.resources.graphqlApi,
//   typeName: 'Query',
//   fieldName: 'listBedrockAgents',
//   code: appsync.Code.fromAsset(path.join(rootDir, 'amplify/data/listBedrockAgents.js')),
//   runtime: appsync.FunctionRuntime.JS_1_0_0
// })

// noneDS.createResolver(
//   'updatedResolver',
//   {
//     typeName: 'Mutation',
//     fieldName: 'publishResponseStreamChunk'
//   }
// )


// if (backend.productionAgentFunction.resources.lambda.role) convertPdfToYAMLFunction.grantInvoke(backend.productionAgentFunction.resources.lambda.role)

// //Set the lambda layers so the function can convert pdfs into images
// backend.productionAgentFunction.resources.cfnResources.cfnFunction.layers = [
//   ghostScriptLayer.layerVersionArn,
//   imageMagickLayer.layerVersionArn
// ]
