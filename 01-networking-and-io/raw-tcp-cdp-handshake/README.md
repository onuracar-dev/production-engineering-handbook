# Case Study 01: Raw TCP CDP Handshake

> **Domain:** Networking & Low-Level I/O  
> **Source Project:** `llm-conductor` (Desktop Native Core)  
> **Language:** Rust  
> **Dependencies:** `0` (Standard Library only)  
> **Key Metric:** Zero external dependencies, immediate Content-Length framing exit

---

## 1. Problem

When building sovereign desktop harnesses or local orchestration runtimes that drive Chrome via the Chrome DevTools Protocol (CDP on port `9222`), querying target endpoints (`http://127.0.0.1:9222/json`) from an embedded WebView is strictly blocked by **Chromium Private Network Access (PNA)** and **CORS**.

To circumvent this, the desktop host process (Rust / OS layer) must perform the local target discovery.

---

## 2. Why Naive Approaches Fail

1. **Heavy HTTP Client Crates (`reqwest`, `hyper`, `surf`):**
   * Pulling in `reqwest` pulls in an async runtime, connection pool, and TLS stack (such as `native-tls` or `rustls`).
   * Increases release binary size by adding HTTP client and async/TLS runtime dependencies.
   * Introduces non-trivial initialization latency for what is fundamentally an ephemeral localhost probe.
2. **Local Proxy Daemons:**
   * Running a background proxy process introduces port contention, process-monitoring overhead, and OS firewall prompts.
3. **Socket EOF Block:**
   * Many naive socket implementations read until `EOF` (0 bytes). Because HTTP/1.1 connections remain open unless explicitly closed or keep-alive expires, read loops hang until socket timeout unless `Content-Length` framing is actively parsed.

---

## 3. Architecture

We eliminated external HTTP dependencies entirely by implementing a handcrafted raw TCP HTTP/1.1 handshake using Rust's `std::net::TcpStream`:

1. **Direct Socket Connection:** `TcpStream::connect_timeout` connects to `127.0.0.1:9222` with an explicit timeout.
2. **Handcrafted Frame:** A statically formatted minimal HTTP/1.1 request is written directly to the stream:
   ```http
   GET /json HTTP/1.1\r\n
   Host: 127.0.0.1:9222\r\n
   Connection: close\r\n\r\n
   ```
3. **Active Framing & Early Exit:** Rather than waiting for the remote socket to close or timeout, the buffer is inspected in-flight for the `\r\n\r\n` header delimiter and the `Content-Length` header. As soon as the byte count of the body meets or exceeds `Content-Length`, execution returns immediately. Without `Content-Length` the body runs until the peer closes the socket (the request sends `Connection: close`). A short read, a read error or a response above 4 MiB returns `Err` instead of a truncated body.

---

## 4. Behavior Comparison

| Approach | External Crates | Binary Size Impact | Protocol Overhead |
|---|---|---|---|
| `reqwest` (Blocking) | Multiple dependencies (async/TLS runtime) | Increases binary footprint | TLS/pool initialization overhead |
| `ureq` (Minimal) | Multiple dependencies | Adds crate dependencies | Minimal HTTP parser |
| **Raw TCP (Handcrafted)** | **0 (Standard library only)** | **No added dependencies** | **Immediate exit on Content-Length framing** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/main.rs`](./src/main.rs).

```rust
// Handcrafted HTTP/1.1 frame without external HTTP dependencies
let req = format!(
    "GET /json HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
    addr_str
);
stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

// Read until Content-Length is satisfied or the peer closes (Connection: close).
// A hard byte cap turns a runaway response into an error instead of a truncated body.
loop {
    if let Some(body) = complete_body(&response) {
        return Ok((body, start_time.elapsed()));
    }
    if response.len() > MAX_RESPONSE_BYTES {
        return Err(format!("CDP response exceeded {} bytes", MAX_RESPONSE_BYTES));
    }
    match stream.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => response.extend_from_slice(&buf[..n]),
        Err(e) => return Err(format!("CDP read failed: {}", e)),
    }
}
```

---

## 6. How to Run

1. Start Google Chrome with remote debugging enabled on port 9222:
   ```bash
   chrome.exe --remote-debugging-port=9222 --headless --disable-gpu about:blank
   ```

2. Execute the Rust client to perform the raw TCP HTTP/1.1 handshake and Content-Length parse:
   ```bash
   cargo run --release
   ```

The application connects to `127.0.0.1:9222`, transmits the handcrafted HTTP/1.1 frame, parses `Content-Length`, exits immediately upon frame completion, and outputs the elapsed handshake duration.

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
