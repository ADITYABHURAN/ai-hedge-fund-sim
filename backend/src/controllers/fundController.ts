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

// Types for fund operations
interface CreateFundRequest {
  name: string;
  initialCapital: number;
  isPublic?: boolean;
}

interface FundWithPositions {
  id: number;
  name: string;
  initialCapital: Decimal;
  isPublic: boolean;
  createdAt: Date;
  positions: Array<{
    id: number;
    ticker: string;
    entryDate: Date;
    exitDate: Date | null;
    quantity: number;
    entryPrice: Decimal;
    exitPrice: Decimal | null;
    isActive: boolean;
  }>;
  currentValue?: number;
  totalReturn?: number;
  totalReturnPercent?: number;
}

export class FundController {
  /**
   * CREATE FUND - POST /api/funds/create
   * Creates a new hedge fund for the authenticated user
   */
  static async createFund(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { name, initialCapital, isPublic = false }: CreateFundRequest = req.body;

      // Validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: 'Fund name is required and must be a non-empty string'
        });
        return;
      }

      if (!initialCapital || typeof initialCapital !== 'number' || initialCapital <= 0) {
        res.status(400).json({
          success: false,
          message: 'Initial capital must be a positive number'
        });
        return;
      }

      if (initialCapital < 1000) {
        res.status(400).json({
          success: false,
          message: 'Minimum initial capital is $1,000'
        });
        return;
      }

      if (initialCapital > 10000000) {
        res.status(400).json({
          success: false,
          message: 'Maximum initial capital is $10,000,000'
        });
        return;
      }

      // Check if fund name already exists for this user
      const existingFund = await prisma.fund.findFirst({
        where: {
          name: name.trim(),
          ownerId: userId
        }
      });

      if (existingFund) {
        res.status(400).json({
          success: false,
          message: 'You already have a fund with this name'
        });
        return;
      }

      // Create the fund
      const newFund = await prisma.fund.create({
        data: {
          name: name.trim(),
          ownerId: userId,
          initialCapital: new Decimal(initialCapital),
          isPublic: Boolean(isPublic)
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      console.log(`💼 New fund created: "${newFund.name}" by user ${userId} with $${initialCapital}`);

      res.status(201).json({
        success: true,
        message: 'Fund created successfully',
        data: {
          fund: {
            id: newFund.id,
            name: newFund.name,
            initialCapital: newFund.initialCapital.toNumber(),
            isPublic: newFund.isPublic,
            createdAt: newFund.createdAt,
            owner: newFund.owner
          }
        }
      });

    } catch (error) {
      console.error('Create fund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during fund creation'
      });
    }
  }

  /**
   * GET USER FUNDS - GET /api/funds
   * Retrieves all funds owned by the authenticated user with performance metrics
   */
  static async getUserFunds(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Get funds with their positions
      const funds = await prisma.fund.findMany({
        where: { ownerId: userId },
        include: {
          positions: {
            orderBy: { entryDate: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate performance metrics for each fund
      const fundsWithMetrics: Array<FundWithPositions & {
        currentValue: number;
        totalReturn: number;
        totalReturnPercent: number;
        activePositions: number;
        totalPositions: number;
      }> = await Promise.all(
        funds.map(async (fund) => {
          const metrics = await FundController.calculateFundMetrics(fund);
          
          return {
            ...fund,
            initialCapital: fund.initialCapital,
            currentValue: metrics.currentValue,
            totalReturn: metrics.totalReturn,
            totalReturnPercent: metrics.totalReturnPercent,
            activePositions: fund.positions.filter(p => p.isActive).length,
            totalPositions: fund.positions.length,
            positions: fund.positions.map(position => ({
              ...position,
              entryPrice: position.entryPrice,
              exitPrice: position.exitPrice
            }))
          };
        })
      );

      console.log(`📊 Retrieved ${funds.length} funds for user ${userId}`);

      res.json({
        success: true,
        message: `Retrieved ${funds.length} funds`,
        data: {
          funds: fundsWithMetrics.map(fund => ({
            id: fund.id,
            name: fund.name,
            initialCapital: fund.initialCapital.toNumber(),
            currentValue: fund.currentValue,
            totalReturn: fund.totalReturn,
            totalReturnPercent: fund.totalReturnPercent,
            isPublic: fund.isPublic,
            createdAt: fund.createdAt,
            activePositions: fund.activePositions,
            totalPositions: fund.totalPositions,
            positions: fund.positions.map(pos => ({
              id: pos.id,
              ticker: pos.ticker,
              entryDate: pos.entryDate,
              exitDate: pos.exitDate,
              quantity: pos.quantity,
              entryPrice: pos.entryPrice.toNumber(),
              exitPrice: pos.exitPrice?.toNumber() || null,
              isActive: pos.isActive
            }))
          }))
        }
      });

    } catch (error) {
      console.error('Get user funds error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during fund retrieval'
      });
    }
  }

  /**
   * GET FUND DETAILS - GET /api/funds/:fundId
   * Retrieves detailed information about a specific fund
   */
  static async getFundDetails(req: AuthRequest, res: Response): Promise<void> {
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

      // Get fund with positions and owner info
      const fund = await prisma.fund.findFirst({
        where: {
          id: fundId,
          ownerId: userId
        },
        include: {
          positions: {
            orderBy: { entryDate: 'desc' }
          },
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!fund) {
        res.status(404).json({
          success: false,
          message: 'Fund not found or you do not have access to it'
        });
        return;
      }

      // Calculate detailed metrics
      const metrics = await FundController.calculateFundMetrics(fund);

      console.log(`📈 Fund details retrieved: "${fund.name}" (ID: ${fundId})`);

      res.json({
        success: true,
        message: 'Fund details retrieved successfully',
        data: {
          fund: {
            id: fund.id,
            name: fund.name,
            initialCapital: fund.initialCapital.toNumber(),
            currentValue: metrics.currentValue,
            totalReturn: metrics.totalReturn,
            totalReturnPercent: metrics.totalReturnPercent,
            isPublic: fund.isPublic,
            createdAt: fund.createdAt,
            owner: fund.owner,
            positions: fund.positions.map(pos => ({
              id: pos.id,
              ticker: pos.ticker,
              entryDate: pos.entryDate,
              exitDate: pos.exitDate,
              quantity: pos.quantity,
              entryPrice: pos.entryPrice.toNumber(),
              exitPrice: pos.exitPrice?.toNumber() || null,
              isActive: pos.isActive,
              currentValue: pos.isActive ? pos.quantity * pos.entryPrice.toNumber() : 0, // Simplified - would use current market price
              unrealizedPnL: pos.isActive ? 0 : null, // Would calculate with current market price
              realizedPnL: !pos.isActive && pos.exitPrice 
                ? pos.quantity * (pos.exitPrice.toNumber() - pos.entryPrice.toNumber())
                : null
            }))
          }
        }
      });

    } catch (error) {
      console.error('Get fund details error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during fund detail retrieval'
      });
    }
  }

  /**
   * DELETE FUND - DELETE /api/funds/:fundId
   * Deletes a fund (only if it has no active positions)
   */
  static async deleteFund(req: AuthRequest, res: Response): Promise<void> {
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

      // Check if fund exists and belongs to user
      const fund = await prisma.fund.findFirst({
        where: {
          id: fundId,
          ownerId: userId
        },
        include: {
          positions: {
            where: { isActive: true }
          }
        }
      });

      if (!fund) {
        res.status(404).json({
          success: false,
          message: 'Fund not found or you do not have access to it'
        });
        return;
      }

      // Check for active positions
      if (fund.positions.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete fund with active positions. Close all positions first.'
        });
        return;
      }

      // Delete the fund (this will cascade delete positions due to foreign key)
      await prisma.fund.delete({
        where: { id: fundId }
      });

      console.log(`🗑️ Fund deleted: "${fund.name}" (ID: ${fundId}) by user ${userId}`);

      res.json({
        success: true,
        message: 'Fund deleted successfully'
      });

    } catch (error) {
      console.error('Delete fund error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during fund deletion'
      });
    }
  }

  /**
   * HELPER: Calculate fund performance metrics
   */
  private static async calculateFundMetrics(fund: any): Promise<{
    currentValue: number;
    totalReturn: number;
    totalReturnPercent: number;
  }> {
    try {
      const initialCapital = fund.initialCapital.toNumber();
      
      // For now, we'll use a simplified calculation
      // In a real system, you'd get current market prices for active positions
      let currentValue = initialCapital;
      
      // Calculate realized P&L from closed positions
      let realizedPnL = 0;
      for (const position of fund.positions) {
        if (!position.isActive && position.exitPrice) {
          const positionPnL = position.quantity * (position.exitPrice.toNumber() - position.entryPrice.toNumber());
          realizedPnL += positionPnL;
        }
      }

      // For active positions, we'd normally get current market prices
      // For now, we'll assume they're worth their entry value (no unrealized P&L)
      currentValue = initialCapital + realizedPnL;

      const totalReturn = currentValue - initialCapital;
      const totalReturnPercent = initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0;

      return {
        currentValue: Math.round(currentValue * 100) / 100,
        totalReturn: Math.round(totalReturn * 100) / 100,
        totalReturnPercent: Math.round(totalReturnPercent * 100) / 100
      };

    } catch (error) {
      console.error('Error calculating fund metrics:', error);
      return {
        currentValue: fund.initialCapital.toNumber(),
        totalReturn: 0,
        totalReturnPercent: 0
      };
    }
  }
}