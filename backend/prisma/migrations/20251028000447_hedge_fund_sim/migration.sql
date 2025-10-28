-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "initialCapital" DECIMAL(10,2) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "fundId" INTEGER NOT NULL,
    "ticker" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "exitDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "entryPrice" DECIMAL(10,4) NOT NULL,
    "exitPrice" DECIMAL(10,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockData" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(10,4) NOT NULL,
    "high" DECIMAL(10,4) NOT NULL,
    "low" DECIMAL(10,4) NOT NULL,
    "close" DECIMAL(10,4) NOT NULL,
    "volume" BIGINT NOT NULL,

    CONSTRAINT "StockData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_name_key" ON "Fund"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Position_fundId_ticker_entryDate_key" ON "Position"("fundId", "ticker", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockData_ticker_date_key" ON "StockData"("ticker", "date");

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
