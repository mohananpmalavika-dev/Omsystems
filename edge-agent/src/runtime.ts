import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readEmbeddedEnvironmentFile } from "./embedded-config.js";

export interface EdgeRuntimeContext {
  packaged: boolean;
  homeDirectory: string;
  configPath: string | null;
  embeddedEnvironmentFile?: string;
}

/**
 * Loads a branch-local environment file before the Zod configuration is
 * parsed. A Windows startup task normally has C:\Windows\System32 as its
 * working directory, so packaged builds must resolve paths from the EXE.
 */
export function prepareEdgeRuntime(
  argv: string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): EdgeRuntimeContext {
  const packaged = Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
  const executableDirectory = dirname(process.execPath);
  const configuredHome = environment.EDGE_AGENT_HOME;
  const homeDirectory = resolve(configuredHome || (packaged ? executableDirectory : process.cwd()));
  const explicitConfig = argumentValue(argv, "--config") || environment.EDGE_AGENT_CONFIG_PATH;
  const candidates = explicitConfig
    ? [isAbsolute(explicitConfig) ? explicitConfig : resolve(process.cwd(), explicitConfig)]
    : [
        join(homeDirectory, "config", "edge-agent.env"),
        join(homeDirectory, "edge-agent.env"),
        join(homeDirectory, ".env"),
      ];
  const configPath = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (explicitConfig && !configPath) throw new Error(`Edge-agent configuration file not found: ${candidates[0]}`);

  const embeddedEnvironmentFile = !configPath && packaged
    ? readEmbeddedEnvironmentFile(process.execPath)
    : undefined;
  if (configPath || embeddedEnvironmentFile) {
    const values = parseEnvironmentFile(configPath ? readFileSync(configPath, "utf8") : embeddedEnvironmentFile!);
    for (const [key, value] of Object.entries(values)) {
      if (environment[key] === undefined) environment[key] = value;
    }
  }

  environment.EDGE_AGENT_HOME ??= homeDirectory;
  if (packaged) process.chdir(homeDirectory);
  return {
    packaged,
    homeDirectory,
    configPath,
    ...(embeddedEnvironmentFile ? { embeddedEnvironmentFile } : {}),
  };
}

export function parseEnvironmentFile(content: string) {
  const values: Record<string, string> = {};
  for (const originalLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    values[key] = unquote(normalized.slice(separator + 1).trim());
  }
  return values;
}

export function hasArgument(argv: string[], name: string) {
  return argv.includes(name);
}

function argumentValue(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function unquote(value: string) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}
