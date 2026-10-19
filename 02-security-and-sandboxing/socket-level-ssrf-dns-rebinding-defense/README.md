# Case Study 07: Socket-Level SSRF & DNS Rebinding (TOCTOU) Defense

> **Domain:** Security & Sandboxing  
> **Source Project:** `WebPageAnalyz (Core Engine)`  
> **Language:** Node.js / Native Sockets  
> **Key Metric:** Direct IP connect eliminates TOCTOU window, net.BlockList subnet enforcement

---

## 1. Problem

Visiting user-submitted URLs in browser workers creates catastrophic SSRF vulnerability against cloud metadata endpoints (169.254.169.254), container localhost, and RFC 1918 LANs.

Standard DNS pre-validation fails against DNS Rebinding (Time-of-Check to Time-of-Use): the DNS resolver returns a benign public IP at validation time, but by the time the socket connects shortly after, the short-TTL DNS switches to 127.0.0.1.

---

## 2. Why Naive Approaches Fail

1. **Regex & URL Hostname Whitelisting:**
   * Trivial to bypass with decimal/octal encodings (`http://2130706433`), IPv6 mapped IPv4 (`::ffff:127.0.0.1`), or embedded credentials (`user:pass@evil.com`).
2. **Pre-flight DNS Resolvers without Socket Pinning:**
   * Validating an IP before making a request creates a Time-of-Check to Time-of-Use (TOCTOU) vulnerability. Malicious DNS servers return a public IP for the check, then immediately respond with `127.0.0.1` for the fetch.
3. **Heavyweight Reverse Proxy Daemons (Squid / HAProxy):**
   * Adds operational overhead, complex routing topologies, and separate certificate lifecycle maintenance.

---

## 3. Architecture

1. **Microsecond Subnet Classification:** Using Node.js `net.BlockList()` to block all private, loopback, link-local, multicast, and CGNAT subnets for IPv4 and IPv6.
2. **Socket-Level IP Pinning:** Upstream `net.connect()` and `https.request()` connect directly to the resolved and verified IP address (`target.address`). The original hostname is supplied strictly as the TLS SNI (`servername`) and HTTP `Host` header.
3. **Fail-Closed CONNECT Policy (original project, not in `src/`):** In read-only passive scanning mode, opaque HTTP `CONNECT` tunnels are rejected with HTTP 405 because method payloads cannot be inspected inside the tunnel. `src/safe_proxy.js` is the CONNECT handler for the modes that do allow tunnels, so it accepts them and applies the IP pinning and quotas below.
4. **Streaming Chunk Quotas:** In-flight byte counters destroy sockets mid-stream if transfer limits are exceeded, preventing streaming memory bombs.

---

## 4. Behavior Comparison

| Defense Strategy | DNS Rebinding (TOCTOU) Safety | Latency Overhead | External Daemons |
|---|---|---|---|
| Regex Host Checking | Vulnerable | Negligible | None |
| Pre-flight DNS Resolver | Vulnerable (TOCTOU Race) | Extra DNS roundtrip | None |
| Forward Proxy Daemon | Protected | Proxy hop overhead | Required (Squid/Envoy) |
| **Native Socket IP Pinning** | **Protected (Pinned IP connect)** | **No proxy hop** | **None (Native Node.js `net`)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/safe_proxy.js`](./src/safe_proxy.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
