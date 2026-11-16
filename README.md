# Snip Frontend

Angular 19 client for the Snip URL shortener. The app expects the API at
`http://localhost:3000` and uses:

- `POST /api/links` with `{ "url": "https://…" }`
- `GET /api/links` for the list of shortened links

## Development

```sh
npm install
npm start
```

## Build and tests

```sh
npm run build
npm test -- --watch=false
```
