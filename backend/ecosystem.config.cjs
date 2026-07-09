module.exports = {
  apps: [{
    name: 'esyglob-backend',
    script: 'src/server.js',
    instances: 2,           // 2 vCPUs = 2 instances
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
  }],
};