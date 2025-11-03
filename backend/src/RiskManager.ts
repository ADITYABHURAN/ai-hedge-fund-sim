import { PrismaClient } from '@prisma/client';

export interface RiskMetrics {
  // Portfolio Risk Metrics
  totalValue: number;
  totalExposure: number;
  availableCash: number;
  leverageRatio: number;
  
  // Position Risk Metrics
  positionSizes: { [ticker: string]: number };
  positionValues: { [ticker: string]: number };
  positionWeights: { [ticker: string]: number };
  
  // Performance Metrics
  portfolioReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  
  // Risk Measures
  valueAtRisk: number;
  expectedShortfall: number;
  betaToMarket: number;
}

export interface PositionSizeParams {
  fundId: number;
  ticker: string;
  currentPrice: number;
  confidence: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  volatility: number;
  fundValue: number;
  availableCash: number;
}

export interface RiskLimits {
  maxPositionSize: number;      // Maximum position as % of portfolio
  maxSectorExposure: number;    // Maximum exposure to single sector
  maxLeverage: number;          // Maximum leverage ratio
  stopLossPercent: number;      // Stop loss trigger percentage
  maxDailyLoss: number;         // Maximum daily loss threshold
  minCashReserve: number;       // Minimum cash reserve percentage
}

export class RiskManager {
  private prisma: PrismaClient;
  private defaultRiskLimits: RiskLimits;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.defaultRiskLimits = {
      maxPositionSize: 0.10,        // 10% max position size
      maxSectorExposure: 0.30,      // 30% max sector exposure
      maxLeverage: 2.0,             // 2x maximum leverage
      stopLossPercent: 0.05,        // 5% stop loss
      maxDailyLoss: 0.02,           // 2% max daily loss
      minCashReserve: 0.05          // 5% minimum cash reserve
    };
  }

  /**
   * Calculate optimal position size based on risk parameters
   */
  async calculatePositionSize(params: PositionSizeParams): Promise<number> {
    const {
      fundId,
      ticker,
      currentPrice,
      confidence,
      signal,
      volatility,
      fundValue,
      availableCash
    } = params;

    if (signal === 'HOLD' || signal === 'SELL') {
      return 0; // No new position for HOLD/SELL signals
    }

    // Get current positions for risk assessment
    const currentPositions = await this.prisma.position.findMany({
      where: { fundId, isActive: true }
    });

    // Calculate position concentration risk
    const currentExposure = currentPositions.reduce((total, pos) => 
      total + (pos.quantity * currentPrice), 0);

    // Risk-adjusted position sizing using Kelly Criterion modified approach
    const kellyFraction = this.calculateKellyFraction(confidence, volatility);
    
    // Base position size (Kelly fraction adjusted for confidence)
    let basePositionValue = fundValue * kellyFraction * confidence;
    
    // Apply risk limits
    const maxPositionValue = fundValue * this.defaultRiskLimits.maxPositionSize;
    const maxCashToUse = availableCash * (1 - this.defaultRiskLimits.minCashReserve);
    
    // Take minimum of all constraints
    const constrainedValue = Math.min(
      basePositionValue,
      maxPositionValue,
      maxCashToUse
    );

    // Convert to number of shares
    const shares = Math.floor(constrainedValue / currentPrice);
    
    return Math.max(0, shares);
  }

  /**
   * Calculate Kelly Fraction for position sizing
   */
  private calculateKellyFraction(confidence: number, volatility: number): number {
    // Modified Kelly: f = (bp - q) / b
    // where b = odds, p = win probability, q = loss probability
    const winProbability = (confidence + 1) / 2; // Convert confidence to probability
    const lossProbability = 1 - winProbability;
    const averageWin = 0.10; // Assume 10% average win
    const averageLoss = volatility; // Use volatility as average loss estimate
    
    const kelly = (winProbability * averageWin - lossProbability * averageLoss) / averageWin;
    
    // Cap Kelly fraction for safety (max 25% of portfolio)
    return Math.min(Math.max(kelly, 0), 0.25);
  }

  /**
   * Calculate comprehensive risk metrics for a fund
   */
  async calculateRiskMetrics(fundId: number): Promise<RiskMetrics> {
    // Get fund and positions
    const fund = await this.prisma.fund.findUnique({
      where: { id: fundId }
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const positions = await this.prisma.position.findMany({
      where: { fundId, isActive: true }
    });

    // Calculate current portfolio values
    let totalValue = Number(fund.initialCapital); // Start with initial capital
    let totalExposure = 0;
    const positionSizes: { [ticker: string]: number } = {};
    const positionValues: { [ticker: string]: number } = {};
    const positionWeights: { [ticker: string]: number } = {};

    for (const position of positions) {
      // Get latest market data for this ticker
      const latestMarketData = await this.prisma.stockData.findFirst({
        where: { ticker: position.ticker },
        orderBy: { date: 'desc' }
      });
      
      const currentPrice = latestMarketData ? Number(latestMarketData.close) : Number(position.entryPrice);
      const positionValue = position.quantity * currentPrice;
      
      positionSizes[position.ticker] = position.quantity;
      positionValues[position.ticker] = positionValue;
      totalExposure += positionValue;
    }

    // Calculate total P&L and current fund value
    let totalPnL = 0;
    for (const position of positions) {
      const latestMarketData = await this.prisma.stockData.findFirst({
        where: { ticker: position.ticker },
        orderBy: { date: 'desc' }
      });
      const currentPrice = latestMarketData ? Number(latestMarketData.close) : Number(position.entryPrice);
      const unrealizedPnL = (currentPrice - Number(position.entryPrice)) * position.quantity;
      totalPnL += unrealizedPnL;
    }

    totalValue = Number(fund.initialCapital) + totalPnL;

    // Calculate position weights
    for (const ticker in positionValues) {
      positionWeights[ticker] = positionValues[ticker] / totalValue;
    }

    const availableCash = totalValue - totalExposure;
    const leverageRatio = totalExposure / totalValue;

    // Calculate performance metrics
    const performanceMetrics = await this.calculatePerformanceMetrics(fundId);

    // Calculate Value at Risk (95% confidence, 1-day horizon)
    const valueAtRisk = await this.calculateVaR(fundId, 0.95, 1);

    return {
      totalValue,
      totalExposure,
      availableCash,
      leverageRatio,
      positionSizes,
      positionValues,
      positionWeights,
      portfolioReturn: performanceMetrics.totalReturn,
      volatility: performanceMetrics.volatility,
      sharpeRatio: performanceMetrics.sharpeRatio,
      maxDrawdown: performanceMetrics.maxDrawdown,
      valueAtRisk,
      expectedShortfall: valueAtRisk * 1.3, // Rough ES estimate
      betaToMarket: performanceMetrics.beta
    };
  }

  /**
   * Calculate performance metrics for a fund
   */
  private async calculatePerformanceMetrics(fundId: number): Promise<{
    totalReturn: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    beta: number;
  }> {
    // Get historical fund values (simplified - would need fund value history table)
    const fund = await this.prisma.fund.findUnique({
      where: { id: fundId }
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    // Calculate current fund value
    const positions = await this.prisma.position.findMany({
      where: { fundId, isActive: true }
    });

    let totalPnL = 0;
    let portfolioVolatility = 0;

    for (const position of positions) {
      // Get historical market data for volatility calculation
      const marketData = await this.prisma.stockData.findMany({
        where: { ticker: position.ticker },
        orderBy: { date: 'desc' },
        take: 30 // Last 30 days for volatility calc
      });

      if (marketData.length > 1) {
        const currentPrice = Number(marketData[0].close);
        const unrealizedPnL = (currentPrice - Number(position.entryPrice)) * position.quantity;
        totalPnL += unrealizedPnL;

        // Calculate returns for volatility
        const returns = [];
        for (let i = 1; i < marketData.length; i++) {
          const dailyReturn = (Number(marketData[i-1].close) - Number(marketData[i].close)) / Number(marketData[i].close);
          returns.push(dailyReturn);
        }
        
        const positionVol = this.calculateStandardDeviation(returns);
        const fundValue = Number(fund.initialCapital) + totalPnL;
        const positionWeight = (position.quantity * currentPrice) / fundValue;
        portfolioVolatility += positionWeight * positionVol;
      }
    }

    const currentFundValue = Number(fund.initialCapital) + totalPnL;
    const totalReturn = totalPnL / Number(fund.initialCapital);

    // Annualize volatility (assuming daily data)
    const annualizedVolatility = portfolioVolatility * Math.sqrt(252);
    
    // Calculate Sharpe ratio (assuming 2% risk-free rate)
    const riskFreeRate = 0.02;
    const excessReturn = totalReturn - riskFreeRate;
    const sharpeRatio = annualizedVolatility > 0 ? excessReturn / annualizedVolatility : 0;

    return {
      totalReturn,
      volatility: annualizedVolatility,
      sharpeRatio,
      maxDrawdown: Math.min(0, totalReturn), // Simplified drawdown calculation
      beta: 1.0 // Simplified - would calculate vs market index
    };
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  private async calculateVaR(fundId: number, confidence: number, horizonDays: number): Promise<number> {
    const fund = await this.prisma.fund.findUnique({
      where: { id: fundId }
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    // Get historical returns for VaR calculation (simplified)
    const positions = await this.prisma.position.findMany({
      where: { fundId, isActive: true }
    });

    // Calculate current portfolio value
    let totalPnL = 0;
    let portfolioVolatility = 0;

    for (const position of positions) {
      // Get historical market data
      const marketData = await this.prisma.stockData.findMany({
        where: { ticker: position.ticker },
        orderBy: { date: 'desc' },
        take: 100 // Last 100 days for VaR calculation
      });

      if (marketData.length > 1) {
        const currentPrice = Number(marketData[0].close);
        const unrealizedPnL = (currentPrice - Number(position.entryPrice)) * position.quantity;
        totalPnL += unrealizedPnL;

        const returns = [];
        for (let i = 1; i < marketData.length; i++) {
          const dailyReturn = (Number(marketData[i-1].close) - Number(marketData[i].close)) / Number(marketData[i].close);
          returns.push(dailyReturn);
        }
        
        const positionVol = this.calculateStandardDeviation(returns);
        const portfolioValue = Number(fund.initialCapital) + totalPnL;
        const positionWeight = (position.quantity * currentPrice) / portfolioValue;
        portfolioVolatility += positionWeight * positionVol;
      }
    }

    const portfolioValue = Number(fund.initialCapital) + totalPnL;

    // Scale by horizon
    const scaledVolatility = portfolioVolatility * Math.sqrt(horizonDays);
    
    // Calculate VaR using normal distribution approximation
    const zScore = confidence === 0.95 ? 1.645 : confidence === 0.99 ? 2.326 : 1.96;
    const var95 = portfolioValue * scaledVolatility * zScore;

    return var95;
  }

  /**
   * Check if a trade violates risk limits
   */
  async validateTradeRisk(fundId: number, ticker: string, quantity: number, price: number): Promise<{
    isValid: boolean;
    violations: string[];
    riskMetrics: RiskMetrics;
  }> {
    const violations: string[] = [];
    const riskMetrics = await this.calculateRiskMetrics(fundId);
    
    const tradeValue = Math.abs(quantity * price);
    const newPositionWeight = tradeValue / riskMetrics.totalValue;
    
    // Check position size limit
    if (newPositionWeight > this.defaultRiskLimits.maxPositionSize) {
      violations.push(`Position size ${(newPositionWeight * 100).toFixed(1)}% exceeds maximum ${(this.defaultRiskLimits.maxPositionSize * 100).toFixed(1)}%`);
    }
    
    // Check cash reserve
    if (quantity > 0 && tradeValue > riskMetrics.availableCash * (1 - this.defaultRiskLimits.minCashReserve)) {
      violations.push(`Insufficient cash reserves for trade`);
    }
    
    // Check leverage
    const newLeverage = (riskMetrics.totalExposure + tradeValue) / riskMetrics.totalValue;
    if (newLeverage > this.defaultRiskLimits.maxLeverage) {
      violations.push(`New leverage ${newLeverage.toFixed(2)}x exceeds maximum ${this.defaultRiskLimits.maxLeverage}x`);
    }

    return {
      isValid: violations.length === 0,
      violations,
      riskMetrics
    };
  }

  /**
   * Calculate standard deviation of returns
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length <= 1) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);
    
    return Math.sqrt(variance);
  }

  /**
   * Generate stop-loss recommendations
   */
  async generateStopLossOrders(fundId: number): Promise<Array<{
    ticker: string;
    currentPrice: number;
    stopLossPrice: number;
    quantity: number;
    unrealizedLoss: number;
  }>> {
    const positions = await this.prisma.position.findMany({
      where: { fundId, isActive: true, quantity: { gt: 0 } } // Only long positions
    });

    const stopLossOrders = [];

    for (const position of positions) {
      // Get latest market data for this position
      const latestMarketData = await this.prisma.stockData.findFirst({
        where: { ticker: position.ticker },
        orderBy: { date: 'desc' }
      });

      if (!latestMarketData) continue;
      
      const currentPrice = Number(latestMarketData.close);
      const entryPrice = Number(position.entryPrice);
      const unrealizedPnL = (currentPrice - entryPrice) * position.quantity;
      const unrealizedReturn = (currentPrice - entryPrice) / entryPrice;
      
      // Trigger stop-loss if position is down by more than threshold
      if (unrealizedReturn < -this.defaultRiskLimits.stopLossPercent) {
        const stopLossPrice = entryPrice * (1 - this.defaultRiskLimits.stopLossPercent);
        
        stopLossOrders.push({
          ticker: position.ticker,
          currentPrice,
          stopLossPrice,
          quantity: position.quantity,
          unrealizedLoss: unrealizedPnL
        });
      }
    }

    return stopLossOrders;
  }
}