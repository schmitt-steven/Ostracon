# <img src="src/assets/ostracon-icon.png" alt="" width="36" align="top"> &nbsp;Ostracon
[![Version](https://img.shields.io/github/package-json/v/schmitt-steven/Ostracon?label=version)](https://github.com/schmitt-steven/Ostracon/releases)
[![Next.js](https://img.shields.io/github/package-json/dependency-version/schmitt-steven/Ostracon/next?logo=nextdotjs&label=next.js)](https://nextjs.org)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)](LICENSE)



Ostracon is a self-hosted Markdown knowledge base for one person.

It runs on Next.js and hosting is free: one Vercel project holds the app, a Neon Postgres database, and a Blob store for images. All three have generous free tiers.

<!-- TODO: screenshots — editor, tag tree, command palette, AI menu -->

## Some Features

- **Markdown editor**: CodeMirror 6 (what Obsidian uses), write/preview/split-view toggle, Shiki syntax highlighting.
- **Tag-based organization**: hierarchical tags and filtering.
- **All-in-one menu**: `⌘+K` / `Ctrl+K` for search, navigation, and context-aware actions. No mouse? No problem.
- **Installable**: add it to your home screen or dock and it opens in its own window, with shortcuts and a share target. Open `.md` and `.txt` files directly in Ostracon. If you lose connection mid-work your edits are saved once you're back online.
- **Full-text search**: instant and client-side over the whole corpus.
- **Images**: paste or drag-and-drop to upload; gallery browser with all uploaded images.
- **AI Integration**: select text and Explain, Summarize, Rewrite, or Ask, via Gemini or local LLMs.
- **Authentication**: signed sessions, per-device tracking, login throttling.
- **Import / Export**: Import `.md` and `.txt` files, or a `.zip`. Export everything as a `.zip`.
- **Update notice**: tells you when a new version is out and how to migrate to it.

## Getting started

You deploy Ostracon to your own Vercel project. Everything it needs (hosting, database, image storage) lives inside that single project. Follow these steps to get it running:

### 1. Fork this repo (or clone it and push to a new private repo of your own).

### 2. Create the Vercel project

In the Vercel dashboard, go to **Add New → Project**, and import your newly forked repo.

### 3. Add the database and image storage

In the project's **Storage** tab, select **Create Database → Neon (Serverless Postgres)**, pick your preferred region, give your DB a name and create it. Vercel connects it to the project automatically.

Still under **Storage**, select **Create Database → Blob (Fast Object Storage)**. Give the blob store a name, pick the region you want, then create it.

### 4. Set the required secrets

In the project's **Environment Variables** tab, add:

| Variable | Value |
| --- | --- |
| `APP_PASSWORD` | The password you'll sign in with the first time. |
| `SESSION_SECRET` | A generated random string. Run `openssl rand -base64 32` and paste the output. |

Mark both as a **Secret** when creating them in Vercel. `SESSION_SECRET` signs your login
cookie. If you don't have `openssl`, you could use
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Optionally add your `GEMINI_API_KEY` to enable the AI features.

### 5. Deploy the app

Got to the **Deployments** tab.
If Vercel already tried to deploy, click the three dots of the last deployment and redeploy.
Otherwise click the three dots in the top right corner and start a new deployment.

Once Vercel finished the deployment you can open your website and unlock Ostracon with your `APP_PASSWORD`. If you want a different password, you can change it in Ostracon's settings. Once you have, you can also delete the `APP_PASSWORD` environment variable.

## Updating

Ostracon tells you when there is a new version is available. If an update is available, an Update button will appear in the side bar. Click it and follow the instructions to update.

## Running it locally

```bash
npm install
npm install -g vercel        # Vercel CLI
vercel link                  # and pick the project you created above
vercel env pull .env.local   # fetches DATABASE_URL and the rest
npm run dev
```

LM Studio and Ollama are only reachable
in this mode at the moment.  Override `LMSTUDIO_BASE_URL` / `OLLAMA_BASE_URL` if the defaults shouldn't fit.
