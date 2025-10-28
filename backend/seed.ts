import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with sample stock data...');

  // Sample stock data for AAPL
  const aaplData = [
    {
      ticker: 'AAPL',
      date: new Date('2024-01-15'),
      open: 185.50,
      high: 187.25,
      low: 184.75,
      close: 186.80,
      volume: BigInt(45000000)
    },
    {
      ticker: 'AAPL',
      date: new Date('2024-01-16'),
      open: 186.80,
      high: 189.10,
      low: 186.20,
      close: 188.65,
      volume: BigInt(52000000)
    },
    {
      ticker: 'AAPL',
      date: new Date('2024-01-17'),
      open: 188.65,
      high: 190.45,
      low: 187.90,
      close: 189.75,
      volume: BigInt(48000000)
    }
  ];

  // Sample stock data for MSFT
  const msftData = [
    {
      ticker: 'MSFT',
      date: new Date('2024-01-15'),
      open: 385.20,
      high: 388.50,
      low: 384.10,
      close: 387.25,
      volume: BigInt(28000000)
    },
    {
      ticker: 'MSFT',
      date: new Date('2024-01-16'),
      open: 387.25,
      high: 390.75,
      low: 386.80,
      close: 389.40,
      volume: BigInt(31000000)
    },
    {
      ticker: 'MSFT',
      date: new Date('2024-01-17'),
      open: 389.40,
      high: 392.15,
      low: 388.50,
      close: 391.85,
      volume: BigInt(29000000)
    }
  ];

  // Insert AAPL data
  for (const data of aaplData) {
    await prisma.stockData.upsert({
      where: {
        ticker_date: {
          ticker: data.ticker,
          date: data.date
        }
      },
      update: data,
      create: data
    });
  }

  // Insert MSFT data
  for (const data of msftData) {
    await prisma.stockData.upsert({
      where: {
        ticker_date: {
          ticker: data.ticker,
          date: data.date
        }
      },
      update: data,
      create: data
    });
  }

  console.log('✅ Sample data seeded successfully!');
  console.log('📊 Added data for AAPL and MSFT (3 days each)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });