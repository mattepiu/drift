//! PRAGMA configuration applied to every SQLite connection.
//!
//! WAL mode, NORMAL sync, 256MB mmap, 64MB cache, 5s busy_timeout,
//! foreign_keys ON, incremental auto_vacuum.

use rusqlite::Connection;

use cortex_core::errors::CortexResult;

use crate::to_storage_err;

/// Apply all performance and safety pragmas to a connection.
pub fn apply_pragmas(conn: &Connection) -> CortexResult<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA mmap_size = 268435456;
        PRAGMA cache_size = -64000;
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        PRAGMA auto_vacuum = INCREMENTAL;
        ",
    )
    .map_err(|e| to_storage_err(e.to_string()))?;
    Ok(())
}

/// Verify that WAL mode is active on a connection.
pub fn verify_wal_mode(conn: &Connection) -> CortexResult<bool> {
    let mode: String = conn
        .pragma_query_value(None, "journal_mode", |row| row.get(0))
        .map_err(|e| to_storage_err(e.to_string()))?;
    Ok(mode.eq_ignore_ascii_case("wal"))
}
