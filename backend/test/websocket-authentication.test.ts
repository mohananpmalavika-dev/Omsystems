/**
 * WebSocket Authentication Security Tests
 * 
 * Tests comprehensive JWT validation, permission checks, and channel access control
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sign } from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { Server as HTTPServer } from 'http';
import { Pool } from 'pg';
import { WebSocketManager } from '../src/services/websocket-manager.service';

describe('WebSocket Authentication Security', () => {
  let httpServer: HTTPServer;
  let wsManager: WebSocketManager;
  let pool: Pool;
  const JWT_SECRET = 'test-secret-key';
  const TEST_PORT = 3001;

  beforeAll(async () => {
    // Setup test database pool
    pool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      database: process.env.TEST_DB_NAME || 'sentinel_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
    });

    // Setup HTTP server and WebSocket manager
    httpServer = require('http').createServer();
    wsManager = new WebSocketManager(httpServer, pool, JWT_SECRET);
    
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await wsManager.shutdown();
    httpServer.close();
    await pool.end();
  });

  function waitForConnectError(socket: Socket): Promise<Error> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Connection error timeout'));
      }, 4000);
      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        socket.close();
        resolve(error);
      });
      socket.once('connect', () => {
        clearTimeout(timeout);
        socket.close();
        reject(new Error('Unexpected successful connection'));
      });
    });
  }

  function waitForSubscription(socket: Socket, channels: string[]): Promise<{ channels: string[] }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Subscription timeout'));
      }, 4000);
      socket.once('connect', () => {
        socket.emit('subscribe', channels);
      });
      socket.once('subscribed', (data) => {
        clearTimeout(timeout);
        socket.close();
        resolve(data);
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      });
    });
  }

  describe('JWT Token Validation', () => {
    it('should reject connection without token', async () => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {},
        reconnection: false,
      });

      const error = await waitForConnectError(socket);
      expect(error.message).toBe('Authentication token required');
    });

    it('should reject connection with invalid token', async () => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {
          token: 'invalid-token-format'
        },
        reconnection: false,
      });

      const error = await waitForConnectError(socket);
      expect(error.message).toContain('Invalid or expired authentication token');
    });

    it('should reject connection with expired token', async () => {
      const expiredToken = sign(
        {
          userId: 'test-user-id',
          tenantId: 'test-tenant-id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'operator',
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {
          token: expiredToken
        },
        reconnection: false,
      });

      const error = await waitForConnectError(socket);
      expect(error.message).toContain('Invalid or expired authentication token');
    });

    it('should reject token with missing required fields', async () => {
      const incompleteToken = sign(
        {
          userId: 'test-user-id',
          // Missing: tenantId, username, email, role
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {
          token: incompleteToken
        },
        reconnection: false,
      });

      const error = await waitForConnectError(socket);
      expect(error.message).toContain('Invalid or expired authentication token');
    });

    it('should reject token with wrong issuer', async () => {
      const token = sign(
        {
          userId: 'test-user-id',
          tenantId: 'test-tenant-id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'operator',
          iss: 'wrong-issuer',
          aud: 'sentinel-grid-api'
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {
          token: token
        },
        reconnection: false,
      });

      const error = await waitForConnectError(socket);
      expect(error.message).toContain('Invalid or expired authentication token');
    });

    it('should reject token with wrong secret', async () => {
      const token = sign(
        {
          userId: 'test-user-id',
          tenantId: 'test-tenant-id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'operator',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api'
        },
        'wrong-secret'
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {
          token: token
        },
        reconnection: false,
      });

      const error = await waitForConnectError(socket);
      expect(error.message).toContain('Invalid or expired authentication token');
    });
  });

  describe('Channel Access Control', () => {
    let validToken: string;

    beforeEach(() => {
      validToken = sign(
        {
          userId: 'test-user-id',
          tenantId: 'test-tenant-id',
          username: 'testoperator',
          email: 'operator@example.com',
          role: 'operator',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );
    });

    it('should allow operator to subscribe to cameras channel', async () => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: validToken },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, ['cameras']);
      expect(data.channels).toContain('cameras');
    });

    it('should deny operator access to global-dashboard channel', async () => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: validToken },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, ['global-dashboard']);
      expect(data.channels).not.toContain('global-dashboard');
    });

    it('should deny operator access to central-monitoring channel', async () => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: validToken },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, ['central-monitoring']);
      expect(data.channels).not.toContain('central-monitoring');
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow super_admin full access', async () => {
      const adminToken = sign(
        {
          userId: 'admin-user-id',
          tenantId: 'test-tenant-id',
          username: 'admin',
          email: 'admin@example.com',
          role: 'super_admin',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: adminToken },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, [
        'global-dashboard',
        'central-monitoring',
        'alerts',
        'incidents'
      ]);

      expect(data.channels).toContain('global-dashboard');
      expect(data.channels).toContain('central-monitoring');
      expect(data.channels).toContain('alerts');
      expect(data.channels).toContain('incidents');
    });

    it('should restrict branch_manager to appropriate channels', async () => {
      const managerToken = sign(
        {
          userId: 'manager-user-id',
          tenantId: 'test-tenant-id',
          username: 'manager',
          email: 'manager@example.com',
          role: 'branch_manager',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: managerToken },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, [
        'alerts',
        'incidents',
        'cameras',
        'branch-health',
        'global-dashboard' // Should be denied
      ]);

      expect(data.channels).toContain('alerts');
      expect(data.channels).toContain('incidents');
      expect(data.channels).toContain('cameras');
      expect(data.channels).toContain('branch-health');
      expect(data.channels).not.toContain('global-dashboard');
    });
  });

  describe('Tenant Isolation', () => {
    it('should isolate connections by tenant', async () => {
      const tenant1Token = sign(
        {
          userId: 'user1',
          tenantId: 'tenant-1',
          username: 'user1',
          email: 'user1@tenant1.com',
          role: 'super_admin',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );

      const tenant2Token = sign(
        {
          userId: 'user2',
          tenantId: 'tenant-2',
          username: 'user2',
          email: 'user2@tenant2.com',
          role: 'super_admin',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );

      const socket1 = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: tenant1Token },
        reconnection: false,
      });

      const socket2 = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: tenant2Token },
        reconnection: false,
      });

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          socket1.once('connect', resolve);
          socket1.once('connect_error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          socket2.once('connect', resolve);
          socket2.once('connect_error', reject);
        })
      ]);

      const stats = wsManager.getStatistics();
      expect(stats.totalConnections).toBe(2);
      expect(stats.tenantConnections['tenant-1']).toBe(1);
      expect(stats.tenantConnections['tenant-2']).toBe(1);

      socket1.close();
      socket2.close();
    });
  });

  describe('Security Edge Cases', () => {
    it('should reject unknown channel types', async () => {
      const token = sign(
        {
          userId: 'test-user-id',
          tenantId: 'test-tenant-id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'operator',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, ['unknown-channel-type']);
      expect(data.channels).not.toContain('unknown-channel-type');
    });

    it('should validate branch channel format', async () => {
      const token = sign(
        {
          userId: 'test-user-id',
          tenantId: 'test-tenant-id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'operator',
          iss: 'sentinel-grid',
          aud: 'sentinel-grid-api',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        JWT_SECRET
      );

      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token },
        reconnection: false,
      });

      const data = await waitForSubscription(socket, ['branch:']); // Invalid format (no branch ID)
      expect(data.channels).not.toContain('branch:');
    });
  });
});
