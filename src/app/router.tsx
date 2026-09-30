import { Box, Button, Stack, Typography, alpha } from "@mui/material";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import {
  Navigate,
  createBrowserRouter,
  useNavigate,
  useRouteError,
} from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AlbumPage } from "../pages/AlbumPage";
import { ArtistPage } from "../pages/ArtistPage";
import { ChartsPage } from "../pages/ChartsPage";
import { DailyPage } from "../pages/DailyPage";
import { DiscoverPage } from "../pages/DiscoverPage";
import { HeartPage } from "../pages/HeartPage";
import { LikedPage } from "../pages/LikedPage";
import { PlaylistPage } from "../pages/PlaylistPage";
import { RadarPage } from "../pages/RadarPage";
import { RoamPage } from "../pages/RoamPage";

function ErrorScreen() {
  const error = useRouteError() as
    { message?: string; statusText?: string } | undefined;
  const navigate = useNavigate();
  return (
    <Stack
      spacing={2}
      sx={{
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        p: 4,
      }}
    >
      <SentimentDissatisfiedIcon
        sx={{ fontSize: 42, color: "text.disabled" }}
      />
      <Typography variant="h2">页面出错了</Typography>
      <Typography
        variant="body2"
        sx={{ color: "text.disabled", textAlign: "center", maxWidth: 460 }}
      >
        {error?.statusText ?? error?.message ?? "发生了未知错误"}
      </Typography>
      <Button
        variant="outlined"
        onClick={() => navigate("/")}
        sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
      >
        返回发现页
      </Button>
    </Stack>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <Stack
      spacing={2}
      sx={{
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        p: 4,
      }}
    >
      <Box sx={{ fontSize: 40 }}>🎧</Box>
      <Typography variant="h2">这里什么都没有</Typography>
      <Button variant="contained" onClick={() => navigate("/")}>
        回到发现页
      </Button>
    </Stack>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <ErrorScreen />,
    children: [
      { index: true, element: <DiscoverPage /> },
      { path: "radar", element: <RadarPage /> },
      { path: "daily", element: <DailyPage /> },
      { path: "heart", element: <HeartPage /> },
      { path: "roam", element: <RoamPage /> },
      { path: "liked", element: <LikedPage /> },
      { path: "charts", element: <ChartsPage /> },
      { path: "playlist/:id", element: <PlaylistPage /> },
      { path: "album/:id", element: <AlbumPage /> },
      { path: "artist/:id", element: <ArtistPage /> },
      { path: "discover", element: <Navigate to="/" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
