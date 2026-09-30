import {
  Avatar,
  Box,
  CircularProgress,
  Dialog,
  Divider,
  Button,
  InputBase,
  List,
  ListItemButton,
  Stack,
  Tab,
  Tabs,
  Typography,
  alpha,
} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { search, type SearchResult } from "../api/ncm";
import { formatCount } from "../api/normalize";
import { useTrackActions } from "../hooks/useTrackActions";
import { useUi } from "../store/ui";
import { radius } from "../theme";
import { Cover } from "./Cover";
import { SectionHeader } from "./Section";
import { TrackList } from "./TrackList";


/** Command-palette style search over songs, playlists, artists and albums. */
export function SearchOverlay() {
  const open = useUi((state) => state.searchOpen);
  const setOpen = useUi((state) => state.setSearchOpen);
  const { openPlaylist, openArtist, openAlbum } = useTrackActions();

  const [term, setTerm] = useState("");
  const [tab, setTab] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** NetEase's rate limiter answers 405 with 「操作频繁」. */
  const rateLimited = Boolean(error && /操作频繁|频繁|405/.test(error));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setTerm("");
      setResult(null);
      setError(null);
      setTab(0);
    }
  }, [open]);

  const runSearch = useCallback(async (keywords: string) => {
    const trimmed = keywords.trim();
    if (!trimmed) {
      setResult(null);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // One request per submitted query. Previously this also fetched
      // suggestions on every debounced keystroke, so a short phrase cost a
      // dozen calls and easily tripped NetEase's rate limiter.
      const hits = await search(trimmed);
      if (seq !== requestSeq.current) return;
      setResult(hits);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : "搜索失败");
      setResult(null);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  /** Runs the search only when the user asks for it. */
  const submit = useCallback(() => {
    void runSearch(term);
  }, [runSearch, term]);

  const counts = useMemo(
    () => ({
      songs: result?.tracks.length ?? 0,
      playlists: result?.playlists.length ?? 0,
      artists: result?.artists.length ?? 0,
      albums: result?.albums.length ?? 0,
    }),
    [result],
  );

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: `${radius.lg}px`,
            mt: -8,
            height: "min(78vh, 720px)",
          },
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", px: 2.5, py: 1.5 }}
      >
        <SearchIcon sx={{ color: "text.disabled" }} />
        <InputBase
          inputRef={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="输入后按回车搜索"
          fullWidth
          sx={{ fontSize: 16 }}
        />
        <Button
          size="small"
          variant="contained"
          onClick={submit}
          disabled={loading || !term.trim()}
          sx={{ flex: "0 0 auto", minWidth: 64 }}
        >
          搜索
        </Button>
        {loading ? <CircularProgress size={18} /> : null}
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          ESC 关闭
        </Typography>
      </Stack>
      <Divider />

      {result ? (
        <Tabs
          value={tab}
          onChange={(_event, value: number) => setTab(value)}
          sx={{
            px: 2,
            minHeight: 40,
            borderBottom: `1px solid ${alpha("#FFFFFF", 0.06)}`,
          }}
        >
          <Tab label={`单曲 ${counts.songs}`} />
          <Tab label={`歌单 ${counts.playlists}`} />
          <Tab label={`歌手 ${counts.artists}`} />
          <Tab label={`专辑 ${counts.albums}`} />
        </Tabs>
      ) : null}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          p: 1.5,
        }}
      >
        {error ? (
          <Stack
            spacing={1.25}
            sx={{ p: 4, alignItems: "center", textAlign: "center" }}
          >
            <ErrorOutlineIcon sx={{ fontSize: 32, color: "warning.main" }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {rateLimited ? "请求过于频繁" : "搜索失败"}
            </Typography>
            {/* NetEase answers 405 when a burst of requests trips its rate
                limiter; saying so avoids reading like the search is broken. */}
            <Typography variant="caption" sx={{ color: "text.disabled", maxWidth: 340 }}>
              {rateLimited
                ? "网易云暂时限制了请求频率，通常等待几分钟即可恢复。"
                : error}
            </Typography>
          </Stack>
        ) : !term.trim() ? (
          <Stack
            spacing={1}
            sx={{ p: 4, alignItems: "center", color: "text.disabled" }}
          >
            <SearchIcon sx={{ fontSize: 34, opacity: 0.35 }} />
            <Typography variant="body2">输入关键词开始搜索</Typography>
            <Typography variant="caption">
              回车搜索 · 支持歌手 / 歌单 / 专辑
            </Typography>
          </Stack>
        ) : !result && loading ? (
          <Stack spacing={1} sx={{ p: 4, alignItems: "center" }}>
            <CircularProgress size={22} />
          </Stack>
        ) : result && tab === 0 ? (
          <TrackList
            tracks={result.tracks}
            source={{ kind: "search", name: term }}
            showHeader={false}
          />
        ) : result && tab === 1 ? (
          <Box sx={{ overflowY: "auto", p: 1 }}>
            <SectionHeader
              title="歌单"
              subtitle={`共 ${counts.playlists} 个结果`}
            />
            <List>
              {result.playlists.map((playlist) => (
                <ListItemButton
                  key={playlist.id}
                  onClick={() => {
                    setOpen(false);
                    openPlaylist(playlist.id);
                  }}
                  sx={{ gap: 1.5, borderRadius: `${radius.sm}px` }}
                >
                  <Cover
                    src={playlist.coverImgUrl}
                    size={120}
                    width={44}
                    radiusSize={radius.xs}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {playlist.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.disabled" }}
                    >
                      {playlist.creatorName ?? "网易云音乐"} ·{" "}
                      {playlist.trackCount ?? 0} 首 ·{" "}
                      {formatCount(playlist.playCount)} 播放
                    </Typography>
                  </Box>
                </ListItemButton>
              ))}
              {!result.playlists.length ? (
                <Typography
                  variant="body2"
                  sx={{ p: 2, color: "text.disabled" }}
                >
                  没有找到相关歌单
                </Typography>
              ) : null}
            </List>
          </Box>
        ) : result && tab === 2 ? (
          <Box sx={{ overflowY: "auto", p: 1 }}>
            <SectionHeader
              title="歌手"
              subtitle={`共 ${counts.artists} 个结果`}
            />
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                p: 1,
              }}
            >
              {result.artists.map((artist) => (
                <Stack
                  key={artist.id}
                  spacing={1}
                  onClick={() => {
                    setOpen(false);
                    openArtist(artist.id);
                  }}
                  sx={{
                    alignItems: "center",
                    p: 1.5,
                    borderRadius: `${radius.md}px`,
                    cursor: "pointer",
                    "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
                  }}
                >
                  <Avatar src={artist.picUrl} sx={{ width: 72, height: 72 }} />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontWeight: 600, maxWidth: "100%" }}
                  >
                    {artist.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    {artist.albumSize ?? 0} 张专辑
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Box>
        ) : result && tab === 3 ? (
          <Box sx={{ overflowY: "auto", p: 1 }}>
            <SectionHeader
              title="专辑"
              subtitle={`共 ${counts.albums} 个结果`}
            />
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                p: 1,
              }}
            >
              {result.albums.map((album) => (
                <Stack
                  key={album.id}
                  spacing={0.75}
                  onClick={() => {
                    setOpen(false);
                    openAlbum(album.id);
                  }}
                  sx={{
                    cursor: "pointer",
                    p: 0.75,
                    borderRadius: `${radius.md}px`,
                    "&:hover": { bgcolor: alpha("#FFFFFF", 0.05) },
                  }}
                >
                  <Cover
                    src={album.picUrl}
                    size={300}
                    width="100%"
                    sx={{ aspectRatio: "1 / 1" }}
                    radiusSize={radius.sm}
                  />
                  <Typography variant="caption" noWrap sx={{ fontWeight: 600 }}>
                    {album.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: "text.disabled" }}
                  >
                    {album.artist?.name ?? album.artists?.[0]?.name ?? ""}
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 4, textAlign: "center", color: "text.disabled" }}>
            <Typography variant="body2">没有找到结果</Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}
