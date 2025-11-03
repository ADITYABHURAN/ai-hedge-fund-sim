import { BaseStrategy, TradeSignal, MarketDataPoint, StrategyConfig } from './BaseStrategy';
import { simpleMovingAverage, movingAverageCrossover } from './indicators/TechnicalIndicators';

/**
 * Moving Average Strategy Configuration
 */
interface MovingAverageConfig extends StrategyConfig {
  parameters: {
    /** Fast moving average period */
    fastPeriod: number;
    
    /** Slow moving average period */
    slowPeriod: number;
    
    /** Minimum volume threshold for trade execution */
    minVolume?: number;
    
    /** Use exponential MA instead of simple MA */
    useEMA?: boolean;
  };
}

/**
 * Moving Average Crossover Strategy
 * 
 * This strategy generates buy signals when the fast moving average crosses above
 * the slow moving average (golden cross) and sell signals when the fast MA
 * crosses below the slow MA (death cross).
 * 
 * Classic configuration: 20-day and 50-day moving averages
 */
export class MovingAverageStrategy extends BaseStrategy {
  protected config: MovingAverageConfig;
  
  constructor(config: MovingAverageConfig) {
    super(config);
    this.config = config;
  }
  
  getName(): string {
    const { fastPeriod, slowPeriod } = this.config.parameters;
    return `Moving Average Strategy (${fastPeriod}/${slowPeriod})`;
  }
  
  getType(): string {
    return 'moving-average';
  }
  
  getDescription(): string {
    const { fastPeriod, slowPeriod } = this.config.parameters;
    return `Golden Cross/Death Cross strategy using ${fastPeriod} and ${slowPeriod} day moving averages. ` +
           `Generates buy signals on bullish crossovers and sell signals on bearish crossovers.`;
  }
  
  getMinDataPoints(): number {
    // Need at least slow period + 5 extra points for reliable signals
    return this.config.parameters.slowPeriod + 5;
  }
  
  protected validateStrategyConfig(config: StrategyConfig): void {
    const maConfig = config as MovingAverageConfig;
    
    if (!maConfig.parameters.fastPeriod || !maConfig.parameters.slowPeriod) {
      throw new Error('Fast and slow periods are required for Moving Average strategy');
    }
    
    if (maConfig.parameters.fastPeriod >= maConfig.parameters.slowPeriod) {
      throw new Error('Fast period must be less than slow period');
    }
    
    if (maConfig.parameters.fastPeriod < 5 || maConfig.parameters.slowPeriod < 10) {
      throw new Error('Periods too short: fast >= 5, slow >= 10');
    }
    
    if (maConfig.parameters.minVolume && maConfig.parameters.minVolume < 0) {
      throw new Error('Minimum volume cannot be negative');
    }
  }
  
  async analyze(
    ticker: string, 
    marketData: MarketDataPoint[], 
    currentPosition: number = 0
  ): Promise<TradeSignal> {
    try {
      this.log(`Analyzing ${ticker} with ${marketData.length} data points`);
      
      const { fastPeriod, slowPeriod, minVolume } = this.config.parameters;
      
      // Extract price and volume data
      const closingPrices = this.getClosingPrices(marketData);
      const volumes = this.getVolumes(marketData);
      const currentPrice = this.getLatestPrice(marketData);
      const currentVolume = volumes[volumes.length - 1];
      
      // Calculate moving averages
      const fastMA = simpleMovingAverage(closingPrices, fastPeriod);
      const slowMA = simpleMovingAverage(closingPrices, slowPeriod);
      
      // Check for crossovers
      const crossover = movingAverageCrossover(fastMA, slowMA, 1);
      
      // Get current MA values
      const currentFastMA = fastMA[fastMA.length - 1];
      const currentSlowMA = slowMA[slowMA.length - 1];
      
      // Check volume threshold if specified
      if (minVolume && currentVolume < minVolume) {
        this.log(`Volume too low: ${currentVolume} < ${minVolume}`);
        return {
          action: 'HOLD',
          confidence: 0,
          reason: 'Volume below minimum threshold',
          indicators: {
            fastMA: currentFastMA,
            slowMA: currentSlowMA,
            volume: currentVolume,
            minVolume: minVolume
          }
        };
      }
      
      // Calculate trend strength (distance between MAs as percentage of price)
      const maDifference = Math.abs(currentFastMA - currentSlowMA);
      const trendStrength = (maDifference / currentPrice) * 100;
      
      // Base confidence on trend strength and volume
      let confidence = Math.min(trendStrength / 2, 0.8); // Max 80% confidence
      
      // Boost confidence for higher volume
      if (volumes.length >= 10) {
        const avgVolume = volumes.slice(-10).reduce((sum: number, vol: number) => sum + vol, 0) / 10;
        const volumeRatio = currentVolume / avgVolume;
        confidence *= Math.min(volumeRatio, 1.5); // Up to 50% boost for high volume
      }
      
      // Determine action based on crossovers and current positioning
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let reason = '';
      let positionSize = 0.25; // Default 25% position size
      let stopLoss: number | undefined;
      let takeProfit: number | undefined;
      
      if (crossover.bullishCrossover) {
        // Golden Cross - Buy signal
        action = 'BUY';
        reason = 'Bullish crossover detected (Golden Cross)';
        confidence = Math.max(confidence, 0.6); // Minimum 60% for crossovers
        
        // Set stop loss below slow MA
        stopLoss = currentSlowMA * 0.95; // 5% below slow MA
        takeProfit = currentPrice * 1.1; // 10% profit target
        
        // Increase position size for strong trends
        if (trendStrength > 3) {
          positionSize = 0.4; // 40% for strong trends
        }
        
      } else if (crossover.bearishCrossover) {
        // Death Cross - Sell signal (if we have position)
        if (currentPosition > 0) {
          action = 'SELL';
          reason = 'Bearish crossover detected (Death Cross)';
          confidence = Math.max(confidence, 0.6);
          positionSize = 1.0; // Sell entire position
        } else {
          reason = 'Bearish crossover detected but no position to sell';
        }
        
      } else if (currentFastMA > currentSlowMA) {
        // Fast MA above slow MA - Uptrend
        if (currentPosition === 0 && trendStrength > 2) {
          // No position and strong uptrend - consider buying
          action = 'BUY';
          reason = 'Strong uptrend continuation';
          confidence *= 0.7; // Reduce confidence for trend following
          positionSize = 0.2; // Smaller position for trend following
        } else {
          reason = 'In uptrend - holding current position';
        }
        
      } else if (currentFastMA < currentSlowMA) {
        // Fast MA below slow MA - Downtrend
        if (currentPosition > 0 && trendStrength > 2) {
          // Have position and strong downtrend - consider selling
          action = 'SELL';
          reason = 'Strong downtrend - exit position';
          confidence *= 0.6; // Lower confidence for trend exit
          positionSize = 0.5; // Sell half position
        } else {
          reason = 'In downtrend - avoiding new positions';
        }
      }
      
      // Ensure confidence is within bounds
      confidence = Math.max(0, Math.min(1, confidence));
      
      const signal: TradeSignal = {
        action,
        confidence,
        positionSize,
        stopLoss,
        takeProfit,
        reason,
        indicators: {
          fastMA: currentFastMA,
          slowMA: currentSlowMA,
          trendStrength: trendStrength,
          volume: currentVolume,
          bullishCrossover: crossover.bullishCrossover ? 1 : 0,
          bearishCrossover: crossover.bearishCrossover ? 1 : 0
        }
      };
      
      this.log(`Signal generated: ${action} (${confidence.toFixed(3)}) - ${reason}`);
      
      return signal;
      
    } catch (error) {
      this.log(`Error in analysis: ${error}`);
      
      return {
        action: 'HOLD',
        confidence: 0,
        reason: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
  
  /**
   * Create a default Moving Average strategy configuration
   */
  static createDefaultConfig(name: string = 'MA 20/50 Strategy'): MovingAverageConfig {
    return {
      name,
      type: 'moving-average',
      maxPositionSize: 0.3, // Max 30% of fund
      minConfidence: 0.6,   // Minimum 60% confidence
      isActive: true,
      parameters: {
        fastPeriod: 20,
        slowPeriod: 50,
        minVolume: 100000, // Minimum 100k volume
        useEMA: false
      }
    };
  }
  
  /**
   * Create an aggressive Moving Average strategy configuration
   */
  static createAggressiveConfig(name: string = 'Aggressive MA 10/30 Strategy'): MovingAverageConfig {
    return {
      name,
      type: 'moving-average',
      maxPositionSize: 0.5, // Max 50% of fund
      minConfidence: 0.5,   // Lower confidence threshold
      isActive: true,
      parameters: {
        fastPeriod: 10,
        slowPeriod: 30,
        minVolume: 50000,  // Lower volume requirement
        useEMA: false
      }
    };
  }
  
  /**
   * Create a conservative Moving Average strategy configuration
   */
  static createConservativeConfig(name: string = 'Conservative MA 50/200 Strategy'): MovingAverageConfig {
    return {
      name,
      type: 'moving-average',
      maxPositionSize: 0.15, // Max 15% of fund
      minConfidence: 0.7,    // Higher confidence required
      isActive: true,
      parameters: {
        fastPeriod: 50,
        slowPeriod: 200,
        minVolume: 200000,  // Higher volume requirement
        useEMA: false
      }
    };
  }
}