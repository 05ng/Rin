![Cover](./docs/docs/public/rin-logo.png)

English | [简体中文](./README_zh_CN.md)

![GitHub commit activity](https://img.shields.io/github/commit-activity/w/openRin/Rin?style=for-the-badge)
![GitHub branch check runs](https://img.shields.io/github/check-runs/openRin/Rin/main?style=for-the-badge)
![GitHub top language](https://img.shields.io/github/languages/top/openRin/Rin?style=for-the-badge)
![GitHub License](https://img.shields.io/github/license/openRin/Rin?style=for-the-badge)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/openRin/Rin/deploy.yml?style=for-the-badge)

[![Discord](https://img.shields.io/badge/Discord-openRin-red?style=for-the-badge&color=%236e7acc)](https://discord.gg/JWbSTHvAPN)
[![Telegram](https://img.shields.io/badge/Telegram-openRin-red?style=for-the-badge&color=%233390EC)](https://t.me/openRin)

## Introduction

This repository is a fork of the original open-source [Rin](https://github.com/openRin/Rin) project. It keeps Rin's Cloudflare-first, serverless blog foundation while extending it for Agentic Life with stronger administrator security, richer search, multilingual article workflows, article SEO, and extra interactive pages.

Rin is a modern blog platform built on Cloudflare's developer platform: Pages for hosting, Workers for serverless functions, D1 for SQLite database, R2/S3-compatible object storage, Workers AI, Vectorize, and project-local CLI tooling. Deploy a personal or technical blog with a domain pointed to Cloudflare, without managing a traditional server.

## Live Demo

https://agenticlife.org

## Fork Highlights

- **Forked from Rin**: Built from the original open-source Rin project, with this fork focused on Agentic Life production needs and additional platform features.
- **Administrator MFA**: Admin login can require TOTP-based multi-factor authentication, including MFA challenge handling for administrator OAuth flows.
- **AI summaries**: Published articles can be queued for AI-generated summaries. Summary prompts now respect article language, so English articles receive English summaries and Simplified Chinese articles receive Simplified Chinese summaries.
- **Semantic article search**: Articles can be chunked, embedded, and indexed with Cloudflare Vectorize to support semantic search alongside keyword search.
- **Article vector status**: Admin and article views can expose whether an article has been vectorized, making backfill and operational checks easier.
- **Games and tools**: The frontend includes interactive utility pages and games in addition to the core blog experience.
- **SEO workflows**: Article publishing, updating, and deletion can trigger SEO workflows. Article pages emit canonical URLs, alternate language links, structured article metadata, and crawler-friendly prerendered output.
- **Multilingual article model**: Articles have explicit language metadata, language-aware feeds/search/timeline, and translation groups for linking equivalent articles across languages.
- **Language-specific URLs**: English remains the default URI shape, for example `/my-article`; non-default languages get their own stable URL prefix, for example `/zh-CN/my-article`.
- **Linked translations**: The article page can show available translations and switch readers to the matching article in another language.

## Core Features

- **Authentication & Management**: GitHub OAuth, username/password login, administrator roles, and optional MFA for administrator access.
- **Content Creation**: Write and edit articles with a rich editor, autosave, tags, custom slugs, draft/private visibility, and unlisted posts.
- **Image Management**: Drag-and-drop or paste images to upload directly to S3-compatible storage such as Cloudflare R2, with generated links and featured-image detection.
- **AI-assisted publishing**: Automatic AI summary generation can run after publishing, with queue status and compatibility backfill tooling.
- **Search**: Keyword search is combined with Vectorize-backed semantic search, language filters, and configurable vector score thresholds.
- **Internationalization**: English and Simplified Chinese article routing, article-language filters, linked translation groups, and language-aware AI summaries.
- **SEO**: Canonical URLs, hreflang alternates, sitemap support, social preview metadata, structured data, and prerendered crawler responses.
- **Blogroll**: Add links to friends' blogs, with periodic backend availability checks.
- **Comment System**: Authenticated and guest comments, moderation controls, and webhook notifications.
- **Games and Tools**: Extra interactive pages for lightweight tools and browser games.
- **Type Safety**: Shared TypeScript contracts between client and server through the `@rin/api` package.

## Documentation

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/05ng/Rin.git && cd Rin

# 2. Install dependencies
bun install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your own configuration

# 4. Start the development server
bun run dev
```

Visit http://localhost:5173 to start hacking!

### Testing

Run the test suite to ensure everything works:

```bash
# Run all tests (client + server)
bun run test

# Run server tests only
bun run test:server

# Run tests with coverage
bun run test:coverage
```

### One-Command Deployment

Deploy both frontend and backend to Cloudflare with a single command:

```bash
# Deploy everything (frontend + backend)
bun run deploy

# Deploy only backend
bun run deploy:server

# Deploy only frontend
bun run deploy:client
```

**Required environment variables:**

- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

**Optional environment variables:**

- `WORKER_NAME` - Backend worker name (default: `rin-server`)
- `PAGES_NAME` - Frontend pages name (default: `rin-client`)
- `DB_NAME` - D1 database name (default: `rin`)
- `R2_BUCKET_NAME` - R2 bucket name. If set, deploy derives the matching `S3_*` values automatically. If unset, no bucket is auto-selected.

The deployment script will automatically:

- Create D1 database if it doesn't exist
- Derive `S3_*` storage settings from `R2_BUCKET_NAME` only when it is explicitly set
- Deploy backend to Workers
- Build and deploy frontend to Pages
- Run database migrations

### GitHub Actions Workflows

The repository includes several automated workflows:

- **`ci.yml`** - Runs type checking and formatting validation on every push/PR
- **`test.yml`** - Runs comprehensive tests (server + client) with coverage reporting
- **`build.yml`** - Builds the project and triggers deployment
- **`deploy.yml`** - Deploys to Cloudflare Pages and Workers

**Required secrets (Repository Settings → Secrets and variables → Actions):**

- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token with Workers and Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

**Optional configuration (Repository Settings → Secrets and variables → Variables):**

- `WORKER_NAME`, `PAGES_NAME`, `DB_NAME` - Resource names
- `NAME`, `DESCRIPTION`, `AVATAR` - Site configuration
- `R2_BUCKET_NAME` - Specific R2 bucket to use

Full documentation is available at https://docs.openrin.org.

## Fork, Upstream & Support

- This fork: https://github.com/05ng/Rin
- Original Rin project: https://github.com/openRin/Rin
- Upstream documentation: https://docs.openrin.org
- Upstream community: https://discord.gg/JWbSTHvAPN and https://t.me/openRin
- Found a bug or have a feature request for this fork? Open an issue in this repository.

## Upstream Star History

<a href="https://star-history.com/#openRin/Rin&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=openRin/Rin&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=openRin/Rin&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=openRin/Rin&type=Date" />
 </picture>
</a>

## Contributing

Contributions to this fork should target the fork repository. For changes intended for the original Rin project, see the upstream [contributing guidelines](https://docs.openrin.org/en/guide/contribution.html).

## License

```
MIT License

Copyright (c) 2024 Xeu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
