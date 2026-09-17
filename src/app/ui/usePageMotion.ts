import { useEffect, type RefObject } from "react";

/** Load motion after render so it never blocks the initial application bundle. */
export function usePageMotion(root: RefObject<HTMLElement | null>, scene: string) {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void import("gsap").then(({ gsap }) => {
      if (cancelled || !root.current || !window.matchMedia) return;
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const container = root.current;
        if (!container) return;
        const selectors = scene.endsWith(":settings")
          ? ".settings-dialog"
          : ".home-intro, .module-grid, .recent-section, .setup-layout, .import-layout, .processing-content, .transcript-head";
        const targets = container.querySelectorAll(selectors);
        if (targets.length) gsap.fromTo(targets,
          { y: 9, opacity: 0.65 },
          { y: 0, opacity: 1, duration: 0.38, stagger: 0.045, ease: "power2.out", clearProps: "transform,opacity" }
        );
      }, root);
      cleanup = () => media.revert();
    }).catch(() => { /* Content remains usable if the optional motion chunk fails. */ });
    return () => { cancelled = true; cleanup?.(); };
  }, [root, scene]);
}
