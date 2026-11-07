# OpenBounty

Project-aware AI guidance, criteria drafting and PR evidence reviews for open-source teams, with **gasless USDT bounty payouts** on Whitechain.

- Maintainers agree on acceptance criteria and fund a bounty from a GitHub issue.
- A contributor claims it and opens a PR.
- 0G reviews the PR against the approved criteria. A maintainer makes the final call.
- The reward is released from escrow to the contributor, one way, with no wallet app, seed phrase or gas for anyone.

Built for two ETHGlobal Mumbai tracks: **0G · Build with 0G Private Computer** and **Whitechain · Scale (Payments nobody notices)**.

## Quick navigation

**Submission**
- [Submission details](#submission-details)
- [Team](#team)

**0G · Build with 0G Private Computer**
- [How 0G is used](#how-0g-is-used)
- [Why it brings people back](#why-it-brings-people-back)
- [What removing 0G breaks](#what-removing-0g-breaks)
- [Try the demo](#try-it)
- [Example request IDs](#example-request-ids)
- [Limits](#limits)

**Whitechain · Scale: Payments nobody notices**
- [Payer and contributor experience](#what-the-payer-and-contributor-experience)
- [Why on-chain settlement](#why-on-chain-stablecoin-settlement)
- [How a payment works](#how-a-payment-works)
- [Automatic payouts](#automatic-payouts-optional)
- [Gas funding and abuse prevention](#gas-funding-and-abuse-prevention)
- [Deployed addresses and evidence](#deployed-addresses-and-evidence)
- [Architecture](#architecture)
- [Limitations](#limitations)

**Run locally**
- [Requirements](#requirements)
- [Backend](#backend)
- [Client](#client)
- [Set up payments](#set-up-payments)
- [Automatic reviews and GitHub comments](#automatic-reviews-and-github-comments-optional)
- [Verify contracts](#verify-contracts)
- [Tests](#tests)

## Submission details

| Item | Value |
|---|---|
| Project name | OpenBounty |
| Description | AI guidance, criteria drafting and PR evidence reviews on 0G, with gasless USDT bounty payouts on Whitechain |
| Live app | [openbounty-theta.vercel.app](https://openbounty-theta.vercel.app) (frontend on Vercel) |
| Backend API | `https://openbounty.onrender.com` (Render; `GET /api/health`) |
| 0G judge demo | [openbounty-theta.vercel.app/demo/0g](https://openbounty-theta.vercel.app/demo/0g) (also linked from the homepage) |
| Demo video (under 3 min) | _add link before submitting_ |
| Public repo | this repository |
| Whitechain feedback | [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md) |
| Deployed contracts | see [Deployed addresses](#deployed-addresses-and-evidence) |
| Model | `glm-5.2` through the 0G router |

## Team

| Name | Telegram | X |
|---|---|---|
| Vinayak Pai | [vin314](https://t.me/vin314) | [@vinayak_314](https://x.com/vinayak_314) |
| Ishant Panchal | [Ishant_Panchal](https://t.me/Ishant_Panchal) | [@IshantP38294](https://x.com/IshantP38294) |
| Sarthak Junonikar | [s_juno07](https://t.me/s_juno07) | [@Sarthak17176121](https://x.com/Sarthak17176121) |
| Tanushree Borase | [@tanushree100](https://t.me/tanushree100) | [@TanushreeB9](https://x.com/TanushreeB9)|

---

# 0G · Build with 0G Private Computer

## How 0G is used

0G inference runs in the main flow of the app, and every call shows its request ID.

- **Project guide.** Ask `/explain …` or `@agent` in the workspace chat. Answers are grounded in a pinned public repo snapshot, linked issues and stored reviews.
- **Criteria drafting.** Draft acceptance criteria from a task or a GitHub issue. The maintainer edits and approves them.
- **PR evidence reports.** Each PR is reviewed per criterion, with citations checked against the diff and CI results kept separate from the AI's opinion.
- **Request IDs everywhere.** The same ID shows in chat, the PR reviews screen, the GitHub comment and the **0G activity** tab (model, provider, E2EE header, token usage).

## Why it brings people back

- Contributors ask the guide questions about the repo every day.
- Every new push to a PR gets a fresh review.
- A new commit marks the older review as stale.
- Outages and malformed model output show up as visible states, never as silent failures.

## What removing 0G breaks

| Feature | With 0G | Without 0G |
|---|---|---|
| Project guide | Answers grounded in a repo snapshot, issues and reviews | No answers; contributors read the code alone |
| Criteria drafting | Draft from a task or issue, with open questions | Maintainer writes every criterion by hand |
| PR evidence reports | Per-criterion verdicts with checked citations, refreshed on every push | Maintainer gathers and checks evidence manually |

Without 0G, OpenBounty is only a chat and criteria store.

## Try it

- Open **Try the 0G review demo** on the homepage, or go to `/demo/0g`.
- It compares a sample PR with its corrected revision and shows the request ID for each run.
- It needs no GitHub account, wallet or repository access.

## Example request IDs

Real runs from our testnet demo (`glm-5.2`):

- Review of PR #7, linked to the paid testnet bounty: `e9d91176-f5c3-4b17-bb54-2ed8620b31df`
- Review of PR #2: `73abee1f-b877-4432-957e-0c9e514b8086`
- Project guide (scope) answer: `3e05a754-8b8c-4869-8a62-15e6fc4c70be`

## Limits

- A request ID shows that an inference ran. It does not prove the review is right.
- No TEE-only provider existed for `glm-5.2` during testing, so reports say "no TEE trust mode requested".
- Rate limits, the review queue and webhook dedupe live in memory in one process. Review job status is stored in MongoDB.

---

# Whitechain · Scale: Payments nobody notices

## What the payer and contributor experience

- Sign in with GitHub and approve every payment with a **passkey** (fingerprint, face or device PIN).
- No seed phrase, no wallet app, no network switching, no WBT.
- OpenBounty's gas sponsor pays every fee, including the token approval and the deposit.
- **USDT** is the settlement token (rewards, escrow, payouts). **WBT** is only the gas token, spent by the sponsor.
- Payment flows **one way**: maintainer, then escrow, then contributor. The funder can never be the recipient.

## Why on-chain stablecoin settlement

- **Locked terms.** A funded bounty reserves the exact reward against approved criteria.
- **Rules in the contract.** One bound claimant, expiry and refund rules, and a required human approval plus a backend attestation.
- **No unilateral withdrawal** once work is submitted.
- **Shared receipt.** Funder and contributor audit the same on-chain payout record.
- A plain transfer or a conventional payment rail cannot do these things.
- It secures deposited funds under stated rules. It does not guarantee fair review or code quality.

## How a payment works

1. **Account.** The browser creates a passkey. The server derives an `OpenBountyAccount` smart account from its public key (CREATE2). The sponsor deploys it.
2. **Draft.** A maintainer creates a bounty from a GitHub issue (picker in the form): reward, deadline and criteria. Only one open bounty is allowed per issue.
3. **Fund.** One passkey approval runs `USDT.approve` and `escrow.fund`. The amount, criteria hash, repo and deadline are locked.
4. **Claim.** A contributor requests the bounty. A maintainer accepts one claimant, which fixes them as the only recipient.
5. **Submit.** The claimant enters their PR number. The backend checks GitHub and attests it. 0G reviews the PR against the funded criteria.
6. **Pay.** After merge, a maintainer approves the payout with a passkey. The backend adds a short-lived attestation of the merged, reviewed commit. The escrow pays exactly once.
7. **Refund or cancel.** An unclaimed bounty returns to the funder. Claimed work is cancelled only if the claimant also signs.
8. **Issue comments.** The linked GitHub issue gets a comment when the bounty is funded, paid or refunded (needs `GITHUB_REVIEW_TOKEN`).

Payment state comes only from escrow events and contract reads, never from a client-supplied transaction hash. The indexer applies each log once and reconciles active bounties on a timer.

## Automatic payouts (optional)

- A maintainer can tick **Pay automatically** on a bounty.
- The reward is released after the PR is merged and the current 0G report recommends approval.
- A separate payout agent key can approve `settle` only, up to an owner-set limit.
- The escrow still needs two different signatures (agent plus backend attestation).
- It re-checks merge, author, head commit and report before paying. Any doubt stops it and leaves the manual button.

## Gas funding and abuse prevention

- **Who pays.** One server-side sponsor key holding test WBT. It has no authority in the escrow.
- **Allowlist.** Only `USDT.approve` (escrow as spender, under a cap), the escrow's bounty and role functions, and a few relay calls. No value transfers, no other contracts.
- **Signed, expiring requests.** Each action is tied to the signed-in user, a nonce and a short deadline. The passkey must match the exact digest and require user verification. The account contract checks the same on chain.
- **Limits.** Per user 12/hour and 40/day, 200/hour globally, a gas cap per transaction, a daily WBT budget, and a minimum sponsor balance.
- **Simulation first.** Every action runs through `estimateGas`, so failing actions cost nothing and show a readable reason.
- Every sponsored transaction is recorded. The **Bounties** tab shows sponsor health and limits.

## Deployed addresses and evidence

Whitechain Sepolia (chain 1874). Contracts are verified on the explorer.

| Item | Value |
|---|---|
| USDT (designated) | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| OpenBountyAccountFactory | [`0x167E9A823e918d1994dce7E7BEd241aCc6525437`](https://explorer.testnet.whitechain.io/address/0x167E9A823e918d1994dce7E7BEd241aCc6525437#code) |
| BountyEscrow | [`0x2DC1E6ecFaB39DB8212439570aBF25a803f37d83`](https://explorer.testnet.whitechain.io/address/0x2DC1E6ecFaB39DB8212439570aBF25a803f37d83#code) |
| Funding transaction (1 USDT) | [`0xab8671e8…`](https://explorer.testnet.whitechain.io/tx/0xab8671e83f9d621c0b1c19a16a42d82f2d3139c53a3028f33ca7f858c210b988) |
| **Settlement (payout) transaction (1 USDT)** | [`0xa6febed0…`](https://explorer.testnet.whitechain.io/tx/0xa6febed07edcd80bf2d8dd51ffbe5bdd67d32e648c0035d2566d25d2eb6290e1) |

## Architecture

- **Client:** React workspace with Firebase GitHub sign-in.
- **API:** Express and Socket.IO, with MongoDB.
- **Server:** verifies GitHub webhooks, fetches GitHub data, calls 0G and records reports.
- **Chain:** Solidity escrow and passkey account contracts in [contracts](contracts/README.md). An indexer mirrors escrow events into MongoDB.
- **Scale note:** rate limits, the queue, debounce timers and sponsor locks are in memory. Use shared storage (for example Redis) before running several server instances.

## Limitations

- **Locked work.** There is no arbitration. Submitted work is released only by a maintainer-approved payout or a cancellation both sides sign.
- **Passkey loss.** Accounts have no recovery. Synced passkeys reduce the risk.
- **Trusted backend.** The escrow cannot read GitHub, so it trusts the attestation key for PR facts. That key cannot pay alone, change the recipient or change the amount.
- **One escrow per deployment**, owned by one project owner account.
- **Test assets only.** The designated USDT is an upgradeable proxy controlled by its issuer.
- **PR rules.** One PR can back only one bounty, and draft PRs cannot be registered.

---

# Run locally

For the full guide (local chain, Whitechain Sepolia, hosting, GitHub webhook, acceptance run) see [TESTING_AND_DEPLOYMENT.md](TESTING_AND_DEPLOYMENT.md).

## Requirements

- Node.js 22 or newer
- MongoDB
- A Firebase project with GitHub sign-in
- A 0G Private Computer API key
- For payments: test WBT from the [faucet](https://faucet.testnet.whitechain.io) and designated test USDT

## Backend

```sh
cd server
npm ci
cp -n .env.example .env
npm run dev
```

- Set `MONGODB_URI`, Firebase Admin credentials and `ZEROG_API_KEY` in `server/.env`.
- The backend runs on port 3000. Keep keys and secrets out of git.
- Set `ZEROG_DEMO_ENABLED=true` to enable live runs on `/demo/0g`.

## Client

```sh
cd client
npm ci
npm run dev
```

- Open the Vite URL, sign in with GitHub and add a public repository you control.
- For a hosted client, set `VITE_API_URL`, add the origin to `CLIENT_ORIGINS` and Firebase authorized domains, and route Socket.IO to the backend.
- To serve both from one host, build the client with `VITE_API_URL` unset and start the backend with `SERVE_CLIENT=true`. Use `/api/health` as the health check.

## Set up payments

1. Deploy the factory: `cd contracts && npx hardhat run scripts/deployAccountFactory.js --network whitechainSepolia`. Set `ACCOUNT_FACTORY_ADDRESS`.
2. Create two **test** keys: a sponsor (fund it with WBT) and an attestation signer. Set `SPONSOR_PRIVATE_KEY` and `ATTESTATION_PRIVATE_KEY`. For automatic payouts add a third unfunded `AUTOPAY_PRIVATE_KEY`.
3. Start the app. The project owner opens **Wallet** and creates a passkey account, then copies its address.
4. Deploy the escrow with that account as owner: `OWNER_ADDRESS=<owner account> ATTESTATION_SIGNER_ADDRESS=<attestation address> npx hardhat run scripts/deploy.js --network whitechainSepolia`. Set `ESCROW_ADDRESS` and `ESCROW_DEPLOY_BLOCK`.
5. In **Bounties → Payment permissions**, grant co-owners the maintainer and payout permissions.
6. Send designated test USDT to the funder's payment account and create a bounty.
7. Set `WEBAUTHN_RP_ID` to the client hostname and `WEBAUTHN_ORIGINS` to its exact origin. Passkeys work only on `https` or `localhost`.

## Automatic reviews and GitHub comments (optional)

1. Put the repo's `owner/name` in `GITHUB_REVIEW_REPOSITORIES` and set a random `GITHUB_WEBHOOK_SECRET`.
2. Add a repo webhook to `<backend URL>/api/webhooks/github` (JSON, same secret). Subscribe to **Pull requests**, **Check suites** and **Statuses**.
3. Set `GITHUB_REVIEW_TOKEN` to a fine-grained token for that repo with Pull requests and Issues read/write.
4. Open or update a PR and check the in-app report and the GitHub comment.

## Verify contracts

```sh
cd contracts
SOURCIFY=false npx hardhat verify --network whitechainSepolia <factory address>
SOURCIFY=false npx hardhat verify --network whitechainSepolia --constructor-args deployments/whitechainSepolia.args.js <escrow address>
```

## Tests

```sh
cd server && npm test           # includes an end-to-end run on a local Hardhat node
cd contracts && npx hardhat test
```

References: [0G track requirements](https://ethglobal.com/events/mumbai/prizes#0g), [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [GitHub comments API](https://docs.github.com/en/rest/issues/comments).
