-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CHECKOUT');

-- CreateEnum
CREATE TYPE "ValuationMethod" AS ENUM ('QUOTE', 'ARRIVAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayCurrency" TEXT;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "quoteWindowMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "shortfallToleranceBps" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountOverpaid" DECIMAL(30,18) NOT NULL DEFAULT 0,
ADD COLUMN     "buyerEmail" TEXT,
ADD COLUMN     "buyerName" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "externalOrderId" TEXT,
ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "productLinkId" TEXT,
ADD COLUMN     "returnUrl" TEXT,
ADD COLUMN     "shortfallToleranceBps" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "depositedAt" TIMESTAMP(3),
ADD COLUMN     "quoteId" TEXT,
ADD COLUMN     "rateSnapshotId" TEXT,
ADD COLUMN     "valuationMethod" "ValuationMethod",
ADD COLUMN     "valuationRate" DECIMAL(30,18),
ADD COLUMN     "valueAmount" DECIMAL(30,18),
ADD COLUMN     "valueCurrency" TEXT,
ADD COLUMN     "valuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductLink" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(30,18) NOT NULL,
    "currency" TEXT NOT NULL,
    "cryptoAsset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "returnUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateSnapshot" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'roqqu',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fiatRates" JSONB NOT NULL,
    "coinPrices" JSONB NOT NULL,

    CONSTRAINT "RateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "rateSnapshotId" TEXT NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "amountDue" DECIMAL(30,18) NOT NULL,
    "cryptoAsset" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "cryptoAmount" DECIMAL(30,18) NOT NULL,
    "rate" DECIMAL(30,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductLink_reference_key" ON "ProductLink"("reference");

-- CreateIndex
CREATE INDEX "ProductLink_businessId_idx" ON "ProductLink"("businessId");

-- CreateIndex
CREATE INDEX "RateSnapshot_fetchedAt_idx" ON "RateSnapshot"("fetchedAt");

-- CreateIndex
CREATE INDEX "Quote_invoiceId_createdAt_idx" ON "Quote"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_invoiceId_sequence_key" ON "Quote"("invoiceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ApiKey_businessId_idx" ON "ApiKey"("businessId");

-- CreateIndex
CREATE INDEX "Invoice_businessId_kind_idx" ON "Invoice"("businessId", "kind");

-- CreateIndex
CREATE INDEX "Invoice_productLinkId_idx" ON "Invoice"("productLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_externalOrderId_key" ON "Invoice"("businessId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_productLinkId_fkey" FOREIGN KEY ("productLinkId") REFERENCES "ProductLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLink" ADD CONSTRAINT "ProductLink_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rateSnapshotId_fkey" FOREIGN KEY ("rateSnapshotId") REFERENCES "RateSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_rateSnapshotId_fkey" FOREIGN KEY ("rateSnapshotId") REFERENCES "RateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

