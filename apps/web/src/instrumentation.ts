// Runs once when the Next.js server starts. A deployment on a network with any unverified address, or with a runtime
// MEZO_NETWORK different from its build, stops here with an error naming what is missing, before serving a request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertNetworkReady } = await import("./lib/server/network");
  const config = assertNetworkReady();
  console.log(`Mezout running on ${config.label} (chain ${config.chainId})`);
}
