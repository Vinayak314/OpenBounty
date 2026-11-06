// Unified-diff helpers. Citations are validated against NEW-side line numbers of the PR's patches.

// Returns Map<newLineNumber, { text, added }> for every line visible on the new side of the patch.
function parsePatch(patch) {
  const lines = new Map();
  if (!patch) return lines;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = Number(hunk[1]); continue; }
    if (!newLine) continue;
    if (raw.startsWith("+")) { lines.set(newLine, { text: raw.slice(1), added: true }); newLine += 1; }
    else if (raw.startsWith("-") || raw.startsWith("\\")) continue; // removed line / "no newline" marker
    else { lines.set(newLine, { text: raw.slice(1), added: false }); newLine += 1; }
  }
  return lines;
}

// Renders a patch with explicit new-side line numbers so the model can cite exact lines.
// Format: "L48+ code" for added lines, "L48  code" for context, "    - code" for removed lines.
function numberPatch(patch) {
  const out = [];
  let newLine = 0;
  for (const raw of String(patch || "").split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = Number(hunk[1]); out.push(raw); continue; }
    if (!newLine) continue;
    if (raw.startsWith("+")) { out.push(`L${newLine}+ ${raw.slice(1)}`); newLine += 1; }
    else if (raw.startsWith("-")) out.push(`    - ${raw.slice(1)}`);
    else if (raw.startsWith("\\")) continue;
    else { out.push(`L${newLine}  ${raw.slice(1)}`); newLine += 1; }
  }
  return out.join("\n");
}

const isTestPath = (p) => /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/i.test(p);

// Orders files so source changes are reviewed before tests/docs, then fits them into a character budget.
function buildDiffBudget(files, maxChars) {
  const ranked = [...files].sort((a, b) => {
    const rank = (f) => (/\.(md|mdx|txt)$/i.test(f.path) ? 2 : isTestPath(f.path) ? 1 : 0);
    return rank(a) - rank(b) || (b.additions + b.deletions) - (a.additions + a.deletions);
  });
  let budget = maxChars;
  const included = [];
  const omitted = [];
  for (const file of ranked) {
    if (!file.patch) { omitted.push({ path: file.path, reason: "no textual diff (binary, generated or too large)" }); continue; }
    const numbered = numberPatch(file.patch);
    if (numbered.length > budget) {
      if (budget > 1500) {
        included.push({ path: file.path, text: numbered.slice(0, budget), partial: true });
        budget = 0;
      } else omitted.push({ path: file.path, reason: "diff budget exhausted" });
      continue;
    }
    budget -= numbered.length;
    included.push({ path: file.path, text: numbered, partial: false });
  }
  return { included, omitted, truncated: omitted.length > 0 || included.some((f) => f.partial) };
}

module.exports = { parsePatch, numberPatch, buildDiffBudget };
