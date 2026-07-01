"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "aijudge_hidden_bounty_ids";

function readHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeHidden(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

export function useDismissedBounties() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Hydrate from localStorage after mount (deferred to avoid setState-in-effect lint error)
  useEffect(() => {
    const id = setTimeout(() => setHidden(readHidden()), 0);
    return () => clearTimeout(id);
  }, []);

  const hideAll = (ids: bigint[]) => {
    const next = new Set(hidden);
    ids.forEach((id) => next.add(id.toString()));
    writeHidden(next);
    setHidden(next);
  };

  const restoreAll = () => {
    writeHidden(new Set());
    setHidden(new Set());
  };

  const isHidden = (id: bigint) => hidden.has(id.toString());

  return { isHidden, hideAll, restoreAll, hiddenCount: hidden.size };
}
