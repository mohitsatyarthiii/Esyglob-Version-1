import { config } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;
  const requestId = req.headers['x-request-id'] || req.id;

  // Log error in development
  if (config.nodeEnv === 'development') {
    console.error('Error:', err);
  } else {
    console.error('Error:', err.message);
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const fieldErrors = Object.fromEntries(err.issues.map((issue) => [
      issue.path.join('.'),
      issue.message,
    ]));
    return res.status(422).json({
      error: 'Please check your input details',
      code: 'VALIDATION_ERROR',
      fieldErrors,
      requestId,
      details: config.isProduction ? undefined : err.issues,
    });
  }

  // Handle MongoDB duplicate key errors
  if (err.code === 11000) {
    return res.status(409).json({
      error: 'Resource already exists',
      code: 'DUPLICATE_RESOURCE',
      fields: Object.keys(err.keyPattern || err.keyValue || {}),
      requestId,
    });
  }

  return res.status(statusCode).json({
    error: message,
    code: err.code || (statusCode === 401 ? 'AUTHENTICATION_REQUIRED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED'),
    requestId,
  });
}

export function notFoundHandler(req, res) {
  return res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
  });
}
