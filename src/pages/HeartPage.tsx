import {
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FavoriteIcon from "@mui/icons-material/Favorite";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import LoginIcon from "@mui/icons-material/Login";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDailySongs, fetchLikedSongs } from "../api/ncm";
import { Cover } from "../components/Cover";
import {
  ErrorState,
  PageMessage,
  PageScaffold,
} from "../components/PageScaffold";
import { SectionHeader, Surface } from "../components/Section";
import { useAsync } from "../hooks/useAsync";
import { usePlayer } from "../player/store";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import type { Track } from "../types/ncm";

/**
 * 心动模式.
 *
 * NetEase derives neighbours from a seed track *inside* a playlist, so the UI
 * asks which library to draw from (liked songs by default) and then keeps
 * extending the queue via `playmode/intelligence/list`.
 */
export function HeartPage() {
  const status = useAuth((state) => state.status);
  const profile = useAuth((state) => state.profile);
  const likedPlaylistId = useAuth((state) => state.likedPlaylistId);
  const setLoginOpen = useUi((state) => state.setLoginOpen);
  const navigate = useNavigate();

  const mode = usePlayer((state) => state.mode);
  const queue = usePlayer((state) => state.queue);
  const heartSeed = usePlayer((state) => state.heartSeed);
  const notice = usePlayer((state) => state.notice);

  const [seedChoice, setSeedChoice] = useState<number | "auto">("auto");
  const [busy, setBusy] = useState(false);

  const liked = useAsync<Track[]>(async () => {
    if (!profile) return [];
    return fetchLikedSongs(profile.userId);
  }, [profile?.userId]);

  const daily = useAsync<Track[]>(
    () => fetchDailySongs().catch(() => []),
    [profile?.userId],
  );

  const active = mode === "heart";
  const seeds = useMemo(() => (liked.data ?? []).slice(0, 60), [liked.data]);

  // Pick a sensible default seed once the library is loaded.
  useEffect(() => {
    if (seedChoice !== "auto" || !seeds.length) return;
    setSeedChoice(seeds[Math.floor(Math.random() * seeds.length)]!.id);
  }, [seeds, seedChoice]);

  const start = async (playlistId: number, songId: number) => {
    setBusy(true);
    await usePlayer.getState().startHeartMode({ songId, playlistId });
    setBusy(false);
  };

  const startFromLiked = async () => {
    if (!profile) return;
    const songId = typeof seedChoice === "number" ? seedChoice : seeds[0]?.id;
    if (!songId) {
      usePlayer.getState().notify("喜欢的音乐还不够多，先收藏几首吧", "info");
      return;
    }
    if (!likedPlaylistId) {
      usePlayer
        .getState()
        .notify("还没找到你的「我喜欢的音乐」歌单，请稍后重试", "error");
      return;
    }
    await start(likedPlaylistId, songId);
  };

  const startFromDaily = async () => {
    const song = daily.data?.[0];
    if (!song) {
      usePlayer.getState().notify("还没有取到每日推荐", "error");
      return;
    }
    await start(0, song.id);
  };

  if (status === "anonymous") {
    return (
      <PageScaffold>
        <PageMessage
          icon={<AutoAwesomeIcon />}
          title="心动模式需要登录"
          description="心动模式会以一首歌为种子，从你的歌单里挑出风格相近的歌曲连续播放，越听越合口味。"
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

  return (
    <PageScaffold>
      <Surface
        glow
        sx={{
          p: { xs: 1.75, md: 2.5 },
          mb: 3,
          display: "flex",
          gap: 2.5,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            width: 76,
            height: 76,
            borderRadius: "26px 40px 26px 40px",
            background: "linear-gradient(140deg, #B9A6FF 0%, #F0B6D0 100%)",
            display: "grid",
            placeItems: "center",
            color: "#1A1030",
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 36 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="overline" sx={{ color: "primary.main" }}>
            HEARTBEAT
          </Typography>
          <Typography variant="h1">心动模式</Typography>
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mt: 0.5, maxWidth: 560 }}
          >
            选一首种子歌曲，云音会沿着它的风格与节奏不断延伸播放列表。播放中随时可以再次切换种子。
          </Typography>
        </Box>
        {active ? (
          <Chip
            label={`心动模式运行中 · 队列 ${queue.length} 首`}
            sx={{ bgcolor: alpha("#B9A6FF", 0.18), color: "primary.main" }}
          />
        ) : null}
      </Surface>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "1.35fr 1fr" },
          mb: 3,
        }}
      >
        <Surface sx={{ p: 2 }}>
          <SectionHeader
            title="从喜欢的音乐开始"
            subtitle={`共 ${liked.data?.length ?? 0} 首收藏`}
            icon={<FavoriteIcon />}
          />
          {liked.loading ? (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              正在读取收藏…
            </Typography>
          ) : liked.error ? (
            <ErrorState message={liked.error} onRetry={liked.reload} />
          ) : seeds.length ? (
            <Stack spacing={1.5}>
              <TextField
                select
                size="small"
                label="选择种子歌曲"
                value={typeof seedChoice === "number" ? seedChoice : ""}
                onChange={(event) => setSeedChoice(Number(event.target.value))}
                sx={{ maxWidth: 420 }}
              >
                {seeds.map((track) => (
                  <MenuItem key={track.id} value={track.id}>
                    {track.name} — {track.artistText}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  disabled={busy}
                  onClick={() => void startFromLiked()}
                >
                  开启心动模式
                </Button>
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() =>
                    setSeedChoice(
                      seeds[Math.floor(Math.random() * seeds.length)]!.id,
                    )
                  }
                  sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
                >
                  随机换一首
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
              <Typography variant="body2" sx={{ color: "text.disabled" }}>
                你还没有收藏任何歌曲，先收藏几首再来试试。
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate("/")}
                sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
              >
                去发现音乐
              </Button>
            </Stack>
          )}
        </Surface>

        <Surface sx={{ p: 2 }}>
          <SectionHeader
            title="从每日推荐开始"
            subtitle="用今天的推荐曲做种子"
            icon={<GraphicEqIcon />}
          />
          <Stack spacing={1.25}>
            {(daily.data ?? []).slice(0, 5).map((track) => (
              <Stack
                key={track.id}
                direction="row"
                spacing={1.25}
                onClick={() => void start(0, track.id)}
                sx={{
                  alignItems: "center",
                  p: 0.75,
                  borderRadius: `${radius.sm}px`,
                  cursor: "pointer",
                  "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
                }}
              >
                <Cover
                  src={track.album.picUrl}
                  size={80}
                  width={34}
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
                <AutoAwesomeIcon
                  sx={{ fontSize: 15, color: "text.disabled" }}
                />
              </Stack>
            ))}
            {!daily.data?.length ? (
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                暂无每日推荐数据
              </Typography>
            ) : (
              <Button
                size="small"
                disabled={busy}
                onClick={() => void startFromDaily()}
                sx={{ alignSelf: "flex-start" }}
              >
                用今日第一首开启
              </Button>
            )}
          </Stack>
        </Surface>
      </Box>

      <SectionHeader
        title="当前心动队列"
        subtitle={
          heartSeed
            ? `种子 #${heartSeed.songId} · 歌单 #${heartSeed.playlistId || "每日推荐"}`
            : "开启后会显示在这里"
        }
        icon={<QueueMusicIcon />}
      />
      {queue.length && active ? (
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            pb: 3,
          }}
        >
          {queue.slice(0, 24).map((track, index) => (
            <Stack
              key={`${track.id}-${index}`}
              direction="row"
              spacing={1.25}
              onClick={() =>
                void usePlayer
                  .getState()
                  .playQueue(queue, index, usePlayer.getState().source)
              }
              sx={{
                alignItems: "center",
                p: 0.75,
                borderRadius: `${radius.sm}px`,
                cursor: "pointer",
                "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
              }}
            >
              <Cover
                src={track.album.picUrl}
                size={80}
                width={36}
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
          {notice?.tone === "error"
            ? notice.text
            : "心动模式未运行。选择一个种子歌曲即可开始。"}
        </Typography>
      )}
    </PageScaffold>
  );
}
