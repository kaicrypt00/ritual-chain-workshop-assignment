"use client";

import { useState, useMemo } from "react";
import { useAccount, useSwitchChain, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { keccak256, encodePacked, toHex } from "viem";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { type Bounty, canCommit, canReveal } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

// --- helpers ---

/** Generate a cryptographically random 32-byte salt as a 0x-prefixed hex string. */
function generateSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

/**
 * Compute the commitment hash the same way the contract does:
 *   keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
 */
function computeCommitment(
  answer: string,
  salt: `0x${string}`,
  sender: `0x${string}`,
  bountyId: bigint,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, sender.toLowerCase() as `0x${string}`, bountyId],
    ),
  );
}

/** localStorage key for a user's saved commitment data for a specific bounty. */
function storageKey(bountyId: bigint, address: `0x${string}`) {
  return `commitment-${bountyId}-${address.toLowerCase()}`;
}

function formatCommitmentBackup(bountyId: bigint, address: string, answer: string, salt: string, hash: string): string {
  return [
    `Ritual Bounty Answer Commitment Backup`,
    `============================================================`,
    `Bounty ID:       #${bountyId.toString()}`,
    `Submitter Address: ${address}`,
    `Commitment Hash:   ${hash}`,
    `Salt (Secret):     ${salt}`,
    `============================================================`,
    `Your Original Answer:`,
    answer,
    `============================================================`,
    `IMPORTANT: You must keep this safe. During Phase 2 (Reveal Phase),`,
    `this exact answer and salt are required to reveal and submit.`,
  ].join("\n");
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// --- component ---

export function SubmitAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const now = useNow();
  const nowSeconds = now / 1000;

  const wrongChain = isConnected && walletChainId !== ritualChain.id;

  const [answer, setAnswer] = useState("");
  const [savedHash, setSavedHash] = useState<string | null>(null);

  // States to reflect transaction completion instantly and block double execution
  const [commitCompleted, setCommitCompleted] = useState(false);
  const [revealCompleted, setRevealCompleted] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState<{ answer: string; salt: `0x${string}`; commitment: `0x${string}` } | null>(null);

  // Reveal phase manual-entry state (pre-filled from localStorage if available)
  const [revealAnswer, setRevealAnswer] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicClient = usePublicClient({ chainId: ritualChain.id });

  const { data: committedOnChain, refetch: refetchCommitted } = useQuery({
    queryKey: ["hasCommitted", contractAddress, bountyId.toString(), address],
    queryFn: async () => {
      if (!contractAddress || !address || !publicClient) return false;
      return await publicClient.readContract({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "hasCommitted",
        args: [bountyId, address],
      }) as boolean;
    },
    enabled: !!contractAddress && !!address && !!publicClient,
    refetchInterval: 10_000,
  });

  const count = Number(bounty.submissionCount);

  // Fetch all submissions in parallel using standard readContract to avoid Multicall3
  const { data: submissionsData, refetch: refetchSubmissions } = useQuery({
    queryKey: ["bountySubmissions", bountyId.toString(), count],
    queryFn: async () => {
      const addr = contractAddress;
      if (!addr || !publicClient || count <= 0) return [];
      const promises = Array.from({ length: count }, async (_, i) => {
        try {
          const res = await publicClient.readContract({
            address: addr,
            abi: aiJudgeAbi,
            functionName: "getSubmission",
            args: [bountyId, BigInt(i)],
          });
          return { status: "success" as const, result: res as [string, string, `0x${string}`, boolean] };
        } catch (e) {
          return { status: "failure" as const, error: e };
        }
      });
      return Promise.all(promises);
    },
    enabled: !!contractAddress && !!publicClient && count > 0,
  });

  const hasRevealedOnChain = useMemo(() => {
    return !!(
      submissionsData &&
      submissionsData.some((res) => {
        if (res.status === "success" && res.result) {
          const [submitter] = res.result;
          return address && submitter.toLowerCase() === address.toLowerCase();
        }
        return false;
      })
    );
  }, [submissionsData, address]);

  // Separate WriteTx instances for commit and reveal
  const commitTx = useWriteTx(() => {
    if (pendingCommitment && address) {
      setSavedHash(pendingCommitment.commitment);
      try {
        localStorage.setItem(
          storageKey(bountyId, address),
          JSON.stringify(pendingCommitment),
        );
      } catch {}
      setPendingCommitment(null);
    }
    setCommitCompleted(true);
    void refetchCommitted();
    onSubmitted();
  });

  const revealTx = useWriteTx(() => {
    setRevealCompleted(true);
    void refetchSubmissions();
    onSubmitted();
  });

  const isOwner = !!(
    address &&
    bounty.owner &&
    address.toLowerCase() === bounty.owner.toLowerCase()
  );

  if (isOwner) {
    return null;
  }

  // Bounty is closed — don't show commit/reveal forms to prevent futile tx attempts
  if (bounty.finalized || bounty.judged) {
    return (
      <Card>
        <CardHeader
          title="Submit an answer"
          subtitle="This bounty is closed — judging has been completed."
        />
        <CardBody>
          <Notice tone="zinc">
            🏁 This bounty has been judged and finalized. Submissions and reveals are no longer accepted.
          </Notice>
        </CardBody>
      </Card>
    );
  }

  const inCommitPhase = canCommit(bounty, nowSeconds);
  const inRevealPhase = canReveal(bounty, nowSeconds);

  /** One-click network switch banner — shown whenever wallet is on wrong chain */
  const WrongChainBanner = wrongChain ? (
    <Notice tone="amber">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span>⚠️ Your wallet is on the wrong network. Switch to Ritual Chain to continue.</span>
        <Button
          type="button"
          variant="secondary"
          disabled={isSwitching}
          onClick={() => switchChain({ chainId: ritualChain.id })}
          className="shrink-0 text-xs px-3 py-1.5"
        >
          {isSwitching ? "Switching…" : "Switch to Ritual Chain"}
        </Button>
      </div>
    </Notice>
  ) : null;

  // ---- PHASE 1: Submit commitment ----
  async function handleSubmitCommitment(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress || !address) return;

    const salt = generateSalt();
    const commitment = computeCommitment(answer.trim(), salt, address, bountyId);

    // Set pending commitment memory — only save to localStorage / UI on confirmation
    setPendingCommitment({ answer: answer.trim(), salt, commitment });

    try {
      await commitTx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, commitment],
        chainId: ritualChain.id,
      });

      // Save to localStorage immediately upon submission to prevent loss on page refresh
      localStorage.setItem(
        storageKey(bountyId, address),
        JSON.stringify({ answer: answer.trim(), salt, commitment }),
      );
      setSavedHash(commitment);
    } catch {
      setPendingCommitment(null);
    }
  }

  // ---- PHASE 2: Reveal answer ----
  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!contractAddress || !address) return;

    const finalAnswer = revealAnswer.trim();
    const finalSalt = revealSalt.trim() as `0x${string}`;

    if (!finalAnswer) {
      alert("Please enter your answer to reveal.");
      return;
    }
    if (!finalSalt || !finalSalt.startsWith("0x")) {
      alert("Please enter the salt (0x... hex) that was used when you committed.");
      return;
    }

    try {
      await revealTx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, finalAnswer, finalSalt],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via revealTx.state */
    }
  }

  // ---- PHASE 1 UI ----
  if (inCommitPhase) {
    if (committedOnChain || commitCompleted) {
      let localDetails: { answer: string; salt: string; commitment: string } | null = null;
      if (address) {
        const raw = localStorage.getItem(storageKey(bountyId, address));
        if (raw) {
          try {
            localDetails = JSON.parse(raw);
          } catch {}
        }
      }

      return (
        <Card>
          <CardHeader
            title="Phase 1 — Commit your answer"
            subtitle="Your answer fingerprint (hash) has been successfully recorded on-chain."
          />
          <CardBody className="space-y-3">
            <Notice tone="green">
              ✅ Submitted: You have successfully committed your answer for this bounty!
            </Notice>

            {localDetails ? (
              <div className="rounded-xl bg-zinc-950/60 border border-white/5 p-4 text-xs break-all space-y-3">
                <p className="font-semibold text-emerald-400">💾 Commitment details saved in browser:</p>
                <div className="space-y-1.5 font-mono text-[11px] text-zinc-300">
                  <p>
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Answer: </span>
                    <span className="text-zinc-200">{localDetails.answer}</span>
                  </p>
                  <p>
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Salt: </span>
                    <span className="text-zinc-200">{localDetails.salt}</span>
                  </p>
                  <p>
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Hash: </span>
                    <span className="text-zinc-200">{localDetails.commitment}</span>
                  </p>
                </div>
                <div className="flex gap-2 pt-2.5 border-t border-white/5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={() => {
                      const txt = formatCommitmentBackup(
                        bountyId,
                        address || "",
                        localDetails!.answer,
                        localDetails!.salt,
                        localDetails!.commitment
                      );
                      downloadFile(txt, `bounty-${bountyId}-commitment.txt`);
                    }}
                  >
                    ⬇ Download Backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={async () => {
                      const txt = formatCommitmentBackup(
                        bountyId,
                        address || "",
                        localDetails!.answer,
                        localDetails!.salt,
                        localDetails!.commitment
                      );
                      const ok = await copyToClipboard(txt);
                      if (ok) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                  >
                    {copied ? "✅ Copied!" : "📋 Copy Details"}
                  </Button>
                </div>
              </div>
            ) : (
              <Notice tone="amber">
                ⚠️ No local backup: We found your commitment on-chain, but the answer/salt secret is not saved in this browser. To reveal during Phase 2, please use the browser/device where you committed, or prepare your answer + salt.
              </Notice>
            )}
          </CardBody>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader
          title="Phase 1 — Commit your answer"
          subtitle="Your answer stays hidden. Only a fingerprint (hash) is recorded on-chain now."
        />
        <CardBody>
          {WrongChainBanner}

          {!wrongChain && (
            <Notice tone="green">
              ⚠️ After committing, you <strong>must</strong> return to this same browser during the
              Reveal Phase to reveal your answer. The salt is stored only in this browser.
            </Notice>
          )}

          <form onSubmit={handleSubmitCommitment} className="mt-3 space-y-3">
            <Field
              label="Your answer"
              hint="Write your full answer here. It will be hashed locally and the hash submitted on-chain."
            >
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={6}
                placeholder="Write your answer here. It will be hidden until the Reveal Phase."
              />
            </Field>

            {savedHash && (
              <div className="rounded-xl bg-zinc-950/60 border border-white/5 p-4 text-xs break-all space-y-3">
                <p className="font-semibold text-emerald-400">✅ Commitment stored in browser!</p>
                <div className="space-y-1.5 font-mono text-[11px] text-zinc-300">
                  <p>
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Hash: </span>
                    <span className="text-zinc-200">{savedHash}</span>
                  </p>
                  <p>
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Salt: </span>
                    <span className="text-zinc-200">{JSON.parse(localStorage.getItem(storageKey(bountyId, address || "0x0")) || "{}").salt}</span>
                  </p>
                </div>
                <div className="flex gap-2 pt-2.5 border-t border-white/5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={() => {
                      const data = JSON.parse(localStorage.getItem(storageKey(bountyId, address || "0x0")) || "{}");
                      const txt = formatCommitmentBackup(
                        bountyId,
                        address || "",
                        data.answer || "",
                        data.salt || "",
                        savedHash
                      );
                      downloadFile(txt, `bounty-${bountyId}-commitment.txt`);
                    }}
                  >
                    ⬇ Download Backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={async () => {
                      const data = JSON.parse(localStorage.getItem(storageKey(bountyId, address || "0x0")) || "{}");
                      const txt = formatCommitmentBackup(
                        bountyId,
                        address || "",
                        data.answer || "",
                        data.salt || "",
                        savedHash
                      );
                      const ok = await copyToClipboard(txt);
                      if (ok) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                  >
                    {copied ? "✅ Copied!" : "📋 Copy Details"}
                  </Button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={!isConnected || !answer.trim() || commitTx.isBusy || wrongChain}
              className="w-full"
            >
              {commitTx.isBusy ? "Submitting commitment…" : "Commit answer (hide it on-chain)"}
            </Button>

            {!isConnected && (
              <p className="text-xs text-zinc-500">Connect your wallet to submit.</p>
            )}

            <TxStatus
              state={commitTx.state}
              error={commitTx.error}
              hash={commitTx.hash}
              explorerBase={explorerBase}
            />
          </form>
        </CardBody>
      </Card>
    );
  }

  // ---- PHASE 2 UI ----
  if (inRevealPhase) {
    // Try auto-fill from localStorage once
    if (!prefilled && address) {
      const raw = localStorage.getItem(storageKey(bountyId, address));
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { answer: string; salt: string };
          setRevealAnswer(saved.answer);
          setRevealSalt(saved.salt);
        } catch {
          /* ignore malformed */
        }
      }
      setPrefilled(true);
    }

    if (hasRevealedOnChain || revealCompleted) {
      return (
        <Card>
          <CardHeader
            title="Phase 2 — Reveal your answer"
            subtitle="Your answer has been revealed and is eligible for judging."
          />
          <CardBody className="space-y-4">
            <Notice tone="green">
              ✅ Revealed: You have successfully revealed your answer!
            </Notice>
            {revealAnswer && (
              <div className="rounded-xl bg-zinc-950/60 border border-white/5 p-4 text-xs break-all space-y-3">
                <div className="space-y-1.5 font-mono text-[11px] text-zinc-300">
                  <p>
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Your Revealed Answer:</span>
                    <span className="text-zinc-200 block whitespace-pre-wrap mt-1 font-sans text-sm">{revealAnswer}</span>
                  </p>
                  <p className="pt-2 border-t border-white/5">
                    <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Revealed Salt:</span>
                    <span className="text-zinc-200 block mt-1 font-mono text-xs">{revealSalt}</span>
                  </p>
                </div>
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={() => {
                      const hash = address ? JSON.parse(localStorage.getItem(storageKey(bountyId, address)) || "{}").commitment : "";
                      const txt = formatCommitmentBackup(
                        bountyId,
                        address || "",
                        revealAnswer,
                        revealSalt,
                        hash || ""
                      );
                      downloadFile(txt, `bounty-${bountyId}-revealed.txt`);
                    }}
                  >
                    ⬇ Download Backup
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={async () => {
                      const hash = address ? JSON.parse(localStorage.getItem(storageKey(bountyId, address)) || "{}").commitment : "";
                      const txt = formatCommitmentBackup(
                        bountyId,
                        address || "",
                        revealAnswer,
                        revealSalt,
                        hash || ""
                      );
                      const ok = await copyToClipboard(txt);
                      if (ok) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                  >
                    {copied ? "✅ Copied!" : "📋 Copy Details"}
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      );
    }

    const hasData = revealAnswer.trim().length > 0 && revealSalt.trim().length > 0;

    return (
      <Card>
        <CardHeader
          title="Phase 2 — Reveal your answer"
          subtitle="The commit window has closed. Reveal your answer to be eligible for judging."
        />
        <CardBody>
          <div className="space-y-3">
            {WrongChainBanner}

            {!wrongChain && hasData && (
              <div className="space-y-3">
                <Notice tone="green">
                  ✅ Fields pre-filled from browser storage. Confirm and reveal below.
                </Notice>
                {address && (
                  <div className="rounded-xl bg-zinc-950/60 border border-white/5 p-4 text-xs break-all space-y-2">
                    <p className="font-semibold text-emerald-400">📄 Saved commitment backup details found:</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs px-3 py-1.5"
                        onClick={() => {
                          const rawData = JSON.parse(localStorage.getItem(storageKey(bountyId, address)) || "{}");
                          const txt = formatCommitmentBackup(
                            bountyId,
                            address,
                            rawData.answer || "",
                            rawData.salt || "",
                            rawData.commitment || ""
                          );
                          downloadFile(txt, `bounty-${bountyId}-commitment.txt`);
                        }}
                      >
                        ⬇ Download Backup
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs px-3 py-1.5"
                        onClick={async () => {
                          const rawData = JSON.parse(localStorage.getItem(storageKey(bountyId, address)) || "{}");
                          const txt = formatCommitmentBackup(
                            bountyId,
                            address,
                            rawData.answer || "",
                            rawData.salt || "",
                            rawData.commitment || ""
                          );
                          const ok = await copyToClipboard(txt);
                          if (ok) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }
                        }}
                      >
                        {copied ? "✅ Copied!" : "📋 Copy Details"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!wrongChain && !hasData && (
              <Notice tone="amber">
                No saved data found in browser storage. Type your original answer and paste the
                salt you saved when you committed.
              </Notice>
            )}

            <form onSubmit={handleReveal} className="space-y-3">
              <Field
                label="Your answer"
                hint="Must exactly match what you wrote when you committed."
              >
                <Textarea
                  value={revealAnswer}
                  onChange={(e) => setRevealAnswer(e.target.value)}
                  rows={5}
                  placeholder="Paste or type your original answer exactly as committed."
                />
              </Field>

              <Field
                label="Salt (0x hex)"
                hint="The random secret generated at commit time. Auto-filled from browser storage."
              >
                <Textarea
                  value={revealSalt}
                  onChange={(e) => setRevealSalt(e.target.value)}
                  rows={2}
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </Field>

              <Button
                type="submit"
                disabled={!isConnected || !revealAnswer.trim() || !revealSalt.trim() || revealTx.isBusy || wrongChain}
                className="w-full"
              >
                {revealTx.isBusy ? "Revealing…" : "Reveal my answer"}
              </Button>
            </form>

            <TxStatus
              state={revealTx.state}
              error={revealTx.error}
              hash={revealTx.hash}
              explorerBase={explorerBase}
            />
          </div>
        </CardBody>
      </Card>
    );
  }

  // Nothing to show outside the two active phases
  return null;
}