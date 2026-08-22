/**
 * Camera Credentials Management Routes
 * Centralized credential management for 400+ locations and 4000+ cameras
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

interface CameraCredential {
  id: string;
  branch_id: string;
  edge_agent_id?: string;
  ip_address?: string;
  username: string;
  password?: string; // Hidden in responses
  scope: string;
  created_at: Date;
  updated_at: Date;
}

export async function registerCredentialsRoutes(app: FastifyInstance, pool: Pool) {
  
  // Get all credentials (with pagination)
  app.get<{
    Querystring: { page?: number; limit?: number; branch_id?: string };
  }>("/api/credentials", async (request, reply) => {
    const { page = 1, limit = 50, branch_id } = request.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, branch_id, edge_agent_id, ip_address, username, 
             scope, created_at, updated_at
      FROM camera_credentials
    `;
    const params: any[] = [];

    if (branch_id) {
      query += ` WHERE branch_id = $1`;
      params.push(branch_id);
      query += ` ORDER BY 
        CASE WHEN ip_address IS NOT NULL THEN 1 ELSE 2 END, 
        created_at DESC
        LIMIT $2 OFFSET $3`;
      params.push(limit, offset);
    } else {
      query += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = branch_id
      ? `SELECT COUNT(*) FROM camera_credentials WHERE branch_id = $1`
      : `SELECT COUNT(*) FROM camera_credentials`;
    const countParams = branch_id ? [branch_id] : [];
    const countResult = await pool.query(countQuery, countParams);

    return {
      credentials: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(countResult.rows[0].count / limit),
      },
    };
  });

  // Get credentials for a specific branch
  app.get<{
    Params: { branch_id: string };
  }>("/api/credentials/branch/:branch_id", async (request, reply) => {
    const { branch_id } = request.params;

    const result = await pool.query(
      `SELECT id, branch_id, edge_agent_id, ip_address, username, 
              scope, created_at, updated_at
       FROM camera_credentials
       WHERE branch_id = $1
       ORDER BY 
         CASE WHEN ip_address IS NOT NULL THEN 1 ELSE 2 END,
         created_at DESC`,
      [branch_id]
    );

    return {
      branch_id,
      credentials: result.rows,
      total: result.rows.length,
    };
  });

  // Add new credential
  app.post<{
    Body: {
      branch_id: string;
      edge_agent_id?: string;
      ip_address?: string;
      username: string;
      password: string;
    };
  }>("/api/credentials", async (request, reply) => {
    const { branch_id, edge_agent_id, ip_address, username, password } = request.body;

    if (!branch_id || !username || !password) {
      return reply.code(400).send({
        error: "branch_id, username, and password are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO camera_credentials 
         (branch_id, edge_agent_id, ip_address, username, password, scope)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, branch_id, edge_agent_id, ip_address, username, 
                 scope, created_at, updated_at`,
      [
        branch_id,
        edge_agent_id || null,
        ip_address || null,
        username,
        password,
        ip_address ? "host-specific" : "default",
      ]
    );

    return reply.code(201).send({
      success: true,
      credential: result.rows[0],
    });
  });

  // Update credential
  app.put<{
    Params: { id: string };
    Body: {
      username?: string;
      password?: string;
      ip_address?: string;
    };
  }>("/api/credentials/:id", async (request, reply) => {
    const { id } = request.params;
    const { username, password, ip_address } = request.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (username) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (password) {
      updates.push(`password = $${paramIndex++}`);
      values.push(password);
    }
    if (ip_address !== undefined) {
      updates.push(`ip_address = $${paramIndex++}`);
      updates.push(`scope = $${paramIndex++}`);
      values.push(ip_address || null);
      values.push(ip_address ? "host-specific" : "default");
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE camera_credentials 
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, branch_id, edge_agent_id, ip_address, username, 
                 scope, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "Credential not found" });
    }

    return {
      success: true,
      credential: result.rows[0],
    };
  });

  // Delete credential
  app.delete<{
    Params: { id: string };
  }>("/api/credentials/:id", async (request, reply) => {
    const { id } = request.params;

    const result = await pool.query(
      `DELETE FROM camera_credentials WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "Credential not found" });
    }

    return {
      success: true,
      deleted: id,
    };
  });

  // Bulk import credentials
  app.post<{
    Body: {
      credentials: Array<{
        branch_id: string;
        edge_agent_id?: string;
        ip_address?: string;
        username: string;
        password: string;
        location_name?: string;
      }>;
    };
  }>("/api/credentials/bulk", async (request, reply) => {
    const { credentials } = request.body;

    if (!Array.isArray(credentials) || credentials.length === 0) {
      return reply.code(400).send({
        error: "credentials array is required and must not be empty",
      });
    }

    const results = {
      imported: 0,
      failed: 0,
      errors: [] as Array<{ index: number; error: string }>,
    };

    for (let i = 0; i < credentials.length; i++) {
      const cred = credentials[i];
      
      try {
        await pool.query(
          `INSERT INTO camera_credentials 
             (branch_id, edge_agent_id, ip_address, username, password, scope)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            cred.branch_id,
            cred.edge_agent_id || null,
            cred.ip_address || null,
            cred.username,
            cred.password,
            cred.ip_address ? "host-specific" : "default",
          ]
        );
        results.imported++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: results.failed === 0,
      ...results,
      total: credentials.length,
    };
  });

  // Get statistics
  app.get("/api/credentials/stats", async (request, reply) => {
    const [totalResult, branchesResult, hostSpecificResult, defaultResult] =
      await Promise.all([
        pool.query(`SELECT COUNT(*) FROM camera_credentials`),
        pool.query(
          `SELECT COUNT(DISTINCT branch_id) FROM camera_credentials`
        ),
        pool.query(
          `SELECT COUNT(*) FROM camera_credentials WHERE scope = 'host-specific'`
        ),
        pool.query(
          `SELECT COUNT(*) FROM camera_credentials WHERE scope = 'default'`
        ),
      ]);

    return {
      total: parseInt(totalResult.rows[0].count),
      branches: parseInt(branchesResult.rows[0].count),
      hostSpecific: parseInt(hostSpecificResult.rows[0].count),
      default: parseInt(defaultResult.rows[0].count),
    };
  });
}
