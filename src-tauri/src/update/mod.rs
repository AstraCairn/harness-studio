//! Desktop update state and signed-release metadata.

pub mod state;
pub mod verify;
pub mod version;

pub use state::{new_handle as new_update_state_handle, AppUpdateState, AppUpdateStateHandle};
