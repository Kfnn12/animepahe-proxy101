# AnimePahe Cloudflare Proxy 🚀

A lightning-fast, high-performance streaming proxy for AnimePahe designed specifically for **Cloudflare Workers**. 

This proxy handles bypassing CORS restrictions, natively resolving AnimePahe's obfuscated `Kwik` links, and streaming high-bandwidth HLS (`.m3u8`) and video segments directly to the client without buffering.

---

## ✨ Features

- **Native Kwik Deobfuscation**: Resolves Kwik's `eval()` packing (Dean Edwards' P.A.C.K.E.R.) completely in pure JavaScript, extracting `.m3u8` links instantly without needing `child_process` or external APIs.
- **HLS/M3U8 Rewriting**: Automatically intercepts and rewrites internal URLs within `.m3u8` playlists (including `#EXT-X-KEY` tags) so the video player routes everything through the proxy seamlessly.
- **Infinite Bandwidth**: Built exclusively for Cloudflare Workers, ensuring you don't hit execution time limits or bandwidth caps usually associated with Serverless environments like Vercel or Render.
- **Cross-Origin Streaming**: Proxies video segments and applies proper `Access-Control-Allow-Origin: *` headers, allowing video players in any frontend to stream the AnimePahe links flawlessly.

---

## 🚀 Deployment

You can deploy this proxy directly to Cloudflare Workers in seconds using Wrangler.

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Locally (Testing)
You can test the worker locally on your machine using Wrangler's dev server:
```bash
npm run dev
```

### 3. Deploy to Cloudflare
Deploy the proxy live to the edge:
```bash
npm run deploy
```
*If you aren't logged into Cloudflare, this command will open a browser window to authenticate.*

---

## 📖 Usage

Once deployed (e.g. `https://animepahe-proxy.<your-subdomain>.workers.dev`), you can start streaming by providing a Kwik URL or an already resolved `.m3u8` URL to the `/proxy` endpoint.

### Direct Kwik Resolution
You can paste an obfuscated Kwik URL directly into the proxy. The Worker will fetch the page, crack the obfuscation, extract the `.m3u8`, and `302 Redirect` the video player directly to the stream.

**Example Request:**
```text
GET https://your-worker.workers.dev/proxy?url=https://kwik.cx/e/ojSeDSLHj2bs
```

### Raw M3U8 Streaming
If your backend API already resolves the Kwik URL to an `.m3u8`, simply pass it along with the required referer:

**Example Request:**
```text
GET https://your-worker.workers.dev/proxy?url=<the_m3u8_url>&referer=https://kwik.cx/e/ojSeDSLHj2bs
```

---

## 🛠️ Integration with AnimePahe API
This project acts as the "muscle" (handling video streaming) and is meant to work perfectly alongside a Node.js scraping API (the "brain" that handles searching, getting episodes, etc.). 

Use your scraping API to get the links, and then feed those links into this Cloudflare Worker for flawless, high-performance streaming playback on your frontend clients.

![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kfnn12/animepahe-proxy101)
