/**
 * Express Application Setup
 *
 * Creates and configures the Express application with middleware,
 * API routes, and static file serving.
 *
 * @requirements 1.4 - Serve the built React client from the static files directory
 * @requirements 1.7 - Operate without authentication (local-only security model)
 */

import * as path from 'node:path';

import express, { type Express } from 'express';

import { createApiRoutes, errorHandler, notFoundHandler } from './api-routes.js';
import { DriftDataReader } from './drift-data-reader.js';

export interface ExpressAppOptions {
  /** DriftDataReader instance */
  reader: DriftDataReader;
  /** Path to static files directory (dist/client) */
  staticDir?: string;
  /** Enable CORS for development */
  enableCors?: boolean;
}

/**
 * Create and configure the Express application
 */
export function createExpressApp(options: ExpressAppOptions): Express {
  const app = express();

  // ==========================================================================
  // Middleware
  // ==========================================================================

  // JSON body parser
  app.use(express.json());

  // CORS for local development
  if (options.enableCors !== false) {
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Handle preflight requests
      if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
  }

  // ==========================================================================
  // API Routes
  // ==========================================================================

  const apiRoutes = createApiRoutes(options.reader);
  app.use('/api', apiRoutes);

  // ==========================================================================
  // Static File Serving
  // ==========================================================================

  if (options.staticDir) {
    // Serve static files from the client build directory
    app.use(express.static(options.staticDir));

    // Serve index.html for all non-API routes (SPA support)
    app.get('*', (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next();
        return;
      }

      const indexPath = path.join(options.staticDir!, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          // If index.html doesn't exist, continue to 404 handler
          next();
        }
      });
    });
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  // 404 handler for unknown API routes
  app.use('/api/*', notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}
