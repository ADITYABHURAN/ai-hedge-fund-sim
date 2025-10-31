const axios = require('axios');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImVtYWlsIjoidHJhZGVyQGFpZnVuZC5jb20iLCJpYXQiOjE3NjE4Nzk3NjQsImV4cCI6MTc2MjQ4NDU2NH0.SgnfcY4S8s3f6E_i276jxPkxBYpFyvW1J9eJTZZLolg";

async function checkPositions() {
  try {
    console.log('Checking current positions...');
    const response = await axios.get('http://localhost:3001/api/positions/fund/3', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Positions:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

async function testSell() {
  try {
    console.log('Testing sell order for 5 shares...');
    const response = await axios.post('http://localhost:3001/api/positions/sell', {
      fundId: 3,
      ticker: "AAPL", 
      quantity: 5,
      price: 190.50
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Success:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

async function main() {
  await checkPositions();
  console.log('\n---\n');
  await testSell();
}

main();