import { create } from "zustand";
import {
  checkQrSession,
  fetchAccount,
  fetchUserPlaylists,
  loginWithCaptcha,
  loginWithPassword,
  logout as apiLogout,
  sendCaptcha,
  setSongLiked,
  type QrSession,
} from "../api/ncm";
import { ApiError } from "../api/client";
import { clearSession, hasSession } from "../api/session";
import { usePlayer } from "../player/store";
import type { Playlist, UserProfile } from "../types/ncm";

type AuthStatus = "booting" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  profile: UserProfile | null;
  /**
   * Id of the account's own "我喜欢的音乐" playlist.
   *
   * 心动模式 derives neighbours from a playlist the account *owns*; passing the
   * user id (as an earlier version did) makes the endpoint answer code 400.
   */
  likedPlaylistId: number | null;
  playlists: Playlist[];
  /** Set when the sidecar could not be reached at all. */
  apiReady: boolean;
  apiError: string | null;
  loadingPlaylists: boolean;

  boot: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  loadPlaylists: (force?: boolean) => Promise<void>;
  loginWithQr: (
    session: QrSession,
  ) => Promise<{ ok: boolean; message: string; pending: boolean; code: number }>;
  loginByPhone: (
    phone: string,
    code: string,
    countrycode?: string,
  ) => Promise<string | null>;
  loginByPassword: (
    phone: string,
    password: string,
    countrycode?: string,
  ) => Promise<string | null>;
  requestCaptcha: (
    phone: string,
    countrycode?: string,
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  toggleLike: (songId: number) => Promise<void>;
  /** Structured trace of the most recent login attempt. */
  loginTrace: LoginTraceEntry[];
  clearLoginTrace: () => void;
}

/** One line of the login trace, surfaced in the UI when a flow fails. */
export interface LoginTraceEntry {
  step: string;
  detail: string;
  ok: boolean;
}

/** Formats an unknown thrown value for the trace. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: number }).code;
    // Risk control blocks password login no matter how right the credentials
    // are, so say what to do about it rather than just relaying the verdict.
    if (error instanceof ApiError && error.isRiskControl) {
      return `[${error.code}] ${error.message} —— 这是网易的风控拦截，不是密码错误。` +
        "请先等一段时间，然后改用「扫码登录」（走手机 App 授权，不受此限制）。";
    }
    return code !== undefined && code !== -1
      ? `[${code}] ${error.message}`
      : error.message;
  }
  return String(error);
}

/** Appends a step to the login trace exposed to the UI. */
function traceRecorder() {
  return (step: string, detail: string, ok: boolean) => {
    useAuth.setState((state) => ({
      loginTrace: [...state.loginTrace, { step, detail, ok }],
    }));
  };
}

/** Shared tail of both phone flows: confirm the session actually works. */
async function finishPhoneLogin(
  record: (step: string, detail: string, ok: boolean) => void,
): Promise<string | null> {
  try {
    const { profile, likedIds } = await fetchAccount();
    if (!profile) {
      record("账号", "会话有效但接口未返回账号信息", false);
      return "登录状态确认失败：账号信息为空";
    }
    usePlayer.getState().setLiked(likedIds);
    useAuth.setState({
      status: "authenticated",
      profile,
      apiReady: true,
      apiError: null,
    });
    record("账号", `已登录 ${profile.nickname}`, true);
    void useAuth.getState().loadPlaylists(true);
    return null;
  } catch (error) {
    const message = describeError(error);
    record("账号", message, false);
    return message;
  }
}

/** Asks the bridge whether it holds a usable session for this client. */
async function fetchSessionState(): Promise<boolean> {
  try {
    return await hasSession()
  } catch {
    return false
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "booting",
  profile: null,
  likedPlaylistId: null,
  playlists: [],
  apiReady: false,
  apiError: null,
  loadingPlaylists: false,
  loginTrace: [],

  async boot() {
    // Refresh the cached view the player store reads synchronously.
    await fetchSessionState();
    if (!(await hasSession())) {
      set({ status: "anonymous", profile: null, apiReady: true });
      return;
    }
    try {
      const { profile, likedIds } = await fetchAccount();
      if (!profile) {
        clearSession();
        set({ status: "anonymous", profile: null, apiReady: true });
        return;
      }
      usePlayer.getState().setLiked(likedIds);
      set({ status: "authenticated", profile, apiReady: true, apiError: null });
      void get().loadPlaylists();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Distinguish "sidecar is down" from "session expired".
      const offline = message.includes("无法连接");
      if (offline) {
        set({ status: "booting", apiReady: false, apiError: message });
        return;
      }
      clearSession();
      set({ status: "anonymous", profile: null, apiReady: true });
    }
  },

  async refreshAccount() {
    const { profile, likedIds } = await fetchAccount();
    if (!profile) {
      clearSession();
      usePlayer.getState().setLiked([]);
      set({ status: "anonymous", profile: null, likedPlaylistId: null, playlists: [] });
      return;
    }
    usePlayer.getState().setLiked(likedIds);
    set({ status: "authenticated", profile, apiReady: true, apiError: null });
  },

  async loadPlaylists(force = false) {
    const { profile, playlists, loadingPlaylists } = get();
    if (!profile || loadingPlaylists) return;
    if (playlists.length && !force) return;
    set({ loadingPlaylists: true });
    try {
      const list = await fetchUserPlaylists(profile.userId);
      // NetEase names this playlist "<nickname>喜欢的音乐". Matching on the
      // suffix rather than the nickname keeps it working after a rename.
      const liked = list.find((playlist) => playlist.name.includes("喜欢的音乐"));
      set({ playlists: list, likedPlaylistId: liked ? liked.id : null });
    } catch {
      set({ playlists: [] });
    } finally {
      set({ loadingPlaylists: false });
    }
  },

  clearLoginTrace() {
    set({ loginTrace: [] });
  },

  async loginWithQr(session) {
    const record = traceRecorder();
    try {
      const result = await checkQrSession(session.key);
      if (result.code !== 803) {
        // Only an explicit expiry verdict ends the session. Everything else —
        // 801, 802, and transport failures — means "keep polling".
        if (result.code === 800) {
          record("扫码", "二维码已过期", false);
          return { ok: false, pending: false, message: "二维码已过期", code: 800 };
        }
        if (result.transient) {
          return {
            ok: false,
            pending: true,
            message: result.message,
            code: result.code,
          };
        }
        return { ok: false, pending: true, message: result.message, code: result.code };
      }

      record("扫码", "手机已确认授权", true);
      // The bridge stores the session; the client only learns whether it exists.
      const signedIn = await fetchSessionState();
      record("会话", signedIn ? "会话已交由本地服务保存" : "接口没有返回会话凭据", signedIn);

      try {
        const { profile, likedIds } = await fetchAccount();
        if (!profile) {
          record("账号", "会话有效但接口未返回账号信息", false);
          return {
            ok: false,
            pending: false,
            message: "登录状态确认失败：账号信息为空",
            code: 803,
          };
        }
        await fetchSessionState();
        usePlayer.getState().setLiked(likedIds);
        set({ status: "authenticated", profile, apiReady: true, apiError: null });
        record("账号", `已登录 ${profile.nickname}`, true);
        void get().loadPlaylists(true);
        return { ok: true, pending: false, message: "登录成功", code: 803 };
      } catch (error) {
        const message = describeError(error);
        record("账号", message, false);
        return {
          ok: false,
          pending: false,
          message: `登录状态确认失败：${message}`,
          code: 803,
        };
      }
    } catch (error) {
      const message = describeError(error);
      record("扫码", message, false);
      return { ok: false, pending: false, message, code: -1 };
    }
  },

  async loginByPhone(phone, code, countrycode = "86") {
    const record = traceRecorder();
    try {
      await loginWithCaptcha(phone, code, countrycode);
      record("验证码登录", "接口已接受验证码", true);
      return await finishPhoneLogin(record);
    } catch (error) {
      const message = describeError(error);
      record("验证码登录", message, false);
      return message;
    }
  },

  async loginByPassword(phone, password, countrycode = "86") {
    const record = traceRecorder();
    try {
      await loginWithPassword(phone, password, countrycode);
      record("密码登录", "接口已接受账号密码", true);
      return await finishPhoneLogin(record);
    } catch (error) {
      const message = describeError(error);
      record("密码登录", message, false);
      return message;
    }
  },

  async requestCaptcha(phone, countrycode = "86") {
    const record = traceRecorder();
    try {
      await sendCaptcha(phone, countrycode);
      record("发送验证码", "验证码已发出", true);
      return null;
    } catch (error) {
      const message = describeError(error);
      record("发送验证码", message, false);
      return message;
    }
  },

  async signOut() {
    await apiLogout();
    clearSession();
    usePlayer.getState().setLiked([]);
    set({ status: "anonymous", profile: null, likedPlaylistId: null, playlists: [] });
  },

  async toggleLike(songId) {
    if (!hasSession()) {
      usePlayer.getState().notify("登录后才能收藏歌曲", "info");
      return;
    }
    const player = usePlayer.getState();
    const wasLiked = player.liked.has(songId);
    // Optimistic flip; a failure rolls it back.
    player.toggleLike(songId);
    try {
      await setSongLiked(songId, !wasLiked);
    } catch (error) {
      player.toggleLike(songId);
      player.notify(
        error instanceof Error ? error.message : "操作失败",
        "error",
      );
    }
  },
}));
