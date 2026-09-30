import {
  Avatar,
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
  alpha,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VerifiedIcon from "@mui/icons-material/Verified";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { fetchArtist } from "../api/ncm";
import { formatCount, img } from "../api/normalize";
import { Cover } from "../components/Cover";
import { ErrorState, PageScaffold } from "../components/PageScaffold";
import { SectionHeader } from "../components/Section";
import { TrackList } from "../components/TrackList";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { radius } from "../theme";

/** Artist page: hot songs plus the album wall. */
export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const artistId = Number(id);
  const [tab, setTab] = useState(0);
  const { playTracks, openAlbum } = useTrackActions();

  const detail = useAsync(() => {
    if (!Number.isFinite(artistId)) throw new Error("歌手 ID 无效");
    return fetchArtist(artistId);
  }, [artistId]);

  if (detail.loading) {
    return (
      <PageScaffold>
        <Stack direction="row" spacing={3} sx={{ mb: 3, alignItems: "center" }}>
          <Skeleton variant="circular" width={140} height={140} />
          <Stack spacing={1.5} sx={{ flex: 1 }}>
            <Skeleton variant="text" width="30%" height={40} />
            <Skeleton variant="text" width="50%" />
          </Stack>
        </Stack>
        <Skeleton
          variant="rounded"
          height={260}
          sx={{ borderRadius: `${radius.md}px` }}
        />
      </PageScaffold>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <PageScaffold>
        <ErrorState
          message={detail.error ?? "歌手不存在"}
          onRetry={detail.reload}
        />
      </PageScaffold>
    );
  }

  const { artist, hotSongs, albums } = detail.data;
  const source = { kind: "artist" as const, id: artist.id, name: artist.name };

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
            backgroundImage: artist.picUrl
              ? `url(${img(artist.picUrl, 300)})`
              : "none",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            filter: "blur(70px) saturate(130%)",
            opacity: 0.2,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent 0%, ${alpha("#0B0B0F", 0.9)} 100%)`,
          }}
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2.5}
          sx={{
            position: "relative",
            alignItems: { xs: "center", sm: "center" },
          }}
        >
          <Avatar
            src={artist.picUrl}
            sx={{
              width: { xs: 132, sm: 148 },
              height: { xs: 132, sm: 148 },
              boxShadow: `0 20px 46px ${alpha("#000", 0.5)}`,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
            <Chip
              label="歌手"
              size="small"
              sx={{ bgcolor: alpha("#FFFFFF", 0.08), mb: 1 }}
            />
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="h1">{artist.name}</Typography>
              <VerifiedIcon sx={{ color: "primary.main", fontSize: 20 }} />
            </Stack>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ mt: 1, mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }}
            >
              {artist.albumSize ? (
                <Chip
                  label={`${artist.albumSize} 张专辑`}
                  size="small"
                  sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
                />
              ) : null}
              {artist.musicSize ? (
                <Chip
                  label={`${formatCount(artist.musicSize)} 首歌曲`}
                  size="small"
                  sx={{ bgcolor: alpha("#FFFFFF", 0.07) }}
                />
              ) : null}
            </Stack>
            {artist.briefDesc ? (
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
                  maxWidth: 720,
                }}
              >
                {artist.briefDesc}
              </Typography>
            ) : null}
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                disabled={!hotSongs.length}
                onClick={() => playTracks(hotSongs, 0, source)}
              >
                播放热门歌曲
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Tabs
        value={tab}
        onChange={(_event, value: number) => setTab(value)}
        sx={{ px: { xs: 1.5, md: 2.5 } }}
      >
        <Tab label={`热门歌曲 ${hotSongs.length}`} />
        <Tab label={`专辑 ${albums.length}`} />
      </Tabs>

      {tab === 0 ? (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            px: { xs: 1, md: 1.5 },
          }}
        >
          <TrackList
            tracks={hotSongs}
            source={source}
            showHeader={false}
            emptyText="没有取到热门歌曲"
          />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            px: { xs: 1.5, md: 2.5 },
            py: 2,
          }}
        >
          <SectionHeader title="专辑" subtitle={`共 ${albums.length} 张`} />
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
              pb: 3,
            }}
          >
            {albums.map((album) => (
              <Stack
                key={album.id}
                spacing={0.75}
                onClick={() => openAlbum(album.id)}
                sx={{
                  cursor: "pointer",
                  p: 0.75,
                  borderRadius: `${radius.md}px`,
                  "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
                }}
              >
                <Cover
                  src={album.picUrl}
                  size={400}
                  width="100%"
                  sx={{ aspectRatio: "1 / 1" }}
                  radiusSize={radius.md}
                  alt={album.name}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {album.name}
                </Typography>
                {album.size ? (
                  <Typography
                    variant="caption"
                    sx={{ color: "text.disabled", fontSize: 10 }}
                  >
                    {album.size} 首
                  </Typography>
                ) : null}
              </Stack>
            ))}
            {!albums.length ? (
              <Typography variant="body2" sx={{ color: "text.disabled" }}>
                没有取到专辑数据
              </Typography>
            ) : null}
          </Box>
        </Box>
      )}
    </PageScaffold>
  );
}
