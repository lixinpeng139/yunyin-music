import {
  Box,
  Button,
  Stack,
  Typography,
  alpha,
  type SxProps,
  type Theme,
} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import type { ReactNode } from "react";
import { radius } from "../theme";

interface PageScaffoldProps {
  children: ReactNode;
  /** Optional sticky hero rendered above the scrolling area. */
  hero?: ReactNode;
  padded?: boolean;
  sx?: SxProps<Theme>;
}

/** Standard scroll container for a page: hero (optional) + scrolling body. */
export function PageScaffold({
  children,
  hero,
  padded = true,
  sx,
}: PageScaffoldProps) {
  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {hero}
      <Box
        sx={[
          {
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            px: padded ? { xs: 1.5, md: 2.5 } : 0,
            py: padded ? 2 : 0,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Centred message used for empty / error / login-required states. */
export function PageMessage({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack
      spacing={2}
      sx={{
        alignItems: "center",
        justifyContent: "center",
        py: 10,
        px: 4,
        textAlign: "center",
      }}
    >
      {icon ? (
        <Box sx={{ color: "text.disabled", "& svg": { fontSize: 40 } }}>
          {icon}
        </Box>
      ) : null}
      <Typography variant="h3">{title}</Typography>
      {description ? (
        <Typography
          variant="body2"
          sx={{ color: "text.disabled", maxWidth: 460, lineHeight: 1.7 }}
        >
          {description}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}

/** Inline error with a retry affordance. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Box
      sx={{
        borderRadius: `${radius.md}px`,
        border: `1px solid ${alpha("#FFB4AB", 0.25)}`,
        bgcolor: alpha("#FFB4AB", 0.06),
        p: 2,
        my: 2,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
        <ErrorOutlineIcon sx={{ fontSize: 18, color: "error.main", mt: 0.2 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            加载失败
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", wordBreak: "break-word" }}
          >
            {message}
          </Typography>
        </Box>
        {onRetry ? (
          <Button
            size="small"
            variant="outlined"
            onClick={onRetry}
            sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
          >
            重试
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}
