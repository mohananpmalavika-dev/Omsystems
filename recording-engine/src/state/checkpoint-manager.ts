import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const engineStateSchema = z.object({
  cleanShutdown: z.boolean().default(false),
  timestamp: z.string().datetime(),
  journalSequence: z.number().int().nonnegative().default(0),
  lastSegmentId: z.string().optional(),
});

export type EngineState = z.infer<typeof engineStateSchema>;

export class CheckpointManager {
  private readonly stateFilePath: string;
  private currentState: EngineState;

  constructor(stateDirectory: string) {
    this.stateFilePath = join(stateDirectory, "engine-state.json");
    this.currentState = {
      cleanShutdown: false,
      timestamp: new Date().toISOString(),
      journalSequence: 0,
    };
  }

  /**
   * Initializes checkpoint manager. Returns true if previous shutdown was clean, false if crash recovery is needed.
   */
  async init(): Promise<{ wasCleanShutdown: boolean; previousState?: EngineState }> {
    let previousState: EngineState | undefined;
    let wasCleanShutdown = false;

    try {
      const content = await readFile(this.stateFilePath, "utf8");
      previousState = engineStateSchema.parse(JSON.parse(content));
      wasCleanShutdown = previousState.cleanShutdown === true;
    } catch {
      // First boot or missing state file
      wasCleanShutdown = false;
    }

    // Immediately mark cleanShutdown = false during active runtime
    this.currentState = {
      cleanShutdown: false,
      timestamp: new Date().toISOString(),
      journalSequence: previousState?.journalSequence ?? 0,
      lastSegmentId: previousState?.lastSegmentId,
    };

    await this.saveState(this.currentState);

    return { wasCleanShutdown, previousState };
  }

  async updateCheckpoint(journalSequence: number, lastSegmentId?: string): Promise<void> {
    this.currentState = {
      cleanShutdown: false,
      timestamp: new Date().toISOString(),
      journalSequence,
      lastSegmentId: lastSegmentId ?? this.currentState.lastSegmentId,
    };
    await this.saveState(this.currentState);
  }

  async recordGracefulShutdown(): Promise<void> {
    this.currentState.cleanShutdown = true;
    this.currentState.timestamp = new Date().toISOString();
    await this.saveState(this.currentState);
  }

  getState(): EngineState {
    return { ...this.currentState };
  }

  private async saveState(state: EngineState): Promise<void> {
    const tmp = `${this.stateFilePath}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await rename(tmp, this.stateFilePath);
  }
}
