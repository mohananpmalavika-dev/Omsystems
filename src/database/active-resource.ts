/** Default visibility for operational resource nodes, including their parents. */
export function activeResourceNode(alias: string): string {
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

/** A camera is visible only while both its node and branch are active. */
export function activeCamera(alias: string): string {
  return `EXISTS (
    SELECT 1 FROM resource_nodes camera_node
    JOIN resource_nodes camera_branch ON camera_branch.id = ${alias}.branch_node_id
    WHERE camera_node.id = ${alias}.resource_node_id
      AND ${activeResourceNode('camera_node')}
      AND ${activeResourceNode('camera_branch')}
  )`;
}
