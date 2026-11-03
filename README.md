# browserboard

Classic board games (checkers and chess) running entirely in your browser. Play the computer at five difficulty levels, or a friend on the same screen. No server, no sign-up; games are saved in your browser.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit + perft tests
npm run build    # static site in dist/
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which lints, tests, builds and publishes `dist/` to GitHub Pages. One-time setup: **Settings → Pages → Source: GitHub Actions**. For a custom domain, add `public/CNAME`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.
