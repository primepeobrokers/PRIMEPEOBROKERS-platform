"use client";

import { useEffect, useRef } from "react";
import { logRecordOpen } from "./actions";

/**
 * Writes a "record opened" event once per mount, from the client — so link
 * prefetching never counts as an open.
 */
export function LogOpen({ submissionId }: { submissionId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void logRecordOpen(submissionId);
  }, [submissionId]);
  return null;
}
