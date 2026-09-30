//! YunYin desktop shell.
//!
//! Responsibilities beyond hosting the webview:
//!   * spawn the bundled NetEase API bridge on a free localhost port,
//!   * wait until it actually answers before the UI starts calling it,
//!   * hand that port to the front-end through an initialization script,
//!   * make sure the bridge dies together with the app.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Holds the API bridge process so it can be shut down with the app.
struct SidecarState {
    child: Mutex<Option<Child>>,
}

impl SidecarState {
    fn shutdown(&self) {
        let Ok(mut guard) = self.child.lock() else {
            return;
        };
        let Some(mut child) = guard.take() else {
            return;
        };

        // The bridge is its own session leader (see `configure_process_group`),
        // so signalling the group also catches anything it spawned. Its own
        // SIGTERM handler closes the listener and exits.
        #[cfg(unix)]
        {
            let pid = child.id() as i32;
            unsafe {
                libc::kill(-pid, libc::SIGTERM);
                libc::kill(pid, libc::SIGTERM);
            }
        }
        #[cfg(not(unix))]
        {
            let _ = child.kill();
        }

        let deadline = Instant::now() + Duration::from_millis(1500);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(60)),
                _ => {
                    let _ = child.kill();
                    break;
                }
            }
        }
        let _ = child.wait();
    }
}

/// Where the bridge writes its log, under the app's own data directory.
fn bridge_log_path() -> std::path::PathBuf {
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".local/state")))
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join("yunyin");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("bridge.log")
}

/// Points GStreamer at the plugins that ship inside the bundle.
///
/// linuxdeploy copies GStreamer's core libraries into the AppImage but nothing
/// else, and its AppRun only exports `LD_LIBRARY_PATH`. Without this the webview
/// resolves the bundled core libraries, finds no plugins at all, and aborts the
/// process the moment media playback starts. The AppImage is also directed at
/// the host's plugin directory, because this bundle links the system WebKitGTK
/// rather than carrying its own.
fn configure_gstreamer() {
    let mut paths: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(appdir) = std::env::var("APPDIR") {
        for dir in [
            format!("{appdir}/usr/lib/gstreamer-1.0"),
            // linuxdeploy's GStreamer hook may place them here instead.
            format!("{appdir}/usr/lib/x86_64-linux-gnu/gstreamer-1.0"),
        ] {
            let path = std::path::PathBuf::from(dir);
            if path.is_dir() {
                paths.push(path);
            }
        }
    }

    for dir in ["/usr/lib/gstreamer-1.0", "/usr/lib/x86_64-linux-gnu/gstreamer-1.0"] {
        let path = std::path::PathBuf::from(dir);
        if path.is_dir() {
            paths.push(path);
        }
    }

    if let Some(existing) = std::env::var_os("GST_PLUGIN_PATH_1_0") {
        paths.extend(std::env::split_paths(&existing));
    }

    if paths.is_empty() {
        return;
    }

    if let Ok(joined) = std::env::join_paths(&paths) {
        std::env::set_var("GST_PLUGIN_PATH_1_0", &joined);
        // WebKit reads this one first when it builds the GStreamer registry.
        std::env::set_var("GST_PLUGIN_SYSTEM_PATH_1_0", &joined);
    }
}


/// Puts the child in a fresh session/process group so the whole tree can be
/// signalled at once and so it never receives the compositor's own signals.
fn configure_process_group(command: &mut Command) {
    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        command.pre_exec(|| {
            // `setsid` fails only if the caller is already a group leader, which
            // a freshly forked child never is.
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    #[cfg(not(unix))]
    let _ = command;
}

/// Asks the OS for a free port so two instances never collide.
fn pick_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(38471)
}

/// Candidate locations for the bundled bridge, in priority order.
fn sidecar_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // The bundle may keep the target triple in the file name (`externalBin`
    // sources are named `yunyin-api-<triple>`) or strip it on install, and the
    // two bundlers differ: the AppImage keeps `yunyin-api`, a Debian package
    // installs it under the resource directory. Try every spelling in both
    // places so neither layout is missed.
    const STEMS: [&str; 2] = ["yunyin-api", "yunyin-api-x86_64-unknown-linux-gnu"];

    // 1. Shipped through `bundle > externalBin`.
    if let Ok(dir) = app.path().resource_dir() {
        for stem in STEMS {
            candidates.push(dir.join(stem));
            candidates.push(dir.join("binaries").join(stem));
        }
    }
    // 2. Next to the executable (AppImage / portable layouts).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for stem in STEMS {
                candidates.push(dir.join(stem));
                candidates.push(dir.join("binaries").join(stem));
            }
            // Debian layout: /usr/bin/yunyin with the helper in /usr/lib/yunyin.
            if let Some(prefix) = dir.parent() {
                for stem in STEMS {
                    candidates.push(prefix.join("lib").join("yunyin").join(stem));
                }
            }
        }
    }
    // 3. Absolute fallbacks, in case the resource dir is resolved unexpectedly.
    for stem in STEMS {
        candidates.push(PathBuf::from("/usr/lib/yunyin").join(stem));
        candidates.push(PathBuf::from("/usr/lib").join(stem));
    }
    // 4. Development locations. `tauri dev` runs the binary from src-tauri.
    for base in [PathBuf::from(".."), PathBuf::from(".")] {
        candidates.push(base.join("sidecar").join("dist").join("yunyin-api"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("sidecar").join("dist").join("yunyin-api"));
        candidates.push(cwd.join("..").join("sidecar").join("dist").join("yunyin-api"));
    }
    candidates
}

/// Development fallback: the JavaScript bridge run through the system Node.
fn dev_script() -> Option<PathBuf> {
    let mut options = vec![
        PathBuf::from("sidecar").join("server.mjs"),
        PathBuf::from("..").join("sidecar").join("server.mjs"),
    ];
    if let Ok(cwd) = std::env::current_dir() {
        options.push(cwd.join("sidecar").join("server.mjs"));
        options.push(cwd.join("..").join("sidecar").join("server.mjs"));
    }
    options.into_iter().find(|candidate| candidate.exists())
}

fn spawn_bridge(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let mut last_error = String::from("未找到 yunyin-api 可执行文件");

    for candidate in sidecar_candidates(app) {
        if !candidate.exists() {
            continue;
        }
        let mut command = Command::new(&candidate);
        // Keep the bridge's output: its request log is the only way to diagnose
        // a packaged run, and discarding it made that impossible.
        let log = std::fs::File::create(bridge_log_path());
        command
            .arg("--port")
            .arg(port.to_string())
            .arg("--host")
            .arg("127.0.0.1")
            .env("YUNYIN_DEBUG", "1")
            .stdout(match log.as_ref() {
                Ok(file) => Stdio::from(file.try_clone().expect("clone log handle")),
                Err(_) => Stdio::null(),
            })
            .stderr(match log {
                Ok(file) => Stdio::from(file),
                Err(_) => Stdio::null(),
            });
        configure_process_group(&mut command);
        let spawned = command.spawn();
        match spawned {
            Ok(child) => return Ok(child),
            Err(error) => last_error = format!("启动 {} 失败: {error}", candidate.display()),
        }
    }

    if let Some(script) = dev_script() {
        for node in ["node", "nodejs"] {
            let mut command = Command::new(node);
            command
                .arg(&script)
                .arg("--port")
                .arg(port.to_string())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            configure_process_group(&mut command);
            match command.spawn() {
                Ok(child) => return Ok(child),
                Err(error) => last_error = format!("通过 {node} 启动失败: {error}"),
            }
        }
    }

    Err(last_error)
}

/// Waits until `GET /health` answers, so the webview never races the bridge.
fn wait_for_ready(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let address = format!("127.0.0.1:{port}");
    while Instant::now() < deadline {
        if let Ok(mut stream) = TcpStream::connect(&address) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
            let request =
                format!("GET /health HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n");
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut buffer = [0u8; 96];
                if let Ok(read) = stream.read(&mut buffer) {
                    if String::from_utf8_lossy(&buffer[..read]).contains("200") {
                        return true;
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

/// Terminates the bridge and the app when the process is asked to stop.
///
/// A compositor or `kill` delivers SIGTERM straight to the process, which would
/// otherwise bypass Tauri's event loop entirely and orphan the bridge. Making
/// the bridge its own session leader means signalling the group reaches every
/// descendant too.
#[cfg(unix)]
fn install_signal_handler(app: AppHandle) {
    use signal_hook::consts::{SIGINT, SIGTERM};
    use signal_hook::iterator::Signals;

    thread::spawn(move || {
        let Ok(mut signals) = Signals::new([SIGTERM, SIGINT]) else {
            return;
        };
        if signals.forever().next().is_some() {
            app.state::<SidecarState>().shutdown();
            app.exit(0);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            // Must run before the webview (and its web process) is created.
            configure_gstreamer();
            let handle = app.handle().clone();
            let port = pick_port();

            match spawn_bridge(&handle, port) {
                Ok(child) => {
                    if let Ok(mut guard) = handle.state::<SidecarState>().child.lock() {
                        *guard = Some(child);
                    }
                }
                Err(error) => eprintln!("[yunyin] API 桥接进程启动失败: {error}"),
            }

            // 40s is generous: the very first run has to fetch an anonymous
            // session token from NetEase before the bridge answers.
            let ready = wait_for_ready(port, Duration::from_secs(40));
            if !ready {
                eprintln!("[yunyin] 等待 API 桥接进程超时，前端会自行重试");
            }

            let api_base = format!("http://127.0.0.1:{port}");
            let init_script = format!(
                "window.__YUNYIN__ = {{ apiBase: '{api_base}', version: '{}', sidecarFailed: {} }};",
                app.package_info().version,
                !ready
            );

            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("云音")
                .inner_size(1180.0, 760.0)
                .min_inner_size(880.0, 560.0)
                .resizable(true)
                .initialization_script(&init_script)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .map(|app| {
            #[cfg(unix)]
            install_signal_handler(app.handle().clone());
            app
        })
        .expect("failed to build the YunYin application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                app_handle.state::<SidecarState>().shutdown();
            }
        });
}
