import { Box, type SxProps, type Theme } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { duration, easing } from "../theme/motion";

interface RouteTransitionProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Softens route changes.
 *
 * Switching pages used to swap the entire viewport in a single frame, which
 * reads as a flash on a dark theme. This fades and lifts the new page in, keyed
 * on the pathname so React remounts the animation per navigation rather than
 * reusing the previous page's finished state.
 */
export function RouteTransition({ children, sx }: RouteTransitionProps) {
  const { pathname } = useLocation();
  const [phase, setPhase] = useState<"in" | "idle">("idle");

  useEffect(() => {
    setPhase("in");
    // Two frames: one for the browser to paint the "in" start state, one to
    // begin the transition. A single frame can be coalesced and skip the fade.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("idle"));
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <Box
      key={pathname}
      sx={[
        {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(8px)" : "none",
          transition: `opacity ${duration.medium3}ms ${easing.emphasizedDecelerate}, transform ${duration.medium3}ms ${easing.emphasizedDecelerate}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
