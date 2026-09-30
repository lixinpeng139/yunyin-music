/**
 * Motion tokens.
 *
 * The app previously used ad-hoc `ease` transitions with durations picked per
 * component, which reads as mechanical: everything moved at the same speed no
 * matter how far it travelled or how important it was. These are the Material 3
 * curves and duration steps instead, so movement is consistent and each
 * transition is as long as its purpose warrants.
 */

/** Material 3 easing curves. */
export const easing = {
  /** For elements that enter and remain on screen. */
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
  /** For elements that enter and leave, such as dialogs. */
  emphasizedDecelerate: "cubic-bezier(0.05, 0.7, 0.1, 1)",
  /** For elements on their way out. */
  emphasizedAccelerate: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  /** Small utility transitions: hovers, fades, colour changes. */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /** Short moves within a component. */
  standardDecelerate: "cubic-bezier(0, 0, 0, 1)",
  standardAccelerate: "cubic-bezier(0.3, 0, 1, 1)",
  /** Playful overshoot, used sparingly for emphasis. */
  expressive: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/** Material 3 duration steps, in milliseconds. */
export const duration = {
  /** Icon swaps, colour changes. */
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  /** Component state changes: hovers, ripples. */
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  /** Large surfaces: sheets, panel expansions. */
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  /** Route changes and full-surface reveals. */
  extraLong: 700,
} as const;

/** `transition` shorthands for the common cases. */
export const transition = {
  /** Hover and state feedback. */
  fast: `all ${duration.short4}ms ${easing.standard}`,
  /** Colour or background change only. */
  colors: `background-color ${duration.short4}ms ${easing.standard}, color ${duration.short4}ms ${easing.standard}`,
  /** Standard component movement. */
  base: `all ${duration.medium2}ms ${easing.emphasized}`,
  /** Entering the screen. */
  enter: `${duration.medium4}ms ${easing.emphasizedDecelerate}`,
  /** Leaving the screen. */
  exit: `${duration.short4}ms ${easing.emphasizedAccelerate}`,
  /** Transform-only movement, for lifts and scales. */
  transform: `transform ${duration.medium1}ms ${easing.emphasized}`,
} as const;

/** A spring-like lift used on cards and covers when hovered. */
export const lift = {
  hover: "translateY(-4px)",
  active: "translateY(-1px) scale(0.99)",
} as const;

/**
 * Shared keyframes.
 *
 * `fadeUp` is the workhorse for content appearing in a list; `stagger`-style
 * delays are applied by the caller via animationDelay.
 */
export const keyframes = {
  fadeUp: {
    from: { opacity: 0, transform: "translateY(10px)" },
    to: { opacity: 1, transform: "none" },
  },
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  /** A subtle scale-in used for covers and dialogs. */
  popIn: {
    from: { opacity: 0, transform: "scale(0.96)" },
    to: { opacity: 1, transform: "none" },
  },
  /** Slow drift used behind the now-playing artwork. */
  breathe: {
    "0%, 100%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.04)" },
  },
} as const;

/**
 * CSS that collapses every animation and transition.
 *
 * Motion is decoration; it must never be the reason someone cannot use the app.
 * Applied globally from the theme's CssBaseline.
 */
export const reducedMotionCss = {
  "@media (prefers-reduced-motion: reduce)": {
    "*, *::before, *::after": {
      animationDuration: "0.01ms !important",
      animationIterationCount: "1 !important",
      transitionDuration: "0.01ms !important",
      scrollBehavior: "auto !important",
    },
  },
} as const;

/** Milliseconds added per item in a staggered entrance. */
const STAGGER_STEP = 26;
/** Cap, so the two-hundredth card does not wait seconds for its turn. */
const STAGGER_MAX = 260;

/**
 * Style for an element entering as part of a sequence.
 *
 * Expressed as a CSS animation rather than a transition so the element always
 * ends in its final state: with `prefers-reduced-motion` the global duration
 * override collapses it and the content simply appears.
 */
export function revealStyle(index = 0) {
  const delay = Math.min(index * STAGGER_STEP, STAGGER_MAX);
  return {
    animation: `yunyin-reveal ${duration.medium4}ms ${easing.emphasizedDecelerate} ${delay}ms both`,
    "@keyframes yunyin-reveal": {
      from: { opacity: 0, transform: "translateY(12px)" },
      to: { opacity: 1, transform: "none" },
    },
  } as const;
}
