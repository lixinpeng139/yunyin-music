import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer, type QueueSource } from "../player/store";
import { useAuth } from "../store/auth";
import type { Playlist, Track } from "../types/ncm";

/**
 * The handful of verbs that every list of songs needs. Centralised so the
 * "play this" semantics stay identical across pages.
 */
export function useTrackActions() {
  const navigate = useNavigate();

  const playTracks = useCallback(
    (
      tracks: Track[],
      startIndex = 0,
      source: QueueSource | null = null,
      mode?: "heart" | "roam",
    ) => {
      void usePlayer
        .getState()
        .playQueue(tracks, startIndex, source, mode ? { mode } : undefined);
    },
    [],
  );

  const playNow = useCallback(
    (track: Track, source: QueueSource | null = null) => {
      void usePlayer.getState().playTrack(track, source);
    },
    [],
  );

  const playNext = useCallback((track: Track) => {
    usePlayer.getState().appendToQueue([track], { next: true });
    usePlayer.getState().notify("已添加到下一首播放", "success");
  }, []);

  const addToQueue = useCallback((track: Track) => {
    usePlayer.getState().appendToQueue([track]);
    usePlayer.getState().notify("已添加到播放队列", "success");
  }, []);

  const toggleLike = useCallback((trackId: number) => {
    void useAuth.getState().toggleLike(trackId);
  }, []);

  const openPlaylist = useCallback(
    (playlist: Playlist | number) => {
      const id = typeof playlist === "number" ? playlist : playlist.id;
      navigate(`/playlist/${id}`);
    },
    [navigate],
  );

  const openAlbum = useCallback(
    (albumId: number) => {
      navigate(`/album/${albumId}`);
    },
    [navigate],
  );

  const openArtist = useCallback(
    (artistId: number) => {
      navigate(`/artist/${artistId}`);
    },
    [navigate],
  );

  return {
    playTracks,
    playNow,
    playNext,
    addToQueue,
    toggleLike,
    openPlaylist,
    openAlbum,
    openArtist,
  };
}
