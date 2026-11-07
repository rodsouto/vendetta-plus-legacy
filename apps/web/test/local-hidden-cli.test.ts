import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it("rejects removed resume arguments before reading config or creating a session", () => {
  const loader = fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url));
  const cli = fileURLToPath(new URL("../scripts/local-hidden.ts", import.meta.url));
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      loader,
      cli,
      "/nonexistent/config.json",
      "/nonexistent/session",
      "--resume",
      "/nonexistent/checkpoint.json",
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stderr).toContain("Usage: local-hidden.ts");
  expect(child.stderr).not.toContain("ENOENT");
});

it("returns failure and reaps the build when SIGINT interrupts startup", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawn } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { createServer } = await import("node:net");
  const { keccak256 } = await import("viem");
  const base = await mkdtemp(join(tmpdir(), "vendetta-cli-cancel-"));
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const runtime: Record<string, { setup: string; runtime: string }> = {};
    for (const kind of ["opening", "invalid-point"]) {
      await mkdir(join(base, kind));
      const manifest = JSON.stringify({
        kind,
        profile: "VENDETTA_OPENING_V2",
        unsafeLocalSetup: true,
      });
      await writeFile(join(base, kind, "manifest.json"), manifest);
      runtime[kind] = { setup: sha(manifest), runtime: keccak256("0x6000") };
      const out = join(base, "evm/out", kind + ".sol");
      await mkdir(out, { recursive: true });
      await writeFile(
        join(out, "Verifier.json"),
        JSON.stringify({
          abi: [],
          bytecode: { object: "0x6000" },
          deployedBytecode: { object: "0x6000" },
        }),
      );
    }
    await writeFile(join(base, "runtime.json"), JSON.stringify(runtime));
    await writeFile(join(base, "native"), "never execute");
    const forge = join(base, "forge-fixture");
    await writeFile(
      forge,
      `#!${process.execPath}\nconsole.log('fixture build waiting '+process.pid);setInterval(()=>{},1000);\n`,
      { mode: 0o700 },
    );
    const sockets = await Promise.all(
      [0, 1, 2].map(async () => {
        const server = createServer();
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        return server;
      }),
    );
    const ports = sockets.map((s) => (s.address() as { port: number }).port);
    await Promise.all(sockets.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    const config = join(base, "config.json");
    await writeFile(
      config,
      JSON.stringify({
        unsafeLocalSetup: true,
        binary: join(base, "native"),
        binarySha256: sha("never execute"),
        openingKeys: join(base, "opening"),
        openingManifestSha256: runtime.opening!.setup,
        pointKeys: join(base, "invalid-point"),
        pointManifestSha256: runtime["invalid-point"]!.setup,
        verifierArtifacts: join(base, "evm"),
        runtimeFile: join(base, "runtime.json"),
        runtimeSha256: sha(JSON.stringify(runtime)),
        forge,
        ports: { rpc: ports[0], prover: ports[1], web: ports[2] },
      }),
    );
    const run = join(base, "run");
    child = spawn(
      process.execPath,
      [
        "--import",
        fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
        fileURLToPath(new URL("../scripts/local-hidden.ts", import.meta.url)),
        config,
        run,
      ],
      { stdio: "ignore" },
    );
    const closed = new Promise<number | null>((resolve, reject) => {
      child!.once("error", reject);
      child!.once("close", resolve);
    });
    const deadline = Date.now() + 15000;
    let build = "";
    while (!build.includes("fixture build waiting")) {
      try {
        build = await readFile(join(run, "build.log"), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (Date.now() > deadline) throw new Error("CLI fixture did not reach the build");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.kill("SIGINT");
    expect(await closed).toBe(1);
    const buildPid = Number(build.trim().split(" ").at(-1));
    await expect(access(`/proc/${buildPid}`)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(run, "closed.json"), "utf8"))).toMatchObject({
      ephemeral: true,
      cleanupErrors: 0,
    });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child!.once("close", () => resolve()));
    }
    await rm(base, { recursive: true, force: true });
  }
}, 20000);
