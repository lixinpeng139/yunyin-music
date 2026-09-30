import {
  Box,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import RadioIcon from "@mui/icons-material/Radio";
import RepeatIcon from "@mui/icons-material/Repeat";
import RepeatOneIcon from "@mui/icons-material/RepeatOne";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import VolumeDownIcon from "@mui/icons-material/VolumeDown";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { alpha as muiAlpha } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDuration } from "../api/normalize";
import { MODE_LABELS, usePlayer, type PlayMode } from "../player/store";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import { QUALITY_LABELS, type QualityLevel } from "../types/ncm";
import { Cover } from "./Cover";

const MODE_ICONS: Record<PlayMode, React.ReactNode> = {
  list: <RepeatIcon />,
  single: <RepeatOneIcon />,
  shuffle: <ShuffleIcon />,
  heart: <AutoAwesomeIcon />,
  roam: <RadioIcon />,
};

const QUALITY_ORDER: QualityLevel[] = [
  "standard",
  "higher",
  "exhigh",
  "lossless",
  "hires",
  "jyeffect",
  "sky",
  "jymaster",
];

export function PlayerBar() {
  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const playing = usePlayer((state) => state.playing);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const volume = usePlayer((state) => state.volume);
  const muted = usePlayer((state) => state.muted);
  const mode = usePlayer((state) => state.mode);
  const quality = usePlayer((state) => state.quality);
  const resolving = usePlayer((state) => state.resolving);
  const liked = usePlayer((state) =>
    current ? state.liked.has(current.id) : false,
  );

  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const previous = usePlayer((state) => state.previous);
  const seek = usePlayer((state) => state.seek);
  const setVolume = usePlayer((state) => state.setVolume);
  const toggleMute = usePlayer((state) => state.toggleMute);
  const setMode = usePlayer((state) => state.setMode);
  const setQuality = usePlayer((state) => state.setQuality);
  const toggleLike = useAuth((state) => state.toggleLike);

  const setQueueOpen = useUi((state) => state.setQueueOpen);
  const setNowPlayingOpen = useUi((state) => state.setNowPlayingOpen);

  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [qualityAnchor, setQualityAnchor] = useState<HTMLElement | null>(null);
  const [modeAnchor, setModeAnchor] = useState<HTMLElement | null>(null);

  // Keep the OS media session in sync so niri's MPRIS-less status widgets and
  // any playerctl-compatible bar can show what is playing.
  useEffect(() => {
    if (
      !current ||
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator)
    )
      return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: current.name,
      artist: current.artistText,
      album: current.album.name,
      artwork: current.album.picUrl
        ? [{ src: current.album.picUrl, sizes: "300x300", type: "image/jpeg" }]
        : [],
    });
    session.playbackState = playing ? "playing" : "paused";
    session.setActionHandler("play", () => usePlayer.getState().resume());
    session.setActionHandler("pause", () => usePlayer.getState().pause());
    session.setActionHandler(
      "nexttrack",
      () => void usePlayer.getState().next({ userInitiated: true }),
    );
    session.setActionHandler(
      "previoustrack",
      () => void usePlayer.getState().previous(),
    );
  }, [current, playing]);

  const shown = scrubbing ?? position;
  const percent = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  return (
    <Box
      sx={{
        height: 78,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2,
        borderTop: `1px solid ${alpha("#FFFFFF", 0.07)}`,
        bgcolor: alpha("#101016", 0.86),
        backdropFilter: "blur(30px)",
      }}
    >
      {/* Track identity */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          width: 280,
          minWidth: 180,
          flex: "0 1 280px",
        }}
      >
        <Box
          onClick={() => current && setNowPlayingOpen(true)}
          sx={{ cursor: current ? "pointer" : "default", position: "relative" }}
        >
          <Cover
            src={current?.album.picUrl}
            size={140}
            width={50}
            radiusSize={radius.sm}
            alt={current?.name ?? ""}
          />
          {current ? (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                borderRadius: `${radius.sm}px`,
                bgcolor: muiAlpha("#000", 0.45),
                opacity: 0,
                transition: "opacity .16s ease",
                "&:hover": { opacity: 1 },
              }}
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </Box>
          ) : null}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          {current ? (
            <>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: "center" }}
              >
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {current.name}
                </Typography>
                {current.unplayableReason ? (
                  <Chip
                    label="不可播放"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: 9,
                      bgcolor: alpha("#FFFFFF", 0.08),
                    }}
                  />
                ) : null}
              </Stack>
              <Typography
                variant="caption"
                noWrap
                sx={{ color: "text.disabled", display: "block" }}
              >
                {current.artists.map((artist, index) => (
                  <Box component="span" key={`${artist.id}-${index}`}>
                    {index > 0 ? " / " : ""}
                    <Link
                      to={`/artist/${artist.id}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {artist.name}
                    </Link>
                  </Box>
                ))}
              </Typography>
            </>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{ color: "text.disabled", fontWeight: 600 }}
              >
                还没有播放音乐
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                从发现页挑一首开始吧
              </Typography>
            </>
          )}
        </Box>

        {current ? (
          <Tooltip title={liked ? "取消喜欢" : "喜欢"}>
            <IconButton
              size="small"
              onClick={() => toggleLike(current.id)}
              aria-label="喜欢"
            >
              {liked ? (
                <FavoriteIcon
                  fontSize="small"
                  sx={{ color: "secondary.main" }}
                />
              ) : (
                <FavoriteBorderIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>

      {/* Transport */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ alignItems: "center", flex: "0 0 auto" }}
      >
        <Tooltip title="上一个">
          <span>
            <IconButton
              onClick={() => void previous()}
              disabled={!current}
              aria-label="上一个"
            >
              <SkipPreviousIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={playing ? "暂停" : "播放"}>
          <span>
            <IconButton
              onClick={toggle}
              disabled={!current}
              aria-label={playing ? "暂停" : "播放"}
              sx={{
                width: 46,
                height: 46,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": {
                  bgcolor: "primary.main",
                  filter: "brightness(1.08)",
                },
                "&.Mui-disabled": {
                  bgcolor: alpha("#FFFFFF", 0.06),
                  color: "text.disabled",
                },
              }}
            >
              {resolving && !playing ? (
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "2px solid currentColor",
                    borderTopColor: "transparent",
                    animation: "yunyin-spin .8s linear infinite",
                    "@keyframes yunyin-spin": {
                      to: { transform: "rotate(360deg)" },
                    },
                  }}
                />
              ) : playing ? (
                <PauseIcon />
              ) : (
                <PlayArrowIcon />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="下一个">
          <span>
            <IconButton
              onClick={() => void next({ userInitiated: true })}
              disabled={!current}
              aria-label="下一个"
            >
              <SkipNextIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Progress */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", flex: "1 1 auto", minWidth: 160 }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            fontVariantNumeric: "tabular-nums",
            width: 38,
            textAlign: "right",
          }}
        >
          {formatDuration(shown)}
        </Typography>
        <Slider
          size="small"
          value={percent}
          disabled={!current}
          onChange={(_event, value) => {
            const next = Array.isArray(value) ? value[0]! : value;
            setScrubbing((next / 100) * (duration || 0));
          }}
          onChangeCommitted={(_event, value) => {
            const next = Array.isArray(value) ? value[0]! : value;
            seek((next / 100) * (duration || 0));
            setScrubbing(null);
          }}
          sx={{
            flex: 1,
            "& .MuiSlider-rail": {
              bgcolor: alpha("#FFFFFF", 0.14),
              opacity: 1,
            },
            "& .MuiSlider-thumb": {
              width: 12,
              height: 12,
              transition: "width .12s ease, height .12s ease",
            },
            "&:hover .MuiSlider-thumb": {
              width: 14,
              height: 14,
              boxShadow: "none",
            },
          }}
        />
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            fontVariantNumeric: "tabular-nums",
            width: 38,
          }}
        >
          {formatDuration(duration || current?.duration)}
        </Typography>
      </Stack>

      {/* Right cluster */}
      <Stack
        direction="row"
        spacing={0.25}
        sx={{
          alignItems: "center",
          flex: "0 0 auto",
          width: 250,
          justifyContent: "flex-end",
        }}
      >
        <Tooltip title={`播放模式：${MODE_LABELS[mode]}`}>
          <IconButton
            onClick={(event) => setModeAnchor(event.currentTarget)}
            aria-label="播放模式"
            sx={{ color: mode === "list" ? "text.secondary" : "primary.main" }}
          >
            {MODE_ICONS[mode]}
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={modeAnchor}
          open={Boolean(modeAnchor)}
          onClose={() => setModeAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
          transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          {(["list", "single", "shuffle"] as PlayMode[]).map((option) => (
            <MenuItem
              key={option}
              selected={mode === option}
              onClick={() => {
                void setMode(option);
                setModeAnchor(null);
              }}
            >
              {MODE_LABELS[option]}
            </MenuItem>
          ))}
          <Divider />
          {(["heart", "roam"] as PlayMode[]).map((option) => (
            <MenuItem
              key={option}
              selected={mode === option}
              onClick={() => {
                void setMode(option);
                setModeAnchor(null);
              }}
            >
              {MODE_LABELS[option]}
            </MenuItem>
          ))}
        </Menu>

        <Tooltip title="播放队列">
          <IconButton onClick={() => setQueueOpen(true)} aria-label="播放队列">
            <QueueMusicIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={`音质：${QUALITY_LABELS[quality]}`}>
          <IconButton
            onClick={(event) => setQualityAnchor(event.currentTarget)}
            aria-label="音质"
            sx={{
              color: quality === "exhigh" ? "text.secondary" : "primary.main",
            }}
          >
            <HighQualityIcon />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={qualityAnchor}
          open={Boolean(qualityAnchor)}
          onClose={() => setQualityAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          {QUALITY_ORDER.map((option) => (
            <MenuItem
              key={option}
              selected={quality === option}
              onClick={() => {
                setQuality(option);
                setQualityAnchor(null);
              }}
            >
              {QUALITY_LABELS[option]}
            </MenuItem>
          ))}
        </Menu>

        <Stack
          direction="row"
          spacing={0.5}
          sx={{ alignItems: "center", ml: 1, width: 108 }}
        >
          <IconButton size="small" onClick={toggleMute} aria-label="静音">
            {muted || volume === 0 ? (
              <VolumeOffIcon fontSize="small" />
            ) : volume < 0.5 ? (
              <VolumeDownIcon fontSize="small" />
            ) : (
              <VolumeUpIcon fontSize="small" />
            )}
          </IconButton>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(_event, value) =>
              setVolume(Array.isArray(value) ? value[0]! : value)
            }
            sx={{
              "& .MuiSlider-rail": {
                bgcolor: alpha("#FFFFFF", 0.14),
                opacity: 1,
              },
              "& .MuiSlider-thumb": { width: 10, height: 10 },
            }}
          />
        </Stack>
      </Stack>
    </Box>
  );
}
