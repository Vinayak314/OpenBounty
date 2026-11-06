const AGENT_UID = "agent:openbounty";

const VERDICT_LABEL = {
  ready_for_approval: "Recommend approval",
  changes_requested: "Changes requested",
  needs_maintainer: "Maintainer review needed",
};
const ASSESSMENT = {
  supported: { label: "Supported", tone: "good" },
  missing: { label: "Missing", tone: "warning" },
  needs_verification: { label: "Needs verification", tone: "neutral" },
};

// Maps a Review document to the shape EvidenceReport renders.
function reportView(review, currentCriteria) {
  const stale = review.status === "stale" || Boolean(currentCriteria && (
    review.criteriaHash !== currentCriteria.hash || review.criteriaVersion !== currentCriteria.version));
  return {
    title: "Evidence report",
    id: review.id,
    prNumber: review.prNumber,
    headSha: review.headSha,
    prState: review.prState,
    criteriaVersion: review.criteriaVersion,
    approval: !stale && review.approval?.at ? { name: review.approval.byName, at: review.approval.at } : null,
    githubCommentUrl: review.githubCommentUrl,
    githubPublication: review.githubPublication,
    status: stale ? "Stale" : VERDICT_LABEL[review.verdict],
    verdict: review.verdict,
    stale,
    subtitle: `PR #${review.prNumber} ${review.prTitle} · commit ${review.headSha.slice(0, 7)}`,
    prUrl: review.prUrl,
    columns: ["Criterion", "Assessment", "Evidence"],
    rows: review.results.map((row) => ({
      id: row.id,
      criterion: row.text,
      assessment: ASSESSMENT[row.status] || ASSESSMENT.needs_verification,
      evidence: [
        row.explanation,
        ...row.citations.map((c) => `${c.path} L${c.startLine}${c.endLine !== c.startLine ? `–${c.endLine}` : ""}`),
      ].filter(Boolean),
    })),
    summary: review.summary,
    reasons: review.verdictReasons,
    risks: review.risks,
    uncertainty: review.uncertainty,
    ci: { state: review.ci?.state || "none", runs: (review.ci?.runs || []).slice(0, 8).map((r) => ({ name: r.name, conclusion: r.conclusion || r.status, url: r.url })) },
    next: stale ? "The commit, criteria or report changed. Run a fresh review before approval." : review.verdictReasons.join(" "),
    policy: "AI advises, maintainer approves",
    requestId: review.requestId ? `0G request ID: ${review.requestId}` : "",
    rawRequestId: review.requestId || "",
    model: review.model,
    // What the 0G router reported about the run. Traceability, not proof that the assessment is correct.
    trace: review.requestId ? {
      provider: review.aiTrace?.provider || "",
      e2ee: review.aiTrace?.e2ee || "",
      trustMode: review.aiTrace?.trustMode || "",
      tokens: (review.aiTrace?.promptTokens || 0) + (review.aiTrace?.completionTokens || 0),
    } : null,
    linkedIssues: (review.linkedIssues || []).map((issue) => ({ number: issue.number, title: issue.title, url: issue.url })),
    reviewedAt: review.createdAt || null,
    reportHash: review.reportHash || "",
  };
}

function messageResponse(message, firebaseUid) {
  const isAgent = message.authorUid === AGENT_UID;
  const authorName = isAgent ? "Bounty agent" : (message.authorName || "GitHub user");
  const initials = isAgent ? "AI" : authorName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "GH";
  const mine = !isAgent && Boolean(firebaseUid) && message.authorUid === firebaseUid;
  return {
    id: message.id,
    clientMessageId: message.clientMessageId,
    authorUid: message.authorUid,
    type: message.review?.verdict ? "report" : "message",
    report: message.review?.verdict ? reportView(message.review) : undefined,
    author: { name: authorName, initials, color: "orange", photoURL: isAgent ? "" : message.authorPhoto, agent: isAgent },
    me: mine,
    status: mine ? "sent" : undefined,
    time: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    variant: mine ? "outlined" : "filled",
    body: message.body,
    attachments: message.attachments,
    replyTo: message.replyTo?.id ? message.replyTo : null,
    edited: message.edited,
    // Traceability metadata only; a request ID is not proof the answer is correct.
    ai: isAgent && message.agent ? {
      role: message.agent.role,
      status: message.agent.status,
      requestId: message.agent.requestId || "",
      model: message.agent.model || "",
      contextHash: message.agent.contextHash || "",
      repoSha: message.agent.repoSha || "",
      repoFiles: message.agent.repoFiles || [],
      provider: message.agent.provider || "",
      e2ee: message.agent.e2ee || "",
    } : null,
    reactions: Object.fromEntries((message.reactions || []).map((reaction) => [reaction.emoji, {
      count: reaction.users.length,
      mine: firebaseUid ? reaction.users.includes(firebaseUid) : false,
    }])),
  };
}

module.exports = { AGENT_UID, messageResponse, reportView };
