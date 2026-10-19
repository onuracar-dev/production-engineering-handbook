# Systems Engineering Case Study: Nginx Reverse Proxy SSE Buffering Disablement & SPA MIME Confusion Defense

---

## 1. Problem

In modern web architectures combining Single Page Applications (React/Vite) with streaming backend APIs (Server-Sent Events / SSE), two major reverse proxy bugs commonly occur in production:
1. **Nginx Buffers SSE Streams:** By default, Nginx buffers upstream responses in memory chunks, causing live audit progress packets to stall and burst all at once or time out with 504 Gateway Timeout.
2. **SPA Routing Triggers MIME-Type Confusion:** Naive SPA configurations use `try_files $uri $uri/ /index.html`. When a browser requests a deleted or missing hashed JavaScript bundle (`/assets/chunk-abc123.js`), Nginx returns `200 OK` with `index.html`. The browser attempts to execute the HTML document as JavaScript and crashes with `Uncaught SyntaxError: Unexpected token '<'`.

---

## 2. Why Naive Approaches Fail

1. **Default Nginx Proxy Buffering (`proxy_buffering on`):**
   * Nginx holds upstream bytes until the buffer size (`proxy_buffer_size`) is filled. Real-time SSE micro-updates never reach client browsers in real time.
2. **Default Short Proxy Timeouts (`60s`):**
   * Multi-stage automated audits take 90-180 seconds. Default 60-second read timeouts abruptly drop persistent SSE TCP connections.
3. **Catch-All SPA Routing Fallback:**
   * Applying `try_files $uri $uri/ /index.html` globally across the entire domain treats missing scripts, stylesheets, and images as virtual SPA routes, breaking client caches and polluting error logs.

---

## 3. Architecture

1. **Explicit Buffering Disablement:** Enforces `proxy_buffering off;` on the `/api/` reverse proxy block, so SSE events are passed to the client as soon as nginx receives them. The block uses `location ^~ /api/`: nginx otherwise prefers the regex asset block below, and an API route such as `/api/badge.svg` would return 404 from disk.
2. **Extended Audit Timeouts:** Configures `proxy_read_timeout 270s;` and `proxy_send_timeout 270s;` to accommodate long-running security audits without premature proxy disconnection.
3. **Isolated Static Asset Block:** Dedicated location block for static extensions (`.(?:js|css|svg|png|webp|woff2?)$`) configured with `try_files $uri =404;`. If a hashed asset does not exist on disk, Nginx returns an explicit HTTP 404 rather than serving `index.html`, eliminating MIME-type confusion crashes.
4. **Long-Term Asset Caching:** Configures `expires 1y;` on immutable static bundles for optimal browser cache performance.

```nginx
# 1. Real-time Server-Sent Events (SSE) streaming proxy configuration
location ^~ /api/ {
    proxy_pass http://backend:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 270s;
    proxy_send_timeout 270s;
    proxy_buffering off;
}

# 2. SPA index.html fallback for client routing
location / { try_files $uri $uri/ /index.html; }

# 3. Static asset defense preventing HTML fallback on 404 script/style requests
location ~* \.(?:js|css|svg|png|jpg|jpeg|gif|webp|woff2?)$ {
    expires 1y;
    try_files $uri =404;
}
```

---

## 4. Behavior Comparison

| Nginx Reverse Proxy Setup | Real-Time SSE Chunk Latency | Missing JS Bundle Handling | Browser Script Execution |
|---|---|---|---|
| Default Nginx Config | Buffered until buffer fills (burst delivery) | Returns HTML (MIME Confusion) | Crashes (`SyntaxError '<'`) |
| API-Only Unbuffered | Flushed immediately | Returns HTML | Crashes |
| **SSE Unbuffered + `=404` Asset Guard** | **Flushed immediately without proxy buffer delay** | **Returns explicit HTTP 404** | **Clean graceful degradation** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/nginx_sse_spa.conf`](./src/nginx_sse_spa.conf).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
