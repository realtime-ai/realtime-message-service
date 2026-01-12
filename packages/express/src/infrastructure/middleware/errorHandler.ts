import { Request, Response, NextFunction } from 'express';
import { ILogger } from '../../core/ports/ILogger.js';

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  requestId?: string;
  details?: string;
}

/**
 * Global error handler middleware
 */
export function createErrorHandler(logger: ILogger) {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      requestId: req.requestId,
      path: req.path,
      method: req.method,
    });

    const response: ErrorResponse = {
      error: 'Internal server error',
      requestId: req.requestId,
    };

    // Include error details in development
    if (process.env.NODE_ENV === 'development') {
      response.details = err.message;
    }

    res.status(500).json(response);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    requestId: req.requestId,
  });
}
