// test-network.js
// Run: node test-network.js
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import dns from 'dns';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function test() {
  const uri = process.env.MONGODB_URI;
  // Extract first hostname only (remove port and multiple hosts)
  const hostPart = uri.split('@')[1]?.split('/')[0];
  const hostname = hostPart?.split(',')[0]?.split(':')[0] || 'unknown';
  
  console.log(`🌐 Testing connection to: ${hostname}\n`);

  // DNS lookup
  const t0 = Date.now();
  let ip;
  try {
    const addresses = await dns.promises.resolve4(hostname);
    ip = addresses[0];
    const dnsTime = Date.now() - t0;
    console.log(`📡 DNS Resolution:          ${dnsTime}ms → ${ip}`);
  } catch (err) {
    console.log(`📡 DNS Resolution:          FAILED — ${err.message}`);
    console.log('   Check your internet connection');
    process.exit(1);
  }

  // TCP ping (3 attempts for average)
  console.log('\n🔌 TCP Connection Tests (port 27017):');
  let totalTime = 0;
  let successCount = 0;

  for (let i = 1; i <= 3; i++) {
    const tStart = Date.now();
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: ip, port: 27017, timeout: 5000 });
        socket.on('connect', () => {
          const time = Date.now() - tStart;
          console.log(`   Attempt ${i}: ✅ ${time}ms`);
          totalTime += time;
          successCount++;
          socket.end();
          resolve();
        });
        socket.on('error', (err) => {
          console.log(`   Attempt ${i}: ❌ ${err.message}`);
          reject(err);
        });
        socket.on('timeout', () => {
          console.log(`   Attempt ${i}: ❌ timeout (>5000ms)`);
          socket.destroy();
          reject(new Error('timeout'));
        });
      });
    } catch {
      // Continue to next attempt
    }
  }

  if (successCount > 0) {
    const avgTime = Math.round(totalTime / successCount);
    console.log(`\n   Average TCP time:        ${avgTime}ms`);

    console.log('\n═══════════════════════════════════════');
    if (avgTime > 150) {
      console.log('🔴 VERY HIGH LATENCY (>150ms)');
      console.log('   Ye EXTREMELY unusual hai Mumbai region ke liye!');
      console.log('   Check karo:');
      console.log('   - VPN chal raha hai?');
      console.log('   - Proxy settings?');
      console.log('   - Antivirus/Firewall interfering?');
      console.log('   - Try: mobile hotspot se connect karke test karo');
    } else if (avgTime > 80) {
      console.log('🟡 HIGH LATENCY (80-150ms)');
      console.log('   Mumbai region ke liye 10-30ms expected tha');
      console.log('   ISP issue ho sakta hai — mobile hotspot try karo');
    } else if (avgTime > 40) {
      console.log('🟠 MODERATE LATENCY (40-80ms)');
      console.log('   Acceptable but could be better');
    } else {
      console.log('🟢 GOOD LATENCY (<40ms)');
      console.log('   Network theek hai — problem kahin aur hai');
    }
  } else {
    console.log('\n❌ All connection attempts failed!');
    console.log('   MongoDB Atlas reachable nahi hai');
  }

  // Also ping using command line
  console.log('\n💡 Try this in PowerShell:');
  console.log(`   Test-NetConnection ${hostname} -Port 27017`);
}

test().catch(err => console.error('❌', err.message));