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
    expect(configs).toHaveLength(5);
    for (const config of configs) {
      // This unit test exercises discovery/cache behavior; checksum validation
      // is covered by the production manifest/provisioning contract.
      delete config.sha256;
      const artifact = path.join(modelsDirectory, config.path);
      await mkdir(path.dirname(artifact), { recursive: true });
      await writeFile(artifact, Buffer.alloc(4_096, config.id.length));
    }

    expect(manager.getProvisioningSummary()).toMatchObject({ ready: true, required: configs.length, requiredReady: configs.length });
    await Promise.all(configs.map((config) => manager.loadModel(config.id)));
    expect(manager.getLoadedModels()).toHaveLength(configs.length);
    expect(manager.getProvisioningSummary().loaded).toBe(configs.length);
    expect(manager.getStats()).toMatchObject({ configuredModels: 11, requiredModels: configs.length, requiredReadyModels: configs.length, loadedModels: configs.length, modelsReady: true });
    expect(loader).toHaveBeenCalledTimes(configs.length);
    await manager.shutdown();
  });

  it("reports missing artifacts separately from the lazy-load count", async () => {
    const modelsDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-models-"));
    temporaryDirectories.push(modelsDirectory);
    const manager = new ModelManager({ modelsDirectory, enableGPU: false, startCleanupTimer: false });
    await manager.initialize();
    expect(manager.getProvisioningSummary()).toMatchObject({ ready: false, required: 5, requiredReady: 0, loaded: 0 });
    await manager.shutdown();
  });
});
