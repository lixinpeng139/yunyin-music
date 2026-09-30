import {
  Box,
  Chip,
  Dialog,
  IconButton,
  Slide,
  Slider,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import { duration as motionDuration, easing as motionEasing } from "../theme/motion";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import RadioIcon from "@mui/icons-material/Radio";
import RepeatIcon from "@mui/icons-material/Repeat";
import RepeatOneIcon from "@mui/icons-material/RepeatOne";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseLyric, activeLineIndex } from "../api/lyric";
import { formatDuration } from "../api/normalize";
import { fetchLyric } from "../api/ncm";
import { MODE_LABELS, usePlayer, type PlayMode } from "../player/store";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import type { LyricLine } from "../types/ncm";
import { Cover } from "./Cover";

const MODE_ICONS: Record<PlayMode, React.ReactNode> = {
  list: <RepeatIcon fontSize="small" />,
  single: <RepeatOneIcon fontSize="small" />,
  shuffle: <ShuffleIcon fontSize="small" />,
  heart: <AutoAwesomeIcon fontSize="small" />,
  roam: <RadioIcon fontSize="small" />,
};

/** Immersive now-playing sheet: big artwork, synced lyrics, transport. */
/** Full-screen surfaces enter from the bottom; slotProps cannot express that. */
function SlideUp(props: React.ComponentProps<typeof Slide>) {
  return (
    <Slide
      {...props}
      direction="up"
      timeout={motionDuration.medium4}
      easing={motionEasing.emphasizedDecelerate}
    />
  );
}

export function NowPlaying() {
  const open = useUi((state) => state.nowPlayingOpen);
  const setOpen = useUi((state) => state.setNowPlayingOpen);
  const setQueueOpen = useUi((state) => state.setQueueOpen);

  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const playing = usePlayer((state) => state.playing);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const mode = usePlayer((state) => state.mode);
  const liked = usePlayer((state) =>
    current ? state.liked.has(current.id) : false,
  );
  const toggleLike = useAuth((state) => state.toggleLike);

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainOnly, setPlainOnly] = useState(false);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLParagraphElement | null>(null);

  const trackId = current?.id;

  useEffect(() => {
    if (!trackId) {
      setLyrics([]);
      return;
    }
    let cancelled = false;
    setLyrics([]);
    setPlainOnly(false);
    void fetchLyric(trackId)
      .then((payload) => {
        if (cancelled) return;
        const main = parseLyric(payload.lrc?.lyric);
        const translation = parseLyric(payload.tlyric?.lyric);
        const roman = parseLyric(payload.romalrc?.lyric);
        const secondary = [...translation, ...roman];
        // Merge translations onto the nearest main line.
        for (const line of main) {
          const match = secondary.find(
            (item) => Math.abs(item.time - line.time) < 120,
          );
          if (match && match.text && match.text !== line.text)
            line.sub = match.text;
        }
        setLyrics(main);
        setPlainOnly(main.length === 0);
      })
      .catch(() => {
        if (!cancelled) setLyrics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const activeIndex = useMemo(
    () => (plainOnly ? -1 : activeLineIndex(lyrics, scrubbing ?? position)),
    [lyrics, position, scrubbing, plainOnly],
  );

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, open]);

  const playbackPosition = scrubbing ?? position;
  const percent =
    duration > 0 ? Math.min(100, (playbackPosition / duration) * 100) : 0;

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={() => setOpen(false)}
      // Slides up like a Material "expanded" surface instead of the default
      // cross-fade, which made opening the player feel like a page reload.
      // Slides up like a Material "expanded" surface instead of the default
      // cross-fade, which made opening the player feel like a page reload.
      slots={{ transition: SlideUp }}
      slotProps={{
        paper: {
          sx: {
            backgroundImage: "none",
            backgroundColor: "#0A0A0E",
            // The full-screen paper is scrollable by default. The oversized blur
            // layer below made it overflow, so the whole panel scrolled — which
            // is what pushed the artwork off the top. Nothing inside may scroll
            // except the lyrics list.
            overflow: "hidden",
          },
        },
      }}
    >
      {/* Blurred artwork backdrop.
          Clipped by its own layer: the -60px inset used to bleed blur past the
          panel edges, but as a direct child of the paper it made the paper
          scrollable instead. */}
      <Box sx={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Box
        sx={{
          position: "absolute",
          inset: -60,
          backgroundImage: current?.album.picUrl
            ? `url(${current.album.picUrl})`
            : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(90px) saturate(150%)",
          opacity: 0.42,
          transform: "scale(1.15)",
        }}
      />
      {/* Scrim over the blurred artwork.
          It has to reach full opacity before the transport row: with a bright
          album cover the blurred backdrop otherwise showed through as a lighter
          band behind the controls, which read as the layout breaking. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg,
            ${alpha("#0A0A0E", 0.45)} 0%,
            ${alpha("#0A0A0E", 0.72)} 42%,
            ${alpha("#0A0A0E", 0.94)} 72%,
            #0A0A0E 88%,
            #0A0A0E 100%)`,
        }}
      />
      </Box>

      <Box
        sx={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          // Anchor the rows to the top. A centred column splits any overflow
          // between both ends, which cropped the top of the artwork and left an
          // empty band underneath.
          justifyContent: "flex-start",
          alignItems: "stretch",
          p: { xs: 2, md: 3.5 },
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flex: "0 0 auto", mb: 2 }}
        >
          <IconButton onClick={() => setOpen(false)} aria-label="收起">
            <KeyboardArrowDownIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <Typography variant="overline" sx={{ color: "text.disabled" }}>
              正在播放
            </Typography>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {current?.album.name ?? "—"}
            </Typography>
          </Box>
          <Tooltip title="播放队列">
            <IconButton
              onClick={() => {
                setOpen(false);
                setQueueOpen(true);
              }}
            >
              <QueueMusicIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={() => setOpen(false)} aria-label="关闭">
            <CloseIcon />
          </IconButton>
        </Stack>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            // An auto-fitting grid rather than a fixed breakpoint: the columns
            // stack exactly when there is not room for both, instead of at an
            // arbitrary width.
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              md: "repeat(auto-fit, minmax(240px, 1fr))",
            },
            gap: { xs: 2, md: 4 },
            alignItems: "start",
            justifyItems: "center",
            justifyContent: "center",
            maxWidth: 1280,
            width: "100%",
            mx: "auto",
          }}
        >
          {/* Artwork + meta */}
          <Stack
            spacing={2}
            sx={{
              alignItems: "center",
              // Square, bounded by whichever of width or height is scarcer.
              // Stacked, the artwork has to stay small: at 660px wide a 42vh
              // cover left the lyrics panel only ~270px, so lyric lines ran
              // under the transport row and were clipped.
              minWidth: 0,
              width: {
                xs: "min(60%, 24vh, 240px)",
                md: "min(100%, 42vh, 520px)",
              },
              maxWidth: "100%",
            }}
          >
            <Cover
              src={current?.album.picUrl}
              size={640}
              width="100%"
              sx={{
                // Square, pinned to the top of the column: the height follows the
                // width, so the box must not also be stretched by the flex row.
                aspectRatio: "1 / 1",
                boxShadow: `0 24px 64px ${alpha("#000", 0.6)}`,
              }}
              radiusSize={radius.xl}
              alt={current?.name ?? ""}
            />
            <Box sx={{ textAlign: "center", width: "100%" }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "center" }}
              >
                <Typography variant="h2" noWrap sx={{ maxWidth: "100%" }}>
                  {current?.name ?? "还没有播放音乐"}
                </Typography>
                {current && (mode === "heart" || mode === "roam") ? (
                  <Chip
                    size="small"
                    icon={MODE_ICONS[mode] as React.ReactElement}
                    label={MODE_LABELS[mode]}
                    sx={{
                      bgcolor: alpha("#B9A6FF", 0.18),
                      color: "primary.main",
                    }}
                  />
                ) : null}
              </Stack>
              <Typography
                variant="body1"
                sx={{ color: "text.secondary", mt: 0.75 }}
                noWrap
              >
                {current?.artistText ?? ""}
              </Typography>
            </Box>
          </Stack>

          {/* Lyrics */}
          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              minHeight: 0,
              // Both layouts need a definite height: without one the panel
              // grows with its content and the lines overlap the controls.
              height: { xs: "min(34vh, 300px)", md: "100%" },
              maxHeight: "100%",
              overflowY: "auto",
              width: "100%",
              px: { xs: 0, md: 2 },
              maskImage:
                "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
            }}
          >
            {/* Constrain and centre the lyric column. Broken lines left-align
                against the panel edge on narrow windows, which reads as the text
                being detached from the artwork. */}
            {/* The padding lets a line travel through the middle of the panel.
                38vh of it overflowed the panel and produced a scrollbar; 24%
                keeps the effect without the overflow. */}
            <Box
              sx={{
                py: "24%",
                maxWidth: 660,
                mx: "auto",
                textAlign: "center",
              }}
            >
              {lyrics.length ? (
                lyrics.map((line, index) => {
                  const isActive = index === activeIndex;
                  const passed = index < activeIndex;
                  return (
                    <Box
                      key={`${line.time}-${index}`}
                      ref={isActive ? activeRef : undefined}
                      onClick={() => usePlayer.getState().seek(line.time)}
                      sx={{
                        py: 0.85,
                        cursor: "pointer",
                        transition: "opacity .2s ease, transform .2s ease",
                        opacity: isActive ? 1 : passed ? 0.34 : 0.5,
                        transform: isActive ? "scale(1.02)" : "none",
                        transformOrigin: "left center",
                        "&:hover": { opacity: 0.85 },
                      }}
                    >
                      <Typography
                        component="p"
                        sx={{
                          fontSize: { xs: 16, md: 21 },
                          fontWeight: isActive ? 700 : 500,
                          lineHeight: 1.5,
                          color: isActive ? "primary.main" : "text.primary",
                          textShadow: isActive
                            ? `0 0 26px ${alpha("#B9A6FF", 0.45)}`
                            : "none",
                        }}
                      >
                        {line.text || "♪"}
                      </Typography>
                      {line.sub ? (
                        <Typography
                          component="p"
                          sx={{
                            fontSize: { xs: 12.5, md: 14 },
                            color: "text.secondary",
                            mt: 0.25,
                            opacity: isActive ? 0.9 : 0.6,
                          }}
                        >
                          {line.sub}
                        </Typography>
                      ) : null}
                    </Box>
                  );
                })
              ) : (
                <Stack
                  spacing={1}
                  sx={{
                    alignItems: "center",
                    justifyContent: "center",
                    height: "40vh",
                  }}
                >
                  <Typography variant="h3" sx={{ color: "text.disabled" }}>
                    {plainOnly ? "暂无歌词" : "纯音乐，请欣赏"}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    这首歌曲没有提供滚动歌词
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>
        </Box>

        {/* Transport */}
        <Stack
          spacing={1.5}
          sx={{
            flex: "0 0 auto",
            pt: 2,
            // `width: 100%` inside a padded parent overflowed narrow windows and
            // produced a horizontal scrollbar, which then reflowed the whole
            // view once it appeared — the "it changes after a second" symptom.
            maxWidth: "min(760px, 100%)",
            width: "100%",
            mx: "auto",
            minWidth: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", width: 42, textAlign: "right" }}
            >
              {formatDuration(playbackPosition)}
            </Typography>
            <Slider
              value={percent}
              onChange={(_event, value) => {
                const next = Array.isArray(value) ? value[0]! : value;
                setScrubbing((next / 100) * (duration || 0));
              }}
              onChangeCommitted={(_event, value) => {
                const next = Array.isArray(value) ? value[0]! : value;
                usePlayer.getState().seek((next / 100) * (duration || 0));
                setScrubbing(null);
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                "& .MuiSlider-rail": {
                  bgcolor: alpha("#FFFFFF", 0.18),
                  opacity: 1,
                },
                "& .MuiSlider-thumb": { width: 13, height: 13 },
              }}
            />
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", width: 42 }}
            >
              {formatDuration(duration || current?.duration)}
            </Typography>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "center" }}
          >
            <Tooltip title={MODE_LABELS[mode]}>
              <IconButton
                size="small"
                onClick={() => {
                  const order: PlayMode[] = [
                    "list",
                    "single",
                    "shuffle",
                    "heart",
                    "roam",
                  ];
                  const next = order[(order.indexOf(mode) + 1) % order.length]!;
                  void usePlayer.getState().setMode(next);
                }}
              >
                {MODE_ICONS[mode]}
              </IconButton>
            </Tooltip>
            <IconButton
              onClick={() => void usePlayer.getState().previous()}
              aria-label="上一个"
            >
              <SkipPreviousIcon />
            </IconButton>
            <IconButton
              onClick={() => usePlayer.getState().toggle()}
              aria-label={playing ? "暂停" : "播放"}
              sx={{
                width: 58,
                height: 58,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": {
                  bgcolor: "primary.main",
                  filter: "brightness(1.08)",
                },
              }}
            >
              {playing ? (
                <PauseIcon sx={{ fontSize: 30 }} />
              ) : (
                <PlayArrowIcon sx={{ fontSize: 30 }} />
              )}
            </IconButton>
            <IconButton
              onClick={() =>
                void usePlayer.getState().next({ userInitiated: true })
              }
              aria-label="下一个"
            >
              <SkipNextIcon />
            </IconButton>
            <Tooltip title={liked ? "取消喜欢" : "喜欢"}>
              <IconButton
                size="small"
                disabled={!current}
                onClick={() => current && toggleLike(current.id)}
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
          </Stack>
        </Stack>
      </Box>
    </Dialog>
  );
}
