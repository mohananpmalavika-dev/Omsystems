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

  describe('JWT Token Validation', () => {
    it('should reject connection without token', (done) => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {}
      });

      socket.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication token required');
        socket.close();
        done();
      });

      socket.on('connect', () => {
        socket.close();
        done(new Error('Should not connect without token'));
      });
    });

    it('should reject connection with invalid token', (done) => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        auth: {
          token: 'invalid-token-format'
        }
      });

      socket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid or expired authentication token');
        socket.close();
        done();
      });

      socket.on('connect', () => {
        socket.close();
        done(new Error('Should not connect with invalid token'));
      });
    });

    it('should reject connection with expired token', (done) => {
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
        }
      });

      socket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid or expired authentication token');
        socket.close();
        done();
      });

      socket.on('connect', () => {
        socket.close();
        done(new Error('Should not connect with expired token'));
      });
    });

    it('should reject token with missing required fields', (done) => {
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
        }
      });

      socket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid or expired authentication token');
        socket.close();
        done();
      });

      socket.on('connect', () => {
        socket.close();
        done(new Error('Should not connect with incomplete token'));
      });
    });

    it('should reject token with wrong issuer', (done) => {
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
        }
      });

      socket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid or expired authentication token');
        socket.close();
        done();
      });

      socket.on('connect', () => {
        socket.close();
        done(new Error('Should not connect with wrong issuer'));
      });
    });

    it('should reject token with wrong secret', (done) => {
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
        }
      });

      socket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid or expired authentication token');
        socket.close();
        done();
      });

      socket.on('connect', () => {
        socket.close();
        done(new Error('Should not connect with wrong secret'));
      });
    });
  });

  describe('Channel Access Control', () => {
    let validToken: string;
    let operatorSocket: Socket;

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

    it('should allow operator to subscribe to cameras channel', (done) => {
      operatorSocket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: validToken }
      });

      operatorSocket.on('connect', () => {
        operatorSocket.emit('subscribe', ['cameras']);
      });

      operatorSocket.on('subscribed', (data) => {
        expect(data.channels).toContain('cameras');
        operatorSocket.close();
        done();
      });

      operatorSocket.on('connect_error', (error) => {
        operatorSocket.close();
        done(error);
      });
    });

    it('should deny operator access to global-dashboard channel', (done) => {
      operatorSocket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: validToken }
      });

      operatorSocket.on('connect', () => {
        operatorSocket.emit('subscribe', ['global-dashboard']);
      });

      operatorSocket.on('subscribed', (data) => {
        expect(data.channels).not.toContain('global-dashboard');
        operatorSocket.close();
        done();
      });

      operatorSocket.on('connect_error', (error) => {
        operatorSocket.close();
        done(error);
      });
    });

    it('should deny operator access to central-monitoring channel', (done) => {
      operatorSocket = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: validToken }
      });

      operatorSocket.on('connect', () => {
        operatorSocket.emit('subscribe', ['central-monitoring']);
      });

      operatorSocket.on('subscribed', (data) => {
        expect(data.channels).not.toContain('central-monitoring');
        operatorSocket.close();
        done();
      });

      operatorSocket.on('connect_error', (error) => {
        operatorSocket.close();
        done(error);
      });
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow super_admin full access', (done) => {
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
        auth: { token: adminToken }
      });

      socket.on('connect', () => {
        socket.emit('subscribe', [
          'global-dashboard',
          'central-monitoring',
          'alerts',
          'incidents'
        ]);
      });

      socket.on('subscribed', (data) => {
        expect(data.channels).toContain('global-dashboard');
        expect(data.channels).toContain('central-monitoring');
        expect(data.channels).toContain('alerts');
        expect(data.channels).toContain('incidents');
        socket.close();
        done();
      });

      socket.on('connect_error', (error) => {
        socket.close();
        done(error);
      });
    });

    it('should restrict branch_manager to appropriate channels', (done) => {
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
        auth: { token: managerToken }
      });

      socket.on('connect', () => {
        socket.emit('subscribe', [
          'alerts',
          'incidents',
          'cameras',
          'branch-health',
          'global-dashboard' // Should be denied
        ]);
      });

      socket.on('subscribed', (data) => {
        expect(data.channels).toContain('alerts');
        expect(data.channels).toContain('incidents');
        expect(data.channels).toContain('cameras');
        expect(data.channels).toContain('branch-health');
        expect(data.channels).not.toContain('global-dashboard');
        socket.close();
        done();
      });

      socket.on('connect_error', (error) => {
        socket.close();
        done(error);
      });
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
        auth: { token: tenant1Token }
      });

      const socket2 = io(`http://localhost:${TEST_PORT}`, {
        auth: { token: tenant2Token }
      });

      await Promise.all([
        new Promise<void>((resolve) => socket1.on('connect', resolve)),
        new Promise<void>((resolve) => socket2.on('connect', resolve))
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
    it('should reject unknown channel types', (done) => {
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
        auth: { token }
      });

      socket.on('connect', () => {
        socket.emit('subscribe', ['unknown-channel-type']);
      });

      socket.on('subscribed', (data) => {
        expect(data.channels).not.toContain('unknown-channel-type');
        socket.close();
        done();
      });

      socket.on('connect_error', (error) => {
        socket.close();
        done(error);
      });
    });

    it('should validate branch channel format', (done) => {
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
        auth: { token }
      });

      socket.on('connect', () => {
        socket.emit('subscribe', ['branch:']); // Invalid format (no branch ID)
      });

      socket.on('subscribed', (data) => {
        expect(data.channels).not.toContain('branch:');
        socket.close();
        done();
      });

      socket.on('connect_error', (error) => {
        socket.close();
        done(error);
      });
    });
  });
});
