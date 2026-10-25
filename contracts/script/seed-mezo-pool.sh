#!/usr/bin/env bash
# Creates the MUSD/MEZO volatile pool on Tigris (Mezo testnet) if it does not exist, and adds liquidity.
# The first deposit sets the price: MUSD_AMOUNT / MEZO_AMOUNT MUSD per MEZO.
#
# Run in your Mac terminal, inside the Mezout/contracts folder:
#   MUSD_AMOUNT=250 MEZO_AMOUNT=1000 ./script/seed-mezo-pool.sh
#
# The funding key is TEST_PAYER_PRIVATE_KEY from ../.env.local unless SEED_PRIVATE_KEY is set. It needs the MUSD,
# the MEZO (faucet.test.mezo.org) and a little test BTC for gas. It receives the pool's LP tokens.
# This uses cast, not forge script: Foundry's local simulation cannot run Mezo's MEZO precompile.
set -euo pipefail

set -a
# shellcheck disable=SC1091
source ../.env.local
set +a

: "${MUSD_AMOUNT:?Set MUSD_AMOUNT, e.g. 250}"
: "${MEZO_AMOUNT:?Set MEZO_AMOUNT, e.g. 1000}"
KEY="${SEED_PRIVATE_KEY:-$TEST_PAYER_PRIVATE_KEY}"
RPC="${MEZO_RPC_URL:-https://rpc.test.mezo.org}"

MUSD=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
MEZO=0x7B7c000000000000000000000000000000000001
TIGRIS_ROUTER=0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9
FACTORY=0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A

SEEDER=$(cast wallet address "$KEY")
MUSD_WEI=$(cast to-wei "$MUSD_AMOUNT")
MEZO_WEI=$(cast to-wei "$MEZO_AMOUNT")
DEADLINE=$(($(date +%s) + 600))

balance() { cast call "$1" "balanceOf(address)(uint256)" "$SEEDER" --rpc-url "$RPC" | cut -d' ' -f1; }
echo "Seeder $SEEDER holds $(cast from-wei "$(balance $MUSD)") MUSD and $(cast from-wei "$(balance $MEZO)") MEZO"

send() { cast send --private-key "$KEY" --rpc-url "$RPC" "$@" --json | python3 -c 'import json,sys; r=json.load(sys.stdin); print(" ", r["transactionHash"], r["status"])'; }

echo "Approving the Tigris router"
send "$MUSD" "approve(address,uint256)" "$TIGRIS_ROUTER" "$MUSD_WEI"
send "$MEZO" "approve(address,uint256)" "$TIGRIS_ROUTER" "$MEZO_WEI"

# Wei amounts overflow bash arithmetic, so compute in Python.
min99() { python3 -c "print(int('$1') * 99 // 100)"; }

# Accept up to 1% less of either token if the pool already exists at a slightly different price.
echo "Adding $MUSD_AMOUNT MUSD and $MEZO_AMOUNT MEZO"
send "$TIGRIS_ROUTER" \
  "addLiquidity(address,address,bool,uint256,uint256,uint256,uint256,address,uint256)" \
  "$MUSD" "$MEZO" false "$MUSD_WEI" "$MEZO_WEI" "$(min99 "$MUSD_WEI")" "$(min99 "$MEZO_WEI")" "$SEEDER" "$DEADLINE" \
  --gas-limit 5000000

POOL=$(cast call "$FACTORY" "getPool(address,address,bool)(address)" "$MUSD" "$MEZO" false --rpc-url "$RPC")
echo "MUSD/MEZO pool: $POOL"
echo "token0 $(cast call "$POOL" "token0()(address)" --rpc-url "$RPC")"
echo "reserves $(cast call "$POOL" "getReserves()(uint256,uint256,uint256)" --rpc-url "$RPC" | head -2 | tr '\n' ' ')"
