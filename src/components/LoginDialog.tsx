import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import RefreshIcon from "@mui/icons-material/Refresh";
import SmsIcon from "@mui/icons-material/Sms";
import { useCallback, useEffect, useRef, useState } from "react";
import { createQrSession, type QrSession } from "../api/ncm";
import { useAuth, type LoginTraceEntry } from "../store/auth";
import { useUi } from "../store/ui";
import { radius } from "../theme";

const QR_POLL_MS = 2200;
/** NetEase expires a QR session after ~5 minutes. */
const QR_TTL_MS = 280_000;

function QrPanel({ onDone }: { onDone: () => void }) {
  const [session, setSession] = useState<QrSession | null>(null);
  const [status, setStatus] = useState("正在生成二维码…");
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanned, setScanned] = useState(false);
  const hiccupsRef = useRef(0);

  /**
   * Polling state lives in refs on purpose.
   *
   * An earlier version keyed its `useEffect` on the `onDone` callback, which the
   * parent recreates on every render. Each `setStatus` therefore tore down and
   * restarted the interval, so a scan that advanced to "已扫码" often never got
   * a follow-up poll and appeared to hang. A self-scheduling timeout that reads
   * refs is immune to that.
   */
  /**
   * Generation counter for the poll loop.
   *
   * Each run of the polling effect claims a number and a tick only continues
   * while its number is still current. An earlier version disarmed the loop
   * from the effect's cleanup, which React's mount/unmount/remount cycle in
   * development turned into a permanent stop: the dialog sat idle and the
   * login could never finish.
   */
  const genRef = useRef(0);
  /** Set while a poll is in flight so slow responses cannot stack up. */
  const inFlightRef = useRef(false);
  const sessionRef = useRef<QrSession | null>(null);
  const startedAt = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpired(false);
    setScanned(false);
    setStatus("正在生成二维码…");
    try {
      const next = await createQrSession();
      startedAt.current = Date.now();
      sessionRef.current = next;
      setSession(next);
      setStatus("打开网易云音乐 App 扫描二维码");
    } catch (cause) {
      sessionRef.current = null;
      setSession(null);
      setError(cause instanceof Error ? cause.message : "二维码生成失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void generate();
  }, [generate]);


  // Self-scheduling poll: each tick finishes before the next is booked, so a
  // slow request can never stack up or be cancelled by an unrelated render.
  useEffect(() => {
    if (!session || expired) return;
    let timer = 0;

    const gen = ++genRef.current;

    const tick = async () => {
      try {
        if (gen !== genRef.current) {
          return;
        }
        if (inFlightRef.current) {
          return;
        }
        const current = sessionRef.current;
        if (!current) {
          return;
        }

        if (Date.now() - startedAt.current > QR_TTL_MS) {
          setExpired(true);
          setStatus("二维码已过期，请刷新");
          return;
        }

        inFlightRef.current = true;
        let result;
        try {
          result = await useAuth.getState().loginWithQr(current);
        } finally {
          inFlightRef.current = false;
        }
        if (gen !== genRef.current) return;

        // Split the transport-failure count from the verdict so a persistently
        // unreachable bridge reads differently from a single blip.
        hiccupsRef.current = result.code === -1 ? hiccupsRef.current + 1 : 0;
        setStatus(
          hiccupsRef.current > 3
            ? `连续 ${hiccupsRef.current} 次请求失败，请检查本地 API 服务`
            : result.message,
        );
        if (result.code === 802) setScanned(true);

        if (result.ok) {
          onDoneRef.current();
          return;
        }
        // Only an explicit expiry verdict ends the session; everything else
        // (801, 802, and transport failures) means "keep polling".
        if (result.code === 800) setExpired(true);
      } catch (cause) {
        if (gen === genRef.current) {
          setStatus(cause instanceof Error ? cause.message : "二维码检查失败");
        }
      } finally {
        // The next poll is booked unconditionally. An early return or an
        // unexpected throw must never leave the dialog silently idle.
        if (gen === genRef.current) {
          timer = window.setTimeout(() => void tick(), QR_POLL_MS);
        } else {
        }
      }
    };

    void tick();
    return () => {
      window.clearTimeout(timer);
    };
  }, [session, expired]);

  return (
    <Stack spacing={2} sx={{ alignItems: "center", py: 1 }}>
      <Box
        sx={{
          width: 208,
          height: 208,
          borderRadius: `${radius.md}px`,
          bgcolor: "#fff",
          p: 1.25,
          display: "grid",
          placeItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <CircularProgress size={26} />
        ) : session && !expired ? (
          <Box
            component="img"
            src={session.qrImage}
            alt="登录二维码"
            sx={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : (
          <Stack spacing={1} sx={{ alignItems: "center", color: "#333" }}>
            <QrCode2Icon sx={{ fontSize: 40, opacity: 0.3 }} />
            <Button size="small" startIcon={<RefreshIcon />} onClick={() => void generate()}>
              刷新二维码
            </Button>
          </Stack>
        )}
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack spacing={0.5} sx={{ alignItems: "center" }}>
        <Typography variant="body2" sx={{ color: expired ? "warning.main" : "text.secondary" }}>
          {status}
        </Typography>
        {scanned && !expired ? (
          <Typography variant="caption" sx={{ color: "primary.main" }}>
            手机已扫码 —— 请在手机上点「确认登录」
          </Typography>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.disabled" }}>
        <QrCode2Icon sx={{ fontSize: 14 }} />
        <Typography variant="caption">二维码约 4 分钟内有效</Typography>
      </Stack>
    </Stack>
  );
}

function PhonePanel({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const loginByPhone = useAuth((state) => state.loginByPhone);
  const loginByPassword = useAuth((state) => state.loginByPassword);
  const requestCaptcha = useAuth((state) => state.requestCaptcha);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(
      () => setCountdown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const validPhone = /^\d{6,15}$/.test(phone.trim());

  const handleSend = async () => {
    setError(null);
    setInfo(null);
    if (!validPhone) {
      setError("请输入正确的手机号");
      return;
    }
    setBusy(true);
    const failure = await requestCaptcha(phone.trim());
    setBusy(false);
    if (failure) setError(failure);
    else {
      setInfo("验证码已发送");
      setCountdown(60);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!validPhone) {
      setError("请输入正确的手机号");
      return;
    }
    setBusy(true);
    const failure = usePassword
      ? await loginByPassword(phone.trim(), password)
      : await loginByPhone(phone.trim(), code.trim());
    setBusy(false);
    if (failure) setError(failure);
    else onDone();
  };

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <TextField
        label="手机号"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        size="small"
        fullWidth
        autoComplete="tel"
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
      />
      {usePassword ? (
        <TextField
          label="密码"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          size="small"
          fullWidth
          autoComplete="current-password"
        />
      ) : (
        <Stack direction="row" spacing={1}>
          <TextField
            label="验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
          />
          <Button
            variant="outlined"
            onClick={() => void handleSend()}
            disabled={busy || countdown > 0}
            startIcon={<SmsIcon />}
            sx={{
              flex: "0 0 auto",
              borderColor: alpha("#FFFFFF", 0.16),
              minWidth: 118,
            }}
          >
            {countdown > 0 ? `${countdown}s` : "获取验证码"}
          </Button>
        </Stack>
      )}

      {error ? <Alert severity="error">{error}</Alert> : null}
      {info ? <Alert severity="success">{info}</Alert> : null}

      <Button
        variant="contained"
        size="large"
        onClick={() => void handleSubmit()}
        disabled={busy}
      >
        {busy ? <CircularProgress size={20} color="inherit" /> : "登录"}
      </Button>

      <Button
        size="small"
        onClick={() => setUsePassword((value) => !value)}
        sx={{ alignSelf: "center" }}
      >
        {usePassword ? "改用验证码登录" : "改用密码登录"}
      </Button>
      <Typography
        variant="caption"
        sx={{ color: "text.disabled", textAlign: "center" }}
      >
        账号密码只发送到本机运行的 API 服务，不会经过第三方
      </Typography>
    </Stack>
  );
}


/** Renders the step-by-step trace of the last login attempt. */
function LoginTrace() {
  const trace = useAuth((state) => state.loginTrace);
  const status = useAuth((state) => state.status);
  if (!trace.length || status === "authenticated") return null;

  return (
    <Box
      sx={{
        mt: 2,
        p: 1.25,
        borderRadius: `${radius.sm}px`,
        bgcolor: alpha("#FFFFFF", 0.04),
        border: `1px solid ${alpha("#FFFFFF", 0.07)}`,
        maxHeight: 168,
        overflowY: "auto",
      }}
    >
      <Typography variant="overline" sx={{ color: "text.disabled", fontSize: 10 }}>
        登录诊断
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {trace.map((entry: LoginTraceEntry, index: number) => (
          <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                mt: 0.7,
                borderRadius: "50%",
                flex: "0 0 auto",
                bgcolor: entry.ok ? "success.main" : "error.main",
              }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
              <Box component="span" sx={{ color: "text.disabled", mr: 0.5 }}>
                {entry.step}
              </Box>
              {entry.detail}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export function LoginDialog() {
  const open = useUi((state) => state.loginOpen);
  const setLoginOpen = useUi((state) => state.setLoginOpen);
  const profile = useAuth((state) => state.profile);
  const signOut = useAuth((state) => state.signOut);
  const [tab, setTab] = useState(0);
  const [panelError, setPanelError] = useState<string | null>(null);
  const clearLoginTrace = useAuth((state) => state.clearLoginTrace);

  useEffect(() => {
    if (open) {
      clearLoginTrace();
      setPanelError(null);
    }
  }, [open, clearLoginTrace]);

  const close = () => setLoginOpen(false);
  /**
   * Called by a panel when it believes the login finished. The dialog only
   * closes when a session really exists, otherwise it stays open so the trace
   * panel can show what went wrong.
   */
  const done = () => {
    if (useAuth.getState().status === "authenticated") {
      setLoginOpen(false);
      void useAuth.getState().loadPlaylists(true);
      return;
    }
    // Surface the failure where the user is already looking.
    const trace = useAuth.getState().loginTrace;
    const last = trace[trace.length - 1];
    setPanelError(last ? `${last.step}：${last.detail}` : "登录未能完成，请查看下方诊断");
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 6 }}>
        登录网易云音乐
        <IconButton
          onClick={close}
          size="small"
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {profile ? (
          <Stack spacing={2} sx={{ alignItems: "center", py: 2 }}>
            <Typography variant="body1">
              已登录为 <strong>{profile.nickname}</strong>
            </Typography>
            <Button
              variant="outlined"
              onClick={() => {
                void signOut().then(close);
              }}
              sx={{ borderColor: alpha("#FFFFFF", 0.16) }}
            >
              退出登录
            </Button>
          </Stack>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_event, value: number) => setTab(value)}
              variant="fullWidth"
            >
              <Tab label="扫码登录" />
              <Tab label="手机登录" />
            </Tabs>
            <Divider sx={{ mb: 2 }} />
            {tab === 0 ? (
              <QrPanel onDone={done} />
            ) : (
              <PhonePanel onDone={done} />
            )}
            {panelError ? (
              <Alert severity="error" sx={{ mt: 2 }} onClose={() => setPanelError(null)}>
                {panelError}
              </Alert>
            ) : null}
            <LoginTrace />
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 2.5,
                color: "text.disabled",
                textAlign: "center",
              }}
            >
              云音是第三方客户端，登录凭据只保存在本机。请遵守网易云音乐服务条款，
              <Link
                href="https://music.163.com"
                target="_blank"
                rel="noreferrer"
                sx={{ ml: 0.5 }}
              >
                支持正版
              </Link>
            </Typography>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
