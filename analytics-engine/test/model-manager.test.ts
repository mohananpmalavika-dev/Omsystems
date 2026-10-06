import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelManager, type ModelManagerOptions } from "../src/model-manager.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function optionalSessionManager(options: ModelManagerOptions = {}) {
  const modelsDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-session-lifetime-"));
  temporaryDirectories.push(modelsDirectory);
  await writeFile(path.join(modelsDirectory, "session.onnx"), Buffer.alloc(4096));
  const sessions: any[] = [];
  const loader = vi.fn(async () => {
    let disposed = false;
    const session = {
      inputNames: ["input"], outputNames: ["output"],
      run: vi.fn(async (value: unknown) => {
        if (disposed) throw new Error("Session already disposed.");
        return { generation: sessions.indexOf(session), value };
      }),
      release: vi.fn(async () => { disposed = true; }),
    };
    sessions.push(session);
    return session;
  });
  const manager = new ModelManager({ modelsDirectory, modelLoader: loader, enableGPU: false, startCleanupTimer: false, ...options });
  await manager.initialize();
  manager.addModelConfig({ id: "optional-session", name: "Optional inference session", path: "session.onnx", type: "onnx", priority: "low" });
  return { manager, loader, sessions };
}

describe("retained inference session lifetime", () => {
  it("reloads an evicted session through the original detector handle", async () => {
    const { manager, sessions } = await optionalSessionManager();
    const handle = await manager.getModel("optional-session");
    expect(handle.inputNames).toEqual(["input"]);
    await manager.unloadModel("optional-session");
    expect(sessions[0].release).toHaveBeenCalledOnce();
    expect(await handle.run("live frame")).toEqual({ generation: 1, value: "live frame" });
    expect(sessions[0].run).not.toHaveBeenCalled();
    await manager.shutdown();
  });

  it("counts inference activity so cleanup keeps a continuously used optional session", async () => {
    vi.useFakeTimers();
    const { manager, sessions } = await optionalSessionManager({ startCleanupTimer: true, autoUnloadAfter: 1 });
    const handle = await manager.getModel("optional-session");
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
      await handle.run(i);
    }
    expect(sessions).toHaveLength(1);
    expect(sessions[0].release).not.toHaveBeenCalled();
    await manager.shutdown();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not dispose an inference still running when the idle timer fires", async () => {
    vi.useFakeTimers();
    const { manager, sessions } = await optionalSessionManager({ startCleanupTimer: true, autoUnloadAfter: 1 });
    const handle = await manager.getModel("optional-session");
    let finish!: () => void;
    sessions[0].run.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const running = handle.run("slow frame");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sessions[0].release).not.toHaveBeenCalled();
    finish();
    await running;
    await manager.shutdown();
    expect(sessions[0].release).toHaveBeenCalledOnce();
  });

  it("shares one reload when multiple detectors use an evicted session concurrently", async () => {
    const { manager, loader } = await optionalSessionManager();
    const handle = await manager.getModel("optional-session");
    await manager.unloadModel("optional-session");
    const results = await Promise.all([handle.run("frame A"), handle.run("frame B")]);
    expect(results.map(value => value.generation)).toEqual([1, 1]);
    expect(loader).toHaveBeenCalledTimes(2);
    await manager.shutdown();
  });

  it("waits for an active inference before forced disposal", async () => {
    const { manager, sessions } = await optionalSessionManager();
    const handle = await manager.getModel("optional-session");
    let started!: () => void, finish!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    sessions[0].run.mockImplementation(() => { started(); return new Promise<void>(resolve => { finish = resolve; }); });
    const running = handle.run("last frame");
    await ready;
    const unloading = manager.unloadModel("optional-session", true);
    expect(sessions[0].release).not.toHaveBeenCalled();
    finish();
    await Promise.all([running, unloading]);
    expect(sessions[0].release).toHaveBeenCalledOnce();
    await manager.shutdown();
  });
});

describe("model provisioning contract", () => {
  it("discovers and loads every required manifest model through the runtime cache", async () => {
    const modelsDirectory = await mkdtemp(path.join(os.tmpdir(), "sentinel-models-"));
    temporaryDirectories.push(modelsDirectory);
    const loader = vi.fn(async () => ({ release: vi.fn(async () => undefined) }));
    const manager = new ModelManager({ modelsDirectory, modelLoader: loader, enableGPU: false, startCleanupTimer: false });
    await manager.initialize();
    const configs = manager.getAllConfigs().filter((config) => config.required);
    expect(configs).toHaveLength(6);
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
    expect(manager.getStats()).toMatchObject({ configuredModels: manager.getAllConfigs().length, requiredModels: configs.length, requiredReadyModels: configs.length, loadedModels: configs.length, modelsReady: true });
    expect(loader).toHaveBeenCalledTimes(configs.length);
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
