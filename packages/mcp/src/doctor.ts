import { decodeFunctionResult, encodeFunctionData, erc20Abi, formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mezoTestnetAddresses } from "@mezout/sdk";
import { CLIENT_IDS, CLIENT_NAMES, isRegistered, realExec, type Ctx, type Exec } from "./clients";
import { loadSettings, type Config } from "./config";
import { settingsPath, type Env } from "./settings";
import { skillDir } from "./skills";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type DoctorIO = {
  out: (s: string) => void;
  env: Env;
  home: string;
  platform: NodeJS.Platform;
  fetch?: typeof fetch;
  exec?: Exec;
};

/**
 * `npx -y @mezout/mcp doctor`: checks the saved settings and the network, printing no secret (the payer's public
 * address only). Returns 1 when a check fails.
 */
export async function runDoctor(io: DoctorIO): Promise<number> {
  const doFetch = io.fetch ?? fetch;
  let failed = false;
  const line = (mark: "ok" | "warn" | "fail" | "info", s: string) => {
    if (mark === "fail") failed = true;
    io.out(`${{ ok: "  ok  ", warn: " warn ", fail: " FAIL ", info: "      " }[mark]} ${s}\n`);
  };
  io.out("Mezout MCP doctor\n");

  const path = settingsPath(io.env, io.home);
  let config: Config;
  let sources: Record<string, string | undefined>;
  try {
    const loaded = loadSettings(io.env, path);
    config = loaded.config;
    sources = loaded.resolved.sources;
    const f = loaded.resolved.file;
    if (f.found) line(f.insecure ? "warn" : "ok", `settings file ${path}${f.insecure ? " is readable by others: run chmod 600 on it" : ""}`);
    else line("info", `no settings file at ${path} (run \`npx -y @mezout/mcp init\`)`);
  } catch (err) {
    line("fail", (err as Error).message);
    return 1;
  }
  const from = (k: string) => (sources[k] ? ` (from ${sources[k] === "env" ? "environment" : "file"})` : "");

  line(config.apiKey ? "ok" : "warn", config.apiKey ? `API key set${from("MEZOUT_API_KEY")}` : "no API key: merchant tools are off");
  const address = config.payerKey ? privateKeyToAccount(config.payerKey).address : null;
  line(address ? "ok" : "warn", address ? `paying wallet ${address}${from("MEZOUT_PAYER_PRIVATE_KEY")}` : "no payer key: paying tools are off");
  line("info", `caps: ${config.maxPerPayment} MUSD per payment, ${config.maxPerSession} MUSD per session; app ${config.apiUrl}; RPC ${config.rpcUrl}`);

  const rpc = async (method: string, params: unknown[]) => {
    const res = await doFetch(config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as { result?: Hex; error?: { message?: string } };
    if (!json.result) throw new Error(json.error?.message ?? `RPC answered ${res.status}`);
    return json.result;
  };
  try {
    const chainId = Number(await rpc("eth_chainId", []));
    line(chainId === 31611 ? "ok" : "fail", `RPC chain ${chainId}${chainId === 31611 ? " (Mezo testnet)" : ": Mezout pays on Mezo testnet (31611) only"}`);
    if (address) {
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [address] });
      const raw = await rpc("eth_call", [{ to: mezoTestnetAddresses.musd, data }, "latest"]);
      const balance = decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: raw });
      line(balance > 0n ? "ok" : "warn", `payer holds ${formatUnits(balance, 18)} MUSD${balance > 0n ? "" : ": get test MUSD at https://faucet.test.mezo.org"}`);
    }
  } catch (err) {
    line("fail", `RPC ${config.rpcUrl}: ${(err as Error).message}`);
  }

  if (config.apiKey) {
    try {
      const res = await doFetch(`${config.apiUrl}/v1/invoices?limit=1`, {
        headers: { authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) line("ok", "API key accepted by Mezout");
      else if (res.status === 401) line("fail", "Mezout rejected the API key (revoked or mistyped): create one on the dashboard's Developers tab");
      else line("warn", `Mezout answered ${res.status} to GET /v1/invoices`);
    } catch (err) {
      line("fail", `couldn't reach ${config.apiUrl}: ${(err as Error).message}`);
    }
  }

  const ctx: Ctx = { home: io.home, env: io.env, platform: io.platform, exec: io.exec ?? realExec };
  const registered = CLIENT_IDS.filter((c) => isRegistered(c, ctx));
  line(registered.length ? "ok" : "warn", registered.length ? `registered with ${registered.map((c) => CLIENT_NAMES[c]).join(", ")}` : "not found in any client's user config (run init, or see the docs)");
  const skills = CLIENT_IDS.filter((c) => {
    const d = skillDir(c, ctx);
    return d && existsSync(join(d, "SKILL.md"));
  });
  line("info", skills.length ? `agent skill installed for ${skills.map((c) => CLIENT_NAMES[c]).join(", ")}` : "agent skill not installed (optional)");
  return failed ? 1 : 0;
}
