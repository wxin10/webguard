# WebGuard Extension Release Checklist

Version: P2-K manifest and store-readiness draft

This document records the current browser-extension release review baseline. It is a checklist for store-readiness work, not a new feature plan and not a production deployment guide.

## 1. Manifest Review

Current manifest file:

```text
extension/manifest.json
```

Current baseline:

- `manifest_version`: `3`.
- Background runtime: MV3 service worker at `dist/background.js`.
- UI entries: `action.default_popup`, `options_page`, and `web_accessible_resources` for the warning page are present.
- Icons: `16`, `48`, and `128` pixel icons are declared.
- `externally_connectable`: not configured. Keep it absent unless a separate trusted Web-to-extension messaging flow is designed.

## 2. Permission Review

Current permissions:

```json
["storage", "tabs", "notifications"]
```

Justification:

- `storage`: required for extension settings, plugin tokens, policy cache, latest scan state, and local trust decisions.
- `tabs`: required to observe tab updates, query the active tab, redirect risky tabs to the warning page, open Web reports, and open binding confirmation URLs.
- `notifications`: required to show suspicious or malicious-site browser notifications.

Current host permissions:

```json
[
  "http://127.0.0.1:8000/*",
  "http://localhost:8000/*"
]
```

Release requirement:

- Local API host permissions must not ship as the only production API permission.
- Before packaging for a store, replace or augment local API host permissions with the production API origin, for example `https://api.webguard.example.com/*`.
- Do not use `<all_urls>` in `host_permissions` unless a later browser requirement proves it is unavoidable.

## 3. Page Match Review

Current content script matches:

```json
["http://*/*", "https://*/*"]
```

Current warning page web-accessible matches:

```json
["http://*/*", "https://*/*"]
```

Reason:

- The extension is a real-time malicious-site detector and must observe ordinary HTTP/HTTPS pages to trigger scan, allow, warn, or block decisions.
- This broad page match is not the same as `<all_urls>` host permission for backend fetches.
- The background script skips browser-internal URLs, the extension's own pages, and configured WebGuard platform hosts.

Future narrowing options:

- Add user-configurable site scope if the product no longer requires all-page scanning.
- Split production release channels by managed enterprise policy if an organization wants narrower allowed sites.
- Re-review matches whenever detection scope changes.

## 4. Sensitive Logging Review

Release requirements:

- Do not log access tokens.
- Do not log refresh tokens.
- Do not log binding codes.
- Do not log full Authorization headers.
- Avoid logging full browsing URLs in production builds unless a product/privacy decision explicitly allows it.

Current P2-K review result:

- No token, refresh token, Authorization header, or binding-code console logging was found in `extension/src`.
- Binding codes are displayed in Options UI for the user to confirm binding; they are not logged.
- The background script still logs scan URLs for local diagnostics. Treat production log redaction as a release hardening follow-up before public store submission.

## 5. Data Collection Disclosure

Minimum disclosure for store privacy forms and privacy policy:

- The extension reads the current page URL.
- The extension may collect lightweight page features needed for detection, including title, visible text, button labels, input labels, form-action domains, and password-input presence.
- The extension sends scan requests and plugin events to the configured WebGuard backend.
- The extension stores settings, plugin instance id, plugin tokens, policy cache, latest scan result, and local temporary trust decisions in `chrome.storage.local`.
- The extension does not sell browsing data.
- WebGuard backend is the source of truth for scan records, reports, policy, plugin binding, and revocation.

## 6. Manual Token Fallback

Manual Access Token entry in Options remains a development compatibility path.

Production requirement:

- The preferred production path is formal plugin binding and plugin-scoped tokens.
- Manual Web token fallback must not be presented as the normal production setup path.
- If kept visible in a production build, label it clearly as an advanced/development compatibility option.

## 7. Store Listing Minimums

Before store submission, confirm:

- Extension name is final and not misleading.
- Description explains malicious-site detection, warning, blocking, and WebGuard backend coordination.
- Icons at required sizes are present and visually final.
- Screenshots show Options, Popup, Warning, and Web binding confirmation flow.
- Privacy policy is published and linked from the store listing.
- Permission-use explanations match this checklist.
- Support/contact URL or email is available.

## 8. Production API and Origin Setup

Before release:

1. Set production backend `CORS_ORIGINS` to the Web origin and published extension origin.
2. Update extension API configuration or manifest host permissions for the production API origin.
3. Confirm the published extension ID after store upload.
4. Update deployment templates and backend allowlist with `chrome-extension://<published-extension-id>`.
5. Re-run real-browser smoke tests with a production-like backend and HTTPS frontend.

## 9. Store Smoke Test

Run this before submission:

1. Build the extension with `npm run build`.
2. Load the exact package directory in Chrome or Edge developer mode.
3. Open Options and verify API/Web URLs.
4. Complete formal plugin binding.
5. Confirm Popup shows bound plugin token status.
6. Visit a safe URL and confirm allow behavior.
7. Visit a risky URL and confirm warning or block behavior.
8. Use temporary trust and permanent trust from the warning flow.
9. Confirm records, reports, policies, and plugin instance state in the Web app.
10. Revoke the plugin instance and confirm later plugin requests require re-binding.

## 10. Remaining Release Blockers

P0:

- Production extension ID and extension-origin allowlist are not available until store packaging/upload.
- Production API origin is not yet wired into a release-specific extension manifest or packaging process.
- Public privacy policy is not yet published.

P1:

- Production build should redact or remove full browsing URL diagnostics from extension console logs.
- Manual token fallback should be hidden or clearly marked in production UI.

P2:

- QR-code binding UI remains future work.
- Store listing copy, screenshots, and support links need final product review.
