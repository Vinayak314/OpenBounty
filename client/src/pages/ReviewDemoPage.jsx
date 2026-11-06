import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EvidenceReport from "@/components/project/EvidenceReport";
import { apiRequest } from "@/lib/api";

export default function ReviewDemoPage() {
  const [demo, setDemo] = useState(null);
  const [reports, setReports] = useState({});
  const [running, setRunning] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/demo/0g", { publicRequest: true, signal: controller.signal })
      .then(setDemo)
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);

  async function run(revision) {
    setRunning(revision);
    setError("");
    try {
      const { report } = await apiRequest("/demo/0g", {
        publicRequest: true, method: "POST", body: { revision },
      });
      setReports((current) => ({ ...current, [revision]: report }));
    } catch (error) {
      setError(error.message);
    } finally {
      setRunning("");
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] p-6 text-ob-navy sm:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link to="/" className="text-sm font-semibold underline underline-offset-4">OpenBounty home</Link>
        <h1 className="font-serif text-4xl">Review a pull request with 0G</h1>
        <p className="max-w-2xl text-sm text-ob-slate">
          Try two sample revisions of a form submission handler. Each run sends the selected diff to 0G Private Computer and displays its evidence and request ID.
        </p>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!demo && !error && <p role="status" className="text-sm">Loading sample pull request…</p>}
        {demo && (
          <>
            <section className="rounded-xl border border-ob-line bg-white p-4">
              <h2 className="font-semibold">Acceptance criteria</h2>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-ob-slate">
                {demo.criteria.map((criterion) => <li key={criterion.id}>{criterion.text}</li>)}
              </ol>
            </section>
            {!demo.enabled && <p role="status" className="text-sm text-ob-slate">Live reviews are currently unavailable. You can still inspect the sample diffs.</p>}
            {demo.revisions.map(({ id, title, patch }) => (
              <section key={id} className="space-y-3 rounded-xl border border-ob-line bg-white p-4" aria-label={title}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-serif text-2xl">{title}</h2>
                  <button type="button" disabled={!demo.enabled || Boolean(running)} onClick={() => run(id)}
                    className="rounded-lg bg-ob-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {running === id ? "Reviewing with 0G…" : `Review ${title.toLowerCase()}`}
                  </button>
                </div>
                <pre className="overflow-auto rounded-lg bg-ob-mist p-3 text-xs leading-5"><code>{patch}</code></pre>
                {running === id && <p role="status" className="text-sm text-ob-slate">Waiting for a live 0G response…</p>}
                {reports[id] && <EvidenceReport report={reports[id]} />}
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
