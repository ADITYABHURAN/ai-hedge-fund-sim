import { Request, Response } from 'express';
import { StrategyEngine, StrategyPortfolioResult } from '../strategies/StrategyEngine';
import { MovingAverageStrategy } from '../strategies/MovingAverageStrategy';
import { AuthRequest } from '../server';

/**
 * Strategy Controller
 * Handles API requests for trading strategy management and execution
 */
export class StrategyController {
  private static strategyEngine = new StrategyEngine();
  
  /**
   * Initialize default strategies
   * This should be called on server startup
   */
  static initializeDefaultStrategies(): void {
    console.log('🧠 Initializing default trading strategies...');
    
    try {
      // Create and register default strategies
      const conservativeMA = new MovingAverageStrategy(
        MovingAverageStrategy.createConservativeConfig('Conservative MA 50/200')
      );
      
      const defaultMA = new MovingAverageStrategy(
        MovingAverageStrategy.createDefaultConfig('Standard MA 20/50')
      );
      
      const aggressiveMA = new MovingAverageStrategy(
        MovingAverageStrategy.createAggressiveConfig('Aggressive MA 10/30')
      );
      
      this.strategyEngine.registerStrategy(conservativeMA);
      this.strategyEngine.registerStrategy(defaultMA);
      this.strategyEngine.registerStrategy(aggressiveMA);
      
      console.log('✅ Default strategies initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize default strategies:', error);
    }
  }
  
  /**
   * Get all registered strategies
   * GET /api/strategies
   */
  static async getStrategies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const strategies = StrategyController.strategyEngine.getRegisteredStrategies();
      
      const strategyList = strategies.map(strategy => ({
        name: strategy.getName(),
        type: strategy.getType(),
        description: strategy.getDescription(),
        config: strategy.getConfig(),
        minDataPoints: strategy.getMinDataPoints()
      }));
      
      res.json({
        success: true,
        message: `Retrieved ${strategies.length} strategies`,
        data: {
          strategies: strategyList,
          totalCount: strategies.length
        }
      });
      
    } catch (error) {
      console.error('Error getting strategies:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve strategies',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Analyze a ticker using all strategies for a specific fund
   * POST /api/strategies/analyze
   */
  static async analyzeStrategies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { fundId, ticker } = req.body;
      
      // Validation
      if (!fundId || !ticker) {
        res.status(400).json({
          success: false,
          message: 'fundId and ticker are required'
        });
        return;
      }
      
      // Verify fund access (you can reuse this from PositionController)
      const { prisma } = await import('../server');
      const fund = await prisma.fund.findFirst({
        where: {
          id: fundId,
          ownerId: userId
        }
      });
      
      if (!fund) {
        res.status(404).json({
          success: false,
          message: 'Fund not found or you do not have access to it'
        });
        return;
      }
      
      console.log(`🔍 Analyzing ${ticker} for fund ${fund.name} (ID: ${fundId})`);
      
      // Execute all strategies
      const portfolioResult = await StrategyController.strategyEngine.executeAllStrategies(
        fundId, 
        ticker.toUpperCase()
      );
      
      // Format response with detailed analysis
      const response = {
        success: true,
        message: `Strategy analysis completed for ${ticker}`,
        data: {
          fund: {
            id: fund.id,
            name: fund.name
          },
          ticker: ticker.toUpperCase(),
          analysis: {
            consensus: portfolioResult.consensus,
            avgConfidence: portfolioResult.avgConfidence,
            recommendedSize: portfolioResult.recommendedSize,
            timestamp: portfolioResult.timestamp
          },
          strategies: portfolioResult.strategyResults.map(result => ({
            name: result.strategyName,
            type: result.strategyType,
            signal: {
              action: result.signal.action,
              confidence: result.signal.confidence,
              reason: result.signal.reason,
              indicators: result.signal.indicators
            },
            shouldExecute: result.shouldExecute,
            positionSize: result.positionSize,
            currentPrice: result.currentPrice,
            error: result.error
          }))
        }
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('Error analyzing strategies:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze strategies',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Execute strategy recommendations (actually place trades)
   * POST /api/strategies/execute
   */
  static async executeStrategyTrades(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { fundId, ticker, executeAll = false } = req.body;
      
      // Validation
      if (!fundId || !ticker) {
        res.status(400).json({
          success: false,
          message: 'fundId and ticker are required'
        });
        return;
      }
      
      console.log(`🚀 Executing strategy trades for ${ticker} in fund ${fundId}`);
      
      // Get strategy analysis
      const portfolioResult = await StrategyController.strategyEngine.executeAllStrategies(
        fundId, 
        ticker.toUpperCase()
      );
      
      // Check if we should execute trades
      const executableResults = portfolioResult.strategyResults.filter(
        result => result.shouldExecute && result.positionSize && result.positionSize > 0
      );
      
      if (executableResults.length === 0) {
        res.json({
          success: true,
          message: 'No strategy recommendations meet execution criteria',
          data: {
            analysis: portfolioResult,
            tradesExecuted: 0
          }
        });
        return;
      }
      
      // For now, we'll return the recommendations instead of actually executing
      // In a full implementation, you'd integrate with PositionController here
      const recommendations = executableResults.map(result => ({
        strategy: result.strategyName,
        action: result.signal.action,
        quantity: result.positionSize,
        confidence: result.signal.confidence,
        reason: result.signal.reason
      }));
      
      res.json({
        success: true,
        message: `Strategy analysis complete. ${executableResults.length} recommendations generated.`,
        data: {
          consensus: portfolioResult.consensus,
          avgConfidence: portfolioResult.avgConfidence,
          recommendedSize: portfolioResult.recommendedSize,
          recommendations,
          note: 'Actual trade execution coming in future update'
        }
      });
      
    } catch (error) {
      console.error('Error executing strategy trades:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute strategy trades',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Get strategy performance metrics (placeholder for future implementation)
   * GET /api/strategies/performance/:fundId
   */
  static async getStrategyPerformance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { fundId } = req.params;
      
      // This would contain backtesting results and live performance metrics
      // For now, return placeholder data
      
      res.json({
        success: true,
        message: 'Strategy performance metrics',
        data: {
          fundId: parseInt(fundId),
          note: 'Performance tracking coming in Phase 7B - Backtesting Engine',
          placeholder: {
            totalSignals: 0,
            winRate: 0,
            avgReturn: 0,
            sharpeRatio: 0,
            maxDrawdown: 0
          }
        }
      });
      
    } catch (error) {
      console.error('Error getting strategy performance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve strategy performance',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}