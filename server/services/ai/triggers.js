// Decides whether a chat message should invoke the agent. Ordinary chat never does.
const COMMANDS = [
  { cmd: "/explain", role: "guide", hint: "Explain code, an issue or how the project works" },
  { cmd: "/criteria", role: "scope", hint: "Draft acceptance criteria for a task" },
  { cmd: "/review", role: "reviewer", hint: "Review a pull request: /review 12 (add `force` to re-run)" },
  { cmd: "/setcriteria", role: "scope", hint: "Maintainers: approve criteria, one per line" },
];

const MENTION = /(^|\s)@(?:bounty[\s-]?)?(?:agent|openbounty)\b/i;

function detectTrigger({ body, replyToIsAgent = false }) {
  const text = String(body || "").trim();
  if (!text) return null;

  const command = COMMANDS.find(({ cmd }) => new RegExp(`^${cmd}(\\s|$)`, "i").test(text));
  if (command) {
    const raw = text.slice(command.cmd.length);
    const question = raw.trim();
    if (command.cmd === "/setcriteria") return { kind: "setcriteria", command: command.cmd, role: "scope", question, rawBody: raw };
    return withPr({ kind: "command", command: command.cmd, role: command.role, question });
  }
  if (MENTION.test(text)) {
    const question = text.replace(new RegExp(MENTION.source, "gi"), "$1").replace(/\s{2,}/g, " ").trim();
    return withPr({ kind: "mention", role: guessRole(question), question });
  }
  if (replyToIsAgent) return { kind: "reply", role: guessRole(text), question: text };
  return null;
}

// Extracts a pull request reference (#12, "PR 12", or a github.com/<owner>/<repo>/pull/12 URL) for review requests.
function withPr(trigger) {
  if (trigger.role !== "reviewer") return trigger;
  const q = trigger.question;
  const url = q.match(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/i);
  const num = url ? null : q.match(/(?:^|\s)(?:#|pr\s*#?|pull request\s*#?|pull\/)?(\d{1,6})(?=\s|$|[.,?!])/i);
  const number = Number(url ? url[2] : num?.[1]);
  if (!Number.isInteger(number) || number < 1) return trigger;
  return { ...trigger, pr: { number, repo: url ? url[1] : null, force: /\bforce\b/i.test(q) } };
}

function guessRole(text) {
  if (/\b(criteria|acceptance|scope|requirements?)\b/i.test(text)) return "scope";
  if (/\b(review|pull request|\bPR\b|diff)\b/i.test(text)) return "reviewer";
  return "guide";
}

module.exports = { COMMANDS, detectTrigger };
