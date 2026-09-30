import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import { duration, easing } from "../theme/motion";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useEffect, useRef } from "react";
import { formatDuration } from "../api/normalize";
import { audioEngine } from "../player/engine";
import { usePlayer } from "../player/store";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import { Cover } from "./Cover";

const DRAWER_WIDTH = 360;

/** Right-hand playback queue with the current track highlighted and scrolled into view. */
export function QueueDrawer() {
  const open = useUi((state) => state.queueOpen);
  const setOpen = useUi((state) => state.setQueueOpen);
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const source = usePlayer((state) => state.source);
  const clearQueue = usePlayer((state) => state.clearQueue);
  const removeFromQueue = usePlayer((state) => state.removeFromQueue);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!open || index < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-queue-index="${index}"]`,
    );
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, index]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => setOpen(false)}
      slotProps={{
        transition: {
          timeout: duration.medium4,
          easing: easing.emphasizedDecelerate,
        },
        paper: {
          sx: {
            width: DRAWER_WIDTH,
            bgcolor: alpha("#0F0F15", 0.94),
            backdropFilter: "blur(30px)",
            backgroundImage: "none",
            borderLeft: `1px solid ${alpha("#FFFFFF", 0.07)}`,
          },
        },
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", px: 2, py: 1.75 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5">播放队列</Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {source?.name ? `${source.name} · ` : ""}
            {queue.length} 首
          </Typography>
        </Box>
        <Tooltip title="清空队列">
          <span>
            <IconButton
              size="small"
              onClick={clearQueue}
              disabled={!queue.length}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size="small" onClick={() => setOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Divider />

      <List
        ref={listRef}
        dense
        sx={{ flex: 1, overflowY: "auto", py: 1, px: 0.5 }}
      >
        {queue.map((track, itemIndex) => {
          const isCurrent = itemIndex === index;
          return (
            <ListItem
              key={`${track.id}-${itemIndex}`}
              data-queue-index={itemIndex}
              disablePadding
              secondaryAction={
                <IconButton
                  size="small"
                  edge="end"
                  onClick={() => removeFromQueue(itemIndex)}
                  aria-label="从队列移除"
                  sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
                >
                  <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
              }
              sx={{ mb: 0.25 }}
            >
              <ListItemButton
                onClick={() => {
                  if (isCurrent) {
                    if (playing) usePlayer.getState().pause();
                    else usePlayer.getState().resume();
                    return;
                  }
                  void usePlayer.getState().playQueue(queue, itemIndex, source);
                }}
                selected={isCurrent}
                sx={{
                  py: 0.75,
                  pr: 5,
                  gap: 1.25,
                  borderRadius: `${radius.sm}px`,
                  "&.Mui-selected": { bgcolor: alpha("#B9A6FF", 0.14) },
                }}
              >
                <Box
                  sx={{
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Cover
                    src={track.album.picUrl}
                    size={80}
                    width={38}
                    radiusSize={radius.xs}
                  />
                  {isCurrent ? (
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha("#000", 0.5),
                        borderRadius: `${radius.xs}px`,
                      }}
                    >
                      {playing ? (
                        <Stack
                          direction="row"
                          spacing={0.25}
                          sx={{ alignItems: "flex-end", height: 14 }}
                        >
                          {[0, 1, 2].map((bar) => (
                            <Box
                              key={bar}
                              sx={{
                                width: 2.5,
                                bgcolor: "primary.main",
                                borderRadius: 1,
                                animation: `yunyin-eq 0.9s ease-in-out ${bar * 0.18}s infinite alternate`,
                                "@keyframes yunyin-eq": {
                                  from: { height: 4 },
                                  to: { height: 14 },
                                },
                              }}
                            />
                          ))}
                        </Stack>
                      ) : (
                        <PlayArrowIcon
                          sx={{ fontSize: 16, color: "primary.main" }}
                        />
                      )}
                    </Box>
                  ) : null}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      color: isCurrent ? "primary.main" : "text.primary",
                      fontWeight: isCurrent ? 600 : 500,
                    }}
                  >
                    {track.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: "text.disabled", display: "block" }}
                  >
                    {track.artistText}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.disabled",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatDuration(
                    track.duration || (isCurrent ? audioEngine.duration : 0),
                  )}
                </Typography>
              </ListItemButton>
            </ListItem>
          );
        })}

        {!queue.length ? (
          <Box sx={{ textAlign: "center", py: 8, color: "text.disabled" }}>
            <Typography variant="body2">播放队列是空的</Typography>
          </Box>
        ) : null}
      </List>
    </Drawer>
  );
}
