# OpenBounty escrow contracts

Solidity escrow for OpenBounty bounties on **Whitechain Sepolia** (chain `1874`), paying out the designated
test USDT. Built with Hardhat (the toolchain already used in this folder), Solidity `0.8.28`, OpenZeppelin 5.

> **Status (honest summary).** The escrow and the passkey account contracts compile and pass the local suite
> (`npx hardhat test`, including tests that drive them with the backend's own signing/encoding modules).
> Gasless execution is implemented with our own passkey smart accounts plus the OpenBounty gas sponsor (see the root
> README). The contracts have **not** been deployed, **not** verified on the explorer and **not** audited; deployed
> addresses below are placeholders until the team deploys.

| Item | Value |
|---|---|
| Network | Whitechain Sepolia, chain id `1874`, L2 on Ethereum Sepolia |
| RPC / Explorer | `https://rpc.testnet.whitechain.io` / `https://explorer.testnet.whitechain.io` |
| Reward token | designated test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (6 decimals) |
| Gas token | WBT (test, no value) |
| Escrow address | `TBD` (placeholder, fill in after deployment, see [Deployed addresses](#deployed-addresses)) |

**Why on-chain stablecoin settlement (ETHGlobal Whitechain README requirement).** A funded bounty reserves the exact
reward and programmatically restricts release and refunds (one bound claimant, expiry rules, refund rules, a required
human approval plus a backend attestation) while exposing a shared, verifiable receipt to both parties. A plain transfer
or a conventional payment rail cannot hold a reward against criteria, lock it from unilateral withdrawal once work is
submitted, or let funder and contributor audit the same payout record. This secures deposited funds under stated rules;
it does not guarantee fair review or code quality. (The team-owned root README needs this line too; none exists yet.)

## Layout

```
contracts/BountyEscrow.sol          the escrow
contracts/OpenBountyAccount.sol     passkey (WebAuthn/P-256) smart account: no seed phrase, gas paid by a relayer
contracts/OpenBountyAccountFactory.sol  CREATE2 factory: one account per passkey public key
contracts/interfaces/IERC3009.sol   receiveWithAuthorization interface used for gasless funding
contracts/mocks/                    LOCAL TEST ONLY: MockUSDT, fee-on-transfer, reentrant token, ERC-1271 account
test/BountyEscrow.js, test/helpers.js   escrow tests; helpers hold the EIP-712 type definitions a backend should mirror
scripts/deploy.js                   escrow deployment script (env-driven, guards chain id and token)
scripts/deployAccountFactory.js     passkey account factory deployment (deploy this first)
scripts/transferOwnership.js        start a two-step escrow ownership transfer to a passkey account
scripts/mintMockUsdt.js             LOCAL ONLY: mint MockUSDT for dry runs
test/PasskeyAccount.js, test/webauthn.js  passkey accounts end to end with the backend's encoders and a test authenticator
.env.example                        variables read by hardhat.config.js / deploy.js (no secrets committed)
```

## Quick start

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test          # 136 passing (escrow + passkey accounts)
```

Deploy (test key only, never commit `.env`):

```bash
cp .env.example .env      # fill PRIVATE_KEY (funded with test WBT)
npx hardhat run scripts/deployAccountFactory.js --network whitechainSepolia
# create the project owner's passkey account in the app, then:
OWNER_ADDRESS=<owner passkey account> ATTESTATION_SIGNER_ADDRESS=<backend attestation address> \
  npx hardhat run scripts/deploy.js --network whitechainSepolia
```

The script refuses to run on any chain other than `1874` or a local network, refuses any token other than the
designated USDT on `1874`, requires an attestation signer distinct from the owner and deployer, aborts before sending
anything if the deployer has no gas, and writes `deployments/<network>.json` (no secrets). `MockUSDT` is deployed only on
local networks.

## Contract design

### Lifecycle

```
Draft --fund--> Funded --acceptClaim--> Claimed --registerSubmission--> Submitted --settle--> Paid
                  ^  |                    |                               |
                  |  +--refund--> Refunded <---cancelByAgreement----------+ (also from Claimed)
                  +-- claim expires ------+
```

* **Draft** is not stored: it is "no record". `fund` creates the record directly in `Funded`, so amount, token, criteria
  hash, repo reference and submission deadline are locked at the moment money arrives and can never be edited. Reusing a
  bounty id reverts (`BountyExists`).
* **Claimed**: exactly one claimant, with a **bound recipient** and a `claimVersion` (increments each acceptance).
  A claim lasts `min(acceptedAt + 72h, submissionDeadline)`. Expiry is lazy: after it passes, the bounty reads `Funded`
  (`effectiveStatus`), anyone may call `expireClaim`, and `acceptClaim`/`refund` also release it. Releasing a claim never
  refunds by itself.
* **Submitted**: the backend attested the claimant's PR before the claim expired. A submitted bounty cannot expire and
  cannot be unilaterally refunded, even after the deadline.
* **Paid / Refunded** are terminal.

### Who can do what

| Action | Authority (checked at execution time) |
|---|---|
| Grant/revoke maintainer, settlement-wallet flag, attestation signer, token allowlist | **Owner** only (two-step ownership, renounce disabled) |
| `fund`, `fundWithAuthorization` | maintainer or owner (the funder); contributors cannot |
| `acceptClaim` | maintainer or owner; recipient must not be the funder or the accepting signer |
| `registerSubmission` | anyone may relay, but needs a **backend attestation** |
| `settle` | anyone may relay, but needs **both** a human payout approval and a backend attestation |
| `refund` | the original funder, or a maintainer/owner. Funds **always** go to the original funder |
| `cancelByAgreement` | funder-side party (funder or maintainer/owner) **and** the bound claimant both sign |
| `expireClaim` | anyone |

Payout authority is stricter than maintainer: the approver must be the owner, or hold **both** the maintainer role and
the settlement-wallet flag. The approver can never be the recipient (self-payment).

Nobody can overwrite funded terms, redirect the agreed recipient, or withdraw arbitrary escrow balances: the contract has
no withdraw/sweep/rescue function. Tokens leave only through `settle` (to the bound recipient), `refund`, and
`cancelByAgreement` (both to the original funder). The owner is the repository/workspace owner wallet, **not** a platform
administrator, and cannot move escrowed funds.

### Settlement: two independent authorizations

`settle(Settlement s, Attestation att, Auth approval)` pays once and requires both:

1. **Human approval** (`PayoutApproval`, EIP-712) from an authorized maintainer/settlement wallet.
2. **Backend attestation** (`SettlementAttestation`, EIP-712) from `attestationSigner`, expiring within
   `MAX_ATTESTATION_TTL` (1 hour, enforced on chain).

Both sign the same fields: `bountyId, claimVersion, recipient, amount, criteriaHash, reviewedSha, mergeRef,
reportHash`, each plus its own `nonce` and `expiry`/`deadline`. The signed `recipient`, `amount` and `criteriaHash` must
equal what is stored on chain; the recipient is never taken from calldata alone. The two EIP-712 primary types differ,
so one role's signature cannot be replayed as the other's, nor a submission attestation as a settlement attestation.

"Both" is enforced as two **different** keys: `settle` reverts (`PartiesNotDistinct`) if the human approver equals the
current `attestationSigner`, so rotating the signer onto a maintainer or the owner cannot let one key pay alone.

Replay and double payout: the status flips to `Paid` before the transfer; attestation nonces are single-use per signer;
approval nonces are single-use per signer (and a signer can burn an unused one with `invalidateNonce`); `claimVersion`
makes evidence about a superseded claim unusable; the EIP-712 domain binds `chainId` and the escrow address.

### Relayed / sponsored execution

Every privileged action takes `Auth{signer, nonce, deadline, signature}` (human TTL at most 24h). Authority is the
**verified signer**: ECDSA, or ERC-1271 for smart accounts (OpenZeppelin `SignatureChecker`). `msg.sender` is trusted only
when it equals `signer` (a wallet or smart account calling directly). A relayer, gas sponsor or backend that submits the
transaction has no authority of its own. Tests cover: a zero-ETH maintainer accepting and approving purely by signing,
an ERC-1271 account approving through a relayer, forged signatures, and cross-contract/cross-chain replay.

**Gasless funding.** `fundWithAuthorization` pulls an EIP-3009 `receiveWithAuthorization` signed by the funder. The 3009
`nonce` must equal `hashTerms(terms, funder)`, so one signature commits to the exact bounty terms and a relayer cannot
attach the funds to different terms (tested). Plain `fund` (after `approve`) also works, including from a smart account.

### Events (indexer contract)

`BountyFunded`, `ClaimAccepted` (includes `claimExpiry`), `ClaimExpired`, `SubmissionRegistered`, `PayoutSettled`
(receipt: recipient, amount, token, evidence hashes, approver, attestation signer, nonce), `BountyRefunded` (with
`RefundReason` and authorizing party), plus `MaintainerUpdated`, `SettlementWalletUpdated`, `AttestationSignerUpdated`,
`TokenAllowlistUpdated`, `NonceInvalidated`. A test replays these logs into a toy indexer and checks it matches
`effectiveStatus` for every bounty. Because expiry is lazy, an indexer must apply `claimExpiry` itself instead of waiting
for a `ClaimExpired` log. State must be derived from receipts/events, never from a client-supplied transaction hash.

### Interpretation choices worth reviewing

* **"Before a claim" refund** is read as "no active claim": it includes after a claim expired. After a release the
  funder (or a maintainer on their behalf) may refund at any time; the work is reopened only if nobody refunds.
* **Submission is attested by the backend**, not by the claimant, so a claimant cannot lock funds with a fake submission.
* **Maintainer + settlement flag** are separate owner-granted permissions; payouts need both (owner implicit).
* **One escrow, many bounties**; `bountyId` is chosen by the backend (suggest `keccak256` of the database id). Only
  maintainers can fund, so id squatting is limited to maintainers.

## Backend integration notes

EIP-712 domain: `{name: "OpenBountyEscrow", version: "1", chainId: 1874, verifyingContract: <escrow>}`. The exact
type strings are in `BountyEscrow.sol` (public `*_TYPEHASH` constants) and mirrored independently in `test/helpers.js`.
Suggested encodings (conventions, not enforced on chain): `criteriaHash = keccak256(canonical criteria JSON)`,
`repoRef = keccak256(repoId, issueId)`, `reviewedSha` = 20-byte git SHA left-padded to 32 bytes, `mergeRef` = merge commit
or event id, `reportHash` = hash of the stored 0G evidence report. Generate attestation nonces randomly (uint256) and
keep the attestation key separate from the AI service and from any gas-sponsor key. For gasless funding read the token's
own `DOMAIN_SEPARATOR()`; do not rely on `version()` (it reverts on the live token).

## What was verified, and how

* `npx hardhat compile` and `npx hardhat test`: 136 passing against local mocks (escrow and passkey accounts). Quick mutation checks (removing
  `nonReentrant` on `settle`, the recipient/amount/criteria check, signature verification, the `Paid` status write) each
  made tests fail, so the suite is not vacuous.
* Read-only checks against the live Whitechain Sepolia RPC (no transactions sent):
  chain id `1874`; the designated USDT is an EIP-1967 proxy named "Tether USD" / `USDT` / 6 decimals;
  its `DOMAIN_SEPARATOR()` equals the EIP-712 domain `("Tether USD", "1", 1874, token)` (so `version()` reverting does
  not matter); `RECEIVE_WITH_AUTHORIZATION_TYPEHASH` equals the standard one; via `eth_call`, a correct
  `receiveWithAuthorization` signature passes the signature check and fails only on balance, a wrong key or domain
  fails with `invalid signature`, and a caller other than `to` reverts with `to != msg.sender`. The chain executes
  `PUSH0`, `MCOPY` and `TSTORE` (probed), so `evmVersion: cancun` is used.
* **Not verified:** an actual on-chain `fundWithAuthorization` / settlement transaction against the live token (needs a funded
  test key and test USDT); explorer verification (the Whitechain Hardhat page documents Sourcify + Blockscout via
  `npx hardhat verify`, but for Hardhat 3; this repo is on Hardhat 2, so `hardhat.config.js` mirrors it with a Sourcify flag
  plus our own Blockscout `/api` entry, neither exercised); embedded-wallet / sponsorship provider compatibility.
* Compiler target: the Whitechain Hardhat page recommends `evmVersion: "prague"` with solc 0.8.30. This repo pins
  solc 0.8.28 (highest target `cancun`), which is lower and therefore inside that range.

## Trust boundary

The contract **cannot read GitHub**. It trusts the signer in `attestationSigner` for: (a) the claimant's PR was linked in
time (`registerSubmission`), and (b) the PR was merged and reviewed at `reviewedSha` with `reportHash` (`settle`). Before
signing, the backend must re-validate GitHub (PR author, merge state, head SHA, CI, report freshness) immediately; that is
off-chain logic that this repo's contracts cannot enforce. Keep that key separate from the 0G/AI service, which has no
signing authority.

What a compromised or buggy backend key **can** do: register a fake submission (locking a bounty until mutual cancellation,
or until the owner rotates the signer and a new attestation is issued), or co-sign a premature payout *if* a maintainer also
approves it. What it **cannot** do: pay without a maintainer's signature, change the recipient or amount, refund, or touch
other bounties' terms. What a malicious owner can do: grant roles, rotate the signer, allowlist tokens for *new* bounties,
and approve payouts to the claimant a maintainer accepted. The owner cannot redirect funds.

## Limitations and risks

* **Submitted work can stay locked.** Per the MVP rules there is no arbitration and no unilateral refund after a protected
  submission: only `settle` or `cancelByAgreement` resolves it. A lost attestation key or an uncooperative claimant leaves
  funds locked (the owner can rotate the signer to recover the settlement path). **Show this before funding and claiming.**
* **Token risk.** The designated USDT is an upgradeable proxy (implementation `0x26425662d126412128967ecf0a02ec48573026f7`,
  owner `0x8790832Ba493Cc16a4dBC5c961B0C4950632799c` as read from the chain). Its owner could change behaviour; whether it can
  blacklist or pause addresses was not checked. A blocked recipient would make `settle` revert. Test tokens carry no value.
* Fee-on-transfer/rebasing tokens are rejected at funding (received amount must equal `amount`).
* **Verified recipient wallet is off chain.** The maintainer signs the recipient; wallet-ownership proof is a backend step.
  Self-payment is blocked per account, which is not Sybil resistance.
* **Gasless execution is ours, not a third-party provider.** Users hold `OpenBountyAccount`s controlled by a passkey.
  The OpenBounty sponsor submits `execute(calls, deadline, webauthnSignature)` and pays WBT; the account verifies the
  assertion (OpenZeppelin `WebAuthn`, user verification required) over an EIP-712 digest of the exact calls, its nonce and a
  deadline of at most 1 hour. `approve` + `fund` run in one batch, so token approval is sponsored too. The escrow sees the
  account as `msg.sender` (self-authenticating `Auth`), and other parties' consent (e.g. a claimant agreeing to cancel)
  arrives as ERC-1271 signatures. Whitechain Sepolia answered the RIP-7212 P-256 precompile in an `eth_call` probe, so
  verification uses the precompile there; locally the Solidity fallback costs about 450k to 860k gas per `execute`.
  Not yet exercised on the live network.
* No pause switch, no upgradeability, no native-token handling (ETH sent by mistake reverts; tokens sent directly to the
  contract are unrecoverable by design).
* Not audited. Tests are local only; no fuzz/invariant campaign or formal verification yet.
* Time rules use `block.timestamp`. Claim windows and deadlines are not adjusted for sequencer clock skew.

## Passkey accounts

| Contract | Role |
|---|---|
| `OpenBountyAccountFactory.createAccount(qx, qy)` | Permissionless, idempotent CREATE2 deploy; `accountAddress(qx, qy)` predicts the address. Rejects invalid P-256 keys. |
| `OpenBountyAccount.execute(calls, deadline, sig)` | Runs a batch if `sig` is a WebAuthn assertion (UP+UV) whose challenge is `executeDigest(calls, nonce, deadline)`. Bubbles inner reverts as `CallFailed(index, reason)`. |
| `OpenBountyAccount.isValidSignature(hash, sig)` | ERC-1271 over the same passkey; used for off-chain consents the escrow verifies. |

EIP-712 domain `{name: "OpenBountyAccount", version: "1", chainId, verifyingContract: <account>}`; types
`Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address target,uint256 value,bytes data)`. The signature is
`abi.encode(WebAuthn.WebAuthnAuth)` with low-s normalized `r, s`. The backend mirror lives in `server/services/chain/`.

No owner, upgrade or recovery path: losing the passkey loses the account.

## Deployed addresses

| Network | Contract | Address | Tx / explorer link | Verified |
|---|---|---|---|---|
| Whitechain Sepolia (1874) | `OpenBountyAccountFactory` | `TBD` | `TBD` | no |
| Whitechain Sepolia (1874) | `BountyEscrow` | `TBD` | `TBD` | no |
| Whitechain Sepolia (1874) | USDT (designated, external) | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | [explorer](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) | n/a |

After deploying: commit `deployments/whitechainSepolia.json`, link the settlement transaction here (ETHGlobal's
Whitechain tracks require a USDT payment settled in the main flow with the explorer link in the README), and attempt
`npx hardhat verify --network whitechainSepolia --constructor-args-path deployments/whitechainSepolia.args.js <escrow>`.

Gas reference from the local suite (not a Whitechain measurement): `fund` ~203k, `acceptClaim` ~91k,
`registerSubmission` ~89k, `settle` ~150k, `refund` ~86k, `cancelByAgreement` ~119k.

## Sources

Network parameters: <https://docs.whitechain.io/learn/network/testnet>. Hardhat deployment and verification:
<https://docs.whitechain.io/build/deploy/deploy-with-hardhat>. Viem usage (`whitechainSepolia` in
`viem/chains`): <https://docs.whitechain.io/build/dapps/use-viem>. Track requirements (designated USDT, explorer
verification, README line on stablecoin settlement, `WHITECHAIN_FEEDBACK.md`, gasless payer for Scale):
<https://ethglobal.com/events/mumbai/prizes>.
