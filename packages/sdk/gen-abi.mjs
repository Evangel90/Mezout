import { readFileSync, writeFileSync } from "node:fs";

const out = JSON.parse(readFileSync(new URL("../../contracts/out/MezoutRouter.sol/MezoutRouter.json", import.meta.url)));
writeFileSync(
  new URL("./src/abi/mezoutRouter.ts", import.meta.url),
  `// Generated from contracts/out by \`pnpm --filter @mezout/sdk gen:abi\`. Do not edit.\nexport const mezoutRouterAbi = ${JSON.stringify(out.abi, null, 2)} as const;\n`,
);
