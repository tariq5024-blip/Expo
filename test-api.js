const http = require('http');

console.log('Testing API...');
http.get('http://localhost:5000/api/asset-categories', (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Data:', data.substring(0, 200)));
}).on('error', err => console.log('Error:', err.message));