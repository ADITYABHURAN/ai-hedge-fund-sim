'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [backendStatus, setBackendStatus] = useState('Testing...');
  const [strategiesCount, setStrategiesCount] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/health');
      const data = await response.json();
      if (data.success) {
        setBackendStatus('✅ Connected');
        
        // Try to get strategies
        try {
          const stratResponse = await fetch('http://localhost:3001/api/strategies');
          const stratData = await stratResponse.json();
          if (stratData.success) {
            setStrategiesCount(stratData.data.strategies.length);
          }
        } catch (err) {
          console.log('Strategies endpoint error:', err);
        }
      } else {
        setBackendStatus('❌ Disconnected');
      }
    } catch (error) {
      setBackendStatus('❌ Error');
      console.error('Backend connection failed:', error);
    }
  };

  const testEndpoint = async (endpoint: string) => {
    setMessage('Testing...');
    try {
      const response = await fetch(`http://localhost:3001/api/${endpoint}`);
      const data = await response.json();
      setMessage(`✅ ${endpoint}: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setMessage(`❌ ${endpoint}: ${String(error)}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🤖 AI Hedge Fund Simulator
          </h1>
          <p className="text-lg text-gray-600">
            Autonomous Algorithmic Trading Platform
          </p>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            📊 System Status
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl mb-2">🟢</div>
              <p className="font-medium">Backend API</p>
              <p className="text-sm text-gray-600">{backendStatus}</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-3xl mb-2">🧠</div>
              <p className="font-medium">AI Strategies</p>
              <p className="text-sm text-gray-600">{strategiesCount} Active</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-3xl mb-2">🔌</div>
              <p className="font-medium">API Ready</p>
              <p className="text-sm text-gray-600">All Systems Go</p>
            </div>
          </div>
        </div>

        {/* Quick Tests */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            🧪 Quick API Tests
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Health Check', endpoint: 'health', icon: '🏥' },
              { name: 'AI Strategies', endpoint: 'strategies', icon: '🧠' },
              { name: 'Auto Trading', endpoint: 'auto-trading/sessions', icon: '🤖' },
              { name: 'Config Template', endpoint: 'auto-trading/config/template', icon: '📋' }
            ].map((test, index) => (
              <button
                key={index}
                onClick={() => testEndpoint(test.endpoint)}
                className="p-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <div className="text-2xl mb-2">{test.icon}</div>
                <div className="font-medium">{test.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {message && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Test Results:</h3>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-64">
              {message}
            </pre>
          </div>
        )}

        {/* Links */}
        <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            🔗 Direct Links
          </h2>
          <div className="space-y-2">
            <a 
              href="http://localhost:3001/api/health" 
              target="_blank"
              className="block text-blue-600 hover:text-blue-800 underline"
            >
              Backend Health Check →
            </a>
            <a 
              href="http://localhost:3001/api/strategies" 
              target="_blank"
              className="block text-blue-600 hover:text-blue-800 underline"
            >
              AI Strategies Endpoint →
            </a>
            <a 
              href="http://localhost:3001/" 
              target="_blank"
              className="block text-blue-600 hover:text-blue-800 underline"
            >
              Backend Root →
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}