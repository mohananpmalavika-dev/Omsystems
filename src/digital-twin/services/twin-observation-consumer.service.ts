import type {
  TwinHealthOrigin,
  TwinHealthState,
  TwinNode,
  TwinObservation,
} from "../domain/twin-health.types.js";
import {
  DigitalTwinTopologyService,
  digitalTwinTopologyService,
} from "./digital-twin-topology.service.js";

export class TwinObservationConsumerService {
  private readonly observations = new Map<string, TwinObservation[]>(); // key: nodeId

  constructor(private readonly topology: DigitalTwinTopologyService = digitalTwinTopologyService) {}

  consumeObservation(obs: TwinObservation): { node: TwinNode | null; stateChanged: boolean } {
    const node = this.topology.getNode(obs.nodeId);
    if (!node) return { node: null, stateChanged: false };

    // Record observation history
    const history = this.observations.get(obs.nodeId) ?? [];
    history.push(obs);
    if (history.length > 50) history.shift();
    this.observations.set(obs.nodeId, history);

    const oldHealth = node.health;
    const now = obs.observedAt;
    node.lastObservedAt = now;

    // Evaluate Deterministic Health Rules based on Metric
    let newHealth: TwinHealthState = "HEALTHY";
    let healthReason: string | undefined = undefined;

    switch (obs.metric) {
      case "NETWORK_REACHABLE": {
        if (obs.value === false) {
          newHealth = "OFFLINE";
          healthReason = `${node.name} unreachable (ICMP/SNMP/TCP probe failed)`;
        }
        break;
      }

      case "STREAM_AVAILABLE": {
        if (obs.value === false) {
          newHealth = "CRITICAL";
          healthReason = `${node.name} video stream loss`;
        }
        break;
      }

      case "RECORDING_ACTIVE": {
        if (obs.value === false) {
          newHealth = "CRITICAL";
          healthReason = `${node.name} recording inactive on storage`;
        }
        break;
      }

      case "DISK_HEALTH": {
        if (obs.value === "CRITICAL" || obs.value === "FAILED") {
          newHealth = "CRITICAL";
          healthReason = `${node.name} SMART critical sector failure`;
        } else if (obs.value === "WARNING") {
          newHealth = "WARNING";
          healthReason = `${node.name} SMART pre-failure warning`;
        }
        break;
      }

      case "RETENTION_DAYS": {
        const days = typeof obs.value === "number" ? obs.value : 90;
        if (days < 60) {
          newHealth = "CRITICAL";
          healthReason = `Retention ${days.toFixed(1)} days is critically below 90-day policy`;
        } else if (days < 90) {
          newHealth = "WARNING";
          healthReason = `Retention ${days.toFixed(1)} days is below 90-day policy`;
        }
        break;
      }

      case "CLOCK_OFFSET": {
        const offset = typeof obs.value === "number" ? Math.abs(obs.value) : 0;
        if (offset > 30) {
          newHealth = "CRITICAL";
          healthReason = `Clock drift ${offset}s exceeds critical 30s threshold`;
        } else if (offset > 5) {
          newHealth = "WARNING";
          healthReason = `Clock drift ${offset}s exceeds warning 5s threshold`;
        }
        break;
      }
    }

    node.health = newHealth;
    node.healthOrigin = "OBSERVED";
    node.healthReason = healthReason;

    if (newHealth !== "HEALTHY" && !node.firstFailureAt) {
      node.firstFailureAt = now;
    } else if (newHealth === "HEALTHY") {
      node.firstFailureAt = undefined;
    }

    return {
      node,
      stateChanged: oldHealth !== newHealth,
    };
  }

  getObservationsForNode(nodeId: string): TwinObservation[] {
    return this.observations.get(nodeId) ?? [];
  }
}

export const twinObservationConsumerService = new TwinObservationConsumerService();
