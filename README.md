# txn-pipe

Snap a photo of a receipt or transaction screenshot. It extracts the details and logs them to your Google Sheet.

Live at [txn-pipe.vercel.app](https://txn-pipe.vercel.app)

## What it does

Upload a receipt image or screenshot. The app uses Claude (Anthropic API) to parse the merchant, amount, date, and category, then writes a row to a connected Google Sheet via the Google Sheets API.

Useful if you track expenses manually and are tired of typing.

## Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **AI**: Anthropic SDK — Claude for receipt parsing
- **Integration**: Google Sheets API via `googleapis`
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest + Testing Library
- **Deployment**: Vercel

## Getting started

```bash
npm install
npm run dev
```

You'll need:

- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- Google OAuth credentials with Sheets API access — see [Google Cloud Console](https://console.cloud.google.com)

Copy `.env.example` to `.env.local` and fill in the values.

## Scripts

```bash
npm run dev        # local dev server
npm run build      # production build
npm test           # run tests (vitest)
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run format     # Prettier
```

## Notes

Built with [Claude Code](https://claude.ai/code). The `AGENTS.md` file contains context for AI coding agents working in this repo — specifically a note that this project uses Next.js 16 which has breaking changes from earlier versions.
