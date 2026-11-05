# Whitechain feedback

> **DRAFT SKELETON.** ETHGlobal asks for "a few honest lines on what worked, where you got stuck and what our
> docs were missing." Only the contract-side notes below come from work actually done (read-only probing of the
> testnet RPC and docs on 2026-11-06). Everything marked **TODO** must be filled in by the people who deploy and run
> the demo; do not submit with TODOs left or with claims that were not exercised.

## What worked

- Network parameters (chain id 1874, RPC, explorer, faucet) were easy to find on the testnet docs page, and the public
  RPC answered `eth_call`/`eth_chainId` reliably without an API key.
- The chain executed `PUSH0`, `MCOPY` and `TSTORE` in `eth_call` probes, so recent Solidity `evmVersion: cancun` output works.
- The designated USDT exposes EIP-3009 `receiveWithAuthorization` and a readable `DOMAIN_SEPARATOR()`; with those we
  could confirm by `eth_call` that gasless funding signatures verify, without spending anything.
- The explorer is Blockscout and its Etherscan-style `/api?module=contract&action=getabi` endpoint responded.
- **TODO:** deployment experience (Hardhat/Foundry), faucet speed, explorer behaviour after deploy.

## Where we got stuck

- `version()` on the designated USDT reverts, so the EIP-712 domain version had to be recovered by hashing candidate
  domains against `DOMAIN_SEPARATOR()` (it is `"1"`).
- The docs did not say which EVM version the network targets (we probed opcodes instead) nor how to verify a contract
  on the explorer (we guessed a Blockscout `customChains` entry, **unconfirmed**).
- **TODO:** anything hit during real deployment, contract verification, gas sponsorship/account abstraction, or
  indexing events.

## What the docs were missing

- EVM version / hardfork support statement for contract authors.
- A contract-verification how-to for the explorer (API URL, compiler settings, Hardhat/Foundry snippets).
- Whether the designated USDT can pause or blacklist addresses, and who administers the proxy, so builders can state
  that risk accurately.
- A documented, supported path for gas sponsorship / embedded wallets / paymasters on chain 1874 (**TODO:** record what
  we finally used and whether it worked, since this is the Scale track's core requirement).
- **TODO:** anything else.

## Gas sponsorship and abuse prevention (Scale track)

**TODO:** how the payer pays zero gas, where the sponsor gets WBT, allowlisted contracts/selectors, rate limits, and
what stops draining. Contract-side building blocks that exist today: signature-based authorization (ECDSA/ERC-1271),
EIP-3009 `fundWithAuthorization`. Provider integration is not built or proven yet.

## Evidence links

- Escrow deployment and verification: **TODO**
- Deposit transaction: **TODO**
- Settlement (payout) transaction in the designated USDT: **TODO**
