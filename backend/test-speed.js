const BASE = 'http://localhost:5000';

const endpoints = [
  { name: 'Products', url: '/api/products?page=1&limit=3' },
  { name: 'Categories', url: '/api/categories' },
  { name: 'Suppliers', url: '/api/suppliers?page=1&limit=3' },
  { name: 'RFQs', url: '/api/rfqs?page=1&limit=3' },
  { name: 'Search', url: '/api/search?q=steel' },
  { name: 'Health', url: '/api/health' },
];

async function test() {
  console.log('🚀 Testing All Public APIs...\n');
  
  for (const api of endpoints) {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}${api.url}`);
      const ms = Date.now() - start;
      console.log(`✅ ${api.name.padEnd(15)} | ${res.status} | ${ms}ms | ${api.url}`);
    } catch (e) {
      console.log(`❌ ${api.name.padEnd(15)} | ERROR | ${e.message}`);
    }
  }
  
  console.log('\n✅ Done!');
}

test();