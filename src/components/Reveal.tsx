import { Box, type SxProps, type Theme } from "@mui/material";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { duration, easing } from "../theme/motion";

interface RevealProps {
  children: ReactNode;
  /**
   * Position in a sequence. Each step delays the reveal a little further so a
   * list resolves top-to-bottom instead of snapping in all at once.
   */
  index?: number;
  /** Extra delay after the stagger step, in milliseconds. */
  delay?: number;
  /** Do not animate until the element scrolls into view. */
  onScroll?: boolean;
  sx?: SxProps<Theme>;
}

/** Milliseconds added per item; small enough that long lists do not crawl. */
const STEP = 26;
/** Cap, so item 200 does not wait seconds for its turn. */
const MAX_STAGGER = 260;

/**
 * Fades and lifts its children into place.
 *
 * Uses a CSS animation rather than a transition so the element reaches its final
 * state even if the animation never runs — with `prefers-reduced-motion` the
 * duration collapses and the content simply appears.
 */
export function Reveal({
  children,
  index = 0,
  delay = 0,
  onScroll = false,
  sx,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(!onScroll);

  useEffect(() => {
    if (!onScroll || shown) return;
    const node = ref.current;
    if (!node) return;
    // Anything already on screen should not wait for a scroll event.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onScroll, shown]);

  const stagger = Math.min(index * STEP, MAX_STAGGER);

  return (
    <Box
      ref={ref}
      sx={[
        {
          opacity: shown ? undefined : 0,
          animation: shown
            ? `yunyin-reveal ${duration.medium4}ms ${easing.emphasizedDecelerate} ${stagger + delay}ms both`
            : "none",
          "@keyframes yunyin-reveal": {
            from: { opacity: 0, transform: "translateY(12px)" },
            to: { opacity: 1, transform: "none" },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
