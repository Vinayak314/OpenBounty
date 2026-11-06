const { getAddress, Interface } = require("ethers");
const User = require("../../models/User");
const { chain, requirePayments, explorerAddress } = require("../chain/client");
const { ESCROW_ABI } = require("../chain/abi");
const { publicChainConfig } = require("../../config/chain");
const { createExecuteIntent, passkeyOf, accountSummary } = require("../chain/wallet");
const sponsor = require("../chain/sponsor");
const { BountyError } = require("./service");

const escrowIface = new Interface(ESCROW_ABI);
const lower = (value) => (value ? String(value).toLowerCase() : "");

function members(project) {
  return [
    project.owner && { uid: project.owner.firebaseUid, name: project.owner.displayName || "Owner", role: "owner" },
    ...(project.coOwners || []).map((user) => ({ uid: user.firebaseUid, name: user.displayName || "Co-owner", role: "co-owner" })),
  ].filter((member) => member?.uid);
}

/** Payment setup for a project: chain config, sponsor health, escrow ownership and each maintainer's on-chain roles. */
async function paymentsOverview(project, uid) {
  const c = chain();
  const viewer = await User.findOne({ firebaseUid: uid });
  const overview = { config: publicChainConfig(c.config), account: null, sponsor: null, escrow: null, members: [] };
  overview.account = viewer ? await accountSummary(viewer).catch(() => null) : null;
  if (!c.config.enabled) return overview;
  const [owner, pendingOwner, attestationSigner, sponsorStatus] = await Promise.all([
    c.escrow.owner(), c.escrow.pendingOwner(), c.escrow.attestationSigner(), sponsor.status({ detailed: project.owner?.firebaseUid === uid }).catch(() => ({ configured: false })),
  ]);
  overview.sponsor = sponsorStatus;
  const people = members(project);
  const users = await User.find({ firebaseUid: { $in: people.map((m) => m.uid) } }).select("firebaseUid wallet.address wallet.kind");
  const byUid = new Map(users.map((user) => [user.firebaseUid, user]));
  overview.members = await Promise.all(people.map(async (member) => {
    const account = byUid.get(member.uid)?.wallet?.kind === "passkey" ? byUid.get(member.uid).wallet.address : "";
    if (!account) return { ...member, account: "", maintainer: false, settlement: false };
    const [maintainer, settlement] = await Promise.all([c.escrow.isMaintainer(account), c.escrow.isSettlementWallet(account)]);
    return { ...member, account: getAddress(account), isEscrowOwner: lower(account) === lower(owner), maintainer, settlement };
  }));
  const viewerAccount = lower(overview.account?.address);
  const isProjectOwner = project.owner?.firebaseUid === uid;
  overview.escrow = {
    address: c.config.escrow, url: explorerAddress(c.config.escrow), owner, pendingOwner, attestationSigner,
    viewerIsEscrowOwner: Boolean(viewerAccount) && viewerAccount === lower(owner),
    canManageRoles: isProjectOwner && Boolean(viewerAccount) && viewerAccount === lower(owner),
    canAcceptOwnership: isProjectOwner && Boolean(viewerAccount) && viewerAccount === lower(pendingOwner),
    ownerIsProjectOwner: overview.members.some((m) => m.role === "owner" && lower(m.account) === lower(owner)),
  };
  return overview;
}

async function prepareRoles({ project, uid, targetUid, maintainer, settlement }) {
  const { config, escrow } = requirePayments();
  if (project.owner?.firebaseUid !== uid) throw new BountyError("Only the project owner manages payment permissions.", 403);
  const user = await User.findOne({ firebaseUid: uid });
  const wallet = passkeyOf(user);
  if (lower(await escrow.owner()) !== lower(wallet.address)) {
    throw new BountyError("Your payment account is not the escrow owner. Accept the ownership transfer first.", 409, "not_escrow_owner");
  }
  const member = members(project).find((m) => m.uid === targetUid);
  if (!member) throw new BountyError("Choose the project owner or a co-owner.", 400);
  const target = await User.findOne({ firebaseUid: targetUid });
  if (target?.wallet?.kind !== "passkey" || !target.wallet.address) throw new BountyError(`${member.name} has not set up a payment account yet.`, 409);
  const account = getAddress(target.wallet.address);
  const [isMaintainer, isSettlement] = await Promise.all([escrow.isMaintainer(account), escrow.isSettlementWallet(account)]);
  const calls = [];
  if (typeof maintainer === "boolean" && maintainer !== isMaintainer) calls.push({ target: config.escrow, value: 0n, data: escrowIface.encodeFunctionData("setMaintainer", [account, maintainer]) });
  if (typeof settlement === "boolean" && settlement !== isSettlement) calls.push({ target: config.escrow, value: 0n, data: escrowIface.encodeFunctionData("setSettlementWallet", [account, settlement]) });
  if (!calls.length) throw new BountyError("Nothing to change.", 400);
  const changes = [typeof maintainer === "boolean" && `${maintainer ? "grant" : "revoke"} maintainer`, typeof settlement === "boolean" && `${settlement ? "grant" : "revoke"} payout approval`].filter(Boolean);
  return createExecuteIntent({ user, kind: "roles", project: project._id, calls,
    summary: `On the escrow: ${changes.join(" and ")} for ${member.name} (${account.slice(0, 6)}…${account.slice(-4)}).` });
}

async function prepareAcceptOwnership({ project, uid }) {
  const { config, escrow } = requirePayments();
  if (project.owner?.firebaseUid !== uid) throw new BountyError("Only the project owner can take escrow ownership.", 403);
  const user = await User.findOne({ firebaseUid: uid });
  const wallet = passkeyOf(user);
  if (lower(await escrow.pendingOwner()) !== lower(wallet.address)) throw new BountyError("No ownership transfer to your account is pending.", 409);
  return createExecuteIntent({ user, kind: "accept_ownership", project: project._id,
    calls: [{ target: config.escrow, value: 0n, data: escrowIface.encodeFunctionData("acceptOwnership", []) }],
    summary: "Become the escrow owner: you will manage who can fund bounties and approve payouts. You cannot move escrowed funds." });
}

module.exports = { paymentsOverview, prepareRoles, prepareAcceptOwnership };
