import { Router, Request, Response } from 'express';
import { AutoTradingEngine, AutoTradeConfig } from './AutoTradingEngine';
import { prisma } from './server';

const router = Router();
const autoTradingEngine = new AutoTradingEngine(prisma);

/**
 * POST /api/auto-trading/start
 * Start automated trading session for a fund
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const {
      fundId,
      tickers = [],
      maxTradesPerDay = 10,
      minConfidenceThreshold = 0.6,
      executionMode = 'PAPER',
      cooldownMinutes = 15,
      maxPositionValue = 10000,
      allowedStrategies = []
    } = req.body;

    if (!fundId) {
      return res.status(400).json({
        success: false,
        error: 'fundId is required'
      });
    }

    if (!tickers || tickers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one ticker must be specified'
      });
    }

    const config: AutoTradeConfig = {
      enabled: true,
      fundId: parseInt(fundId),
      tickers: tickers.map((t: string) => t.toUpperCase()),
      maxTradesPerDay: parseInt(maxTradesPerDay),
      minConfidenceThreshold: parseFloat(minConfidenceThreshold),
      executionMode: executionMode as 'PAPER' | 'LIVE',
      cooldownMinutes: parseInt(cooldownMinutes),
      maxPositionValue: parseFloat(maxPositionValue),
      allowedStrategies: allowedStrategies || []
    };

    const result = await autoTradingEngine.startAutoTrading(config);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Auto-trading start error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start auto-trading'
    });
  }
});

/**
 * POST /api/auto-trading/stop
 * Stop automated trading session
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const result = await autoTradingEngine.stopAutoTrading(sessionId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Auto-trading stop error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop auto-trading'
    });
  }
});

/**
 * POST /api/auto-trading/pause
 * Pause automated trading session
 */
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const result = await autoTradingEngine.pauseAutoTrading(sessionId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Auto-trading pause error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause auto-trading'
    });
  }
});

/**
 * POST /api/auto-trading/resume
 * Resume paused automated trading session
 */
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const result = await autoTradingEngine.resumeAutoTrading(sessionId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Auto-trading resume error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume auto-trading'
    });
  }
});

/**
 * GET /api/auto-trading/sessions
 * Get all active automated trading sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = autoTradingEngine.getActiveSessions();

    // Add summary statistics
    const summary = {
      totalSessions: sessions.length,
      runningSessions: sessions.filter(s => s.status === 'RUNNING').length,
      pausedSessions: sessions.filter(s => s.status === 'PAUSED').length,
      errorSessions: sessions.filter(s => s.status === 'ERROR').length,
      totalTrades: sessions.reduce((sum, s) => sum + s.totalTrades, 0),
      successfulTrades: sessions.reduce((sum, s) => sum + s.successfulTrades, 0)
    };

    res.json({
      success: true,
      data: {
        sessions: sessions.map(session => ({
          sessionId: session.sessionId,
          fundId: session.fundId,
          status: session.status,
          startTime: session.startTime,
          endTime: session.endTime,
          totalTrades: session.totalTrades,
          successfulTrades: session.successfulTrades,
          totalPnL: session.totalPnL,
          config: {
            tickers: session.config.tickers,
            executionMode: session.config.executionMode,
            maxTradesPerDay: session.config.maxTradesPerDay,
            minConfidenceThreshold: session.config.minConfidenceThreshold,
            cooldownMinutes: session.config.cooldownMinutes
          }
        })),
        summary
      }
    });

  } catch (error) {
    console.error('❌ Auto-trading sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trading sessions'
    });
  }
});

/**
 * GET /api/auto-trading/sessions/:sessionId
 * Get detailed information about a specific session
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = autoTradingEngine.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: `Session ${sessionId} not found`
      });
    }

    // Calculate real-time statistics
    const now = new Date();
    const duration = session.endTime ? 
      session.endTime.getTime() - session.startTime.getTime() :
      now.getTime() - session.startTime.getTime();

    const successRate = session.totalTrades > 0 ? 
      session.successfulTrades / session.totalTrades : 0;

    // Recent activity (last 10 trades)
    const recentActivity = session.results
      .slice(-10)
      .map(result => ({
        timestamp: result.timestamp,
        ticker: result.ticker,
        action: result.action,
        quantity: result.quantity,
        price: result.price,
        success: result.success,
        strategy: result.strategy,
        confidence: Math.round(result.confidence * 100),
        error: result.error
      }));

    // Performance by ticker
    const performanceByTicker = session.config.tickers.map(ticker => {
      const tickerResults = session.results.filter(r => r.ticker === ticker);
      const tickerTrades = tickerResults.length;
      const tickerSuccessful = tickerResults.filter(r => r.success).length;
      const avgConfidence = tickerResults.length > 0 ?
        tickerResults.reduce((sum, r) => sum + r.confidence, 0) / tickerResults.length : 0;

      return {
        ticker,
        trades: tickerTrades,
        successfulTrades: tickerSuccessful,
        successRate: tickerTrades > 0 ? tickerSuccessful / tickerTrades : 0,
        avgConfidence: Math.round(avgConfidence * 100),
        lastTradeTime: tickerResults.length > 0 ? 
          tickerResults[tickerResults.length - 1].timestamp : null
      };
    });

    res.json({
      success: true,
      data: {
        session: {
          sessionId: session.sessionId,
          fundId: session.fundId,
          status: session.status,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: Math.round(duration / 1000 / 60), // minutes
          totalTrades: session.totalTrades,
          successfulTrades: session.successfulTrades,
          successRate: Math.round(successRate * 100),
          totalPnL: session.totalPnL,
          config: session.config
        },
        recentActivity,
        performanceByTicker,
        statistics: {
          tradesPerHour: duration > 0 ? 
            Math.round((session.totalTrades / (duration / 1000 / 60 / 60)) * 10) / 10 : 0,
          avgExecutionTime: session.results.length > 0 ?
            Math.round(session.results.reduce((sum, r) => sum + r.executionTime, 0) / session.results.length) : 0,
          strategiesUsed: [...new Set(session.results.map(r => r.strategy))],
          errorRate: session.totalTrades > 0 ?
            Math.round(((session.totalTrades - session.successfulTrades) / session.totalTrades) * 100) : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Auto-trading session detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session details'
    });
  }
});

/**
 * GET /api/auto-trading/config/template
 * Get configuration template with default values and validation rules
 */
router.get('/config/template', async (req: Request, res: Response) => {
  try {
    const template = {
      fundId: {
        type: 'number',
        required: true,
        description: 'ID of the fund to trade with',
        example: 1
      },
      tickers: {
        type: 'array',
        required: true,
        description: 'Array of stock tickers to trade',
        example: ['AAPL', 'MSFT', 'GOOGL'],
        minItems: 1,
        maxItems: 20
      },
      maxTradesPerDay: {
        type: 'number',
        required: false,
        default: 10,
        min: 1,
        max: 1000,
        description: 'Maximum number of trades to execute per day'
      },
      minConfidenceThreshold: {
        type: 'number',
        required: false,
        default: 0.6,
        min: 0.1,
        max: 1.0,
        description: 'Minimum strategy confidence required to execute trades'
      },
      executionMode: {
        type: 'string',
        required: false,
        default: 'PAPER',
        options: ['PAPER', 'LIVE'],
        description: 'PAPER for simulation, LIVE for actual trading'
      },
      cooldownMinutes: {
        type: 'number',
        required: false,
        default: 15,
        min: 1,
        max: 1440,
        description: 'Minutes to wait between trading cycles'
      },
      maxPositionValue: {
        type: 'number',
        required: false,
        default: 10000,
        min: 1000,
        description: 'Maximum dollar value for a single position'
      },
      allowedStrategies: {
        type: 'array',
        required: false,
        default: [],
        description: 'Specific strategies to use (empty = all strategies)',
        example: ['Moving Average Strategy (20/50)', 'Moving Average Strategy (50/200)']
      }
    };

    res.json({
      success: true,
      data: {
        template,
        example: {
          fundId: 1,
          tickers: ['AAPL', 'MSFT'],
          maxTradesPerDay: 5,
          minConfidenceThreshold: 0.7,
          executionMode: 'PAPER',
          cooldownMinutes: 30,
          maxPositionValue: 5000,
          allowedStrategies: []
        }
      }
    });

  } catch (error) {
    console.error('❌ Auto-trading config template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration template'
    });
  }
});

/**
 * POST /api/auto-trading/cleanup
 * Clean up old completed sessions
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const beforeCount = autoTradingEngine.getActiveSessions().length;
    autoTradingEngine.cleanupSessions();
    const afterCount = autoTradingEngine.getActiveSessions().length;
    const cleaned = beforeCount - afterCount;

    res.json({
      success: true,
      data: {
        message: `Cleaned up ${cleaned} old sessions`,
        sessionsRemaining: afterCount,
        sessionsCleaned: cleaned
      }
    });

  } catch (error) {
    console.error('❌ Auto-trading cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup sessions'
    });
  }
});

export default router;