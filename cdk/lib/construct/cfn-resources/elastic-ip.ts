import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface ElasticIpProps {
  readonly name: string;
  readonly availabilityZone?: string;
  readonly environment?: string;
  readonly description?: string;
}

/**
 * Elastic IP L1 Construct
 * CloudFormation CfnEIP の薄いWrapper
 * Static IP割り当て用途の純粋な抽象化
 */
export class ElasticIp extends Construct {
  public readonly eip: ec2.CfnEIP;
  public readonly allocationId: string;
  public readonly publicIp: string;

  private readonly props: ElasticIpProps;

  constructor(scope: Construct, id: string, props: ElasticIpProps) {
    super(scope, id);
    this.props = props;

    // CloudFormation Elastic IP直接作成
    this.eip = new ec2.CfnEIP(this, 'EIP', {
      domain: 'vpc',
      tags: this.buildTags(),
    });

    // 属性値を外部参照可能にする
    this.allocationId = this.eip.attrAllocationId;
    this.publicIp = this.eip.ref;
  }

  /**
   * タグを構築
   */
  private buildTags(): cdk.CfnTag[] {
    const baseTags: cdk.CfnTag[] = [
      {
        key: 'Name',
        value: this.props.name,
      },
      {
        key: 'ManagedBy',
        value: 'CDK',
      },
    ];

    if (this.props.availabilityZone) {
      baseTags.push({
        key: 'AvailabilityZone',
        value: this.props.availabilityZone,
      });
    }

    if (this.props.environment) {
      baseTags.push({
        key: 'Environment',
        value: this.props.environment,
      });
    }

    if (this.props.description) {
      baseTags.push({
        key: 'Description',
        value: this.props.description,
      });
    }

    return baseTags;
  }

  /**
   * EIP ARNを取得
   */
  public getEipArn(): string {
    return `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:elastic-ip/${this.allocationId}`;
  }

  /**
   * パブリックIPアドレスを取得
   */
  public getPublicIp(): string {
    return this.publicIp;
  }

  /**
   * Allocation IDを取得（NAT Gateway等で使用）
   */
  public getAllocationId(): string {
    return this.allocationId;
  }

  /**
   * Route53 Aレコード用のIP文字列を取得
   */
  public getIpForRoute53(): string {
    return this.publicIp;
  }

  /**
   * EIPの詳細情報を取得
   */
  public getEipInfo(): {
    name: string;
    allocationId: string;
    publicIp: string;
    availabilityZone?: string;
    environment?: string;
    arn: string;
  } {
    return {
      name: this.props.name,
      allocationId: this.allocationId,
      publicIp: this.publicIp,
      availabilityZone: this.props.availabilityZone,
      environment: this.props.environment,
      arn: this.getEipArn(),
    };
  }

  /**
   * CloudFormation Outputとして情報を出力
   */
  public createOutputs(outputPrefix: string = ''): void {
    const prefix = outputPrefix ? `${outputPrefix}` : '';

    new cdk.CfnOutput(this, `${prefix}PublicIP`, {
      value: this.publicIp,
      description: `Public IP Address: ${this.props.name}`,
    });

    new cdk.CfnOutput(this, `${prefix}AllocationId`, {
      value: this.allocationId,
      description: `EIP Allocation ID: ${this.props.name}`,
    });

    if (this.props.availabilityZone) {
      new cdk.CfnOutput(this, `${prefix}AvailabilityZone`, {
        value: this.props.availabilityZone,
        description: `AZ for EIP: ${this.props.name}`,
      });
    }
  }

  /**
   * 複数のElastic IPを作成するヘルパーメソッド
   */
  public static createMultiple(
    scope: Construct,
    baseId: string,
    count: number,
    propsGenerator: (index: number) => ElasticIpProps
  ): ElasticIp[] {
    const eips: ElasticIp[] = [];

    for (let i = 0; i < count; i++) {
      const eip = new ElasticIp(scope, `${baseId}${i + 1}`, propsGenerator(i));
      eips.push(eip);
    }

    return eips;
  }
}

