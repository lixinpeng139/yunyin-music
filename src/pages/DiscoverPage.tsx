import {
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExploreIcon from "@mui/icons-material/Explore";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import RecommendIcon from "@mui/icons-material/Recommend";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchBanners,
  fetchNewSongs,
  fetchRecommendedPlaylists,
  fetchTopPlaylists,
  type Banner,
} from "../api/ncm";
import { Cover } from "../components/Cover";
import {
  CardGridSkeleton,
  RowSkeleton,
  SectionHeader,
  Surface,
} from "../components/Section";
import { ErrorState, PageScaffold } from "../components/PageScaffold";
import { PlaylistCard } from "../components/PlaylistCard";
import { Reveal } from "../components/Reveal";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import type { Playlist, Track } from "../types/ncm";

/** Auto-advancing hero carousel built from the homepage banner block. */
function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % banners.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, [banners.length]);

  if (!banners.length) return null;
  const active = banners[index]!;

  const go = (direction: number) => {
    setIndex((value) => (value + direction + banners.length) % banners.length);
  };

  const open = () => {
    // Banner targets are a mix of songs, albums and playlists.
    if (active.targetType === 1 && active.targetId)
      navigate(`/album/${active.targetId}`);
    else if (active.targetType === 10 && active.targetId)
      navigate(`/album/${active.targetId}`);
    else if (active.targetType === 1000 && active.targetId)
      navigate(`/playlist/${active.targetId}`);
    else if (active.encodableTargetUrl)
      window.open(active.encodableTargetUrl, "_blank");
  };

  return (
    <Surface
      glow
      sx={{
        position: "relative",
        height: { xs: 150, md: 196 },
        overflow: "hidden",
        mb: 3,
      }}
    >
      <Box
        component="img"
        src={active.imageUrl}
        alt={active.typeTitle ?? "推荐"}
        onClick={open}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          cursor: "pointer",
          transition: "opacity .4s ease",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(90deg, ${alpha("#0B0B0F", 0.9)} 0%, ${alpha("#0B0B0F", 0.25)} 55%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />
      <Box sx={{ position: "absolute", left: 22, bottom: 18, maxWidth: "60%" }}>
        <Typography variant="overline" sx={{ color: "primary.main" }}>
          为你推荐
        </Typography>
        <Typography variant="h2" noWrap>
          {active.typeTitle ?? "网易云音乐精选"}
        </Typography>
        <Button size="small" variant="contained" sx={{ mt: 1 }} onClick={open}>
          立即查看
        </Button>
      </Box>

      {banners.length > 1 ? (
        <>
          <IconButton
            size="small"
            onClick={() => go(-1)}
            sx={{
              position: "absolute",
              left: 6,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: alpha("#000", 0.4),
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => go(1)}
            sx={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: alpha("#000", 0.4),
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ position: "absolute", bottom: 14, right: 20 }}
          >
            {banners.map((banner, dotIndex) => (
              <Box
                key={banner.targetId ?? dotIndex}
                onClick={() => setIndex(dotIndex)}
                sx={{
                  width: dotIndex === index ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  cursor: "pointer",
                  bgcolor:
                    dotIndex === index ? "primary.main" : alpha("#FFFFFF", 0.3),
                  transition: "width .25s ease, background-color .25s ease",
                }}
              />
            ))}
          </Stack>
        </>
      ) : null}
    </Surface>
  );
}

function PlaylistGrid({
  playlists,
  reason = false,
}: {
  playlists: Playlist[];
  reason?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      }}
    >
      {playlists.map((playlist, index) => (
        <PlaylistCard
          key={playlist.id}
          playlist={playlist}
          index={index}
          reason={
            reason ? (playlist.copywriter ?? playlist.recReason) : undefined
          }
        />
      ))}
    </Box>
  );
}

function NewSongGrid({ tracks }: { tracks: Track[] }) {
  const { playTracks } = useTrackActions();
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1,
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
      }}
    >
      {tracks.map((track, index) => (
        <Reveal key={`${track.id}-${index}`} index={index}>
          <Stack
            direction="row"
            spacing={1.25}
          onClick={() =>
            playTracks(tracks, index, { kind: "search", name: "推荐新音乐" })
          }
          sx={{
            alignItems: "center",
            p: 1,
            borderRadius: `${radius.md}px`,
            cursor: "pointer",
            transition: "background-color .16s ease",
            "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
          }}
        >
          <Cover
            src={track.album.picUrl}
            size={120}
            width={46}
            radiusSize={radius.xs}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
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
        </Stack>
        </Reveal>
      ))}
    </Box>
  );
}

/** Landing page: banners, recommended playlists, brand-new tracks, charts. */
export function DiscoverPage() {
  const profile = useAuth((state) => state.profile);
  const { playTracks } = useTrackActions();
  const navigate = useNavigate();

  const banners = useAsync<Banner[]>(() => fetchBanners().catch(() => []), []);
  const recommended = useAsync<Playlist[]>(
    () => fetchRecommendedPlaylists(12),
    [],
  );
  const fresh = useAsync<Track[]>(() => fetchNewSongs(12), []);
  const charts = useAsync<Playlist[]>(() => fetchTopPlaylists(12), []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了，来点安静的";
    if (hour < 11) return "早上好";
    if (hour < 14) return "中午好";
    if (hour < 19) return "下午好";
    return "晚上好";
  }, []);

  return (
    <PageScaffold>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: "text.disabled" }}>
            {greeting}
            {profile ? `，${profile.nickname}` : ""}
          </Typography>
          <Typography variant="h1">发现音乐</Typography>
        </Box>
        {!profile ? (
          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => useUi.getState().setLoginOpen(true)}
          >
            登录解锁全部功能
          </Button>
        ) : null}
      </Stack>

      {banners.data?.length ? <BannerCarousel banners={banners.data} /> : null}

      <SectionHeader
        title="推荐歌单"
        subtitle="根据你的口味挑选"
        icon={<RecommendIcon />}
        action={
          <Button
            size="small"
            onClick={() => navigate("/charts")}
            sx={{ color: "text.secondary" }}
          >
            更多
          </Button>
        }
      />
      {recommended.loading ? (
        <CardGridSkeleton count={12} />
      ) : recommended.error ? (
        <ErrorState message={recommended.error} onRetry={recommended.reload} />
      ) : (
        <PlaylistGrid playlists={recommended.data ?? []} />
      )}

      <SectionHeader
        title="推荐新音乐"
        subtitle="刚刚发布的好歌"
        icon={<ExploreIcon />}
        sx={{ mt: 4 }}
        action={
          fresh.data?.length ? (
            <Button
              size="small"
              onClick={() =>
                playTracks(fresh.data ?? [], 0, {
                  kind: "search",
                  name: "推荐新音乐",
                })
              }
              sx={{ color: "text.secondary" }}
            >
              全部播放
            </Button>
          ) : null
        }
      />
      {fresh.loading ? (
        <RowSkeleton count={6} />
      ) : (
        <NewSongGrid tracks={fresh.data ?? []} />
      )}

      <SectionHeader
        title="热门歌单"
        subtitle="大家都在听"
        icon={<QueueMusicIcon />}
        sx={{ mt: 4 }}
      />
      {charts.loading ? (
        <CardGridSkeleton count={12} />
      ) : charts.error ? (
        <ErrorState message={charts.error} onRetry={charts.reload} />
      ) : (
        <PlaylistGrid playlists={charts.data ?? []} />
      )}

      <SectionHeader
        title="排行榜"
        subtitle="实时更新的官方榜单"
        icon={<GraphicEqIcon />}
        sx={{ mt: 4 }}
      />
      <Box sx={{ pb: 3 }}>
        {charts.loading ? (
          <RowSkeleton count={5} />
        ) : (
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: "wrap", rowGap: 1 }}
          >
            {(charts.data ?? []).slice(0, 8).map((playlist) => (
              <Button
                key={playlist.id}
                variant="outlined"
                size="small"
                onClick={() => navigate(`/playlist/${playlist.id}`)}
                sx={{
                  borderColor: alpha("#FFFFFF", 0.14),
                  color: "text.secondary",
                }}
              >
                {playlist.name}
              </Button>
            ))}
          </Stack>
        )}
      </Box>
    </PageScaffold>
  );
}
