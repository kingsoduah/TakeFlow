import {
  IsIn,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  ACCEPTED_PAIRS_TEXT,
  isAcceptedPaymentPair,
  PRICE_CURRENCIES,
} from './catalog.js';

export function IsPriceCurrency(validationOptions?: ValidationOptions) {
  return IsIn(PRICE_CURRENCIES as unknown as string[], {
    message: `$property must be one of ${PRICE_CURRENCIES.join(', ')}`,
    ...validationOptions,
  });
}

// Put on the `network` property. Checks the coin and network together
// against the accepted pairs, reading `cryptoAsset` from the same object.
@ValidatorConstraint({ name: 'isAcceptedPaymentPair', async: false })
class IsAcceptedPaymentPairConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const cryptoAsset = (args.object as Record<string, unknown>).cryptoAsset;
    return isAcceptedPaymentPair(cryptoAsset, value);
  }

  defaultMessage(): string {
    return `cryptoAsset and network must be one of: ${ACCEPTED_PAIRS_TEXT}`;
  }
}

export function IsAcceptedPaymentPair(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAcceptedPaymentPair',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsAcceptedPaymentPairConstraint,
    });
  };
}
