# OpenBounty

OpenBounty gives open-source teams a workspace for agreeing on acceptance criteria, asking questions about their repository, and reviewing pull requests against evidence. Maintainers make the final decision.

## Run locally

Use Node.js 22 or newer, MongoDB, the project's Firebase Authentication setup with GitHub sign-in, and a 0G Private Computer API key.

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

Open the Vite URL, sign in with GitHub and add a public repository you control. For a hosted client, set `VITE_API_URL` to the API origin, add the client origin to `CLIENT_ORIGINS` and Firebase authorized domains, and route Socket.IO to the backend.

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

## Architecture and scope

The React workspace uses Firebase sign-in, an Express and Socket.IO API, and MongoDB. The server verifies webhook signatures, fetches GitHub data, calls 0G Private Computer and records the report. Local review jobs run in a single process and record their status in MongoDB. If the worker stops before finishing, retry from **PR reviews**, use `/review`, or redeliver the GitHub event. A separate Solidity escrow lives in [contracts](contracts/README.md). The review approval records a decision in OpenBounty. The escrow has its own settlement flow.

The 0G integration is the project guide, scope assistant and advisory reviewer. Human maintainers approve criteria and contributions. The source uses a public-repository allowlist for GitHub comment publishing.

References: [0G track requirements](https://ethglobal.com/events/mumbai/prizes#0g), [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), and [GitHub comments API](https://docs.github.com/en/rest/issues/comments).
