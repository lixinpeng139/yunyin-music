import {
  Box,
  Button,
  Chip,
  Stack,
  Tab,
  Tabs,
  Typography,
  alpha,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LoginIcon from "@mui/icons-material/Login";
import RadarIcon from "@mui/icons-material/Radar";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPlaylistDetail,
  fetchPlaylistTracks,
  fetchRadarPlaylists,
  fetchTopPlaylists,
} from "../api/ncm";
import { Cover } from "../components/Cover";
import {
  CardGridSkeleton,
  SectionHeader,
  Surface,
} from "../components/Section";
import {
  ErrorState,
  PageMessage,
  PageScaffold,
} from "../components/PageScaffold";
import { PlaylistCard } from "../components/PlaylistCard";
import { TrackList } from "../components/TrackList";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import type { Playlist, Track } from "../types/ncm";

/**
 * A single radar entry.
 *
 * 私人雷达 is a *playlist* whose contents are regenerated daily, so the page
 * shows the entry card and lazily loads its tracks when expanded.
 */
function RadarEntry({
  playlist,
  expanded,
  onToggle,
}: {
  playlist: Playlist;
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const { playTracks } = useTrackActions();
  const detail = useAsync<{
    tracks: Track[];
    total: number;
  } | null>(async () => {
    if (!expanded) return null;
    const result = await fetchPlaylistDetail(playlist.id);
    let tracks = result.tracks;
    if ((result.playlist.trackCount ?? 0) > tracks.length) {
      tracks = await fetchPlaylistTracks(playlist.id);
    }
    return { tracks, total: result.playlist.trackCount ?? tracks.length };
  }, [expanded, playlist.id]);

  const reason = playlist.copywriter ?? playlist.recReason;

  return (
    <Surface sx={{ p: 2, mb: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <Cover
          src={playlist.coverImgUrl}
          size={300}
          width={92}
          radiusSize={radius.md}
          squircle
          alt={playlist.name}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", mb: 0.5 }}
          >
            <Chip
              label="雷达"
              size="small"
              sx={{
                bgcolor: alpha("#B9A6FF", 0.18),
                color: "primary.main",
                height: 20,
              }}
            />
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              {playlist.trackCount ?? 0} 首 · 每日 6:00 更新
            </Typography>
          </Stack>
          <Typography variant="h3" noWrap>
            {playlist.name}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: reason ? "primary.main" : "text.secondary",
              mt: 0.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {reason ?? playlist.description ?? "根据你的收听记录生成的私人歌单"}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: "row", sm: "column" }}
          spacing={1}
          sx={{ flex: "0 0 auto" }}
        >
          <Button
            variant="contained"
            onClick={() => {
              if (detail.data?.tracks.length) {
                playTracks(detail.data.tracks, 0, {
                  kind: "radar",
                  id: playlist.id,
                  name: playlist.name,
                });
              } else {
                navigate(`/playlist/${playlist.id}`);
              }
            }}
          >
            播放
          </Button>
          <Button
            variant="outlined"
            onClick={onToggle}
            sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
          >
            {expanded ? "收起曲目" : "展开曲目"}
          </Button>
        </Stack>
      </Stack>

      {expanded ? (
        <Box sx={{ mt: 1.5, height: 420, display: "flex" }}>
          {detail.loading ? (
            <Box sx={{ width: "100%" }}>
              <CardGridSkeleton count={4} />
            </Box>
          ) : detail.error ? (
            <ErrorState message={detail.error} onRetry={detail.reload} />
          ) : (
            <TrackList
              tracks={detail.data?.tracks ?? []}
              source={{ kind: "radar", id: playlist.id, name: playlist.name }}
              showHeader={false}
              dense
            />
          )}
        </Box>
      ) : null}
    </Surface>
  );
}

/** 私人雷达 — personalised, regenerated daily, plus a discovery fallback. */
export function RadarPage() {
  const status = useAuth((state) => state.status);
  const setLoginOpen = useUi((state) => state.setLoginOpen);
  const [tab, setTab] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [seed, setSeed] = useState(0);

  const radar = useAsync<Playlist[]>(() => fetchRadarPlaylists(8), [seed]);
  const hot = useAsync<Playlist[]>(() => fetchTopPlaylists(12, "流行"), [seed]);

  const summary = useMemo(
    () =>
      (radar.data ?? []).reduce(
        (sum, playlist) => sum + (playlist.trackCount ?? 0),
        0,
      ),
    [radar.data],
  );

  if (status === "anonymous") {
    return (
      <PageScaffold>
        <PageMessage
          icon={<RadarIcon />}
          title="私人雷达需要登录"
          description="网易云音乐的私人雷达基于你的收听历史生成，登录后即可看到属于你的每日雷达歌单。"
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
        <SectionHeader
          title="没有账号？先听听热门歌单"
          subtitle="无需登录即可播放"
        />
        <Box
          sx={{
            display: "grid",
            gap: 1.25,
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {(hot.data ?? []).map((playlist, index) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              index={index}
            />
          ))}
        </Box>
      </PageScaffold>
    );
  }

  const entries = radar.data ?? [];

  return (
    <PageScaffold>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", mb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: "primary.main" }}>
            PERSONAL RADAR
          </Typography>
          <Typography variant="h1">私人雷达</Typography>
          <Typography variant="body2" sx={{ color: "text.disabled", mt: 0.5 }}>
            每天 6:00 根据你的口味重新生成 · 共 {summary} 首推荐
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => {
            setSeed((value) => value + 1);
            radar.reload();
          }}
          sx={{ color: "text.secondary" }}
        >
          刷新
        </Button>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_event, value: number) => setTab(value)}
        sx={{ mb: 2 }}
      >
        <Tab label="雷达歌单" />
        <Tab label="发现好歌" />
      </Tabs>

      {tab === 0 ? (
        radar.loading ? (
          <CardGridSkeleton count={6} />
        ) : radar.error ? (
          <ErrorState message={radar.error} onRetry={radar.reload} />
        ) : entries.length ? (
          entries.map((playlist) => (
            <RadarEntry
              key={playlist.id}
              playlist={playlist}
              expanded={expandedId === playlist.id}
              onToggle={() =>
                setExpandedId((current) =>
                  current === playlist.id ? null : playlist.id,
                )
              }
            />
          ))
        ) : (
          <>
            <PageMessage
              title="网易云这次没有下发雷达数据"
              description="这个接口是间歇性的：同一个账号可能这一分钟有、下一分钟没有。稍后点「重新获取」即可，先看看下面的推荐。"
              action={
                <Button
                  variant="outlined"
                  onClick={radar.reload}
                  sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
                >
                  重新获取
                </Button>
              }
            />
            {(hot.data ?? []).length ? (
              <>
                <SectionHeader
                  title="先听这些"
                  subtitle="雷达缺失时的替代推荐"
                  icon={<AutoAwesomeIcon />}
                />
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  }}
                >
                  {(hot.data ?? []).map((playlist, index) => (
                    <PlaylistCard
                      key={playlist.id}
                      playlist={playlist}
                      index={index}
                    />
                  ))}
                </Box>
              </>
            ) : null}
          </>
        )
      ) : (
        <>
          <SectionHeader
            title="为你发现"
            subtitle="热门歌单中挑出的新鲜内容"
            icon={<AutoAwesomeIcon />}
          />
          <Box
            sx={{
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {(hot.data ?? []).map((playlist, index) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                index={index}
              />
            ))}
          </Box>
        </>
      )}
    </PageScaffold>
  );
}
