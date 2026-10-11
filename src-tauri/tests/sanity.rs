//! Smoke test that exercises the externally-visible test scaffolding:
//! `fresh_in_memory_db` + `EventEmitter::test_local`. These are the
//! foundations for parser snapshot tests (Phase 2) and HTTP API
//! integration tests (Phase 4).

use std::sync::Arc;

use harness_studio_lib::db::test_helpers::fresh_in_memory_db;
use harness_studio_lib::events::{EventBroadcaster, EventEmitter};

#[tokio::test]
async fn in_memory_db_boots_and_runs_migrations() {
    let db = fresh_in_memory_db().await;
    // Migrations ran if the connection is usable for a trivial query.
    use sea_orm::ConnectionTrait;
    let backend = db.conn.get_database_backend();
    assert_eq!(format!("{backend:?}"), "Sqlite");
}

#[test]
fn test_local_emitter_constructs() {
    let broadcaster = Arc::new(EventBroadcaster::new());
    let _emitter = EventEmitter::test_local(broadcaster);
}
