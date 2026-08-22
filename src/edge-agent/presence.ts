/**
 * An edge agent is considered connected only while its heartbeat is fresh.
 * The edge process polls for work every few seconds and sends a heartbeat
 * every 30 seconds, so three missed heartbeats gives enough room for a brief
 * network delay without routing work to a stopped scanner.
 */
export const EDGE_AGENT_HEARTBEAT_TTL_MS = 90_000;

export function hasFreshEdgeHeartbeat(
  lastSeenAt: string | Date | null | undefined,
  now = Date.now(),
) {
  if (!lastSeenAt) return false;
  const timestamp = lastSeenAt instanceof Date ? lastSeenAt.getTime() : Date.parse(lastSeenAt);
  return Number.isFinite(timestamp) && now - timestamp <= EDGE_AGENT_HEARTBEAT_TTL_MS;
}

export function isFreshEdgeAgent(agent: {
  status: string;
  lastSeenAt?: string | Date | null;
}) {
  return agent.status === "online" && hasFreshEdgeHeartbeat(agent.lastSeenAt);
}
