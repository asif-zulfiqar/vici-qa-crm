// Runs an Express app on a free port for one test and calls it with Node's built-in fetch.
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { afterEach } from "vitest";

const open: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()));
});

export type Call = (path: string, init?: RequestInit & { token?: string }) => Promise<Response>;

/** Starts the app (closed again after the test) and returns a fetch bound to it. */
export async function serve(app: Express): Promise<Call> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  open.push({
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });

  return (path, init = {}) => {
    const { token, headers, ...rest } = init;
    return fetch(`http://127.0.0.1:${port}${path}`, {
      ...rest,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    });
  };
}
