const Project = require("../models/Project");
require("../models/User");
require("../models/Group");

async function findProjectAccess(slug, firebaseUid) {
  const project = await Project.findOne({ slug })
    .populate("owner", "firebaseUid displayName photoURL")
    .populate("coOwners", "firebaseUid")
    .populate({ path: "group", populate: [
      { path: "owner", select: "firebaseUid" },
      { path: "members.user", select: "firebaseUid" },
    ] });
  if (!project) return { project: null, allowed: false };

  const isOwner = project.owner?.firebaseUid === firebaseUid;
  const isCoOwner = project.coOwners.some((user) => user.firebaseUid === firebaseUid);
  const isGroupOwner = project.group?.owner?.firebaseUid === firebaseUid;
  const isGroupMember = project.group?.members.some((member) => member.user?.firebaseUid === firebaseUid);
  return { project, allowed: Boolean(isOwner || isCoOwner || isGroupOwner || isGroupMember) };
}

module.exports = { findProjectAccess };
