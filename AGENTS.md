# AGENTS.md

This repository contains the **WebGuard** application suite. It is a production-oriented system, not a demo project.

WebGuard has **three first-class deliverables**:

1. `frontend/` — Web platform used as the primary product surface.
2. `backend/` — FastAPI service that owns detection, policy, reports, auth, and persistence.
3. `extension/` — Manifest V3 browser extension used as a lightweight companion client.

This file exists to guide Codex and any automated coding agent before it reads or modifies code.

---

## 1. Product brief

WebGuard is a malicious website detection and warning platform.

### Product goals

- The **Web platform** is the primary entry point for users and admins.
- The **browser extension** is a companion used for real-time scan, warning, blocking, and opening Web reports.
- The **backend** is the single source of truth for risk evaluation, policy, reports, plugin binding, and auditing.
- The system must be capable of evolving from local-dev workflows into a production-grade architecture.

### Non-goals

- Do not turn the extension into the main product shell.
- Do not implement temporary “mock-only” behaviors as if they were final production features.
- Do not couple frontend and extension directly when the backend should be the coordination boundary.
- Do not write toy-grade code, tutorial-grade shortcuts, or one-off hacks.

---

## 2. Current repository layout

```text
.
├─ frontend/
├─ backend/
├─ extension/
├─ docs/
├─ .env.example
└─ AGENTS.md
```

### Current observed stack in repository

#### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Axios
- Tailwind CSS

#### Backend
- Python FastAPI
- SQLAlchemy
- Alembic
- Pydantic v2
- Uvicorn
- PostgreSQL is the target runtime database

#### Extension
- Chrome/Chromium extension
- Manifest V3
- TypeScript
- Popup / Options / Warning pages
- Background Service Worker
- `chrome.storage.local`

### Important architecture note

The repository targets PostgreSQL for runtime persistence.

When modifying the project, treat the architecture target as:

- **Production target database: PostgreSQL**
- **Temporary local compatibility** with legacy configs may remain only when required to avoid breaking the branch immediately

Do not silently deepen the inconsistency. If a task touches database configuration, prefer converging the repo toward PostgreSQL unless explicitly instructed otherwise.

---

## 3. Required design principles

All code changes must respect the following constraints.

### 3.1 System-level rules

- The **backend owns all trusted business decisions**.
- The extension may cache or pre-filter, but it is not the final risk authority.
- The Web platform and the extension are both backend clients.
- User-visible product management belongs primarily to the Web platform.
- The extension should stay thin, resilient, and policy-driven.

### 3.2 Quality bar

Every change must aim for:

- correctness
- maintainability
- testability
- clear boundaries
- explicit error handling
- observable behavior

Avoid:

- hidden control flow
- copy-paste service logic
- giant files with mixed concerns
- controller-heavy implementations
- undocumented breaking changes

---

## 4. Layering and boundaries

### Backend layering rules

Use or preserve the following conceptual layers:

- `api/` or router layer
  - request parsing
  - response shaping
  - auth dependency wiring
  - no heavy business logic

- `schemas/`
  - request/response DTOs
  - typed validation contracts

- `services/`
  - business orchestration
  - detection pipeline
  - policy logic
  - report generation

- `models/`
  - SQLAlchemy persistence models

- `core/`
  - config
  - exceptions
  - shared response helpers
  - database session management

### Explicit prohibitions

Do **not**:

- write SQL directly inside route handlers
- perform HTTP-specific branching deep inside domain services without reason
- return raw ORM objects directly as API responses
- bypass schema validation for convenience
- put long-term auth logic into temporary mock endpoints

### Frontend rules

- Page components must not become service containers.
- All backend requests must go through a centralized API layer.
- Keep routing, service calls, state handling, and rendering separated.
- Prefer typed API contracts over untyped ad hoc objects.
- Do not duplicate API DTO definitions arbitrarily across files.

### Extension rules

- `background.ts` / service worker handles orchestration.
- UI pages only own their page concerns.
- Shared request/storage/navigation helpers belong in dedicated utility modules.
- Extension behavior must degrade safely when backend is unavailable.

---

## 5. Source-of-truth documents

Before planning or coding, read the following files in this order when they exist:

1. `AGENTS.md`
2. `docs/architecture.md`
3. `docs/api-contract.md`
4. `docs/coding-standards.md`
5. `docs/dev-setup.md`
6. `docs/deployment-checklist.md`

When there is a conflict:

- `AGENTS.md` defines repository-wide execution guidance.
- `docs/architecture.md` defines target architecture.
- `docs/api-contract.md` defines interface truth.
- implementation files define current state, not necessarily desired state.

If code contradicts architecture docs, do **not** assume the code is correct. Investigate and either:

- align code to docs, or
- update docs if the task explicitly changes architecture.

---

## 6. How to approach tasks in this repository

### 6.1 For any non-trivial change

Use this order:

1. inspect relevant docs
2. inspect current implementation
3. identify drift between docs and code
4. propose/execute minimal coherent changes
5. update docs if and only if architectural behavior changed
6. run checks/tests relevant to the touched area

### 6.2 For backend tasks

At minimum, inspect:

- relevant router in `backend/app/api/`
- relevant schema in `backend/app/schemas/`
- relevant services in `backend/app/services/`
- relevant SQLAlchemy models in `backend/app/models/`
- response and exception helpers in `backend/app/core/`

### 6.3 For frontend tasks

At minimum, inspect:

- page(s) in `frontend/src/pages/`
- shared layout/components
- service wrapper(s) in `frontend/src/services/`
- route definitions in `frontend/src/router.tsx`
- auth/session handling in `frontend/src/contexts/`

### 6.4 For extension tasks

At minimum, inspect:

- `extension/manifest.json`
- `extension/src/background.ts`
- relevant page module in `extension/src/popup/`, `options/`, `warning/`
- `extension/src/utils/api.ts`
- `extension/src/utils/storage.ts`
- navigation helpers and runtime messaging flow

---

## 7. Authentication and environment constraints

### Current state

- The repo still contains a development-only mock login flow.
- This is acceptable only as a temporary development aid.

### Target state

- Web platform: real authentication
- Extension: plugin instance binding + short-lived access model
- Backend: production-grade authorization and auditability

### Important rule

Do not expand mock login into additional production-facing business logic.
If a task touches auth or permissions, push the code closer to real auth boundaries instead of adding more mock-specific coupling.

---

## 8. API contract expectations

All public API work must follow the standardized response envelope documented in `docs/api-contract.md`.

Expected shape:

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

Rules:

- use standard HTTP status codes appropriately
- use stable business codes in the JSON body
- never return inconsistent field names for the same concept
- avoid naked arrays as top-level response bodies for product APIs

---

## 9. Observability, logging, and safety

Any change affecting important flows should preserve or improve:

- structured logging
- request correlation (`X-Request-Id` or equivalent)
- user/plugin instance traceability
- explicit error categorization
- safe fallback behavior

Never:

- log plaintext passwords
- log full access tokens
- expose stack traces to clients in production-facing responses
- add wildcard CORS in production logic

---

## 10. Testing and verification requirements

When you touch code, run the narrowest meaningful checks first, then broader checks if needed.

### Backend expected checks

Examples:

```bash
cd backend
pytest
```

If only specific areas are touched, run focused tests first.
If tests are missing for newly introduced behavior, add them when reasonable.

### Frontend expected checks

```bash
cd frontend
npm run lint
npm run build
```

### Extension expected checks

```bash
cd extension
npm run build
```

If you cannot run a check because the environment is incomplete or broken, state exactly what blocked it.
Do not claim success without evidence.

---

## 11. Documentation update policy

Update documentation when any of the following changes:

- route contract
- auth behavior
- environment variable semantics
- startup command
- directory conventions
- plugin/backend coordination rules
- rollout sequence

If the implementation changes but docs remain stale, the task is not complete.

---

## 12. Definition of done for Codex tasks

A change is considered complete only if:

1. it is consistent with this repository’s architecture direction;
2. touched layers remain properly separated;
3. relevant checks/tests were run or blockers were stated honestly;
4. config/docs are updated when needed;
5. no obviously temporary shortcut is presented as a finished production solution.

---

## 13. If the task is ambiguous

When instructions are ambiguous:

- choose the interpretation that preserves architecture quality,
- avoid broad destructive refactors unless the task clearly calls for them,
- prefer incremental convergence toward the target architecture,
- document any assumption in the task result.

That is the operating contract for this repository.
