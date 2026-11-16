#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API_URL = 'http://localhost:3000';
const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List all links
  snip open <code>  Open a short link in your browser
  snip help         Show this help

Set SNIP_API to change the backend URL (default: ${DEFAULT_API_URL}).`;

function apiBaseUrl() {
  const configured = process.env.SNIP_API || DEFAULT_API_URL;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('must use http or https');
    }
    return url.toString().replace(/\/+$/, '');
  } catch (error) {
    throw new Error(`Invalid SNIP_API "${configured}": ${error.message}`);
  }
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL must use http or https');
    }
  } catch (error) {
    if (error.message === 'URL must use http or https') {
      throw error;
    }
    throw new Error(`Invalid URL "${value}": expected an absolute http or https URL`);
  }
}

function validateCode(value) {
  if (!/^[A-Za-z0-9]{6}$/.test(value)) {
    throw new Error('Code must be exactly 6 base62 characters');
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Request timed out while contacting ${apiBaseUrl()}`);
    }
    throw new Error(`Cannot reach ${apiBaseUrl()}: ${error.message}`);
  }
  return response;
}

async function responseError(response) {
  let detail = '';
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') {
      detail = `: ${body.error}`;
    }
  } catch {
    // Error responses may not include a JSON body.
  }
  return new Error(`Backend returned HTTP ${response.status}${detail}`);
}

async function add(url) {
  validateUrl(url);
  const response = await request('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (response.status !== 201) {
    throw await responseError(response);
  }
  const link = await response.json();
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('Backend response is missing shortUrl');
  }
  console.log(link.shortUrl);
}

function formatTable(links) {
  if (links.length === 0) {
    console.log('No links yet.');
    return;
  }

  if (links.some((link) =>
    !link ||
    typeof link.code !== 'string' ||
    typeof link.url !== 'string' ||
    typeof link.hits !== 'number' ||
    !Number.isFinite(link.hits)
  )) {
    throw new Error('Backend response contains an invalid link');
  }

  const rows = links.map((link) => ({
    code: link.code,
    hits: String(link.hits),
    url: link.url,
  }));
  const codeWidth = Math.max(4, ...rows.map((row) => row.code.length));
  const hitsWidth = Math.max(4, ...rows.map((row) => row.hits.length));
  console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
  for (const row of rows) {
    console.log(`${row.code.padEnd(codeWidth)}  ${row.hits.padStart(hitsWidth)}  ${row.url}`);
  }
}

async function list() {
  const response = await request('/api/links');
  if (!response.ok) {
    throw await responseError(response);
  }
  const links = await response.json();
  if (!Array.isArray(links)) {
    throw new Error('Backend response is not a links array');
  }
  formatTable(links);
}

function openInBrowser(url) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === 'win32') {
    command = 'explorer.exe';
    args = [url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.once('error', (error) => {
    console.error(`Could not launch the browser: ${error.message}`);
    process.exitCode = 1;
  });
  child.unref();
}

async function open(code) {
  validateCode(code);
  const response = await request(`/${encodeURIComponent(code)}`, { redirect: 'manual' });
  if (response.status !== 302) {
    throw await responseError(response);
  }
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('Backend redirect response is missing Location');
  }

  let target;
  try {
    target = new URL(location, apiBaseUrl());
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error('unsupported protocol');
    }
  } catch (error) {
    throw new Error(`Backend returned an invalid redirect target: ${error.message}`);
  }
  openInBrowser(target.toString());
}

async function main(args) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (rest.length > 0) {
      throw new Error('Help does not accept additional arguments');
    }
    console.log(USAGE);
    return;
  }

  if (command === 'add') {
    if (rest.length !== 1) {
      throw new Error('Usage: snip add <url>');
    }
    await add(rest[0]);
    return;
  }
  if (command === 'ls') {
    if (rest.length !== 0) {
      throw new Error('Usage: snip ls');
    }
    await list();
    return;
  }
  if (command === 'open') {
    if (rest.length !== 1) {
      throw new Error('Usage: snip open <code>');
    }
    await open(rest[0]);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
