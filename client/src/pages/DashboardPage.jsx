import { Link } from "react-router-dom";
import { ChevronDown, Github, Sparkles } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import AppSidebar from "@/components/layout/AppSidebar";
import { iconProps } from "@/components/layout/icon";
import AddProjectCard from "@/components/dashboard/AddProjectCard";
import ProjectCard from "@/components/dashboard/ProjectCard";
import SummaryCard from "@/components/dashboard/SummaryCard";
import {
  dashboardAddProject,
  dashboardGreeting,
  dashboardNextReview,
  dashboardProjects,
  dashboardProjectsHeader,
  dashboardStats,
} from "@/data/dashboard";

// Static design: every list/value below comes from src/data/dashboard.js.
export default function DashboardPage() {
  const rows = [];
  for (let i = 0; i < dashboardProjects.length; i += 2) {
    rows.push(dashboardProjects.slice(i, i + 2));
  }
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
                {dashboardGreeting.headline}
              </h1>
              <p className="text-[13px] text-ob-slate">{dashboardGreeting.subline}</p>
            </div>
            <button
              type="button"
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-ob-navy hover:bg-ob-mist/50"
            >
              <Github {...iconProps} size={18} />
              {dashboardGreeting.action.label}
            </button>
          </section>

          <section className="flex gap-4 py-2" aria-label="Summary">
            {dashboardStats.map((stat) => (
              <SummaryCard key={stat.id} stat={stat} />
            ))}
          </section>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-[22px]">
              <p className="whitespace-pre text-base font-semibold leading-[normal] text-[#153f34]">
                {dashboardProjectsHeader.title}
                {"  "}
                <span className="text-[#779d79]">{dashboardProjectsHeader.count}</span>
              </p>
              <span className="text-xs leading-[normal] text-ob-slate">
                {dashboardProjectsHeader.filterLabel}
              </span>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white p-2 text-xs text-ob-navy hover:bg-ob-mist/50"
            >
              <Github {...iconProps} size={16} />
              {dashboardProjectsHeader.repoPickerLabel}
              <ChevronDown {...iconProps} size={14} />
            </button>
          </div>

          <section className="flex flex-col gap-4" aria-label="Projects">
            {rows.map((row, rowIndex) => {
              const isLast = rowIndex === rows.length - 1;
              return (
                <div key={rowIndex} className="flex gap-4">
                  {row.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                  {isLast && <AddProjectCard content={dashboardAddProject} />}
                </div>
              );
            })}
          </section>

          <div className="flex items-center gap-[10px] py-2 text-xs leading-[normal]">
            <Sparkles {...iconProps} size={17} className="shrink-0 text-ob-navy" />
            <p className="text-[#6b7280]">
              {dashboardNextReview.prefix}{" "}
              <span className="font-semibold text-ob-navy">{dashboardNextReview.target}</span>
            </p>
            <Link to={dashboardNextReview.href} className="font-semibold text-ob-navy hover:underline">
              {dashboardNextReview.actionLabel}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
