# 🤖 AI Hedge Fund Simulation

A sophisticated hedge fund management and trading simulation system built with modern TypeScript, PostgreSQL, and advanced trading algorithms. This project provides a complete platform for simulating hedge fund operations, from portfolio management to automated trading strategies.

## 🚀 Features

### 💼 Fund Management
- **Multi-Fund Support**: Create and manage multiple hedge funds with individual capital allocation
- **Portfolio Tracking**: Real-time portfolio valuation and position monitoring  
- **Access Control**: JWT-based authentication with fund ownership verification
- **Capital Validation**: Enforced minimum ($1K) and maximum ($10M) fund limits

### 📈 Advanced Trading System
- **Buy/Sell Orders**: Complete order execution with market data integration
- **FIFO Position Management**: First-In-First-Out selling logic with position splitting
- **Automatic P&L Calculation**: Real-time profit/loss tracking for all trades
- **Position Analytics**: Comprehensive position summaries and performance metrics

### 📊 Market Data Integration
- **Alpaca API Integration**: Real-time and historical market data feeds
- **Multi-Symbol Support**: Track and trade multiple stock symbols
- **Data Validation**: Built-in market data validation and error handling
- **Historical Backtesting**: Support for historical data analysis (ready for ML integration)

### 🔐 Security & Authentication
- **JWT Token Authentication**: Secure user sessions with token-based auth
- **Password Security**: BCrypt hashing for secure password storage
- **API Protection**: All endpoints protected with middleware authentication
- **User Isolation**: Complete data isolation between users and funds

## 🛠️ Tech Stack

### Backend
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL 15 with Prisma ORM
- **Authentication**: JWT + BCrypt
- **Market Data**: Alpaca Trading API
- **Containerization**: Docker for database management

### Database Schema
```sql
Users → Funds → Positions → Trades
   ↓       ↓        ↓
  Auth   Capital   P&L
```

### API Architecture
- **RESTful Design**: Clean, intuitive API endpoints
- **Error Handling**: Comprehensive error responses and logging  
- **Input Validation**: Robust request validation and sanitization
- **Response Formatting**: Consistent JSON response structure

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Docker Desktop
- PostgreSQL (or use Docker container)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ADITYABHURAN/ai-hedge-fund-sim.git
   cd ai-hedge-fund-sim
   ```

2. **Set up the database**
   ```bash
   # Start PostgreSQL container
   docker run --name ai-hedge-fund-postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=password123 \
     -e POSTGRES_DB=ai_hedge_fund \
     -p 5432:5432 -d postgres:15
   ```

4. **Configure environment variables**
   ```bash
   # Copy environment template and configure
   cd backend
   cp .env.example .env
   
   # Edit .env file with your actual credentials:
   # - Generate strong JWT_SECRET: openssl rand -base64 64  
   # - Get Alpaca API keys from: https://alpaca.markets/
   # - Use paper trading credentials for development
   ```

4. **Install dependencies and setup database**
   ```bash
   npm install
   npx prisma migrate deploy
   npx prisma generate
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`

## 📖 API Documentation

### Authentication Endpoints
```http
POST /api/auth/signup     # Create new user account
POST /api/auth/login      # User authentication
GET  /api/auth/me         # Get current user profile
```

### Fund Management
```http
POST /api/funds/create    # Create new hedge fund
GET  /api/funds           # List user's funds
GET  /api/funds/:fundId   # Get fund details
DELETE /api/funds/:fundId # Delete fund
```

### Trading Operations
```http
POST /api/positions/buy              # Execute buy order
POST /api/positions/sell             # Execute sell order (FIFO)
GET  /api/positions                  # Get all positions
GET  /api/positions/fund/:fundId     # Get fund-specific positions
```

### Market Data
```http
POST /api/data/ingest               # Ingest historical data
GET  /api/data/latest?symbols=AAPL  # Get latest prices
GET  /api/data/historical/:symbol   # Get historical data
GET  /api/data/validate             # Validate API credentials
```

## 💡 Usage Examples

### Creating a Fund
```bash
curl -X POST http://localhost:3001/api/funds/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Growth Fund",
    "initialCapital": 50000,
    "isPublic": false
  }'
```

### Executing a Trade
```bash
# Buy Order
curl -X POST http://localhost:3001/api/positions/buy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": 1,
    "ticker": "AAPL",
    "quantity": 100
  }'

# Sell Order (FIFO)
curl -X POST http://localhost:3001/api/positions/sell \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": 1,
    "ticker": "AAPL", 
    "quantity": 25,
    "price": 190.50
  }'
```

## 🔒 Security & Best Practices

### 🔐 Environment Variables
- **Never commit `.env` files** - They contain sensitive credentials
- **Use `.env.example`** as a template for required variables
- **Generate strong secrets**: Use `openssl rand -base64 64` for JWT_SECRET
- **Paper trading first**: Always test with Alpaca paper trading credentials

### 🛡️ API Security
- **JWT Authentication**: All endpoints require valid authentication
- **Input Validation**: Comprehensive request validation and sanitization
- **Error Handling**: Secure error responses (no sensitive data leakage)
- **Rate Limiting**: Consider adding rate limiting for production use

### 🏦 Financial Security
- **Paper Trading**: Use demo credentials during development
- **Fund Limits**: Built-in capital limits ($1K min, $10M max)
- **User Isolation**: Complete data separation between users
- **Audit Trail**: All trades logged with timestamps and P&L

## 🧪 Testing

The project includes comprehensive test scripts:

```bash
# View example trading workflow (safe template)
node backend/example-trading-test.js

# Customize with your credentials and test
# (Replace tokens and fund IDs in the example file)
```

**Sample Test Output:**
```
🚀 PHASE 6 TRADING LOGIC - COMPLETE TEST

🛒 BUYING 50 shares of AAPL...
✅ Buy Success: Buy order executed successfully

💰 SELLING 25 shares of AAPL at $191.00...
✅ Sell Success: Sell order executed successfully
   💵 P&L: $31.25 (0.66%)

📊 FINAL POSITIONS:
   Fund: Tech Growth Fund
   Total Invested: $9487.5
   Current Value: $9487.5  
   Active Positions: 1
   📈 AAPL: 50 shares @ $189.75 = $9487.5

🎉 PHASE 6 COMPLETE! Buy and Sell orders working perfectly!
```

## 🏗️ Database Schema

```sql
-- Users table for authentication
CREATE TABLE "User" (
  id SERIAL PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  firstName VARCHAR,
  lastName VARCHAR,
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Funds table for portfolio management
CREATE TABLE "Fund" (
  id SERIAL PRIMARY KEY,
  name VARCHAR UNIQUE NOT NULL,
  ownerId INTEGER REFERENCES "User"(id),
  initialCapital DECIMAL(10,2) NOT NULL,
  isPublic BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Positions table for trade tracking
CREATE TABLE "Position" (
  id SERIAL PRIMARY KEY,
  fundId INTEGER REFERENCES "Fund"(id),
  ticker VARCHAR NOT NULL,
  entryDate TIMESTAMP NOT NULL,
  exitDate TIMESTAMP,
  quantity INTEGER NOT NULL,
  entryPrice DECIMAL(10,4) NOT NULL,
  exitPrice DECIMAL(10,4),
  isActive BOOLEAN DEFAULT TRUE,
  UNIQUE(fundId, ticker, entryDate)
);

-- Market data storage
CREATE TABLE "StockData" (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR NOT NULL,
  date DATE NOT NULL,
  open DECIMAL(10,4) NOT NULL,
  high DECIMAL(10,4) NOT NULL,
  low DECIMAL(10,4) NOT NULL,
  close DECIMAL(10,4) NOT NULL,
  volume BIGINT NOT NULL,
  UNIQUE(ticker, date)
);
```

## 🔮 Future Roadmap

### Phase 7: AI Trading Algorithms
- Machine learning-based trading strategies
- Sentiment analysis integration
- Automated portfolio rebalancing

### Phase 8: Risk Management
- Position sizing algorithms  
- Portfolio risk metrics (VaR, Sharpe ratio)
- Stop-loss and take-profit automation

### Phase 9: Real-time Features  
- WebSocket integration for live updates
- Real-time market data streams
- Live portfolio performance dashboard

### Phase 10: Frontend Dashboard
- React/Next.js web interface
- Interactive charts and analytics
- Mobile-responsive design

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)  
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Alpaca Markets** for providing trading API access
- **Prisma** for excellent ORM tooling
- **PostgreSQL** for robust database foundation
- **Express.js** community for comprehensive middleware ecosystem

## 📞 Support

For questions or support:
- **Issues**: [GitHub Issues](https://github.com/ADITYABHURAN/ai-hedge-fund-sim/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ADITYABHURAN/ai-hedge-fund-sim/discussions)

---

**Built with ❤️ for the future of algorithmic trading** 🚀

*Last Updated: October 30, 2025*