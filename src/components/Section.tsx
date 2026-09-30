import {
  Box,
  Skeleton,
  Stack,
  Typography,
  alpha,
  type SxProps,
  type Theme,
} from "@mui/material";
import type { ReactNode } from "react";
import { radius } from "../theme";

/** Material 3 style section heading with an optional leading glyph and action. */
export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  sx,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "flex-end",
        ...[{ mb: 1.75, mt: 0.5 }, ...(Array.isArray(sx) ? sx : [sx])],
      }}
    >
      {icon ? (
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            color: "primary.main",
            "& svg": { fontSize: 22 },
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h3">{title}</Typography>
        {subtitle ? (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ flex: 1 }} />
      {action}
    </Stack>
  );
}

/** Soft tinted container used for hero panels and empty states. */
export function Surface({
  children,
  sx,
  glow = false,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
  glow?: boolean;
}) {
  return (
    <Box
      sx={[
        {
          borderRadius: `${radius.lg}px`,
          backgroundColor: "rgba(255,255,255,0.035)",
          border: `1px solid ${alpha("#FFFFFF", 0.06)}`,
          ...(glow
            ? {
                backgroundImage: `radial-gradient(120% 140% at 0% 0%, ${alpha("#B9A6FF", 0.16)} 0%, transparent 55%)`,
              }
            : null),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** Consistent skeleton block for loading grids. */
export function CardGridSkeleton({
  count = 10,
  minWidth = 150,
}: {
  count?: number;
  minWidth?: number;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Box key={index}>
          <Skeleton
            variant="rounded"
            sx={{
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: `${radius.md}px`,
            }}
          />
          <Skeleton variant="text" width="85%" sx={{ mt: 0.5 }} />
          <Skeleton variant="text" width="50%" height={14} />
        </Box>
      ))}
    </Box>
  );
}

export function RowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Stack spacing={0.5} sx={{ px: 1.5 }}>
      {Array.from({ length: count }).map((_, index) => (
        <Stack
          key={index}
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", py: 0.75 }}
        >
          <Skeleton
            variant="rounded"
            width={38}
            height={38}
            sx={{ borderRadius: "6px" }}
          />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={`${45 + ((index * 13) % 40)}%`} />
            <Skeleton
              variant="text"
              width={`${20 + ((index * 7) % 25)}%`}
              height={12}
            />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
