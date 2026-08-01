import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../database/pool.js";

const testCredentialsSchema = z.object({
  edgeAgentId: z.string().uuid(),
  cameraIP: z.string().optional(),
  username: z.string(),
  password: z.string(),
});

const updateCredentialsSchema = z.object({
  edgeAgentId: z.string().uuid(),
  username: z.string(),
  password: z.string(),
});

export const edgeAgentCredentialsRoutes: FastifyPluginAsync = async (app) => {
  // Test camera credentials
  app.post("/api/edge-agents/test-camera-credentials", async (request, reply) => {
    const body = testCredentialsSchema.parse(request.body);

    try {
      // Get edge agent info
      const agentResult = await pool.query(
        "SELECT config FROM edge_agents WHERE id = $1",
        [body.edgeAgentId]
      );

      if (agentResult.rows.length === 0) {
        return reply.code(404).send({ error: "Edge agent not found" });
      }

      // In a real implementation, this would make an ONVIF request to test credentials
      // For now, we'll simulate the test
      
      // If cameraIP is provided, test that specific camera
      // Otherwise, get a camera from discoveries to test
      
      let testIP = body.cameraIP;
      
      if (!testIP) {
        // Get a discovered camera to test
        const discoveryResult = await pool.query(
          `SELECT ip_address FROM camera_discoveries 
           WHERE edge_agent_id = $1 
           AND ip_address IS NOT NULL 
           LIMIT 1`,
          [body.edgeAgentId]
        );
        
        if (discoveryResult.rows.length > 0) {
          testIP = discoveryResult.rows[0].ip_address;
        }
      }

      if (!testIP) {
        return reply.send({
          success: false,
          message: "No cameras found to test. Please specify a camera IP address.",
        });
      }

      // TODO: Implement actual ONVIF credential testing
      // For now, return a simulated response
      // In production, this would use the ONVIF client to test authentication
      
      reply.send({
        success: true, // Would be based on actual ONVIF test
        message: `Credentials test would be performed against ${testIP}`,
        cameraIP: testIP,
      });
    } catch (error) {
      app.log.error({ error }, "Failed to test camera credentials");
      reply.code(500).send({ error: "Failed to test credentials" });
    }
  });

  // Update camera credentials for edge agent
  app.post("/api/edge-agents/update-camera-credentials", async (request, reply) => {
    const body = updateCredentialsSchema.parse(request.body);

    try {
      // Get edge agent config
      const agentResult = await pool.query(
        "SELECT config FROM edge_agents WHERE id = $1",
        [body.edgeAgentId]
      );

      if (agentResult.rows.length === 0) {
        return reply.code(404).send({ error: "Edge agent not found" });
      }

      const currentConfig = agentResult.rows[0].config || {};
      
      // Update camera credentials in config
      const updatedConfig = {
        ...currentConfig,
        CAMERA_USERNAME: body.username,
        CAMERA_PASSWORD: body.password,
        LAST_CREDENTIAL_UPDATE: new Date().toISOString(),
      };

      // Save updated config
      await pool.query(
        "UPDATE edge_agents SET config = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(updatedConfig), body.edgeAgentId]
      );

      // Send command to edge agent to reload config
      // This would typically be done through a message queue or websocket
      // For now, the edge agent will pick it up on next heartbeat
      
      app.log.info(
        { edgeAgentId: body.edgeAgentId },
        "Updated camera credentials for edge agent"
      );

      reply.send({
        success: true,
        message: "Credentials updated. Edge agent will reload configuration on next heartbeat.",
      });
    } catch (error) {
      app.log.error({ error }, "Failed to update camera credentials");
      reply.code(500).send({ error: "Failed to update credentials" });
    }
  });

  // Get current camera credentials (masked)
  app.get("/api/edge-agents/:id/camera-credentials", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    try {
      const result = await pool.query(
        "SELECT config FROM edge_agents WHERE id = $1",
        [params.id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Edge agent not found" });
      }

      const config = result.rows[0].config || {};
      
      reply.send({
        username: config.CAMERA_USERNAME || "admin",
        passwordSet: Boolean(config.CAMERA_PASSWORD),
        lastUpdate: config.LAST_CREDENTIAL_UPDATE || null,
      });
    } catch (error) {
      app.log.error({ error }, "Failed to get camera credentials");
      reply.code(500).send({ error: "Failed to get credentials" });
    }
  });
};
