# OpenBounty TODO

Status of the MVP in [OpenBounty-Project-Overview.md](OpenBounty-Project-Overview.md) and [OpenBounty-SRS.md](OpenBounty-SRS.md) against the code on `track1`. Last updated 2026-11-06.

Legend:

- `[x]` built, and covered by an automated test or a successful build
- `[~]` built, but not verified live (needs a real deployment, browser, GitHub or 0G run) or only partly done
- `[ ]` not done

To deploy and test, follow [TESTING_AND_DEPLOYMENT.md](TESTING_AND_DEPLOYMENT.md). For the track details see the 0G and Whitechain sections of [README.md](README.md).

## Where we are

| Area | State |
|---|---|
| Contracts (escrow, passkey account, factory) | Done and tested locally: 136 Hardhat tests. **Not deployed, not verified on the explorer.** |
| Server (bounties, sponsor, indexer, 0G, GitHub) | Done. 17 tests, including an end-to-end run on a local chain. |
| Client | Builds, lint has 0 errors. Passkey prompts not tried in a real browser. |
| Live proof | Nothing run on Whitechain Sepolia yet. No real payout transaction. |
| Submission package | README placeholders, feedback file TODOs, license, AI-use statement, video: not done. |

## Do next (in order)

1. [ ] Deploy to Whitechain Sepolia and run the acceptance path (TESTING_AND_DEPLOYMENT.md, Parts D and E).
2. [ ] Make one real payout in the designated USDT and record the explorer links.
3. [ ] Fill the README placeholders and the remaining TODOs in `WHITECHAIN_FEEDBACK.md`.
4. [ ] Add a license file and an AI-use statement.
5. [ ] Record the demo video (about 2:30) and submit before the dashboard deadline.

## Frontend

- [~] Real backend data on every page: dashboard, project workspace, wallet, profile and bounties are live. The landing page and samples page still use static data in `client/src/data/`.
- [x] GitHub sign-in and repository connection onboarding (Firebase GitHub sign-in; the GitHub account id is verified).
- [~] Project home: the right rail shows the description and repository link. There is no repository overview, contribution guide or recent-activity feed.
- [x] Bounty board: scope, approved criteria, reward, deadline, status, claim availability (Bounties tab).
- [~] Bounty detail: expands inline with claimant, linked PR, review and receipts. There is no per-bounty discussion thread.
- [~] Project chat with `@agent`, `/explain`, `/criteria`, `/review`, `/setcriteria` and deterministic workflow notices is done. Per-bounty threads are not.
- [x] Maintainer flows: draft criteria with 0G, create and fund, accept a claimant, review evidence, approve payout, refund, cancel by agreement.
- [x] Contributor flows: passkey payment account, request a claim, submit a PR, view receipts, agree to cancel.
- [x] Evidence reports: per-criterion status, validated citations, CI, reviewed SHA, freshness, request ID, provider/E2EE, linked issues, uncertainty.
- [x] States: stale review, AI failure, transaction pending or failed, sponsorship unavailable, with recovery text.
- [x] Network and token details; no chain switching or gas token for payers.
- [~] Role-aware actions (owner, maintainer, contributor) are in place. Navigation itself is not role-specific.
- [~] Layout and accessibility: working at desktop width. No mobile pass, only light focus and aria work, no screen-reader testing.

## Backend

- [ ] Node.js/TypeScript structure. The server stays JavaScript/Express (a deliberate difference from the overview's TypeScript/Next.js).
- [x] MongoDB schemas: users (with verified GitHub id), projects, criteria versions, reviews, review jobs, bounties, claims, wallet intents, sponsored transactions, chain events and cursors, chat.
- [ ] GitHub App installation and installer authorization. Today: Firebase GitHub sign-in, a repository webhook and a repo-scoped token.
- [x] Server-side roles. The owner grants and revokes maintainer and payout permissions on chain.
- [x] Bounty lifecycle APIs: funding, atomic claimant acceptance, recipient binding, claim expiry, submission registration, refund and cancellation.
- [x] Chat with Socket.IO rooms, durable history and workflow notices.
- [x] Queued, bounded-context 0G orchestration for guide, scope and reviewer. Ordinary chat never calls the model.
- [x] Structured output and citations validated against the real diff before publishing.
- [x] Reports versioned by criteria hash and head SHA; stale marking; delivery and job deduplication; debounce.
- [x] The same report appears in chat, the PR reviews screen, the bounty detail and the GitHub comment.
- [x] GitHub revalidated (author, merge, head) immediately before settlement attestations.
- [x] Short-lived settlement and submission attestations binding every field the contract checks.
- [x] Attestation, sponsor and AI credentials are separate; startup refuses equal sponsor and attestation keys.
- [x] Idempotent indexer with confirmations, rollback on failed apply, resync and reconciliation against contract state.
- [x] Payment state comes only from chain receipts and events the server fetches itself.
- [~] Authentication and rate limits are in place on AI and payment routes, and sponsored transactions leave an audit trail. There is no general audit log, and limits are in memory.

## GitHub integration

- [ ] GitHub App with minimum permissions.
- [ ] Installation flow and scoped installation tokens (stable installation and repository ids).
- [x] Webhook signature check and delivery-id deduplication (in memory).
- [~] Events handled: pull request, check suite and status. Issue events (auto-creating bounty drafts) are not.
- [x] Context pinned to commit SHAs; linked issues read as background.
- [x] Claimant's PR registered before the deadline and protected through review.
- [x] One PR comment per PR, updated per revision, with request ID, SHA and failure notices.
- [x] Earlier reports go stale when the head changes; delayed jobs cannot overwrite newer reports.
- [x] Repository text, issues, comments and diffs treated as untrusted.
- [ ] Outside PRs shown as unclaimed submissions.

## Blockchain

### Smart contracts

- [x] Escrow design and state machine documented in `contracts/README.md`.
- [x] Funded amount, allowlisted token, funder, criteria hash, deadlines locked at funding.
- [x] Funding, atomic claim acceptance, recipient binding, submission registration, settlement, expiry, refunds, mutual cancellation.
- [x] One claimant, one payout, no recipient redirection, no arbitrary withdrawal.
- [x] Settlement needs a maintainer approval and a domain-separated, expiring backend attestation.
- [x] Relayed calls authorized by the verified signer; the relayer has no authority.
- [x] Refund rules and mutual cancellation as specified; submitted disputes stay locked (limitation shown before funding and claiming).
- [x] Safe transfers, reentrancy guard, checks-effects-interactions, token allowlist.
- [x] Events for every transition and receipt.
- [x] Tests: unauthorized signers, changed terms, replay, double payout, claim races and expiry, invalid refunds, token failures, reentrancy.
- [x] Passkey smart account and factory (WebAuthn/P-256, ERC-1271) with tests that drive them using the server's own encoders.
- [ ] Deploy to Whitechain Sepolia, verify on the explorer, publish addresses and deployment records.

## 0G integration

- [x] Live spike done earlier (model `glm-5.2`, request-ID behavior recorded in `temp/agent-features.md`).
- [x] One orchestrator with guide, scope and reviewer roles on 0G Private Computer.
- [x] Bounded, versioned context with a hard prompt cap.
- [x] Triggers only for mentions, commands, replies and PR events; pleasantries and malformed commands cost nothing.
- [x] Per-criterion `supported` / `missing` / `needs verification` with validated citations (unchanged context lines cannot support a criterion).
- [x] Request ID, model, provider, E2EE header, reviewed SHA, criteria version and hash, report hash, uncertainty on each report.
- [x] Rate limits, retries, timeouts, outage, malformed output and obsolete jobs handled; failures are visible and retryable.
- [x] Request IDs shown in GitHub, chat, the PR reviews screen and the 0G activity tab, described as traceability only.
- [x] "What removing 0G breaks" documented.
- [x] 0G Storage/Chain stays out of scope.
- [~] Re-run the live flows (question, criteria draft, incomplete then fixed PR) on the final build.
- [ ] Private (TEE) provider: `glm-5.2` had none, so reports state that no trust mode was requested.

## Automatic payout (added 2026-11-06)

- [x] Escrow: `setAutoPayoutAgent` with a per-payout cap; the agent can approve `settle` only and the backend attestation is still required. 8 Hardhat tests.
- [x] Server: per-bounty opt-in, trigger after each review plus a 2-minute sweep, re-checks every settlement fact, atomic attempt claim, 5-attempt limit, chat notices, `AUTOPAY_PRIVATE_KEY` kept separate from the sponsor and attestation keys.
- [x] Client: opt-in checkbox and status on the bounty, owner controls in Payments.
- [~] End-to-end test on a local chain (`server/test/autopay.integration.test.js`); not yet run on Whitechain Sepolia.
- [ ] After redeploying the escrow: set `AUTOPAY_PRIVATE_KEY`, enable the agent in Payments, and run one merged-PR payout.

## Whitechain integration

- [x] Chain 1874, RPC and explorer configured; designated USDT as the default token.
- [~] Account and sponsorship: our own passkey smart accounts plus a relayer (no third-party provider). Proven on a local chain only.
- [~] Approve, deposit and settlement without WBT: proven locally with a payer holding zero gas. Not yet on the real network.
- [x] Every payer transaction sponsored, including token approval and funding (one batch).
- [x] Sponsor allowlist (contracts and functions), signed and expiring requests, per-user and global limits, daily budget, balance floor, simulation before sending.
- [x] Arbitrary calls rejected; clear errors when sponsorship is unavailable; explicit passkey approval for every payment.
- [ ] Verified contracts and explorer links for a real deposit and payout.
- [x] Receipts and events synchronized with replay-safe indexing, recovery and reconciliation.
- [~] Documentation: gas sponsorship, abuse controls, rationale, setup and limitations are in the README. `WHITECHAIN_FEEDBACK.md` still has TODOs that need the real deployment.

## 0G track compliance (checked against the prize page 2026-11-06)

Met in code: inference on 0G Private Computer in the main flow, request IDs in chat, PR reviews, GitHub comment and the 0G activity tab, the "what removing 0G breaks" statement, a judge demo at `/demo/0g`, and no generic-chat-wrapper behavior (replies are grounded in repo snapshots, criteria and diffs).

Still missing for submission:

- [ ] Live application URL and the demo-page link.
- [ ] Demo video under 3 minutes (the shared 2:30 video fits).
- [ ] Example request IDs copied from a real run into the README checklist.
- [ ] Deployed contract addresses (blocked on the Whitechain deployment).
- [ ] Team names and Telegram / X contacts.
- [ ] Public repo hygiene: license and AI-use statement.
- [ ] Optional iAI bonus (0G sign-in and a visibly decreasing credit balance): not built, deliberately deferred.
- [ ] Risk: the track asks for a consumer app with daily return value; the demo should lead with the daily guide use, not only PR review.

## Delivery and acceptance

- [~] End-to-end flow (connect repo, criteria, fund, claim, incomplete PR, findings, fix, fresh review, merge, sponsored payout): the payment half is tested on a local chain; the full demo has not been run by hand.
- [~] Real project question through 0G with request IDs across surfaces: verified earlier; re-check on the final build.
- [~] Payer funds without WBT or a seed phrase: proven locally; prove on testnet.
- [x] Unauthorized actions, stale reports, replayed attestations, duplicate webhooks and double payouts are rejected or deduplicated (tests).
- [x] Missed chain events recovered without duplicate payment (test).
- [~] README: setup, architecture, permissions, limitations, env example are done. Deployed addresses and the payout link are placeholders.
- [ ] License file.
- [ ] AI-use statement.
- [ ] Live application URL, sponsor evidence links, team Telegram/X contacts.
- [ ] Demo video (target 2:30).
- [ ] Recheck the event requirements and the dashboard deadline.

## Known limits and open risks

- Rate limits, the review queue, debounce timers, webhook dedupe and sponsor locks are in memory: they reset on restart and need shared storage before running several servers.
- Passkey accounts have no recovery or rotation. A lost passkey strands the account, including the escrow owner role.
- Accounts can only do OpenBounty's approved actions (there is no send or withdraw screen), so funds sent to an account can only be used for bounties.
- Submitted work can stay locked (no arbitration). One escrow per deployment, owned by one project owner.
- The backend attestation key is trusted for GitHub facts; it cannot pay without a maintainer's passkey approval.
- `excludeCredentials` is not set during passkey creation.
- The designated USDT is an upgradeable proxy controlled by its issuer. Test assets only.
- Nothing here is audited.

## Deferred from this MVP

- [ ] Multi-repository organizations and private repositories.
- [ ] Arbitration or unilateral refunds after submitted work.
- [ ] Outside-contributor payout onboarding, split rewards, reputation, multiple tokens or chains, scheduled digests.
- [ ] Autonomous code changes and merges. (The SRS also lists autonomous payouts as deferred; an opt-in, capped automatic payout was added later at the team's request, see "Automatic payout".)
- [ ] Separate 0G Storage/Chain integration (Arkiv was removed from the architecture).
- [ ] The Whitechain "Operate" extension (reusable business payment integration or separate demo app), which the SRS marks outside the core MVP.
