import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Extended Request type for authenticated routes
interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

// Types for trading operations
interface TradeRequest {
  fundId: number;
  ticker: string;
  quantity: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
}

interface PositionSummary {
  id: number;
  ticker: string;
  totalQuantity: number;
  averagePrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  entryDate: Date;
  lastTradeDate: Date;
}

export class PositionController {
  /**
   * BUY STOCK - POST /api/positions/buy
   * Execute a buy order for a fund
   */
  static async buyStock(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { fundId, ticker, quantity, orderType = 'market', limitPrice }: TradeRequest = req.body;

      // Validation
      if (!fundId || !ticker || !quantity) {
        res.status(400).json({
          success: false,
          message: 'fundId, ticker, and quantity are required'
        });
        return;
      }

      if (quantity <= 0 || !Number.isInteger(quantity)) {
        res.status(400).json({
          success: false,
          message: 'Quantity must be a positive integer'
        });
        return;
      }

      // Verify fund ownership
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

      // Get current stock price from StockData
      const stockData = await prisma.stockData.findFirst({
        where: { ticker: ticker.toUpperCase() },
        orderBy: { date: 'desc' }
      });

      if (!stockData) {
        res.status(404).json({
          success: false,
          message: `No market data found for ticker ${ticker.toUpperCase()}`
        });
        return;
      }

      const currentPrice = stockData.close;
      const tradeValue = currentPrice.mul(quantity);

      // Check if fund has sufficient capital (simplified - assuming all capital is available)
      const currentCapital = await PositionController.calculateAvailableCapital(fundId);
      
      if (currentCapital.lt(tradeValue)) {
        res.status(400).json({
          success: false,
          message: `Insufficient funds. Required: $${tradeValue}, Available: $${currentCapital}`,
          data: {
            required: tradeValue.toNumber(),
            available: currentCapital.toNumber(),
            shortfall: tradeValue.sub(currentCapital).toNumber()
          }
        });
        return;
      }

      // Execute the buy order
      const position = await prisma.position.create({
        data: {
          fundId,
          ticker: ticker.toUpperCase(),
          entryDate: new Date(),
          quantity,
          entryPrice: currentPrice,
          isActive: true
        }
      });

      console.log(`📈 BUY ORDER EXECUTED: ${quantity} shares of ${ticker.toUpperCase()} at $${currentPrice} for fund ${fundId}`);

      res.status(201).json({
        success: true,
        message: 'Buy order executed successfully',
        data: {
          trade: {
            id: position.id,
            ticker: position.ticker,
            quantity: position.quantity,
            price: position.entryPrice.toNumber(),
            totalValue: tradeValue.toNumber(),
            timestamp: position.entryDate,
            type: 'BUY'
          },
          fund: {
            id: fund.id,
            name: fund.name,
            remainingCapital: currentCapital.sub(tradeValue).toNumber()
          }
        }
      });

    } catch (error) {
      console.error('Buy stock error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during buy order execution'
      });
    }
  }

  /**
   * SELL STOCK - POST /api/positions/sell
   * Execute a sell order for a fund
   */
  static async sellStock(req: AuthRequest, res: Response): Promise<void> {
    try {
      console.log('🔴 SELL ORDER STARTED:', req.body);
      const userId = req.user!.userId;
      const { fundId, ticker, quantity, price }: any = req.body;

      // Validation
      if (!fundId || !ticker || !quantity || !price) {
        console.log('❌ Missing required fields:', { fundId, ticker, quantity, price });
        res.status(400).json({
          success: false,
          message: 'fundId, ticker, quantity, and price are required'
        });
        return;
      }

      if (quantity <= 0 || !Number.isInteger(quantity)) {
        res.status(400).json({
          success: false,
          message: 'Quantity must be a positive integer'
        });
        return;
      }

      console.log('🔍 Verifying fund access for userId:', userId, 'fundId:', fundId);

      // Verify fund ownership
      const fund = await prisma.fund.findFirst({
        where: {
          id: fundId,
          ownerId: userId
        }
      });

      if (!fund) {
        console.log('❌ Fund not found or access denied');
        res.status(404).json({
          success: false,
          message: 'Fund not found or you do not have access to it'
        });
        return;
      }

      console.log('✅ Fund found:', fund.name);

      // Check available positions for this ticker
      console.log('🔍 Checking available shares...');
      const availableShares = await PositionController.getAvailableShares(fundId, ticker.toUpperCase());
      console.log('📊 Available shares:', availableShares);
      
      if (availableShares < quantity) {
        res.status(400).json({
          success: false,
          message: `Insufficient shares to sell. Available: ${availableShares}, Requested: ${quantity}`
        });
        return;
      }

      // Use provided price instead of fetching from database
      const sellPrice = new Decimal(price);
      const tradeValue = sellPrice.mul(quantity);

      console.log('💰 Executing FIFO sell...');
      
      // Execute sell using FIFO (First In, First Out)
      const soldPositions = await PositionController.executeFIFOSell(fundId, ticker.toUpperCase(), quantity, sellPrice);

      console.log(`📉 SELL ORDER EXECUTED: ${quantity} shares of ${ticker.toUpperCase()} at $${sellPrice} for fund ${fundId}`);

      // Calculate P&L for this trade
      const totalCostBasis = soldPositions.reduce((sum, pos) => sum + (pos.quantity * pos.entryPrice), 0);
      const realizedPnL = tradeValue.toNumber() - totalCostBasis;

      console.log('🎉 SELL ORDER COMPLETED SUCCESSFULLY');

      res.json({
        success: true,
        message: 'Sell order executed successfully',
        data: {
          trade: {
            ticker: ticker.toUpperCase(),
            quantity,
            price: sellPrice.toNumber(),
            totalValue: tradeValue.toNumber(),
            timestamp: new Date(),
            type: 'SELL'
          },
          pnl: {
            costBasis: totalCostBasis,
            saleValue: tradeValue.toNumber(),
            realizedPnL: realizedPnL,
            realizedPnLPercent: totalCostBasis > 0 ? (realizedPnL / totalCostBasis) * 100 : 0
          },
          positionsClosed: soldPositions.length,
          fund: {
            id: fund.id,
            name: fund.name
          }
        }
      });

    } catch (error) {
      console.error('❌ DETAILED SELL ERROR:', error);
      console.error('❌ Stack trace:', (error as Error).stack);
      res.status(500).json({
        success: false,
        message: `Internal server error: ${(error as Error).message}`
      });
    }
  }

  /**
   * GET FUND POSITIONS - GET /api/positions/fund/:fundId
   * Get all positions for a specific fund with current values
   */
  static async getFundPositions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const fundId = parseInt(req.params.fundId, 10);

      if (isNaN(fundId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid fund ID'
        });
        return;
      }

      // Verify fund ownership
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

      // Get all active positions for the fund
      const positions = await prisma.position.findMany({
        where: {
          fundId,
          isActive: true
        },
        orderBy: { entryDate: 'desc' }
      });

      // Group positions by ticker and calculate current values
      const positionSummaries = await PositionController.calculatePositionSummaries(positions);

      // Calculate fund totals
      const totalInvested = positionSummaries.reduce((sum, pos) => sum + (pos.totalQuantity * pos.averagePrice), 0);
      const totalCurrentValue = positionSummaries.reduce((sum, pos) => sum + pos.currentValue, 0);
      const totalUnrealizedPnL = totalCurrentValue - totalInvested;

      res.json({
        success: true,
        message: `Retrieved ${positionSummaries.length} positions for fund ${fund.name}`,
        data: {
          fund: {
            id: fund.id,
            name: fund.name,
            initialCapital: fund.initialCapital.toNumber()
          },
          summary: {
            totalPositions: positionSummaries.length,
            totalInvested: Math.round(totalInvested * 100) / 100,
            totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
            totalUnrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
            totalUnrealizedPnLPercent: totalInvested > 0 ? Math.round((totalUnrealizedPnL / totalInvested) * 10000) / 100 : 0
          },
          positions: positionSummaries.map(pos => ({
            ticker: pos.ticker,
            quantity: pos.totalQuantity,
            averagePrice: Math.round(pos.averagePrice * 100) / 100,
            currentValue: Math.round(pos.currentValue * 100) / 100,
            unrealizedPnL: Math.round(pos.unrealizedPnL * 100) / 100,
            unrealizedPnLPercent: Math.round(pos.unrealizedPnLPercent * 100) / 100,
            entryDate: pos.entryDate,
            lastTradeDate: pos.lastTradeDate
          }))
        }
      });

    } catch (error) {
      console.error('Get fund positions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during position retrieval'
      });
    }
  }

  /**
   * GET ALL USER POSITIONS - GET /api/positions
   * Get all positions across all user's funds
   */
  static async getAllUserPositions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Get all user's funds with their positions
      const funds = await prisma.fund.findMany({
        where: { ownerId: userId },
        include: {
          positions: {
            where: { isActive: true },
            orderBy: { entryDate: 'desc' }
          }
        }
      });

      let allPositions: any[] = [];
      let grandTotalInvested = 0;
      let grandTotalCurrentValue = 0;

      for (const fund of funds) {
        if (fund.positions.length > 0) {
          const positionSummaries = await PositionController.calculatePositionSummaries(fund.positions);
          
          const fundTotalInvested = positionSummaries.reduce((sum, pos) => sum + (pos.totalQuantity * pos.averagePrice), 0);
          const fundTotalCurrentValue = positionSummaries.reduce((sum, pos) => sum + pos.currentValue, 0);
          
          grandTotalInvested += fundTotalInvested;
          grandTotalCurrentValue += fundTotalCurrentValue;

          allPositions.push({
            fund: {
              id: fund.id,
              name: fund.name,
              initialCapital: fund.initialCapital.toNumber()
            },
            summary: {
              totalInvested: Math.round(fundTotalInvested * 100) / 100,
              totalCurrentValue: Math.round(fundTotalCurrentValue * 100) / 100,
              totalUnrealizedPnL: Math.round((fundTotalCurrentValue - fundTotalInvested) * 100) / 100
            },
            positions: positionSummaries
          });
        }
      }

      const grandTotalUnrealizedPnL = grandTotalCurrentValue - grandTotalInvested;

      res.json({
        success: true,
        message: `Retrieved positions for ${funds.length} funds`,
        data: {
          grandTotal: {
            totalInvested: Math.round(grandTotalInvested * 100) / 100,
            totalCurrentValue: Math.round(grandTotalCurrentValue * 100) / 100,
            totalUnrealizedPnL: Math.round(grandTotalUnrealizedPnL * 100) / 100,
            totalUnrealizedPnLPercent: grandTotalInvested > 0 ? Math.round((grandTotalUnrealizedPnL / grandTotalInvested) * 10000) / 100 : 0
          },
          funds: allPositions
        }
      });

    } catch (error) {
      console.error('Get all user positions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during position retrieval'
      });
    }
  }

  // HELPER METHODS

  /**
   * Calculate available capital for a fund (simplified)
   */
  private static async calculateAvailableCapital(fundId: number): Promise<Decimal> {
    const fund = await prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund) throw new Error('Fund not found');

    // Get total invested amount (sum of all active positions)
    const positions = await prisma.position.findMany({
      where: { fundId, isActive: true }
    });

    const totalInvested = positions.reduce((sum, pos) => {
      return sum.add(pos.entryPrice.mul(pos.quantity));
    }, new Decimal(0));

    return fund.initialCapital.sub(totalInvested);
  }

  /**
   * Get available shares for a ticker in a fund
   */
  private static async getAvailableShares(fundId: number, ticker: string): Promise<number> {
    const positions = await prisma.position.findMany({
      where: {
        fundId,
        ticker,
        isActive: true
      }
    });

    return positions.reduce((sum, pos) => sum + pos.quantity, 0);
  }

  /**
   * Execute FIFO sell order (simplified version)
   */
  private static async executeFIFOSell(fundId: number, ticker: string, quantityToSell: number, exitPrice: Decimal): Promise<any[]> {
    try {
      console.log(`🔍 FIFO SELL: Finding positions for fundId=${fundId}, ticker=${ticker}, quantity=${quantityToSell}`);
      
      const positions = await prisma.position.findMany({
        where: {
          fundId,
          ticker,
          isActive: true
        },
        orderBy: { entryDate: 'asc' } // FIFO - oldest first
      });

      console.log(`📊 Found ${positions.length} active positions:`, positions.map(p => `ID:${p.id} Qty:${p.quantity}`));

      const soldPositions = [];
      let remainingToSell = quantityToSell;

      for (const position of positions) {
        if (remainingToSell <= 0) break;

        console.log(`🔄 Processing position ${position.id}: ${position.quantity} shares`);

        if (position.quantity <= remainingToSell) {
          // Sell entire position
          console.log(`📤 Selling entire position ${position.id}`);
          await prisma.position.update({
            where: { id: position.id },
            data: {
              isActive: false,
              exitDate: new Date(),
              exitPrice: exitPrice
            }
          });

          soldPositions.push({
            id: position.id,
            quantity: position.quantity,
            entryPrice: position.entryPrice.toNumber()
          });

          remainingToSell -= position.quantity;
          console.log(`✅ Sold ${position.quantity} shares, remaining: ${remainingToSell}`);
        } else {
          // Partial sell - update existing position quantity
          const quantityToTake = remainingToSell;
          const quantityToLeave = position.quantity - quantityToTake;

          console.log(`📤 Partial sell: taking ${quantityToTake}, leaving ${quantityToLeave}`);

          // Update position to reduce quantity
          await prisma.position.update({
            where: { id: position.id },
            data: {
              quantity: quantityToLeave
            }
          });

          // Create a new closed position for the sold portion
          // Use current timestamp as entryDate to avoid unique constraint violation
          await prisma.position.create({
            data: {
              fundId,
              ticker,
              entryDate: new Date(), // Use current timestamp to ensure uniqueness
              exitDate: new Date(),
              quantity: quantityToTake,
              entryPrice: position.entryPrice,
              exitPrice: exitPrice,
              isActive: false
            }
          });

          soldPositions.push({
            id: position.id,
            quantity: quantityToTake,
            entryPrice: position.entryPrice.toNumber()
          });

          remainingToSell = 0;
          console.log(`✅ Partial sell completed`);
        }
      }

      console.log(`🎯 FIFO SELL COMPLETED: Sold ${soldPositions.length} positions`);
      return soldPositions;
    } catch (error) {
      console.error('❌ FIFO Sell execution error:', error);
      console.error('❌ Stack trace:', (error as Error).stack);
      throw new Error(`Failed to execute FIFO sell: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate position summaries with current market values
   */
  private static async calculatePositionSummaries(positions: any[]): Promise<PositionSummary[]> {
    const tickerGroups = positions.reduce((groups: any, pos) => {
      if (!groups[pos.ticker]) {
        groups[pos.ticker] = [];
      }
      groups[pos.ticker].push(pos);
      return groups;
    }, {});

    const summaries: PositionSummary[] = [];

    for (const [ticker, posArray] of Object.entries(tickerGroups) as [string, any[]][]) {
      const totalQuantity = posArray.reduce((sum, pos) => sum + pos.quantity, 0);
      const totalCost = posArray.reduce((sum, pos) => sum + (pos.quantity * pos.entryPrice.toNumber()), 0);
      const averagePrice = totalCost / totalQuantity;

      // Get current price
      const currentStockData = await prisma.stockData.findFirst({
        where: { ticker },
        orderBy: { date: 'desc' }
      });

      const currentPrice = currentStockData?.close.toNumber() || averagePrice;
      const currentValue = totalQuantity * currentPrice;
      const unrealizedPnL = currentValue - totalCost;
      const unrealizedPnLPercent = totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : 0;

      const earliestDate = posArray.reduce((earliest, pos) => 
        pos.entryDate < earliest ? pos.entryDate : earliest, posArray[0].entryDate);
      
      const latestDate = posArray.reduce((latest, pos) => 
        pos.entryDate > latest ? pos.entryDate : latest, posArray[0].entryDate);

      summaries.push({
        id: posArray[0].id, // Use first position ID as reference
        ticker,
        totalQuantity,
        averagePrice,
        currentValue,
        unrealizedPnL,
        unrealizedPnLPercent,
        entryDate: earliestDate,
        lastTradeDate: latestDate
      });
    }

    return summaries;
  }
}