"use client";

import { useClerk, useSession } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/** Finish provider verification, then obtain a fresh server-authorized document. */
export function SSOSessionHandoff() {
  const clerk = useClerk();
  const { isLoaded } = useSession();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    void clerk.handleRedirectCallback({
      signInForceRedirectUrl: "/", signUpForceRedirectUrl: "/",
      signInFallbackRedirectUrl: "/", signUpFallbackRedirectUrl: "/",
      continueSignUpUrl: "/sign-up",
    }, async destination => {
      const url = new URL(destination, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error("Unexpected sign-in destination");
      window.location.replace(url.href);
    }).catch(() => setFailed(true));
  }, [clerk, isLoaded]);
  return failed ? <p role="alert">Sign-in could not be completed. <Link href="/sign-in" className="underline">Return to sign-in</Link></p> : null;
}
