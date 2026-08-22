#!/usr/bin/env node

/**
 * Compliance & Audit Scheduler
 * 
 * Runs automated jobs for:
 * - Camera health monitoring
 * - Recording verification
 * - Storage health checks
 * - Compliance assessments
 * - Certificate expiry alerts
 * - Maintenance tracking
 * - Access log analysis
 * 
 * Usage:
 *   npm run scheduler
 *   node dist/scheduler.js
 */

import { Pool } from 'pg';
import { SchedulerService } from './services/scheduler-service.js';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'aditi_sentinel',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
  console.log('Database connected successfully at', res.rows[0].now);
});

// Initialize scheduler
const scheduler = new SchedulerService(pool);

// Start scheduler
scheduler.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  scheduler.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  scheduler.stop();
  await pool.end();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  scheduler.stop();
  pool.end();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('');
console.log('='.repeat(80));
console.log('  Aditi Sentinel - Compliance & Audit Scheduler');
console.log('='.repeat(80));
console.log('');
console.log('  Environment:', process.env.NODE_ENV || 'development');
console.log('  Database:', process.env.DB_NAME || 'aditi_sentinel');
console.log('  Host:', process.env.DB_HOST || 'localhost');
console.log('');
console.log('  Press Ctrl+C to stop');
console.log('');
console.log('='.repeat(80));
console.log('');
