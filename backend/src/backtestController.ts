import { Router, Request, Response } from 'express';
import { BacktestEngine, BacktestConfig } from './BacktestEngine';
import { RiskManager } from './RiskManager';
import { MovingAverageStrategy } from './strategies/MovingAverageStrategy';
import { prisma } from './server';

const router = Router();
const backtestEngine = new BacktestEngine(prisma);

/**
 * POST /api/backtests/run
 * Run a backtest for a strategy
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const {
      strategyType,
      strategyConfig,
      startDate,
      endDate,
      tickers,
      initialCapital = 100000,
      commission = 5.0,
      slippage = 0.001,
      benchmarkTicker = 'SPY'
    } = req.body;

    // Validate required fields
    if (!strategyType || !startDate || !endDate || !tickers || tickers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: strategyType, startDate, endDate, tickers'
      });
    }

    // Validate date format
    if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD format'
      });
    }

    // Create strategy instance based on type
    let strategy;
    switch (strategyType.toLowerCase()) {
      case 'moving-average':
        strategy = new MovingAverageStrategy(strategyConfig || {});
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported strategy type: ${strategyType}`
        });
    }

    // Prepare backtest configuration
    const config: BacktestConfig = {
      strategyName: strategy.getName(),
      startDate,
      endDate,
      initialCapital: Number(initialCapital),
      commission: Number(commission),
      slippage: Number(slippage),
      benchmarkTicker: benchmarkTicker || undefined
    };

    // Run the backtest
    console.log(`🔄 Starting backtest`);
    const result = await backtestEngine.runBacktest(strategy, config, tickers);

    // Generate summary report
    const summary = backtestEngine.generateBacktestSummary(result);
    
    res.json({
      success: true,
      data: {
        result,
        summary: summary.split('\n') // Split for easier frontend formatting
      }
    });

  } catch (error) {
    console.error('❌ Backtest error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Backtest execution failed'
    });
  }
});

/**
 * GET /api/backtests/strategies
 * Get available strategy types for backtesting
 */
router.get('/strategies', async (req: Request, res: Response) => {
  try {
    const strategies = [
      {
        type: 'moving-average',
        name: 'Moving Average Crossover',
        description: 'Golden cross and death cross strategy using moving averages',
        parameters: {
          fastPeriod: {
            type: 'number',
            default: 20,
            min: 5,
            max: 100,
            description: 'Fast moving average period'
          },
          slowPeriod: {
            type: 'number',
            default: 50,
            min: 20,
            max: 200,
            description: 'Slow moving average period'
          },
          minConfidence: {
            type: 'number',
            default: 0.6,
            min: 0.1,
            max: 1.0,
            description: 'Minimum confidence threshold for trades'
          }
        }
      }
    ];

    res.json({
      success: true,
      data: {
        strategies,
        totalCount: strategies.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching strategies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available strategies'
    });
  }
});

/**
 * POST /api/backtests/validate
 * Validate backtest parameters without running
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      tickers,
      initialCapital = 100000
    } = req.body;

    const validation = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      dataAvailability: {} as { [ticker: string]: { available: number; requested: number } }
    };

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    
    if (start >= end) {
      validation.errors.push('Start date must be before end date');
    }
    
    if (end > today) {
      validation.errors.push('End date cannot be in the future');
    }
    
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff < 30) {
      validation.warnings.push('Backtest period is less than 30 days - results may not be statistically significant');
    }
    
    if (daysDiff > 1825) { // 5 years
      validation.warnings.push('Backtest period is longer than 5 years - processing may take some time');
    }

    // Validate initial capital
    if (initialCapital < 1000) {
      validation.warnings.push('Initial capital is less than $1,000 - may limit strategy effectiveness');
    }

    // Check data availability for each ticker
    for (const ticker of tickers) {
      const dataCount = await prisma.stockData.count({
        where: {
          ticker: ticker.toUpperCase(),
          date: {
            gte: start,
            lte: end
          }
        }
      });
      
      const requestedDays = Math.ceil(daysDiff * (5/7)); // Approximate trading days
      validation.dataAvailability[ticker.toUpperCase()] = {
        available: dataCount,
        requested: requestedDays
      };
      
      if (dataCount === 0) {
        validation.errors.push(`No market data available for ${ticker.toUpperCase()}`);
      } else if (dataCount < requestedDays * 0.8) {
        validation.warnings.push(`Limited data for ${ticker.toUpperCase()}: ${dataCount}/${requestedDays} days available`);
      }
    }

    validation.isValid = validation.errors.length === 0;

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('❌ Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation failed'
    });
  }
});

/**
 * GET /api/backtests/history/:userId
 * Get backtest history for a user (placeholder - would need database storage)
 */
router.get('/history/:userId', async (req: Request, res: Response) => {
  try {
    // This is a placeholder - in production you'd store backtest results in database
    const userId = parseInt(req.params.userId);

    // Mock history data
    const history = [
      {
        id: 1,
        strategyName: 'Moving Average Strategy (20/50)',
        tickers: ['AAPL', 'MSFT'],
        period: '2023-01-01 to 2024-01-01',
        totalReturn: 0.156,
        sharpeRatio: 1.23,
        maxDrawdown: -0.087,
        createdAt: '2024-11-03T10:00:00Z'
      },
      {
        id: 2,
        strategyName: 'Moving Average Strategy (10/30)',
        tickers: ['GOOGL', 'TSLA'],
        period: '2023-06-01 to 2024-06-01',
        totalReturn: 0.089,
        sharpeRatio: 0.89,
        maxDrawdown: -0.124,
        createdAt: '2024-11-02T14:30:00Z'
      }
    ];

    res.json({
      success: true,
      data: {
        history,
        totalCount: history.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch backtest history'
    });
  }
});

/**
 * POST /api/backtests/risk-analysis
 * Perform risk analysis on backtest results
 */
router.post('/risk-analysis', async (req: Request, res: Response) => {
  try {
    const { equity, trades } = req.body;

    if (!equity || !Array.isArray(equity)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid equity data provided'
      });
    }

    const riskManager = new RiskManager(prisma);
    
    // Calculate risk metrics from equity curve
    const returns = equity.slice(1).map((point: any) => point.dailyReturn);
    
    if (returns.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient data for risk analysis'
      });
    }

    // Sort returns for VaR calculation
    const sortedReturns = returns.slice().sort((a: number, b: number) => a - b);
    
    // Calculate risk metrics
    const varIndex = Math.floor(sortedReturns.length * 0.05);
    const valueAtRisk = Math.abs(sortedReturns[varIndex] || 0);
    
    const tailReturns = sortedReturns.slice(0, varIndex + 1);
    const expectedShortfall = tailReturns.length > 0 
      ? Math.abs(tailReturns.reduce((sum: number, ret: number) => sum + ret, 0) / tailReturns.length)
      : 0;
    
    const maximumLoss = Math.abs(Math.min(...returns));
    
    // Downside deviation
    const avgReturn = returns.reduce((sum: number, ret: number) => sum + ret, 0) / returns.length;
    const downsideReturns = returns.filter((ret: number) => ret < avgReturn);
    const downsideVariance = downsideReturns.length > 0
      ? downsideReturns.reduce((sum: number, ret: number) => sum + Math.pow(ret - avgReturn, 2), 0) / downsideReturns.length
      : 0;
    const downsideDeviation = Math.sqrt(downsideVariance * 252);

    // Calculate additional risk metrics
    const volatility = Math.sqrt(
      returns.reduce((sum: number, ret: number) => sum + Math.pow(ret - avgReturn, 2), 0) 
      / (returns.length - 1)
    ) * Math.sqrt(252);

    const riskMetrics = {
      valueAtRisk: valueAtRisk * 100, // Convert to percentage
      expectedShortfall: expectedShortfall * 100,
      maximumLoss: maximumLoss * 100,
      downsideDeviation: downsideDeviation * 100,
      volatility: volatility * 100,
      skewness: calculateSkewness(returns),
      kurtosis: calculateKurtosis(returns)
    };

    res.json({
      success: true,
      data: {
        riskMetrics,
        analysis: {
          riskLevel: getRiskLevel(riskMetrics),
          recommendations: getRiskRecommendations(riskMetrics)
        }
      }
    });

  } catch (error) {
    console.error('❌ Risk analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Risk analysis failed'
    });
  }
});

/**
 * Helper function to calculate skewness
 */
function calculateSkewness(returns: number[]): number {
  const n = returns.length;
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / n;
  
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  const skewness = returns.reduce((sum, ret) => sum + Math.pow((ret - mean) / stdDev, 3), 0) / n;
  return skewness;
}

/**
 * Helper function to calculate kurtosis
 */
function calculateKurtosis(returns: number[]): number {
  const n = returns.length;
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / n;
  
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  const kurtosis = returns.reduce((sum, ret) => sum + Math.pow((ret - mean) / stdDev, 4), 0) / n;
  return kurtosis - 3; // Excess kurtosis
}

/**
 * Helper function to determine risk level
 */
function getRiskLevel(metrics: any): string {
  if (metrics.volatility > 30 || metrics.maximumLoss > 10) return 'HIGH';
  if (metrics.volatility > 20 || metrics.maximumLoss > 5) return 'MODERATE';
  return 'LOW';
}

/**
 * Helper function to generate risk recommendations
 */
function getRiskRecommendations(metrics: any): string[] {
  const recommendations = [];
  
  if (metrics.volatility > 25) {
    recommendations.push('Consider reducing position sizes to manage volatility');
  }
  
  if (metrics.maximumLoss > 8) {
    recommendations.push('Implement stop-loss mechanisms to limit maximum losses');
  }
  
  if (metrics.downsideDeviation > metrics.volatility * 0.8) {
    recommendations.push('Strategy shows significant downside risk - consider defensive adjustments');
  }
  
  if (Math.abs(metrics.skewness) > 1) {
    recommendations.push('Returns distribution is highly skewed - monitor for regime changes');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Risk profile appears reasonable for the strategy type');
  }
  
  return recommendations;
}

export default router;