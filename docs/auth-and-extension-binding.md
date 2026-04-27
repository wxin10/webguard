# WebGuard Auth and Extension Binding Design

Version: P2-E implementation baseline

This document defines the target design and current implementation baseline for formal Web login, token refresh, and browser extension binding.

Implementation note: the P2-D baseline implements Web login endpoints, password hash field, Web refresh-token table, HttpOnly refresh cookie, refresh rotation, logout revocation, `/api/v1/auth/me`, and frontend refresh-on-401 behavior. The P2-E baseline implements the minimal plugin binding loop: binding challenge creation, Web confirmation, plugin token exchange, plugin token refresh, plugin instance revoke/unbind, extension Options binding actions, and a minimal Web binding confirmation page. QR-code UI, full device management, and production deployment hardening remain future work.

## 1. Goals

- Replace development-only mock login as the production path.
- Keep `mock-login` available only when development auth is explicitly enabled.
- Give the Web app a standard login and refresh flow.
- Give the extension its own bound-device token path instead of manually copying a Web access token.
- Support revoking a single browser extension instance without logging the user out everywhere.
- Preserve the current `code/message/data` response envelope.

## 2. Non-Goals

- No OAuth or external identity provider in the first implementation.
- No QR-code UI implementation in this design phase.
- No RBAC expansion beyond the existing `user` / `admin` shape.
- No Redis requirement for the first version.
- No database schema change in this P2-B document-only phase.

## 3. Actors

- Web user: logs in through the Web platform.
- Web session: browser session for the Web app.
- Extension instance: one installed browser extension profile on one browser profile.
- Backend: source of truth for users, sessions, extension bindings, tokens, and revocation.

## 4. Formal Web Login Design

### 4.1 Login Method

Initial production login should use username/email plus password:

```text
POST /api/v1/auth/login
```

The backend validates credentials, creates a refresh-token session record, and returns a short-lived access token. The refresh token should be delivered as an HttpOnly secure cookie for Web clients.

Future SSO can be added behind the same session model.

### 4.2 Access Token

Recommended properties:

- Format: JWT signed by backend.
- Lifetime: 10 to 15 minutes.
- Storage in Web app: memory only.
- Claims:
  - `sub`: user id or stable username.
  - `role`: `user` or `admin`.
  - `type`: `access`.
  - `session_id`: refresh-token session id.
  - `iat`, `exp`.

The Web frontend should not persist the access token in localStorage for production.

### 4.3 Refresh Token

Recommended properties:

- Opaque random token, not JWT.
- Lifetime: 7 to 30 days.
- Stored server-side as a hash.
- Stored client-side as an HttpOnly, Secure, SameSite cookie.
- Rotated on every successful refresh.
- Revoked on logout, credential reset, or suspicious activity.

### 4.4 Web Token Refresh

The Web API client should:

1. Send access token in `Authorization: Bearer <access_token>`.
2. On `40102 token_expired`, call:

```text
POST /api/v1/auth/refresh
```

3. Receive a new access token.
4. Retry the original request once.
5. If refresh fails, clear in-memory auth state and route to login.

### 4.5 Logout

Logout should revoke the current refresh-token session:

```text
POST /api/v1/auth/logout
```

The backend clears the refresh cookie and marks the refresh token as revoked.

## 5. Extension Binding Design

The extension must not depend on the user manually copying the Web access token in production. Instead, it should bind an extension instance to the logged-in Web user.

### 5.1 Plugin Instance ID

The extension generates a local instance id on first run:

```text
plugin_<random_128_bit_urlsafe>
```

Properties:

- Generated in the extension.
- Stored in `chrome.storage.local`.
- Sent on every backend request as `X-Plugin-Instance-Id`.
- Not secret by itself.
- Used as a stable device identifier for policy, audit, and revocation.

### 5.2 Binding Challenge

The extension starts binding by asking the backend for a short-lived challenge:

```text
POST /api/v1/plugin/binding-challenges
```

Request headers:

```http
X-Plugin-Instance-Id: plugin_xxx
X-Plugin-Version: 1.0.0
```

Response data:

```json
{
  "challenge_id": "bind_chal_xxx",
  "binding_code": "482913",
  "verification_url": "http://127.0.0.1:5173/app/plugin-bind?challenge_id=bind_chal_xxx",
  "expires_at": "2026-04-24T10:15:00Z"
}
```

The extension displays the code and optionally a QR code for `verification_url`.

### 5.3 Web Confirmation

The logged-in Web user opens the verification URL and confirms binding:

```text
POST /api/v1/plugin/binding-challenges/{challenge_id}/confirm
```

Request body:

```json
{
  "binding_code": "482913",
  "display_name": "Chrome on Work Laptop"
}
```

The backend verifies:

- Web user is authenticated.
- Challenge exists and is not expired.
- Binding code matches.
- Plugin instance id is not already bound to a different active user unless explicitly re-bound.

Then it creates or activates a `plugin_instances` record.

### 5.4 Plugin Token Exchange

After confirmation, the extension exchanges the challenge for extension-scoped tokens:

```text
POST /api/v1/plugin/token
```

Request body:

```json
{
  "challenge_id": "bind_chal_xxx",
  "binding_code": "482913"
}
```

Request headers:

```http
X-Plugin-Instance-Id: plugin_xxx
X-Plugin-Version: 1.0.0
```

Response data:

```json
{
  "access_token": "<plugin_access_token>",
  "refresh_token": "<plugin_refresh_token>",
  "token_type": "Bearer",
  "expires_in": 900,
  "plugin_instance_id": "plugin_xxx"
}
```

The extension stores these tokens in `chrome.storage.local`.

### 5.5 Extension Refresh

The extension uses:

```text
POST /api/v1/plugin/token/refresh
```

The backend validates:

- Refresh token hash.
- Plugin instance is active.
- Plugin instance id header matches the token record.
- User is still active.

On success, rotate the extension refresh token and return a new access token.

### 5.6 Unbind and Revocation

Web user can revoke one plugin instance:

```text
DELETE /api/v1/plugin/instances/{plugin_instance_id}
```

The backend marks the instance revoked and revokes all extension refresh tokens for that instance.

The extension can also self-unbind:

```text
POST /api/v1/plugin/unbind
```

After unbind, the extension deletes local access/refresh tokens and returns to the binding screen.

### 5.7 Binding Invalid or Expired

If an extension request returns:

- `40101`: token invalid or missing.
- `40102`: access token expired.
- `40301`: plugin instance revoked or not owned by the user.

The extension should show a clear disconnected state and guide the user to re-bind through Options.

## 6. Backend API Draft

All responses use:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 6.1 Web Auth

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

`login` response data:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": 1,
    "username": "alice",
    "display_name": "Alice",
    "role": "user"
  }
}
```

`refresh` response data:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

### 6.2 Plugin Binding

```text
POST   /api/v1/plugin/binding-challenges
GET    /api/v1/plugin/binding-challenges/{challenge_id}
POST   /api/v1/plugin/binding-challenges/{challenge_id}/confirm
POST   /api/v1/plugin/token
POST   /api/v1/plugin/token/refresh
GET    /api/v1/plugin/instances
DELETE /api/v1/plugin/instances/{plugin_instance_id}
POST   /api/v1/plugin/unbind
```

`create binding challenge` response data:

```json
{
  "challenge_id": "bind_chal_xxx",
  "binding_code": "482913",
  "verification_url": "http://127.0.0.1:5173/app/plugin-bind?challenge_id=bind_chal_xxx",
  "expires_at": "2026-04-24T10:15:00Z"
}
```

`confirm binding` response data:

```json
{
  "plugin_instance_id": "plugin_xxx",
  "status": "confirmed"
}
```

`plugin token exchange` response data:

```json
{
  "access_token": "<plugin_access_token>",
  "refresh_token": "<plugin_refresh_token>",
  "token_type": "Bearer",
  "expires_in": 900,
  "plugin_instance_id": "plugin_xxx"
}
```

## 7. Data Model Draft

This section is a schema draft, not a migration.

### 7.1 users

Existing table should remain the owner of platform identity.

Recommended fields:

- `id`
- `username`
- `email`
- `display_name`
- `password_hash`
- `role`
- `is_active`
- `created_at`
- `updated_at`
- `last_login_at`

If password login is implemented, `password_hash` must use a modern password hash such as Argon2id or bcrypt.

### 7.2 refresh_tokens

Purpose: server-side Web refresh sessions.

Recommended fields:

- `id`
- `user_id`
- `token_hash`
- `session_id`
- `user_agent`
- `ip_address`
- `expires_at`
- `revoked_at`
- `rotated_from_id`
- `created_at`
- `last_used_at`

### 7.3 plugin_instances

Purpose: bound extension devices.

Recommended fields:

- `id`
- `plugin_instance_id`
- `user_id`
- `display_name`
- `browser_family`
- `plugin_version`
- `status`: `pending`, `active`, `revoked`
- `bound_at`
- `revoked_at`
- `last_seen_at`
- `created_at`
- `updated_at`

### 7.4 plugin_binding_challenges

Purpose: short-lived binding code / QR challenge.

Recommended fields:

- `id`
- `challenge_id`
- `plugin_instance_id`
- `binding_code_hash`
- `status`: `pending`, `confirmed`, `expired`, `consumed`, `revoked`
- `confirmed_by_user_id`
- `expires_at`
- `confirmed_at`
- `consumed_at`
- `created_at`
- `metadata_json`

### 7.5 plugin_refresh_tokens

Purpose: extension refresh sessions scoped to one plugin instance.

Recommended fields:

- `id`
- `plugin_instance_id`
- `user_id`
- `token_hash`
- `expires_at`
- `revoked_at`
- `rotated_from_id`
- `created_at`
- `last_used_at`

## 8. Security Constraints

### 8.1 Token Leak Protection

- Never log access tokens or refresh tokens.
- Store only refresh-token hashes server-side.
- Keep Web access tokens in memory.
- Use HttpOnly Secure cookies for Web refresh tokens.
- Rotate refresh tokens on every refresh.
- Revoke refresh-token families after reuse detection.

### 8.2 Web vs Extension Storage

Web:

- Access token: memory.
- Refresh token: HttpOnly Secure cookie.

Extension:

- Access token: `chrome.storage.local`.
- Refresh token: `chrome.storage.local`.
- Plugin instance id: `chrome.storage.local`.

Because extension storage is accessible to the extension context, plugin tokens should be extension-scoped and revocable per instance.

### 8.3 CORS and Extension Origin

- Production Web origins must be allowlisted.
- Extension origins must be explicitly allowlisted after publishing or during development.
- No production wildcard CORS.
- Backend must validate `X-Plugin-Instance-Id` against token claims and database state.

### 8.4 Binding Code

- Binding code lifetime: 5 minutes.
- Binding code should be random and single-use.
- Store binding code as a hash.
- Rate-limit failed confirmation attempts by challenge and IP.
- Expired challenges cannot be confirmed or exchanged.

### 8.5 Single Device Revocation

- Revoking one plugin instance should not revoke the Web session.
- Revoking one plugin instance should revoke all plugin refresh tokens for that instance.
- Other plugin instances for the same user remain active.

## 9. Migration Plan

### Phase 1: Keep Development Auth Stable

- Keep `mock-login` behind development config.
- Keep current manual extension token configuration for local development.
- Keep legacy `X-WebGuard-User` / `X-WebGuard-Role` compatibility only when development auth is enabled.

### Phase 2: Add Web Auth Tables and Interfaces

- Add migrations for `password_hash` if needed.
- Add `refresh_tokens`.
- Implement `/api/v1/auth/login`, `/refresh`, `/logout`, `/me`.
- Update frontend auth context to use access-token memory plus refresh flow.

### Phase 3: Add Plugin Binding Tables and Interfaces

- Add `plugin_instances`.
- Add `plugin_binding_challenges`.
- Add `plugin_refresh_tokens`.
- Implement binding challenge, confirmation, token exchange, refresh, and revoke endpoints.
- Add minimal Web binding page.
- Add extension Options binding state.

### Phase 4: Migrate Protected APIs

Move from compatibility auth to `require_auth` in small batches:

1. User policy and domain APIs.
2. Reports and records.
3. Plugin bootstrap and scan/event APIs.
4. Admin APIs with explicit admin dependency.

Each batch should include tests for:

- no token.
- expired token.
- valid Web token.
- valid plugin token where allowed.
- revoked plugin instance.

### Phase 5: Remove Production Dependence on Development Headers

- Keep development headers only when `DEBUG=true` and `ENABLE_DEV_AUTH=true`.
- Ensure staging/prod defaults disable development auth.
- Document local-only usage in README and dev setup.

## 10. P2-C / P2-D Implementation Split

### P2-C: Formal Web Login

Recommended scope:

- Add database migration for Web auth fields and refresh tokens.
- Add password hashing utility.
- Implement login, refresh, logout, and me endpoints.
- Update frontend auth context and API client refresh behavior.
- Add backend tests for login, refresh rotation, logout, and expired access token.
- Preserve mock-login as development-only.

### P2-D: Extension Binding

Recommended scope:

- Add plugin instance, binding challenge, and plugin refresh-token migrations.
- Implement binding challenge creation, Web confirmation, plugin token exchange, plugin refresh, revoke, and unbind.
- Update extension Options to show binding status and initiate binding.
- Update Web app with a minimal binding confirmation page.
- Migrate plugin bootstrap and scan calls to plugin-scoped tokens.
- Add tests for confirmed binding, expired challenge, revoked instance, and plugin token refresh.

## 11. Open Questions

- Should usernames remain the stable token subject, or should tokens move to numeric user ids?
- Should extension refresh tokens be long-lived or require periodic Web re-confirmation?
- Should admins be able to revoke any user's plugin instance in the first implementation?
- Should the Web refresh cookie be path-scoped to `/api/v1/auth` or sent broadly to the API host?
- Should password login ship first, or should the project adopt an SSO provider before production?
