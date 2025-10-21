// Lambda@Edge + CloudFront + Cognito認証チェック機能

export interface AuthUser {
  userId: string;
  email?: string;
  displayName?: string;
  authType?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
}

// Lambda@Edge認証状態チェック
export async function checkCognitoAuth(): Promise<AuthState> {
  // ローカル開発環境の場合は認証スキップ
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
    return {
      isAuthenticated: true,
      user: {
        userId: process.env.NEXT_PUBLIC_DEV_USER_ID || 'dev-user-123',
        email: process.env.NEXT_PUBLIC_DEV_USER_EMAIL || 'dev@example.com',
        displayName: 'Development User',
        authType: 'development',
      },
      loading: false,
    };
  }

  // Lambda@Edge方式では、フロントエンドが表示される時点で認証済み確定
  // 未認証ユーザーはLambda@EdgeでCognitoログイン画面にリダイレクトされる
  return {
    isAuthenticated: true,
    user: {
      userId: 'lambda-edge-user', // 実際のユーザー情報はバックエンドAPIで取得
      email: 'user@example.com', // バックエンドがLambda@Edgeヘッダーから取得
      displayName: 'Authenticated User',
      authType: 'lambda-edge',
    },
    loading: false,
  };
}

// Lambda@Edge + Cognitoログアウト
export function logout(): void {
  // ローカル開発環境では何もしない
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
    window.location.reload();
    return;
  }

  // Lambda@Edgeのログアウトエンドポイントにリダイレクト
  // Lambda@Edgeが認証Cookieを削除してCognitoログアウトURLにリダイレクト
  window.location.href = '/logout';
}

// Lambda@Edge + Cognitoログイン
export function login(): void {
  // ローカル開発環境では何もしない
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
    window.location.reload();
    return;
  }

  // 任意のパスにアクセスすれば、Lambda@Edgeが認証チェックして
  // 未認証の場合は自動的にCognitoログインにリダイレクトする
  // 現在のページのパスを保存して認証後に戻る
  const currentPath = window.location.pathname + window.location.search;

  // Lambda@Edgeがstateパラメータで元のパスを保存してログイン画面にリダイレクト
  window.location.href = currentPath;
}
