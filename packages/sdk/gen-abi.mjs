import { readFileSync, writeFileSync } from "node:fs";

const contracts = [
  ["MezoutRouter.sol/MezoutRouter.json", "mezoutRouter.ts", "mezoutRouterAbi"],
  ["MezoutAccount.sol/MezoutAccount.json", "mezoutAccount.ts", "mezoutAccountAbi"],
  ["MezoutAccountFactory.sol/MezoutAccountFactory.json", "mezoutAccountFactory.ts", "mezoutAccountFactoryAbi"],
  ["MezoutAccountV2.sol/MezoutAccountV2.json", "mezoutAccountV2.ts", "mezoutAccountV2Abi"],
  ["MezoutAccountFactoryV2.sol/MezoutAccountFactoryV2.json", "mezoutAccountFactoryV2.ts", "mezoutAccountFactoryV2Abi"],
  ["MezoutAgentWallet.sol/MezoutAgentWallet.json", "mezoutAgentWallet.ts", "mezoutAgentWalletAbi"],
  ["MezoutAgentWalletFactory.sol/MezoutAgentWalletFactory.json", "mezoutAgentWalletFactory.ts", "mezoutAgentWalletFactoryAbi"],
];
for (const [artifact, file, name] of contracts) {
  const out = JSON.parse(readFileSync(new URL(`../../contracts/out/${artifact}`, import.meta.url)));
  writeFileSync(
    new URL(`./src/abi/${file}`, import.meta.url),
    `// Generated from contracts/out by \`pnpm --filter @mezout/sdk gen:abi\`. Do not edit.\nexport const ${name} = ${JSON.stringify(out.abi, null, 2)} as const;\n`,
  );
}
