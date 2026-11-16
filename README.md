# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener.

```sh
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

Set `SNIP_API` to the backend origin when it is not `http://localhost:3000`.
The `snip`, `snip.cmd`, and `snip.ps1` wrappers invoke `cli.js` on POSIX
shells, Command Prompt, and PowerShell respectively.
