use maiocchi_pades_token_agent::{config::AgentConfig, provider::platform_provider, web};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .without_time()
        .init();

    let config = AgentConfig::from_environment()?;
    let provider = platform_provider()?;
    web::serve(config, provider).await?;
    Ok(())
}
