import mongoose from 'mongoose';
import { config } from './env.js';

let connection;
let connectPromise;

function attachListeners(activeConnection) {
  activeConnection.on('connected', () => console.log('AI knowledge MongoDB connected successfully'));
  activeConnection.on('error', error => console.error('AI knowledge MongoDB connection error:', error));
  activeConnection.on('disconnected', () => console.warn('AI knowledge MongoDB disconnected'));
  activeConnection.on('reconnected', () => console.log('AI knowledge MongoDB reconnected'));
}

export function getAIKnowledgeConnection() {
  if (!connection) {
    connection = mongoose.createConnection();
    attachListeners(connection);
  }
  return connection;
}

export async function connectToAIKnowledgeDatabase() {
  if (!config.aiRagEnabled) return null;
  const activeConnection = getAIKnowledgeConnection();
  if (activeConnection.readyState === 1) return activeConnection;
  if (connectPromise) return connectPromise;

  connectPromise = activeConnection.openUri(config.aiKnowledgeMongoUri, {
    ...(config.aiKnowledgeDbName ? { dbName: config.aiKnowledgeDbName } : {}),
    maxPoolSize: config.aiKnowledgeMongoMaxPoolSize,
    minPoolSize: config.aiKnowledgeMongoMinPoolSize,
    socketTimeoutMS: 45_000,
    serverSelectionTimeoutMS: 5_000,
    heartbeatFrequencyMS: 10_000,
    retryWrites: true,
    family: 4,
  }).finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

export function getAIKnowledgeDatabaseState() {
  return config.aiRagEnabled ? getAIKnowledgeConnection().readyState : 0;
}

export async function closeAIKnowledgeDatabase() {
  if (!connection || connection.readyState === 0) return;
  await connection.close();
}
