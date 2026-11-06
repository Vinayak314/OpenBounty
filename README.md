# OpenBounty

OpenBounty gives open-source teams a workspace for agreeing on acceptance criteria, asking questions about their repository, and reviewing pull requests against evidence. Maintainers make the final decision.

## Run locally

Use Node.js 22 or newer, MongoDB, the project's Firebase Authentication setup with GitHub sign-in, and a 0G Private Computer API key. Payments additionally need the deployed contracts and two test keys (see [Set up payments](#set-up-payments)).

```sh
cd server
npm ci
cp -n .env.example .env
npm run dev
```

Set `MONGODB_URI`, Firebase Admin credentials and `ZEROG_API_KEY` in `server/.env`. The backend defaults to port 3000. Keep keys and webhook secrets in your deployment environment.

In another terminal, run:

```sh
cd client
npm ci
npm run dev
```

Open the Vite URL, sign in with GitHub and add a public repository you control. Your GitHub profile is bound to the numeric GitHub account id in your verified sign-in token, so a typed username can never claim another person's account; profiles saved before this check must sign in with GitHub once more. For a hosted client, set `VITE_API_URL` to the API origin, add the client origin to `CLIENT_ORIGINS` and Firebase authorized domains, and route Socket.IO to the backend.

## 0G · Build with 0G Private Computer

Without 0G, contributors lose repository-aware explanations and draft criteria, and maintainers have to gather and check PR evidence themselves.

Judges can open **Try the 0G review demo** from the homepage or visit `/demo/0g`. The page compares a sample PR with its corrected revision. It uses the same live 0G reviewer and citation checks as project reviews, and shows the request ID for each run. It accepts only the built-in diffs and uses no GitHub account, repository write, or wallet.

Set `ZEROG_DEMO_ENABLED=true` and `ZEROG_API_KEY` on the backend to enable live runs. `ZEROG_DEMO_REQUESTS_PER_HOUR` defaults to 24 per server process. Two runs can be in progress at once. Leave the demo disabled when public inference is unavailable.

To host the client and API together, build the client with `VITE_API_URL` unset, then start the backend with `SERVE_CLIENT=true`. The backend serves `client/dist`, the API and Socket.IO on the same port. Use `/api/health` for the host's health check and `/demo/0g` for the judge demo link.

- Ask `/explain how this module works` or `@agent` a question in the workspace chat. The guide uses a pinned public repository snapshot and shows a 0G request ID. Mention `#12` to bring that issue, or the stored evidence report for PR #12, into the answer ("why did #12 get changes requested?").
- Open **Criteria** to draft acceptance criteria with 0G from a task description or a GitHub issue number, edit them, and approve a new version. `/criteria` drafts in chat; `/setcriteria` approves from chat, one criterion per line. Only the owner or a co-owner can approve. Approving stales evidence made against older versions.
- Open a non-draft PR after approving criteria. The webhook starts a review of its diff and CI. Use `/review 7` for an on-demand review, substituting the real PR number.
- In **PR reviews**, compare the evidence with the diff and CI. Queued, running and failed reviews stay visible with the reason, and any project member can retry or request a review by PR number. After the reviewed PR merges, a maintainer can record approval for the current report and commit. OpenBounty checks GitHub again before accepting it.

- **0G activity** lists every inference run in the project with its request ID, role, model, provider, E2EE header and token usage.

One review carries the same 0G request ID in chat, the PR reviews screen and the GitHub evidence comment. Reviews also read issues the PR links with closing keywords ("Fixes #12") as background; they are judged only against the approved criteria. The request ID identifies the inference run. The application checks citations against the diff shown to the model and keeps GitHub CI results separate from the AI's assessment.

### Enable automatic reviews and GitHub comments

1. Put the repository's `owner/name` in `GITHUB_REVIEW_REPOSITORIES`. Set a random `GITHUB_WEBHOOK_SECRET` on the backend.
2. In the repository's webhook settings, enter the publicly reachable backend URL ending in `/api/webhooks/github`. Select JSON, enter the same secret and subscribe to **Pull requests**, **Check suites** and **Statuses**.
3. Set `GITHUB_REVIEW_TOKEN` to a fine-grained personal access token scoped to the selected repository. Grant Pull requests read/write for evidence comments and the read permissions required for repository contents and CI. The existing `GITHUB_TOKEN` can separately authenticate reads.
4. Open or update a PR and check the webhook response, the in-app report and the PR comment. The worker updates its existing comment when a new report supersedes it.

Automatic reviews support opened, reopened, ready-for-review, synchronize, and closed PR events. The worker skips drafts until ready and reuses valid evidence when refreshing the same commit and criteria version.

- Repeated deliveries (same `X-GitHub-Delivery`) are ignored. Rapid pushes are debounced (`REVIEW_DEBOUNCE_MS`, default 5 s), so only the newest commit is reviewed.
- When a check suite or commit status finishes for an already-reviewed commit, the report's CI state and recommendation refresh and the PR comment updates. This makes no new 0G call.
- If an automatic review of a new commit fails (0G outage, timeout, malformed output), the chat, the PR reviews screen and the PR comment say so, and the old evidence is marked as applying to an older commit.

### What removing 0G breaks

| Feature | With 0G | Without 0G |
|---|---|---|
| Project guide (`/explain`, `@agent`) | Answers grounded in a pinned repo snapshot, issues and stored reviews | No answers; contributors read the code alone |
| Criteria drafting | Draft from a task or issue, with open questions and regression checks | Maintainer writes every criterion by hand |
| PR evidence reports | Per-criterion verdicts with validated citations, refreshed on every push | Maintainer gathers and checks evidence manually |

OpenBounty keeps working as a chat and criteria store, but the repeat-use value (daily questions, every PR revision reviewed) depends on 0G inference.

### Submission checklist (0G track)

| Item | Value |
|---|---|
| Project name | OpenBounty |
| Description | Project-aware AI guidance, criteria drafting and PR evidence reviews for open-source teams, all on 0G Private Computer |
| Live app | _add URL_ (judge demo: `<live URL>/demo/0g`) |
| Demo video (under 3 min) | _add link_ |
| Model | `glm-5.2` through the 0G router (`ZEROG_MODEL`) |
| Example request IDs | _copy from the 0G activity screen after the demo run_ |
| Deployed contract addresses | see [contracts/README.md](contracts/README.md) |
| Team contacts (Telegram / X) | _add handles_ |

### Verification evidence and limits

A request ID identifies an inference run on 0G; it is not proof that the review is correct. The app shows what the router reports (provider, `x-0g-e2ee` header, token counts) separately from the assessment. `glm-5.2` had no TEE-only provider during testing, so `ZEROG_TRUST_MODE` is empty by default and reports show "no TEE trust mode requested". Rate limits, the review queue, debounce timers and webhook delivery dedupe live in memory in one process; review job status is stored in MongoDB.

Run the offline tests with `cd server && npm test`.

## Whitechain · Payments nobody notices

Bounties are paid in the designated test USDT (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) through a Solidity escrow on **Whitechain Sepolia (chain 1874)**. Payers and contributors sign in with GitHub and approve payments with a **passkey** (fingerprint, face or device PIN). They never see a seed phrase, never install a wallet, never switch networks and never hold WBT: OpenBounty's gas sponsor pays every network fee, including the token approval and the deposit.

**Why on-chain stablecoin settlement.** A funded bounty reserves the exact reward and programmatically restricts release and refunds (one bound claimant, expiry rules, refund rules, a required human approval plus a backend attestation) while exposing a shared, verifiable receipt to both parties. A plain transfer or a conventional payment rail cannot hold a reward against approved criteria, lock it from unilateral withdrawal once work is submitted, or let funder and contributor audit the same payout record. This secures deposited funds under stated rules; it does not guarantee fair review or code quality.

### How a payment works

1. **Payment account.** On the Wallet page the browser creates a P-256 passkey and signs a server challenge with it (proof of possession). The server derives the user's `OpenBountyAccount` address from the public key through `OpenBountyAccountFactory` (CREATE2) and the sponsor deploys it. The account is the user's verified recipient.
2. **Draft.** A maintainer creates a bounty from an issue: reward, deadline and acceptance criteria (drafted with 0G, edited by the maintainer).
3. **Fund.** OpenBounty builds one batch, `USDT.approve(escrow, amount)` and `escrow.fund(terms)`, and shows what it does. The maintainer approves it with the passkey, and the sponsor submits `account.execute(...)`. The amount, criteria hash, repository reference and deadline are locked in escrow.
4. **Claim.** A contributor requests the bounty. A maintainer accepts one claimant with a passkey approval, which binds that contributor's account as the only recipient.
5. **Submit.** The claimant enters their PR number. The backend checks on GitHub that the PR targets the repository and was opened by the claimant, signs a `SubmissionAttestation`, and the sponsor relays `registerSubmission`. The 0G reviewer checks the PR against the bounty's funded criteria.
6. **Pay.** After merge, a maintainer with payout permission clicks **Approve payout**. The backend re-validates GitHub (merged, claimant author, unchanged head) and requires a current 0G report. It signs a short-lived `SettlementAttestation` binding the bounty id, claim version, recipient, amount, criteria hash, reviewed SHA, merge commit and report hash. The maintainer approves with the passkey, and the escrow pays exactly once. Chat, the bounty board and the explorer show the receipt.
7. **Refunds and cancellation.** An unclaimed bounty can be refunded to the original funder. Claimed or submitted work can be cancelled only when the claimant also consents with their passkey (an ERC-1271 signature).

Payment state in MongoDB comes only from escrow events and contract reads that the backend fetches itself, never from a client-supplied transaction hash. The indexer applies each log once (unique `txHash`+`logIndex`), orders updates by block and log index, and periodically reconciles active bounties with `getBounty`/`effectiveStatus`, so a missed event is repaired without double-applying anything.

### Gas funding and abuse prevention

- **Who pays:** one sponsor key (`SPONSOR_PRIVATE_KEY`) holding test WBT, server-side only. It has **no authority** in the escrow. Every privileged action is authorized by the passkey signature inside `execute`, or by the separate attestation key, and the escrow checks signers, never the relayer.
- **Only allowlisted calls:** the server builds every batch itself. Defense in depth then allows only `USDT.approve` with the escrow as spender and an amount under the cap, plus the escrow's bounty and role functions. Directly sent transactions are limited to `factory.createAccount`, `registerSubmission` and `expireClaim`. Value transfers and any other contract are rejected.
- **Authenticated, signed, expiring requests:** each action is a server-side intent tied to the signed-in user, the account nonce and a 10-minute deadline. The passkey assertion must match the intent digest, the site's origin and RP ID, and require user verification (biometric or PIN). The account contract enforces the same digest, nonce and deadline (at most 1 hour) on chain.
- **Limits:** per user (12/hour, 40/day), global (200/hour), maximum gas per transaction, a daily WBT budget, and a minimum sponsor balance below which sponsorship pauses with a clear "temporarily unavailable" message. Every sponsored transaction is recorded in `SponsoredTx`. Each action is simulated with `estimateGas` first, so failing actions cost nothing and show the decoded reason.

The project's **Bounties** tab shows sponsor health, the daily budget used, and these limits.

### Set up payments

1. Deploy the passkey account factory: `cd contracts && npx hardhat run scripts/deployAccountFactory.js --network whitechainSepolia`. Put its address in `ACCOUNT_FACTORY_ADDRESS`.
2. Create two **test** keys: the sponsor (fund it with WBT from the faucet) and the attestation signer. Set `SPONSOR_PRIVATE_KEY` and `ATTESTATION_PRIVATE_KEY`.
3. Start the app. The project owner opens **Wallet** and creates a passkey payment account, then copies its address.
4. Deploy the escrow with that account as owner: `OWNER_ADDRESS=<owner account> ATTESTATION_SIGNER_ADDRESS=<attestation address> npx hardhat run scripts/deploy.js --network whitechainSepolia`. Set `ESCROW_ADDRESS` and `ESCROW_DEPLOY_BLOCK`. If the escrow already exists, run `scripts/transferOwnership.js` and click **Accept escrow ownership** in the Bounties tab.
5. In **Bounties → Payment permissions**, the owner grants co-owners the maintainer and payout permissions (one passkey approval each).
6. Send designated test USDT to the funder's payment account and create a bounty.

Set `WEBAUTHN_RP_ID` to the client's hostname and `WEBAUTHN_ORIGINS` to its exact origin. Passkeys only work on `https` sites or `localhost`.

### Deployed addresses and evidence

| Item | Value |
|---|---|
| Network | Whitechain Sepolia (1874) |
| USDT (designated) | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| OpenBountyAccountFactory | _add after deploy_ |
| BountyEscrow | _add after deploy_ |
| Settlement (payout) transaction | _add explorer link of a real payout_ |

### Payment limitations

- **Submitted work can stay locked.** There is no arbitration: a submission is released only by a maintainer-approved payout or a cancellation both sides sign. The UI states this before funding and claiming.
- **Passkey loss.** Accounts have no recovery. Platform-synced passkeys (iCloud Keychain, Google Password Manager) reduce the risk; a lost passkey loses access to that account's funds.
- **Trusted backend.** The escrow cannot read GitHub. It trusts the attestation key for "the claimant submitted this PR" and "this PR merged at this commit with this report". The key cannot pay without a maintainer's passkey approval and cannot change the recipient or amount.
- **One escrow per deployment**, owned by one project owner's account; multi-project escrow ownership is future work. Single-process sponsor nonce handling and in-memory throttles.
- `execute` verifies P-256 with the RIP-7212 precompile, which Whitechain Sepolia answers (checked with `eth_call`). Without it, OpenZeppelin falls back to Solidity verification (about 450k to 860k gas locally).
- Test assets only. The designated USDT is an upgradeable proxy controlled by its issuer.

Passkey accounts that hold USDT or escrow permissions cannot be removed from OpenBounty, because only OpenBounty's approved actions can spend from them. One pull request can back only one bounty, draft PRs cannot be registered, and payout re-checks that the PR on file is the one attested on chain.

Run the payment tests with `cd contracts && npx hardhat test` (escrow and passkey accounts) and `cd server && npm test` (includes an end-to-end run against a local Hardhat node and in-memory MongoDB).

## Architecture and scope

The React workspace uses Firebase sign-in, an Express and Socket.IO API, and MongoDB. The server verifies webhook signatures, fetches GitHub data, calls 0G Private Computer and records the report. Local review jobs run in a single process and record their status in MongoDB; jobs interrupted by a restart are marked failed and can be retried. Rate limits, the queue, debounce timers, webhook delivery dedupe and sponsor reservation locks are in memory, so they reset on restart and need shared storage (for example Redis) before running several server instances. If the worker stops before finishing, retry from **PR reviews**, use `/review`, or redeliver the GitHub event. The Solidity escrow and passkey account contracts live in [contracts](contracts/README.md). Bounty payouts go through the escrow; the PR reviews screen's approval is for PRs that are not bounty submissions.

The 0G integration is the project guide, scope assistant and advisory reviewer. Human maintainers approve criteria and contributions. The source uses a public-repository allowlist for GitHub comment publishing.

References: [0G track requirements](https://ethglobal.com/events/mumbai/prizes#0g), [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), and [GitHub comments API](https://docs.github.com/en/rest/issues/comments).
