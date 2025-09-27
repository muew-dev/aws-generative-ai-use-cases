const {
  OpenSearchServerlessClient,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} = require('@aws-sdk/client-opensearchserverless');

exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { collectionId, region, accountId, tag } = event.ResourceProperties;

    // 削除操作の場合はスキップ
    if (event.RequestType === 'Delete') {
      return await sendResponse(
        event,
        context,
        'SUCCESS',
        {},
        'ApplyTagsResource'
      );
    }

    // OpenSearch Serverlessクライアントを作成
    const ossClient = new OpenSearchServerlessClient({ region });
    const collectionArn = `arn:aws:aoss:${region}:${accountId}:collection/${collectionId}`;

    // タグを適用または削除する必要があるかチェック
    if (tag && tag.value) {
      console.log(
        `Applying tags to collection ${collectionId}: ${JSON.stringify(tag)}`
      );

      // タグを適用
      const command = new TagResourceCommand({
        resourceArn: collectionArn,
        tags: [tag],
      });

      const res = await ossClient.send(command);

      console.log(`response: ${JSON.stringify(res)}`);
      console.log(`Successfully applied tags to ${collectionArn}`);
    } else {
      // tagValueが設定されていない場合、タグが存在するかチェックして削除
      console.log(
        `Checking for existing tags on collection ${collectionId} with key ${tag.key}`
      );

      // まず、既存のタグを一覧取得
      const listTagsCommand = new ListTagsForResourceCommand({
        resourceArn: collectionArn,
      });

      const existingTags = await ossClient.send(listTagsCommand);
      console.log(`Existing tags: ${JSON.stringify(existingTags)}`);

      // 対象のタグキーが存在するかチェック
      const tagExists =
        existingTags.tags && existingTags.tags.some((t) => t.key === tag.key);

      if (tagExists) {
        console.log(
          `Removing tag with key ${tag.key} from collection ${collectionId}`
        );

        // タグを削除
        const untagCommand = new UntagResourceCommand({
          resourceArn: collectionArn,
          tagKeys: [tag.key],
        });

        const untagRes = await ossClient.send(untagCommand);
        console.log(`Untag response: ${JSON.stringify(untagRes)}`);
        console.log(
          `Successfully removed tag with key ${tag.key} from ${collectionArn}`
        );
      } else {
        console.log(
          `No tag with key ${tag.key} found on collection ${collectionId}`
        );
      }
    }

    return await sendResponse(
      event,
      context,
      'SUCCESS',
      {},
      'ApplyTagsResource'
    );
  } catch (error) {
    console.error('Error:', error);
    return await sendResponse(
      event,
      context,
      'FAILED',
      {},
      'ApplyTagsResource'
    );
  }
};

// CloudFormationにレスポンスを送信する関数
async function sendResponse(event, context, status, data, physicalId) {
  const responseBody = JSON.stringify({
    Status: status,
    Reason: `See CloudWatch Log Stream: ${context.logStreamName}`,
    PhysicalResourceId: physicalId || context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  });

  return await new Promise((resolve, reject) => {
    const https = require('https');
    const url = require('url');
    const parsedUrl = url.parse(event.ResponseURL);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'PUT',
      headers: {
        'Content-Type': '',
        'Content-Length': responseBody.length,
      },
    };

    const request = https.request(options, (response) => {
      console.log(`Status code: ${response.statusCode}`);
      resolve();
    });

    request.on('error', (error) => {
      console.log('send() error:', error);
      resolve(); // Still resolve to avoid CF waiting
    });

    request.write(responseBody);
    request.end();
  });
}
