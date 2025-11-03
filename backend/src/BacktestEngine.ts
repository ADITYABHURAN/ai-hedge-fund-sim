import { PrismaClient } from '@prisma/client';
import { BaseStrategy } from './strategies/BaseStrategy';
import { RiskManager } from './RiskManager';

export interface BacktestConfig {
  strategyName: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  commission: number;
  slippage: number;
  benchmarkTicker?: string;
}

export interface BacktestResult {
  config: BacktestConfig;
  performance: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    avgTradeReturn: number;
  };
  trades: BacktestTrade[];
  equity: EquityPoint[];
  benchmark?: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    beta: number;
    alpha: number;
  };
  riskMetrics: {
    valueAtRisk: number;
    expectedShortfall: number;
    maximumLoss: number;
    downside_deviation: number;
  };
}

export interface BacktestTrade {
  date: string;
  ticker: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  commission: number;
  totalValue: number;
  portfolioValue: number;
  cash: number;
  reason: string;
}

export interface EquityPoint {
  date: string;
  portfolioValue: number;
  cash: number;
  positions: { [ticker: string]: number };
  dailyReturn: number;
  cumulativeReturn: number;
  drawdown: number;
}

export interface BacktestPosition {
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  currentPrice: number;
  unrealizedPnL: number;
}

export class BacktestEngine {
  private prisma: PrismaClient;
  private riskManager: RiskManager;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.riskManager = new RiskManager(prisma);
  }

  /**
   * Run a comprehensive backtest for a strategy
   */
  async runBacktest(
    strategy: BaseStrategy,
    config: BacktestConfig,
    tickers: string[]
  ): Promise<BacktestResult> {
    console.log(`🔄 Starting backtest: ${config.strategyName}`);
    console.log(`📅 Period: ${config.startDate} to ${config.endDate}`);
    console.log(`💰 Initial Capital: $${config.initialCapital.toLocaleString()}`);

    // Validate date range
    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    
    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    // Get historical market data for all tickers
    const marketData = await this.getHistoricalData(tickers, config.startDate, config.endDate);
    
    if (marketData.length === 0) {
      throw new Error('No historical data found for the specified period');
    }

    // Initialize backtest state
    let cash = config.initialCapital;
    let portfolioValue = config.initialCapital;
    const positions: { [ticker: string]: BacktestPosition } = {};
    const trades: BacktestTrade[] = [];
    const equity: EquityPoint[] = [];
    
    // Get unique dates and sort them
    const uniqueDates = [...new Set(marketData.map(d => d.date.toISOString().split('T')[0]))]
      .sort();

    let previousPortfolioValue = config.initialCapital;
    let peakValue = config.initialCapital;
    
    // Process each trading day
    for (const dateStr of uniqueDates) {
      const date = new Date(dateStr);
      
      // Get market data for this date
      const dayData = marketData.filter(d => 
        d.date.toISOString().split('T')[0] === dateStr
      );

      if (dayData.length === 0) continue;

      // Update positions with current market prices
      let totalPositionValue = 0;
      for (const ticker in positions) {
        const tickerData = dayData.find(d => d.ticker === ticker);
        if (tickerData) {
          positions[ticker].currentPrice = Number(tickerData.close);
          positions[ticker].unrealizedPnL = 
            (positions[ticker].currentPrice - positions[ticker].entryPrice) * positions[ticker].quantity;
          totalPositionValue += positions[ticker].quantity * positions[ticker].currentPrice;
        }
      }

      // Calculate portfolio value
      portfolioValue = cash + totalPositionValue;

      // Run strategy analysis for each ticker
      for (const ticker of tickers) {
        const tickerData = dayData.find(d => d.ticker === ticker);
        if (!tickerData) continue;

        // Get historical data for strategy analysis (last 200 days)
        const historicalPrices = await this.getTickerHistory(ticker, dateStr, 200);
        
        if (historicalPrices.length < 50) continue; // Need enough history for analysis

        // Analyze with strategy
        const signal = await strategy.analyze(
          ticker,
          historicalPrices.map(data => ({
            ticker,
            date: data.date,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume
          }))
        );

        // Execute trades based on signal
        if (signal.action !== 'HOLD') {
          const trade = await this.executeTrade(
            signal,
            ticker,
            Number(tickerData.close),
            dateStr,
            cash,
            portfolioValue,
            positions,
            config
          );

          if (trade) {
            trades.push(trade);
            cash = trade.cash;
            
            // Update positions
            if (signal.action === 'BUY') {
              positions[ticker] = {
                ticker,
                quantity: trade.quantity,
                entryPrice: trade.price,
                entryDate: dateStr,
                currentPrice: trade.price,
                unrealizedPnL: 0
              };
            } else if (signal.action === 'SELL' && positions[ticker]) {
              delete positions[ticker];
            }
          }
        }
      }

      // Update portfolio value after trades
      totalPositionValue = 0;
      for (const ticker in positions) {
        const tickerData = dayData.find(d => d.ticker === ticker);
        if (tickerData) {
          totalPositionValue += positions[ticker].quantity * Number(tickerData.close);
        }
      }
      portfolioValue = cash + totalPositionValue;

      // Calculate performance metrics
      const dailyReturn = (portfolioValue - previousPortfolioValue) / previousPortfolioValue;
      const cumulativeReturn = (portfolioValue - config.initialCapital) / config.initialCapital;
      
      // Update peak and calculate drawdown
      if (portfolioValue > peakValue) {
        peakValue = portfolioValue;
      }
      const drawdown = (peakValue - portfolioValue) / peakValue;

      // Record equity point
      equity.push({
        date: dateStr,
        portfolioValue,
        cash,
        positions: Object.keys(positions).reduce((acc, ticker) => {
          acc[ticker] = positions[ticker].quantity;
          return acc;
        }, {} as { [ticker: string]: number }),
        dailyReturn,
        cumulativeReturn,
        drawdown
      });

      previousPortfolioValue = portfolioValue;
    }

    // Calculate final performance metrics
    const performance = this.calculatePerformanceMetrics(equity, trades, config);

    // Get benchmark data if specified
    let benchmark;
    if (config.benchmarkTicker) {
      benchmark = await this.calculateBenchmarkMetrics(
        config.benchmarkTicker,
        config.startDate,
        config.endDate,
        equity
      );
    }

    // Calculate risk metrics
    const riskMetrics = this.calculateRiskMetrics(equity);

    console.log(`✅ Backtest completed: ${trades.length} trades, ${(performance.totalReturn * 100).toFixed(2)}% return`);

    return {
      config,
      performance,
      trades,
      equity,
      benchmark,
      riskMetrics
    };
  }

  /**
   * Execute a trade during backtesting
   */
  private async executeTrade(
    signal: any,
    ticker: string,
    price: number,
    date: string,
    availableCash: number,
    portfolioValue: number,
    positions: { [ticker: string]: BacktestPosition },
    config: BacktestConfig
  ): Promise<BacktestTrade | null> {
    
    if (signal.action === 'BUY') {
      // Calculate position size (simplified version of risk management)
      const maxPositionSize = portfolioValue * 0.1; // Max 10% position
      const confidenceAdjusted = maxPositionSize * signal.confidence;
      const targetValue = Math.min(confidenceAdjusted, availableCash * 0.95); // Keep 5% cash buffer
      
      const targetQuantity = Math.floor(targetValue / price);
      if (targetQuantity <= 0) return null;

      const tradeValue = targetQuantity * price;
      const commission = config.commission;
      const slippageAdjusted = price * (1 + config.slippage);
      const totalCost = (targetQuantity * slippageAdjusted) + commission;

      if (totalCost > availableCash) return null;

      return {
        date,
        ticker,
        action: 'BUY',
        quantity: targetQuantity,
        price: slippageAdjusted,
        commission,
        totalValue: totalCost,
        portfolioValue,
        cash: availableCash - totalCost,
        reason: `Strategy signal: ${signal.confidence.toFixed(2)} confidence`
      };

    } else if (signal.action === 'SELL' && positions[ticker]) {
      const position = positions[ticker];
      const slippageAdjusted = price * (1 - config.slippage);
      const tradeValue = position.quantity * slippageAdjusted;
      const commission = config.commission;
      const netProceeds = tradeValue - commission;

      return {
        date,
        ticker,
        action: 'SELL',
        quantity: position.quantity,
        price: slippageAdjusted,
        commission,
        totalValue: tradeValue,
        portfolioValue,
        cash: availableCash + netProceeds,
        reason: `Strategy signal: ${signal.confidence.toFixed(2)} confidence`
      };
    }

    return null;
  }

  /**
   * Get historical market data for backtesting
   */
  private async getHistoricalData(
    tickers: string[],
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    return await this.prisma.stockData.findMany({
      where: {
        ticker: { in: tickers },
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      orderBy: { date: 'asc' }
    });
  }

  /**
   * Get historical data for a specific ticker
   */
  private async getTickerHistory(
    ticker: string,
    endDate: string,
    days: number
  ): Promise<any[]> {
    const end = new Date(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - days);

    return await this.prisma.stockData.findMany({
      where: {
        ticker,
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: { date: 'asc' }
    });
  }

  /**
   * Calculate comprehensive performance metrics
   */
  private calculatePerformanceMetrics(
    equity: EquityPoint[],
    trades: BacktestTrade[],
    config: BacktestConfig
  ): BacktestResult['performance'] {
    if (equity.length === 0) {
      throw new Error('No equity data available for performance calculation');
    }

    const totalReturn = equity[equity.length - 1].cumulativeReturn;
    
    // Calculate annualized return
    const startDate = new Date(equity[0].date);
    const endDate = new Date(equity[equity.length - 1].date);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const years = daysDiff / 365.25;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;

    // Calculate volatility
    const returns = equity.slice(1).map(point => point.dailyReturn);
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1);
    const volatility = Math.sqrt(variance * 252); // Annualized

    // Calculate Sharpe ratio (assuming 2% risk-free rate)
    const riskFreeRate = 0.02;
    const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;

    // Calculate max drawdown
    const maxDrawdown = Math.max(...equity.map(point => point.drawdown));

    // Calculate Calmar ratio
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    // Calculate trade statistics
    const winningTrades = trades.filter(trade => {
      if (trade.action === 'SELL') {
        // Find corresponding BUY trade
        const buyTrade = trades.find(t => 
          t.ticker === trade.ticker && 
          t.action === 'BUY' && 
          new Date(t.date) < new Date(trade.date)
        );
        if (buyTrade) {
          return trade.price > buyTrade.price;
        }
      }
      return false;
    });

    const winRate = trades.length > 0 ? winningTrades.length / (trades.length / 2) : 0; // Divide by 2 for buy/sell pairs
    
    const avgTradeReturn = trades.length > 0 
      ? totalReturn / (trades.length / 2) 
      : 0;

    // Calculate profit factor (simplified)
    const profitFactor = 1 + Math.abs(totalReturn);

    return {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      maxDrawdown,
      calmarRatio,
      winRate,
      profitFactor,
      totalTrades: Math.floor(trades.length / 2), // Buy/sell pairs
      avgTradeReturn
    };
  }

  /**
   * Calculate benchmark performance metrics
   */
  private async calculateBenchmarkMetrics(
    benchmarkTicker: string,
    startDate: string,
    endDate: string,
    equity: EquityPoint[]
  ): Promise<BacktestResult['benchmark']> {
    const benchmarkData = await this.prisma.stockData.findMany({
      where: {
        ticker: benchmarkTicker,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      orderBy: { date: 'asc' }
    });

    if (benchmarkData.length === 0) {
      throw new Error(`No benchmark data found for ${benchmarkTicker}`);
    }

    const startPrice = Number(benchmarkData[0].close);
    const endPrice = Number(benchmarkData[benchmarkData.length - 1].close);
    const totalReturn = (endPrice - startPrice) / startPrice;

    // Calculate benchmark returns
    const benchmarkReturns = [];
    for (let i = 1; i < benchmarkData.length; i++) {
      const dailyReturn = (Number(benchmarkData[i].close) - Number(benchmarkData[i-1].close)) / Number(benchmarkData[i-1].close);
      benchmarkReturns.push(dailyReturn);
    }

    // Calculate volatility
    const avgReturn = benchmarkReturns.reduce((sum, ret) => sum + ret, 0) / benchmarkReturns.length;
    const variance = benchmarkReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (benchmarkReturns.length - 1);
    const volatility = Math.sqrt(variance * 252);

    // Calculate annualized return
    const days = benchmarkData.length;
    const years = days / 252;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;

    // Calculate Sharpe ratio
    const riskFreeRate = 0.02;
    const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;

    // Calculate beta and alpha (simplified)
    const portfolioReturns = equity.slice(1).map(point => point.dailyReturn);
    const covariance = this.calculateCovariance(portfolioReturns, benchmarkReturns);
    const benchmarkVariance = variance;
    const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;
    
    const portfolioAnnualizedReturn = equity.length > 0 
      ? Math.pow(1 + equity[equity.length - 1].cumulativeReturn, 252 / equity.length) - 1
      : 0;
    const alpha = portfolioAnnualizedReturn - (riskFreeRate + beta * (annualizedReturn - riskFreeRate));

    return {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      beta,
      alpha
    };
  }

  /**
   * Calculate risk metrics from equity curve
   */
  private calculateRiskMetrics(equity: EquityPoint[]): BacktestResult['riskMetrics'] {
    const returns = equity.slice(1).map(point => point.dailyReturn);
    
    // Sort returns for VaR calculation
    const sortedReturns = returns.slice().sort((a, b) => a - b);
    
    // Calculate 95% VaR (5th percentile)
    const varIndex = Math.floor(sortedReturns.length * 0.05);
    const valueAtRisk = Math.abs(sortedReturns[varIndex] || 0);
    
    // Calculate Expected Shortfall (CVaR) - average of returns below VaR
    const tailReturns = sortedReturns.slice(0, varIndex + 1);
    const expectedShortfall = tailReturns.length > 0 
      ? Math.abs(tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length)
      : 0;
    
    // Maximum single-day loss
    const maximumLoss = Math.abs(Math.min(...returns));
    
    // Downside deviation
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const downsideReturns = returns.filter(ret => ret < avgReturn);
    const downsideVariance = downsideReturns.length > 0
      ? downsideReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / downsideReturns.length
      : 0;
    const downside_deviation = Math.sqrt(downsideVariance * 252);

    return {
      valueAtRisk,
      expectedShortfall,
      maximumLoss,
      downside_deviation
    };
  }

  /**
   * Calculate covariance between two return series
   */
  private calculateCovariance(returns1: number[], returns2: number[]): number {
    const minLength = Math.min(returns1.length, returns2.length);
    const r1 = returns1.slice(0, minLength);
    const r2 = returns2.slice(0, minLength);
    
    const mean1 = r1.reduce((sum, ret) => sum + ret, 0) / r1.length;
    const mean2 = r2.reduce((sum, ret) => sum + ret, 0) / r2.length;
    
    const covariance = r1.reduce((sum, ret, i) => 
      sum + (ret - mean1) * (r2[i] - mean2), 0
    ) / (r1.length - 1);
    
    return covariance;
  }

  /**
   * Get backtest summary statistics
   */
  generateBacktestSummary(result: BacktestResult): string {
    const perf = result.performance;
    
    return `
📊 BACKTEST SUMMARY: ${result.config.strategyName}
════════════════════════════════════════════════════════════════

📅 Period: ${result.config.startDate} to ${result.config.endDate}
💰 Initial Capital: $${result.config.initialCapital.toLocaleString()}
🔄 Total Trades: ${perf.totalTrades}

📈 RETURNS:
   Total Return: ${(perf.totalReturn * 100).toFixed(2)}%
   Annual Return: ${(perf.annualizedReturn * 100).toFixed(2)}%
   Average Trade: ${(perf.avgTradeReturn * 100).toFixed(2)}%

⚡ RISK METRICS:
   Volatility: ${(perf.volatility * 100).toFixed(2)}%
   Sharpe Ratio: ${perf.sharpeRatio.toFixed(3)}
   Max Drawdown: ${(perf.maxDrawdown * 100).toFixed(2)}%
   Calmar Ratio: ${perf.calmarRatio.toFixed(3)}
   
🎯 TRADE STATS:
   Win Rate: ${(perf.winRate * 100).toFixed(1)}%
   Profit Factor: ${perf.profitFactor.toFixed(2)}
   
🚨 RISK ANALYSIS:
   Value at Risk (95%): ${(result.riskMetrics.valueAtRisk * 100).toFixed(2)}%
   Expected Shortfall: ${(result.riskMetrics.expectedShortfall * 100).toFixed(2)}%
   Maximum Loss: ${(result.riskMetrics.maximumLoss * 100).toFixed(2)}%
   
${result.benchmark ? `
📊 VS BENCHMARK (${result.config.benchmarkTicker}):
   Strategy Return: ${(perf.annualizedReturn * 100).toFixed(2)}%
   Benchmark Return: ${(result.benchmark.annualizedReturn * 100).toFixed(2)}%
   Alpha: ${(result.benchmark.alpha * 100).toFixed(2)}%
   Beta: ${result.benchmark.beta.toFixed(2)}
` : ''}
════════════════════════════════════════════════════════════════
    `.trim();
  }
}