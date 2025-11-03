import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { MarketDataFetcher } from './services/dataFetcher';
import { FundController } from './controllers/fundController';
import { PositionController } from './controllers/positionController';
import { StrategyController } from './controllers/strategyController';

// Initialize Prisma Client and Market Data Service
const prisma = new PrismaClient();
const marketDataFetcher = new MarketDataFetcher();

// Export prisma and types for use in other modules
export { prisma };
export { AuthRequest };
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Types for JWT payload
interface JwtPayload {
  userId: number;
  email: string;
}

// Extended Request type for authenticated routes
interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

// JWT Secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';

// Middleware: Protect routes (JWT verification)
const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Find user in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not found.'
      });
    }

    // Add user info to request object
    req.user = {
      userId: user.id,
      email: user.email
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Access denied. Invalid token.'
    });
  }
};

// Helper function: Generate JWT token
const generateToken = (userId: number, email: string): string => {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Routes

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'AI Hedge Fund API is running!',
    timestamp: new Date().toISOString()
  });
});

// POST /api/auth/signup - User registration
app.post('/api/auth/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null
      }
    });

    // Generate JWT token
    const token = generateToken(newUser.id, newUser.email);

    // Return success response (exclude password)
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          createdAt: newUser.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
});

// POST /api/auth/login - User authentication
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
});

// GET /api/auth/me - Get current user profile (protected route)
app.get('/api/auth/me', protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// =============================================================================
// FUND MANAGEMENT ROUTES (Phase 5)
// =============================================================================

// POST /api/funds/create - Create a new hedge fund (protected route)
app.post('/api/funds/create', protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, initialCapital, isPublic = false } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Fund name is required and must be a non-empty string'
      });
    }

    if (!initialCapital || typeof initialCapital !== 'number' || initialCapital <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Initial capital must be a positive number'
      });
    }

    if (initialCapital < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum initial capital is $1,000'
      });
    }

    // Check if fund name already exists for this user
    const existingFund = await prisma.fund.findFirst({
      where: {
        name: name.trim(),
        ownerId: userId
      }
    });

    if (existingFund) {
      return res.status(400).json({
        success: false,
        message: 'You already have a fund with this name'
      });
    }

    // Create the fund
    const newFund = await prisma.fund.create({
      data: {
        name: name.trim(),
        ownerId: userId,
        initialCapital: initialCapital,
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
          initialCapital: newFund.initialCapital,
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
});

// GET /api/funds - Get user's funds with performance metrics (protected route)
app.get('/api/funds', protect, async (req: AuthRequest, res: Response) => {
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

    console.log(`📊 Retrieved ${funds.length} funds for user ${userId}`);

    res.json({
      success: true,
      message: `Retrieved ${funds.length} funds`,
      data: {
        funds: funds.map(fund => ({
          id: fund.id,
          name: fund.name,
          initialCapital: fund.initialCapital,
          isPublic: fund.isPublic,
          createdAt: fund.createdAt,
          activePositions: fund.positions.filter(p => p.isActive).length,
          totalPositions: fund.positions.length,
          positions: fund.positions.map(pos => ({
            id: pos.id,
            ticker: pos.ticker,
            entryDate: pos.entryDate,
            exitDate: pos.exitDate,
            quantity: pos.quantity,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice,
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
});

// GET /api/funds/:fundId - Get detailed fund information (protected route)
app.get('/api/funds/:fundId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const fundId = parseInt(req.params.fundId, 10);

    if (isNaN(fundId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fund ID'
      });
    }

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
      return res.status(404).json({
        success: false,
        message: 'Fund not found or you do not have access to it'
      });
    }

    res.json({
      success: true,
      message: 'Fund details retrieved successfully',
      data: {
        fund: {
          id: fund.id,
          name: fund.name,
          initialCapital: fund.initialCapital,
          isPublic: fund.isPublic,
          createdAt: fund.createdAt,
          owner: fund.owner,
          positions: fund.positions.map(pos => ({
            id: pos.id,
            ticker: pos.ticker,
            entryDate: pos.entryDate,
            exitDate: pos.exitDate,
            quantity: pos.quantity,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice,
            isActive: pos.isActive
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
});

// DELETE /api/funds/:fundId - Delete a fund (protected route)
app.delete('/api/funds/:fundId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const fundId = parseInt(req.params.fundId, 10);

    if (isNaN(fundId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fund ID'
      });
    }

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
      return res.status(404).json({
        success: false,
        message: 'Fund not found or you do not have access to it'
      });
    }

    if (fund.positions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete fund with active positions. Close all positions first.'
      });
    }

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
});

// =============================================================================
// TRADING & POSITION ROUTES (Phase 6)
// =============================================================================

// POST /api/positions/buy - Execute buy order (protected route)
app.post('/api/positions/buy', protect, PositionController.buyStock);

// POST /api/positions/sell - Execute sell order (protected route)
app.post('/api/positions/sell', protect, PositionController.sellStock);

// GET /api/positions - Get all user positions across all funds (protected route)
app.get('/api/positions', protect, PositionController.getAllUserPositions);

// GET /api/positions/fund/:fundId - Get positions for specific fund (protected route)
app.get('/api/positions/fund/:fundId', protect, PositionController.getFundPositions);

// =============================================================================
// STRATEGY ROUTES (Phase 7)
// =============================================================================

// GET /api/strategies - Get all registered strategies (protected route)
app.get('/api/strategies', protect, StrategyController.getStrategies);

// POST /api/strategies/analyze - Analyze strategies for a ticker (protected route)
app.post('/api/strategies/analyze', protect, StrategyController.analyzeStrategies);

// POST /api/strategies/execute - Execute strategy recommendations (protected route)
app.post('/api/strategies/execute', protect, StrategyController.executeStrategyTrades);

// GET /api/strategies/performance/:fundId - Get strategy performance metrics (protected route)
app.get('/api/strategies/performance/:fundId', protect, StrategyController.getStrategyPerformance);

// =============================================================================
// BACKTESTING ROUTES (Phase 7B)
// =============================================================================

import backtestController from './backtestController';
app.use('/api/backtests', backtestController);

// =============================================================================
// MARKET DATA ROUTES (Phase 4)
// =============================================================================

// POST /api/data/ingest - Ingest historical market data (protected route)
app.post('/api/data/ingest', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { symbols, startDate, endDate, timeframe = '1Day' } = req.body;

    // Validation
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'symbols array is required and must not be empty'
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required (YYYY-MM-DD format)'
      });
    }

    // Validate date format
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD format'
      });
    }

    if (startDateObj >= endDateObj) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before endDate'
      });
    }

    console.log(`📊 Market data ingestion requested by user ${req.user!.userId}`);
    console.log(`📈 Symbols: ${symbols.join(', ')}`);
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // Fetch and store market data
    const result = await marketDataFetcher.fetchAndStoreHistoricalData(
      symbols,
      startDate,
      endDate,
      timeframe as '1Day' | '1Hour' | '1Min'
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Data ingestion error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during data ingestion'
    });
  }
});

// GET /api/data/latest - Get latest market data for symbols (protected route)
app.get('/api/data/latest', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({
        success: false,
        message: 'symbols query parameter is required (comma-separated list)'
      });
    }

    const symbolArray = (symbols as string).split(',').map(s => s.trim().toUpperCase());

    const result = await marketDataFetcher.getLatestDataFromDB(symbolArray);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Latest data fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during data retrieval'
    });
  }
});

// GET /api/data/historical/:symbol - Get historical data for a symbol (protected route)
app.get('/api/data/historical/:symbol', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const { startDate, endDate, limit = '100' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required (YYYY-MM-DD format)'
      });
    }

    const result = await marketDataFetcher.getHistoricalDataFromDB(
      symbol,
      startDate as string,
      endDate as string,
      parseInt(limit as string, 10)
    );

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Historical data fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during historical data retrieval'
    });
  }
});

// GET /api/data/validate - Validate API credentials (protected route)
app.get('/api/data/validate', protect, async (req: AuthRequest, res: Response) => {
  try {
    const result = await marketDataFetcher.validateCredentials();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Credential validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during credential validation'
    });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Initialize trading strategies
StrategyController.initializeDefaultStrategies();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Hedge Fund API Server running on port ${PORT}`);
  console.log(`\n📊 CORE ENDPOINTS:`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`\n🔐 AUTHENTICATION:`);
  console.log(`   Signup: POST http://localhost:${PORT}/api/auth/signup`);
  console.log(`   Login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   Profile: GET http://localhost:${PORT}/api/auth/me`);
  console.log(`\n� FUND MANAGEMENT:`);
  console.log(`   Create Fund: POST http://localhost:${PORT}/api/funds/create`);
  console.log(`   List Funds: GET http://localhost:${PORT}/api/funds`);
  console.log(`   Fund Details: GET http://localhost:${PORT}/api/funds/:fundId`);
  console.log(`   Delete Fund: DELETE http://localhost:${PORT}/api/funds/:fundId`);
  console.log(`\n� TRADING & POSITIONS:`);
  console.log(`   Buy Stock: POST http://localhost:${PORT}/api/positions/buy`);
  console.log(`   Sell Stock: POST http://localhost:${PORT}/api/positions/sell`);
  console.log(`   All Positions: GET http://localhost:${PORT}/api/positions`);
  console.log(`   Fund Positions: GET http://localhost:${PORT}/api/positions/fund/:fundId`);
  console.log(`\n🧠 AI TRADING STRATEGIES:`);
  console.log(`   List Strategies: GET http://localhost:${PORT}/api/strategies`);
  console.log(`   Analyze Strategies: POST http://localhost:${PORT}/api/strategies/analyze`);
  console.log(`   Execute Strategies: POST http://localhost:${PORT}/api/strategies/execute`);
  console.log(`   Strategy Performance: GET http://localhost:${PORT}/api/strategies/performance/:fundId`);
  console.log(`\n🧪 STRATEGY BACKTESTING:`);
  console.log(`   Run Backtest: POST http://localhost:${PORT}/api/backtests/run`);
  console.log(`   Available Strategies: GET http://localhost:${PORT}/api/backtests/strategies`);
  console.log(`   Validate Parameters: POST http://localhost:${PORT}/api/backtests/validate`);
  console.log(`   Backtest History: GET http://localhost:${PORT}/api/backtests/history/:userId`);
  console.log(`   Risk Analysis: POST http://localhost:${PORT}/api/backtests/risk-analysis`);
  console.log(`\n�📈 MARKET DATA:`);
  console.log(`   Data Ingestion: POST http://localhost:${PORT}/api/data/ingest`);
  console.log(`   Latest Data: GET http://localhost:${PORT}/api/data/latest?symbols=AAPL,MSFT`);
  console.log(`   Historical Data: GET http://localhost:${PORT}/api/data/historical/AAPL?startDate=2024-01-01&endDate=2024-01-31`);
  console.log(`   Validate API Keys: GET http://localhost:${PORT}/api/data/validate`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await marketDataFetcher.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await marketDataFetcher.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});