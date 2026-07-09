import app from './app.js';
import { config } from './config/env.js';
import { connectToDatabase, warmupDatabase } from './config/database.js';

async function startServer() {
  try {
    // Step 1: Connect to MongoDB
    await connectToDatabase();
    console.log('✅ Database connected successfully');

    // Step 2: Pre-warm connections & cache
    await warmupDatabase();

    // Step 3: Start Express server
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

startServer();