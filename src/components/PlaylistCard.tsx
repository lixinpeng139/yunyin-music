import {
  Box,
  Card,
  CardActionArea,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useState } from "react";
import { duration, easing, revealStyle, transition } from "../theme/motion";
import { formatCount } from "../api/normalize";
import { useTrackActions } from "../hooks/useTrackActions";
import { radius } from "../theme";
import type { Playlist } from "../types/ncm";
import { Cover } from "./Cover";

interface PlaylistCardProps {
  /**
   * Position in the surrounding grid. Only used to stagger the entrance so a
   * page of cards resolves top-to-bottom instead of appearing all at once.
   */
  index?: number;
  playlist: Playlist;
  /** Reason line shown instead of the play count (radar / recommendations). */
  reason?: string;
}

/** Square artwork card with a hover play affordance, Material 3 elevation. */
export function PlaylistCard({ playlist, reason, index = 0 }: PlaylistCardProps) {
  const { openPlaylist } = useTrackActions();
  const [hovered, setHovered] = useState(false);
  const reveal = revealStyle(index);
  const cover = playlist.coverImgUrl ?? playlist.picUrl;

  return (
    <Card
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: "relative",
        bgcolor: "transparent",
        borderRadius: `${radius.md}px`,
        ...reveal,
        transition: transition.colors,
        "&:hover": { bgcolor: alpha("#FFFFFF", 0.04) },
      }}
    >
      <CardActionArea
        onClick={() => openPlaylist(playlist.id)}
        sx={{ p: 1, borderRadius: `${radius.md}px`, display: "block" }}
      >
        <Box sx={{ position: "relative", mb: 1 }}>
          <Cover
            src={cover}
            size={400}
            width="100%"
            sx={{
              aspectRatio: "1 / 1",
              transform: hovered ? "translateY(-3px)" : "none",
              boxShadow: hovered
                ? `0 12px 28px ${alpha("#000", 0.42)}`
                : `0 2px 8px ${alpha("#000", 0.22)}`,
              transition: `transform ${duration.medium1}ms ${easing.emphasized}, box-shadow ${duration.medium1}ms ${easing.emphasized}`,
              willChange: "transform",
            }}
            radiusSize={radius.md}
            alt={playlist.name}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: `${radius.md}px`,
              background: `linear-gradient(180deg, rgba(0,0,0,0) 45%, ${alpha("#000", 0.55)} 100%)`,
              opacity: hovered ? 1 : 0,
              transition: `opacity ${duration.short4}ms ${easing.standard}`,
              pointerEvents: "none",
            }}
          />
          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              alignItems: "center",
              position: "absolute",
              top: 8,
              right: 8,
              px: 0.9,
              py: 0.3,
              borderRadius: radius.pill,
              bgcolor: alpha("#000", 0.55),
              backdropFilter: "blur(10px)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            <GraphicEqIcon sx={{ fontSize: 13, opacity: 0.85 }} />
            {formatCount(playlist.playCount ?? playlist.subscribedCount ?? 0)}
          </Stack>
          <Box
            sx={{
              position: "absolute",
              bottom: 10,
              right: 10,
              width: 42,
              height: 42,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              boxShadow: `0 6px 18px ${alpha("#000", 0.45)}`,
              opacity: hovered ? 1 : 0,
              transform: hovered
                ? "translateY(0) scale(1)"
                : "translateY(8px) scale(.88)",
              transition: `opacity ${duration.short4}ms ${easing.standard}, transform ${duration.medium2}ms ${easing.expressive}`,
              pointerEvents: "none",
            }}
          >
            <PlayArrowIcon />
          </Box>
        </Box>

        <Tooltip title={playlist.name} enterDelay={700}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: 36,
            }}
          >
            {playlist.name}
          </Typography>
        </Tooltip>
        <Typography
          variant="caption"
          noWrap
          sx={{
            display: "block",
            color: reason ? "primary.main" : "text.disabled",
            mt: 0.25,
            opacity: reason ? 0.9 : 1,
          }}
        >
          {reason ?? playlist.creatorName ?? "网易云音乐"}
        </Typography>
      </CardActionArea>
    </Card>
  );
}
