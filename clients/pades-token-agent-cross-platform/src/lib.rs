pub mod config;
pub mod confirmation;
pub mod error;
pub mod model;
pub mod provider;
pub mod web;

pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");
