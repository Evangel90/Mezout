import { getAddress, type Address } from "viem";
import { networkLine } from "./apiKey";
import type { MezoNetwork } from "./networks";

/** What a borrower asks to be alerted about. Thresholds are whole collateral-ratio percentages, e.g. [180, 165]. */
export type LoanAlertSettings = { url: string; thresholds: number[]; redemption: boolean };

/** Lowest and highest ratio alert a borrower may set. 110% is Mezo's liquidation line, so alerts sit above it. */
export const LOAN_ALERT_MIN_THRESHOLD = 111;
export const LOAN_ALERT_MAX_THRESHOLD = 400;
export const LOAN_ALERT_MAX_THRESHOLDS = 3;

/** Thresholds as they are signed and stored: unique whole percentages, highest first. */
export const normalizeThresholds = (thresholds: number[]) => [...new Set(thresholds)].sort((a, b) => b - a);

/**
 * The exact text a borrower signs to turn on loan alerts. It names the alert URL and settings, so a signature cannot
 * be reused to send someone's alerts elsewhere. The server rebuilds it from the request. Signing costs no gas.
 */
export function loanAlertsSubscribeMessage(address: Address, settings: LoanAlertSettings, issuedAt: string, network: MezoNetwork = "testnet"): string {
  const thresholds = normalizeThresholds(settings.thresholds);
  return [
    "Mezout: turn on loan alerts",
    `Wallet: ${getAddress(address)}`,
    `Send alerts to: ${settings.url}`,
    `Ratio alerts below: ${thresholds.length ? thresholds.map((t) => `${t}%`).join(", ") : "none"}`,
    `Redemption alerts: ${settings.redemption ? "on" : "off"}`,
    `Issued at: ${issuedAt}`,
    networkLine(network),
  ].join("\n");
}

/** The exact text a borrower signs to turn loan alerts off. */
export function loanAlertsUnsubscribeMessage(address: Address, issuedAt: string, network: MezoNetwork = "testnet"): string {
  return ["Mezout: turn off loan alerts", `Wallet: ${getAddress(address)}`, `Issued at: ${issuedAt}`, networkLine(network)].join("\n");
}
