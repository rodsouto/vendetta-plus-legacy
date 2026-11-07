import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, basename } from "node:path";
import { keccak256, type Abi, type Hex } from "viem";
import { validateSetupManifest } from "../prover/setup.js";

const kinds = ["opening", "invalid-point"] as const;
export interface LocalStackConfig {
  unsafeLocalSetup: true;
  binary: string;
  binarySha256: string;
  openingKeys: string;
  openingManifestSha256: string;
  pointKeys: string;
  pointManifestSha256: string;
  verifierArtifacts: string;
  runtimeFile: string;
  runtimeSha256: string;
  forge?: string;
  anvil?: string;
  solc?: string;
  ports?: { rpc?: number; prover?: number; web?: number };
}
export interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
  deployedBytecode: { object: Hex };
}
export async function readArtifact(file: string): Promise<Artifact> {
  const artifact = JSON.parse((await bounded(file, 8 * 2 ** 20)).toString("utf8")) as Artifact;
  if (!Array.isArray(artifact.abi) || !/^0x(?:[0-9a-f]{2})+$/i.test(artifact.bytecode?.object))
    throw new Error("Invalid or unlinked contract artifact: " + file);
  return artifact;
}
async function bounded(file: string, limit: number) {
  const info = await stat(file);
  if (!info.isFile() || info.size > limit) throw new Error("Invalid or oversized input: " + file);
  const bytes = await readFile(file);
  if (bytes.length > limit) throw new Error("Oversized input: " + file);
  return bytes;
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function loadLocalStackConfig(file: string, output: string, repository: string) {
  const config = JSON.parse((await bounded(file, 65536)).toString("utf8")) as LocalStackConfig;
  if (!config || config.unsafeLocalSetup !== true)
    throw new Error("Explicit unsafeLocalSetup: true is required");
  const allowed = new Set([
    "unsafeLocalSetup",
    "binary",
    "binarySha256",
    "openingKeys",
    "openingManifestSha256",
    "pointKeys",
    "pointManifestSha256",
    "verifierArtifacts",
    "runtimeFile",
    "runtimeSha256",
    "forge",
    "anvil",
    "solc",
    "ports",
  ]);
  if (Object.keys(config).some((key) => !allowed.has(key)))
    throw new Error("Unknown local stack configuration field");
  for (const key of [
    "binary",
    "openingKeys",
    "pointKeys",
    "verifierArtifacts",
    "runtimeFile",
  ] as const) {
    if (typeof config[key] !== "string" || !isAbsolute(config[key]))
      throw new Error("Absolute path required: " + key);
    config[key] = await realpath(config[key]);
  }
  for (const key of [
    "binarySha256",
    "openingManifestSha256",
    "pointManifestSha256",
    "runtimeSha256",
  ] as const)
    if (typeof config[key] !== "string" || !/^[0-9a-f]{64}$/.test(config[key]))
      throw new Error("Invalid SHA-256 pin: " + key);
  for (const key of ["forge", "anvil", "solc"] as const)
    if (config[key] !== undefined && (typeof config[key] !== "string" || !config[key]))
      throw new Error("Invalid executable: " + key);
  if (
    config.ports !== undefined &&
    (!config.ports || typeof config.ports !== "object" || Array.isArray(config.ports))
  )
    throw new Error("Invalid local ports");
  const ports = { rpc: 18545, prover: 18787, web: 15173, ...config.ports };
  if (
    Object.keys(ports).some((key) => !["rpc", "prover", "web"].includes(key)) ||
    Object.values(ports).some((p) => !Number.isSafeInteger(p) || p < 1024 || p > 65535) ||
    new Set(Object.values(ports)).size !== 3
  )
    throw new Error("Three distinct local ports in 1024..65535 are required");
  if (!isAbsolute(output)) throw new Error("Run directory must be absolute");
  const runDirectory = join(await realpath(dirname(resolve(output))), basename(resolve(output)));
  for (const directory of [
    repository,
    config.openingKeys,
    config.pointKeys,
    config.verifierArtifacts,
  ]) {
    const rel = relative(await realpath(directory), runDirectory);
    if (!rel || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep)))
      throw new Error("Run directory must be outside sources and input artifacts");
  }
  const digests: Record<string, string> = {};
  for (const [kind, dir, pin] of [
    ["opening", config.openingKeys, config.openingManifestSha256],
    ["invalid-point", config.pointKeys, config.pointManifestSha256],
  ] as const) {
    const bytes = await bounded(join(dir, "manifest.json"), 65536);
    if (hash(bytes) !== pin) throw new Error("Manifest pin mismatch: " + kind);
    validateSetupManifest(JSON.parse(bytes.toString("utf8")), kind, 31337, true);
    digests[kind] = pin;
  }
  const runtimeBytes = await bounded(config.runtimeFile, 65536);
  if (hash(runtimeBytes) !== config.runtimeSha256) throw new Error("Runtime metadata pin mismatch");
  const runtime = JSON.parse(runtimeBytes.toString("utf8"));
  const verifiers = {} as Record<(typeof kinds)[number], Artifact>;
  for (const kind of kinds) {
    const a = await readArtifact(
      join(config.verifierArtifacts, "out", kind + ".sol", "Verifier.json"),
    );
    if (
      !/^0x(?:[0-9a-f]{2})+$/i.test(a.deployedBytecode?.object) ||
      runtime[kind]?.setup !== digests[kind] ||
      keccak256(a.deployedBytecode.object) !== runtime[kind]?.runtime
    )
      throw new Error("Verifier runtime/setup mismatch: " + kind);
    verifiers[kind] = a;
  }
  if ((await sha256File(config.binary)) !== config.binarySha256)
    throw new Error("Native binary pin mismatch");
  return { ...config, ports, runDirectory, verifiers };
}

export async function sha256File(file: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
