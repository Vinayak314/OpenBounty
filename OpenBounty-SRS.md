# OpenBounty — Short SRS

**Hackathon MVP · 5 November 2026 · 0G + Whitechain**

## 1. Purpose and scope

GitHub bounties with approved criteria, chat, AI reviews and human-approved payments. One public repo; no Arkiv. MongoDB stores app data; Whitechain holds escrow.

## 2. Roles and privileges

| Role | Permissions |
|---|---|
| Repository owner | Connect GitHub App; grant/revoke maintainer roles and settlement wallets; all maintainer actions. |
| Authorized maintainer | Create/fund bounties; approve criteria; accept claims; review PRs; request changes; authorize payouts and permitted cancellations. Cannot manage roles. |
| Contributor | Sign in with GitHub; prove wallet ownership; browse/claim bounties; chat; submit PRs; receive rewards. Cannot change terms or authorize payments. |
| AI agent | Read repository context, explain issues, draft criteria and review evidence. Cannot merge, change permissions or move funds. |

Enforce app/contract permissions; nobody may overwrite funded terms or redirect the agreed recipient.

## 3. Functional requirements

- **Workspace:** GitHub App/webhooks, bounty board, project chat and bounty threads.
- **AI:** All inference on 0G Private Computer: criteria drafting, issue explanations and per-criterion PR reviews. Include validated citations, CI results, reviewed SHA and request ID. Reuse reports on GitHub, chat and approval screen.
- **Triggers:** Mentions, commands and GitHub events; rate-limit calls. New commits require re-review. Report outages; block normal approval without a current review.
- **Agreement:** Fund first; lock amount, criteria hash and deadlines. Atomically accept one claimant with a verified wallet. Unsubmitted claims expire after 72 hours or the submission deadline, whichever comes first.
- **Payment:** Solidity escrow, Whitechain Sepolia (`1874`), designated test USDT (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`). Pay once after merge/human approval, binding recipient, criteria hash, reviewed SHA and report hash. Backend attests GitHub facts.
- **Refund:** To funder before claim or after deadline without submission. Submitted work requires settlement/mutual cancellation; unresolved cases remain locked.

## 4. User flows

**Owner:** Connect repo → assign maintainers and wallets → oversee funded work.

**Maintainer:** Select issue → edit/approve AI criteria → fund → accept claimant → inspect review → request fixes → confirm merge → authorize payout.

**Contributor:** GitHub login + wallet proof → browse → read terms → request claim → discuss/build → open PR → address findings → receive USDT receipt.

## 5. Track features and deliverables

| Track | Features and delivery evidence |
|---|---|
| **0G — Build with 0G Private Computer** | Visible request IDs, live app, repeat PR reviews. Removal statement: “Without 0G, criteria drafting and AI evidence review disappear.” Deliver public repo/setup, description, contract addresses, team Telegram/X contacts, video under 3 minutes. Consumer-app track fit remains a risk. |
| **Whitechain — integration; prize conditional** | Verified escrow, designated-USDT payment, explorer receipt, settlement rationale, `WHITECHAIN_FEEDBACK.md`. Operate excludes escrow alone: add a reusable business payment integration/separate demo app to target it. Scale requires gasless payment. Both extensions are outside core MVP. |

Shared delivery: live demo, public repo with steady commits, architecture/limitations and a 2–under-3-minute video. Requirements: [ETHGlobal prize page](https://ethglobal.com/events/mumbai/prizes).

## 6. Completion criteria

Demo: funded issue → claim → incomplete PR → AI catches missing criterion → corrected commit → merge → authorized USDT payout. Verify unauthorized settlement, double payment, stale-review rejection and duplicate-webhook handling.

**Deferred:** arbitration, multi-repo support, split rewards, reputation, autonomous payouts and additional chains.
