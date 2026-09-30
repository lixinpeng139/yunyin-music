import { Box, Button, Chip, Stack, Typography, alpha } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LoginIcon from "@mui/icons-material/Login";
import RecommendIcon from "@mui/icons-material/Recommend";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useMemo, useState } from "react";
import { fetchDailySongs, fetchLikedSongs } from "../api/ncm";
import { Cover } from "../components/Cover";
import { TrackList } from "../components/TrackList";
import { RowSkeleton, SectionHeader, Surface } from "../components/Section";
import {
  ErrorState,
  PageMessage,
  PageScaffold,
} from "../components/PageScaffold";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";

/** 每日推荐 — 30 tracks refreshed at 6:00 every day, plus a history strip. */
export function DailyPage() {
  const status = useAuth((state) => state.status);
  const profile = useAuth((state) => state.profile);
  const setLoginOpen = useUi((state) => state.setLoginOpen);
  const { playTracks } = useTrackActions();
  const [seed, setSeed] = useState(0);

  const daily = useAsync(() => fetchDailySongs(), [seed]);
  const liked = useAsync(async () => {
    if (!profile) return [];
    const tracks = await fetchLikedSongs(profile.userId);
    return tracks.slice(0, 12);
  }, [profile?.userId]);

  const today = useMemo(() => {
    const date = new Date();
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }, []);

  const stats = useMemo(() => {
    const tracks = daily.data ?? [];
    const artists = new Set<string>();
    let duration = 0;
    for (const track of tracks) {
      duration += track.duration;
      track.artists.forEach((artist) => artists.add(artist.name));
    }
    return {
      count: tracks.length,
      artists: artists.size,
      minutes: Math.round(duration / 60000),
    };
  }, [daily.data]);

  if (status === "anonymous") {
    return (
      <PageScaffold>
        <PageMessage
          icon={<RecommendIcon />}
          title="每日推荐需要登录"
          description="网易云音乐每天 6:00 会依据你的听歌记录生成 30 首推荐歌曲，登录后即可查看。"
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
    <PageScaffold padded={false}>
      <Surface
        glow
        sx={{
          m: { xs: 1.5, md: 2.5 },
          mb: 1,
          p: { xs: 1.75, md: 2.25 },
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            width: 62,
            height: 62,
            borderRadius: `${radius.md}px`,
            background: "linear-gradient(140deg, #B9A6FF 0%, #F0B6D0 100%)",
            display: "grid",
            placeItems: "center",
            color: "#1A1030",
          }}
        >
          <CalendarMonthIcon sx={{ fontSize: 30 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography variant="overline" sx={{ color: "primary.main" }}>
            {today}
          </Typography>
          <Typography variant="h1">每日推荐</Typography>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.75 }}
          >
            <Chip
              label={`${stats.count} 首`}
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
            />
            <Chip
              label={`${stats.artists} 位歌手`}
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
            />
            <Chip
              label={`约 ${stats.minutes} 分钟`}
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
            />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            disabled={!daily.data?.length}
            onClick={() =>
              playTracks(daily.data ?? [], 0, {
                kind: "daily",
                name: "每日推荐",
              })
            }
          >
            播放全部
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => {
              setSeed((value) => value + 1);
              daily.reload();
            }}
            sx={{ color: "text.secondary" }}
          >
            换一批
          </Button>
        </Stack>
      </Surface>

      <Box
        sx={{ flex: 1, minHeight: 0, display: "flex", px: { xs: 1, md: 1.5 } }}
      >
        {daily.loading ? (
          <RowSkeleton count={10} />
        ) : daily.error ? (
          <Box sx={{ px: 1.5, width: "100%" }}>
            <ErrorState message={daily.error} onRetry={daily.reload} />
          </Box>
        ) : (
          <TrackList
            tracks={daily.data ?? []}
            source={{ kind: "daily", name: "每日推荐" }}
            showHeader={false}
            header={
              liked.data?.length ? (
                <Box sx={{ mb: 2, px: 0.5 }}>
                  <SectionHeader
                    title="从喜欢的音乐继续"
                    subtitle="快速回到熟悉的旋律"
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ overflowX: "auto", pb: 1 }}
                  >
                    {liked.data.map((track, index) => (
                      <Box
                        key={track.id}
                        onClick={() =>
                          playTracks(liked.data ?? [], index, {
                            kind: "liked",
                            name: "我喜欢的音乐",
                          })
                        }
                        sx={{
                          flex: "0 0 auto",
                          width: 104,
                          p: 0.75,
                          borderRadius: `${radius.md}px`,
                          cursor: "pointer",
                          "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
                        }}
                      >
                        <Cover
                          src={track.album.picUrl}
                          size={160}
                          width="100%"
                          sx={{ aspectRatio: "1 / 1", mb: 0.75 }}
                          radiusSize={radius.sm}
                          alt={track.name}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            color: "text.disabled",
                            mb: 0.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {track.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.disabled", fontSize: 10 }}
                        >
                          {track.artistText}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ) : null
            }
          />
        )}
      </Box>
    </PageScaffold>
  );
}
