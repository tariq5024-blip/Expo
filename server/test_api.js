const port = 5000;
const baseUrl = `http://localhost:${port}/api`;

async function test() {
  try {
    // 1. Login
    console.log('Logging in...');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'scy@expo.com', password: 'admin123' })
    });
    
    if (!loginRes.ok) {
      console.error('Login failed:', loginRes.status, await loginRes.text());
      return;
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Login successful. Token obtained.');
    console.log('User Store:', loginData.assignedStore);

    // 2. Fetch Stats
    console.log('Fetching stats...');
    const statsRes = await fetch(`${baseUrl}/asset-categories/stats`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!statsRes.ok) {
      console.error('Stats fetch failed:', statsRes.status, await statsRes.text());
      return;
    }

    const statsData = await statsRes.json();
    console.log('Stats fetched successfully.');
    console.log('Items count:', statsData.length);
    if (statsData.length > 0) {
      console.log('First Item:', JSON.stringify(statsData[0], null, 2));
    } else {
      console.log('Stats array is empty.');
    }

  } catch (err) {
    console.error('Test error:', err);
  }
}

test();
