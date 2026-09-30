import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { RouteTransition } from "./RouteTransition";
import { waitForApi } from "../api/client";
import { usePlayer } from "../player/store";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { SIDEBAR_WIDTH, Sidebar } from "./Sidebar";
import { LoginDialog } from "./LoginDialog";
import { Notice } from "./Notice";
import { NowPlaying } from "./NowPlaying";
import { PlayerBar } from "./PlayerBar";
import { QueueDrawer } from "./QueueDrawer";
import { SearchOverlay } from "./SearchOverlay";

/** Top strip with window-level actions; intentionally minimal. */
function TopBar() {
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setSearchOpen = useUi((state) => state.setSearchOpen);
  const navigate = useNavigate();

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: "center",
        height: 52,
        flex: "0 0 auto",
        px: 1.5,
        gap: 1,
        minWidth: 0,
        borderBottom: `1px solid ${alpha("#FFFFFF", 0.05)}`,
        bgcolor: alpha("#0B0B0F", 0.5),
        backdropFilter: "blur(20px)",
      }}
    >
      {!sidebarOpen ? (
        // A native `title` rather than <Tooltip>: the tooltip's fixed-position
        // popper sat exactly over this corner, and a stray second copy of this
        // button used to render on top of it. Keeping the top bar free of
        // poppers removes a whole class of overlap in the one region that is
        // always visible.
        <IconButton
          size="small"
          onClick={toggleSidebar}
          aria-label="展开侧栏"
          title="展开侧栏"
        >
          <MenuIcon fontSize="small" />
        </IconButton>
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0 }} />
      <Box
        onClick={() => setSearchOpen(true)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          // Prefer the ideal width but yield to what is actually available; a
          // fixed 300px overflowed narrow windows and pushed this box and the
          // button beside it past the right edge.
          flex: "0 1 auto",
          width: { xs: 180, md: 300 },
          maxWidth: "100%",
          minWidth: 0,
          px: 1.5,
          py: 0.6,
          borderRadius: "999px",
          bgcolor: alpha("#FFFFFF", 0.06),
          border: `1px solid ${alpha("#FFFFFF", 0.06)}`,
          cursor: "pointer",
          color: "text.disabled",
          transition: "background-color .16s ease",
          "&:hover": { bgcolor: alpha("#FFFFFF", 0.1) },
        }}
      >
        <SearchIcon sx={{ fontSize: 17, flex: "0 0 auto" }} />
        {/* `minWidth: 0` is required: without it the CJK label refuses to
            shrink and forces the whole box wider than its container. */}
        <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
          搜索歌曲、歌手、歌单
        </Typography>
        <Typography
          variant="caption"
          noWrap
          sx={{
            opacity: 0.6,
            fontFamily: "monospace",
            flex: "0 0 auto",
            display: { xs: "none", sm: "block" },
          }}
        >
          Ctrl K
        </Typography>
      </Box>
      <IconButton
        size="small"
        onClick={() => navigate("/charts")}
        aria-label="排行榜"
        title="排行榜"
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

/** Shown while the bundled API sidecar is still coming up. */
function BootingScreen({ onRetry }: { onRetry: () => void }) {
  const error = useAuth((state) => state.apiError);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Stack
      spacing={2.5}
      sx={{
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        textAlign: "center",
        px: 4,
      }}
    >
      <Box
        sx={{
          width: 54,
          height: 54,
          borderRadius: "18px 28px 18px 28px",
          background: "linear-gradient(135deg, #B9A6FF 0%, #F0B6D0 100%)",
          display: "grid",
          placeItems: "center",
          color: "#1A1030",
          fontWeight: 900,
          fontSize: 26,
        }}
      >
        云
      </Box>
      <Typography variant="h2">正在启动本地音乐服务</Typography>
      <Typography variant="body2" sx={{ color: "text.disabled", maxW: 420 }}>
        {error
          ? `后台服务没有响应：${error}`
          : `云音依赖一个内嵌的本地 API 进程连接网易云音乐，首次启动需要几秒钟（已等待 ${elapsed}s）`}
      </Typography>
      <CircularProgress size={22} />
      <Button
        variant="outlined"
        onClick={onRetry}
        sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
      >
        重新检测
      </Button>
    </Stack>
  );
}

/** Application shell: chrome, routing outlet, overlays and global shortcuts. */
export function AppShell() {
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setSearchOpen = useUi((state) => state.setSearchOpen);
  const apiReady = useAuth((state) => state.apiReady);
  const boot = useAuth((state) => state.boot);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    usePlayer.getState().init();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBooting(true);
      const reachable = await waitForApi(25_000);
      if (cancelled) return;
      if (!reachable) {
        useAuth.setState({
          apiError: "无法连接 127.0.0.1 上的本地 API 服务",
          apiReady: false,
        });
        setBooting(false);
        return;
      }
      useAuth.setState({ apiReady: true, apiError: null });
      await boot();
      if (!cancelled) setBooting(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [boot]);

  // Global keyboard shortcuts, mirroring the conventions of desktop players.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing) return;

      const player = usePlayer.getState();
      switch (event.key) {
        case " ":
          event.preventDefault();
          player.toggle();
          break;
        case "ArrowRight":
          if (event.shiftKey) void player.next({ userInitiated: true });
          else
            player.seek(
              Math.min(player.position + 5000, player.duration || Infinity),
            );
          break;
        case "ArrowLeft":
          if (event.shiftKey) void player.previous();
          else player.seek(Math.max(0, player.position - 5000));
          break;
        case "ArrowUp":
          event.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case "ArrowDown":
          event.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case "Escape":
          setSearchOpen(false);
          useUi.getState().setNowPlayingOpen(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSearchOpen]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {sidebarOpen ? <Sidebar /> : null}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <TopBar />
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {booting || !apiReady ? (
              <BootingScreen
                onRetry={() => {
                  void waitForApi(20_000).then((ok) => {
                    if (ok) {
                      useAuth.setState({ apiReady: true, apiError: null });
                      void boot();
                    }
                  });
                }}
              />
            ) : (
              <RouteTransition>
                <Outlet />
              </RouteTransition>
            )}
          </Box>
        </Box>
      </Box>

      <PlayerBar />
      <QueueDrawer />
      <NowPlaying />
      <LoginDialog />
      <Notice />
      <SearchOverlay />
    </Box>
  );
}

export { SIDEBAR_WIDTH };
