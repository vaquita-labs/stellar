import { spawnSync } from "node:child_process";

export type DopplerWriteResult =
  | { ok: true; project: string; config: string }
  | { ok: false; reason: string };

/**
 * Writes VAULT_ID back to the currently-active Doppler config.
 *
 * Assumes the process is running under `doppler run --config <env>`, which
 * exports DOPPLER_PROJECT and DOPPLER_CONFIG for us. If those aren't set we
 * refuse to write — we don't want to guess which config to mutate.
 */
export function writeVaultIdToDoppler(vaultAddress: string): DopplerWriteResult {
  const project = process.env.DOPPLER_PROJECT;
  const config = process.env.DOPPLER_CONFIG;

  if (!project || !config) {
    return {
      ok: false,
      reason:
        "DOPPLER_PROJECT and/or DOPPLER_CONFIG are not set. Run this script via `doppler run --config <env>` so the CLI knows which config to update.",
    };
  }

  const which = spawnSync("doppler", ["--version"], { encoding: "utf8" });
  if (which.status !== 0) {
    return {
      ok: false,
      reason: `doppler CLI is not available on PATH (exit ${which.status}): ${which.stderr || which.error?.message || "unknown error"}`,
    };
  }

  const result = spawnSync(
    "doppler",
    [
      "secrets",
      "set",
      `VAULT_ID=${vaultAddress}`,
      "--project",
      project,
      "--config",
      config,
      "--silent",
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    return {
      ok: false,
      reason: `doppler secrets set failed (exit ${result.status}): ${result.stderr || result.stdout || "<no output>"}`,
    };
  }

  return { ok: true, project, config };
}
