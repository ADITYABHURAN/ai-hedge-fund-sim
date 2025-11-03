import { Decimal } from '@prisma/client/runtime/library';

/**
 * Trading Signal Interface
 * Represents the output of a trading strategy analysis
 */
export interface TradeSignal {
  /** Trading action: BUY, SELL, or HOLD */
  action: 'BUY' | 'SELL' | 'HOLD';
  
  /** Confidence level (0-1) in the signal */
  confidence: number;
  
  /** Suggested position size as percentage of available capital */
  positionSize?: number;
  
  /** Stop loss price level */
  stopLoss?: number;
  
  /** Take profit price level */
  takeProfit?: number;
  
  /** Additional context about the signal */
  reason?: string;
  
  /** Technical indicator values that generated this signal */
  indicators?: Record<string, number>;
}

/**
 * Market Data Point Interface
 * Represents a single candlestick/price point
 */
export interface MarketDataPoint {
  /** Stock ticker symbol */
  ticker: string;
  
  /** Date of this data point */
  date: Date;
  
  /** Opening price */
  open: Decimal;
  
  /** Highest price */
  high: Decimal;
  
  /** Lowest price */
  low: Decimal;
  
  /** Closing price */
  close: Decimal;
  
  /** Trading volume */
  volume: bigint;
}

/**
 * Strategy Configuration Interface
 * Parameters that can be customized for each strategy instance
 */
export interface StrategyConfig {
  /** Unique identifier for this strategy instance */
  id?: number;
  
  /** Human-readable name for this strategy */
  name: string;
  
  /** Strategy type identifier */
  type: string;
  
  /** Maximum position size as percentage of fund (0-1) */
  maxPositionSize: number;
  
  /** Minimum confidence level required to execute trades (0-1) */
  minConfidence: number;
  
  /** Strategy-specific parameters */
  parameters: Record<string, any>;
  
  /** Whether this strategy is currently active */
  isActive: boolean;
}

/**
 * Abstract Base Strategy Class
 * All trading strategies must extend this class
 */
export abstract class BaseStrategy {
  protected config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
    this.validateConfig(config);
  }
  
  /**
   * Analyze market data and generate trading signal
   * This is the main method that each strategy must implement
   */
  abstract analyze(
    ticker: string, 
    marketData: MarketDataPoint[], 
    currentPosition?: number
  ): Promise<TradeSignal>;
  
  /**
   * Get the display name of this strategy
   */
  abstract getName(): string;
  
  /**
   * Get strategy type identifier
   */
  abstract getType(): string;
  
  /**
   * Get description of what this strategy does
   */
  abstract getDescription(): string;
  
  /**
   * Get the required minimum number of data points for analysis
   */
  abstract getMinDataPoints(): number;
  
  /**
   * Validate strategy-specific configuration
   */
  protected abstract validateStrategyConfig(config: StrategyConfig): void;
  
  /**
   * Get current strategy configuration
   */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }
  
  /**
   * Update strategy configuration
   */
  updateConfig(newConfig: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig(this.config);
  }
  
  /**
   * Check if strategy should execute based on signal confidence
   */
  shouldExecuteTrade(signal: TradeSignal): boolean {
    return signal.confidence >= this.config.minConfidence && 
           signal.action !== 'HOLD';
  }
  
  /**
   * Calculate position size based on signal and risk parameters
   */
  calculatePositionSize(
    signal: TradeSignal, 
    availableCapital: number, 
    currentPrice: number
  ): number {
    const maxCapitalToUse = availableCapital * this.config.maxPositionSize;
    const suggestedSize = signal.positionSize || this.config.maxPositionSize;
    const capitalToUse = Math.min(maxCapitalToUse, availableCapital * suggestedSize);
    
    return Math.floor(capitalToUse / currentPrice);
  }
  
  /**
   * Validate base configuration parameters
   */
  private validateConfig(config: StrategyConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Strategy name is required');
    }
    
    if (config.maxPositionSize <= 0 || config.maxPositionSize > 1) {
      throw new Error('Max position size must be between 0 and 1');
    }
    
    if (config.minConfidence < 0 || config.minConfidence > 1) {
      throw new Error('Min confidence must be between 0 and 1');
    }
    
    // Call strategy-specific validation
    this.validateStrategyConfig(config);
  }
  
  /**
   * Helper method to get the latest price from market data
   */
  protected getLatestPrice(marketData: MarketDataPoint[]): number {
    if (marketData.length === 0) {
      throw new Error('No market data available');
    }
    
    return marketData[marketData.length - 1].close.toNumber();
  }
  
  /**
   * Helper method to get closing prices as array of numbers
   */
  protected getClosingPrices(marketData: MarketDataPoint[]): number[] {
    return marketData.map(point => point.close.toNumber());
  }
  
  /**
   * Helper method to get volumes as array of numbers
   */
  protected getVolumes(marketData: MarketDataPoint[]): number[] {
    return marketData.map(point => Number(point.volume));
  }
  
  /**
   * Log strategy analysis for debugging
   */
  protected log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${this.getName()}: ${message}`, data || '');
  }
}