#!/usr/bin/env python3
"""
Bedrock 接続テスト用のシンプルなPythonスクリプト
"""

import json
import os
import time

import boto3
from botocore.exceptions import ClientError, NoCredentialsError


def test_aws_credentials():
    """AWS認証情報の確認"""
    try:
        # STSクライアントでアイデンティティ確認
        sts_client = boto3.client("sts", region_name="ap-northeast-1")
        identity = sts_client.get_caller_identity()

        print("✅ AWS認証情報確認成功:")
        print(f"   Account ID: {identity.get('Account')}")
        print(f"   User ARN: {identity.get('Arn')}")
        print(f"   User ID: {identity.get('UserId')}")
        return True
    except NoCredentialsError:
        print("❌ AWS認証情報が設定されていません")
        return False
    except ClientError as e:
        print(f"❌ AWS認証情報確認失敗: {e}")
        return False


def list_bedrock_models():
    """利用可能なBedrockモデル一覧を取得"""
    try:
        bedrock = boto3.client("bedrock", region_name="ap-northeast-1")
        response = bedrock.list_foundation_models()

        print("✅ Bedrockモデル一覧取得成功:")

        # Claude系のモデルのみ表示
        claude_models = [
            model
            for model in response["modelSummaries"]
            if "anthropic" in model.get("providerName", "").lower()
        ]

        for model in claude_models[:5]:  # 最初の5つのみ表示
            print(f"   - {model['modelId']}: {model['modelName']}")

        return claude_models
    except ClientError as e:
        print(f"❌ Bedrockモデル一覧取得失敗: {e}")
        return None


def test_claude_invoke():
    """Claude 3.5 Sonnetでテキスト生成テスト"""
    try:
        bedrock_runtime = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

        # Claude 3.5 Sonnet v1を使用 (on-demand対応)
        model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"

        # リクエストペイロード
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 100,
            "messages": [
                {
                    "role": "user",
                    "content": "Hello, can you respond with a simple greeting in Japanese?",
                }
            ],
        }

        print(f"🔄 Claude呼び出し開始 (モデル: {model_id})")
        start_time = time.time()

        response = bedrock_runtime.invoke_model(
            modelId=model_id, body=json.dumps(body), contentType="application/json"
        )

        end_time = time.time()
        response_body = json.loads(response["body"].read())

        print("✅ Claude呼び出し成功:")
        print(f"   レスポンス時間: {end_time - start_time:.2f}秒")
        print(f"   生成テキスト: {response_body['content'][0]['text']}")
        print(f"   使用トークン: {response_body.get('usage', {})}")

        return True
    except ClientError as e:
        print(f"❌ Claude呼び出し失敗: {e}")
        return False


def test_claude_streaming():
    """Claude ストリーミングテスト"""
    try:
        bedrock_runtime = boto3.client("bedrock-runtime", region_name="ap-northeast-1")

        model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 150,
            "messages": [
                {
                    "role": "user",
                    "content": "Count from 1 to 10 in Japanese with explanations.",
                }
            ],
        }

        print("🔄 Claude ストリーミング開始")

        response = bedrock_runtime.invoke_model_with_response_stream(
            modelId=model_id, body=json.dumps(body), contentType="application/json"
        )

        print("✅ Claudeストリーミング成功:")
        print("   リアルタイム出力:")

        full_response = ""
        for event in response["body"]:
            chunk = json.loads(event["chunk"]["bytes"].decode())

            if chunk["type"] == "content_block_delta":
                if "text" in chunk["delta"]:
                    text = chunk["delta"]["text"]
                    print(text, end="", flush=True)
                    full_response += text
            elif chunk["type"] == "message_stop":
                break

        print(f"\n   完全なレスポンス: {len(full_response)}文字")
        return True

    except ClientError as e:
        print(f"❌ Claude ストリーミング失敗: {e}")
        return False


def main():
    """メイン処理"""
    print("🚀 Bedrock接続テスト開始")
    print("=" * 50)

    # 環境変数確認
    aws_profile = os.getenv("AWS_PROFILE", "default")
    print(f"📋 使用中のAWSプロファイル: {aws_profile}")
    print("")

    # 1. AWS認証情報確認
    print("1️⃣ AWS認証情報テスト")
    if not test_aws_credentials():
        return False
    print("")

    # 2. Bedrockモデル一覧取得
    print("2️⃣ Bedrockモデル一覧テスト")
    models = list_bedrock_models()
    if not models:
        return False
    print("")

    # 3. Claudeストリーミングテスト（単独実行）
    print("3️⃣ Claudeストリーミングテスト")
    if not test_claude_streaming():
        return False
    print("")

    print("🎉 すべてのテスト完了！Bedrock接続が正常に動作しています。")
    return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
