// Style examples: real review comments by the reviewer (and optionally other maintainers they
// name), so drafts read like a person on the project wrote them.

import type { StyleExample } from "./github.ts";

const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function usable(e: StyleExample, target: { repo: string; number: number }): boolean {
  return (
    // Never from the PR under review: that would hand the agent the answer.
    !(same(e.repo, target.repo) && e.pr === target.number) &&
    e.body.length >= MIN_LENGTH &&
    e.body.length <= MAX_LENGTH &&
    !e.body.includes("```suggestion")
  );
}

/**
 * Pick up to `count` examples for one PR. `pools` holds one list per author, the reviewer's own
 * first. Within each author, comments on the same repo come first. Authors take turns, so the
 * reviewer's voice leads but others add variety.
 */
export function pickStyleExamples(
  pools: StyleExample[][],
  target: { repo: string; number: number },
  count: number,
): StyleExample[] {
  const queues = pools.map((pool) => {
    const ok = pool.filter((e) => usable(e, target));
    return [
      ...ok.filter((e) => same(e.repo, target.repo)),
      ...ok.filter((e) => !same(e.repo, target.repo)),
    ];
  });
  const picked: StyleExample[] = [];
  while (picked.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}

export function renderStyleExamples(reviewer: string, examples: StyleExample[]): string {
  const others = [...new Set(examples.map((e) => e.author).filter((a) => !same(a, reviewer)))];
  const intro = others.length
    ? `Real comments posted on earlier PRs by ${reviewer} (whose voice you write in) and by ${others.join(", ")}, another maintainer whose reviews ${reviewer} likes.`
    : `Real comments ${reviewer} posted on earlier PRs.`;
  const items = examples.map(
    (e) => `- ${e.author} on \`${e.path}\` (${e.repo}#${e.pr}):\n${e.body.replace(/^/gm, "  > ")}`,
  );
  return [
    "# How reviewers on this project write comments",
    "",
    intro,
    "Match their voice, length and directness in every `comment` you write. Do not reuse their content.",
    "",
    ...items,
    "",
  ].join("\n");
}
