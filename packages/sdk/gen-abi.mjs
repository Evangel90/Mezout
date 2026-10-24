import { readFileSync, writeFileSync } from "node:fs";

const contracts = [
  ["MezoutRouter.sol/MezoutRouter.json", "mezoutRouter.ts", "mezoutRouterAbi"],
  ["MezoutAccount.sol/MezoutAccount.json", "mezoutAccount.ts", "mezoutAccountAbi"],
  ["MezoutAccountFactory.sol/MezoutAccountFactory.json", "mezoutAccountFactory.ts", "mezoutAccountFactoryAbi"],
];
for (const [artifact, file, name] of contracts) {
  const out = JSON.parse(readFileSync(new URL(`../../contracts/out/${artifact}`, import.meta.url)));
  writeFileSync(
    new URL(`./src/abi/${file}`, import.meta.url),
    `// Generated from contracts/out by \`pnpm --filter @mezout/sdk gen:abi\`. Do not edit.\nexport const ${name} = ${JSON.stringify(out.abi, null, 2)} as const;\n`,
  );
}
