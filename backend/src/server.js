import app from './app.js';
import { config } from './config/env.js';
import { closeDatabase, connectToDatabase, warmupDatabase } from './config/database.js';
import { createServer } from 'node:http';
import { initializeSocket } from './lib/socket-server.js';
import AIChatService from './services/ai-chat.service.js';

let server;

async function startServer() {
  try {
    await connectToDatabase();
    console.log('Database connected successfully');

    await warmupDatabase();

    server = createServer(app);
    initializeSocket(server);
    AIChatService.warmProvider().then(ok => {
      console.log(`[AI] Ollama warm-up ${ok ? 'complete' : 'unavailable'}`);
    });
    const aiKeepWarm = setInterval(() => {
      AIChatService.warmProvider().catch(() => undefined);
    }, Number(process.env.OLLAMA_WARM_INTERVAL_MS || 25 * 60 * 1000));
    aiKeepWarm.unref();
    server.listen(config.port, () => {
      console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();

  if (server) {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    return;
  }

  await closeDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

startServer();
