// Native proof/inspection processes need runtime settings, never service credentials.
export function producerNativeEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "TZ",
    "GOGC",
    "PROVER_THREADS",
    "PROVER_MEMORY",
  ])
    if (source[key] !== undefined) env[key] = source[key];
  for (const key of ["PROVER_THREADS", "PROVER_MEMORY"])
    if (env[key]?.trim()) env[key] = env[key]!.trim();
    else delete env[key];
  env.GOMAXPROCS = env.PROVER_THREADS ?? "8";
  env.GOMEMLIMIT = env.PROVER_MEMORY ?? "6GiB";
  return env;
}
