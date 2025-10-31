const axios = require('axios');

// 🚨 EXAMPLE FILE - Replace with your actual JWT token
// Get token by calling POST /api/auth/login with your credentials
const EXAMPLE_TOKEN = "YOUR_JWT_TOKEN_HERE";

async function exampleTradingTest() {
  try {
    console.log('🚀 EXAMPLE: AI Hedge Fund Trading Test\n');
    console.log('⚠️  Before running this test:');
    console.log('   1. Replace EXAMPLE_TOKEN with your actual JWT token');
    console.log('   2. Make sure your server is running on localhost:3001');
    console.log('   3. Ensure you have a fund created with some capital\n');

    // Example: Create a fund first
    console.log('📝 Step 1: Create Fund (example)');
    const createFundExample = {
      name: "Example Trading Fund",
      initialCapital: 50000,
      isPublic: false
    };
    console.log('   POST /api/funds/create');
    console.log('   Body:', JSON.stringify(createFundExample, null, 2));
    
    // Example: Buy order
    console.log('\n📝 Step 2: Execute Buy Order (example)');
    const buyOrderExample = {
      fundId: 1, // Replace with your actual fund ID
      ticker: "AAPL",
      quantity: 50
    };
    console.log('   POST /api/positions/buy');
    console.log('   Body:', JSON.stringify(buyOrderExample, null, 2));
    
    // Example: Sell order  
    console.log('\n📝 Step 3: Execute Sell Order (example)');
    const sellOrderExample = {
      fundId: 1, // Replace with your actual fund ID
      ticker: "AAPL", 
      quantity: 25,
      price: 191.00
    };
    console.log('   POST /api/positions/sell');
    console.log('   Body:', JSON.stringify(sellOrderExample, null, 2));
    
    console.log('\n✅ Example completed! Replace token and fund ID to run actual tests.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Uncomment and modify to run actual tests:
/*
async function runActualTest() {
  const token = "YOUR_REAL_JWT_TOKEN_HERE";
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Buy shares
    const buyResponse = await axios.post('http://localhost:3001/api/positions/buy', {
      fundId: YOUR_FUND_ID,
      ticker: "AAPL",
      quantity: 50
    }, { headers });
    
    console.log('✅ Buy Success:', buyResponse.data);

    // 2. Sell shares
    const sellResponse = await axios.post('http://localhost:3001/api/positions/sell', {
      fundId: YOUR_FUND_ID,
      ticker: "AAPL", 
      quantity: 25,
      price: 191.00
    }, { headers });
    
    console.log('✅ Sell Success:', sellResponse.data);
    
  } catch (error) {
    console.error('❌ Test Error:', error.response?.data || error.message);
  }
}
*/

exampleTradingTest();