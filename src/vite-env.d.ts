/// <reference types="vite/client" />

interface Window {
  /** Injected by Rust (src-tauri) once the NetEase API sidecar is listening. */
  __YUNYIN__?: {
    apiBase: string;
    sidecarFailed?: boolean;
    version: string;
  };
}
