import { Construct } from 'constructs';
import { aws_bedrock as bedrock, Lazy, Names } from 'aws-cdk-lib';

export class Guardrail extends Construct {
  public readonly guardrailIdentifier: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const suffix = Lazy.string({ produce: () => Names.uniqueId(this) });

    const cfnGuardrail = new bedrock.CfnGuardrail(this, `guardrail`, {
      blockedInputMessaging:
        'Detected blocked input. Please start the conversation from the beginning or contact the administrator.',
      blockedOutputsMessaging:
        'Detected output that is prohibited. Please start the conversation from the beginning or contact the administrator.',
      name: `Guardrail-${suffix}`,
      sensitiveInformationPolicyConfig: {
        // NAME、DRIVER_IDは日本では機能しないため設定しない
        // CA_*、US_*、UK_*は国固有のため設定しない
        piiEntitiesConfig: [
          { action: 'BLOCK', type: 'AGE' },
          { action: 'BLOCK', type: 'AWS_ACCESS_KEY' },
          { action: 'BLOCK', type: 'AWS_SECRET_KEY' },
          { action: 'BLOCK', type: 'CREDIT_DEBIT_CARD_CVV' },
          { action: 'BLOCK', type: 'CREDIT_DEBIT_CARD_EXPIRY' },
          { action: 'BLOCK', type: 'CREDIT_DEBIT_CARD_NUMBER' },
          { action: 'BLOCK', type: 'EMAIL' },
          { action: 'BLOCK', type: 'INTERNATIONAL_BANK_ACCOUNT_NUMBER' },
          { action: 'BLOCK', type: 'IP_ADDRESS' },
          { action: 'BLOCK', type: 'LICENSE_PLATE' },
          { action: 'BLOCK', type: 'MAC_ADDRESS' },
          { action: 'BLOCK', type: 'PASSWORD' },
          { action: 'BLOCK', type: 'PHONE' },
          { action: 'BLOCK', type: 'PIN' },
          { action: 'BLOCK', type: 'SWIFT_CODE' },
          { action: 'BLOCK', type: 'URL' },
          { action: 'BLOCK', type: 'USERNAME' },
        ],
      },
    });

    this.guardrailIdentifier = cfnGuardrail.attrGuardrailId;
  }
}
