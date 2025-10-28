import axios from 'axios';
import { PrismaClient } from '@prisma/client';

// Types for Alpaca API responses
interface AlpacaBar {
  t: string; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface AlpacaBarsResponse {
  bars: {
    [symbol: string]: AlpacaBar[];
  };
  next_page_token?: string;
}

interface StockDataInsert {
  ticker: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint;
}

export class MarketDataFetcher {
  private alpacaClient: any;
  private prisma: PrismaClient;

  constructor() {
    // Initialize Prisma client
    this.prisma = new PrismaClient();

    // Initialize Alpaca API client
    this.alpacaClient = axios.create({
      baseURL: 'https://data.alpaca.markets/v2',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY || '',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch historical stock data from Alpaca and store in database
   */
  async fetchAndStoreHistoricalData(
    symbols: string[],
    startDate: string,
    endDate: string,
    timeframe: '1Day' | '1Hour' | '1Min' = '1Day'
  ): Promise<{
    success: boolean;
    message: string;
    data?: {
      processedSymbols: string[];
      totalRecords: number;
      errors: string[];
    };
  }> {
    try {
      console.log(`📊 Starting data fetch for symbols: ${symbols.join(', ')}`);
      console.log(`📅 Date range: ${startDate} to ${endDate}`);

      const processedSymbols: string[] = [];
      const errors: string[] = [];
      let totalRecords = 0;

      // Process symbols in batches to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        
        try {
          const response = await this.alpacaClient.get('/stocks/bars', {
            params: {
              symbols: batch.join(','),
              start: startDate,
              end: endDate,
              timeframe,
              adjustment: 'raw',
              page_token: undefined,
            },
          });

          // Process each symbol's data
          for (const symbol of batch) {
            const bars = response.data.bars[symbol];
            
            if (!bars || bars.length === 0) {
              errors.push(`No data found for symbol: ${symbol}`);
              continue;
            }

            // Convert Alpaca data format to our database format
            const stockDataRecords: StockDataInsert[] = bars.map((bar: AlpacaBar) => ({
              ticker: symbol.toUpperCase(),
              date: new Date(bar.t),
              open: bar.o,
              high: bar.h,
              low: bar.l,
              close: bar.c,
              volume: BigInt(bar.v),
            }));

            // Insert data into database using upsert to handle duplicates
            for (const record of stockDataRecords) {
              try {
                await this.prisma.stockData.upsert({
                  where: {
                    ticker_date: {
                      ticker: record.ticker,
                      date: record.date,
                    },
                  },
                  update: {
                    open: record.open,
                    high: record.high,
                    low: record.low,
                    close: record.close,
                    volume: record.volume,
                  },
                  create: record,
                });
              } catch (dbError) {
                console.error(`Database error for ${record.ticker} on ${record.date}:`, dbError);
                errors.push(`Database error for ${record.ticker}: ${dbError}`);
              }
            }

            processedSymbols.push(symbol);
            totalRecords += stockDataRecords.length;
            
            console.log(`✅ Processed ${stockDataRecords.length} records for ${symbol}`);
          }

        } catch (apiError: any) {
          console.error(`Alpaca API error for batch ${batch.join(', ')}:`, apiError.response?.data || apiError.message);
          errors.push(`API error for symbols ${batch.join(', ')}: ${apiError.response?.data?.message || apiError.message}`);
        }

        // Rate limiting: wait between batches
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      console.log(`🎉 Data ingestion completed. Total records: ${totalRecords}`);

      return {
        success: true,
        message: `Successfully processed ${processedSymbols.length} symbols with ${totalRecords} total records`,
        data: {
          processedSymbols,
          totalRecords,
          errors,
        },
      };

    } catch (error: any) {
      console.error('MarketDataFetcher error:', error);
      return {
        success: false,
        message: `Failed to fetch market data: ${error.message}`,
      };
    }
  }

  /**
   * Get latest available data for symbols from database
   */
  async getLatestDataFromDB(symbols: string[]): Promise<{
    success: boolean;
    data?: { [symbol: string]: any };
    message: string;
  }> {
    try {
      const latestData: { [symbol: string]: any } = {};

      for (const symbol of symbols) {
        const latest = await this.prisma.stockData.findFirst({
          where: { ticker: symbol.toUpperCase() },
          orderBy: { date: 'desc' },
        });

        if (latest) {
          latestData[symbol] = {
            ticker: latest.ticker,
            date: latest.date,
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            volume: latest.volume.toString(), // Convert BigInt to string for JSON
          };
        }
      }

      return {
        success: true,
        data: latestData,
        message: `Retrieved latest data for ${Object.keys(latestData).length} symbols`,
      };

    } catch (error: any) {
      console.error('Database query error:', error);
      return {
        success: false,
        message: `Failed to retrieve data: ${error.message}`,
      };
    }
  }

  /**
   * Get historical data for a symbol within date range
   */
  async getHistoricalDataFromDB(
    symbol: string,
    startDate: string,
    endDate: string,
    limit: number = 100
  ): Promise<{
    success: boolean;
    data?: any[];
    message: string;
  }> {
    try {
      const historicalData = await this.prisma.stockData.findMany({
        where: {
          ticker: symbol.toUpperCase(),
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        orderBy: { date: 'desc' },
        take: limit,
      });

      // Convert BigInt to string for JSON serialization
      const serializedData = historicalData.map(record => ({
        ...record,
        volume: record.volume.toString(),
      }));

      return {
        success: true,
        data: serializedData,
        message: `Retrieved ${serializedData.length} historical records for ${symbol}`,
      };

    } catch (error: any) {
      console.error('Historical data query error:', error);
      return {
        success: false,
        message: `Failed to retrieve historical data: ${error.message}`,
      };
    }
  }

  /**
   * Validate Alpaca API credentials
   */
  async validateCredentials(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Test API connection with a simple request
      await this.alpacaClient.get('/stocks/bars', {
        params: {
          symbols: 'AAPL',
          start: '2024-01-01',
          end: '2024-01-02',
          timeframe: '1Day',
        },
      });

      return {
        success: true,
        message: 'Alpaca API credentials are valid',
      };

    } catch (error: any) {
      console.error('Alpaca credential validation failed:', error.response?.data || error.message);
      return {
        success: false,
        message: `Invalid Alpaca credentials: ${error.response?.data?.message || error.message}`,
      };
    }
  }

  /**
   * Clean up resources
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}