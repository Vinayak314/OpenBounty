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
- The RIP-7212 P-256 precompile (`0x…0100`) answered a valid signature with `1` in an `eth_call` probe on 2026-11-06.
  This made passkey (WebAuthn) smart accounts practical: verification uses the precompile instead of a ~450k-860k gas
  Solidity fallback. A line in the docs saying it is supported would have saved the probe.
- **TODO:** deployment experience (Hardhat/Foundry), faucet speed, explorer behaviour after deploy.

## Where we got stuck

- `version()` on the designated USDT reverts, so the EIP-712 domain version had to be recovered by hashing candidate
  domains against `DOMAIN_SEPARATOR()` (it is `"1"`).
- The testnet network page does not state the target EVM version; we probed opcodes before finding that the Hardhat
  deployment page recommends `prague` (solc 0.8.30). A line on the network page would save a detour.
- The Hardhat deployment/verification page targets Hardhat 3 (`type: "http"`, `hardhatToolboxViem`). Our repo uses
  Hardhat 2, so the config and verification setup had to be translated and is **untested until we deploy**.
- We found no documented ERC-4337 bundler, paymaster or embedded-wallet provider for chain 1874, so we built our own
  gas sponsor (a relayer for passkey smart accounts) instead of a third-party provider.
- Verification: `hardhat verify` (v2) first failed because its Sourcify v1 endpoint has been removed upstream ("API v1 is removed") and `--constructor-args-path` is not recognised. With `SOURCIFY=false` and `--constructor-args <file>` both contracts verified on the Blockscout explorer. Deployment on chain 1874 and indexing of escrow events worked.

## What the docs were missing

- The EVM-version recommendation on the network page itself (it exists only on the Hardhat page), and a Hardhat 2 variant
  of the Hardhat guide.
- Whether the designated USDT can pause or blacklist addresses, and who administers the proxy, so builders can state
  that risk accurately.
- A documented, supported path for gas sponsorship / embedded wallets / paymasters on chain 1874. We used our own
  relayer plus passkey accounts (below). It worked on the live network: the sponsor paid gas for account creation, funding, claim acceptance, submission and the payout.
- **TODO:** anything else.

## Gas sponsorship and abuse prevention (Scale track)

Built (tested locally end to end against a Hardhat node; **not yet run on Whitechain Sepolia**):

- **Zero gas for payers:** each user has an `OpenBountyAccount` controlled by a passkey (no seed phrase). OpenBounty's
  sponsor key submits `execute(...)` and pays WBT; `approve` and `fund` run in the same sponsored batch.
- **Where WBT comes from:** one server-side sponsor key funded from the testnet faucet. It has no authority in the escrow.
- **Allowlist:** the server builds every batch; only `USDT.approve(escrow, ≤cap)`, the escrow's bounty and role
  functions, `factory.createAccount`, `registerSubmission` and `expireClaim` are ever sponsored. Value transfers and other
  contracts are rejected.
- **Limits:** per user 12/hour and 40/day, 200/hour globally, a gas cap per transaction, a daily WBT budget, a minimum
  balance floor, and simulation before sending. Every sponsored transaction is recorded.
- **Authorization:** passkey assertions with user verification over an EIP-712 digest of the exact calls, nonce and a
  deadline of at most 1 hour, checked by the server (origin, RP ID, challenge) and again by the account contract.

## Evidence links

- Account factory deployment and verification: [0x167E9A823e918d1994dce7E7BEd241aCc6525437](https://explorer.testnet.whitechain.io/address/0x167E9A823e918d1994dce7E7BEd241aCc6525437#code) (verified on Blockscout)
- Escrow deployment and verification: [0x2DC1E6ecFaB39DB8212439570aBF25a803f37d83](https://explorer.testnet.whitechain.io/address/0x2DC1E6ecFaB39DB8212439570aBF25a803f37d83#code) (verified on Blockscout)
- Deposit transaction: [0xab8671e83f9d621c0b1c19a16a42d82f2d3139c53a3028f33ca7f858c210b988](https://explorer.testnet.whitechain.io/tx/0xab8671e83f9d621c0b1c19a16a42d82f2d3139c53a3028f33ca7f858c210b988)
- Settlement (payout) transaction in the designated USDT: [0xa6febed07edcd80bf2d8dd51ffbe5bdd67d32e648c0035d2566d25d2eb6290e1](https://explorer.testnet.whitechain.io/tx/0xa6febed07edcd80bf2d8dd51ffbe5bdd67d32e648c0035d2566d25d2eb6290e1) (1 USDT, maintainer account to contributor account)
