// Decides whether a chat message should invoke the agent. Ordinary chat never does.
const COMMANDS = [
  { cmd: "/explain", role: "guide", hint: "Explain code, an issue or how the project works" },
  { cmd: "/criteria", role: "scope", hint: "Draft acceptance criteria for a task" },
  { cmd: "/review", role: "reviewer", hint: "Review a pull request: /review 12 (add `force` to re-run)" },
  { cmd: "/setcriteria", role: "scope", hint: "Maintainers: approve criteria, one per line" },
];

const PLEASANTRY = /^(?:thanks?(?:\s+you)?|thank\s+you|thx|ty|ok(?:ay)?|cool|great|nice|got\s+it|perfect|awesome|lol|k|yes|no|yep|nope)\b[\s\p{P}\p{S}]*(?:so\s+much|a\s+lot|very\s+much|!)?[\s\p{P}\p{S}]*$/iu;

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
  // Acknowledging an answer ("thanks!") is not a question; it must not spend inference.
  if (replyToIsAgent && !PLEASANTRY.test(text) && text.replace(/[^\p{L}\p{N}]/gu, "").length >= 3) {
    return withPr({ kind: "reply", role: guessRole(text), question: text });
  }
  return null;
}

// Extracts an explicit pull request reference: "#12", "PR 12", "pull request 12", a PR URL, or a bare number that is
// the whole request ("/review 12", "/review 12 force"). A number inside other words ("fix 404 handling") is not one.
function findPr(question) {
  const q = String(question || "");
  const url = q.match(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/i);
  if (url) return { number: Number(url[2]), repo: url[1] };
  const named = q.match(/(?:^|[\s(])(?:#|(?:pr|pull request)\s*#?)(\d{1,6})(?=$|[\s.,?!)])/i);
  if (named) return { number: Number(named[1]), repo: null };
  const bare = q.replace(/\bforce\b/gi, "").trim().match(/^#?(\d{1,6})$/);
  return bare ? { number: Number(bare[1]), repo: null } : null;
}

function withPr(trigger) {
  const found = findPr(trigger.question);
  if (!found || found.number < 1) return trigger;
  if (trigger.role !== "reviewer") return trigger;
  return { ...trigger, pr: { ...found, force: /\bforce\b/i.test(trigger.question) } };
}

function guessRole(text) {
  // "review PR 5 against the criteria" is a review request even though it mentions criteria.
  if (findPr(text) && /\b(review|check|look|diff|evidence)\b/i.test(text)) return "reviewer";
  if (/\b(criteria|acceptance|scope|requirements?)\b/i.test(text)) return "scope";
  if (/\b(review|pull request|\bPR\b|diff)\b/i.test(text)) return "reviewer";
  return "guide";
}

module.exports = { COMMANDS, detectTrigger };
