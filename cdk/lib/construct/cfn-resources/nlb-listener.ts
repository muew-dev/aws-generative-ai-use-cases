import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface NlbListenerProps {
  readonly loadBalancerArn: string;
  readonly port: number;
  readonly protocol: 'TCP' | 'TLS' | 'UDP' | 'TCP_UDP';
  readonly targetGroupArn: string;
  readonly description?: string;
}

export interface NlbTargetGroupProps {
  readonly name: string;
  readonly port: number;
  readonly protocol: 'TCP' | 'TLS' | 'UDP' | 'TCP_UDP';
  readonly vpcId: string;
  readonly targetType: 'instance' | 'ip' | 'lambda' | 'alb';
  readonly targets: Array<{
    id: string;
    port: number;
  }>;
  readonly healthCheck?: {
    enabled: boolean;
    protocol: 'TCP' | 'HTTP' | 'HTTPS';
    port?: string;
    healthyThresholdCount?: number;
    unhealthyThresholdCount?: number;
    intervalSeconds?: number;
    timeoutSeconds?: number;
    path?: string; // HTTP/HTTPS用
  };
}

/**
 * NLB Target Group L1 Construct
 * CloudFormation CfnTargetGroup の薄いWrapper（NLB専用）
 */
export class NlbTargetGroup extends Construct {
  public readonly targetGroup: elbv2.CfnTargetGroup;
  public readonly targetGroupArn: string;

  private readonly props: NlbTargetGroupProps;

  constructor(scope: Construct, id: string, props: NlbTargetGroupProps) {
    super(scope, id);
    this.props = props;

    // CloudFormation Target Group直接作成
    this.targetGroup = new elbv2.CfnTargetGroup(this, 'TargetGroup', {
      name: props.name,
      port: props.port,
      protocol: props.protocol,
      vpcId: props.vpcId,
      targetType: props.targetType,
      targets: props.targets,
      healthCheckEnabled: props.healthCheck?.enabled ?? true,
      healthCheckProtocol: props.healthCheck?.protocol ?? 'TCP',
      healthCheckPort: props.healthCheck?.port,
      healthyThresholdCount: props.healthCheck?.healthyThresholdCount ?? 2,
      unhealthyThresholdCount: props.healthCheck?.unhealthyThresholdCount ?? 2,
      healthCheckIntervalSeconds: props.healthCheck?.intervalSeconds ?? 30,
      healthCheckTimeoutSeconds: props.healthCheck?.timeoutSeconds,
      healthCheckPath: props.healthCheck?.path, // HTTP/HTTPS用
      tags: [
        {
          key: 'Name',
          value: props.name,
        },
        {
          key: 'ManagedBy',
          value: 'CDK',
        },
        {
          key: 'TargetType',
          value: props.targetType,
        },
      ],
    });

    this.targetGroupArn = this.targetGroup.ref;
  }

  /**
   * Target Group ARNを取得
   */
  public getTargetGroupArn(): string {
    return this.targetGroupArn;
  }

  /**
   * Target Group名を取得
   */
  public getTargetGroupName(): string {
    return this.props.name;
  }

  /**
   * Target Group情報を取得
   */
  public getTargetGroupInfo(): {
    name: string;
    arn: string;
    port: number;
    protocol: string;
    targetType: string;
    targetCount: number;
  } {
    return {
      name: this.props.name,
      arn: this.targetGroupArn,
      port: this.props.port,
      protocol: this.props.protocol,
      targetType: this.props.targetType,
      targetCount: this.props.targets.length,
    };
  }
}

/**
 * NLB Listener L1 Construct
 * CloudFormation CfnListener の薄いWrapper（NLB専用）
 */
export class NlbListener extends Construct {
  public readonly listener: elbv2.CfnListener;
  public readonly listenerArn: string;

  private readonly props: NlbListenerProps;

  constructor(scope: Construct, id: string, props: NlbListenerProps) {
    super(scope, id);
    this.props = props;

    // CloudFormation Listener直接作成
    this.listener = new elbv2.CfnListener(this, 'Listener', {
      loadBalancerArn: props.loadBalancerArn,
      port: props.port,
      protocol: props.protocol,
      defaultActions: [
        {
          type: 'forward',
          targetGroupArn: props.targetGroupArn,
        },
      ],
    });

    // タグをCDKレベルで設定
    cdk.Tags.of(this.listener).add('Name', `nlb-listener-${props.port}`);
    cdk.Tags.of(this.listener).add('ManagedBy', 'CDK');
    cdk.Tags.of(this.listener).add('Protocol', props.protocol);
    cdk.Tags.of(this.listener).add('Port', props.port.toString());

    this.listenerArn = this.listener.ref;
  }

  /**
   * Listener ARNを取得
   */
  public getListenerArn(): string {
    return this.listenerArn;
  }

  /**
   * Listenerポートを取得
   */
  public getPort(): number {
    return this.props.port;
  }

  /**
   * Listenerプロトコルを取得
   */
  public getProtocol(): string {
    return this.props.protocol;
  }

  /**
   * Listener情報を取得
   */
  public getListenerInfo(): {
    arn: string;
    port: number;
    protocol: string;
    loadBalancerArn: string;
    targetGroupArn: string;
  } {
    return {
      arn: this.listenerArn,
      port: this.props.port,
      protocol: this.props.protocol,
      loadBalancerArn: this.props.loadBalancerArn,
      targetGroupArn: this.props.targetGroupArn,
    };
  }

  /**
   * CloudFormation Outputとして情報を出力
   */
  public createOutputs(outputPrefix: string = ''): void {
    const prefix = outputPrefix ? `${outputPrefix}` : '';

    new cdk.CfnOutput(this, `${prefix}ListenerArn`, {
      value: this.listenerArn,
      description: `NLB Listener ARN (Port ${this.props.port})`,
    });

    new cdk.CfnOutput(this, `${prefix}Port`, {
      value: this.props.port.toString(),
      description: `NLB Listener Port`,
    });

    new cdk.CfnOutput(this, `${prefix}Protocol`, {
      value: this.props.protocol,
      description: `NLB Listener Protocol`,
    });
  }
}

/**
 * NLB ALB連携用のL1 Constructsファクトリー
 * TLS Passtroughパターン専用
 */
export class NlbAlbIntegration extends Construct {
  public readonly targetGroup: NlbTargetGroup;
  public readonly listener: NlbListener;

  constructor(
    scope: Construct,
    id: string,
    props: {
      nlbArn: string;
      albArn: string;
      vpcId: string;
      targetGroupName: string;
      port?: number;
    }
  ) {
    super(scope, id);

    const port = props.port ?? 443;

    // ALBをターゲットとするTarget Group作成
    this.targetGroup = new NlbTargetGroup(this, 'TargetGroup', {
      name: props.targetGroupName,
      port: port,
      protocol: 'TCP',
      vpcId: props.vpcId,
      targetType: 'alb',
      targets: [
        {
          id: props.albArn,
          port: port,
        },
      ],
      healthCheck: {
        enabled: true,
        protocol: 'TCP',
        port: port.toString(),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        intervalSeconds: 30,
      },
    });

    // TCP Listenerを作成（TLS Passthrough）
    this.listener = new NlbListener(this, 'Listener', {
      loadBalancerArn: props.nlbArn,
      port: port,
      protocol: 'TCP',
      targetGroupArn: this.targetGroup.getTargetGroupArn(),
      description: `NLB to ALB TLS Passthrough (Port ${port})`,
    });
  }

  /**
   * 統合情報を取得
   */
  public getIntegrationInfo(): {
    targetGroup: {
      name: string;
      arn: string;
    };
    listener: {
      arn: string;
      port: number;
      protocol: string;
    };
  } {
    return {
      targetGroup: {
        name: this.targetGroup.getTargetGroupName(),
        arn: this.targetGroup.getTargetGroupArn(),
      },
      listener: {
        arn: this.listener.getListenerArn(),
        port: this.listener.getPort(),
        protocol: this.listener.getProtocol(),
      },
    };
  }
}

