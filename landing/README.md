# Talk AI landing

Marketing site for **Talk AI** (repo / product working names: gotalkai, LingoAI).

Product story only — **not** a web client for the conversation loop. Primary CTAs are disabled until the iOS app / TestFlight link is ready.

Design reference: Claude Design handoff in `Initial mockup request 2/Landing Page.dc.html`, using the same paper / ink / accent tokens as `mobile/`.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Deploy target: **Vercel** (independent of Railway `app-service` / `voice-service`)

## Local development

```bash
cd landing
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical site URL for Open Graph / metadata (e.g. `https://gotalkai-landing.vercel.app`) |

Copy `.env.example` to `.env.local` when needed.

## Vercel deploy

Root directory for this project must be **`landing/`** (not the monorepo root).

```bash
cd landing
vercel link          # first time: create project, set root to landing
vercel --prod
```

Preview deploys: any Git push / MR that touches `landing/` will build when the Vercel project is connected to this repo with Root Directory = `landing`.

Ignored by design: do not point this Vercel project at `mobile/`, `app-service/`, or `voice-service/`.

## Brand notes

- Colors: paper `#FBF6EC`, paper-stepped `#F3ECDE`, ink `#231F18`, accent `#A0543A`
- Type: PT Serif (voice / names), IBM Plex Mono (system meta), system sans (explanation)
