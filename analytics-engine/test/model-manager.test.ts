import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelManager } from "../src/model-manager.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("model provisioning contract", () => {
  it("discovers and loads every required manifest model through the runtime cache", async () => {
    const modelsDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-models-"));
    temporaryDirectories.push(modelsDirectory);
    const loader = vi.fn(async () => ({ release: vi.fn(async () => undefined) }));
    const manager = new ModelManager({ modelsDirectory, modelLoader: loader, enableGPU: false, startCleanupTimer: false });
    await manager.initialize();
    const configs = manager.getAllConfigs().filter((config) => config.required);
    for (const config of configs) {
      const artifact = path.join(modelsDirectory, config.path);
      await mkdir(path.dirname(artifact), { recursive: true });
      await writeFile(artifact, Buffer.alloc(4_096, config.id.length));
    }

    expect(manager.getProvisioningSummary()).toMatchObject({ ready: true, required: 6, requiredReady: 6 });
    await Promise.all(configs.map((config) => manager.loadModel(config.id)));
    expect(manager.getLoadedModels()).toHaveLength(6);
    expect(manager.getProvisioningSummary().loaded).toBe(6);
    expect(manager.getStats()).toMatchObject({ configuredModels: 7, requiredModels: 6, requiredReadyModels: 6, loadedModels: 6, modelsReady: true });
    expect(loader).toHaveBeenCalledTimes(6);
    await manager.shutdown();
  });

  it("reports missing artifacts separately from the lazy-load count", async () => {
    const modelsDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-models-"));
    temporaryDirectories.push(modelsDirectory);
    const manager = new ModelManager({ modelsDirectory, enableGPU: false, startCleanupTimer: false });
    await manager.initialize();
    expect(manager.getProvisioningSummary()).toMatchObject({ ready: false, required: 6, requiredReady: 0, loaded: 0 });
    await manager.shutdown();
  });
});
