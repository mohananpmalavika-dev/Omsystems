import { execSync } from "node:child_process";

function activeResourceNode(alias) {
  return `${alias}.is_active = true
    AND COALESCE(${alias}.lifecycle_status::text, 'ACTIVE') = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1 FROM resource_nodes inactive_ancestor
      WHERE inactive_ancestor.tenant_id = ${alias}.tenant_id
        AND inactive_ancestor.path @> ${alias}.path
        AND (inactive_ancestor.is_active = false
          OR COALESCE(inactive_ancestor.lifecycle_status::text, 'ACTIVE') <> 'ACTIVE')
    )`;
}

const activeCameraFrom = `FROM cameras
  JOIN resource_nodes camera_node ON camera_node.id = cameras.resource_node_id
    AND ${activeResourceNode("camera_node")}
  JOIN resource_nodes branch_node ON branch_node.id = cameras.branch_node_id
    AND ${activeResourceNode("branch_node")}`;

const selectCamera = `SELECT cameras.id::text, cameras.device_identity_id::text,
  cameras.resource_node_id::text, camera_node.tenant_id::text AS tenant_id,
  cameras.branch_node_id::text, cameras.edge_agent_id::text, camera_node.name, cameras.vendor,
  cameras.model, cameras.channel, cameras.protocol, cameras.status,
  cameras.profiles, cameras.capabilities, cameras.connection_secret_ref,
  cameras.connection_transport, host(cameras.ip_address) AS ip_address,
  cameras.source_type, cameras.recorder_id, cameras.recorder_channel,
  cameras.recorder_serial_number, cameras.serial_number, cameras.mac_address::text,
  cameras.firmware_version, cameras.onvif_uuid, cameras.certificate_ref,
  cameras.certificate_fingerprint, cameras.first_seen_at,
  cameras.identity_last_seen_at
  ${activeCameraFrom}`;

const query = `
${selectCamera}
WHERE EXISTS (
  SELECT 1 FROM edge_agents agent
  WHERE agent.id = 'aaeda07f-01ce-4361-afd3-a54e4ca114f3'::uuid AND agent.credential_revoked_at IS NULL
    AND agent.tenant_id = camera_node.tenant_id
    AND (cameras.edge_agent_id = agent.id OR
         (cameras.edge_agent_id IS NULL AND cameras.branch_node_id = agent.branch_node_id))
    AND (cameras.branch_node_id = agent.branch_node_id OR EXISTS (
      SELECT 1 FROM edge_agent_branch_assignments assignment
      WHERE assignment.edge_agent_id = agent.id
        AND assignment.branch_node_id = cameras.branch_node_id
        AND assignment.tenant_id = agent.tenant_id
    ))
)
ORDER BY camera_node.name;
`;

const cmd = `sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${query.replace(/\n/g, ' ')}"`;
const b64 = Buffer.from(cmd, "utf8").toString("base64");
const remoteCmd = `echo ${b64} | base64 -d | bash`;

const result = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="${remoteCmd}"`, {
  encoding: "utf8"
});
console.log("Success! Found rows:\n" + result);
