import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvironmentType, S3Config } from '../../constants';

export interface S3RagDocumentBucketProps {
  readonly bucketName: string;
  readonly environment: EnvironmentType;
}

/**
 * S3 Bucket for RAG Document Storage
 * Bedrock Knowledge Base用の文書アップロード先バケット
 */
export class S3RagDocumentBucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3RagDocumentBucketProps) {
    super(scope, id);

    // RAG文書保存用S3バケット
    this.bucket = new s3.Bucket(this, 'RagDocumentBucket', {
      bucketName: props.bucketName,
      
      // セキュリティ設定
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      
      // バージョニング設定（全環境で無効化）
      versioned: false,
      
      // ライフサイクル管理（RAG用途はシンプルに）
      lifecycleRules: [
        {
          id: 'delete-incomplete-multipart-uploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      
      // 削除設定（全環境統一）
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 全環境で削除
      autoDeleteObjects: true, // 全環境でオブジェクト自動削除
      
      // CORS設定（フロントエンドからのアップロード用）
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'], // 本番では適切なドメインに制限
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      
      // 通知設定（将来の拡張用）
      eventBridgeEnabled: true,
    });


    // タグ設定
    cdk.Tags.of(this).add('Purpose', 'RAG-Documents');
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Service', 'Bedrock-Knowledge-Base');
  }

  /**
   * バケット名を取得
   */
  public getBucketName(): string {
    return this.bucket.bucketName;
  }

  /**
   * バケットARNを取得
   */
  public getBucketArn(): string {
    return this.bucket.bucketArn;
  }

  /**
   * 文書アップロード用プレフィックス取得
   */
  public getDocumentsPrefix(): string {
    return S3Config.DOCUMENTS_PREFIX;
  }
}