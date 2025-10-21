import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

export interface EcsClusterL2Props {
  readonly vpc: ec2.IVpc;
  readonly clusterName: string;
  readonly containerInsights?: boolean;
}

/**
 * ECS Cluster L2 Construct
 * 基本的なECS Clusterのみの純粋なL2 Construct
 * Auto Scaling設定、Task Definition、ServiceやLog Groups管理は含まず
 */
export class EcsCluster extends Construct {
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: EcsClusterL2Props) {
    super(scope, id);

    // ECS Cluster作成（基本設定のみ）
    this.cluster = new ecs.Cluster(this, 'ECSCluster', {
      clusterName: props.clusterName,
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
      containerInsightsV2: props.containerInsights
        ? ecs.ContainerInsights.ENABLED
        : ecs.ContainerInsights.DISABLED, // Container Insights V2設定
    });
  }
}
