const Project = require("../models/Project");
require("../models/User");
require("../models/Group");

function isProjectMaintainer(project, firebaseUid) {
  return project.owner?.firebaseUid === firebaseUid || project.coOwners?.some((user) => user?.firebaseUid === firebaseUid);
}

async function findProjectAccess(slug, firebaseUid) {
  const project = await Project.findOne({ slug })
    .populate("owner", "firebaseUid displayName photoURL")
    .populate("coOwners", "firebaseUid")
    .populate({ path: "group", populate: [
      { path: "owner", select: "firebaseUid" },
      { path: "members.user", select: "firebaseUid" },
    ] });
  if (!project) return { project: null, allowed: false };

  const maintainsProject = isProjectMaintainer(project, firebaseUid);
  const isGroupOwner = project.group?.owner?.firebaseUid === firebaseUid;
  const isGroupMember = project.group?.members.some((member) => member.user?.firebaseUid === firebaseUid);
  const isGroupAdmin = project.group?.members.some((member) =>
    member.user?.firebaseUid === firebaseUid && ["owner", "admin"].includes(member.role));
  // Project-scoped groups use the project ID. Shared groups have their own admins.
  const projectScoped = !project.group || project.group.id === project.id;
  return {
    project,
    allowed: Boolean(maintainsProject || isGroupOwner || isGroupMember),
    canManageGroup: Boolean(isGroupOwner || isGroupAdmin || (projectScoped && maintainsProject)),
  };
}

module.exports = { findProjectAccess, isProjectMaintainer };
