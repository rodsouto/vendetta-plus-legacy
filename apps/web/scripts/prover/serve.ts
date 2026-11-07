import type { Server } from "node:http";
import type { EventEmitter } from "node:events";
import { serviceStop } from "../service-stop.js";

interface ProducerDaemon {
  server: Server;
  close(): Promise<void>;
}

// The CLI owns startup/listen/shutdown; the producer owns HTTP/jobs/worker/lease cleanup.
export async function serveProducer(
  start: () => Promise<ProducerDaemon>,
  port: number,
  options: {
    signals?: Pick<EventEmitter, "on" | "removeListener">;
    listening?: () => void;
  } = {},
) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("Producer port must be an integer in 1..65535");
  const stop = serviceStop(options.signals);
  let producer: ProducerDaemon | undefined;
  let failure: { value: unknown } | undefined;
  const fail = (error: unknown) => {
    failure ??= { value: error };
    stop.request();
  };
  const closed = () => {
    if (!stop.requested) fail(new Error("Producer listener closed unexpectedly"));
  };
  try {
    producer = await start();
    producer.server.on("error", fail);
    producer.server.on("close", closed);
    if (!stop.requested) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          cleanup();
          resolve();
        };
        const error = (cause: Error) => {
          cleanup();
          reject(cause);
        };
        const cleanup = () => {
          producer!.server.removeListener("listening", ready);
          producer!.server.removeListener("error", error);
        };
        producer!.server.once("listening", ready);
        producer!.server.once("error", error);
        try {
          producer!.server.listen(port, "127.0.0.1");
        } catch (cause) {
          cleanup();
          reject(cause);
        }
      });
      if (!stop.requested) options.listening?.();
      await stop.stopped;
    }
  } catch (error) {
    fail(error);
  } finally {
    stop.request();
    try {
      await producer?.close();
    } catch (closeError) {
      if (failure)
        throw new AggregateError(
          [failure.value, closeError],
          "Producer operation and cleanup failed",
          { cause: failure.value },
        );
      throw closeError;
    } finally {
      producer?.server.removeListener("error", fail);
      producer?.server.removeListener("close", closed);
      stop.dispose();
    }
  }
  if (failure) throw failure.value;
}
