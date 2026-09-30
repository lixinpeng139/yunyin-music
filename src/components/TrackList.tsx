import { Box, Button, Stack, Typography, alpha } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { usePlayer, type QueueSource } from "../player/store";
import { useAuth } from "../store/auth";
import type { Track } from "../types/ncm";
import { SongRow } from "./SongRow";

interface TrackListProps {
  tracks: Track[];
  source?: QueueSource | null;
  /** Render a sticky header row with count and bulk actions. */
  showHeader?: boolean;
  title?: string;
  dense?: boolean;
  showAlbum?: boolean;
  /** Extra element rendered above the list (inside the scroll container). */
  header?: React.ReactNode;
  onMore?: (track: Track) => void;
  emptyText?: string;
}

const ROW_HEIGHT = 50;
const VIRTUALIZE_THRESHOLD = 80;

/**
 * Scrollable, virtualised list of songs.
 *
 * The container owns the scrolling so that a virtualised list and a plain one
 * behave identically to the parent layout (`flex: 1; min-height: 0`).
 */
export function TrackList({
  tracks,
  source = null,
  showHeader = true,
  title,
  dense = false,
  showAlbum = true,
  header,
  onMore,
  emptyText = "这里还没有歌曲",
}: TrackListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toggleLike = useAuth((state) => state.toggleLike);

  const virtualize = tracks.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: virtualize ? tracks.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (dense ? ROW_HEIGHT - 6 : ROW_HEIGHT),
    overscan: 12,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tracks]);

  const totalDuration = useMemo(
    () => tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
    [tracks],
  );

  const playAt = (index: number) => {
    void usePlayer.getState().playQueue(tracks, index, source);
  };

  const playAll = () => playAt(0);

  const shufflePlay = () => {
    void usePlayer
      .getState()
      .playQueue(tracks, Math.floor(Math.random() * tracks.length), source, {
        mode: "shuffle",
      });
  };

  const queueAll = () => {
    usePlayer.getState().appendToQueue(tracks);
    usePlayer
      .getState()
      .notify(`已添加 ${tracks.length} 首到播放队列`, "success");
  };

  const minutes = Math.round(totalDuration / 60000);

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {showHeader ? (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: "center",
            px: 1.5,
            pb: 1.5,
            flex: "0 0 auto",
            flexWrap: "wrap",
            rowGap: 1,
          }}
        >
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={playAll}
            disabled={!tracks.length}
          >
            播放全部
            {tracks.length ? (
              <Box
                component="span"
                sx={{ ml: 0.75, opacity: 0.7, fontWeight: 500 }}
              >
                {tracks.length}
              </Box>
            ) : null}
          </Button>
          <Button
            variant="outlined"
            startIcon={<ShuffleIcon />}
            onClick={shufflePlay}
            disabled={!tracks.length}
            sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
          >
            随机播放
          </Button>
          <Button
            onClick={queueAll}
            disabled={!tracks.length}
            sx={{ color: "text.secondary" }}
          >
            添加到队列
          </Button>
          <Box sx={{ flex: 1 }} />
          {tracks.length && minutes > 0 ? (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              {title ? `${title} · ` : ""}
              {tracks.length} 首 · 约 {minutes} 分钟
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          px: 0.5,
          pb: 2,
        }}
      >
        {header}
        {!tracks.length ? (
          <Box sx={{ py: 8, textAlign: "center", color: "text.disabled" }}>
            <Typography variant="body2">{emptyText}</Typography>
          </Box>
        ) : virtualize ? (
          <Box
            sx={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const track = tracks[item.index]!;
              return (
                <Box
                  key={`${track.id}-${item.index}`}
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <SongRow
                    track={track}
                    index={item.index}
                    onPlay={playAt}
                    onLike={toggleLike}
                    onQueue={(t) =>
                      usePlayer.getState().appendToQueue([t], { next: true })
                    }
                    onMore={onMore}
                    dense={dense}
                    showAlbum={showAlbum}
                  />
                </Box>
              );
            })}
          </Box>
        ) : (
          tracks.map((track, index) => (
            <SongRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              onPlay={playAt}
              onLike={toggleLike}
              onQueue={(t) =>
                usePlayer.getState().appendToQueue([t], { next: true })
              }
              onMore={onMore}
              dense={dense}
              showAlbum={showAlbum}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
