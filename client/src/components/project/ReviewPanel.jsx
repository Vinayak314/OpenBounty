import { useEffect, useState } from "react";
import EvidenceReport from "@/components/project/EvidenceReport";
import { apiRequest } from "@/lib/api";

export default function ReviewPanel({ slug }) {
  const [reviews, setReviews] = useState([]);
  const [selectedPr, setSelectedPr] = useState(null);
  const [canApprove, setCanApprove] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [canRequest, setCanRequest] = useState(false);
  const [requestPr, setRequestPr] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestNotice, setRequestNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const path = `/projects/${encodeURIComponent(slug)}/reviews`;
  const selected = reviews.find((review) => review.prNumber === selectedPr) || reviews[0];

  useEffect(() => {
    if (approving) return;
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const result = await apiRequest(path, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setReviews(result.reviews);
        setCanApprove(result.canApprove);
        setJobs(result.jobs || []);
        setCanRequest(Boolean(result.canRequest));
        setLoadError("");
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, 5000);
        }
      }
    }
    refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, approving]);

  async function requestReview(prNumber, force = false) {
    setRequesting(true);
    setRequestNotice("");
    try {
      await apiRequest(`/projects/${encodeURIComponent(slug)}/pulls/${prNumber}/review`, { method: "POST", body: { force } });
      setRequestNotice(`Review of PR #${prNumber} queued on 0G. Results appear here and in chat.`);
      setJobs((current) => [{ prNumber, status: "queued", source: "retry" }, ...current.filter((job) => job.prNumber !== prNumber)]);
    } catch (error) {
      setRequestNotice(error.message);
    } finally {
      setRequesting(false);
    }
  }

  const jobFor = (prNumber) => jobs.find((job) => job.prNumber === prNumber);
  const orphanJobs = jobs.filter((job) => !reviews.some((review) => review.prNumber === job.prNumber)
    && ["queued", "running", "failed"].includes(job.status));
  const selectedJob = selected && jobFor(selected.prNumber);

  async function approve() {
    setApproving(true);
    setApprovalError("");
    try {
      const { review } = await apiRequest(`${path}/${selected.id}/approve`, {
        method: "POST", body: { reportHash: selected.reportHash },
      });
      setReviews((current) => current.map((item) => item.id === review.id ? review : item));
    } catch (error) {
      setApprovalError(error.message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-6" aria-label="Pull request reviews">
      <h2 className="font-serif text-2xl">Pull request reviews</h2>
      <p className="my-2 text-xs text-ob-slate">Compare the 0G evidence with the PR before recording your approval.</p>
      {loading && <p role="status" className="text-sm text-ob-slate">Loading reviews…</p>}
      {canRequest && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (requestPr) requestReview(Number(requestPr));
        }}>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Review a pull request
            <input value={requestPr} onChange={(event) => setRequestPr(event.target.value.replace(/\D/g, "").slice(0, 7))}
              inputMode="numeric" placeholder="PR number" className="w-32 rounded-lg border border-ob-line bg-white p-2 font-normal" />
          </label>
          <button type="submit" disabled={requesting || !requestPr} className="rounded-lg border border-ob-line bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
            {requesting ? "Queuing…" : "Run 0G review"}
          </button>
        </form>
      )}
      {requestNotice && <p role="status" className="mt-2 text-xs text-ob-slate">{requestNotice}</p>}
      {orphanJobs.map((job) => <JobBanner key={job.prNumber} job={job} onRetry={canRequest ? () => requestReview(job.prNumber) : null} busy={requesting} />)}
      {loadError && <p role="alert" className="my-2 text-sm text-rose-700">{loadError}</p>}
      {!loading && !loadError && !selected && (
        <p className="my-4 text-sm text-ob-slate">No evidence yet. Approve criteria and open a PR, or use <code>/review 12</code> in chat with your PR number.</p>
      )}
      {selected && (
        <div className="mt-4 space-y-4">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Pull request
            <select value={selected.prNumber} disabled={approving} onChange={(event) => {
              setSelectedPr(Number(event.target.value));
              setApprovalError("");
            }} className="rounded-lg border border-ob-line bg-white p-2 font-normal">
              {reviews.map((review) => <option key={review.prNumber} value={review.prNumber}>{review.subtitle}</option>)}
            </select>
          </label>
          {selectedJob && selectedJob.status !== "complete" && (selectedJob.status !== "skipped")
            && <JobBanner job={selectedJob} onRetry={canRequest ? () => requestReview(selected.prNumber) : null} busy={requesting} />}
          <EvidenceReport report={selected} />
          {canRequest && (
            <div className="flex flex-wrap gap-2">
              {/* Refreshing re-reads the PR and CI without a new inference when the commit and criteria are unchanged. */}
              <button type="button" disabled={requesting} onClick={() => requestReview(selected.prNumber, false)}
                className="rounded-lg border border-ob-line bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
                {selected.stale ? "Review the current commit" : "Refresh PR and CI status"}
              </button>
              {!selected.stale && (
                <button type="button" disabled={requesting} onClick={() => requestReview(selected.prNumber, true)}
                  className="rounded-lg border border-ob-line bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Run a fresh 0G review
                </button>
              )}
            </div>
          )}
          {selected.githubPublication === "published" && selected.githubCommentUrl && (
            <a className="text-xs font-semibold text-sky-700 underline" href={selected.githubCommentUrl} target="_blank" rel="noreferrer">View the GitHub evidence comment</a>
          )}
          {selected.githubPublication === "failed" && <p className="text-xs text-amber-800">GitHub comment could not be published. Run the review again to retry.</p>}
          {selected.approval ? (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Approved by {selected.approval.name} for commit <code>{selected.headSha.slice(0, 7)}</code>.
            </p>
          ) : canApprove && (
            <div className="space-y-2">
              <button type="button" disabled={approving || selected.stale || !selected.requestId || selected.prState !== "merged"}
                onClick={approve} className="rounded-lg bg-ob-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {approving ? "Checking GitHub…" : "Approve reviewed contribution"}
              </button>
              <p className="text-xs text-ob-slate">{selected.stale ? "Run a fresh review for the current commit and criteria."
                : selected.prState !== "merged" ? "Merge the PR on GitHub and let its review refresh before approving."
                  : "Approval records your decision for this evidence and commit."}</p>
              {approvalError && <p role="alert" className="text-xs text-rose-700">{approvalError}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const JOB_COPY = {
  queued: "Review queued",
  running: "0G review in progress",
  failed: "Review could not finish",
};

const SOURCE_LABELS = { webhook: "a GitHub event", ci: "a CI update", panel: "this screen", chat: "chat", retry: "a retry" };

function JobBanner({ job, onRetry, busy }) {
  const failed = job.status === "failed";
  // The server flags queued/running jobs that stopped moving (for example after a restart) so they can be retried.
  const stuck = Boolean(job.stuck);
  return (
    <div role={failed ? "alert" : "status"} className={`mt-3 rounded-lg p-3 text-xs ${failed ? "bg-rose-50 text-rose-800" : "bg-sky-50 text-sky-900"}`}>
      <p className="font-semibold">
        PR #{job.prNumber}: {JOB_COPY[job.status] || job.status}
        {job.headSha && <> · commit <code>{job.headSha.slice(0, 7)}</code></>}
        {job.source && <> · from {SOURCE_LABELS[job.source] || job.source}</>}
      </p>
      {failed && job.error && <p className="mt-1">{job.error}</p>}
      {stuck && <p className="mt-1">This looks stuck. You can retry it.</p>}
      {(failed || stuck) && onRetry && (
        <button type="button" onClick={onRetry} disabled={busy} className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
          Retry review
        </button>
      )}
    </div>
  );
}
