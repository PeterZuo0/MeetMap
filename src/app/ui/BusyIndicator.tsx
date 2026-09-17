import { useEffect, useRef } from "react";

/** Decorative activity only; adjacent text communicates the real operation. */
export function BusyIndicator() {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void import("gsap").then(({ gsap }) => {
      if (cancelled || !root.current || !window.matchMedia) return;
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const dots = root.current?.children;
        if (!dots) return;
        const tween = gsap.fromTo(dots,
          { y: 0, opacity: 0.35 },
          { y: -3, opacity: 1, duration: 0.55, stagger: 0.14, repeat: -1, yoyo: true, ease: "sine.inOut" }
        );
        const syncVisibility = () => { tween.paused(document.hidden); };
        syncVisibility();
        document.addEventListener("visibilitychange", syncVisibility);
        return () => document.removeEventListener("visibilitychange", syncVisibility);
      }, root);
      cleanup = () => media.revert();
    }).catch(() => { /* Static dots remain visible when motion is unavailable. */ });
    return () => { cancelled = true; cleanup?.(); };
  }, []);
  return <span className="busy-indicator" ref={root} aria-hidden="true"><i /><i /><i /></span>;
}
