//! Authentication flows: browser-based OAuth or API key.

use cortex_core::errors::{CloudError, CortexResult};

use super::token_manager::AuthToken;

/// Supported authentication methods.
#[derive(Debug, Clone)]
pub enum AuthMethod {
    /// Static API key (simplest).
    ApiKey(String),
    /// OAuth2 with browser-based login.
    OAuth {
        client_id: String,
        auth_url: String,
        token_url: String,
    },
}

/// Handles the login flow and produces an [`AuthToken`].
#[derive(Debug)]
pub struct LoginFlow {
    method: AuthMethod,
}

impl LoginFlow {
    pub fn new(method: AuthMethod) -> Self {
        Self { method }
    }

    /// Authenticate and return a token.
    ///
    /// For API key auth, wraps the key in a non-expiring token.
    /// For OAuth, this would open a browser and wait for the callback.
    pub fn authenticate(&self) -> CortexResult<AuthToken> {
        match &self.method {
            AuthMethod::ApiKey(key) => Ok(AuthToken {
                access_token: key.clone(),
                refresh_token: None,
                // API keys don't expire (effectively infinite).
                expires_in_secs: u64::MAX,
            }),
            AuthMethod::OAuth {
                client_id: _,
                auth_url: _,
                token_url: _,
            } => {
                // In a real implementation this would:
                // 1. Start a local HTTP server for the callback
                // 2. Open the browser to auth_url
                // 3. Wait for the redirect with the auth code
                // 4. Exchange the code for tokens at token_url
                Err(CloudError::AuthFailed {
                    reason: "OAuth flow not yet implemented — use API key auth".into(),
                }
                .into())
            }
        }
    }

    /// Refresh an existing token using the refresh_token grant.
    pub fn refresh(&self, refresh_token: &str) -> CortexResult<AuthToken> {
        match &self.method {
            AuthMethod::ApiKey(_) => {
                // API keys don't need refresh.
                self.authenticate()
            }
            AuthMethod::OAuth { .. } => Err(CloudError::AuthFailed {
                reason: format!(
                    "OAuth token refresh not yet implemented (refresh_token: {}...)",
                    &refresh_token[..refresh_token.len().min(8)]
                ),
            }
            .into()),
        }
    }
}
