import { config } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Unable to sign in' : err.message;

  // Log error in development
  if (config.nodeEnv === 'development') {
    console.error('Error:', err);
  } else {
    console.error('Error:', err.message);
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(422).json({
      error: 'Please check your input details',
    });
  }

  // Handle MongoDB duplicate key errors
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Resource already exists',
    });
  }

  return res.status(statusCode).json({
    error: message,
  });
}

export function notFoundHandler(req, res) {
  return res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}