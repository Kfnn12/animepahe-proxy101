export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS Preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
        }
      });
    }

    // Proxy Endpoint
    if (url.pathname === '/proxy') {
      const targetUrl = url.searchParams.get('url');
      const customReferer = url.searchParams.get('referer');

      if (!targetUrl) {
        return new Response(JSON.stringify({ 
          error: 'Query parameter "url" is required',
          usage: 'GET /proxy?url=<m3u8-or-ts-url>&referer=<optional-referer>'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Automatically resolve Kwik URLs in the Worker
      if (targetUrl.includes('kwik.cx/e/') || targetUrl.includes('kwik.si/e/') || targetUrl.match(/kwik\.[a-z]+\/e\//)) {
        try {
          const fetchResponse = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://animepahe.com/'
            }
          });
          
          if (!fetchResponse.ok) {
            throw new Error(`Kwik returned status ${fetchResponse.status}`);
          }
          
          const html = await fetchResponse.text();
          let m3u8Url = null;
          
          // Pure JS unpacker for Dean Edwards p.a.c.k.e.r
          const packerRegex = /eval\(function\(p,a,c,k,e,d\).*?return p}\('(.*?)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/g;
          let match;
          
          const unpack = (p, a, c, k) => {
            const e = (c) => {
              return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
            };
            while (c--) {
              if (k[c]) {
                p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
              }
            }
            return p;
          };

          while ((match = packerRegex.exec(html)) !== null) {
            const dict = match[4];
            if (dict.includes('m3u8')) {
              // Unescape quotes that were escaped for the eval string
              const p = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
              const a = parseInt(match[2], 10);
              const c = parseInt(match[3], 10);
              const k = dict.split('|');
              
              const unpacked = unpack(p, a, c, k);
              const m3u8Match = unpacked.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
              if (m3u8Match) {
                m3u8Url = m3u8Match[1];
                break;
              }
            }
          }
          
          if (!m3u8Url) {
            const dataSrcMatch = html.match(/data-src="([^"]+\.m3u8[^"]*)"/);
            if (dataSrcMatch) m3u8Url = dataSrcMatch[1];
          }

          if (m3u8Url) {
            // Redirect to the proxy with the resolved M3U8 url
            const redirectUrl = `/proxy?url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent(targetUrl)}`;
            return Response.redirect(new URL(redirectUrl, request.url).href, 302);
          } else {
            throw new Error('Could not extract m3u8 link from Kwik source');
          }
        } catch (e) {
          return new Response(JSON.stringify({ 
            error: 'Failed to resolve Kwik URL inside Worker',
            details: e.message 
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }

      const targetUrlObj = new URL(targetUrl);
      const referer = customReferer || `${targetUrlObj.protocol}//${targetUrlObj.host}/`;
      
      try {
        // Fetch from target (Animepahe CDN)
        const fetchResponse = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': referer.slice(0, -1),
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site'
          }
        });

        if (fetchResponse.status === 403) {
          return new Response(JSON.stringify({ error: 'Access forbidden - CDN blocked the request' }), { 
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        const contentType = fetchResponse.headers.get('content-type') || 
                           (targetUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 
                            targetUrl.includes('.ts') ? 'video/mp2t' : 'application/octet-stream');

        // Rewrite M3U8 Playlists
        if (contentType.includes('mpegurl') || targetUrl.includes('.m3u8')) {
          const content = await fetchResponse.text();
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const refererParam = customReferer ? `&referer=${encodeURIComponent(customReferer)}` : '';
          
          const modified = content.split('\n').map(line => {
            const t = line.trim();
            if (t.startsWith('#')) {
              // Rewrite URIs in tags like #EXT-X-KEY:METHOD=AES-128,URI="..."
              if (t.includes('URI="')) {
                return t.replace(/URI="([^"]+)"/, (match, uri) => {
                  let fullUrl = uri;
                  if (!uri.startsWith('http')) {
                    fullUrl = baseUrl + uri;
                  }
                  return `URI="/proxy?url=${encodeURIComponent(fullUrl)}${refererParam}"`;
                });
              }
              return line;
            } else if (t && !t.startsWith('http')) {
              return `/proxy?url=${encodeURIComponent(baseUrl + t)}${refererParam}`;
            } else if (t.startsWith('http')) {
              return `/proxy?url=${encodeURIComponent(t)}${refererParam}`;
            }
            return line;
          }).join('\n');

          return new Response(modified, {
            headers: {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*'
            }
          });
        } 
        
        // Proxy Binary Media (Video Segments / TS / Keys)
        else {
          const headers = new Headers();
          headers.set('Content-Type', contentType);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Accept-Ranges', 'bytes');
          
          const contentLength = fetchResponse.headers.get('content-length');
          if (contentLength) headers.set('Content-Length', contentLength);
          
          const contentRange = fetchResponse.headers.get('content-range');
          if (contentRange) headers.set('Content-Range', contentRange);

          return new Response(fetchResponse.body, {
            status: fetchResponse.status,
            headers: headers
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // Default route
    return new Response('Animepahe Proxy is running on Cloudflare Workers! Use /proxy?url=...', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
