import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Validates a positive decimal amount supplied as a string or number.
// - Up to `maxDecimals` fractional digits (default 18, covers crypto assets).
// - Strictly greater than zero.
// - Rejects exponential notation and non-numeric input.
// Values are converted with Prisma.Decimal (never floats) in the service layer.
@ValidatorConstraint({ name: 'isDecimalAmount', async: false })
class IsDecimalAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const maxDecimals = (args.constraints[0] as number | undefined) ?? 18;
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    const text = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(text)) return false;
    const [, fraction = ''] = text.split('.');
    if (fraction.length > maxDecimals) return false;
    return Number(text) > 0;
  }

  defaultMessage(args: ValidationArguments): string {
    const maxDecimals = (args.constraints[0] as number | undefined) ?? 18;
    return `${args.property} must be a positive decimal number with at most ${maxDecimals} decimal places`;
  }
}

export function IsDecimalAmount(
  maxDecimals = 18,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDecimalAmount',
      target: object.constructor,
      propertyName,
      constraints: [maxDecimals],
      options: validationOptions,
      validator: IsDecimalAmountConstraint,
    });
  };
}
