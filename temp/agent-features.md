# OpenBounty AI agent: features

Status as of 2026-11-06. All inference runs through 0G Private Computer (OpenAI-compatible router, model `glm-5.2`).
Legend: ✅ built · 🧪 built, not yet tested live in the app · ⏳ not built yet

---

## 1. In project chat

### How to talk to the agent
Ordinary chat never calls the model. The agent responds only to:

| Trigger | Example | Role |
|---|---|---|
| `@agent` mention | `@agent how does login work?` | guessed from the wording |
| `/explain <question>` | `/explain what does server.js do?` | Project guide |
| `/criteria <task>` | `/criteria fix the double-submit bug` | Scope assistant |
| `/review <PR>` | `/review 12`, `/review #12 force`, `/review <PR URL>` | Code reviewer |
| `/setcriteria` | see below | maintainers only, no AI |
| Reply to an agent message | reply to any "Bounty agent" message | guessed from the wording |

### Project guide ✅
- Explains the project, its structure, contribution rules and code.
- Reads the project's connected public GitHub repo at a pinned commit: file tree plus up to 6 relevant files (README, CONTRIBUTING, manifests, entry points, files whose names match your question or that you mention by path).
- Cites only paths that exist in the file tree, and says when it saw only part of a file.
- Answers shown with: 0G request ID, model, repo commit and the files it read.

### Scope assistant ✅
- Drafts acceptance criteria as a numbered list of verifiable statements, points out ambiguity, suggests regression checks.
- Output is a draft only. Nothing is saved until a maintainer runs `/setcriteria`.

### Approving criteria: `/setcriteria` 🧪
- Owner or co-owner only; anyone else gets a refusal. No AI call.
- One criterion per line (numbers and bullets are stripped), up to 20 criteria of up to 500 characters.
- Saves a versioned, hashed criteria list on the project. New reviews use the latest version.

```
/setcriteria
1. Disable the submit button while a request is pending
2. Reset the pending state when the request fails
3. Add a test for the error path
```

### Code reviewer: `/review` 🧪
1. Fetches the PR (title, description, author, draft/open/merged), changed files with diffs, and CI results for the head commit.
2. Sends the model the diff (with line numbers), the approved criteria and CI results. PR text is treated as untrusted.
3. Model returns, per criterion: **Supported**, **Missing** or **Needs verification**, with an explanation and file/line citations.
4. The server validates the output:
   - Citations are checked against the real diff; invalid ones are dropped.
   - "Supported" without a valid citation is downgraded to "Needs verification".
   - A criterion the model skipped becomes "Needs verification".
   - Malformed output is rejected and nothing is published.
5. The recommendation is computed by backend rules, not by the model:

| Recommendation | When |
|---|---|
| **Changes requested** | a criterion is missing, or CI is failing |
| **Maintainer review needed** | anything unverified, CI running or absent, draft/closed PR, truncated diff, dropped citation, or no approved criteria |
| **Recommend approval** | every criterion supported with verified citations and CI passed |

6. Posts an **evidence report** in chat: criteria table, citations, CI status, risks, uncertainty, 0G request ID, model, report hash, link to the PR.
7. Posts a short notice tagging the owner (see notifications).

Behaviour worth knowing:
- **Dedupe:** the same PR commit + same criteria version reuses the stored report with no AI call (CI and PR state are refreshed). `force` re-runs it.
- **Stale reports:** the PR head is re-checked just before publishing; if it moved, the review is refused with a re-run prompt. Older reports for the PR are marked stale and shown dimmed.
- **No criteria:** no AI call; the result is "Maintainer review needed".
- **Wrong repo:** a PR URL from a different repo is refused.

### Notifications to maintainers 🧪
After each review the agent posts a chat message:
- Ready: tags the owner, says it looks ready, and that approval of merge and any reward is theirs.
- Changes requested: lists reasons and tells the contributor to push and run `/review <n>` again.
- Needs attention: tags the owner with the reasons.
- Also emits a `review:completed` socket event to the project room.

### Chat experience ✅
- Agent replies render as Markdown (headings, lists, tables, code blocks, links open in a new tab). Raw HTML is dropped and images show as links.
- "Bounty agent is reviewing…" indicator while a job runs.
- AI badge, request ID, model, repo commit and files read under each answer.
- Visible error messages (not made-up answers) for: not configured, timeout, rate limit, GitHub unavailable, empty answer, malformed review.
- Slash-command and `@agent` suggestions in the composer.

### Safeguards ✅
- No authority: cannot merge, change permissions, approve rewards, or touch payments. It has no tools that could.
- Chat, repo files, PR text and diffs are wrapped as untrusted data; instructions inside them are ignored.
- Secrets (`sk-`/`ghp_` tokens, 0x private keys, PEM blocks) redacted before reaching a prompt; `.env`, key files, lockfiles and binaries are never read.
- Limits: 4 requests/user/minute, 12/project/minute, queue of 5, one job at a time per project, 60 s timeout, retries on 429/5xx.
- Only the project's own connected repo can be read; public repos only.

---

## 2. In the GitHub UI

**Nothing is posted to GitHub yet.** The agent reads GitHub; it cannot write to it. Today the report exists only in OpenBounty chat. Planned behaviour, which needs the GitHub App (write permission + webhooks) ⏳:

| Feature | Status |
|---|---|
| Post the evidence report as a PR comment | ⏳ |
| Keep ONE comment per PR and update it on each new commit | ⏳ |
| Mark the old comment stale when the head SHA changes | ⏳ |
| Start a review automatically on PR open/push (webhooks, debounced) | ⏳ |
| Re-run review when CI finishes | ⏳ |
| Show 0G request ID and reviewed SHA in the comment | ⏳ |
| Set a commit status / check run from the recommendation | ⏳ |
| Read issue text and linked issues as review context | ⏳ |
| Private repositories | ⏳ |

What it already reads from GitHub (public, read-only, optional `GITHUB_TOKEN` for a higher rate limit): repo metadata, default-branch commit and file tree, raw file contents, PR metadata, PR changed files with patches, check runs and commit statuses.

---

## 3. Not built yet / limits

- Reviews are not linked to bounties, claims or payouts; they attach to a PR number and the project's criteria.
- Reviews only the diff; does not read the rest of the repo or run code, so behaviour needing a run is "Needs verification".
- First 100 changed files of a PR only; larger PRs are flagged as truncated.
- No search inside repo files; relevant files are chosen by path/name only.
- No automatic retry on malformed review output (saves credits); ask again.
- Rate limits and the queue are in memory (reset on restart, single process).
- Privacy mode: `glm-5.2` has no TEE "private" provider; responses showed `x-0g-e2ee: none`.
- Maintainer notification is a chat message only (no inbox or email).

## 4. Verification so far
- Offline tests: triggers, diff parsing, citation validation, every recommendation rule, prompt escaping, report shape.
- Live: 0G call (request ID and billing verified); one real review of octocat/Hello-World PR #1 in a throwaway database (1 criterion supported with valid citation, 1 missing, recommendation "Changes requested", reuse on second run).
- Not yet tested in the running app: the chat commands, owner notice, and socket event (need a signed-in session).
