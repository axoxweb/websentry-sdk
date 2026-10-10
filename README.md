# websentry-api

[![npm](https://img.shields.io/npm/v/websentry-api?color=22c55e)](https://www.npmjs.com/package/websentry-api)
[![Release](https://github.com/axoxweb/websentry-sdk/actions/workflows/release.yml/badge.svg)](https://github.com/axoxweb/websentry-sdk/actions/workflows/release.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Official JavaScript/TypeScript client for the [WebSentry](https://websentry.dev) website security scanner. Scan any site for an A-F security grade across SSL, headers, CSP, cookies, DNS, and 15 categories in total.

Zero dependencies. Works in Node 18+, browsers, and edge runtimes.

```sh
npm install websentry-api
```

## Quick start

```ts
import WebSentry from 'websentry-api';

// API keys require a Pro or Agency plan: https://websentry.dev/pricing
const ws = new WebSentry('ss_your_api_key');

const result = await ws.scan('example.com');
console.log(result.grade, result.score);
// "C" 64 — report at https://websentry.dev/report/<scanId>

// Full results, all 15 categories (Pro+)
const report = await ws.getScan(result.scanId);
for (const [key, cat] of Object.entries(report.scan.results.categories)) {
  console.log(key, cat.grade, `${cat.score}/${cat.maxScore}`);
}

// Monitors
const monitor = await ws.monitors.create('example.com', 'daily');
await ws.monitors.toggle(monitor.id);   // pause / resume
await ws.monitors.remove(monitor.id);
```

## Rate limits

```ts
try {
  await ws.scan('example.com');
  console.log(ws.lastRateLimit); // { limit, remaining } when the plan is limited
} catch (e) {
  if (e instanceof WebSentryError && e.status === 429) {
    console.log('Rate limited until', new Date((e.rateLimit?.reset ?? 0) * 1000));
  }
}
```

Without an API key, requests fall under the anonymous allowance (3 scans/week by IP). Paid plans have unlimited scans and no rate-limit headers.

Full API reference: https://websentry.dev/docs
