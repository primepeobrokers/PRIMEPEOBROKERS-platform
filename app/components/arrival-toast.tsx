"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Raises a toast for something that happened on the *previous* page.
 *
 * Sign-in and sign-out both end in a server redirect, so a toast fired before
 * it would be destroyed along with the page. The action flags the destination
 * URL instead and this reads the flag on arrival.
 *
 * The parameter is stripped with replaceState immediately, so the message does
 * not fire again on refresh, on back-navigation, or for anyone the URL is
 * pasted to. The ref guards against React's development double-effect.
 */
export function ArrivalToast({
  param,
  title,
  description,
  variant = "success",
}: {
  param: string;
  title: string;
  description?: string;
  variant?: "success" | "info";
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;

    fired.current = true;
    url.searchParams.delete(param);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    (variant === "info" ? toast : toast.success)(title, {
      description,
      duration: 6000,
    });
  }, [param, title, description, variant]);

  return null;
}
