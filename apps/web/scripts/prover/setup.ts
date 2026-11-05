// Setup policy is checked before loading keys or accepting certificate requests.
export function validateSetupManifest(
  manifest: unknown,
  kind: "opening" | "invalid-point",
  chainId: number,
  allowUnsafeLocalSetup = false,
): void {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !("kind" in manifest) ||
    manifest.kind !== kind ||
    !("profile" in manifest) ||
    manifest.profile !== "VENDETTA_OPENING_V2" ||
    !("unsafeLocalSetup" in manifest) ||
    typeof manifest.unsafeLocalSetup !== "boolean"
  )
    throw new Error("Wrong setup manifest");
  // No ceremony importer or independently approved setup registry exists yet.
  // A self-declared safety flag cannot establish the provenance of Groth16 keys.
  if (!manifest.unsafeLocalSetup)
    throw new Error("Secure setup provenance verification is not implemented");
  if (!(allowUnsafeLocalSetup && [31337, 1337].includes(chainId)))
    throw new Error("Unsafe local setup cannot serve this deployment");
}
