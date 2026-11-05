import { Link } from "react-router-dom";
import { BookOpen, CircleDollarSign, Sprout, Waves } from "lucide-react";
import InitialsAvatar from "@/components/layout/InitialsAvatar";
import { iconProps } from "@/components/layout/icon";

const ICONS = { sprout: Sprout, "book-open": BookOpen, waves: Waves };

/** A project the user belongs to. `project` matches dashboardProjects[] in src/data/dashboard.js. */
export default function ProjectCard({ project }) {
  const Icon = ICONS[project.icon];
  const bountyLabel = `${project.openBounties} open ${project.openBounties === 1 ? "bounty" : "bounties"}`;

  return (
    <article className="flex min-h-[248px] min-w-0 flex-1 flex-col gap-4 rounded-xl border border-[#e5e7eb] bg-white p-5">
      <div className="flex items-center gap-[14px]">
        <span className="flex size-[43px] shrink-0 items-center justify-center rounded-[14px] bg-ob-mist">
          <Icon {...iconProps} size={24} className="text-ob-navy" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[5px] whitespace-nowrap leading-[normal]">
          <h3 className="font-serif text-[25px] font-normal text-ob-navy">{project.name}</h3>
          <span className="text-[11px] text-ob-slate">{project.repo}</span>
        </div>
        <span className="rounded-full bg-ob-mist px-[9px] py-[5px] text-[10px] font-semibold leading-[normal] text-ob-navy">
          {project.role}
        </span>
      </div>

      <p className="text-[13px] leading-[1.6] text-ob-slate">{project.description}</p>

      <div className="flex items-center gap-[7px] leading-[normal]">
        <CircleDollarSign {...iconProps} size={16} className="text-ob-navy" />
        <span className="text-xs font-semibold text-ob-navy">{bountyLabel}</span>
        <span className="text-[11px] text-ob-slate">· {project.updatedLabel}</span>
      </div>

      <div className="h-px w-full bg-ob-line" />

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex">
            {project.members.map((member, index) => (
              <InitialsAvatar
                key={`${member.initials}-${index}`}
                initials={member.initials}
                tone={member.tone}
                className={`size-[26px] text-[8.32px] ${index < project.members.length - 1 ? "-mr-[5px]" : ""}`}
              />
            ))}
          </div>
          <span className="ml-2 text-[10px] leading-[normal] text-ob-slate">
            {project.memberCount} members
          </span>
        </div>
        <Link
          to={project.workspaceHref}
          className="text-xs font-semibold leading-[normal] text-ob-navy hover:underline"
        >
          Open workspace →
        </Link>
      </div>
    </article>
  );
}
