const { createHash } = require("node:crypto");
const Review = require("../../models/Review");
const { criteriaStillCurrent } = require("./criteriaSource");
const { fetchPullRequestHead, reviewRepositoryEnabled, upsertReviewComment } = require("../github");
const { VERDICTS } = require("./validate");

// Keep model/repository text out of Markdown links, HTML and mention syntax.
function plain(value) {
  return String(value || "").replace(/\s+/g, " ")
    .replace(/[&<>@]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "@": "&#64;" })[char])
    .replace(/[\\`*_[\]#]/g, "\\$&");
}

function traceLine(trace) {
  if (!trace?.provider && !trace?.e2ee) return "";
  return ` · provider ${plain(trace.provider || "unknown")} · E2EE ${plain(trace.e2ee || "not reported")}`;
}

const marker = (project) => `<!-- openbounty:evidence:${project.id} -->`;

function commentBody(review) {
  const rows = review.results.map((row) => {
    const cites = row.citations.map((c) => plain(`${c.path} L${c.startLine}–${c.endLine}`)).join(", ");
    return `- **${plain(row.id)} · ${plain(row.status.replaceAll("_", " "))}** ${plain(row.text)}. ${plain(row.explanation)}${cites ? ` Evidence: ${cites}` : ""}`;
  });
  return [
    "## OpenBounty evidence report",
    `**${VERDICTS[review.verdict]}** · CI ${plain(review.ci?.state || "none")}`,
    `Reviewed commit \`${review.headSha}\` · criteria v${review.criteriaVersion} · report \`${review.reportHash}\``,
    `0G request \`${plain(review.requestId)}\` · ${plain(review.model)}${traceLine(review.aiTrace)}`,
    review.linkedIssues?.length && `Linked issues (background only): ${review.linkedIssues.map((issue) => `#${Number(issue.number)}`).join(", ")}`,
    plain(review.summary),
    ...rows,
    review.uncertainty && `Uncertainty: ${plain(review.uncertainty)}`,
    "Advisory review. A maintainer makes the decision.",
  ].filter(Boolean).join("\n\n");
}

async function publishReview(project, review) {
  const repo = project.githubRepository.fullName;
  if (!review.requestId || !process.env.GITHUB_REVIEW_TOKEN?.trim() || !reviewRepositoryEnabled(repo)) {
    review.githubPublication = "disabled";
    await review.save();
    return;
  }
  const body = commentBody(review);
  const contentHash = createHash("sha256").update(body).digest("hex");
  if (review.githubPublication === "published" && review.githubContentHash === contentHash) return;

  try {
    const [head, current] = await Promise.all([
      fetchPullRequestHead(repo, review.prNumber),
      criteriaStillCurrent(project, review),
    ]);
    if (!current || head.headSha !== review.headSha || head.state !== review.prState) {
      review.status = "stale";
      await review.save();
      return;
    }
    const previous = await Review.findOne({
      project: project._id, prNumber: review.prNumber, githubCommentId: { $exists: true },
    }).sort({ updatedAt: -1 }).select("githubCommentId");
    const comment = await upsertReviewComment(repo, review.prNumber,
      marker(project), body, previous?.githubCommentId);
    if (!comment) return;
    review.githubCommentId = comment.id;
    review.githubCommentUrl = comment.html_url;
    review.githubPublication = "published";
    review.githubContentHash = contentHash;
  } catch (error) {
    console.error("GitHub evidence comment failed:", error.code || "github_error", error.message);
    review.githubPublication = "failed";
  }
  await review.save();
}

// Replaces the PR's evidence comment with a visible failure notice when an automatic review of a newer commit fails.
async function publishReviewFailure(project, prNumber, headSha, reason) {
  const repo = project.githubRepository.fullName;
  if (!process.env.GITHUB_REVIEW_TOKEN?.trim() || !reviewRepositoryEnabled(repo)) return;
  const previous = await Review.findOne({ project: project._id, prNumber, githubCommentId: { $exists: true } })
    .sort({ updatedAt: -1 }).select("githubCommentId headSha");
  // Evidence already published for this exact commit stays; only a newer commit gets the failure notice.
  if (previous?.headSha === headSha) return;
  const head = await fetchPullRequestHead(repo, prNumber);
  if (head.headSha !== headSha) return;
  const body = [
    "## OpenBounty evidence report",
    `**Review unavailable** for commit \`${headSha}\`.`,
    plain(reason),
    "Earlier evidence on this PR applies to an older commit and no longer reflects the code.",
    `A project member can retry from OpenBounty's PR reviews screen or run \`/review ${Number(prNumber)}\` in the project chat.`,
    "Advisory review. A maintainer makes the decision.",
  ].join("\n\n");
  await upsertReviewComment(repo, prNumber, marker(project), body, previous?.githubCommentId);
}

module.exports = { publishReview, publishReviewFailure, commentBody };
