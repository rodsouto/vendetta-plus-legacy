// Cleanup must not erase a job failure or discard an already valid certificate.
export async function runWithCleanup<T>(
  run: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<{ value: T; cleanupFailure?: { error: unknown } }> {
  let value!: T;
  let failure: { error: unknown } | undefined;
  try {
    value = await run();
  } catch (error) {
    failure = { error };
  }
  let cleanupFailure: { error: unknown } | undefined;
  try {
    await cleanup();
  } catch (error) {
    cleanupFailure = { error };
  }
  if (failure && cleanupFailure)
    throw new AggregateError(
      [failure.error, cleanupFailure.error],
      "Producer job and cleanup failed",
      { cause: failure.error },
    );
  if (failure) throw failure.error;
  return { value, cleanupFailure };
}
