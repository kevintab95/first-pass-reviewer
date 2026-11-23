// Per-PR state lives in a hidden HTML comment in the report issue's body, so the
// runner repo needs no committed state file and the issue stays the single source of truth.

export interface PrState {
  repo: string;
  pr: number;
  /** Head SHA covered by the last completed review. */
  lastReviewedSha?: string;
}

const MARKER = /<!-- pr-review-bot:state (\{.*?\}) -->/;

export function readState(body: string | null | undefined): PrState | null {
  const match = body ? MARKER.exec(body) : null;
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]!) as Partial<PrState>;
    if (typeof parsed.repo !== "string" || typeof parsed.pr !== "number") return null;
    return {
      repo: parsed.repo,
      pr: parsed.pr,
      ...(typeof parsed.lastReviewedSha === "string"
        ? { lastReviewedSha: parsed.lastReviewedSha }
        : {}),
    };
  } catch {
    return null;
  }
}

export function stateMarker(state: PrState): string {
  return `<!-- pr-review-bot:state ${JSON.stringify(state)} -->`;
}

/** Replace the marker in `body`, or prepend one if it has none. */
export function writeState(body: string, state: PrState): string {
  const marker = stateMarker(state);
  return MARKER.test(body) ? body.replace(MARKER, marker) : `${marker}\n${body}`;
}

export function prKey(repo: string, pr: number): string {
  return `${repo.toLowerCase()}#${pr}`;
}
