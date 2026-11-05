import { isPriceCurrency, PriceCurrency } from './catalog.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const DEFAULT_DISPLAY_CURRENCY: PriceCurrency = 'USD';

// A user's dashboard currency (design doc 5.8): the one they saved, else the
// currency of the first invoice or checkout across their businesses, else
// USD. It only changes what that user sees.
export async function resolveDisplayCurrency(
  prisma: PrismaService,
  userId: string,
  saved?: string | null,
): Promise<PriceCurrency> {
  let choice = saved;
  if (choice === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayCurrency: true },
    });
    choice = user?.displayCurrency ?? null;
  }
  if (isPriceCurrency(choice)) return choice;

  const first = await prisma.invoice.findFirst({
    where: { business: { ownerId: userId } },
    orderBy: { createdAt: 'asc' },
    select: { currency: true },
  });
  return first && isPriceCurrency(first.currency) ? first.currency : DEFAULT_DISPLAY_CURRENCY;
}
