import type { PlaybookInstance } from "../domain/playbook.types.js";

export class PlaybookInstanceRepository {
  private readonly instances = new Map<string, PlaybookInstance>();
  private readonly incidentIndex = new Map<string, string>(); // incidentId -> instanceId

  async save(instance: PlaybookInstance): Promise<void> {
    const existing = this.instances.get(instance.instanceId);
    if (existing && existing.version !== instance.version) {
      throw new Error(
        `Optimistic lock conflict: Playbook instance ${instance.instanceId} was modified by another operator (expected version ${instance.version}, current version ${existing.version})`,
      );
    }

    instance.version = (instance.version || 0) + 1;
    const cloned: PlaybookInstance = JSON.parse(JSON.stringify(instance));

    this.instances.set(instance.instanceId, cloned);
    this.incidentIndex.set(instance.incidentId, instance.instanceId);
  }

  async getById(instanceId: string): Promise<PlaybookInstance | null> {
    const instance = this.instances.get(instanceId);
    return instance ? JSON.parse(JSON.stringify(instance)) : null;
  }

  async getByIncidentId(incidentId: string): Promise<PlaybookInstance | null> {
    const instanceId = this.incidentIndex.get(incidentId);
    if (!instanceId) return null;
    return this.getById(instanceId);
  }

  async delete(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      this.incidentIndex.delete(instance.incidentId);
      this.instances.delete(instanceId);
    }
  }
}
