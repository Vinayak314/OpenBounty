import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Github, Sparkles } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import AppSidebar from "@/components/layout/AppSidebar";
import { iconProps } from "@/components/layout/icon";
import AddProjectCard from "@/components/dashboard/AddProjectCard";
import ProjectCard from "@/components/dashboard/ProjectCard";
import SummaryCard from "@/components/dashboard/SummaryCard";
import RepoPickerModal from "@/components/dashboard/RepoPickerModal";
import {
  dashboardAddProject,
  dashboardGreeting,
  dashboardNextReview,
  dashboardProjectsHeader,
  dashboardStats,
  roleFilters,
} from "@/data/dashboard";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest } from "@/lib/api";

export default function DashboardPage() {
  const { name, initials } = useAuth();
  const [projects, setProjects] = useState([]);
  const [repos, setRepos] = useState([]);
  const [role, setRole] = useState(roleFilters[0]);
  const [picker, setPicker] = useState(false);
  const [toast, setToast] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [pageError, setPageError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const closePicker = useCallback(() => setPicker(false), []);

  const loadProjects = useCallback(() => apiRequest("/me/projects")
    .then((result) => {
      setPendingRequests(result.pendingJoinRequests ?? []);
      setProjects(result.projects.map((p) => ({
        id: p.id, slug: p.slug, name: p.name, repo: p.repository.fullName, description: p.description,
        role: p.role, icon: "sprout", openBounties: 0,
        updatedLabel: `Updated ${new Date(p.updatedAt).toLocaleDateString()}`,
        memberCount: 1, members: [{ initials, tone: "orange" }], workspaceHref: `/project/${encodeURIComponent(p.slug)}`,
      })));
      setPageError("");
    })
    .catch((error) => setPageError(error.message)), [initials]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const hasPendingRequests = pendingRequests.length > 0;
  useEffect(() => {
    if (!hasPendingRequests) return;
    const timer = setInterval(loadProjects, 10000);
    return () => clearInterval(timer);
  }, [hasPendingRequests, loadProjects]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const addedIds = useMemo(() => new Set(projects.map((p) => p.repo.toLowerCase())), [projects]);
  const shown = role === roleFilters[0] ? projects : projects.filter((p) => p.role === role);

  const openRepoPicker = async () => {
    setPicker(true);
    setPickerLoading(true);
    setPickerError("");
    try {
      const result = await apiRequest("/me/github/repositories");
      setRepos(result.repositories);
    } catch (error) {
      setPickerError(error.message);
    } finally {
      setPickerLoading(false);
    }
  };

  const addRepo = async (repo) => {
    try {
      await apiRequest("/me/projects", { method: "POST", body: { fullName: repo.fullName } });
      await loadProjects();
      setRole(roleFilters[0]);
      setPicker(false);
      setToast(`${repo.name} added to your projects`);
    } catch (error) {
      setPickerError(error.message);
    }
  };

  const requestToJoin = async (event) => {
    event.preventDefault();
    if (joining) return;
    setJoining(true);
    setJoinFeedback(null);
    try {
      const result = await apiRequest("/groups/join", { method: "POST", body: { code: joinCode } });
      setJoinFeedback({ message: result.status === "member"
        ? `You already have access to ${result.group}.`
        : `Request sent to ${result.group}.` });
      setJoinCode("");
      await loadProjects();
    } catch (error) {
      setJoinFeedback({ error: true, message: error.message });
    } finally {
      setJoining(false);
    }
  };

  const rows = [];
  for (let i = 0; i < shown.length; i += 2) {
    rows.push(shown.slice(i, i + 2));
  }
  if (rows.length === 0) rows.push([]);
  const lastRow = rows[rows.length - 1];
  const addProjectInLastRow = lastRow.length < 2;
  if (!addProjectInLastRow) rows.push([]);

  return (
    <div className="flex min-h-screen bg-white font-sans text-ob-navy">
      <AppSidebar active="dashboard" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader crumbs={["Workspace", "Dashboard"]} />
        <main className="flex flex-col gap-6 px-9 py-8">
          <section className="flex items-center justify-between py-2">
            <div className="flex flex-col gap-[10px] whitespace-nowrap leading-[normal]">
              <p className="text-[10px] font-semibold tracking-[1.7px] text-ob-slate">
                {dashboardGreeting.eyebrow}
              </p>
              <h1 className="font-serif text-[36px] font-normal tracking-[-1px] text-ob-navy">
                Good to see you, {name}.
              </h1>
              <p className="text-[13px] text-ob-slate">{dashboardGreeting.subline}</p>
            </div>
            <button
              type="button"
              onClick={openRepoPicker}
              className="group flex h-11 items-center justify-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-ob-navy transition-all duration-200 hover:-translate-y-0.5 hover:border-ob-navy/40 hover:bg-ob-mist/50 hover:shadow-md active:translate-y-0 active:scale-95"
            >
              <Github {...iconProps} size={18} />
              {dashboardGreeting.action.label}
            </button>
          </section>

          <section aria-labelledby="join-group" className="rounded-xl border border-ob-line p-4">
            <h2 id="join-group" className="text-sm font-semibold">Join a group</h2>
            <p className="mt-1 text-xs text-ob-slate">Enter the code shared by a maintainer. You’ll get access once your request is approved.</p>
            <form onSubmit={requestToJoin} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium">
                Group code
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                  autoComplete="off" spellCheck={false} placeholder="ABC234"
                  className="w-36 rounded-lg border border-ob-line px-3 py-2 font-mono text-sm tracking-widest" />
              </label>
              <button type="submit" disabled={joinCode.length !== 6 || joining}
                className="rounded-lg bg-ob-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {joining ? "Sending…" : "Request to join"}
              </button>
            </form>
            {joinFeedback && <p role={joinFeedback.error ? "alert" : "status"} className={`mt-2 text-xs ${joinFeedback.error ? "text-rose-700" : "text-ob-slate"}`}>{joinFeedback.message}</p>}
            {hasPendingRequests && <ul aria-label="Pending group requests" className="mt-3 space-y-1 text-xs text-ob-slate">
              {pendingRequests.map((group) => <li key={group.id}>{group.name} · Pending approval</li>)}
            </ul>}
          </section>

          <section className="flex gap-4 py-2" aria-label="Summary">
            {dashboardStats.map((stat, i) => (
              <div key={stat.id} className="flex min-w-0 flex-1 animate-[rise_.4s_ease-out_both]" style={{ animationDelay: `${i * 80}ms` }}>
                <SummaryCard stat={{ ...stat, ...(stat.id === "projects" ? { value: String(projects.length) } : {}) }} />
              </div>
            ))}
          </section>

          <div id="projects" className="flex scroll-mt-6 items-center justify-between py-2">
            <div className="flex items-center gap-[22px]">
              <p className="whitespace-pre text-base font-semibold leading-[normal] text-[#153f34]">
                {dashboardProjectsHeader.title}
                {"  "}
                <span className="text-[#779d79]">{shown.length}</span>
              </p>
              <div className="flex items-center gap-1" role="tablist" aria-label="Filter by role">
                {roleFilters.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={role === r}
                    onClick={() => setRole(r)}
                    className={`rounded-full px-3 py-1 text-xs leading-[normal] transition-all duration-150 active:scale-95 ${
                      role === r ? "bg-ob-navy font-semibold text-white" : "text-ob-slate hover:bg-ob-mist hover:text-ob-navy"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={openRepoPicker}
              className="group flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white p-2 text-xs text-ob-navy transition-all duration-200 hover:-translate-y-0.5 hover:border-ob-navy/40 hover:bg-ob-mist/50 hover:shadow-md active:translate-y-0 active:scale-95"
            >
              <Github {...iconProps} size={16} />
              {dashboardProjectsHeader.repoPickerLabel}
              <ChevronDown {...iconProps} size={14} className="transition-transform duration-200 group-hover:translate-y-0.5" />
            </button>
          </div>

          <section className="flex flex-col gap-4" aria-label="Projects">
            {pageError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{pageError}</p>}
            {!pageError && projects.length === 0 && <p className="rounded-xl border border-dashed border-[#d1d5db] px-5 py-8 text-center text-sm text-ob-slate">Add a GitHub repository to start a project or request to join a group.</p>}
            {rows.map((row, rowIndex) => {
              const isLast = rowIndex === rows.length - 1;
              return (
                <div key={rowIndex} className="flex gap-4">
                  {row.map((project) => (
                    <div key={project.id} className="flex min-w-0 flex-1 animate-[rise_.35s_ease-out_both]">
                      <ProjectCard project={project} />
                    </div>
                  ))}
                  {isLast && <AddProjectCard content={dashboardAddProject} onClick={openRepoPicker} />}
                </div>
              );
            })}
          </section>

          <Link
            to={dashboardNextReview.href}
            className="group flex items-center gap-[10px] rounded-lg px-3 py-3 text-xs leading-[normal] outline-none transition-colors duration-200 hover:bg-ob-mist/60 focus-visible:ring-2 focus-visible:ring-ob-navy/40"
          >
            <Sparkles {...iconProps} size={17} className="shrink-0 text-ob-navy transition-transform duration-300 group-hover:rotate-12 group-hover:scale-125" />
            <p className="text-[#6b7280]">
              {dashboardNextReview.prefix}{" "}
              <span className="font-semibold text-ob-navy">{dashboardNextReview.target}</span>
            </p>
            <span className="font-semibold text-ob-navy group-hover:underline">{dashboardNextReview.actionLabel}</span>
          </Link>
        </main>
        <RepoPickerModal open={picker} repos={repos} addedIds={addedIds} onPick={addRepo} onClose={closePicker} loading={pickerLoading} error={pickerError} />
        {toast && (
          <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-[rise_.25s_ease-out] items-center gap-2 rounded-full bg-ob-navy px-4 py-2 text-xs font-semibold text-white shadow-lg">
            <Check {...iconProps} size={14} /> {toast}
          </div>
        )}
      </div>
    </div>
  );
}
