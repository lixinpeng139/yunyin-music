import { Box, Button, Stack, Typography, alpha } from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import LoginIcon from "@mui/icons-material/Login";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useMemo } from "react";
import { fetchLikedSongs } from "../api/ncm";
import { PageMessage, PageScaffold } from "../components/PageScaffold";
import { RowSkeleton, Surface } from "../components/Section";
import { TrackList } from "../components/TrackList";
import { useAsync } from "../hooks/useAsync";
import { usePlayer } from "../player/store";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";

/** 我喜欢的音乐 — the account's liked tracks, with a shuffle-first hero. */
export function LikedPage() {
  const status = useAuth((state) => state.status);
  const profile = useAuth((state) => state.profile);
  const setLoginOpen = useUi((state) => state.setLoginOpen);

  const liked = useAsync(async () => {
    if (!profile) return [];
    return fetchLikedSongs(profile.userId);
  }, [profile?.userId]);

  const stats = useMemo(() => {
    const tracks = liked.data ?? [];
    const artists = new Set<string>();
    let duration = 0;
    for (const track of tracks) {
      duration += track.duration;
      track.artists.forEach((artist) => artists.add(artist.name));
    }
    return {
      count: tracks.length,
      artists: artists.size,
      hours: (duration / 3_600_000).toFixed(1),
    };
  }, [liked.data]);

  if (status === "anonymous") {
    return (
      <PageScaffold>
        <PageMessage
          icon={<FavoriteIcon />}
          title="登录后查看我喜欢的音乐"
          description="登录网易云账号即可同步你的收藏歌曲，支持无损音质与心动模式。"
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
            width: 74,
            height: 74,
            borderRadius: `${radius.md}px`,
            background: "linear-gradient(140deg, #F0B6D0 0%, #B9A6FF 100%)",
            display: "grid",
            placeItems: "center",
            color: "#2A0F20",
          }}
        >
          <FavoriteIcon sx={{ fontSize: 34 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="overline" sx={{ color: "primary.main" }}>
            LIKED SONGS
          </Typography>
          <Typography variant="h1">我喜欢的音乐</Typography>
          <Typography variant="body2" sx={{ color: "text.disabled", mt: 0.5 }}>
            {stats.count} 首 · {stats.artists} 位歌手 · 约 {stats.hours} 小时
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            disabled={!liked.data?.length}
            onClick={() =>
              void usePlayer.getState().playQueue(liked.data ?? [], 0, {
                kind: "liked",
                name: "我喜欢的音乐",
              })
            }
          >
            播放全部
          </Button>
          <Button
            variant="outlined"
            startIcon={<ShuffleIcon />}
            disabled={!liked.data?.length}
            onClick={() => {
              const tracks = liked.data ?? [];
              void usePlayer.getState().playQueue(
                tracks,
                Math.floor(Math.random() * tracks.length),
                { kind: "liked", name: "我喜欢的音乐" },
                {
                  mode: "shuffle",
                },
              );
            }}
            sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
          >
            随机
          </Button>
        </Stack>
      </Surface>

      <Box
        sx={{ flex: 1, minHeight: 0, display: "flex", px: { xs: 1, md: 1.5 } }}
      >
        {liked.loading ? (
          <RowSkeleton count={12} />
        ) : (
          <TrackList
            tracks={liked.data ?? []}
            source={{ kind: "liked", name: "我喜欢的音乐" }}
            showHeader={false}
            emptyText="还没有收藏任何歌曲，去发现页逛逛吧"
          />
        )}
      </Box>
    </PageScaffold>
  );
}
