# Dream Recorder

Turn your dreams into film.

A public, bring-your-own-key web app. Describe a dream — speak it or type it — and it becomes a 10-second cinematic film generated with Luma.

**Live:** https://dream-recorder-rileyporcarello-gmailcoms-projects.vercel.app

## What is in here

- `index.html` — landing page, auth, account, and recorder views in one dependency-free page.
- `styles.css` — warm paper + dark dream-machine device styling, with local fonts in `assets/fonts/`.
- `app.js` — frontend logic. Accounts via Supabase Auth (email + password, public anon key in the file by design). The user's Luma API key is stored only in their browser localStorage.
- `api/generate.js` — Vercel serverless function. `POST /api/generate` proxies to the Luma Agents API (`https://agents.lumalabs.ai/v1/generations`, model `ray-3.2`, 10s, 540p, 21:9). Forwards the caller's `Authorization: Bearer <key>` header verbatim; never logs or stores it.
- `api/status.js` — Vercel serverless function. `GET /api/status?id=...` proxies the generation status poll to Luma the same way.
- `assets/` — device mockup, logos, and fonts.
- `vercel.json` — minimal Vercel config.

## How it works

1. Visitor creates an account / signs in (Supabase Auth).
2. They add their own Luma API key on the account page. It is stored only in their browser and sent only to our `/api/*` functions, which forward it to Luma — nowhere else.
3. The recorder takes typed or spoken dream descriptions. Voice input uses the browser Web Speech API (Chrome/Edge; typing works everywhere).
4. The dream text is shaped into a clean, bright cinematic prompt client-side, then `/api/generate` starts a Luma `ray-3.2` generation (10s, 540p, 21:9, no loop — Luma rejects loop at 10s; the page loops playback itself).
5. The page polls `/api/status` every 5 seconds (up to ~14 minutes) and plays the finished film on the device screen.

## Deploy to Vercel

This repo is linked to the Vercel project `dream-recorder`. Pushes to `main` deploy to production.

Manual deploy, if needed:

```bash
vercel --prod
```

No environment variables are needed — accounts use the Supabase public anon key in `app.js`, and each visitor brings their own Luma key.

### Custom domain

1. In the Vercel dashboard: project → Settings → Domains → add the domain.
2. Point DNS at Vercel (`A` 76.76.21.21, or `CNAME` to `cname.vercel-dns.com` for subdomains). Vercel provisions HTTPS automatically.

## Notes

- Video URLs from Luma are presigned and expire after ~1 hour, so films are played immediately. There is no archive in this public version.
- Cost: each 10s 540p dream is roughly $0.30 of the visitor's own Luma credit. Nothing is charged to the site owner.
