# OpenBounty TODO

This checklist tracks the MVP in [OpenBounty-Project-Overview.md](OpenBounty-Project-Overview.md) against the current codebase. The client has a React/Vite UI prototype, the server is a minimal Express app, and `contracts/` is still the Hardhat sample project. Items below are planned work unless explicitly marked as an existing foundation.

## Frontend

- [ ] Connect the existing landing, dashboard, project, profile, samples, and wallet pages to real backend data; replace sample data as each API is delivered.
- [ ] Implement GitHub sign-in and repository connection onboarding.
- [ ] Build the connected-project home with repository overview, contribution guidance, and recent activity.
- [ ] Implement the bounty board: scope, approved criteria, reward, deadlines, status, and claim availability.
- [ ] Implement bounty detail/thread views for discussion, claimant, linked PR, review history, and payment history.
- [ ] Implement project group chat and bounty threads, including agent mentions/commands and deterministic workflow notices.
- [ ] Build maintainer flows for drafting/editing criteria, funding, accepting claims, reviewing evidence, and explicitly approving settlement.
- [ ] Build contributor flows for wallet verification, requesting a claim, submitting a PR, responding to findings, and viewing payout receipts.
- [ ] Render evidence reports with per-criterion status, validated file/line citations, CI links, reviewed SHA, report freshness, model/request ID, and uncertainty.
- [ ] Show stale-review, AI outage, malformed report, transaction pending/failure, and sponsorship-unavailable states with recovery guidance.
- [ ] Show network and token details clearly; keep payer flow free from manual chain switching or gas-token setup.
- [ ] Add role-aware navigation and action visibility for owner, authorized maintainer, contributor, and AI.
- [ ] Ensure responsive layouts and accessible labels, focus behavior, and status announcements for core flows.

## Backend

- [ ] Establish Node.js/TypeScript application structure and configuration; replace the current placeholder Express server with versioned, authenticated APIs.
- [ ] Add MongoDB persistence and schemas for users, stable GitHub identities, workspaces, roles, maintainer wallets, bounties, criteria versions, claims, submissions, chat, reports, chain events, and jobs.
- [ ] Implement GitHub OAuth/App installation and verify the installer is authorized to connect the repository.
- [ ] Enforce workspace roles server-side; support owner grant/revoke of maintainer and settlement permissions and invalidate cached access after changes.
- [ ] Implement bounty lifecycle APIs and state transitions, including funding confirmation, atomic claimant acceptance, verified recipient binding, claim expiry, submission registration, and cancellation eligibility.
- [ ] Implement project and bounty chat with Socket.IO rooms, durable history, authorization checks, and deterministic workflow events.
- [ ] Add a queued, bounded-context orchestration path for project guide, scope assistant, and code reviewer requests; keep ordinary chat from triggering inference.
- [ ] Validate structured agent output and citations against pinned commits and the submitted diff before publishing reports.
- [ ] Version review reports by criteria hash/version and PR head SHA; deduplicate webhook/job events, reject obsolete results, and expose stale state.
- [ ] Publish the same current report to the bounty thread, approval view, and GitHub PR comment; update one comment per PR/revision lifecycle.
- [ ] Revalidate GitHub PR, merge, and CI facts immediately before creating settlement attestations.
- [ ] Implement short-lived signed settlement attestations binding bounty, claim version, recipient, amount, criteria hash, reviewed SHA, merge reference, report hash, nonce, and expiry.
- [ ] Keep attestation signing separate from AI services; protect secrets and never put GitHub tokens or raw keys in prompts, chat, or browser storage.
- [ ] Index escrow receipts/events into MongoDB idempotently; add replay protection, missed-event recovery/resync, and reconciliation against contract state.
- [ ] Never mark settlement complete based only on a client-provided transaction hash; derive payment state from verified chain receipts/events.
- [ ] Add request authentication, authorization, rate limits, audit records, and safe error handling for financial and AI operations.

## GitHub integration

- [ ] Create and configure a GitHub App with the minimum repository permissions needed for metadata, issues, pull requests, checks, and PR comments.
- [ ] Implement installation flow and scoped installation-token handling; store installation/repository IDs rather than relying on mutable names.
- [ ] Verify webhook signatures, deduplicate delivery IDs, and handle retries safely.
- [ ] Handle issue and pull-request events needed to create bounty drafts, link submissions, observe pushes/CI, and detect merges.
- [ ] Pin repository context to commit SHAs when collecting README, contribution guide, file tree, issue text, relevant files, diffs, and CI results.
- [ ] Register a claimant's PR against the bounty before deadline and preserve a timely submission through review.
- [ ] Post/update the validated review comment on the PR with criterion findings, links to full evidence, request ID, and reviewed SHA.
- [ ] Mark earlier reports stale when the PR head changes; ensure delayed webhook jobs cannot overwrite a newer report.
- [ ] Treat repository text, issue descriptions, comments, and diffs as untrusted input; do not allow them to alter agent authority or system policy.
- [ ] Show outside PRs as unclaimed submissions without automatically assigning a reward or displacing the accepted claimant.

## Blockchain

### Smart contracts

- [ ] Replace the sample `Lock.sol` with a bounty escrow design and document its state machine and trust boundaries.
- [ ] Store funded amount, allowlisted token, original funder, criteria hash, deadlines, and immutable agreement terms.
- [ ] Implement funding, atomic claim acceptance, recipient binding, submission registration, settlement, reservation expiry, permitted refunds, and mutual cancellation.
- [ ] Enforce one active accepted claimant, one payout only, no recipient redirection, and no arbitrary withdrawal of escrowed funds.
- [ ] Require maintainer authorization plus a domain-separated, expiring backend attestation for settlement; validate chain, escrow, nonce, claim/version, recipient, amount, criteria, reviewed SHA, merge reference, and report hash.
- [ ] Enforce authorization for relayed calls based on the human signer/verified account; never treat the relayer alone as settlement authority.
- [ ] Implement allowed refund paths: before claim, or after deadline when there is no protected submission; require mutual cancellation for claimed/submitted work as specified.
- [ ] Keep submitted disputes locked in this MVP; surface that limitation before funding and claiming.
- [ ] Use safe ERC-20 transfer handling, reentrancy protection, checks-effects-interactions, and explicit token allowlisting.
- [ ] Emit events for all lifecycle transitions and payment receipts; make event data sufficient for replay-safe backend synchronization.
- [ ] Add contract tests for unauthorized signers, changed terms/recipient, replayed/stale attestations, duplicate payout, claim races/expiry, invalid refunds, token failures, and reentrancy.
- [ ] Deploy and verify escrow on the intended test network; publish addresses, compiler settings, and deployment records.

### 0G integration — Private Computer

- [ ] Run a live spike for a code/text model that can explain repository code, draft criteria, and review a PR; record actual request-ID behavior.
- [ ] Implement one orchestrator with logical project-guide, scope-assistant, and code-reviewer roles; keep inference on 0G Private Computer.
- [ ] Build bounded, versioned context from pinned repository data, approved criteria, selected thread history, PR diff, and CI results.
- [ ] Trigger inference only for mentions, supported commands (for example `/explain` and `/review`), replies to agent messages, and relevant PR events.
- [ ] Require structured per-criterion results (`supported`, `missing`, `needs verification`) with explanations and validated citations.
- [ ] Attach request ID, model identifier, reviewed SHA, criteria version/hash, report hash, and uncertainty to each report.
- [ ] Handle rate limits, retries, timeouts, unavailable service, malformed output, and obsolete jobs without publishing misleading reports.
- [ ] Display request IDs in GitHub, chat, and approval views; describe them as traceability, not proof of correctness.
- [ ] Document what project guidance, criteria drafting, and review evidence lose if 0G is removed.
- [ ] Keep 0G Storage/Chain integration out of scope; MongoDB remains the durable coordination store.

### Whitechain integration — escrow and sponsored payments

- [ ] Configure Whitechain Sepolia: chain ID `1874`, RPC `https://rpc.testnet.whitechain.io`, explorer `https://explorer.testnet.whitechain.io`.
- [ ] Use the designated test USDT at `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`; do not substitute a self-minted token for the track demonstration.
- [ ] Prove on the actual target network that an embedded wallet/smart account can approve the token, deposit to escrow, and authorize settlement.
- [ ] Select the account and sponsorship provider only after the end-to-end compatibility spike succeeds.
- [ ] Sponsor every required payer transaction, including token approval and escrow funding; demonstrate a payer account with zero WBT.
- [ ] Restrict the sponsor to allowlisted contract addresses and function selectors; authenticate requests and validate signatures, nonces, and expiry.
- [ ] Add per-user/global rate limits and sponsored-spend limits; keep WBT treasury keys server-side and monitor sponsor balance.
- [ ] Reject arbitrary calls and show actionable failures when sponsorship is unavailable; retain explicit human payment authorization.
- [ ] Verify deployed contracts and provide explorer links for deposits and payouts.
- [ ] Synchronize confirmed contract receipts/events to application state with replay-safe indexing and a recovery/resync path.
- [ ] Document gas sponsorship, abuse controls, settlement rationale, network/token setup, and current limitations; prepare `WHITECHAIN_FEEDBACK.md`.

## Delivery and end-to-end acceptance

- [ ] Complete one connected public-repository flow: connect repo → approve criteria → fund → accept claimant → submit incomplete PR → review findings → push fix → fresh review → merge → human-approved sponsored payout.
- [ ] Demonstrate a real project question answered through 0G and show request IDs across the relevant surfaces.
- [ ] Demonstrate a payer approving token allowance and funding without WBT, manual network setup, or seed-phrase handling.
- [ ] Confirm unauthorized financial actions, stale reports, replayed attestations, duplicate webhooks, and duplicate payouts are rejected or safely deduplicated.
- [ ] Confirm missed chain events can be recovered without duplicate payment or corrupted status.
- [ ] Add README setup, architecture, role/permission model, deployed addresses, limitations, environment example without secrets, license, and AI-use statement.
- [ ] Prepare live application, sponsor evidence links, team contacts, required feedback file, and shared demo video (target 2:30; keep within the applicable sponsor limit).
- [ ] Recheck event submission requirements and the live dashboard deadline before submission.

## Deferred from this MVP

- [ ] Multi-repository organizations and private repositories.
- [ ] Arbitration or unilateral refunds after submitted work; unresolved submitted cases remain locked.
- [ ] Outside-contributor payout onboarding, split rewards, reputation, multiple tokens/chains, and scheduled digests.
- [ ] Autonomous code changes, autonomous merges, and autonomous payouts.
- [ ] Separate 0G Storage/Chain integration or Arkiv (removed from the architecture).
