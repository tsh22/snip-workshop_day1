import { randomBytes } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const CODE_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_SAMPLE_LIMIT = 256 - (256 % CODE_CHARACTERS.length);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function makeCode(links) {
  while (true) {
    let code = "";
    while (code.length < 6) {
      for (const byte of randomBytes(16)) {
        if (byte < CODE_SAMPLE_LIMIT) {
          code += CODE_CHARACTERS[byte % CODE_CHARACTERS.length];
          if (code.length === 6) break;
        }
      }
    }
    if (!links.has(code)) return code;
  }
}

function normalizeBaseUrl({ baseUrl, railwayPublicDomain, port }) {
  const configured = baseUrl || (railwayPublicDomain
    ? `https://${railwayPublicDomain}`
    : `http://localhost:${port}`);
  const parsed = new URL(configured);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("BASE_URL must use http or https");
  }
  return parsed.origin;
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function isWithinDirectory(directory, filePath) {
  const pathFromDirectory = relative(directory, filePath);
  return pathFromDirectory === "" ||
    (pathFromDirectory !== ".." &&
      !pathFromDirectory.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromDirectory));
}

async function findStaticFile(publicDirectory, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  let publicRoot;
  try {
    publicRoot = await realpath(publicDirectory);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidate = resolve(publicRoot, relativePath);
  if (!isWithinDirectory(publicRoot, candidate)) return null;

  let filePath;
  try {
    filePath = await realpath(candidate);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
  if (!isWithinDirectory(publicRoot, filePath)) return null;

  let fileInfo = await stat(filePath);
  if (fileInfo.isDirectory()) {
    try {
      filePath = await realpath(resolve(filePath, "index.html"));
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    }
    if (!isWithinDirectory(publicRoot, filePath)) return null;
    fileInfo = await stat(filePath);
  }
  return fileInfo.isFile() ? { filePath, fileInfo } : null;
}

export function createApp({
  port = 3000,
  baseUrl = process.env.BASE_URL,
  railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN,
  publicDir = process.env.PUBLIC_DIR,
} = {}) {
  const links = new Map();
  const shortLinkOrigin = normalizeBaseUrl({ baseUrl, railwayPublicDomain, port });
  const publicDirectory = publicDir ? resolve(publicDir) : undefined;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  async function fetch(request) {
    const url = new URL(request.url);
    const { method } = request;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (method === "POST" && url.pathname === "/api/links") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ error: "Request body must be valid JSON" }, 400, corsHeaders);
      }

      if (!payload || typeof payload.url !== "string" || payload.url.trim() === "") {
        return jsonResponse({ error: "url must be a non-empty HTTP or HTTPS URL" }, 400, corsHeaders);
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(payload.url);
      } catch {
        return jsonResponse({ error: "url must be a valid HTTP or HTTPS URL" }, 400, corsHeaders);
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return jsonResponse({ error: "url must use HTTP or HTTPS" }, 400, corsHeaders);
      }

      const code = makeCode(links);
      const link = {
        code,
        url: payload.url,
        shortUrl: `${shortLinkOrigin}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return jsonResponse(link, 201, corsHeaders);
    }

    if (method === "GET" && url.pathname === "/api/links") {
      return jsonResponse([...links.values()], 200, corsHeaders);
    }

    if (method === "GET" && publicDirectory) {
      const file = await findStaticFile(publicDirectory, url.pathname);
      if (file) {
        const content = await readFile(file.filePath);
        const contentType = MIME_TYPES[extname(file.filePath).toLowerCase()] ?? "application/octet-stream";
        return new Response(content, {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": contentType },
        });
      }
    }

    if (method === "GET" && /^\/[A-Za-z0-9]{6}$/.test(url.pathname)) {
      const code = url.pathname.slice(1);
      const link = links.get(code);
      if (!link) return jsonResponse({ error: "Link not found" }, 404, corsHeaders);
      link.hits += 1;
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: link.url },
      });
    }

    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  }

  return { fetch, links };
}

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

if (globalThis.Bun) {
  const app = createApp({ port });
  Bun.serve({ port, fetch: app.fetch });
  console.log(`Snip backend listening on port ${port}`);
}
