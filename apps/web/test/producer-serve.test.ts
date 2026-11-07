import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { serveProducer } from "../scripts/prover/serve.js";

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
function fixture() {
  const signals = new EventEmitter();
  const server = createServer();
  const close = vi.fn(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { signals, server, close };
}
it("retains an early stop through construction and never opens the listener", async () => {
  const f = fixture();
  let constructed!: () => void;
  const start = vi.fn(
    () =>
      new Promise<typeof f>((resolve) => {
        constructed = () => resolve(f);
      }),
  );
  const listen = vi.spyOn(f.server, "listen");
  const serving = serveProducer(start, 8787, { signals: f.signals });
  f.signals.emit("SIGTERM");
  f.signals.emit("SIGTERM");
  constructed();
  await serving;
  expect(listen).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.signals.listenerCount("SIGTERM")).toBe(0);
});
it("retains repeated stop handlers while shutdown is pending", async () => {
  const f = fixture();
  let drained!: () => void;
  const close = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        drained = resolve;
      }),
  );
  const ready = vi.fn();
  const serving = serveProducer(async () => ({ ...f, close }), await availablePort(), {
    signals: f.signals,
    listening: ready,
  });
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    f.signals.emit("SIGTERM");
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) expect(f.signals.emit(signal)).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await new Promise<void>((resolve) => f.server.close(() => resolve()));
    drained();
    await serving;
    expect(f.signals.eventNames()).toEqual([]);
  } finally {
    f.server.closeAllConnections();
    f.server.close();
    drained?.();
  }
});
it("closes the producer after asynchronous bind failure and preserves both errors", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const f = fixture();
  const cleanup = new Error("synthetic lease cleanup failure");
  const close = vi.fn(async () => {
    throw cleanup;
  });
  try {
    const error = await serveProducer(
      async () => ({ ...f, close }),
      (blocker.address() as { port: number }).port,
      { signals: f.signals },
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ code: "EADDRINUSE" }),
      cleanup,
    ]);
    expect((error as AggregateError).cause).toBe((error as AggregateError).errors[0]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(f.signals.eventNames()).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});
it("closes after a synchronous listen error without losing the original", async () => {
  const f = fixture();
  const cause = new Error("synchronous bind failure");
  vi.spyOn(f.server, "listen").mockImplementation(() => {
    throw cause;
  });
  await expect(serveProducer(async () => f, 8787, { signals: f.signals })).rejects.toBe(cause);
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.server.listenerCount("error")).toBe(0);
});
it("reports unexpected listener closure and closes owned resources", async () => {
  const f = fixture();
  let ready!: () => void;
  const listening = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const serving = serveProducer(async () => f, await availablePort(), {
    signals: f.signals,
    listening: ready,
  });
  const result = serving.catch((error: unknown) => error);
  await listening;
  f.server.close();
  expect(await result).toMatchObject({ message: "Producer listener closed unexpectedly" });
  expect(f.close).toHaveBeenCalledTimes(1);
});
it("preserves constructor failure and removes signal handlers", async () => {
  const signals = new EventEmitter();
  const cause = new Error("constructor RPC failure");
  await expect(
    serveProducer(
      async () => {
        throw cause;
      },
      8787,
      { signals },
    ),
  ).rejects.toBe(cause);
  expect(signals.eventNames()).toEqual([]);
});
it.each([NaN, 0, -1, 65536, 1.5])(
  "refuses invalid port %s before constructing the producer",
  async (port) => {
    const start = vi.fn();
    await expect(serveProducer(start, port)).rejects.toThrow("Producer port");
    expect(start).not.toHaveBeenCalled();
  },
);

it("closes a socket whose listen was initiated just as a stop arrived", async () => {
  const f = fixture();
  const original = f.server.listen.bind(f.server);
  vi.spyOn(f.server, "listen").mockImplementation(((...args: unknown[]) => {
    f.signals.emit("SIGTERM");
    return Reflect.apply(original, f.server, args);
  }) as typeof f.server.listen);
  const ready = vi.fn();
  await serveProducer(async () => f, await availablePort(), {
    signals: f.signals,
    listening: ready,
  });
  expect(f.server.listening).toBe(false);
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
});
