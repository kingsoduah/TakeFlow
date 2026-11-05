import { BadRequestException } from '@nestjs/common';
import {
  ACCEPTED_PAIRS_TEXT,
  isAcceptedPaymentPair,
  isPriceCurrency,
  PRICE_CURRENCIES,
} from './catalog.js';

// Service-level copy of the DTO checks (design doc 5.4 and 5.5), so a caller
// that skips the validation pipe still cannot store an unsupported price.
export function assertPriceable(currency: string, cryptoAsset: string, network: string) {
  if (!isPriceCurrency(currency)) {
    throw new BadRequestException(`currency must be one of ${PRICE_CURRENCIES.join(', ')}`);
  }
  if (!isAcceptedPaymentPair(cryptoAsset, network)) {
    throw new BadRequestException(
      `cryptoAsset and network must be one of: ${ACCEPTED_PAIRS_TEXT}`,
    );
  }
}
