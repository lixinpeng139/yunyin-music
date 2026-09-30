import {
  Box,
  Button,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPlaylistDetail,
  fetchPlaylistTracks,
  setPlaylistSubscribed,
} from "../api/ncm";
import { formatCount, formatDate, img } from "../api/normalize";
import { Cover } from "../components/Cover";
import { ErrorState, PageScaffold } from "../components/PageScaffold";
import { RowSkeleton } from "../components/Section";
import { TrackList } from "../components/TrackList";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { useAuth } from "../store/auth";
import { usePlayer } from "../player/store";
import { radius } from "../theme";
import type { Track } from "../types/ncm";

/** Playlist detail with a blurred artwork hero and the full track list. */
export function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const playlistId = Number(id);
  const { playTracks, openArtist } = useTrackActions();
  const notify = usePlayer((state) => state.notify);
  const status = useAuth((state) => state.status);
  const [subscribing, setSubscribing] = useState(false);

  const detail = useAsync(async () => {
    if (!Number.isFinite(playlistId)) throw new Error("歌单 ID 无效");
    const result = await fetchPlaylistDetail(playlistId);
    let tracks: Track[] = result.tracks;
    const total = result.playlist.trackCount ?? tracks.length;
    // The detail endpoint only returns the first 30 tracks as a preview.
    if (total > tracks.length) {
      try {
        tracks = await fetchPlaylistTracks(playlistId);
      } catch {
        /* keep the preview when the full list is not permitted */
      }
    }
    return { playlist: result.playlist, tracks, total };
  }, [playlistId]);

  const playlist = detail.data?.playlist;
  const tracks = detail.data?.tracks ?? [];

  const stats = useMemo(() => {
    const duration = tracks.reduce(
      (sum, track) => sum + (track.duration || 0),
      0,
    );
    return { minutes: Math.round(duration / 60000) };
  }, [tracks]);

  const toggleSubscribe = async () => {
    if (!playlist) return;
    if (status !== "authenticated") {
      notify("登录后才能收藏歌单", "info");
      return;
    }
    setSubscribing(true);
    const next = !playlist.subscribed;
    try {
      await setPlaylistSubscribed(playlist.id, next);
      detail.reload();
      notify(next ? "已收藏歌单" : "已取消收藏", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setSubscribing(false);
    }
  };

  if (detail.loading) {
    return (
      <PageScaffold>
        <Stack direction="row" spacing={3} sx={{ mb: 3 }}>
          <Skeleton
            variant="rounded"
            width={180}
            height={180}
            sx={{ borderRadius: `${radius.lg}px` }}
          />
          <Stack spacing={1.5} sx={{ flex: 1 }}>
            <Skeleton variant="text" width="40%" height={40} />
            <Skeleton variant="text" width="25%" />
            <Skeleton variant="text" width="60%" />
          </Stack>
        </Stack>
        <RowSkeleton count={10} />
      </PageScaffold>
    );
  }

  if (detail.error || !playlist) {
    return (
      <PageScaffold>
        <ErrorState
          message={detail.error ?? "歌单不存在"}
          onRetry={detail.reload}
        />
      </PageScaffold>
    );
  }

  const cover = playlist.coverImgUrl ?? playlist.picUrl;
  const source = {
    kind: "playlist" as const,
    id: playlist.id,
    name: playlist.name,
  };

  return (
    <PageScaffold padded={false}>
      {/* Hero */}
      <Box
        sx={{
          position: "relative",
          flex: "0 0 auto",
          px: { xs: 1.75, md: 2.5 },
          pt: 2.5,
          pb: 2,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: -40,
            backgroundImage: cover ? `url(${img(cover, 300)})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px) saturate(140%)",
            opacity: 0.24,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent 0%, ${alpha("#0B0B0F", 0.85)} 100%)`,
          }}
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 2.5 }}
          sx={{
            position: "relative",
            alignItems: { xs: "center", sm: "flex-end" },
          }}
        >
          <Box sx={{ width: { xs: 180, sm: 196 }, flex: "0 0 auto" }}>
            <Cover
              src={cover}
              size={640}
              width="100%"
              radiusSize={radius.lg}
              sx={{
                aspectRatio: "1 / 1",
                boxShadow: `0 22px 50px ${alpha("#000", 0.5)}`,
              }}
              alt={playlist.name}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
            <Chip
              label="歌单"
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.08), mb: 1 }}
            />
            <Typography variant="h1" sx={{ mb: 1 }}>
              {playlist.name}
            </Typography>
            {playlist.creatorName ? (
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "center", mb: 1 }}
              >
                <Typography
                  variant="body2"
                  onClick={() =>
                    playlist.creator?.userId &&
                    openArtist(playlist.creator.userId)
                  }
                  sx={{
                    color: "primary.main",
                    cursor: playlist.creator?.userId ? "pointer" : "default",
                    fontWeight: 600,
                  }}
                >
                  {playlist.creatorName}
                </Typography>
                {playlist.updateTime ? (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    更新于 {formatDate(playlist.updateTime)}
                  </Typography>
                ) : null}
              </Stack>
            ) : null}

            <Stack
              direction="row"
              spacing={0.75}
              sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }}
            >
              <Chip
                label={`${detail.data?.total ?? tracks.length} 首`}
                size="small"
                sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
              />
              {stats.minutes ? (
                <Chip
                  label={`约 ${stats.minutes} 分钟`}
                  size="small"
                  sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
                />
              ) : null}
              {playlist.playCount ? (
                <Chip
                  label={`${formatCount(playlist.playCount)} 次播放`}
                  size="small"
                  sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
                />
              ) : null}
              {(playlist.tags ?? []).slice(0, 3).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    bgcolor: alpha("#B9A6FF", 0.14),
                    color: "primary.main",
                  }}
                />
              ))}
            </Stack>

            {playlist.description ? (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  lineHeight: 1.65,
                  mb: 1.5,
                  maxWidth: 760,
                }}
              >
                {playlist.description}
              </Typography>
            ) : null}

            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                disabled={!tracks.length}
                onClick={() => playTracks(tracks, 0, source)}
              >
                播放全部
              </Button>
              <Button
                variant="outlined"
                startIcon={<ShuffleIcon />}
                disabled={!tracks.length}
                onClick={() =>
                  playTracks(
                    tracks,
                    Math.floor(Math.random() * tracks.length),
                    source,
                    undefined,
                  )
                }
                sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
              >
                随机
              </Button>
              <Tooltip title={playlist.subscribed ? "取消收藏" : "收藏歌单"}>
                <span>
                  <IconButton
                    onClick={() => void toggleSubscribe()}
                    disabled={subscribing}
                    sx={{ bgcolor: alpha("#FFFFFF", 0.05) }}
                    aria-label="收藏歌单"
                  >
                    {playlist.subscribed ? (
                      <FavoriteIcon sx={{ color: "secondary.main" }} />
                    ) : (
                      <FavoriteBorderIcon />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Box
        sx={{ flex: 1, minHeight: 0, display: "flex", px: { xs: 1, md: 1.5 } }}
      >
        <TrackList
          tracks={tracks}
          source={source}
          showHeader={false}
          emptyText="这个歌单还没有歌曲"
          onMore={(track) =>
            usePlayer.getState().appendToQueue([track], { next: true })
          }
        />
      </Box>
    </PageScaffold>
  );
}
