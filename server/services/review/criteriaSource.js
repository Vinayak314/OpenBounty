const Bounty = require("../../models/Bounty");
const Project = require("../../models/Project");

// A PR registered as a bounty submission is reviewed against that bounty's funded criteria (the hash locked in
// escrow). Any other PR is reviewed against the project's approved criteria.
const BOUNTY_REVIEW_STATUSES = ["claimed", "submitted", "paid"];
const BOUNTY_CRITERIA_VERSION = 1; // bounty criteria are immutable once funded

async function bountyForPr(project, prNumber) {
  return Bounty.findOne({ project: project._id, "submission.prNumber": prNumber, status: { $in: BOUNTY_REVIEW_STATUSES } })
    .sort({ updatedAt: -1 });
}

async function criteriaForPr(project, prNumber) {
  const bounty = await bountyForPr(project, prNumber);
  if (bounty) {
    return {
      items: bounty.criteria.items.map((c) => ({ id: c.id, text: c.text })),
      hash: bounty.criteria.hash, version: BOUNTY_CRITERIA_VERSION, bounty,
    };
  }
  return {
    items: project.criteria?.items?.map((c) => ({ id: c.id, text: c.text })) || [],
    hash: project.criteria?.hash || "", version: project.criteria?.version || 0, bounty: null,
  };
}

/** The criteria a stored review must still match to count as current, or null if its source is gone. */
async function currentCriteriaFor(project, review) {
  if (review.bounty) {
    const bounty = await Bounty.findById(review.bounty).select("criteria.hash status");
    if (!bounty || !BOUNTY_REVIEW_STATUSES.includes(bounty.status)) return null;
    return { hash: bounty.criteria.hash, version: BOUNTY_CRITERIA_VERSION };
  }
  const current = await Project.findById(project._id).select("criteria.hash criteria.version status githubRepository.fullName");
  if (!current || current.status !== "active") return null;
  return { hash: current.criteria?.hash || "", version: current.criteria?.version || 0 };
}

async function criteriaStillCurrent(project, review) {
  const current = await currentCriteriaFor(project, review);
  return Boolean(current && current.hash === review.criteriaHash && current.version === review.criteriaVersion);
}

/** Map of reviewId -> criteria to judge staleness for a list of reviews (one query for bounty reviews). */
async function criteriaMapFor(project, reviews) {
  const ids = [...new Set(reviews.filter((r) => r.bounty).map((r) => String(r.bounty)))];
  const bounties = ids.length ? await Bounty.find({ _id: { $in: ids } }).select("criteria.hash status").lean() : [];
  const byId = new Map(bounties.map((b) => [String(b._id), b]));
  return (review) => {
    if (!review.bounty) return project.criteria;
    const bounty = byId.get(String(review.bounty));
    return bounty && BOUNTY_REVIEW_STATUSES.includes(bounty.status)
      ? { hash: bounty.criteria.hash, version: BOUNTY_CRITERIA_VERSION } : { hash: "", version: -1 };
  };
}

async function hasReviewCriteria(project, prNumber) {
  return Boolean(project.criteria?.items?.length) || Boolean(await bountyForPr(project, prNumber));
}

module.exports = { criteriaForPr, currentCriteriaFor, criteriaStillCurrent, criteriaMapFor, hasReviewCriteria, bountyForPr, BOUNTY_CRITERIA_VERSION };
