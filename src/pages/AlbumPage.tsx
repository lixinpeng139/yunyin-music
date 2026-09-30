import { Box, Button, Chip, Stack, Typography, alpha } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useParams } from "react-router-dom";
import { fetchAlbum } from "../api/ncm";
import { formatDate, img } from "../api/normalize";
import { Cover } from "../components/Cover";
import { ErrorState, PageScaffold } from "../components/PageScaffold";
import { RowSkeleton } from "../components/Section";
import { TrackList } from "../components/TrackList";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { radius } from "../theme";

/** Album detail: artwork hero plus the track listing. */
export function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const albumId = Number(id);
  const { playTracks, openArtist } = useTrackActions();

  const detail = useAsync(() => {
    if (!Number.isFinite(albumId)) throw new Error("专辑 ID 无效");
    return fetchAlbum(albumId);
  }, [albumId]);

  const album = detail.data?.album;
  const tracks = detail.data?.tracks ?? [];

  if (detail.loading) {
    return (
      <PageScaffold>
        <Stack direction="row" spacing={3} sx={{ mb: 3 }}>
          <Box sx={{ width: 190 }}>
            <RowSkeleton count={1} />
          </Box>
          <Stack spacing={1.5} sx={{ flex: 1 }}>
            <RowSkeleton count={4} />
          </Stack>
        </Stack>
        <RowSkeleton count={8} />
      </PageScaffold>
    );
  }

  if (detail.error || !album) {
    return (
      <PageScaffold>
        <ErrorState
          message={detail.error ?? "专辑不存在"}
          onRetry={detail.reload}
        />
      </PageScaffold>
    );
  }

  const artists = album.artists ?? (album.artist ? [album.artist] : []);

  return (
    <PageScaffold padded={false}>
      <Box
        sx={{
          position: "relative",
          px: { xs: 1.75, md: 2.5 },
          pt: 2.5,
          pb: 2,
          flex: "0 0 auto",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: -40,
            backgroundImage: album.picUrl
              ? `url(${img(album.picUrl, 300)})`
              : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px) saturate(140%)",
            opacity: 0.22,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent 0%, ${alpha("#0B0B0F", 0.88)} 100%)`,
          }}
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2.5}
          sx={{
            position: "relative",
            alignItems: { xs: "center", sm: "flex-end" },
          }}
        >
          <Box sx={{ width: { xs: 180, sm: 196 }, flex: "0 0 auto" }}>
            <Cover
              src={album.picUrl}
              size={640}
              width="100%"
              radiusSize={radius.lg}
              sx={{
                aspectRatio: "1 / 1",
                boxShadow: `0 22px 50px ${alpha("#000", 0.5)}`,
              }}
              alt={album.name}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
            <Chip
              label="专辑"
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.08), mb: 1 }}
            />
            <Typography variant="h1" sx={{ mb: 1 }}>
              {album.name}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                mb: 1,
                flexWrap: "wrap",
                rowGap: 0.5,
              }}
            >
              {artists.map((artist) => (
                <Typography
                  key={artist.id}
                  variant="body2"
                  onClick={() => openArtist(artist.id)}
                  sx={{
                    color: "primary.main",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {artist.name}
                </Typography>
              ))}
              {album.publishTime ? (
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  发行于 {formatDate(album.publishTime)}
                </Typography>
              ) : null}
            </Stack>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }}
            >
              <Chip
                label={`${tracks.length} 首`}
                size="small"
                sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
              />
              {album.company ? (
                <Chip
                  label={album.company}
                  size="small"
                  sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
                />
              ) : null}
            </Stack>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              disabled={!tracks.length}
              onClick={() =>
                playTracks(tracks, 0, {
                  kind: "album",
                  id: album.id,
                  name: album.name,
                })
              }
            >
              播放全部
            </Button>
          </Box>
        </Stack>
      </Box>

      <Box
        sx={{ flex: 1, minHeight: 0, display: "flex", px: { xs: 1, md: 1.5 } }}
      >
        <TrackList
          tracks={tracks}
          source={{ kind: "album", id: album.id, name: album.name }}
          showHeader={false}
          showAlbum={false}
          emptyText="这张专辑暂时没有可播放的歌曲"
        />
      </Box>
    </PageScaffold>
  );
}
