import { BaseStrategy, TradeSignal, MarketDataPoint, StrategyConfig } from './BaseStrategy';
import { prisma } from '../server';
import { RiskManager } from '../RiskManager';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Strategy Execution Result
 * Contains the outcome of running a strategy
 */
export interface StrategyExecutionResult {
  /** Strategy that was executed */
  strategyName: string;
  
  /** Strategy type */
  strategyType: string;
  
  /** Generated trading signal */
  signal: TradeSignal;
  
  /** Whether the signal meets execution criteria */
  shouldExecute: boolean;
  
  /** Calculated position size if trade should be executed */
  positionSize?: number;
  
  /** Current market price used in calculations */
  currentPrice: number;
  
  /** Execution timestamp */
  timestamp: Date;
  
  /** Any errors that occurred during execution */
  error?: string;
}

/**
 * Strategy Portfolio Result
 * Aggregated results from multiple strategies for a fund
 */
export interface StrategyPortfolioResult {
  /** Fund ID this analysis is for */
  fundId: number;
  
  /** Ticker symbol analyzed */
  ticker: string;
  
  /** Results from individual strategies */
  strategyResults: StrategyExecutionResult[];
  
  /** Consensus recommendation (majority vote) */
  consensus: 'BUY' | 'SELL' | 'HOLD';
  
  /** Average confidence across all strategies */
  avgConfidence: number;
  
  /** Recommended position size (weighted by confidence) */
  recommendedSize: number;
  
  /** Analysis timestamp */
  timestamp: Date;
}

/**
 * Strategy Engine
 * Orchestrates multiple trading strategies and manages their execution
 */
export class StrategyEngine {
  private strategies: Map<string, BaseStrategy> = new Map();
  private riskManager: RiskManager;

  constructor() {
    this.riskManager = new RiskManager(prisma);
  }
  
  /**
   * Register a strategy with the engine
   */
  registerStrategy(strategy: BaseStrategy): void {
    const strategyKey = `${strategy.getType()}-${strategy.getConfig().name}`;
    this.strategies.set(strategyKey, strategy);
    
    console.log(`📈 Strategy registered: ${strategy.getName()} (${strategy.getType()})`);
  }
  
  /**
   * Unregister a strategy from the engine
   */
  unregisterStrategy(strategyType: string, strategyName: string): boolean {
    const strategyKey = `${strategyType}-${strategyName}`;
    const removed = this.strategies.delete(strategyKey);
    
    if (removed) {
      console.log(`📉 Strategy unregistered: ${strategyName} (${strategyType})`);
    }
    
    return removed;
  }
  
  /**
   * Get all registered strategies
   */
  getRegisteredStrategies(): BaseStrategy[] {
    return Array.from(this.strategies.values());
  }
  
  /**
   * Execute a single strategy for a specific ticker
   */
  async executeStrategy(
    strategy: BaseStrategy,
    ticker: string,
    fundId: number
  ): Promise<StrategyExecutionResult> {
    const timestamp = new Date();
    
    try {
      // Get market data for analysis
      const marketData = await this.getMarketData(ticker, strategy.getMinDataPoints());
      
      if (marketData.length < strategy.getMinDataPoints()) {
        throw new Error(`Insufficient market data. Need ${strategy.getMinDataPoints()}, have ${marketData.length}`);
      }
      
      // Get current position size for this ticker
      const currentPosition = await this.getCurrentPosition(fundId, ticker);
      
      // Execute strategy analysis
      const signal = await strategy.analyze(ticker, marketData, currentPosition);
      
      // Check if we should execute this signal
      const shouldExecute = strategy.shouldExecuteTrade(signal);
      
      // Calculate risk-managed position size if trade should be executed
      let positionSize = 0;
      if (shouldExecute) {
        const currentPrice = strategy['getLatestPrice'](marketData);
        
        // Get fund information for risk calculations
        const fund = await prisma.fund.findUnique({
          where: { id: fundId },
          include: { positions: { where: { isActive: true } } }
        });
        
        if (fund) {
          // Calculate current fund value
          let totalPnL = 0;
          for (const position of fund.positions) {
            const latestData = await prisma.stockData.findFirst({
              where: { ticker: position.ticker },
              orderBy: { date: 'desc' }
            });
            if (latestData) {
              const unrealizedPnL = (Number(latestData.close) - Number(position.entryPrice)) * position.quantity;
              totalPnL += unrealizedPnL;
            }
          }
          
          const fundValue = Number(fund.initialCapital) + totalPnL;
          const availableCapital = await this.getAvailableCapital(fundId);
          
          // Calculate volatility from recent price data
          const recentPrices = marketData.slice(-30).map(d => Number(d.close));
          const returns = [];
          for (let i = 1; i < recentPrices.length; i++) {
            returns.push((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1]);
          }
          const volatility = this.calculateStandardDeviation(returns);
          
          // Use RiskManager for position sizing
          positionSize = await this.riskManager.calculatePositionSize({
            fundId,
            ticker,
            currentPrice,
            confidence: signal.confidence,
            signal: signal.action,
            volatility,
            fundValue,
            availableCash: availableCapital
          });
        }
      }
      
      const result: StrategyExecutionResult = {
        strategyName: strategy.getName(),
        strategyType: strategy.getType(),
        signal,
        shouldExecute,
        positionSize: shouldExecute ? positionSize : undefined,
        currentPrice: strategy['getLatestPrice'](marketData),
        timestamp
      };
      
      console.log(`🔍 Strategy executed: ${strategy.getName()} - ${signal.action} (${signal.confidence.toFixed(3)})`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Strategy execution failed: ${strategy.getName()}`, error);
      
      return {
        strategyName: strategy.getName(),
        strategyType: strategy.getType(),
        signal: { action: 'HOLD', confidence: 0, reason: 'Execution failed' },
        shouldExecute: false,
        currentPrice: 0,
        timestamp,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Execute all active strategies for a fund and ticker
   */
  async executeAllStrategies(fundId: number, ticker: string): Promise<StrategyPortfolioResult> {
    const timestamp = new Date();
    
    console.log(`🚀 Executing all strategies for ${ticker} in fund ${fundId}`);
    
    // Execute all strategies in parallel
    const activeStrategies = Array.from(this.strategies.values())
      .filter(strategy => strategy.getConfig().isActive);
    
    const strategyPromises = activeStrategies.map(strategy => 
      this.executeStrategy(strategy, ticker, fundId)
    );
    
    const strategyResults = await Promise.all(strategyPromises);
    
    // Calculate consensus and weighted recommendations
    const consensus = this.calculateConsensus(strategyResults);
    const avgConfidence = this.calculateAverageConfidence(strategyResults);
    const recommendedSize = this.calculateRecommendedSize(strategyResults);
    
    const portfolioResult: StrategyPortfolioResult = {
      fundId,
      ticker,
      strategyResults,
      consensus,
      avgConfidence,
      recommendedSize,
      timestamp
    };
    
    console.log(`📊 Portfolio analysis complete: ${ticker} - Consensus: ${consensus} (${avgConfidence.toFixed(3)})`);
    
    return portfolioResult;
  }
  
  /**
   * Get market data for a ticker
   */
  private async getMarketData(ticker: string, minPoints: number): Promise<MarketDataPoint[]> {
    const stockData = await prisma.stockData.findMany({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { date: 'asc' },
      take: Math.max(minPoints, 100) // Get at least 100 points or minimum required
    });
    
    return stockData.map((data: any) => ({
      ticker: data.ticker,
      date: data.date,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume
    }));
  }
  
  /**
   * Get current position size for a ticker in a fund
   */
  private async getCurrentPosition(fundId: number, ticker: string): Promise<number> {
    const positions = await prisma.position.findMany({
      where: {
        fundId,
        ticker: ticker.toUpperCase(),
        isActive: true
      }
    });
    
    return positions.reduce((sum: number, pos: any) => sum + pos.quantity, 0);
  }
  
  /**
   * Get available capital for a fund
   */
  private async getAvailableCapital(fundId: number): Promise<number> {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: {
        positions: {
          where: { isActive: true }
        }
      }
    });
    
    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }
    
    // Calculate invested capital
    const investedCapital = fund.positions.reduce((sum: number, pos: any) => {
      return sum + (pos.entryPrice.toNumber() * pos.quantity);
    }, 0);
    
    // Available capital = initial capital - invested capital
    return fund.initialCapital.toNumber() - investedCapital;
  }
  
  /**
   * Calculate consensus from multiple strategy results
   */
  private calculateConsensus(results: StrategyExecutionResult[]): 'BUY' | 'SELL' | 'HOLD' {
    const votes = { BUY: 0, SELL: 0, HOLD: 0 };
    
    results.forEach(result => {
      if (result.shouldExecute) {
        votes[result.signal.action] += result.signal.confidence;
      } else {
        votes.HOLD += 1;
      }
    });
    
    // Find action with highest weighted vote
    const maxVote = Math.max(votes.BUY, votes.SELL, votes.HOLD);
    
    if (votes.BUY === maxVote) return 'BUY';
    if (votes.SELL === maxVote) return 'SELL';
    return 'HOLD';
  }
  
  /**
   * Calculate average confidence across all strategies
   */
  private calculateAverageConfidence(results: StrategyExecutionResult[]): number {
    if (results.length === 0) return 0;
    
    const totalConfidence = results.reduce((sum, result) => sum + result.signal.confidence, 0);
    return totalConfidence / results.length;
  }
  
  /**
   * Calculate recommended position size weighted by confidence
   */
  private calculateRecommendedSize(results: StrategyExecutionResult[]): number {
    const executableResults = results.filter(result => result.shouldExecute && result.positionSize);
    
    if (executableResults.length === 0) return 0;
    
    let weightedSize = 0;
    let totalWeight = 0;
    
    executableResults.forEach(result => {
      const weight = result.signal.confidence;
      weightedSize += (result.positionSize || 0) * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? Math.floor(weightedSize / totalWeight) : 0;
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
   * Validate trade against risk limits before execution
   */
  async validateTradeRisk(
    fundId: number,
    ticker: string,
    quantity: number,
    price: number
  ): Promise<{
    isValid: boolean;
    violations: string[];
    riskMetrics: any;
  }> {
    return await this.riskManager.validateTradeRisk(fundId, ticker, quantity, price);
  }

  /**
   * Get comprehensive risk metrics for a fund
   */
  async getRiskMetrics(fundId: number) {
    return await this.riskManager.calculateRiskMetrics(fundId);
  }

  /**
   * Generate stop-loss recommendations for a fund
   */
  async generateStopLossRecommendations(fundId: number) {
    return await this.riskManager.generateStopLossOrders(fundId);
  }
}