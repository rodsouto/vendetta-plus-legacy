**No actionable bug remains on the supported path in the code you included.** All three earlier findings look fixed, but this is from reading the code only. I didn't run anything, and I can't confirm shutdown ordering because `service.ts` and `keeper.ts` weren't included.

## Earlier findings
- **Hung pending job:** this is fixed. `execute` re-checks `state.exited` and `state.failure` synchronously before assigning `pending`. If the process exits after that check, `close` still rejects the job.
- **Spawn failure:** this is fixed. The code now uses `write`, with a persistent `stdin` error listener, and `error` and `close` both settle the job. The `check()` to `start()` sequence has no await, so `close()` can't slip a new process in between.
- **Lock unlinking:** this is fixed. The `owned` regex can't match `.vendetta-state.lock`.

## Correction to the Go EOF note
A busy orphan will usually die from SIGPIPE, not reach Scanner EOF. Go exits on a broken-pipe write to fd 1 or 2, so the worker dies at its next stdout or stderr write after the parent dies. That write could be `stage: verified`, the ack, or an earlier stage or library log line.

The safety conclusion doesn't change, because the inherited lock is held until the process exits. Two details are worth reflecting in the docs:
- The orphan may or may not have completed `writeProducerJSON` before it dies.
- A complete, verified proof can be left behind, so the service's handling of existing proof files should tolerate that.

Your tests use a Node fixture, so they don't exercise this Go behavior.

## Remaining items
1. **Check before relying on this: shutdown ordering in `service.ts`.** `serialQueue.drain()` only waits for the tail captured when it's called, and `ProducerWorker.closing` doesn't gate `runProducer`. A request accepted during shutdown could therefore queue an inspection after `drain()` and after `release()`, passing a stale `lease.fd` number to `spawn`. That either fails with `EBADF` or, if the number was reused, gives the child an unrelated file as fd 3 while it runs without the lease. This is safe if new enqueues are blocked before `drain()` and `release()` comes last.

2. **Low: the acquisition timeout test is weaker than its name.** In `bounds and reaps a stuck acquisition command`, the stub `flock` never takes a lock. The final acquire would still succeed if the code rejected and closed the fd before reaping the child. The implementation is correct, but this test wouldn't catch that regression. To cover it, have the stub take the lock on fd 3 with the real `flock` binary before it blocks, using an absolute path because the test narrows `PATH`.

3. **Low, optional: stale `.tmp` files are never pruned.** `pruneCache` skips `*.json.tmp`, so a file left by a SIGKILL mid-write stays until the same output path is reused. Growth is limited by the number of crashes and the files are small, so documenting this is enough.