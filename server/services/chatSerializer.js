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
function reportView(review) {
  const stale = review.status === "stale";
  return {
    title: "Evidence report",
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
    next: stale ? "A newer commit was pushed. This report no longer reflects the PR; run /review again." : review.verdictReasons.join(" "),
    policy: "AI advises, maintainer approves",
    requestId: review.requestId ? `0G request ID: ${review.requestId}` : "",
    model: review.model,
    reportHash: review.reportHash ? review.reportHash.slice(0, 12) : "",
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
    } : null,
    reactions: Object.fromEntries((message.reactions || []).map((reaction) => [reaction.emoji, {
      count: reaction.users.length,
      mine: firebaseUid ? reaction.users.includes(firebaseUid) : false,
    }])),
  };
}

module.exports = { AGENT_UID, messageResponse };
