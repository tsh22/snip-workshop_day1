# Snip

Snip is a URL shortener with one Bun backend, an Angular web client, and a
Node.js CLI. Links are stored in memory and disappear when the server restarts.

Each component has an independent branch with its files at the branch root.
The `main` branch pins the `backend`, `frontend`, and `cli` branches as
submodules. Clone with submodules to populate them:

```sh
git clone --recurse-submodules https://github.com/tsh22/snip-workshop_day1.git
```

## API contract

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/links` | `{ "url": "https://example.com" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid JSON or a non-HTTP(S) URL |
| GET | `/api/links` | None | `200` array of link objects |
| GET | `/:code` | None | `302` to the original URL and increments hits; `404` for an unknown code |

## Run locally

Start the backend in one terminal:

```sh
cd backend
bun start
```

In another terminal, start the frontend at `http://localhost:4200`:

```sh
cd frontend
npm install
npx ng serve
```

In a third terminal, use the CLI against the same backend:

```sh
cd cli
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

The backend defaults to port 3000. Set `SNIP_API` to point the CLI to a
different backend origin.

## Update a component

Commit and push a change inside its submodule, then update and commit the
superproject pointer:

```sh
cd backend
git add -A
git commit -m "Describe the backend change"
git push
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Use the same workflow for `frontend` and `cli`.

## Generated bundle

The `bundle` submodule is generated from the source branches; do not edit it
by hand. Node 20 or later and npm are required to rebuild it:

```sh
node scripts/build-bundle.mjs
node scripts/build-bundle.mjs --push
```

The script updates the source submodules, builds the frontend, and commits
changed bundle and superproject pointers. A second identical run is a no-op.
`--push` publishes both branches. To run the generated app in one process:

```sh
cd bundle
bun start
```

The generated Dockerfile can also build the bundle as a container.

## Release automation

The bundle workflow runs hourly or by manual dispatch, updates component
branches, and rebuilds the generated output. When its bundle pointer changes,
it explicitly dispatches the image workflow: pushes made with GitHub's
automatic token do not start a push-triggered workflow.

The image workflow also runs on a `main` push that changes the bundle gitlink
or the image workflow itself. It builds and tests the pinned components,
audits dependencies, smoke-tests and scans the image, and only then publishes
the verified image to GitHub Container Registry with `latest` and short-SHA
tags.
