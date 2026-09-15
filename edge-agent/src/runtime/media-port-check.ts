import { createServer } from "node:net";

/** Detect agents in other installation folders before enrollment or heartbeats. */
export async function assertMediaPortAvailable(host: string, port: number): Promise<void> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(
          `Live media port ${host}:${port} is already in use. Another edge agent or media service may be running. `
          + "Use the running installation, or stop it before starting this copy. "
          + "For a separate media service, configure EDGE_LIVE_GATEWAY_PORT and its media URLs explicitly.",
          { cause: error },
        ));
      } else reject(error);
    });
    probe.listen({ host, port, exclusive: true }, () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}
