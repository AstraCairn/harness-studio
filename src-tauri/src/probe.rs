//! Bounded, process-local memoization for read-only environment probes.
use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::OsString;
use std::future::Future;
use std::io;
use std::process::{Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const CHECK_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Hash, PartialEq, Eq)]
struct Key {
    timeout: Duration,
    program: OsString,
    modified: Option<SystemTime>,
    args: Vec<OsString>,
    cwd: Option<std::path::PathBuf>,
    env: Vec<(OsString, Option<OsString>)>,
}

type Cached = (Instant, Result<Output, (io::ErrorKind, String)>);
type Slot = Arc<tokio::sync::Mutex<Option<Cached>>>;
static CACHE: OnceLock<Mutex<HashMap<Key, Slot>>> = OnceLock::new();
static GENERATION: AtomicU64 = AtomicU64::new(0);

tokio::task_local! {
    static TIMED_OUT: RefCell<Option<String>>;
}

#[cfg(test)]
tokio::task_local! { static FORBID_PROBES: bool; }

#[cfg(test)]
pub(crate) async fn without_probes<T>(future: impl Future<Output = T>) -> T {
    FORBID_PROBES.scope(true, future).await
}

pub(crate) fn clear_cache() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(cache) = CACHE.get() {
        // A forced refresh bypasses completed results, while concurrent callers
        // still share an already running probe instead of spawning duplicates.
        cache
            .lock()
            .unwrap()
            .retain(|_, slot| slot.try_lock().is_err());
    }
}

pub(crate) fn generation() -> u64 {
    GENERATION.load(Ordering::SeqCst)
}

pub(crate) fn timed_out() -> bool {
    TIMED_OUT
        .try_with(|error| error.borrow().is_some())
        .unwrap_or(false)
}

/// An Option-returning resolver must not turn a timed-out probe into absence.
pub(crate) async fn with_budget<T>(future: impl Future<Output = T>) -> io::Result<T> {
    TIMED_OUT
        .scope(RefCell::new(None), async {
            let value = tokio::time::timeout(CHECK_TIMEOUT, future)
                .await
                .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "Agent check timed out"))?;
            match TIMED_OUT.with(|error| error.borrow_mut().take()) {
                Some(error) => Err(io::Error::new(io::ErrorKind::TimedOut, error)),
                None => Ok(value),
            }
        })
        .await
}

struct ProcessGuard(Option<u32>);

async fn terminate(pid: u32) {
    let config = kill_tree::Config {
        signal: "SIGKILL".to_string(),
        ..Default::default()
    };
    let _ = kill_tree::tokio::kill_tree_with_config(pid, &config).await;
}

impl Drop for ProcessGuard {
    fn drop(&mut self) {
        if let Some(pid) = self.0.take() {
            // Includes cancellation by the enclosing 15-second budget.
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                runtime.spawn(terminate(pid));
            } else {
                let _ = kill_tree::blocking::kill_tree(pid);
            }
        }
    }
}

pub(crate) async fn output(command: tokio::process::Command) -> io::Result<Output> {
    output_with_timeout(command, COMMAND_TIMEOUT).await
}

pub(crate) async fn output_with_timeout(
    mut command: tokio::process::Command,
    timeout: Duration,
) -> io::Result<Output> {
    #[cfg(test)]
    assert!(
        !FORBID_PROBES.try_with(|forbid| *forbid).unwrap_or(false),
        "snapshot launched a probe"
    );
    let std = command.as_std();
    let mut env = std
        .get_envs()
        .map(|(key, value)| (key.to_os_string(), value.map(OsString::from)))
        .collect::<Vec<_>>();
    for name in [
        "PATH",
        "PATHEXT",
        "npm_config_prefix",
        "NPM_CONFIG_PREFIX",
        "NODE_OPTIONS",
    ] {
        env.push((name.into(), std::env::var_os(name)));
    }
    let key = Key {
        timeout,
        program: std.get_program().to_os_string(),
        modified: std::fs::metadata(std.get_program())
            .and_then(|m| m.modified())
            .ok(),
        args: std.get_args().map(OsString::from).collect(),
        cwd: std
            .get_current_dir()
            .map(ToOwned::to_owned)
            .or_else(|| std::env::current_dir().ok()),
        env,
    };
    let slot = CACHE
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .entry(key)
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(None)))
        .clone();
    // One probe per key, even while the first caller is still executing it.
    let mut cached = slot.lock().await;
    let fresh = cached.as_ref().is_some_and(|(at, result)| {
        let success = result.as_ref().is_ok_and(|out| out.status.success());
        at.elapsed() < Duration::from_secs(if success { 60 } else { 5 })
    });
    if !fresh {
        let result = async {
            command
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            // The guard kills the entire tree; killing only cmd.exe leaks npm.
            command.kill_on_drop(false);
            let child = command.spawn()?;
            let mut guard = ProcessGuard(child.id());
            match tokio::time::timeout(timeout, child.wait_with_output()).await {
                Ok(result) => {
                    guard.0 = None;
                    result
                }
                Err(_) => {
                    if let Some(pid) = guard.0 {
                        terminate(pid).await;
                        guard.0 = None;
                    }
                    Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "Environment probe timed out",
                    ))
                }
            }
        }
        .await
        .map_err(|error: io::Error| (error.kind(), error.to_string()));
        *cached = Some((Instant::now(), result));
    }
    let result = cached.as_ref().unwrap().1.clone();
    result.map_err(|(kind, message)| {
        if kind == io::ErrorKind::TimedOut {
            let _ = TIMED_OUT.try_with(|error| *error.borrow_mut() = Some(message.clone()));
        }
        io::Error::new(kind, message)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    static CACHE_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[test]
    fn fixture() {
        let Some(trace) = std::env::var_os("HARNESS_STUDIO_PROBE_TEST_TRACE") else {
            return;
        };
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(trace)
            .unwrap()
            .write_all(b"p")
            .unwrap();
        match std::env::var("HARNESS_STUDIO_PROBE_TEST_MODE").as_deref() {
            Ok("hang") => std::thread::sleep(Duration::from_secs(60)),
            Ok("slow") => std::thread::sleep(Duration::from_millis(300)),
            Ok("fail") => std::process::exit(1),
            _ => println!("probe version 1.2.3"),
        }
    }

    fn command(trace: &std::path::Path, mode: &str) -> tokio::process::Command {
        let mut command = crate::process::tokio_command(std::env::current_exe().unwrap());
        command
            .args(["--exact", "probe::tests::fixture", "--nocapture"])
            .env("HARNESS_STUDIO_PROBE_TEST_TRACE", trace)
            .env("HARNESS_STUDIO_PROBE_TEST_MODE", mode);
        command
    }

    #[tokio::test]
    async fn refresh_shares_inflight_probes_but_invalidates_completed_results() {
        let _lock = CACHE_TEST_LOCK.lock().await;
        let temp = tempfile::tempdir().unwrap();
        let trace = temp.path().join("calls");
        let first_command = command(&trace, "slow");
        let first = tokio::spawn(output(first_command));
        tokio::time::timeout(Duration::from_secs(3), async {
            while !trace.exists() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        clear_cache();
        output(command(&trace, "slow")).await.unwrap();
        first.await.unwrap().unwrap();
        assert_eq!(std::fs::read(&trace).unwrap(), b"p");
        clear_cache();
        output(command(&trace, "slow")).await.unwrap();
        assert_eq!(std::fs::read(&trace).unwrap(), b"pp");
    }

    #[tokio::test]
    async fn concurrent_calls_share_one_process_and_expired_results_reprobe() {
        let _lock = CACHE_TEST_LOCK.lock().await;
        let temp = tempfile::tempdir().unwrap();
        let trace = temp.path().join("calls");
        let outputs =
            futures::future::join_all((0..8).map(|_| output(command(&trace, "ok")))).await;
        assert!(outputs
            .iter()
            .all(|out| out.as_ref().unwrap().status.success()));
        assert_eq!(std::fs::read(&trace).unwrap(), b"p");
        // Expire just this test's entry without sleeping or touching other tests.
        for (key, slot) in CACHE.get().unwrap().lock().unwrap().iter() {
            if key
                .env
                .iter()
                .any(|(_, value)| value.as_deref() == Some(trace.as_os_str()))
            {
                slot.try_lock().unwrap().as_mut().unwrap().0 =
                    Instant::now() - Duration::from_secs(61);
            }
        }
        output(command(&trace, "ok")).await.unwrap();
        assert_eq!(std::fs::read(&trace).unwrap(), b"pp");
    }

    #[tokio::test]
    async fn failures_are_coalesced_and_expire_after_five_seconds() {
        let _lock = CACHE_TEST_LOCK.lock().await;
        let temp = tempfile::tempdir().unwrap();
        let trace = temp.path().join("calls");
        assert!(!output(command(&trace, "fail"))
            .await
            .unwrap()
            .status
            .success());
        assert!(!output(command(&trace, "fail"))
            .await
            .unwrap()
            .status
            .success());
        assert_eq!(std::fs::read(&trace).unwrap(), b"p");
        for (key, slot) in CACHE.get().unwrap().lock().unwrap().iter() {
            if key
                .env
                .iter()
                .any(|(_, value)| value.as_deref() == Some(trace.as_os_str()))
            {
                slot.try_lock().unwrap().as_mut().unwrap().0 =
                    Instant::now() - Duration::from_secs(6);
            }
        }
        output(command(&trace, "fail")).await.unwrap();
        assert_eq!(std::fs::read(&trace).unwrap(), b"pp");
    }

    #[tokio::test]
    async fn a_timed_out_optional_resolver_is_an_error_not_absence() {
        let _lock = CACHE_TEST_LOCK.lock().await;
        let temp = tempfile::tempdir().unwrap();
        let trace = temp.path().join("calls");
        let result = with_budget(async { output(command(&trace, "hang")).await.ok() }).await;
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
        assert_eq!(std::fs::read(&trace).unwrap(), b"p");
    }
}
