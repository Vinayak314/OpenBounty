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
  const included = [];
  const omitted = [];
  // Tests are evidence for criteria like "tests cover X", so they keep a reserved share instead of being squeezed
  // out by a large source change. Whatever source files do not use flows on to the tests.
  const withDiff = ranked.filter((file) => file.patch);
  const tests = withDiff.filter((file) => isTestPath(file.path));
  const hasBoth = tests.length > 0 && tests.length < withDiff.length;
  function fit(list, startBudget) {
    let budget = startBudget;
    for (const file of list) {
      const numbered = numberPatch(file.patch);
      if (numbered.length > budget) {
        if (budget > 1500) {
          const boundary = numbered.lastIndexOf("\n", budget);
          if (boundary > 0) included.push({ path: file.path, text: numbered.slice(0, boundary), partial: true });
          else omitted.push({ path: file.path, reason: "no full diff line fits the budget" });
          budget = 0;
        } else omitted.push({ path: file.path, reason: "diff budget exhausted" });
        continue;
      }
      budget -= numbered.length;
      included.push({ path: file.path, text: numbered, partial: false });
    }
    return budget;
  }
  for (const file of ranked) {
    if (!file.patch) omitted.push({ path: file.path, reason: "no textual diff (binary, generated or too large)" });
  }
  if (hasBoth) {
    const reserve = Math.floor(maxChars * 0.25);
    const left = fit(withDiff.filter((file) => !isTestPath(file.path)), maxChars - reserve);
    fit(tests, reserve + left);
  } else {
    fit(withDiff, maxChars);
  }
  return { included, omitted, truncated: omitted.length > 0 || included.some((f) => f.partial) };
}

module.exports = { parsePatch, numberPatch, buildDiffBudget };
