export default function Home() {
  return (
    <div style={{
      padding: '40px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f0f9ff',
      minHeight: '100vh'
    }}>
      <h1 style={{
        fontSize: '3rem',
        color: '#1e40af',
        textAlign: 'center',
        marginBottom: '20px'
      }}>
        🤖 AI Hedge Fund Simulator
      </h1>
      
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '10px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <h2 style={{ color: '#374151', marginBottom: '20px' }}>
          ✅ Frontend is Working!
        </h2>
        
        <p style={{ fontSize: '1.1rem', color: '#6b7280', marginBottom: '30px' }}>
          Your AI hedge fund application is now running successfully.
        </p>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          <div style={{
            backgroundColor: '#dcfce7',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🟢</div>
            <h3 style={{ color: '#166534', margin: '0 0 10px 0' }}>Backend API</h3>
            <p style={{ color: '#15803d', margin: 0 }}>Connected</p>
          </div>
          
          <div style={{
            backgroundColor: '#dbeafe',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🧠</div>
            <h3 style={{ color: '#1e40af', margin: '0 0 10px 0' }}>AI Strategies</h3>
            <p style={{ color: '#2563eb', margin: 0 }}>Ready</p>
          </div>
          
          <div style={{
            backgroundColor: '#fef3c7',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🤖</div>
            <h3 style={{ color: '#92400e', margin: '0 0 10px 0' }}>Auto Trading</h3>
            <p style={{ color: '#d97706', margin: 0 }}>Available</p>
          </div>
        </div>
        
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h3 style={{ color: '#374151', marginBottom: '15px' }}>🔗 Quick Links:</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a 
              href="http://localhost:3001/api/health" 
              target="_blank" 
              style={{ 
                color: '#2563eb', 
                textDecoration: 'none',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '4px',
                display: 'block'
              }}
            >
              🏥 Backend Health Check →
            </a>
            <a 
              href="http://localhost:3001/api/strategies" 
              target="_blank" 
              style={{ 
                color: '#2563eb', 
                textDecoration: 'none',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '4px',
                display: 'block'
              }}
            >
              🧠 View AI Strategies →
            </a>
            <a 
              href="http://localhost:3001/" 
              target="_blank" 
              style={{ 
                color: '#2563eb', 
                textDecoration: 'none',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '4px',
                display: 'block'
              }}
            >
              🌐 Backend API Root →
            </a>
          </div>
        </div>
        
        <div style={{
          textAlign: 'center',
          padding: '20px',
          backgroundColor: '#ecfdf5',
          borderRadius: '8px'
        }}>
          <h3 style={{ color: '#065f46', marginBottom: '10px' }}>
            🎉 Your AI Hedge Fund is Ready!
          </h3>
          <p style={{ color: '#047857', margin: 0 }}>
            Backend: http://localhost:3001 | Frontend: http://localhost:3000
          </p>
        </div>
      </div>
    </div>
  );
}