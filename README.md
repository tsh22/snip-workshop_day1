# Snip backend

A dependency-free Bun server for the Snip URL shortener. Links are stored in memory and are cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL` to control generated short links, or `PUBLIC_DIR` to serve static files (including `index.html` at `/`).

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link and returns its `code`, original `url`, `shortUrl`, `hits`, and ISO `createdAt`.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count.
