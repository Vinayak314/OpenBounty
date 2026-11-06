const Project = require("../../models/Project");
const { upsertReviewComment, reviewRepositoryEnabled } = require("../github");
const { explorerTx } = require("../chain/client");
const { formatUsdt } = require("../chain/encoding");

// Mirrors a bounty's lifecycle onto its GitHub issue as ONE comment per stage (funded, paid, refunded).
// Best effort and advisory: it needs GITHUB_REVIEW_TOKEN and the repository in GITHUB_REVIEW_REPOSITORIES (the same
// opt-in as evidence comments), it never throws, and a failure never affects the escrow or the bounty state.
// The marker makes a replayed event update the existing comment instead of posting a duplicate.
const marker = (bounty, stage) => `<!-- openbounty:bounty:${bounty.chain.bountyId}:${stage} -->`;

function commentFor(bounty, stage, { tx, amount }) {
  const reward = `${formatUsdt(amount ?? bounty.amount)} USDT`;
  const receipt = tx ? ` [Receipt](${explorerTx(tx)})` : "";
  const title = `Bounty #${Number(bounty.number)}`;
  if (stage === "funded") return `## ${title}: funded\n\n**${reward}** is now locked in escrow for this issue. Contributors can request a claim in OpenBounty.${receipt}`;
  if (stage === "paid") return `## ${title}: paid\n\n**${reward}** was released to the contributor after the merged, reviewed pull request.${receipt}`;
  if (stage === "refunded") return `## ${title}: closed\n\nThe **${reward}** reward was returned to the funder. This issue has no active bounty.${receipt}`;
  return "";
}

async function announceOnIssue(bounty, stage, details = {}) {
  try {
    const issueNumber = bounty.issue?.number;
    const body = issueNumber && commentFor(bounty, stage, details);
    if (!body || !process.env.GITHUB_REVIEW_TOKEN?.trim()) return null;
    const project = await Project.findById(bounty.project).select("githubRepository");
    const repo = project?.githubRepository?.fullName;
    if (!repo || !reviewRepositoryEnabled(repo)) return null;
    return await upsertReviewComment(repo, issueNumber, marker(bounty, stage), body);
  } catch (error) {
    console.error("GitHub issue comment failed:", error.code || "github_error", error.message);
    return null;
  }
}

module.exports = { announceOnIssue, commentFor, marker };
