import { createTheme, alpha, type ThemeOptions } from "@mui/material/styles";
import { reducedMotionCss } from "./motion";

/**
 * YunYin design tokens.
 *
 * Material 3 (Material You) inspired palette: a tonal, low-chroma surface
 * ladder with a vivid primary/secondary/tertiary triad. Everything is
 * expressed as CSS variables by MUI so the whole app can be re-tinted at
 * runtime from the album art (see `src/theme/dynamic.ts`).
 */

export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

/** The five tonal steps of a Material 3 surface container ladder. */
export const surface = {
  base: "#0B0B0F",
  container: "#121218",
  containerHigh: "#18181F",
  containerHighest: "#1F1F28",
  bright: "#26262F",
};

export const accent = {
  primary: "#B9A6FF",
  onPrimary: "#24124F",
  secondary: "#F0B6D0",
  tertiary: "#8FD9C8",
  warning: "#F5C97A",
  error: "#FFB4AB",
};

const fontStack = [
  "Inter",
  "SF Pro Text",
  "Noto Sans CJK SC",
  "Noto Sans SC",
  "Source Han Sans SC",
  "Microsoft YaHei",
  "system-ui",
  "sans-serif",
].join(",");

const monoStack = ["JetBrains Mono", "Fira Code", "monospace"].join(",");

function buildComponents(): ThemeOptions["components"] {
  return {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": {
          colorScheme: "dark",
        },
        html: { height: "100%" },
        body: {
          height: "100%",
          overflow: "hidden",
          // Niri is a scrolling compositor; a stray text selection while
          // dragging the window looks broken, so the chrome is not selectable.
          userSelect: "none",
          WebkitFontSmoothing: "antialiased",
        },
        "#root": { height: "100%" },
        "::selection": {
          backgroundColor: alpha(accent.primary, 0.32),
        },
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-track": { background: "transparent" },
        "*::-webkit-scrollbar-thumb": {
          background: alpha("#FFFFFF", 0.12),
          borderRadius: radius.pill,
          border: "2px solid transparent",
          backgroundClip: "content-box",
        },
        "*::-webkit-scrollbar-thumb:hover": {
          background: alpha("#FFFFFF", 0.24),
          backgroundClip: "content-box",
        },
        ...reducedMotionCss,
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          letterSpacing: 0.1,
          borderRadius: radius.pill,
          paddingInline: 18,
          "&.MuiButton-containedPrimary": { color: accent.onPrimary },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: radius.pill },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          backgroundColor: surface.containerHigh,
          transition: "background-color .18s ease, transform .18s ease",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          fontWeight: 600,
          fontSize: 12,
          height: 24,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: radius.sm,
          fontSize: 12,
          paddingInline: 10,
          paddingBlock: 6,
          backgroundColor: alpha(surface.bright, 0.96),
          border: `1px solid ${alpha("#FFFFFF", 0.08)}`,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: radius.xl, backgroundImage: "none" },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: radius.pill },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: radius.pill },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: alpha("#FFFFFF", 0.06) },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, minHeight: 40 },
      },
    },
    MuiTypography: {
      defaultProps: { variantMapping: { body2: "span" } },
    },
  };
}

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "class",
  },
  colorSchemes: {
    dark: {
      palette: {
        mode: "dark",
        primary: { main: accent.primary, contrastText: accent.onPrimary },
        secondary: { main: accent.secondary, contrastText: "#3A1526" },
        tertiary: undefined,
        warning: { main: accent.warning },
        error: { main: accent.error },
        background: {
          default: surface.base,
          paper: surface.container,
        },
        text: {
          primary: "#E7E5EE",
          secondary: alpha("#E7E5EE", 0.66),
          disabled: alpha("#E7E5EE", 0.38),
        },
        divider: alpha("#FFFFFF", 0.08),
        action: {
          hover: alpha("#FFFFFF", 0.06),
          selected: alpha(accent.primary, 0.16),
          focus: alpha(accent.primary, 0.2),
        },
      } as never,
    },
  },
  shape: { borderRadius: radius.sm },
  typography: {
    fontFamily: fontStack,
    h1: { fontSize: 30, fontWeight: 700, letterSpacing: -0.6 },
    h2: { fontSize: 24, fontWeight: 700, letterSpacing: -0.4 },
    h3: { fontSize: 20, fontWeight: 700, letterSpacing: -0.2 },
    h4: { fontSize: 17, fontWeight: 700 },
    h5: { fontSize: 15, fontWeight: 700 },
    h6: { fontSize: 14, fontWeight: 700 },
    body1: { fontSize: 14, letterSpacing: 0.1 },
    body2: { fontSize: 13, letterSpacing: 0.1 },
    caption: { fontSize: 11.5, letterSpacing: 0.2 },
    button: { fontSize: 13.5 },
    overline: { fontFamily: monoStack, letterSpacing: 1 },
  },
  components: buildComponents(),
});

export type AppTheme = typeof theme;
