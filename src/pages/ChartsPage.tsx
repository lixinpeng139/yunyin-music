import {
  Box,
  Button,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
  alpha,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import { useMemo, useState } from "react";
import { fetchTopLists, fetchTopPlaylists, type TopList } from "../api/ncm";
import { Cover } from "../components/Cover";
import { ErrorState, PageScaffold } from "../components/PageScaffold";
import { PlaylistCard } from "../components/PlaylistCard";
import { SectionHeader } from "../components/Section";
import { useAsync } from "../hooks/useAsync";
import { useTrackActions } from "../hooks/useTrackActions";
import { radius } from "../theme";

const CATEGORIES = [
  "全部",
  "流行",
  "摇滚",
  "民谣",
  "电子",
  "说唱",
  "古风",
  "轻音乐",
  "爵士",
];

/** 排行榜 + 分类歌单. */
export function ChartsPage() {
  const { openPlaylist } = useTrackActions();
  const [tab, setTab] = useState(0);
  const [category, setCategory] = useState("全部");

  const official = useAsync<TopList[]>(() => fetchTopLists(), []);
  const byCategory = useAsync(
    () => fetchTopPlaylists(24, category),
    [category],
  );

  const topLists = useMemo(
    () => (official.data ?? []).filter((list) => list.id),
    [official.data],
  );

  return (
    <PageScaffold>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ color: "primary.main" }}>
            CHARTS
          </Typography>
          <Typography variant="h1">排行榜</Typography>
          <Typography variant="body2" sx={{ color: "text.disabled", mt: 0.5 }}>
            官方榜单每小时更新，分类歌单由编辑与算法共同维护
          </Typography>
        </Box>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_event, value: number) => setTab(value)}
        sx={{ mb: 2 }}
      >
        <Tab label="官方榜" icon={<GraphicEqIcon />} iconPosition="start" />
        <Tab label="分类歌单" />
      </Tabs>

      {tab === 0 ? (
        official.loading ? (
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            }}
          >
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton
                key={index}
                variant="rounded"
                height={96}
                sx={{ borderRadius: `${radius.md}px` }}
              />
            ))}
          </Box>
        ) : official.error ? (
          <ErrorState message={official.error} onRetry={official.reload} />
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              pb: 3,
            }}
          >
            {topLists.map((list) => (
              <Stack
                key={list.id}
                direction="row"
                spacing={1.5}
                onClick={() => openPlaylist(list.id)}
                sx={{
                  alignItems: "center",
                  p: 1.25,
                  borderRadius: `${radius.md}px`,
                  bgcolor: alpha("#FFFFFF", 0.035),
                  border: `1px solid ${alpha("#FFFFFF", 0.06)}`,
                  cursor: "pointer",
                  transition: "background-color .16s ease, transform .16s ease",
                  "&:hover": {
                    bgcolor: alpha("#FFFFFF", 0.07),
                    transform: "translateY(-2px)",
                  },
                }}
              >
                <Cover
                  src={list.coverImgUrl}
                  size={160}
                  width={58}
                  radiusSize={radius.sm}
                  squircle
                  alt={list.name}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {list.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: "text.disabled", display: "block" }}
                  >
                    {list.updateFrequency ?? "实时更新"}
                  </Typography>
                  {list.trackCount ? (
                    <Typography
                      variant="caption"
                      sx={{ color: "text.disabled", fontSize: 10 }}
                    >
                      {list.trackCount} 首
                    </Typography>
                  ) : null}
                </Box>
              </Stack>
            ))}
          </Box>
        )
      ) : (
        <>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ mb: 2, flexWrap: "wrap", rowGap: 0.75 }}
          >
            {CATEGORIES.map((option) => (
              <Button
                key={option}
                size="small"
                variant={category === option ? "contained" : "outlined"}
                onClick={() => setCategory(option)}
                sx={{
                  borderColor: alpha("#FFFFFF", 0.14),
                  color: category === option ? undefined : "text.secondary",
                  minWidth: 0,
                }}
              >
                {option}
              </Button>
            ))}
          </Stack>

          <SectionHeader title={`${category}歌单`} subtitle="按热度排序" />
          {byCategory.loading ? (
            <Box
              sx={{
                display: "grid",
                gap: 1.25,
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              }}
            >
              {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton
                  key={index}
                  variant="rounded"
                  sx={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: `${radius.md}px`,
                  }}
                />
              ))}
            </Box>
          ) : byCategory.error ? (
            <ErrorState
              message={byCategory.error}
              onRetry={byCategory.reload}
            />
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 1.25,
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                pb: 3,
              }}
            >
              {(byCategory.data ?? []).map((playlist, index) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  index={index}
                />
              ))}
            </Box>
          )}
        </>
      )}
    </PageScaffold>
  );
}
