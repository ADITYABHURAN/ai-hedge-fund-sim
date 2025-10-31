const axios = require('axios');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImVtYWlsIjoidHJhZGVyQGFpZnVuZC5jb20iLCJpYXQiOjE3NjE4Nzk3NjQsImV4cCI6MTc2MjQ4NDU2NH0.SgnfcY4S8s3f6E_i276jxPkxBYpFyvW1J9eJTZZLolg";

async function buySomeShares() {
  try {
    console.log('🛒 BUYING 50 shares of AAPL...');
    const response = await axios.post('http://localhost:3001/api/positions/buy', {
      fundId: 3,
      ticker: "AAPL", 
      quantity: 50
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Buy Success:', response.data.message);
    return true;
  } catch (error) {
    console.error('❌ Buy Error:', error.response ? error.response.data : error.message);
    return false;
  }
}

async function sellSomeShares() {
  try {
    console.log('💰 SELLING 25 shares of AAPL at $191.00...');
    const response = await axios.post('http://localhost:3001/api/positions/sell', {
      fundId: 3,
      ticker: "AAPL", 
      quantity: 25,
      price: 191.00
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Sell Success:', response.data.message);
    console.log(`   💵 P&L: $${response.data.data.pnl.realizedPnL.toFixed(2)} (${response.data.data.pnl.realizedPnLPercent.toFixed(2)}%)`);
    return true;
  } catch (error) {
    console.error('❌ Sell Error:', error.response ? error.response.data : error.message);
    return false;
  }
}

async function checkFinalPositions() {
  try {
    console.log('\n📊 FINAL POSITIONS:');
    const response = await axios.get('http://localhost:3001/api/positions/fund/3', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = response.data.data;
    console.log(`   Fund: ${data.fund.name}`);
    console.log(`   Total Invested: $${data.summary.totalInvested}`);
    console.log(`   Current Value: $${data.summary.totalCurrentValue}`);
    console.log(`   Active Positions: ${data.summary.totalPositions}`);
    
    data.positions.forEach(pos => {
      console.log(`   📈 ${pos.ticker}: ${pos.quantity} shares @ $${pos.averagePrice} = $${pos.currentValue}`);
    });
  } catch (error) {
    console.error('❌ Position Check Error:', error.response ? error.response.data : error.message);
  }
}

async function fullTradingTest() {
  console.log('🚀 PHASE 6 TRADING LOGIC - COMPLETE TEST\n');
  
  const buySuccess = await buySomeShares();
  if (buySuccess) {
    console.log('');
    const sellSuccess = await sellSomeShares();
    if (sellSuccess) {
      await checkFinalPositions();
      console.log('\n🎉 PHASE 6 COMPLETE! Buy and Sell orders working perfectly!');
    }
  }
}

fullTradingTest();