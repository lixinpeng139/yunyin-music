import {
  Box,
  Chip,
  IconButton,
  ListItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { feeBadge, formatDuration } from "../api/normalize";
import { usePlayer } from "../player/store";
import { radius } from "../theme";
import { duration, easing } from "../theme/motion";
import type { Track } from "../types/ncm";
import { Cover } from "./Cover";

interface SongRowProps {
  track: Track;
  index: number;
  onPlay: (index: number) => void;
  onLike: (trackId: number) => void;
  onQueue: (track: Track) => void;
  onMore?: (track: Track) => void;
  /** Hidden until row hover, keeps long lists calm. */
  dense?: boolean;
  showAlbum?: boolean;
}

function SongRowInner({
  track,
  index,
  onPlay,
  onLike,
  onQueue,
  onMore,
  dense = false,
  showAlbum = true,
}: SongRowProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  const liked = usePlayer((state) => state.liked.has(track.id));
  const isCurrent = currentId === track.id;
  const badge = feeBadge(track.fee);

  return (
    <ListItem
      disablePadding
      onDoubleClick={() => onPlay(index)}
      sx={{
        px: 1.5,
        py: dense ? 0.4 : 0.6,
        borderRadius: `${radius.sm}px`,
        cursor: "default",
        gap: 1.5,
        transition: `background-color ${duration.short4}ms ${easing.standard}, box-shadow ${duration.short4}ms ${easing.standard}`,
        backgroundColor: isCurrent
          ? alpha(theme.palette.primary.main, 0.12)
          : "transparent",
        "&:hover": {
          backgroundColor: isCurrent
            ? alpha(theme.palette.primary.main, 0.18)
            : alpha("#FFFFFF", 0.05),
          "& .row-actions": { opacity: 1 },
          "& .row-index": { opacity: 0 },
          "& .row-play": { opacity: 1 },
        },
      }}
    >
      <Box
        sx={{
          width: 30,
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          position: "relative",
          height: 30,
        }}
      >
        <Typography
          className="row-index"
          variant="caption"
          sx={{
            color: isCurrent ? "primary.main" : "text.disabled",
            fontVariantNumeric: "tabular-nums",
            transition: `opacity ${duration.short3}ms ${easing.standard}`,
          }}
        >
          {index + 1}
        </Typography>
        <IconButton
          className="row-play"
          size="small"
          onClick={() => onPlay(index)}
          sx={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            transition: `opacity ${duration.short3}ms ${easing.standard}`,
            color: "primary.main",
          }}
          aria-label="播放"
        >
          <PlayArrowIcon fontSize="small" />
        </IconButton>
      </Box>

      <Cover
        src={track.album.picUrl}
        size={80}
        width={dense ? 34 : 38}
        radiusSize={radius.xs}
        alt={track.name}
      />

      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center", minWidth: 0 }}
        >
          <Typography
            variant="body1"
            noWrap
            sx={{
              color: isCurrent ? "primary.main" : "text.primary",
              fontWeight: isCurrent ? 600 : 500,
            }}
          >
            {track.name}
          </Typography>
          {track.subtitle ? (
            <Typography
              variant="caption"
              noWrap
              sx={{ color: "text.disabled" }}
            >
              {track.subtitle}
            </Typography>
          ) : null}
          {badge ? (
            <Chip
              label={badge.label}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                bgcolor:
                  badge.tone === "vip"
                    ? alpha(theme.palette.error.main, 0.18)
                    : alpha(theme.palette.warning.main, 0.18),
                color:
                  badge.tone === "vip"
                    ? theme.palette.error.main
                    : theme.palette.warning.main,
              }}
            />
          ) : null}
          {track.unplayableReason ? (
            <Chip
              label="不可播放"
              size="small"
              sx={{ height: 18, fontSize: 10, bgcolor: alpha("#FFFFFF", 0.08) }}
            />
          ) : null}
        </Stack>
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center", minWidth: 0, color: "text.secondary" }}
        >
          {track.artists.map((artist, i) => (
            <Box
              key={`${artist.id}-${i}`}
              sx={{ display: "inline-flex", alignItems: "center" }}
            >
              {i > 0 ? (
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", mr: 0.75 }}
                >
                  /
                </Typography>
              ) : null}
              <Typography
                variant="caption"
                noWrap
                onClick={(event) => {
                  event.stopPropagation();
                  if (artist.id) navigate(`/artist/${artist.id}`);
                }}
                sx={{
                  cursor: "pointer",
                  "&:hover": {
                    color: "primary.main",
                    textDecoration: "underline",
                  },
                }}
              >
                {artist.name}
              </Typography>
            </Box>
          ))}
          {showAlbum && track.album.name && track.album.name !== "未知专辑" ? (
            <>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                ·
              </Typography>
              <Typography
                variant="caption"
                noWrap
                onClick={(event) => {
                  event.stopPropagation();
                  if (track.album.id) navigate(`/album/${track.album.id}`);
                }}
                sx={{ cursor: "pointer", "&:hover": { color: "primary.main" } }}
              >
                {track.album.name}
              </Typography>
            </>
          ) : null}
        </Stack>
      </Box>

      <Stack
        className="row-actions"
        direction="row"
        spacing={0.25}
        sx={{
          alignItems: "center",
          opacity: 0,
          transition: `opacity ${duration.short3}ms ${easing.standard}`,
          flex: "0 0 auto",
        }}
      >
        <Tooltip title={liked ? "取消喜欢" : "喜欢"}>
          <IconButton
            size="small"
            onClick={() => onLike(track.id)}
            aria-label="喜欢"
          >
            {liked ? (
              <FavoriteIcon fontSize="small" sx={{ color: "secondary.main" }} />
            ) : (
              <FavoriteBorderIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="下一首播放">
          <IconButton
            size="small"
            onClick={() => onQueue(track)}
            aria-label="下一首播放"
          >
            <PlayArrowIcon
              fontSize="small"
              sx={{ transform: "rotate(90deg)" }}
            />
          </IconButton>
        </Tooltip>
        {onMore ? (
          <Tooltip title="更多">
            <IconButton
              size="small"
              onClick={() => onMore(track)}
              aria-label="更多"
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>

      <Typography
        variant="caption"
        sx={{
          width: 46,
          textAlign: "right",
          color: "text.disabled",
          fontVariantNumeric: "tabular-nums",
          flex: "0 0 auto",
          opacity: 1,
        }}
      >
        {formatDuration(track.duration)}
      </Typography>

      {playing && isCurrent ? (
        <Box
          sx={{
            width: 3,
            height: 18,
            borderRadius: 2,
            bgcolor: "primary.main",
            boxShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.8)}`,
          }}
        />
      ) : null}
    </ListItem>
  );
}

export const SongRow = memo(SongRowInner);
