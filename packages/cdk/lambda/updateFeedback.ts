import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateFeedbackRequest } from '../../types/src/index';
import { listMessages, updateFeedback } from './repository';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const chatId = event.pathParameters!.chatId!;
    const req: UpdateFeedbackRequest = JSON.parse(event.body!);
    const userId: string =
      event.requestContext.authorizer!.claims['cognito:username'];

    // 認可チェック: このメッセージがユーザーのチャットに属していることを確認
    const messages = await listMessages(chatId);

    // リクエストのcreatedDate（メッセージID）と一致するメッセージを検索
    const targetMessage = messages.find(
      (m) => m.createdDate === req.createdDate
    );

    // メッセージが存在しないか、ユーザーに属していない場合は403を返す
    if (!targetMessage || targetMessage.userId !== `user#${userId}`) {
      console.warn(
        `Authorization error: User ${userId} attempted to provide feedback on message ${req.createdDate} in chat ${chatId} belonging to another user`
      );
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message:
            'You do not have permission to provide feedback on this message.',
        }),
      };
    }

    const message = await updateFeedback(chatId, req);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
