//! Read-only model discovery. Credentials and remote bodies never enter errors/logs.
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

use reqwest::{Client, StatusCode, Url};
use serde::Serialize;
use serde_json::Value;

use crate::app_error::AppCommandError;
use crate::db::{service::model_provider_service, AppDatabase};

const BUDGET: Duration = Duration::from_secs(10);
const BODY_LIMIT: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredModel {
    pub id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDiscoveryResult {
    pub endpoint: String,
    pub models: Vec<DiscoveredModel>,
}

fn error(kind: &str) -> AppCommandError {
    AppCommandError::network(format!("Model discovery: {kind}"))
        .with_i18n(format!("ModelDiscovery.errors.{kind}"), BTreeMap::new())
}

fn parse_base(raw: &str) -> Result<Url, AppCommandError> {
    let url = Url::parse(raw.trim()).map_err(|_| error("invalidUrl"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(error("invalidUrl"));
    }
    Ok(url)
}

fn endpoints(raw: &str, agent: &str) -> Result<Vec<Url>, AppCommandError> {
    if !matches!(agent, "claude_code" | "codex" | "gemini") {
        return Err(error("unsupportedAgent"));
    }
    let mut base = parse_base(raw)?;
    let mut path = base.path().trim_end_matches('/').to_string();
    if path.ends_with("/models") {
        base.set_path(&path);
        return Ok(vec![base]);
    }
    for suffix in ["/chat/completions", "/messages", "/responses"] {
        if let Some(prefix) = path.strip_suffix(suffix) {
            path = prefix.to_string();
            break;
        }
    }
    let has_version = path.ends_with("/v1") || path.ends_with("/v1beta");
    let mut compatible = base.clone();
    if let Some(prefix) = path.strip_suffix("/v1beta") {
        compatible.set_path(&format!("{prefix}/v1/models"));
    } else {
        compatible.set_path(&format!(
            "{path}{}/models",
            if has_version { "" } else { "/v1" }
        ));
    }
    if agent != "gemini" {
        return Ok(vec![compatible]);
    }
    let prefix = path
        .strip_suffix("/v1beta")
        .or_else(|| path.strip_suffix("/v1"))
        .unwrap_or(&path);
    base.set_path(&format!("{prefix}/v1beta/models"));
    Ok(vec![base, compatible])
}

fn resolve_key(
    api_url: &str,
    api_key: Option<&str>,
    saved: Option<(&str, &str)>,
) -> Result<String, AppCommandError> {
    if let Some(key) = api_key.map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(key.to_string());
    }
    let (saved_url, key) = saved.ok_or_else(|| error("keyRequired"))?;
    let normalize = |raw: &str| -> Result<String, AppCommandError> {
        Ok(parse_base(raw)?.as_str().trim_end_matches('/').to_string())
    };
    if normalize(api_url)? != normalize(saved_url)? {
        return Err(error("keyRequiredForChangedUrl"));
    }
    if key.trim().is_empty() {
        return Err(error("keyRequired"));
    }
    Ok(key.trim().to_string())
}

fn status_error(status: StatusCode) -> AppCommandError {
    error(match status.as_u16() {
        401 => "unauthorized",
        403 => "forbidden",
        404 | 405 => "unsupportedEndpoint",
        429 => "rateLimited",
        300..=399 => "redirect",
        _ => "server",
    })
}

async fn fetch_endpoint(
    client: &Client,
    endpoint: &Url,
    agent: &str,
    key: &str,
) -> Result<ModelDiscoveryResult, AppCommandError> {
    let mut url = endpoint.clone();
    let mut models = BTreeMap::new();
    let mut cursors = BTreeSet::new();
    loop {
        let mut request = client.get(url.clone()).bearer_auth(key);
        if agent == "claude_code" {
            request = request
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01");
        } else if agent == "gemini" {
            request = request.header("x-goog-api-key", key);
        }
        let mut response = request.send().await.map_err(|_| error("network"))?;
        if !response.status().is_success() {
            return Err(status_error(response.status()));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| error("network"))? {
            if bytes.len().saturating_add(chunk.len()) > BODY_LIMIT {
                return Err(error("invalidResponse"));
            }
            bytes.extend_from_slice(&chunk);
        }
        let body: Value = serde_json::from_slice(&bytes).map_err(|_| error("invalidResponse"))?;
        let native = body.get("models").and_then(Value::as_array);
        let entries = native
            .or_else(|| body.get("data").and_then(Value::as_array))
            .ok_or_else(|| error("invalidResponse"))?;
        for entry in entries {
            let id = entry
                .get(if native.is_some() { "name" } else { "id" })
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| error("invalidResponse"))?;
            {
                let id = if native.is_some() {
                    id.strip_prefix("models/").unwrap_or(id)
                } else {
                    id
                };
                if id.is_empty() {
                    return Err(error("invalidResponse"));
                }
                let display_name = entry
                    .get("display_name")
                    .or_else(|| entry.get("displayName"))
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                models.entry(id.to_string()).or_insert(DiscoveredModel {
                    id: id.to_string(),
                    display_name,
                });
            }
        }
        let cursor = if let Some(token) = body
            .get("nextPageToken")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            Some(("pageToken", token.to_string()))
        } else if body.get("has_more").and_then(Value::as_bool) == Some(true) {
            let last = body
                .get("last_id")
                .and_then(Value::as_str)
                .or_else(|| entries.last()?.get("id")?.as_str())
                .ok_or_else(|| error("invalidResponse"))?;
            Some(("after_id", last.to_string()))
        } else {
            None
        };
        let Some((parameter, cursor)) = cursor else {
            break;
        };
        if !cursors.insert(cursor.clone()) || cursors.len() > 100 {
            return Err(error("invalidResponse"));
        }
        url = endpoint.clone();
        url.query_pairs_mut().append_pair(parameter, &cursor);
    }
    if models.is_empty() {
        return Err(error("empty"));
    }
    Ok(ModelDiscoveryResult {
        endpoint: endpoint.to_string(),
        models: models.into_values().collect(),
    })
}

async fn discover(
    client: &Client,
    agent: &str,
    api_url: &str,
    key: &str,
    budget: Duration,
) -> Result<ModelDiscoveryResult, AppCommandError> {
    let candidates = endpoints(api_url, agent)?;
    tokio::time::timeout(budget, async {
        for (index, endpoint) in candidates.iter().enumerate() {
            match fetch_endpoint(client, endpoint, agent, key).await {
                Err(e)
                    if e.i18n_key.as_deref()
                        == Some("ModelDiscovery.errors.unsupportedEndpoint")
                        && index + 1 < candidates.len() =>
                {
                    continue
                }
                result => return result,
            }
        }
        Err(error("unsupportedEndpoint"))
    })
    .await
    .map_err(|_| error("timeout"))?
}

pub async fn model_provider_fetch_models_core(
    db: &AppDatabase,
    agent_type: &str,
    api_url: &str,
    api_key: Option<&str>,
    provider_id: Option<i32>,
) -> Result<ModelDiscoveryResult, AppCommandError> {
    endpoints(api_url, agent_type)?;
    let saved = if api_key.map(str::trim).filter(|s| !s.is_empty()).is_none() {
        if let Some(id) = provider_id {
            Some(
                model_provider_service::get_by_id(&db.conn, id)
                    .await
                    .map_err(AppCommandError::from)?
                    .ok_or_else(|| error("keyRequired"))?,
            )
        } else {
            None
        }
    } else {
        None
    };
    let key = resolve_key(
        api_url,
        api_key,
        saved
            .as_ref()
            .map(|p| (p.api_url.as_str(), p.api_key.as_str())),
    )?;
    // reqwest reads the same HTTP(S)_PROXY / NO_PROXY environment as the app.
    let client = Client::builder()
        .user_agent("harness-studio/0.1.0")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| error("network"))?;
    discover(&client, agent_type, api_url, &key, BUDGET).await
}

#[tauri::command]
pub async fn model_provider_fetch_models(
    db: tauri::State<'_, AppDatabase>,
    agent_type: String,
    api_url: String,
    api_key: Option<String>,
    provider_id: Option<i32>,
) -> Result<ModelDiscoveryResult, AppCommandError> {
    model_provider_fetch_models_core(&db, &agent_type, &api_url, api_key.as_deref(), provider_id)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    struct Server {
        url: String,
        requests: Arc<Mutex<Vec<String>>>,
        task: tokio::task::JoinHandle<()>,
    }

    impl Drop for Server {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    async fn serve(responses: Vec<(u16, String, String, u64)>) -> Server {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let received = requests.clone();
        let task = tokio::spawn(async move {
            for (status, headers, body, delay) in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                loop {
                    let mut buf = [0; 2048];
                    let count = stream.read(&mut buf).await.unwrap();
                    if count == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buf[..count]);
                    if bytes.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                received
                    .lock()
                    .unwrap()
                    .push(String::from_utf8(bytes).unwrap());
                tokio::time::sleep(Duration::from_millis(delay)).await;
                let response = format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}", body.len());
                let _ = stream.write_all(response.as_bytes()).await;
            }
        });
        Server {
            url,
            requests,
            task,
        }
    }

    fn reply(body: &str) -> (u16, String, String, u64) {
        (200, String::new(), body.into(), 0)
    }

    fn client() -> Client {
        Client::builder()
            .no_proxy()
            .user_agent("harness-studio/test")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
    }

    fn assert_kind<T: std::fmt::Debug>(result: Result<T, AppCommandError>, kind: &str) {
        let err = result.unwrap_err();
        assert_eq!(
            err.i18n_key.as_deref(),
            Some(format!("ModelDiscovery.errors.{kind}").as_str())
        );
        assert!(!err.to_string().contains("remote-secret"));
    }

    #[test]
    fn paths_preserve_prefix_and_existing_endpoint() {
        for (input, expected) in [
            ("https://example.test", "/v1/models"),
            ("https://example.test/cc/", "/cc/v1/models"),
            ("https://example.test/cc/v1/", "/cc/v1/models"),
            ("https://example.test/cc/v1/models/", "/cc/v1/models"),
            ("https://example.test/cc/models", "/cc/models"),
            ("https://example.test/cc/v1/messages", "/cc/v1/models"),
            (
                "https://example.test/cc/v1/chat/completions",
                "/cc/v1/models",
            ),
        ] {
            assert_eq!(endpoints(input, "claude_code").unwrap()[0].path(), expected);
        }
        let urls = endpoints("https://example.test/cc/v1", "gemini").unwrap();
        assert_eq!(urls[0].path(), "/cc/v1beta/models");
        assert_eq!(urls[1].path(), "/cc/v1/models");
        for raw in [
            "bad",
            "file:///x",
            "https://user:secret@example.test",
            "https://example.test?key=secret",
        ] {
            assert_kind(endpoints(raw, "codex"), "invalidUrl");
        }
        assert_kind(
            endpoints("https://example.test", "grok"),
            "unsupportedAgent",
        );
    }

    #[test]
    fn saved_key_requires_same_address_unless_explicitly_replaced() {
        let saved = Some(("https://EXAMPLE.test/cc/", "saved"));
        assert_eq!(
            resolve_key("https://example.test/cc", None, saved).unwrap(),
            "saved"
        );
        assert_kind(
            resolve_key("https://example.test/new", None, saved),
            "keyRequiredForChangedUrl",
        );
        assert_kind(
            resolve_key("https://another.test/cc", Some(" "), saved),
            "keyRequiredForChangedUrl",
        );
        assert_eq!(
            resolve_key("https://another.test", Some("new"), saved).unwrap(),
            "new"
        );
        assert_kind(
            resolve_key("https://example.test", None, None),
            "keyRequired",
        );
    }

    #[tokio::test]
    async fn claude_headers_pagination_and_deduplication() {
        let server = serve(vec![
            reply(r#"{"data":[{"id":"z","display_name":"Zed"}],"has_more":true,"last_id":"z"}"#),
            reply(r#"{"data":[{"id":"z"},{"id":"a"}],"has_more":false}"#),
        ])
        .await;
        let result = discover(
            &client(),
            "claude_code",
            &format!("{}/cc", server.url),
            "fixture-key",
            BUDGET,
        )
        .await
        .unwrap();
        assert_eq!(
            result
                .models
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(result.models[1].display_name.as_deref(), Some("Zed"));
        assert_eq!(result.endpoint, format!("{}/cc/v1/models", server.url));
        let requests = server.requests.lock().unwrap();
        let first = requests[0].to_lowercase();
        assert!(first.starts_with("get /cc/v1/models "));
        assert!(first.contains("authorization: bearer fixture-key\r\n"));
        assert!(first.contains("x-api-key: fixture-key\r\n"));
        assert!(first.contains("anthropic-version: 2023-06-01\r\n"));
        assert!(first.contains("user-agent: harness-studio/test\r\n"));
        assert!(requests[1].starts_with("GET /cc/v1/models?after_id=z "));
    }

    #[tokio::test]
    async fn gemini_native_pagination_and_compatible_fallback() {
        let server = serve(vec![
            reply(r#"{"models":[{"name":"models/gemini-a","displayName":"Friendly"}],"nextPageToken":"page 2"}"#),
            reply(r#"{"models":[{"name":"models/gemini-b"}]}"#),
        ]).await;
        let result = discover(&client(), "gemini", &server.url, "fixture-key", BUDGET)
            .await
            .unwrap();
        assert_eq!(result.models[0].id, "gemini-a");
        assert_eq!(result.models[0].display_name.as_deref(), Some("Friendly"));
        let requests = server.requests.lock().unwrap().clone();
        assert!(requests[0].contains("x-goog-api-key: fixture-key"));
        assert!(requests[1].contains("pageToken=page+2"));

        let fallback = serve(vec![
            (404, String::new(), "remote-secret".into(), 0),
            reply(r#"{"data":[{"id":"gemini-c"}]}"#),
        ])
        .await;
        let result = discover(
            &client(),
            "gemini",
            &format!("{}/prefix", fallback.url),
            "fixture-key",
            BUDGET,
        )
        .await
        .unwrap();
        assert_eq!(
            result.endpoint,
            format!("{}/prefix/v1/models", fallback.url)
        );
        assert_eq!(fallback.requests.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn errors_are_distinct_and_remote_bodies_are_private() {
        for (status, kind) in [
            (401, "unauthorized"),
            (403, "forbidden"),
            (404, "unsupportedEndpoint"),
            (405, "unsupportedEndpoint"),
            (429, "rateLimited"),
            (500, "server"),
        ] {
            let server = serve(vec![(status, String::new(), "remote-secret".into(), 0)]).await;
            assert_kind(
                discover(&client(), "codex", &server.url, "fixture-key", BUDGET).await,
                kind,
            );
        }
        for (body, kind) in [
            ("remote-secret", "invalidResponse"),
            ("{}", "invalidResponse"),
            (r#"{"data":[{"unknown":"invalid"}]}"#, "invalidResponse"),
            (r#"{"data":[]}"#, "empty"),
            (
                r#"{"data":[{"id":"a"}],"has_more":true,"last_id":"a"}"#,
                "invalidResponse",
            ),
        ] {
            let server = serve(vec![reply(body), reply(body)]).await;
            assert_kind(
                discover(&client(), "codex", &server.url, "fixture-key", BUDGET).await,
                kind,
            );
        }
        // Authorization failure must not trigger Gemini's compatible fallback.
        let server = serve(vec![(401, String::new(), "remote-secret".into(), 0)]).await;
        assert_kind(
            discover(&client(), "gemini", &server.url, "fixture-key", BUDGET).await,
            "unauthorized",
        );
        assert_eq!(server.requests.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn total_timeout_covers_all_pages() {
        let mut page = reply(r#"{"data":[{"id":"a"}],"has_more":true,"last_id":"a"}"#);
        page.3 = 40;
        let mut next = reply(r#"{"data":[{"id":"b"}]}"#);
        next.3 = 100;
        let server = serve(vec![page, next]).await;
        assert_kind(
            discover(
                &client(),
                "codex",
                &server.url,
                "fixture-key",
                Duration::from_millis(70),
            )
            .await,
            "timeout",
        );
        assert_eq!(server.requests.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn redirects_do_not_receive_credentials() {
        let target = serve(vec![reply(r#"{"data":[{"id":"a"}]}"#)]).await;
        let source = serve(vec![(
            302,
            format!("Location: {}/v1/models\r\n", target.url),
            String::new(),
            0,
        )])
        .await;
        assert_kind(
            discover(&client(), "codex", &source.url, "fixture-key", BUDGET).await,
            "redirect",
        );
        assert!(target.requests.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn core_loads_saved_key_without_changing_provider_or_models() {
        let db = crate::db::test_helpers::fresh_in_memory_db().await;
        let server = serve(vec![reply(r#"{"data":[{"id":"a"}]}"#)]).await;
        let provider = model_provider_service::create(
            &db.conn,
            "Fixture".into(),
            server.url.clone(),
            "saved-fixture-key".into(),
            "codex".into(),
            Some("manual".into()),
        )
        .await
        .unwrap();
        let result = model_provider_fetch_models_core(
            &db,
            "codex",
            &server.url,
            Some(""),
            Some(provider.id),
        )
        .await
        .unwrap();
        assert_eq!(result.models[0].id, "a");
        assert!(
            server.requests.lock().unwrap()[0].contains("authorization: Bearer saved-fixture-key")
        );
        assert_kind(
            model_provider_fetch_models_core(
                &db,
                "codex",
                &format!("{}/changed", server.url),
                None,
                Some(provider.id),
            )
            .await,
            "keyRequiredForChangedUrl",
        );
        let after = model_provider_service::get_by_id(&db.conn, provider.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(after, provider);
    }
}
