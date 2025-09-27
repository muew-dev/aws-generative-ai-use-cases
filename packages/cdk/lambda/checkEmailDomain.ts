import { PreSignUpTriggerEvent, Context, Callback } from 'aws-lambda';

const ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR =
  process.env.ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR;
const ALLOWED_SIGN_UP_EMAIL_DOMAINS: string[] = JSON.parse(
  ALLOWED_SIGN_UP_EMAIL_DOMAINS_STR!
);

// メールドメインが許可されているかを判定
const checkEmailDomain = (email: string): boolean => {
  // メールアドレス内の@の数が1つでない場合は常に拒否
  if (email.split('@').length !== 2) {
    return false;
  }

  // メールアドレスのドメイン部分が許可されたドメインのいずれかと一致する場合は許可
  // そうでなければ許可しない
  // （ALLOWED_SIGN_UP_EMAIL_DOMAINSが空の場合は常に許可）
  const domain = email.split('@')[1];
  return ALLOWED_SIGN_UP_EMAIL_DOMAINS.includes(domain);
};

/**
 * Cognito Pre Sign-up Lambda Trigger.
 *
 * @param event - The event from Cognito.
 * @param context - The Lambda execution context.
 * @param callback - The callback function to return data or error.
 */
exports.handler = async (
  event: PreSignUpTriggerEvent,
  context: Context,
  callback: Callback
) => {
  try {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const isAllowed = checkEmailDomain(event.request.userAttributes.email);
    if (isAllowed) {
      // 成功した場合、イベントオブジェクトをそのまま返す
      callback(null, event);
    } else {
      // 失敗した場合、エラーメッセージを返す
      callback(new Error('Invalid email domain'));
    }
  } catch (error) {
    console.log('Error ocurred:', error);
    // エラーがErrorのインスタンスかチェックし、適切なエラーメッセージを返す
    if (error instanceof Error) {
      callback(error);
    } else {
      // エラーがErrorのインスタンスでない場合、一般的なエラーメッセージを返す
      callback(new Error('An unknown error occurred.'));
    }
  }
};
