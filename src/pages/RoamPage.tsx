import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import LoginIcon from "@mui/icons-material/Login";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RadioIcon from "@mui/icons-material/Radio";
import ReplayIcon from "@mui/icons-material/Replay";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import { useEffect, useState } from "react";
import { Cover } from "../components/Cover";
import { PageMessage, PageScaffold } from "../components/PageScaffold";
import { SectionHeader, Surface } from "../components/Section";
import { usePlayer } from "../player/store";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import type { Track } from "../types/ncm";

/**
 * 漫游 · 私人 FM.
 *
 * A radio-style page focused on the current track. The queue keeps refilling
 * itself via `personal_fm` as it drains (see `extendSpecialModes`).
 */
export function RoamPage() {
  const status = useAuth((state) => state.status);
  const setLoginOpen = useUi((state) => state.setLoginOpen);
  const toggleLike = useAuth((state) => state.toggleLike);

  const current = usePlayer((state) => state.queue[state.index] ?? null);
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const mode = usePlayer((state) => state.mode);
  const playing = usePlayer((state) => state.playing);
  const liked = usePlayer((state) =>
    current ? state.liked.has(current.id) : false,
  );
  const [history, setHistory] = useState<Track[]>([]);

  // Remember what has already played so the page can show a recent strip.
  useEffect(() => {
    if (!current) return;
    setHistory((prev) => {
      if (prev[0]?.id === current.id) return prev;
      return [
        current,
        ...prev.filter((track) => track.id !== current.id),
      ].slice(0, 12);
    });
  }, [current]);

  if (status === "anonymous") {
    return (
      <PageScaffold>
        <PageMessage
          icon={<RadioIcon />}
          title="漫游模式需要登录"
          description="私人 FM 会根据你的口味无限推送歌曲，喜欢就留下，不喜欢直接跳过。登录后即可开始漫游。"
          action={
            <Button
              variant="contained"
              startIcon={<LoginIcon />}
              onClick={() => setLoginOpen(true)}
            >
              登录
            </Button>
          }
        />
      </PageScaffold>
    );
  }

  const roaming = mode === "roam";

  return (
    <PageScaffold>
      <Surface
        glow
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          display: "flex",
          gap: { xs: 2, md: 4 },
          flexDirection: { xs: "column", md: "row" },
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: { xs: 200, md: 260 },
            flex: "0 0 auto",
          }}
        >
          <Cover
            src={current?.album.picUrl}
            size={640}
            width="100%"
            sx={{
              aspectRatio: "1 / 1",
              boxShadow: `0 26px 60px ${alpha("#000", 0.55)}`,
              animation:
                playing && roaming
                  ? "yunyin-float 6s ease-in-out infinite"
                  : "none",
              "@keyframes yunyin-float": {
                "0%, 100%": { transform: "translateY(0)" },
                "50%": { transform: "translateY(-8px)" },
              },
            }}
            radiusSize={radius.xl}
            squircle
            alt={current?.name ?? ""}
          />
          <Box
            sx={{
              position: "absolute",
              top: 10,
              left: 10,
              px: 1,
              py: 0.25,
              borderRadius: radius.pill,
              bgcolor: alpha("#000", 0.5),
              backdropFilter: "blur(10px)",
              fontSize: 11,
              fontWeight: 700,
              color: roaming ? "primary.main" : "text.secondary",
            }}
          >
            {roaming ? "漫游中" : "未开启"}
          </Box>
        </Box>

        <Box
          sx={{ flex: 1, minWidth: 0, textAlign: { xs: "center", md: "left" } }}
        >
          <Typography variant="overline" sx={{ color: "primary.main" }}>
            PERSONAL FM
          </Typography>
          <Typography variant="h1" noWrap>
            {current?.name ?? "私人漫游"}
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: "text.secondary", mt: 0.5 }}
            noWrap
          >
            {current?.artistText ?? "还没有开始漫游"}
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              mt: 2.5,
              justifyContent: { xs: "center", md: "flex-start" },
              flexWrap: "wrap",
              rowGap: 1.5,
            }}
          >
            {!roaming ? (
              <Button
                variant="contained"
                size="large"
                startIcon={<RadioIcon />}
                onClick={() => void usePlayer.getState().startRoamMode()}
              >
                开始漫游
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
                  onClick={() => usePlayer.getState().toggle()}
                >
                  {playing ? "暂停" : "继续"}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<SkipNextIcon />}
                  onClick={() =>
                    void usePlayer.getState().next({ userInitiated: true })
                  }
                  sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
                >
                  下一首
                </Button>
              </>
            )}
            <Tooltip title="喜欢这首歌">
              <span>
                <IconButton
                  disabled={!current}
                  onClick={() => current && toggleLike(current.id)}
                  sx={{
                    width: 48,
                    height: 48,
                    bgcolor: alpha("#FFFFFF", 0.06),
                    color: liked ? "secondary.main" : "text.secondary",
                  }}
                >
                  <FavoriteIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="不感兴趣，换一首">
              <span>
                <IconButton
                  disabled={!current}
                  onClick={() =>
                    void usePlayer.getState().next({ userInitiated: true })
                  }
                  sx={{
                    width: 48,
                    height: 48,
                    bgcolor: alpha("#FFFFFF", 0.06),
                    color: "text.secondary",
                  }}
                >
                  <ThumbDownIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              mt: 2,
              justifyContent: { xs: "center", md: "flex-start" },
              flexWrap: "wrap",
              rowGap: 0.75,
            }}
          >
            <Chip
              label={`队列 ${queue.length} 首`}
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.06) }}
            />
            <Chip
              label={`已播 ${Math.max(0, index)} 首`}
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.06) }}
            />
            {roaming ? (
              <Chip
                icon={<GraphicEqIcon sx={{ fontSize: 14 }} />}
                label="自动续播"
                size="small"
                sx={{ bgcolor: alpha("#8FD9C8", 0.16), color: "#8FD9C8" }}
              />
            ) : null}
          </Stack>
        </Box>
      </Surface>

      <SectionHeader
        title="刚刚漫游过"
        subtitle="本次会话播放过的歌曲"
        icon={<ReplayIcon />}
        action={
          queue.length && roaming ? (
            <Button
              size="small"
              onClick={() =>
                void usePlayer
                  .getState()
                  .playQueue(
                    queue,
                    0,
                    { kind: "fm", name: "私人漫游" },
                    { mode: "roam" },
                  )
              }
              sx={{ color: "text.secondary" }}
            >
              从头播放
            </Button>
          ) : null
        }
      />
      {history.length ? (
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            pb: 3,
          }}
        >
          {history.map((track, historyIndex) => (
            <Stack
              key={`${track.id}-${historyIndex}`}
              direction="row"
              spacing={1.25}
              onClick={() =>
                void usePlayer
                  .getState()
                  .playTrack(track, { kind: "fm", name: "私人漫游" })
              }
              sx={{
                alignItems: "center",
                p: 0.75,
                borderRadius: `${radius.sm}px`,
                cursor: "pointer",
                opacity: track.id === current?.id ? 1 : 0.75,
                "&:hover": { bgcolor: alpha("#FFFFFF", 0.05), opacity: 1 },
              }}
            >
              <Cover
                src={track.album.picUrl}
                size={80}
                width={38}
                radiusSize={radius.xs}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ display: "block", fontWeight: 600 }}
                >
                  {track.name}
                </Typography>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ color: "text.disabled", fontSize: 10 }}
                >
                  {track.artistText}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: "text.disabled", pb: 3 }}>
          还没有播放记录，点击「开始漫游」让云音替你挑歌。
        </Typography>
      )}
    </PageScaffold>
  );
}
