const fs = require('node:fs');
const path = require('node:path');

const logDirectory = path.join(__dirname, 'logs');
fs.mkdirSync(logDirectory, { recursive: true });

module.exports = {
  apps: [{
    name: 'esyglob-backend',
    cwd: __dirname,
    script: 'src/server.js',
    instances: 2,           // 2 vCPUs = 2 instances
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      // Point this to a mounted persistent volume when deploying containers.
      MARKET_REPORT_STORAGE_DIR: './storage/market-insights',
    },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: path.join(logDirectory, 'error.log'),
    out_file: path.join(logDirectory, 'output.log'),
    merge_logs: true,
  }],
};
