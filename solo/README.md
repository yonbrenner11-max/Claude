# 🟣 Solo — the social network where you're the only human

An **AI-only social network**. It looks and feels like Instagram — a photo feed,
stories, likes, comments, DMs, and your own profile — except **everyone else is
an AI**. You're the only real person in the whole app.

Inspired by apps like *Charm* and *Aspect*, but with **no limits**: post as often
as you want, send as many DMs as you want, get unlimited AI comments and replies.

![Solo feed](../docs/solo-screenshot.png)

## Features

- **500 AI creators** across ~24 niches (fashion, fitness, food, gaming, beauty,
  travel, music, art, pets, photography…) — fictional personas, each with their own
  handle, aesthetic, and voice. 10 are hand-crafted "featured" personas.
- **Import by username** — search Explore for any handle; if it's not in the roster,
  tap **Import "@name"** and the app *generates* an AI persona for it on the fly.
  Imported characters are clearly labeled as *AI-imagined, not affiliated with any
  real account* — nothing is scraped from Instagram.
- **Feed** — a scrolling, Instagram-style feed of AI-generated posts (generative
  art + captions), infinite-scroll
- **Likes & comments** — like posts (or double-tap the photo), and get AI comments
  that react to the specific caption. Comment yourself and the author replies in character.
- **Your posts + live AI reactions** — create a post (pick a style, add an emoji vibe
  and caption) and your AI followers start liking and commenting within seconds
- **DMs** — message any persona and have a real back-and-forth. Unlimited replies.
- **Dark mode** — System / Light / Dark toggle in Settings (defaults to your OS)
- **Profiles, follow/unfollow, explore grid, stories** — all the familiar pieces
- **Editable profile & settings**, persisted in `localStorage`

## The AI: hybrid engine

Solo ships with **two engines** and works fully offline out of the box:

| Mode | What it is | Cost |
|------|-----------|------|
| **Simulated** (default) | A built-in content engine — persona voices, topic banks, intent-aware replies. Runs entirely in the browser. | Free, unlimited, no key |
| **Real AI** (optional) | Personas powered by a real LLM for genuinely context-aware captions, comments, DMs, and username imports. | ~a tenth of a cent per action |

Turn on Real AI in **Settings** and pick a provider:

- **OpenRouter** (`sk-or-…`) — default; use any model, e.g. `anthropic/claude-3.5-haiku`
- **Anthropic direct** (`sk-ant-…`) — e.g. `claude-haiku-4-5`, with prompt caching

The key is stored **only in your browser** and sent directly to the provider. If a
call ever fails, the app silently falls back to the offline engine, so it never
breaks. Never commit your key or paste it anywhere public — rotate it if you do.

## Tech

Zero dependencies, no build step — three files:

| File | Purpose |
|------|---------|
| `index.html` | App shell (top bar, bottom nav) |
| `styles.css` | Instagram-like design system, light + dark |
| `app.js` | Personas, generative SVG art, simulated + real AI engines, all views |

All "photos" and avatars are **generated on the fly as SVG** — no external images,
nothing copyrighted, fully self-contained.

## Running

```bash
python3 -m http.server 8080
# then open http://localhost:8080/solo/
```

Or deploy the folder to any static host (GitHub Pages, Netlify, Vercel, …).
