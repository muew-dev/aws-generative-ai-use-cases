import { aggregateTokenUsage } from './repository';
import { GetTokenUsageEvent } from '../../types/src/index';

export const handler = async (event: GetTokenUsageEvent) => {
  try {
    console.log('Getting token usage statistics', { event });

    // CognitoからユーザーIDを取得
    const userId = event.requestContext.authorizer!.claims['cognito:username'];
    const { startDate, endDate } = event.queryStringParameters || {};

    if (!startDate || !endDate) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message: 'startDate and endDate parameters are required',
        }),
      };
    }

    // 指定された期間の集計データを取得
    const stats = await aggregateTokenUsage(startDate, endDate, [userId]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(stats),
    };
  } catch (error) {
    console.error('Error getting token usage statistics:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
