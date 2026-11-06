# OpenBounty: testing and deployment guide

Step-by-step instructions to test OpenBounty locally and deploy it to Whitechain Sepolia. Work through the parts in order. Parts 1 to 3 need no real money or accounts on a public chain, so do them first.

Everything here uses **test keys and test tokens only**. Never put a key that holds real value in any of these files.

| Part | What it proves | Needs |
|---|---|---|
| 1 | The code builds and the automated tests pass | Node, nothing else |
| 2 | Chat, 0G answers and PR reviews work | MongoDB, Firebase admin credentials, 0G key |
| 3 | The whole payment flow works on a local chain | Part 2, plus two GitHub accounts |
| 4-6 | Deploy to Whitechain Sepolia | Test WBT, designated test USDT, a hosting domain |
| 7 | Automatic PR reviews from GitHub | A public URL for the server |
| 8 | Final acceptance run (the demo path) | Everything above |
| 9 | Evidence to collect for the submission | |

## 0. Before you start

You need:

- **Node.js 22 or newer** (`node --version`) and **npm**.
- **MongoDB**: a local one (`mongodb://127.0.0.1:27017/openbounty`) or an Atlas connection string. Use a throwaway database for testing.
- **Firebase Admin credentials** for the project in `server/.env.example` (`openbounty-b3e69`): either set `FIREBASE_SERVICE_ACCOUNT_JSON` or configure Google Application Default Credentials. GitHub sign-in must be enabled in Firebase Authentication (it already is for that project).
- A **0G Private Computer API key** from https://pc.0g.ai/dashboard/api-keys.
- **Two GitHub accounts** (an owner and a contributor). Use two browser profiles so you can be signed in as both. The PR author must be the claimant, so one account cannot test the claim flow alone.
- A **public GitHub repository you own** (the owner account) with at least one open issue. It will be the "project".
- For Parts 4 and later: a browser with passkey support (current Chrome, Safari, Edge or Firefox with a device PIN, fingerprint or face unlock), test WBT from https://faucet.testnet.whitechain.io, and a way to get the **designated test USDT** (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`). Check the Whitechain faucet and the event's Whitechain docs for how to obtain it; if there is no faucet, ask the Whitechain team at the event. The repo's mock token only works on a local chain and does not count for the track.

## 1. Install and run the automated checks

```bash
cd server && npm ci
cd ../client && npm ci
cd ../contracts && npm ci
```

Contracts (escrow, passkey account, factory):

```bash
cd contracts
npx hardhat test
```

Expected: `136 passing`.

Server (unit tests, the 0G/GitHub regression tests, and an end-to-end payment run on a temporary local chain with an in-memory MongoDB):

```bash
cd server
npm test
```

Expected: `pass 17`, `fail 0`. The first run compiles the contracts and downloads an in-memory MongoDB binary, so it can take a minute. This test does not touch your real database.

Client:

```bash
cd client
npm run lint     # expect 0 errors (3 warnings are known)
npm run build    # expect "built in ..."
```

If any of these fail, stop and fix them before continuing.

## 2. Run the app locally (chat, 0G, reviews; no payments)

### 2.1 Configure the server

```bash
cd server
cp -n .env.example .env
```

Edit `server/.env` and set at least:

```ini
MONGODB_URI=mongodb://127.0.0.1:27017/openbounty
FIREBASE_SERVICE_ACCOUNT_JSON=...        # or use Application Default Credentials
ZEROG_API_KEY=...                        # your 0G key
GITHUB_TOKEN=                            # optional, raises the GitHub API limit from 60/hour
```

Leave the Whitechain variables empty for now; payments stay off and the Wallet page says accounts are not configured.

### 2.2 Start the server and client

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev
```

Open http://localhost:5173 (use `localhost`, not `127.0.0.1`).

The server log should show `Server running on http://localhost:3000` and `Payments disabled: ...`.

### 2.3 Check the 0G features

1. Sign in with the **owner** GitHub account. Open the dashboard and add your public repository.
2. Open the project. In **Chat** type `/explain how does the main entry point work?`. Expect a Markdown answer with a line like `0G request <id> · glm-5.2 · repo @ <commit>`.
3. Open the **Criteria** tab. Enter a task (or an issue number), click **Draft criteria**, edit the result and click **Approve**. Expect "Criteria v1 approved" and a notice in chat.
4. Open a PR in the repository (not a draft), then in chat type `/review <PR number>`. Expect an **Evidence report**: one row per criterion (supported, missing or needs verification), citations, CI state, the request ID, the model and the report hash.
5. Open **PR reviews** and **0G activity**. The same request ID appears there. Click **Refresh PR and CI status**: it should not create a new request ID. **Run a fresh 0G review** creates a new one.
6. Type `/review fix the bug` or just `thanks!` as a reply to the agent. Expect no 0G call (a short hint message at most).

If the agent shows an error message, check `server` logs: a 401 means a bad `ZEROG_API_KEY`, 402 means no credits, GitHub messages mean the rate limit (set `GITHUB_TOKEN`).

## 3. Full payment dry run on a local chain

This runs the real contracts on a local Hardhat chain with a mock USDT, a real passkey in your browser, and the real sponsor. Nothing leaves your machine.

The keys below are the public Hardhat development keys. They are **only** for a local chain.

| Role | Hardhat account | Address | Private key |
|---|---|---|---|
| Deployer | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Gas sponsor | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Attestation signer | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

### 3.1 Start the local chain and deploy the account factory

```bash
# terminal 3
cd contracts
npx hardhat node
```

```bash
# terminal 4
cd contracts
npx hardhat run scripts/deployAccountFactory.js --network localhost
```

Copy the printed `OpenBountyAccountFactory:` address.

### 3.2 Point the server at the local chain (accounts only)

Add to `server/.env`:

```ini
PAYMENTS_ENABLED=true
WHITECHAIN_RPC_URL=http://127.0.0.1:8545
WHITECHAIN_CHAIN_ID=31337
ACCOUNT_FACTORY_ADDRESS=<factory address from 3.1>
SPONSOR_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ATTESTATION_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGINS=http://localhost:5173
INDEXER_CONFIRMATIONS=0
```

Restart the server (`Ctrl+C`, `npm run dev`).

### 3.3 Create the owner's payment account

1. Signed in as the owner, open http://localhost:5173/connect.
2. Click **Create payment account with a passkey** and complete the browser prompt (PIN, fingerprint or face).
3. Expect "Payment account ready" with an address. **Copy that address** (it is the owner account).

Repeat in the **contributor** browser profile (signed in as the second GitHub account) to give the contributor an account.

### 3.4 Deploy the escrow with the owner account as owner

```bash
cd contracts
OWNER_ADDRESS=<owner payment account address> \
ATTESTATION_SIGNER_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
npx hardhat run scripts/deploy.js --network localhost
```

From the output (and `contracts/deployments/localhost.json`) note:

- `BountyEscrow:` the escrow address
- `Reward token:` the mock USDT address
- `blockNumber` in the JSON file

Add to `server/.env` and restart the server:

```ini
ESCROW_ADDRESS=<escrow address>
USDT_ADDRESS=<mock USDT address>
ESCROW_DEPLOY_BLOCK=<blockNumber>
```

The log should now say `Payments enabled on ... (escrow 0x...)`.

### 3.5 Give the owner test USDT

```bash
cd contracts
TOKEN_ADDRESS=<mock USDT address> TO_ADDRESS=<owner payment account address> AMOUNT=100 \
npx hardhat run scripts/mintMockUsdt.js --network localhost
```

On the Wallet page the owner should show a USDT balance of 100 and **no WBT needed**. The owner is the escrow owner, so they can already fund bounties and approve payouts.

Now continue with **Part 8** (acceptance run) against this local setup. To test claim expiry locally, see "Time travel" in Part 8.

## 4. Whitechain Sepolia: keys, funding, account factory

> **Important: passkeys are bound to the website's domain.** An account created on `localhost` will not work on your public domain, and changing the domain later strands existing accounts. Decide your final domain now (Part 5) and create the owner's account **there**, before deploying the escrow. Do not use a free tunnel whose hostname changes between runs.

### 4.1 Create three test keys

```bash
cd server
node -e "const {Wallet}=require('ethers'); for (const n of ['deployer','sponsor','attestation']) { const w=Wallet.createRandom(); console.log(n, w.address, w.privateKey) }"
```

Save the output somewhere private. These must be three different keys:

- **deployer**: used only for deployments.
- **sponsor**: pays gas for users (`SPONSOR_PRIVATE_KEY`). Keep a little WBT in it.
- **attestation**: signs GitHub facts (`ATTESTATION_PRIVATE_KEY`). Never reuse the sponsor key. It needs no funds.

### 4.2 Fund them with test WBT

Use https://faucet.testnet.whitechain.io for the **deployer** and the **sponsor** addresses. The sponsor should hold enough for many transactions. The default daily spend limit is 0.5 WBT.

### 4.3 Configure the contracts folder

```bash
cd contracts
cp -n .env.example .env
```

Edit `contracts/.env`:

```ini
PRIVATE_KEY=<deployer private key>
OWNER_ADDRESS=              # filled in Part 6
ATTESTATION_SIGNER_ADDRESS=<attestation address>
WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
```

`contracts/.env` is git-ignored. Do not commit it.

### 4.4 Deploy the account factory

```bash
cd contracts
npx hardhat run scripts/deployAccountFactory.js --network whitechainSepolia
```

Copy the `OpenBountyAccountFactory:` address. It is saved in `contracts/deployments/whitechainSepolia.accounts.json`.

## 5. Host the app on its final domain

You need one public HTTPS hostname (for example `openbounty.example.com`). Passkeys only work on HTTPS (or `localhost`).

### 5.1 Configure the server

In the server's environment (`server/.env` on the host, or the host's secret store) set:

```ini
MONGODB_URI=...
FIREBASE_SERVICE_ACCOUNT_JSON=...
ZEROG_API_KEY=...
GITHUB_TOKEN=...                       # recommended

PORT=3000
SERVE_CLIENT=true
CLIENT_ORIGINS=https://openbounty.example.com
TRUST_PROXY=1                          # you are behind a reverse proxy

PAYMENTS_ENABLED=true
WHITECHAIN_CHAIN_ID=1874
WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
WHITECHAIN_EXPLORER_URL=https://explorer.testnet.whitechain.io
USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
ACCOUNT_FACTORY_ADDRESS=<factory from 4.4>
SPONSOR_PRIVATE_KEY=<sponsor key>
ATTESTATION_PRIVATE_KEY=<attestation key>
WEBAUTHN_RP_ID=openbounty.example.com  # the hostname only: no https://, no port
WEBAUTHN_ORIGINS=https://openbounty.example.com
```

Leave `ESCROW_ADDRESS` empty until Part 6.

### 5.2 Build and start

```bash
cd client && npm ci && npm run build        # leave VITE_API_URL unset
cd ../server && npm ci
node server.js                              # use pm2, systemd or your host's process manager in production
```

Put an HTTPS reverse proxy in front (it must forward WebSocket upgrades for `/socket.io`). Check:

```bash
curl https://openbounty.example.com/api/health      # {"ready":true}
```

### 5.3 Allow the domain in Firebase

In the Firebase console (project `openbounty-b3e69`): Authentication, Settings, **Authorized domains**, add `openbounty.example.com`. Without this GitHub sign-in fails on the new domain.

## 6. Create the owner account on the live site and deploy the escrow

1. Open `https://openbounty.example.com`, sign in with the owner GitHub account and go to `/connect`.
2. Create the payment account with a passkey. The server log shows it being deployed (sponsored). Copy the account address.
3. Put that address in `contracts/.env` as `OWNER_ADDRESS` and deploy:

```bash
cd contracts
npx hardhat run scripts/deploy.js --network whitechainSepolia
```

The script refuses any token other than the designated USDT on chain 1874. Note the escrow address and the `blockNumber` in `contracts/deployments/whitechainSepolia.json`.

4. Add to the server environment and restart it:

```ini
ESCROW_ADDRESS=<escrow address>
ESCROW_DEPLOY_BLOCK=<blockNumber>
```

The log should say `Payments enabled on Whitechain Sepolia (escrow 0x...)`.

5. Try to verify both contracts on the explorer (this is configured but has not been tried yet):

```bash
cd contracts
npx hardhat verify --network whitechainSepolia <factory address>
npx hardhat verify --network whitechainSepolia --constructor-args-path deployments/whitechainSepolia.args.js <escrow address>
```

If `hardhat verify` fails, use the explorer's "Verify and publish" page with the compiler settings from `deployments/whitechainSepolia.json` (solc 0.8.28, optimizer 200 runs, viaIR, evm `cancun`). Record the outcome in `WHITECHAIN_FEEDBACK.md`.

6. Fund the owner. Send designated test USDT to the owner's payment account address (shown on the Wallet page). The balance appears after a refresh.

7. Check the sponsor: open the project, **Bounties** tab. It should say "Network fees are sponsored by OpenBounty".

## 7. Automatic PR reviews from GitHub (optional but part of the demo)

1. In `server` environment set:

```ini
GITHUB_WEBHOOK_SECRET=<a long random string>
GITHUB_REVIEW_REPOSITORIES=owner/repo       # comma-separated owner/name allowlist
GITHUB_REVIEW_TOKEN=<fine-grained token for that repo>
```

The token needs: Pull requests (read and write), Contents (read), Issues (read), Checks (read), Commit statuses (read), on that repository only.

2. In the GitHub repository: Settings, Webhooks, Add webhook:
   - Payload URL: `https://openbounty.example.com/api/webhooks/github`
   - Content type: `application/json`
   - Secret: the same value
   - Events: **Pull requests**, **Check suites**, **Statuses**
3. After saving, GitHub sends a ping; the Recent Deliveries tab should show a 200.
4. Open or update a PR. After about 5 seconds (the debounce) the PR gets one OpenBounty evidence comment, and later pushes update that same comment.

GitHub does not retry failed deliveries, so use "Redeliver" in the webhook page if one was rejected.

## 8. Acceptance run (the demo path)

Use the owner and contributor browser profiles. Expected results are in italics.

**Setup**

1. Both accounts have payment accounts (`/connect`). The owner holds USDT. *Owner Wallet shows the balance and "Paid by OpenBounty" for fees.*
2. Owner adds the repository as a project and opens it.
3. Ask a project question: `/explain how does <feature> work?` *Answer with a 0G request ID.*

**Define and fund**

4. **Bounties**, **New bounty**: title, issue number, reward (for example 25), a deadline at least 24 hours away, click **Draft criteria with 0G**, edit, **Save draft**. *Draft #1 appears.*
5. Open it and click **Fund 25 USDT**. *A summary appears; approve with the passkey. Status becomes Funded and a receipt link appears. The owner's WBT balance is still 0.*
6. Check the explorer link: `approve` and `fund` happened in one transaction from the owner's account, paid by the sponsor.

**Claim and submit**

7. Contributor: **Request this bounty**. *Owner sees the request.* Owner clicks **Accept claim** and approves with the passkey. *Status Claimed; the contributor's account is the bound recipient.*
8. Contributor forks the repo, makes an **incomplete** fix (for example, misses the error path) and opens a PR that is **not a draft**. In the bounty, enter the PR number and click **Submit PR**. *Registered on chain; status Submitted.*
9. The 0G review runs. *Bounty detail shows an evidence report with at least one criterion "missing" and a request ID. Payout shows a warning that the report does not recommend approval.*

**Fix, review, merge, pay**

10. Contributor pushes the fix. Run `/review <PR number>` in chat (or wait for the webhook). *A new report for the new commit; the older one is marked stale.*
11. Owner merges the PR on GitHub.
12. Owner opens the bounty and clicks **Pay 25 USDT to <contributor>**, approves with the passkey. *Status Paid. Chat shows a "Paid" notice with the receipt. The contributor's account holds 25 USDT. The explorer shows the `PayoutSettled` event.*

**Negative checks** (each should be refused)

- Contributor sees no payout, refund or accept buttons.
- Submit a **draft** PR for a claimed bounty. *Refused: mark it ready first.*
- Submit the same PR on a second claimed bounty. *Refused: already registered for another bounty.*
- Push another commit after the last review, then try to pay. *Refused: the PR changed after the last review.*
- Try to pay before merging. *Refused: merge the PR first.*
- Reload and try to pay again. *The button is gone; the bounty is Paid.*
- A maintainer tries to request a claim. *Refused.*

**Refund and cancellation**

- Fund a second bounty and click **Refund to funder** before anyone claims it. *Status Refunded; the USDT returns to the owner.*
- Fund a third, accept a claim, then the contributor clicks **Agree to cancel** (passkey, nothing is sent) and the owner clicks **Cancel by agreement**. *Refunded with reason "mutual cancellation".*

**Sponsor limits**

- In the server environment set `SPONSOR_USER_TX_PER_HOUR=2`, restart, and do three sponsored actions. *The third says you reached the sponsored-transaction limit.*
- Set `SPONSOR_MIN_BALANCE_WEI` above the sponsor's balance. *Actions report that sponsorship is temporarily unavailable, and the Bounties tab says it is paused.* Restore both afterward.

**Time travel (local chain only)**

To test claim expiry, accept a claim, then in `contracts` run `npx hardhat console --network localhost` and:

```js
await network.provider.send("evm_increaseTime", [259200]);   // 72 hours
await network.provider.send("evm_mine");
```

*The bounty offers "Release expired claim"; clicking it reopens the bounty and keeps the reward in escrow.*

**Recovering missed events (test database only)**

Stop the server. In `mongosh` on the **test** database:

```js
db.chaincursors.deleteMany({}); db.chainevents.deleteMany({});
db.bounties.updateMany({}, { $set: { status: "funded" } });
```

Start the server. *After the indexer catches up (about a minute), every bounty is back to its real status and no payment is duplicated.*

## 9. Evidence to collect for the submission

- Explorer links for: the account factory, the escrow, a **funding** transaction, and the **payout** transaction in the designated USDT. Add them to `README.md` (Deployed addresses table) and `WHITECHAIN_FEEDBACK.md`.
- Screenshots of: the owner's balance showing 0 WBT during funding, the bounty detail with the 0G report and request ID, the same request ID on the GitHub PR comment and in chat, the 0G activity tab, the Bounties tab sponsor panel.
- A copy of at least two request IDs from different features (a chat answer and a PR review).
- Your Telegram and X contacts, the live URL and the demo video link in the README checklist.
- Fill the remaining `TODO` lines in `WHITECHAIN_FEEDBACK.md` with what actually happened.
- Add a license file and an AI-use statement (still missing).
- Recheck the event requirements and the dashboard deadline before submitting.

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Wallet page: "Payment accounts are not configured" | `ACCOUNT_FACTORY_ADDRESS` is empty or `PAYMENTS_ENABLED=false`. Restart the server after editing `.env`. |
| Passkey prompt says the site is not allowed or `SecurityError` | `WEBAUTHN_RP_ID` is not exactly the hostname you opened (no scheme or port), or the site is not HTTPS. |
| "The passkey was used on an unexpected site" | `WEBAUTHN_ORIGINS` does not list the exact origin (scheme, host and port). |
| GitHub sign-in fails on the new domain | Add the domain under Firebase Authentication, Authorized domains. |
| "Verify your GitHub account again" | Your profile was saved before identity checks. Sign in with GitHub once more. |
| "Payments disabled" in the server log | One of `ESCROW_ADDRESS`, `ACCOUNT_FACTORY_ADDRESS`, `SPONSOR_PRIVATE_KEY`, `ATTESTATION_PRIVATE_KEY` is missing. |
| "must be different keys" | The sponsor and attestation keys are the same. Create separate keys. |
| "Gas sponsorship is temporarily unavailable" | The sponsor is below `SPONSOR_MIN_BALANCE_WEI` or hit the daily budget. Fund it or raise the budget. |
| "Your payment account is not an escrow maintainer" | The account was not granted the role. Owner: Bounties, Payment permissions. |
| "holds 0 USDT" on funding | Send designated test USDT to the account address shown on the Wallet page. |
| Bounty status does not update | Check the log for `Escrow indexer poll failed`. On a local automine chain set `INDEXER_CONFIRMATIONS=0`. Use **Sync with escrow** on the bounty. |
| "A current 0G evidence report is required" | Run `/review <PR number>` and wait for the report for the current commit. |
| "The PR changed after the last review" | A new commit landed. Run a fresh review, then pay. |
| Agent says it is not configured / busy / out of credits | `ZEROG_API_KEY` missing, rate limited, or the 0G account has no credits (the log shows the HTTP status). |
| GitHub rate limit messages | Set `GITHUB_TOKEN`. The anonymous limit is 60 requests per hour. |
| Webhook returns 503 | `GITHUB_WEBHOOK_SECRET` is not set on the server. |
| Webhook returns 401 | The secret in GitHub differs from the server's. |
| No PR comment appears | The repo is not in `GITHUB_REVIEW_REPOSITORIES`, the token lacks Pull requests write, or the PR is a draft. |
| `npm test` fails right after switching branches | Run `npm ci` in `server`, `client` and `contracts` again. |
| Server test says it needs compiled contracts | It compiles them itself; make sure `contracts` has its dependencies (`npm ci`). |

## Reference: environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `MONGODB_URI`, `FIREBASE_*` | server | Database and sign-in verification |
| `ZEROG_API_KEY`, `ZEROG_MODEL` | server | 0G Private Computer |
| `GITHUB_TOKEN` | server | Higher GitHub API limit (read) |
| `GITHUB_WEBHOOK_SECRET`, `GITHUB_REVIEW_REPOSITORIES`, `GITHUB_REVIEW_TOKEN` | server | Automatic reviews and PR comments |
| `PAYMENTS_ENABLED`, `WHITECHAIN_*`, `USDT_ADDRESS` | server | Network and token |
| `ACCOUNT_FACTORY_ADDRESS`, `ESCROW_ADDRESS`, `ESCROW_DEPLOY_BLOCK` | server | Deployed contracts |
| `SPONSOR_PRIVATE_KEY`, `ATTESTATION_PRIVATE_KEY` | server | Gas sponsor and GitHub attestations (separate keys) |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS` | server | Passkey domain binding |
| `SPONSOR_*`, `INDEXER_*` | server | Sponsor limits and indexer behavior |
| `SERVE_CLIENT`, `TRUST_PROXY`, `CLIENT_ORIGINS` | server | Hosting |
| `PRIVATE_KEY`, `OWNER_ADDRESS`, `ATTESTATION_SIGNER_ADDRESS` | contracts | Deployment (test keys only) |

See `server/.env.example` and `contracts/.env.example` for every option with comments.
