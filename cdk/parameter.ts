import { Constants, Environment, EnvironmentType } from './lib/constants';

/**
 * アプリケーション パラメータ定義
 */
export interface AppParameters {
  readonly environment: EnvironmentType;
  readonly stackName: string;
  readonly enableSelfSignUp: boolean;
  readonly hostedZoneId: string;
  readonly domain: string;
  readonly ecsAutoScaling: {
    readonly minCapacity: number;
    readonly maxCapacity: number;
    readonly targetCpuUtilization: number;
    readonly scaleInCooldownMinutes: number;
    readonly scaleOutCooldownMinutes: number;
  };
}

/**
 * 環境別設定（直接設定値）
 */
const environmentConfigs: Record<EnvironmentType, AppParameters> = {
  [Environment.DEV]: {
    environment: Environment.DEV,
    stackName: `${Constants.PROJECT_NAME}-${Environment.DEV}`,
    enableSelfSignUp: true,
    hostedZoneId: 'Z06924452U2Z12SVXR7YX', // 実際のgenu.muew.devのHosted Zone ID
    domain: 'genu.muew.dev',
    ecsAutoScaling: {
      minCapacity: 1,
      maxCapacity: 4,
      targetCpuUtilization: 70,
      scaleInCooldownMinutes: 5,
      scaleOutCooldownMinutes: 2,
    },
  },
  [Environment.PROD]: {
    environment: Environment.PROD,
    stackName: `${Constants.PROJECT_NAME}-${Environment.PROD}`,
    enableSelfSignUp: false,
    hostedZoneId: 'Z_PROD_PLACEHOLDER', // 本番用はTBD
    domain: 'prod.example.com', // 本番用ドメインTBD
    ecsAutoScaling: {
      minCapacity: 2,
      maxCapacity: 10,
      targetCpuUtilization: 70,
      scaleInCooldownMinutes: 5,
      scaleOutCooldownMinutes: 2,
    },
  },
};

/**
 * パラメータを取得（環境とパスは直接指定）
 */
export function getAppParameters(
  environment: EnvironmentType = Environment.DEV
): AppParameters {
  if (!Object.values(Environment).includes(environment)) {
    throw new Error(
      `Invalid environment: ${environment}. Must be one of: ${Object.values(Environment).join(', ')}`
    );
  }

  const baseConfig = environmentConfigs[environment];

  return {
    ...baseConfig,
  };
}
