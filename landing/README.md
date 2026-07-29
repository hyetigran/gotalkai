# Talk AI landing

Marketing site for **Talk AI** (repo / product working names: gotalkai, LingoAI).

This is a go-to-market surface — waitlist + product story. It is **not** a web client for the conversation loop. Voice practice ships as a mobile app.

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
| `BLOB_READ_WRITE_TOKEN` | Production | Vercel Blob write token for waitlist persistence |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical site URL for Open Graph / metadata (e.g. `https://your-domain.vercel.app`) |

Copy `.env.example` to `.env.local` when needed.

### Waitlist storage

`POST /api/waitlist` validates an email with Zod, then:

1. **If `BLOB_READ_WRITE_TOKEN` is set** — writes a **private** JSON object to Vercel Blob under `waitlist/…` (production path).
2. **Otherwise** — appends a JSONL line to `landing/.data/waitlist.jsonl` (local only). That directory is gitignored. On Vercel without a Blob token the API returns an error (serverless FS is read-only).

Create / link a **private** Blob store in the Vercel project (Storage → Blob, or `vercel blob create-store <name> --access private --yes`), then redeploy so `BLOB_READ_WRITE_TOKEN` is present.

```bash
cd landing
vercel env pull .env.local
```

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
