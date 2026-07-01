import type { Address } from "viem";

/** Parsed shape of the `getBounty` tuple return value (commit-reveal version). */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  submissionDeadline: bigint; // end of Phase 1 — commit phase
  revealDeadline: bigint;     // end of Phase 2 — reveal phase
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;    // only counts *revealed* answers
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

/**
 * getBounty returns a positional tuple — map it to a named object.
 * Tuple order: owner, title, rubric, reward, submissionDeadline, revealDeadline,
 *              judged, finalized, submissionCount, winnerIndex, aiReview
 */
export function parseBounty(
  raw: readonly [
    Address,
    string,
    string,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint,
    `0x${string}`,
  ],
): Bounty {
  const [
    owner,
    title,
    rubric,
    reward,
    submissionDeadline,
    revealDeadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  ] = raw;
  return {
    owner,
    title,
    rubric,
    reward,
    submissionDeadline,
    revealDeadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  };
}

/**
 * Four phases driven purely by timestamps and state flags:
 *   commit    – before submissionDeadline (Phase 1: participants commit hashes)
 *   reveal    – between submissionDeadline and revealDeadline (Phase 2: reveal answers)
 *   ready     – after revealDeadline, not judged yet (owner can call judgeAll)
 *   judged    – AI review done, owner picks winner
 *   finalized – winner chosen and paid out
 */
export type BountyStatus = "commit" | "reveal" | "ready" | "judged" | "finalized";

function toSeconds(ts: bigint | number): number {
  const val = Number(ts);
  return val > 50000000000 ? val / 1000 : val;
}

export function getBountyStatus(b: Bounty, nowSeconds = Date.now() / 1000): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  const revealSec = toSeconds(b.revealDeadline);
  const subSec = toSeconds(b.submissionDeadline);
  if (nowSeconds >= revealSec) return "ready";
  if (nowSeconds >= subSec) return "reveal";
  return "commit";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" | "sky" }
> = {
  commit:    { label: "Commit Phase",      tone: "green"  },
  reveal:    { label: "Reveal Phase",      tone: "sky"    },
  ready:     { label: "Ready to Judge",    tone: "amber"  },
  judged:    { label: "Judged",            tone: "indigo" },
  finalized: { label: "Finalized",         tone: "zinc"   },
};

/** Can a participant submit a *commitment* (Phase 1)? */
export function canCommit(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && toSeconds(b.submissionDeadline) > nowSeconds;
}

/** Can a participant *reveal* their answer (Phase 2)? */
export function canReveal(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  const subSec = toSeconds(b.submissionDeadline);
  const revealSec = toSeconds(b.revealDeadline);
  return (
    !b.judged &&
    !b.finalized &&
    nowSeconds >= subSec &&
    nowSeconds < revealSec
  );
}
