-- CreateTable
CREATE TABLE "MezoutShop" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "gatewayName" TEXT NOT NULL DEFAULT '',
    "linkLifetimeHours" INTEGER NOT NULL DEFAULT 24,
    "webhookEndpointId" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "webhookKeyHash" TEXT,
    "appUrlPublished" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MezoutOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "checkoutUrl" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MezoutEvent" (
    "shop" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("shop", "eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MezoutOrder_shop_orderId_key" ON "MezoutOrder"("shop", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "MezoutOrder_shop_invoiceId_key" ON "MezoutOrder"("shop", "invoiceId");
