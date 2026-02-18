# chrisbaehr.com

Personal website for Chris Baehr. The site is primarily static HTML/CSS/JS content served through a lightweight Next.js shell, with a canvas-based educational CRISPR mini-game at `/game`.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Visit:

- `http://localhost:3000/` (redirects to `index.html`)
- `http://localhost:3000/game` (CRISPR targeting mini-game)

## Game overview

`/game` is a single-page HTML5 Canvas mini-game where the player moves a Cas enzyme over scrolling DNA sites and cuts based on guide RNA matching plus PAM (`NGG`) availability. Perfect guide+PAM cuts score highest, near matches flag off-target risk, and invalid/no-PAM cuts are penalized. The game includes three timed rounds, keyboard and touch controls, a reduced-motion toggle, deterministic seed input for debugging, and science notes describing biological simplifications.

## Structure

- `app/` - Next.js routes (`/` redirect and `/game` page)
- `lib/game/` - game logic modules (state, generator, rendering, input, sequence helpers)
- `public/` - static pages and assets used by the personal site
- root `*.html`, `styles.css`, `script.js` - source copies for static pages mirrored to `public/`
