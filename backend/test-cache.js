// test-cache.js
const BASE_URL = 'http://localhost:5000/api'; // port adjust karo

async function test() {
  console.log('🔬 Cache Hit Test — Same query 5 times\n');

  for (let i = 1; i <= 5; i++) {
    const start = Date.now();
    const res = await fetch(`${BASE_URL}/products?page=1&limit=3`);
    const time = Date.now() - start;
    const data = await res.json();
    console.log(`Run ${i}: ${time}ms | products: ${data.products?.length} | total: ${data.total}`);
  }

  console.log('\nExpect: 1st ~50ms, 2nd-5th ~4ms (if cache working)');
}

test().catch(console.error);