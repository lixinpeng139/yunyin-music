import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import AlbumIcon from "@mui/icons-material/Album";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ExploreIcon from "@mui/icons-material/Explore";
import FavoriteIcon from "@mui/icons-material/Favorite";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import LoginIcon from "@mui/icons-material/Login";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import RadarIcon from "@mui/icons-material/Radar";
import RadioIcon from "@mui/icons-material/Radio";
import RecommendIcon from "@mui/icons-material/Recommend";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";

export const SIDEBAR_WIDTH = 248;

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "发现音乐", icon: <ExploreIcon />, end: true },
  { to: "/radar", label: "私人雷达", icon: <RadarIcon /> },
  { to: "/daily", label: "每日推荐", icon: <RecommendIcon /> },
  { to: "/heart", label: "心动模式", icon: <AutoAwesomeIcon /> },
  { to: "/roam", label: "漫游 · 私人FM", icon: <RadioIcon /> },
];

const LIBRARY_NAV: NavItem[] = [
  { to: "/liked", label: "我喜欢的音乐", icon: <FavoriteIcon /> },
  { to: "/charts", label: "排行榜", icon: <GraphicEqIcon /> },
];

function UserCard() {
  const status = useAuth((state) => state.status);
  const profile = useAuth((state) => state.profile);
  const setLoginOpen = useUi((state) => state.setLoginOpen);
  const navigate = useNavigate();

  if (status === "booting") {
    return (
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ alignItems: "center", p: 1.25 }}
      >
        <Skeleton variant="circular" width={38} height={38} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="45%" height={12} />
        </Box>
      </Stack>
    );
  }

  if (status !== "authenticated" || !profile) {
    return (
      <Box sx={{ p: 1.25 }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={<LoginIcon />}
          onClick={() => setLoginOpen(true)}
          sx={{ justifyContent: "center" }}
        >
          登录网易云
        </Button>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 1,
            color: "text.disabled",
            lineHeight: 1.5,
          }}
        >
          登录后可听完整歌曲、使用每日推荐与心动模式
        </Typography>
      </Box>
    );
  }

  return (
    <ListItemButton
      onClick={() => navigate("/liked")}
      sx={{
        mx: 0.75,
        my: 0.5,
        gap: 1.25,
        py: 0.75,
        // The rail is a column flexbox and ListItemButton grows by default,
        // which would stretch this row to fill the whole sidebar.
        flexGrow: 0,
        flexShrink: 0,
      }}
    >
      <Avatar src={profile.avatarUrl} sx={{ width: 38, height: 38 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {profile.nickname}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          {profile.vipType ? (
            <Chip
              label="VIP"
              size="small"
              sx={{
                height: 16,
                fontSize: 9,
                bgcolor: alpha("#FFB4AB", 0.16),
                color: "error.main",
              }}
            />
          ) : null}
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            Lv.{profile.level ?? "—"}
          </Typography>
        </Stack>
      </Box>
    </ListItemButton>
  );
}

function NavSection({ items }: { items: NavItem[] }) {
  return (
    <List dense disablePadding sx={{ px: 0.75 }}>
      {items.map((item) => (
        <ListItemButton
          key={item.to}
          component={NavLink}
          to={item.to}
          end={item.end}
          sx={{
            gap: 1.25,
            py: 0.85,
            mb: 0.25,
            color: "text.secondary",
            "& .MuiListItemIcon-root": { minWidth: 0, color: "inherit" },
            "&.active": {
              color: "primary.main",
              bgcolor: alpha("#B9A6FF", 0.14),
              "& .MuiListItemText-primary": { fontWeight: 700 },
            },
          }}
        >
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText
            primary={item.label}
            slotProps={{
              primary: { variant: "body2", sx: { fontWeight: 600 } },
            }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}

/** Chrome left rail: navigation, the account card and the user's playlists. */
export function Sidebar() {
  const status = useAuth((state) => state.status);
  const playlists = useAuth((state) => state.playlists);
  const loading = useAuth((state) => state.loadingPlaylists);
  const loadPlaylists = useAuth((state) => state.loadPlaylists);
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (status === "authenticated") void loadPlaylists();
  }, [status, loadPlaylists]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return playlists;
    return playlists.filter((playlist) =>
      playlist.name.toLowerCase().includes(term),
    );
  }, [playlists, filter]);

  return (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        flex: "0 0 auto",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: alpha("#0E0E14", 0.72),
        backdropFilter: "blur(28px)",
        borderRight: `1px solid ${alpha("#FFFFFF", 0.06)}`,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          px: 2,
          pt: 1.75,
          pb: 1.25,
          flex: "0 0 auto",
        }}
      >
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: "9px 14px 9px 14px",
            background: "linear-gradient(135deg, #B9A6FF 0%, #F0B6D0 100%)",
            display: "grid",
            placeItems: "center",
            color: "#1A1030",
            fontWeight: 900,
            fontSize: 14,
          }}
        >
          云
        </Box>
        <Typography variant="h5" sx={{ letterSpacing: 0.5, flex: 1 }}>
          云音
        </Typography>
        <Tooltip title="收起侧栏">
          <IconButton
            size="small"
            onClick={toggleSidebar}
            aria-label="收起侧栏"
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <UserCard />
      <Divider sx={{ mx: 2, my: 1 }} />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>
        <NavSection items={PRIMARY_NAV} />
        <Typography
          variant="overline"
          sx={{
            display: "block",
            px: 2.25,
            pt: 2,
            pb: 0.5,
            color: "text.disabled",
            fontSize: 10,
          }}
        >
          我的音乐
        </Typography>
        <NavSection items={LIBRARY_NAV} />

        {status === "authenticated" ? (
          <>
            <Typography
              variant="overline"
              sx={{
                display: "block",
                px: 2.25,
                pt: 2,
                pb: 0.5,
                color: "text.disabled",
                fontSize: 10,
              }}
            >
              我的歌单
            </Typography>
            {playlists.length > 8 ? (
              <Box sx={{ px: 1.75, pb: 0.5 }}>
                <Box
                  component="input"
                  value={filter}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setFilter(event.target.value)
                  }
                  placeholder="搜索歌单"
                  sx={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    bgcolor: alpha("#FFFFFF", 0.05),
                    color: "text.primary",
                    borderRadius: `${radius.sm}px`,
                    px: 1.25,
                    py: 0.6,
                    fontSize: 12,
                    "&::placeholder": { color: "text.disabled" },
                  }}
                />
              </Box>
            ) : null}
            {loading && !playlists.length ? (
              <Stack spacing={0.75} sx={{ px: 1.75, pt: 0.5 }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    variant="text"
                    width={`${60 + ((index * 11) % 35)}%`}
                  />
                ))}
              </Stack>
            ) : (
              <List dense disablePadding sx={{ px: 0.75 }}>
                {visible.map((playlist) => (
                  <ListItemButton
                    key={playlist.id}
                    component={NavLink}
                    to={`/playlist/${playlist.id}`}
                    sx={{
                      py: 0.5,
                      gap: 1,
                      color: "text.secondary",
                      "&.active": {
                        bgcolor: alpha("#FFFFFF", 0.06),
                        color: "text.primary",
                      },
                    }}
                  >
                    <QueueMusicIcon sx={{ fontSize: 16, opacity: 0.6 }} />
                    <ListItemText
                      primary={playlist.name}
                      slotProps={{
                        primary: { variant: "caption", noWrap: true },
                      }}
                    />
                  </ListItemButton>
                ))}
                {!visible.length ? (
                  <Typography
                    variant="caption"
                    sx={{ px: 2, color: "text.disabled" }}
                  >
                    没有匹配的歌单
                  </Typography>
                ) : null}
              </List>
            )}
          </>
        ) : null}
      </Box>

      <Box
        sx={{
          px: 2,
          py: 1.25,
          flex: "0 0 auto",
          borderTop: `1px solid ${alpha("#FFFFFF", 0.05)}`,
        }}
      >
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center", color: "text.disabled" }}
        >
          <AlbumIcon sx={{ fontSize: 14 }} />
          <Typography variant="caption">云音 · 非官方客户端</Typography>
        </Stack>
      </Box>
    </Box>
  );
}
