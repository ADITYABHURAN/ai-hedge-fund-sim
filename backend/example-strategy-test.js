const axios = require('axios');

// 🚨 EXAMPLE FILE - Replace with your actual JWT token
// Get token by calling POST /api/auth/login with your credentials
const EXAMPLE_TOKEN = "YOUR_JWT_TOKEN_HERE";

async function phase7StrategyDemo() {
  try {
    console.log('🧠 PHASE 7: AI TRADING STRATEGIES DEMO\n');
    console.log('⚠️  Before running this test:');
    console.log('   1. Replace EXAMPLE_TOKEN with your actual JWT token');
    console.log('   2. Make sure your server is running on localhost:3001');
    console.log('   3. Ensure you have market data for AAPL in your database');
    console.log('   4. Have a fund created with some capital\n');

    const headers = {
      'Authorization': `Bearer ${EXAMPLE_TOKEN}`,
      'Content-Type': 'application/json'
    };

    // Step 1: List available strategies
    console.log('📋 Step 1: List Available Strategies');
    console.log('   GET /api/strategies');
    console.log('   Expected: Conservative, Standard, and Aggressive MA strategies\n');
    
    // Step 2: Analyze strategies for a ticker
    console.log('📊 Step 2: Analyze AAPL with All Strategies');
    const analyzeExample = {
      fundId: 1, // Replace with your actual fund ID
      ticker: "AAPL"
    };
    console.log('   POST /api/strategies/analyze');
    console.log('   Body:', JSON.stringify(analyzeExample, null, 2));
    console.log('   Expected: Multiple strategy signals with confidence levels\n');
    
    // Step 3: Execute strategy recommendations
    console.log('🚀 Step 3: Execute Strategy Recommendations');
    const executeExample = {
      fundId: 1, // Replace with your actual fund ID
      ticker: "AAPL",
      executeAll: false
    };
    console.log('   POST /api/strategies/execute');
    console.log('   Body:', JSON.stringify(executeExample, null, 2));
    console.log('   Expected: Strategy consensus and trade recommendations\n');
    
    // Step 4: Check strategy performance
    console.log('📈 Step 4: Check Strategy Performance');
    console.log('   GET /api/strategies/performance/1');
    console.log('   Expected: Performance metrics (placeholder for now)\n');
    
    console.log('✅ Demo script complete!');
    console.log('\n🔧 To run actual tests:');
    console.log('   1. Replace EXAMPLE_TOKEN with real JWT token');
    console.log('   2. Replace fundId with your actual fund ID');
    console.log('   3. Uncomment the runActualTest() function below');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Uncomment and modify to run actual tests:
/*
async function runActualStrategyTests() {
  const token = "YOUR_REAL_JWT_TOKEN_HERE";
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🧠 RUNNING ACTUAL STRATEGY TESTS\n');

    // 1. List strategies
    console.log('📋 Listing available strategies...');
    const strategiesResponse = await axios.get('http://localhost:3001/api/strategies', { headers });
    console.log('✅ Strategies loaded:', strategiesResponse.data.data.totalCount);
    strategiesResponse.data.data.strategies.forEach(strategy => {
      console.log(`   - ${strategy.name} (${strategy.type})`);
    });

    // 2. Analyze AAPL
    console.log('\n📊 Analyzing AAPL with all strategies...');
    const analysisResponse = await axios.post('http://localhost:3001/api/strategies/analyze', {
      fundId: YOUR_FUND_ID,
      ticker: "AAPL"
    }, { headers });
    
    console.log('✅ Analysis complete:');
    console.log(`   Consensus: ${analysisResponse.data.data.analysis.consensus}`);
    console.log(`   Avg Confidence: ${(analysisResponse.data.data.analysis.avgConfidence * 100).toFixed(1)}%`);
    console.log(`   Recommended Size: ${analysisResponse.data.data.analysis.recommendedSize} shares`);
    
    analysisResponse.data.data.strategies.forEach(strategy => {
      console.log(`   ${strategy.name}: ${strategy.signal.action} (${(strategy.signal.confidence * 100).toFixed(1)}%)`);
    });

    // 3. Get execution recommendations
    console.log('\n🚀 Getting strategy recommendations...');
    const executeResponse = await axios.post('http://localhost:3001/api/strategies/execute', {
      fundId: YOUR_FUND_ID,
      ticker: "AAPL"
    }, { headers });
    
    console.log('✅ Recommendations:');
    if (executeResponse.data.data.recommendations) {
      executeResponse.data.data.recommendations.forEach(rec => {
        console.log(`   ${rec.strategy}: ${rec.action} ${rec.quantity} shares (${(rec.confidence * 100).toFixed(1)}%)`);
      });
    } else {
      console.log('   No actionable recommendations at this time');
    }
    
  } catch (error) {
    console.error('❌ Test Error:', error.response?.data || error.message);
  }
}
*/

phase7StrategyDemo();