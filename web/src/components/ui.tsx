"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";

export type TxState = "idle" | "wallet" | "pending" | "confirmed" | "failed";

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`luxury-glow rounded-2xl border border-white/5 bg-[#0a0a0c]/90 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] hover:border-emerald-500/20 hover:shadow-[0_20px_50px_rgba(16,185,129,0.02)] transition-all duration-500 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-5">
      <div className="min-w-0">
        <h2 className="text-xs font-bold uppercase tracking-widest bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[11px] text-zinc-500 font-medium tracking-wide">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

/* ----------------------------------------------------------------- Badge */

type Tone = "green" | "amber" | "indigo" | "zinc" | "red" | "sky";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.05)]",
  amber: "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.05)]",
  indigo: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25 shadow-[0_0_15px_rgba(52,211,153,0.08)]",
  zinc: "bg-zinc-800/60 text-zinc-400 ring-1 ring-white/5",
  red: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.05)]",
  sky: "bg-emerald-500/5 text-emerald-300 ring-1 ring-emerald-500/10",
};

export function Badge({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const styles: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-zinc-950 hover:brightness-110 font-bold tracking-wider uppercase text-xs disabled:from-zinc-800 disabled:to-zinc-900 disabled:text-zinc-600 disabled:brightness-100 shadow-[0_4px_20px_rgba(16,185,129,0.15)] hover:shadow-[0_4px_30px_rgba(16,185,129,0.3)] hover:scale-[1.01]",
    secondary:
      "bg-zinc-900/90 border border-white/5 text-zinc-300 hover:bg-zinc-850 hover:border-emerald-500/40 hover:text-white disabled:bg-zinc-950/40 disabled:border-white/5",
    ghost: "bg-transparent text-zinc-400 hover:text-emerald-400 hover:bg-emerald-950/20",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:shadow-none disabled:scale-100 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------- Form fields */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] text-zinc-500 font-medium leading-normal">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-white/5 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/10 transition-all duration-300 hover:border-white/10";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`${inputBase} resize-y ${props.className ?? ""}`}
    />
  );
}

/* ---------------------------------------------------------- Tx status UI */

const TX_LABEL: Record<TxState, string> = {
  idle: "",
  wallet: "Waiting for wallet signature…",
  pending: "Transaction pending on Ritual Chain…",
  confirmed: "Transaction successfully confirmed!",
  failed: "Transaction failed",
};

const TX_TONE: Record<TxState, Tone> = {
  idle: "zinc",
  wallet: "amber",
  pending: "indigo",
  confirmed: "green",
  failed: "red",
};

export function TxStatus({
  state,
  error,
  hash,
  explorerBase,
}: {
  state: TxState;
  error?: string | null;
  hash?: `0x${string}`;
  explorerBase?: string;
}) {
  if (state === "idle" && !error) return null;

  const isPending = state === "wallet" || state === "pending";
  const glowClass = isPending ? "glow-active" : "";

  return (
    <div className={`mt-4 rounded-xl border border-white/5 bg-zinc-950/40 p-4 transition-all duration-500 ${glowClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {isPending ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : state === "confirmed" ? (
            <span className="text-emerald-400 text-sm">✓</span>
          ) : (
            <span className="text-red-400 text-sm">✗</span>
          )}
          <span className="text-xs font-semibold text-zinc-300">
            {state === "failed" && error ? error : TX_LABEL[state]}
          </span>
        </div>

        {hash && explorerBase ? (
          <a
            href={`${explorerBase}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-white transition-all duration-300"
          >
            Explorer Link ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}


export function Notice({
  tone = "zinc",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 text-xs ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-zinc-100 break-words">
        {value}
      </div>
    </div>
  );
}
