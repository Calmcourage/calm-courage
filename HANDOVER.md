# Calm Courage — Comprehensive Documentation - September 21st 2026

**Date:** 21 Sep 2026  
**Prepared for:** Ashley / next developer  
**Source of truth branch:** `main`  
**Repo:** https://github.com/ductranphan/calm-courage  

---

## 0. Critical first facts

1. **Source of truth is GitHub `main`** (PR #13 merged `duc` → `main`). Keep local `main` clean and up to date with `origin/main`.
2. Branch `duc` still exists for historical work; prefer **`main`** for new development unless the company says otherwise.
3. **Firebase backend for project `calm-courage-co` is already deployed** (rules + Cloud Functions).
4. **App Store / Google Play submission has not happened.**
5. **Card art OOM risk is still real on `main`.** Emotion Match + Scenario decks are large photo-in-SVG assets. Prefer physical devices / EAS preview for QA; Expo Go + low-RAM emulators can crash. Asset rasterization is **not** in the repo yet.
6. **Never commit `.env`.** Keys live locally / in EAS secrets / a password manager only.
7. **There is no shared “admin” login baked into the app.** Access = platform accounts (GitHub, Firebase, Expo) + a filled `.env` + signing up (or using) a parent email/password in the app. Confirm every invite **before** the previous developer leaves.
8. **Expo/EAS is not linked yet** — no `extra.eas.projectId` in `app.json`. Local Expo Go does not require an Expo org; cloud builds do (`eas init`).

---

## 0A. Access & credentials (must confirm before handover is complete)

This section is what prevents lock-out when the previous engineer is unavailable. **Tick each box only after Ashley (or the company owner) can open that console with their own email.**

### Platforms connected to this app

| Platform | What it is for | Where | Access Ashley must have | Status to confirm |
|----------|----------------|--------|-------------------------|-------------------|
| **GitHub** | Source code | https://github.com/ductranphan/calm-courage | **Write** on the repo (ideally Admin if ownership will transfer) | [ ] Invited |
| **Firebase / GCP** | Auth, Firestore, Storage, Cloud Functions, billing | https://console.firebase.google.com/project/calm-courage-co/overview | **Editor or Owner** on project `calm-courage-co` + Blaze billing visibility | [ ] Invited |
| **Expo / EAS** | Cloud builds, env vars, submit | https://expo.dev (org/project for `calm-courage`) | Member/Admin who can `eas login`, `eas build`, `eas:env:sync` | [ ] Invited |
| **Apple Developer + App Store Connect** | iOS store builds / listing | developer.apple.com / appstoreconnect.apple.com | Company team member (may not exist yet) | [ ] N/A or invited |
| **Google Play Console** | Android store builds / listing | play.google.com/console | Company account (may not exist yet) | [ ] N/A or invited |
| **Password manager** | Real `.env`, service accounts, keystores | Company 1Password / Bitwarden / etc. | Shared vault item(s) — **not** git, not Slack | [ ] Shared |
| **Support inbox** | Contact Us / store listing | Address used for `EXPO_PUBLIC_SUPPORT_EMAIL` | Can receive mail | [ ] Confirmed |
| **Privacy Policy host** | Store listing URL | Company site / Notion / legal host | Edit access when URL is live | [ ] Confirmed |

**Historical Firebase owner email noted in prior handovers:** `hello@calmcourageco.ca` — **verify current IAM** in Firebase Console → Project settings → Users and permissions. Do not assume that mailbox alone is enough for Ashley.

### Secrets that must be handed over (password manager only)

Hand these as a vault item titled e.g. `Calm Courage — developer secrets`. Never commit them.

1. Complete local **`.env`** contents (all `EXPO_PUBLIC_FIREBASE_*` + support/privacy URLs when set).
2. Any **Google service-account JSON** used for `npm run seed:emotion-prompts` / Admin SDK offline work.
3. Expo account email + org name (password via SSO or vault — not this file).
4. When they exist: iOS **`.p8` / provisioning**, Android **keystore** (`.jks`), Play service account for `eas submit`.

Template of required env **names** (values are secret): see `.env.example`.

### What Ashley must set up on their machine

```bash
# 1) Code
git clone https://github.com/ductranphan/calm-courage.git
cd calm-courage
git fetch origin
git checkout main
git pull
npm install
npm run functions:install

# 2) Env (values from password manager — not from this markdown file)
cp .env.example .env
# Paste EXPO_PUBLIC_FIREBASE_* and related values into .env

# 3) Run
npx expo start --clear
```

Optional later (store / cloud builds):

```bash
npx eas-cli login
npx eas-cli init          # once — writes extra.eas.projectId (still required)
npm run eas:env:sync      # push EXPO_PUBLIC_* into EAS environments
```

Firebase CLI (only when redeploying rules/functions):

```bash
npx firebase-tools login
npm run firebase:deploy
```

---

## 0B. How to log into the app and reach all features

There is **no hardcoded staff password**. Use Firebase Auth email/password like any parent.

### First-time path (full access to product surfaces)

1. Launch the app (Expo Go or EAS preview / emulator).
2. **Age gate** → enter an adult birth year (13+ clearance stored locally).
3. **Onboarding → Create account** → email + password; accept Terms, Privacy, Parent/Guardian Consent.
4. **Verify email** (check inbox / spam for Firebase verification).
5. Set **Parent PIN**, then **create a child** profile (avatar, etc.).
6. Use **Switch to child** / parent mode as needed to open:
   - Parent home (`/home`), children, settings, contact us, privacy policy
   - Child dashboard: daily emotion, scenarios, emotion match, roleplay, confidence quests, quest board, workbook, rewards
7. **Level 1** activities are free. **Level 2+** opens the paywall.

### Soft-launch / QA subscription unlock

- Flag `EXPO_PUBLIC_ENABLE_QA_PURCHASE` / `QA_PURCHASE_ENABLED` exists in `src/constants/featureFlags.ts`, but **`paywall.tsx` does not read it yet** — the Face ID simulation sheet is always available on `main`.
- **Before any store build:** wire the paywall to that flag (show “coming soon” when false) or replace with real IAP. Fake purchase UI violates App Store 3.1.1 / Play payments policy.
- Until gated: use the paywall Face ID sheet only on internal/QA devices to call `activateSubscription`.

### If login fails

| Symptom | Check |
|---------|--------|
| App throws on startup naming missing Firebase keys | `.env` incomplete; see `src/config/firebase.ts` fail-fast |
| Auth / Firestore errors | Firebase Console → Auth Email/Password enabled; project id is `calm-courage-co` |
| Password reset email doesn’t open the app | Auth ActionCodeSettings + authorized domains; scheme `calm-courage://reset-password` |
| Cannot deploy Functions | Need Firebase Editor/Owner + Blaze |

### Suggested QA parent account (create and record in password manager)

Create one dedicated test parent (e.g. `qa+ashley@yourcompany.com`), record email + password + PIN in the vault. Do **not** put that password in this file or in git.

---

## 1. Current status — what is fully completed

### 1.1 Product / compliance (code complete)

| Item | Status | Location |
|------|--------|----------|
| COPPA age gate (birth year, not “are you 13?”) | Done | `src/app/age-gate.tsx`, `src/utils/ageGate.ts` |
| Under-13 blocked path (no account/data collection) | Done | `src/app/under-13.tsx` |
| Parent Terms / Privacy / Guardian consent on signup | Done | `src/constants/consent.ts` (`CONSENT_VERSION = "2026-08-26"`), email signup flow |
| Consent stored on parent profile with version + timestamps | Done | `src/services/auth.ts` |
| Child creation gated on parental consent | Done | children / auth services |
| In-app Privacy Policy screen | Done | `src/app/privacy-policy.tsx` |
| Email/password auth, verify email, forgot/reset password | Done | auth screens + `src/services/auth.ts` |
| Password-reset deep link handling | Done | `src/components/AuthDeepLinkHandler.tsx`, scheme `calm-courage://` |
| Parent PIN gate + forgot-PIN math | Done | `parent-verification`, `forgot-pin-math` |
| Parent/child mode switching | Done | `ParentAccessContext`, `switch-to-child` |
| Settings, Contact Us, Help, Delete account | Done | respective `src/app/*` screens |
| Soft-launch paywall → Cloud Function entitlement | Done | `paywall.tsx` + `activateSubscription` |

### 1.2 Backend (live)

| Item | Status |
|------|--------|
| Firebase project `calm-courage-co` | Live |
| Firestore rules (owner checks; subscription fields locked from client) | Deployed |
| Storage rules | Deployed |
| Cloud Functions `activateSubscription`, `clearSubscription` (`us-central1`) | Deployed |
| App callable wiring via `httpsCallable` | Done (`src/services/subscription.ts`, `src/config/firebase.ts`) |

### 1.3 App architecture / tooling prepared

| Item | Status |
|------|--------|
| Expo SDK ~57 app with Expo Router (`src/app/`) | Done |
| Bundle IDs `com.calmcourage.app` (iOS + Android) | In `app.json` |
| Deep link / intent filters | In `app.json` |
| `eas.json` profiles: `development`, `preview`, `production` | Done |
| `PRODUCTION.md` deploy/smoke checklist | Done |
| `.env.example` with all required public env keys | Done |
| Lazy-load heavy Emotion Match / Scenario screens | Done (`LazyRouteScreen`, `src/screens/*`) |
| `babel.config.js` (Expo + Reanimated plugin) | Done |
| `newArchEnabled: false` (Expo Go stability) | Done |

### 1.4 Games / features (V1 implemented in code)

Child dashboard (`child-dashboard.tsx`) documents V1 activities:

| Feature | Routes / areas | Notes |
|---------|----------------|-------|
| Daily emotion check-in + encouragement | `/daily-emotion`, `/emotion-encouragement` | Firestore prompts + local fallbacks |
| Choose Your Courage (scenarios) | `/scenario-challenges`, `/scenario-card` | Level hubs; Level 1 free, 2+ paywalled |
| Emotion Puzzle Match | `/emotion-puzzle`, `/emotion-match-card` | Same premium model |
| Roleplay Challenges | `/roleplay-challenges`, `/roleplay-card` | Large PNGs; not preloaded at startup anymore |
| Confidence Quests | `/confidence-quests`, `/confidence-quest-card` | Progress service exists |
| Quest Board | `/quest-board` | Weekly-style quests |
| Digital workbook | `/digital-workbook` | Includes age-banded workbook UI |
| Recording answers | `/recording-answer` | Uses `expo-audio` |
| Rewards (stars/gems/badges) | `/rewards` + `useChildRewards` | Loaded from child Firestore doc |
| Parent home dashboard | `/home` | Progress bar, check-in, evening prompt |
| Children management | `/children`, profile info/avatar | CRUD under parent |

### 1.5 Progress / rewards functionality (implemented)

- Activity attempts tracked in Firestore (`src/services/activityAttempts.ts`)
- Hub level progress (`src/services/hubLevelProgress.ts`) — levels map to activity IDs like `phase1_...__level_N`
- Confidence quest progress (`src/services/confidenceQuestProgress.ts`)
- Phase 1 activity catalog (`src/constants/activities.ts`) with pillars/rewards
- Game hub → Phase 1 activity mapping via `GAME_HUB_ACTIVITY_IDS`
- Parent dashboard progress from completed Phase 1 activities
- Child stars/gems/badges via `useChildRewards` / child document fields
- Premium gating: activity/level **1 free**; **2+ require subscription** (`src/utils/premiumAccess.ts`)

---

## 2. Outstanding work — before the app is “ready”

### Must-have for public store launch

1. Hosted **HTTPS Privacy Policy** URL (+ paste into App Store / Play listings)
2. Optional hosted **Terms of Use** URL
3. Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_OF_USE_URL` / `EXPO_PUBLIC_SUPPORT_EMAIL` in `.env`, then `npm run eas:env:sync`
4. **Apple Developer** + **Google Play Console** access
5. EAS project link (`eas init` — still required; `extra.eas.projectId` is not set yet)
6. Device QA / smoke tests (`PRODUCTION.md` §6)
7. **Real Apple/Google IAP** + receipt verification in Cloud Functions
8. Set `ALLOW_UNVERIFIED_SUBSCRIPTION_GRANT=false` on Functions before public release
9. Legal review of consent copy in `src/constants/consent.ts`
10. **Asset performance fix** — convert Emotion Match + Scenario photo-SVGs to optimized JPEG/PNG (and stop importing multi-MB SVGs as React components). Still outstanding on `main`.
11. **Gate paywall Face ID simulation** — `QA_PURCHASE_ENABLED` exists; wire `paywall.tsx` to it (or ship real IAP) before store builds.
12. Store icon / Android `adaptiveIcon` + mic/photo/camera permission strings in `app.json` (still using `logo.png`; no adaptive icon / usage strings on `main`).

Done on backend (merged to `main`, 16 Sep 2026): EAS build profiles use `environment` (development/preview/production), `npm run eas:env:sync` pushes `EXPO_PUBLIC_*` into those environments, Firebase client config fails fast if vars are missing, Cloud Functions validate/sanitize entitlement input and document turning off unverified grants, `firestore.indexes.json` is wired into deploy, and `functions/.env.example` documents Functions env vars.

Also on `main`: password-reset **ActionCodeSettings** helper in `src/services/auth.ts` (confirm Firebase Auth authorized domains in console).

### Soft-launch / internal testing can proceed earlier with

- In-app Privacy Policy only
- QA paywall (Face ID simulation → `activateSubscription` without store receipt)
- TestFlight / Play internal track

---

## 3. Development tasks remaining

### High priority (engineering)

| Task | Why |
|------|-----|
| Convert Emotion Match + Scenario SVGs to optimized JPEG/PNG | Giant SVGs cause Expo Go / emulator OOM and huge bundles |
| Wire `paywall.tsx` to `QA_PURCHASE_ENABLED` (or replace with real IAP) | Prevents fake purchase UI in store builds |
| Replace paywall Face ID simulation with StoreKit / Play Billing | Required for real money + App Review |
| Implement receipt verification in `functions/index.js` (TODO already marked) | Stop unverified entitlement grants |
| Run `eas init` to create `extra.eas.projectId` | Builds and Expo push tokens both need it |
| Confirm password-reset authorized domains in Firebase Auth | Client sends ActionCodeSettings; console domains must match |
| Add store icon + Android adaptiveIcon + mic/photo permission strings in `app.json` | Required for store builds / permission prompts |
| Clean ESLint / React Compiler issues (pre-existing in several screens) | Quality; not currently blocking builds |

### Medium / later

| Task | Notes |
|------|-------|
| Social login (Google/Apple/Facebook) | Explicitly hidden; “coming soon” on create-account |
| Push notification **sender** Cloud Function | Client registration helper exists (`pushRegistration.ts`); no sender Function yet |
| Phase 2 child path content | UI shows “[ Phase 2 - Coming Soon ]” |
| Stronger VPC methods if product expands | Credit card / ID verification not in V1 |
| Upgrade Functions runtime before Node 20 decommission (Firebase warned Oct 2026) | Deploy warning already seen |
| Upgrade `firebase-functions` package when ready | Deploy warned outdated |

---

## 4. Testing and known bugs / issues

### Known / expected issues

1. **Expo Go / Android emulator crash or kick-back after bundle**
   - Cause: multi-MB SVG “images” imported as React components (Emotion Match + Scenario card decks).
   - Mitigation started: lazy routes for those screens + lighter startup preload.
   - Residual risk: still huge on first open of those games; emulator RAM limited. Rasterize assets before relying on Expo Go for final QA.

2. **First Metro bundle after `--clear` is very slow** (often 30–90s+). Normal for this asset-heavy repo.

3. **Paywall “purchase” is QA-only and not gated on `main`** — Face ID sheet simulates success and calls Cloud Function; `QA_PURCHASE_ENABLED` exists but paywall does not enforce it yet.

4. **Subscription grants can be unverified** while `ALLOW_UNVERIFIED_SUBSCRIPTION_GRANT` ≠ `"false"`.

5. **ESLint reports many React Compiler / hooks warnings** in screens like `confidence-quest-card`, `children`, scenario card. Pre-existing; app still bundles.

6. **Web export** is not a primary target; native-only modules (e.g. pager-view) can fail on web.

7. Keep **`main`** current with `git pull`; do not assume `duc` is ahead after PR #13.

### Smoke test checklist (must run on real build)

From `PRODUCTION.md` §6 (still unchecked):

- Cold start → age gate
- Under-13 → blocked screen
- Adult → onboarding → signup with 3 consents
- Verify email → PIN → create child
- Privacy Policy opens
- Daily emotion → encouragement
- Level 1 free; Level 2+ paywall
- Paywall Face ID sheet → Cloud Function trial (until gated / real IAP ships)
- Forgot password → deep link → reset
- Contact Us creates `supportTickets`
- Delete child / delete account cascade

### Suggested QA environments

1. EAS `preview` build on physical Android
2. TestFlight on physical iPhone
3. Avoid relying solely on Expo Go + low-RAM emulator for final sign-off

---

## 5. Deployment — prepared vs remaining

### Already prepared / done

| Area | Status |
|------|--------|
| Firebase project + Blaze (required for Functions) | In use |
| Firestore rules deployed | Done |
| Storage rules deployed | Done |
| Functions deployed (`activateSubscription`, `clearSubscription`) | Done |
| App IDs / schemes in `app.json` | Done |
| EAS config scaffolding | Done |
| Production checklist doc | `PRODUCTION.md` |
| Backend redeploy script | `npm run firebase:deploy` |

### Still to do for mobile store deployment

1. Company Apple + Google accounts
2. Expo account + `eas login` / `eas init`
3. `npm run eas:env:sync` to push `EXPO_PUBLIC_*` into the EAS environments
4. `eas build --profile preview` (internal) then `production`
5. `eas submit` to stores
6. Store listing assets (screenshots, description, age rating, privacy URL)
7. Turn off unverified subscription grants after real IAP

### Redeploy rules (important)

| Change type | Action |
|-------------|--------|
| App UI / JS / assets only | Rebuild app / restart Expo — **no Firebase deploy** |
| `firestore.rules` / `storage.rules` / `functions/` | `npm run firebase:deploy` |
| GitHub push alone | Does **not** update Firebase or stores |

---

## 6. App Store & Google Play — what Ashley needs from development

### Identifiers / config (dev-owned)

```text
iOS bundleIdentifier:     com.calmcourage.app
Android applicationId:    com.calmcourage.app
URL scheme:               calm-courage
Password reset deep link: calm-courage://reset-password  (and related auth action links)
Expo slug / name:         calm-courage / "Calm Courage"
EAS profiles:             development | preview | production  (eas.json)
```

### Env vars Ashley must have (never commit real values)

From `.env.example`:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID` (= `calm-courage-co`)
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_SUPPORT_EMAIL`
- `EXPO_PUBLIC_IOS_BUNDLE_ID` / `EXPO_PUBLIC_ANDROID_PACKAGE`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL` (required for public listings)
- `EXPO_PUBLIC_TERMS_OF_USE_URL` (optional)
- `EXPO_ROUTER_IMPORT_MODE=lazy` (recommended for smaller startup)

Source for Firebase web config: **Firebase Console → Project settings → Your apps → Web app**.

### Store listing items company/legal must provide

- Public Privacy Policy URL (HTTPS)
- Support email / URL
- Marketing screenshots, description, keywords
- Age rating questionnaire answers (child-directed / parental control product)
- COPPA / kids category positioning decision with legal

### Technical steps for store builds

```bash
git clone https://github.com/ductranphan/calm-courage.git
cd calm-courage
git checkout main
npm install
npm run functions:install

npx eas-cli login
npx eas-cli init   # if not linked

# Set EAS secrets for EXPO_PUBLIC_* values, then:
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform android --profile preview

# Later:
npx eas-cli build --platform all --profile production
npx eas-cli submit --platform all
```

### Firebase Auth settings Ashley should verify

- Email/Password provider enabled
- Authorized domains include what the app/reset emails need
- Password reset template continue URL compatible with `calm-courage://reset-password`

---

## 7. Database / backend status

### Live project

- **ID:** `calm-courage-co`
- **Console:** https://console.firebase.google.com/project/calm-courage-co/overview
- **Owner historically used:** `hello@calmcourageco.ca` (confirm current IAM)

### Data model (high level)

| Path | Purpose |
|------|---------|
| `parents/{uid}` | Parent profile, consents, PIN hash, subscription entitlement fields |
| `parents/{uid}/children/{childId}` | Child profiles, rewards totals |
| `.../checkIns` | Emotion check-ins |
| `.../activityAttempts` | Activity/hub progress |
| `.../quests` | Quest board state |
| `.../media` | Child media metadata |
| `emotionPrompts/{id}` | Encouragement content (seedable; local fallback exists) |
| `supportTickets` | Contact Us (create-only for clients) |
| `accountDeletionFeedback` | Deletion feedback (create-only) |

### Security highlights

- Parent can only read/write own `parents/{uid}` tree
- Clients **cannot** set paid subscription fields; Functions write those
- Create parent: subscription only `trial` / null / absent

### Functions remaining work

- Receipt verification TODO in `functions/index.js`
- Before public launch: `ALLOW_UNVERIFIED_SUBSCRIPTION_GRANT=false`
- Optional: push sender Function
- Plan Node runtime upgrade before Node 20 sunset (~Oct 2026 warning)

### Seed script

```bash
npm run seed:emotion-prompts
# needs ADC / service account credentials
```

---

## 8. Games / features — completed vs outstanding

### Completed (V1 code present)

- Choose Your Courage scenarios (multi-level)
- Emotion Puzzle Match (multi-level)
- Roleplay challenges
- Confidence quests
- Quest Board
- Daily emotion + encouragement
- Digital workbook + recording
- Rewards screen
- Premium gate Level 2+
- Soft-launch entitlement activation

### Outstanding / partial

| Item | Status |
|------|--------|
| Phase 2 adventure path | Placeholder only (“Coming Soon”) |
| Real IAP purchase flow | Not implemented (QA Face ID only) |
| Social login | Hidden / not wired |
| Remote push sending | Not implemented |
| Asset optimization for card decks | **Outstanding** — Emotion Match + Scenario photo-SVGs still in repo |
| Paywall QA gate (`QA_PURCHASE_ENABLED`) | Flag exists; **paywall not wired** |
| Some challenge “complete” paths / polish | Called out in `PRODUCTION.md` as post soft-launch |

---

## 9. Progress tracking / user functionality

### Working in code

- Parent dashboard progress % from Phase 1 activity completions
- Hub level completion persistence
- Stars / gems / badges on child profile
- Daily check-ins
- Activity attempt start/complete lifecycle
- Parent PIN session (in-memory; must re-enter after app restart)
- Active child selection (in-memory; cleared on account change)

### Remaining / watch-outs

- Confirm reward increments happen consistently on every hub completion path during QA
- Confirm Level 2+ always routes to paywall when entitlement inactive
- Confirm delete child / delete account cascades (Storage + Firestore) on a real backend account
- Parent progress “unavailable” states exist in UI — verify when no child / no attempts

---

## 10. Code / repository

### Location

```text
GitHub:  https://github.com/ductranphan/calm-courage
Branch:  main   ← use this for current work
```

### Branch notes

- **`main` is current** after PR #13 (merged handover + backend prep from `duc`).
- `duc` and `Negin` branches still exist historically; do not assume they are ahead of `main`.
- Prefer `main`, then open feature PRs → `main`.

### Clone quick start

```bash
git clone https://github.com/ductranphan/calm-courage.git
cd calm-courage
git fetch origin
git checkout main
git pull
npm install
npm run functions:install
cp .env.example .env   # then fill secrets
npx expo start --clear
```

---

## 11. Documentation / access / credentials to hand over

**Primary checklists:** §0A (platforms + secrets + machine setup) and §0B (how to log into the app). Do not mark this handover complete until §0A boxes are ticked.

### Docs in repo

| File | Contents |
|------|----------|
| `HANDOVER.md` | This document — operational continuity for Ashley |
| `PRODUCTION.md` | Full production/COPPA/EAS/smoke checklist |
| `.env.example` | Required env var names (values stay in password manager) |
| `.firebaserc` / `.firebaserc.example` | Firebase project binding |
| `firebase.json` | Rules + functions deploy config |
| `eas.json` | Build/submit profiles (wired to EAS environments) |
| `scripts/sync-eas-env.mjs` | Pushes `EXPO_PUBLIC_*` from `.env` into EAS environments |
| `functions/index.js` | Entitlement Functions + soft-launch notes |
| `src/constants/featureFlags.ts` | `QA_PURCHASE_ENABLED` — **exists; paywall must still read it** |

### Access confirmation (same list as §0A — verify Ashley can open each)

1. GitHub repo write access — https://github.com/ductranphan/calm-courage  
2. Firebase / GCP Editor or Owner on `calm-courage-co`  
3. Expo / EAS org membership (`eas login` works)  
4. Apple Developer + App Store Connect (when company is ready)  
5. Google Play Console (when company is ready)  
6. Password-manager vault with full `.env` + any service accounts / keystores  
7. Support inbox for `EXPO_PUBLIC_SUPPORT_EMAIL`  
8. Privacy Policy host / final HTTPS URL from legal/marketing  

### App login (same as §0B — no shared admin password)

Parent signs up or signs in with email/password → verify email → Parent PIN → create child → parent/child switch. Level 1 free; Level 2+ paywall. Soft-launch Face ID unlock exists on paywall but is **not yet gated** by `EXPO_PUBLIC_ENABLE_QA_PURCHASE` on `main`.

### Do **not** hand over via chat/email in plain text if avoidable

- Firebase web API keys are “public client” keys but still shouldn’t be dumped casually  
- Any service-account JSON, keystores (`.jks`), `.p8`, provisioning profiles — password manager only  
- Never commit those files (`.gitignore` already blocks many)  
- Confirm Ashley’s invites **before** removing the previous developer’s access

---

## 12. Everything else to continue smoothly (don’t start over)

### Mental model of the system

```text
Expo app (src/)
  → Firebase Auth / Firestore / Storage (client SDK)
  → Callable Cloud Functions for subscription writes only
  → EAS builds for installable iOS/Android
  → App Store / Play (not yet)
```

### Architecture gotchas

1. **Subscription fields are server-only.** If someone “fixes” the client to write `subscription: "monthly"` directly, Firestore rules will block it — by design.
2. **Parent access PIN is session memory only** — expected to re-prompt after kill/relaunch.
3. **Active child is session memory only.**
4. **Age gate adult clearance is local AsyncStorage**; under-13 years are not persisted.
5. **Heavy art is the #1 performance risk** on `main` (Emotion Match + Scenario SVGs). Fix assets before spending weeks on Expo Go emulator debugging.
6. **Soft-launch entitlements are intentionally loose** until IAP exists — don’t ship that to public production; also gate the Face ID paywall before store builds.
7. **Email-only auth for launch**; social buttons removed/hidden on purpose.
8. **Consent version string** must be bumped when legal text changes (`CONSENT_VERSION`).

### Suggested first week for Ashley

1. **Confirm every checkbox in §0A** (GitHub, Firebase, Expo, password-manager secrets) while the previous developer is still reachable.
2. Clone **`main`**, fill `.env` from the vault, run the app (§0A setup).
3. Create a QA parent account via the app login path in §0B; record email/password/PIN in the vault.
4. Walk `PRODUCTION.md` smoke tests against live `calm-courage-co` (physical device preferred; expect heavy-asset pain in Expo Go).
5. Confirm Functions + rules still match repo (`firebase deploy` only if drift).
6. Align with company on Privacy Policy URL + Apple/Google store account owners.
7. Prioritize: asset rasterization, paywall QA gate, `eas init`, then real IAP + receipt verification.

### One-sentence status for leadership

> The Calm Courage V1 app and Firebase backend are largely built and live on `main`; remaining work is company access/credentials, privacy URL, store accounts, asset performance, paywall gating / real IAP, device QA, and EAS linking — not rebuilding the product from scratch.

---

## Related files

- [PRODUCTION.md](./PRODUCTION.md) — detailed deploy and smoke-test checklist
- [.env.example](./.env.example) — environment variable template
- [eas.json](./eas.json) — EAS build profiles
- [functions/index.js](./functions/index.js) — Cloud Functions source
