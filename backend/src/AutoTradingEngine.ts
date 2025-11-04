import { PrismaClient } from '@prisma/client';
import { StrategyEngine } from './strategies/StrategyEngine';
import { RiskManager } from './RiskManager';
import { PositionController } from './controllers/positionController';

export interface AutoTradeConfig {
  enabled: boolean;
  fundId: number;
  tickers: string[];
  maxTradesPerDay: number;
  minConfidenceThreshold: number;
  executionMode: 'PAPER' | 'LIVE';
  cooldownMinutes: number;
  maxPositionValue: number;
  allowedStrategies: string[];
}

export interface AutoTradeResult {
  success: boolean;
  fundId: number;
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  price: number;
  strategy: string;
  confidence: number;
  timestamp: Date;
  executionTime: number;
  error?: string;
}

export interface AutoTradeSession {
  sessionId: string;
  fundId: number;
  startTime: Date;
  endTime?: Date;
  config: AutoTradeConfig;
  results: AutoTradeResult[];
  totalTrades: number;
  successfulTrades: number;
  totalPnL: number;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';
}

/**
 * Automated Trading Engine
 * Executes strategy recommendations automatically based on configuration
 */
export class AutoTradingEngine {
  private prisma: PrismaClient;
  private strategyEngine: StrategyEngine;
  private riskManager: RiskManager;
  private positionController: PositionController;
  private sessions: Map<string, AutoTradeSession> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.strategyEngine = new StrategyEngine();
    this.riskManager = new RiskManager(prisma);
    this.positionController = new PositionController();
  }

  /**
   * Start automated trading session for a fund
   */
  async startAutoTrading(config: AutoTradeConfig): Promise<{ sessionId: string; message: string }> {
    // Validate configuration
    const validation = await this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Generate unique session ID
    const sessionId = `AUTO_${config.fundId}_${Date.now()}`;

    // Create trading session
    const session: AutoTradeSession = {
      sessionId,
      fundId: config.fundId,
      startTime: new Date(),
      config,
      results: [],
      totalTrades: 0,
      successfulTrades: 0,
      totalPnL: 0,
      status: 'RUNNING'
    };

    this.sessions.set(sessionId, session);

    // Start trading interval
    const interval = setInterval(async () => {
      try {
        await this.executeTradingCycle(sessionId);
      } catch (error) {
        console.error(`❌ Auto-trading error for session ${sessionId}:`, error);
        await this.handleTradingError(sessionId, error);
      }
    }, config.cooldownMinutes * 60 * 1000); // Convert minutes to milliseconds

    this.intervals.set(sessionId, interval);

    console.log(`🤖 Auto-trading started for Fund ${config.fundId} (Session: ${sessionId})`);
    console.log(`📋 Config: ${config.tickers.length} tickers, ${config.maxTradesPerDay} max trades/day`);
    console.log(`🎯 Min confidence: ${(config.minConfidenceThreshold * 100).toFixed(1)}%, Mode: ${config.executionMode}`);

    return {
      sessionId,
      message: `Auto-trading session started successfully for Fund ${config.fundId}`
    };
  }

  /**
   * Stop automated trading session
   */
  async stopAutoTrading(sessionId: string): Promise<{ message: string; summary: any }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Trading session ${sessionId} not found`);
    }

    // Clear interval
    const interval = this.intervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(sessionId);
    }

    // Update session status
    session.status = 'STOPPED';
    session.endTime = new Date();

    // Generate session summary
    const summary = await this.generateSessionSummary(session);

    console.log(`🛑 Auto-trading stopped for session ${sessionId}`);
    console.log(`📊 Session Summary: ${session.totalTrades} trades, ${(summary.totalReturn * 100).toFixed(2)}% return`);

    return {
      message: `Auto-trading session ${sessionId} stopped successfully`,
      summary
    };
  }

  /**
   * Execute one trading cycle for all configured tickers
   */
  private async executeTradingCycle(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'RUNNING') {
      return;
    }

    console.log(`🔄 Executing trading cycle for session ${sessionId}`);
    const cycleStart = Date.now();

    // Check daily trade limit
    const today = new Date().toISOString().split('T')[0];
    const todayTrades = session.results.filter(result => 
      result.timestamp.toISOString().split('T')[0] === today
    ).length;

    if (todayTrades >= session.config.maxTradesPerDay) {
      console.log(`⏸️ Daily trade limit reached (${todayTrades}/${session.config.maxTradesPerDay}) for session ${sessionId}`);
      return;
    }

    // Process each ticker
    for (const ticker of session.config.tickers) {
      try {
        const tradeResult = await this.processTicker(sessionId, ticker);
        if (tradeResult) {
          session.results.push(tradeResult);
          if (tradeResult.success) {
            session.successfulTrades++;
          }
          session.totalTrades++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${ticker} in session ${sessionId}:`, error);
        
        const errorResult: AutoTradeResult = {
          success: false,
          fundId: session.fundId,
          ticker,
          action: 'HOLD',
          quantity: 0,
          price: 0,
          strategy: 'ERROR',
          confidence: 0,
          timestamp: new Date(),
          executionTime: 0,
          error: error instanceof Error ? error.message : String(error)
        };
        
        session.results.push(errorResult);
      }
    }

    const cycleTime = Date.now() - cycleStart;
    console.log(`✅ Trading cycle completed in ${cycleTime}ms for session ${sessionId}`);
  }

  /**
   * Process trading decision for a single ticker
   */
  private async processTicker(sessionId: string, ticker: string): Promise<AutoTradeResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const startTime = Date.now();
    
    console.log(`🔍 Analyzing ${ticker} for session ${sessionId}`);

    // Get strategy analysis
    const analysis = await this.strategyEngine.executeAllStrategies(session.fundId, ticker);
    
    // Filter strategies if specified
    let filteredAnalysis = analysis;
    if (session.config.allowedStrategies.length > 0) {
      filteredAnalysis.strategyResults = analysis.strategyResults.filter((result: any) =>
        session.config.allowedStrategies.includes(result.strategyName)
      );
    }

    // Check if consensus meets confidence threshold
    if (filteredAnalysis.avgConfidence < session.config.minConfidenceThreshold) {
      console.log(`⏭️ Skipping ${ticker}: confidence ${(filteredAnalysis.avgConfidence * 100).toFixed(1)}% < ${(session.config.minConfidenceThreshold * 100).toFixed(1)}%`);
      return null;
    }

    // Skip HOLD signals
    if (filteredAnalysis.consensus === 'HOLD') {
      console.log(`⏸️ No action for ${ticker}: consensus is HOLD`);
      return null;
    }

    // Get current market price (simplified - would use real-time data)
    const latestPrice = await this.getCurrentPrice(ticker);
    if (!latestPrice) {
      throw new Error(`No current price available for ${ticker}`);
    }

    // Validate trade against risk limits
    const riskValidation = await this.riskManager.validateTradeRisk(
      session.fundId,
      ticker,
      filteredAnalysis.recommendedSize,
      latestPrice
    );

    if (!riskValidation.isValid) {
      console.log(`🚫 Risk validation failed for ${ticker}: ${riskValidation.violations.join(', ')}`);
      return {
        success: false,
        fundId: session.fundId,
        ticker,
        action: filteredAnalysis.consensus,
        quantity: filteredAnalysis.recommendedSize,
        price: latestPrice,
        strategy: 'RISK_BLOCKED',
        confidence: filteredAnalysis.avgConfidence,
        timestamp: new Date(),
        executionTime: Date.now() - startTime,
        error: `Risk limits exceeded: ${riskValidation.violations.join(', ')}`
      };
    }

    // Check position value limit
    const positionValue = filteredAnalysis.recommendedSize * latestPrice;
    if (positionValue > session.config.maxPositionValue) {
      console.log(`💰 Position value $${positionValue.toLocaleString()} exceeds limit $${session.config.maxPositionValue.toLocaleString()}`);
      return null;
    }

    // Execute trade based on mode
    let executionResult;
    if (session.config.executionMode === 'PAPER') {
      executionResult = await this.executePaperTrade(session, ticker, filteredAnalysis, latestPrice);
    } else {
      executionResult = await this.executeLiveTrade(session, ticker, filteredAnalysis, latestPrice);
    }

    const executionTime = Date.now() - startTime;
    
    console.log(`${executionResult.success ? '✅' : '❌'} ${ticker}: ${filteredAnalysis.consensus} ${filteredAnalysis.recommendedSize} shares @ $${latestPrice} (${(filteredAnalysis.avgConfidence * 100).toFixed(1)}%)`);

    return {
      success: executionResult.success,
      fundId: session.fundId,
      ticker,
      action: filteredAnalysis.consensus,
      quantity: filteredAnalysis.recommendedSize,
      price: latestPrice,
      strategy: this.getTopStrategy(filteredAnalysis),
      confidence: filteredAnalysis.avgConfidence,
      timestamp: new Date(),
      executionTime,
      error: executionResult.error
    };
  }

  /**
   * Execute paper trading (simulation only)
   */
  private async executePaperTrade(
    session: AutoTradeSession,
    ticker: string,
    analysis: any,
    price: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Simulate trade execution
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100)); // Simulate network delay
      
      console.log(`📝 PAPER TRADE: ${analysis.consensus} ${analysis.recommendedSize} ${ticker} @ $${price}`);
      
      // In paper mode, we just log the trade but don't actually execute it
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute live trading (actual trades)
   */
  private async executeLiveTrade(
    session: AutoTradeSession,
    ticker: string,
    analysis: any,
    price: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Create mock request object for position controller
      const mockReq = {
        user: { userId: 1 }, // Would get from session/fund owner
        body: {
          fundId: session.fundId,
          ticker,
          quantity: analysis.recommendedSize,
          price
        }
      };

      const mockRes = {
        status: (code: number) => ({
          json: (data: any) => data
        }),
        json: (data: any) => data
      };

      if (analysis.consensus === 'BUY') {
        const result = await PositionController.buyStock(mockReq as any, mockRes as any);
        return { success: true }; // Assume success if no error thrown
      } else if (analysis.consensus === 'SELL') {
        const result = await PositionController.sellStock(mockReq as any, mockRes as any);
        return { success: true }; // Assume success if no error thrown
      }

      return { success: false, error: 'Invalid action' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get current price for a ticker (simplified implementation)
   */
  private async getCurrentPrice(ticker: string): Promise<number | null> {
    try {
      const latestData = await this.prisma.stockData.findFirst({
        where: { ticker: ticker.toUpperCase() },
        orderBy: { date: 'desc' }
      });

      return latestData ? Number(latestData.close) : null;
    } catch (error) {
      console.error(`Error fetching price for ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Get the top performing strategy from analysis
   */
  private getTopStrategy(analysis: any): string {
    if (!analysis.strategyResults.length) return 'UNKNOWN';
    
    const sortedStrategies = analysis.strategyResults
      .filter((s: any) => s.shouldExecute)
      .sort((a: any, b: any) => b.signal.confidence - a.signal.confidence);
    
    return sortedStrategies.length > 0 ? sortedStrategies[0].strategyName : 'CONSENSUS';
  }

  /**
   * Validate auto-trading configuration
   */
  private async validateConfig(config: AutoTradeConfig): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check fund exists
    const fund = await this.prisma.fund.findUnique({
      where: { id: config.fundId }
    });

    if (!fund) {
      errors.push(`Fund ${config.fundId} does not exist`);
    }

    // Validate tickers
    if (!config.tickers || config.tickers.length === 0) {
      errors.push('At least one ticker must be specified');
    }

    // Validate limits
    if (config.maxTradesPerDay < 1 || config.maxTradesPerDay > 1000) {
      errors.push('Max trades per day must be between 1 and 1000');
    }

    if (config.minConfidenceThreshold < 0.1 || config.minConfidenceThreshold > 1.0) {
      errors.push('Min confidence threshold must be between 0.1 and 1.0');
    }

    if (config.cooldownMinutes < 1 || config.cooldownMinutes > 1440) {
      errors.push('Cooldown minutes must be between 1 and 1440 (24 hours)');
    }

    if (config.maxPositionValue < 1000) {
      errors.push('Max position value must be at least $1,000');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Handle trading errors
   */
  private async handleTradingError(sessionId: string, error: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'ERROR';
    console.error(`🚨 Trading session ${sessionId} encountered critical error:`, error);

    // Could implement error recovery logic here
    // For now, we'll pause the session
    await this.pauseAutoTrading(sessionId);
  }

  /**
   * Pause auto-trading session
   */
  async pauseAutoTrading(sessionId: string): Promise<{ message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Trading session ${sessionId} not found`);
    }

    const interval = this.intervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
    }

    session.status = 'PAUSED';
    console.log(`⏸️ Auto-trading paused for session ${sessionId}`);

    return { message: `Trading session ${sessionId} paused successfully` };
  }

  /**
   * Resume auto-trading session
   */
  async resumeAutoTrading(sessionId: string): Promise<{ message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Trading session ${sessionId} not found`);
    }

    if (session.status !== 'PAUSED') {
      throw new Error(`Cannot resume session ${sessionId} - current status: ${session.status}`);
    }

    // Restart trading interval
    const interval = setInterval(async () => {
      try {
        await this.executeTradingCycle(sessionId);
      } catch (error) {
        console.error(`❌ Auto-trading error for session ${sessionId}:`, error);
        await this.handleTradingError(sessionId, error);
      }
    }, session.config.cooldownMinutes * 60 * 1000);

    this.intervals.set(sessionId, interval);
    session.status = 'RUNNING';

    console.log(`▶️ Auto-trading resumed for session ${sessionId}`);

    return { message: `Trading session ${sessionId} resumed successfully` };
  }

  /**
   * Generate session summary and performance metrics
   */
  private async generateSessionSummary(session: AutoTradeSession): Promise<any> {
    const duration = session.endTime ? 
      session.endTime.getTime() - session.startTime.getTime() : 
      Date.now() - session.startTime.getTime();

    const successRate = session.totalTrades > 0 ? 
      session.successfulTrades / session.totalTrades : 0;

    // Calculate total P&L from successful trades (simplified)
    let totalPnL = 0;
    const buyTrades = session.results.filter(r => r.success && r.action === 'BUY');
    const sellTrades = session.results.filter(r => r.success && r.action === 'SELL');
    
    // Simple P&L calculation (would be more complex in reality)
    totalPnL = sellTrades.length * 100 - buyTrades.length * 100; // Placeholder calculation

    return {
      sessionId: session.sessionId,
      duration: Math.round(duration / 1000 / 60), // minutes
      totalTrades: session.totalTrades,
      successfulTrades: session.successfulTrades,
      successRate: successRate,
      totalPnL: totalPnL,
      totalReturn: totalPnL / 100000, // Assuming $100k initial capital
      avgTradesPerHour: session.totalTrades / (duration / 1000 / 60 / 60),
      tickersTraded: [...new Set(session.results.map(r => r.ticker))].length,
      strategiesUsed: [...new Set(session.results.map(r => r.strategy))],
      config: session.config
    };
  }

  /**
   * Get all active trading sessions
   */
  getActiveSessions(): AutoTradeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AutoTradeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up completed sessions
   */
  cleanupSessions(): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === 'STOPPED' || session.status === 'ERROR') {
        // Keep sessions for 24 hours after completion
        const completionTime = session.endTime || new Date();
        const hoursSinceCompletion = (Date.now() - completionTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceCompletion > 24) {
          this.sessions.delete(sessionId);
          console.log(`🧹 Cleaned up old session: ${sessionId}`);
        }
      }
    }
  }
}