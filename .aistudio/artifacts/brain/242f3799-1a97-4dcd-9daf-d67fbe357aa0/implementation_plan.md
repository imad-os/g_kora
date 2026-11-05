# Adapt FootballLive to My PC Smart TV Application

This plan defines the architectural migration and adaptation of the **FootballLive (Lite Football TV)** application to a native **My PC** app targeting Samsung Smart TVs (2024+, Tizen 8/9), desktop browsers, and mobile devices, strictly conforming to the official [My PC SDK v1 Guide](https://imad-os.github.io/g/sdk/GUIDE.md).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The adaptation eliminates external server dependencies and proprietary Tizen OS APIs, switching to standard My PC SDK protocols. Please review these core architectural decisions:

- **Identity & Manifest**: Configured as `"type": "app"`, id `"football-live"`, name `"Football Live"`, version `"1.0.0"`.
- **Firebase & Auth Migration**: Replaces Firebase Authentication, Firestore, and login forms with native **`MyPC.profile`** and **`MyPC.save()` / `MyPC.load()`**. Each TV profile automatically has its own persistent favorite teams, favorite leagues, and tracked matches without passwords or forms.
- **Networking & API Proxy Elimination**: Replaces the custom proxy (`f.geekspro.us`) and direct browser `fetch` with **`MyPC.net.fetch()`**. This runs without CORS restrictions on TVs and allows API keys and endpoints to be configured via **`MyPC.app_config`** in the App Store Manager.
- **Controller-First Input Scheme**: Full gamepad mapping via **`MyPC.gamepad`** / **`onInput`** alongside TV remote arrows + OK. Removes all custom `window.addEventListener('keydown')` and Tizen `tizen.tvinputdevice` calls.
- **My PC Platform Extensions**:
  - **Desktop Widget** (`widgets/scores.js`): A medium card on the TV desktop displaying live scores and today's top match, refreshing every 15 minutes.
  - **Background Notification Service** (`services/notify.js`): Runs in the background to alert users when a goal is scored in their tracked matches via `MyPC.notify`.

---

## 1. Overview & Core Concept

- **What It Does**: A live sports companion for Samsung Smart TVs and PCs that provides live scores, goal alerts, match timelines, team lineups, league tables, and player statistics with instant TV-remote and game-controller navigation.
- **Target Audience / Persona**: Sports fans watching football on 2024+ Samsung Smart TVs (Tizen 8 & 9) from the couch (10-foot interface), desktop My PC users, and mobile users.
- **Key Value**: Low-latency live scores, sound effects, and goal alerts designed specifically for TV hardware constraints: zero garbage collection stutter, high-contrast visibility from 3 meters away, and zero account setup friction.

---

## 2. User Experience & Visual Design

### 10-Foot TV Experience & Layout
- **Resolution & Viewport**: Fixed 16:9 responsive layout with safe zones (5% screen margin) to prevent TV overscan clipping.
- **Typography & Scale**: Primary fonts sized at $\ge 3.5\%$ viewport height ($24\text{px}$–$36\text{px}$ at 1080p) for readability from 3 meters away.
- **Selection & Focus State**: Distinctive glowing active focus ring (`outline: 3px solid #38bdf8; box-shadow: 0 0 16px rgba(56, 189, 248, 0.6); transform: scale(1.03);`) on cards, tabs, and buttons.
- **Gamepad HUD Hints**: Subdued HUD footer displaying controller button actions:
  - `(B)` Open / Select
  - `(A)` Back / Exit
  - `(X)` Track Match
  - `(Y)` Live Filter
  - `(L / R)` Previous / Next Day
  - `(+)` Pause / My PC Menu

### Screen & Navigation Flow
```
┌────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR          │  MAIN CONTENT HEADER                                │
│                   │  [ Date: Today / Live Only ]  [ CH- / CH+ or L / R ]│
│  [🏠] Matches     ├─────────────────────────────────────────────────────┤
│  [📅] Calendar    │  MATCH CARDS / LEAGUE GROUPS                        │
│  [⭐] Favorites   │  ┌───────────────────────┐ ┌──────────────────────┐ │
│  [⚙️] Settings    │  │ ⚽ Premier League     │ │ ⚽ La Liga           │ │
│                   │  │ Arsenal 2 - 1 Chelsea │ │ Real Madrid 3 - 0 ...│ │
│                   │  │ [🟢 74' - Active Focus]│ │ [⏰ 20:00]          │ │
│                   │  └───────────────────────┘ └──────────────────────┘ │
│                   ├─────────────────────────────────────────────────────┤
│                   │  MATCH DETAILS MODAL (Timeline / Lineups / Stats)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale | Alternatives Considered |
|---|---|---|---|
| **Input Handling** | My PC SDK input events (`onInput` / `MyPC.isDown` / `MyPC.gamepad`) | My PC owns the remote and gamepad; reading native `keydown` breaks on Tizen inside iframes and conflicts with TV OS shortcuts. | Custom keyboard listeners (rejected: prohibited by My PC guide section 5 & 11). |
| **User Persistence** | `MyPC.save(data)` & `MyPC.load()` scoped to active `MyPC.info().profile` | Native per-profile storage without requiring email, password, or third-party authentication. | Firebase Auth & Firestore (rejected: prohibited by My PC guide section 14). |
| **API Networking** | `MyPC.net.fetch()` with fallback to standalone direct fetch | TV iframes are blocked by CORS; `MyPC.net.fetch` executes through My PC host process with no CORS limits and supports API keys in `app_config`. | Custom CORS proxy / Cloud Function (rejected: prohibited by guide section 14). |
| **TV Performance** | Chromium 108 compliant, no CSS nesting, DOM element reuse, single requestAnimationFrame loop | Tizen 8 is Chromium 108; complex CSS nesting and rapid DOM allocations cause frame drops. | React/Next.js re-write (rejected: unnecessary bundle overhead and slow boot times on low-end TVs). |

---

## 4. Technical Architecture & Data Strategy

```
                               ┌──────────────────────────────────────────────┐
                               │       My PC Samsung Smart TV Host / Shell    │
                               │  - Gamepad & Remote Dispatch                 │
                               │  - Profile & Cloud Save Store                │
                               │  - Desktop Widgets & Notification Services   │
                               └──────────────────────┬───────────────────────┘
                                                      │ postMessage / SDK
                               ┌──────────────────────▼───────────────────────┐
                               │            Football Live App                 │
                               │  ┌────────────────────────────────────────┐  │
                               │  │ <script src=".../mypc-sdk.js"></script>│  │
                               │  │ MyPC.init({ onInit, onStart, ... })    │  │
                               │  └───────────────────┬────────────────────┘  │
                               │                      │                       │
                       ┌───────┴──────────────┬───────┴──────────────┬────────┴───────┐
                       ▼                      ▼                      ▼                ▼
                ┌──────────────┐       ┌──────────────┐       ┌─────────────┐  ┌─────────────┐
                │ Gamepad & TV │       │ MyPC.net     │       │ MyPC.save   │  │ Audio & HUD │
                │ Navigation   │       │ Football API │       │ Favorites & │  │ Goal sounds │
                │ Spatial grid │       │ Rotation     │       │ Settings    │  │ Voice Guide │
                └──────────────┘       └──────────────┘       └─────────────┘  └─────────────┘
```

### Component & File Structure to Create / Update

1. **`mypc-app.json`** *(Root)*:
   - Official manifest specifying `mypc: 1`, `id: "football-live"`, `name: "Football Live"`, `type: "app"`, `version: "1.0.0"`, `entry: "index.html"`, `icon: "assets/icon.png"`, `config`, and `widgets`.
2. **`CLAUDE.md`** & **`.nojekyll`** *(Root)*:
   - Official developer guide instructions and GitHub Pages compatibility file.
3. **`index.html`**:
   - First script tag in `<head>`: `<script src="https://imad-os.github.io/g/sdk/mypc-sdk.js"></script>`.
   - Remove Firebase script tags (`firebase-app-compat.js`, etc.).
   - Remove desktop redirect snippet `if (!isTv && ...) window.location.replace("website/");`.
   - Add asset version query strings `?v=1.0.0` to all CSS and JS imports.
   - Add HUD gamepad hints footer.
4. **`js/mypc-adapter.js`**:
   - Handles `MyPC.init(...)` lifecycle (`onInit`, `onStart`, `onPause`, `onResume`, `onDestroy`, `onInput`).
   - Maps gamepad buttons: D-pad / sticks, A (Back), B (OK), X (Track), Y (Live filter), L/R (Days).
   - Audio handling: creates single `AudioContext` in `onStart`, cleans up in `onDestroy`.
5. **`js/services.js`**:
   - Replaces Firebase Auth and Firestore with `MyPC.save()` and `MyPC.load()`.
   - Reads user profile from `MyPC.info().profile`.
   - Replaces custom proxy with `MyPC.net.fetch()`.
   - Reads API keys and settings from `MyPC.app_config` (fallback to default keys).
6. **`widgets/scores.js`**:
   - Web Worker desktop widget displaying today's matches and live score updates on the TV desktop.
7. **`services/notify.js`**:
   - Periodic background service that checks live tracked match scores and calls `MyPC.notify()` on goals.

---

## 5. Execution Steps & Guide Checklist (Section 11)

### Phase 1: Clean Foundation & Manifest
- [x] Put `CLAUDE.md` and `.nojekyll` at repository root.
- [x] Create valid `mypc-app.json` with required schema and configurations.
- [x] Remove obsolete Tizen files (`tizen_web_project.yaml`, `.project`, `.tproject`, `config.xml`, `FootballLive.zip`).

### Phase 2: SDK Lifecycle & Input Integration
- [x] Load `mypc-sdk.js` as the first script tag.
- [x] Implement complete `MyPC.init` handlers (`onInit`, `onStart`, `onPause`, `onResume`, `onDestroy`, `onInput`).
- [x] Integrate gamepad mapping (`dev 0-3`, buttons A, B, X, Y, L, R, sticks).
- [x] Remove custom `keydown` listeners and Tizen key registration.

### Phase 3: Storage, Networking & Services
- [x] Switch storage to `MyPC.save` and `MyPC.load`.
- [x] Switch network requests to `MyPC.net.fetch`.
- [x] Create desktop widget (`widgets/scores.js`).
- [x] Create goal notification service (`services/notify.js`).

### Phase 4: Verification & GitHub Pages Publication
- [x] Verify standalone browser mode with arrows + Enter + Esc.
- [x] Test responsive scaling and safe zones at 1920x1080 and 1280x720.
- [x] Verify Chromium 108 compatibility (no CSS nesting, no unpolled loops).
- [x] Output App Store Manager deployment instructions (`https://imad-os.github.io/g/installer/`).
