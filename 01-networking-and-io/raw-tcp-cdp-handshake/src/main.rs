use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

/// Queries the Chrome DevTools Protocol target registry (/json) directly
/// over a raw TCP socket, bypassing Chromium Private Network Access (PNA)
/// and CORS security boundaries without pulling in external HTTP client crates.
pub fn fetch_cdp_targets_raw(addr_str: &str, timeout_ms: u64) -> Result<(String, Duration), String> {
    let start_time = Instant::now();

    let addr = addr_str
        .parse()
        .map_err(|e: std::net::AddrParseError| format!("Invalid address: {}", e))?;

    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(timeout_ms))
        .map_err(|e| format!("CDP endpoint {} unreachable: {}", addr_str, e))?;

    stream
        .set_read_timeout(Some(Duration::from_millis(timeout_ms)))
        .map_err(|e| e.to_string())?;

    // Handcrafted HTTP/1.1 frame without external HTTP dependencies
    let req = format!(
        "GET /json HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        addr_str
    );
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

    let mut response = Vec::with_capacity(8192);
    let mut buf = [0u8; 4096];

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

    // EOF: without Content-Length the body runs to the end of the stream.
    let pos = find_header_end(&response).ok_or("CDP response ended before headers")?;
    if content_length(&response[..pos]).is_some() {
        return Err("CDP response ended before Content-Length was satisfied".to_string());
    }
    Ok((String::from_utf8_lossy(&response[pos + 4..]).trim().to_string(), start_time.elapsed()))
}

const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

fn find_header_end(response: &[u8]) -> Option<usize> {
    response.windows(4).position(|w| w == b"\r\n\r\n")
}

fn content_length(headers: &[u8]) -> Option<usize> {
    String::from_utf8_lossy(headers).lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("content-length") {
            value.trim().parse().ok()
        } else {
            None
        }
    })
}

/// Returns the body once the announced Content-Length has fully arrived.
fn complete_body(response: &[u8]) -> Option<String> {
    let pos = find_header_end(response)?;
    let expected_len = content_length(&response[..pos])?;
    let body = &response[pos + 4..];
    if body.len() < expected_len {
        return None;
    }
    Some(String::from_utf8_lossy(&body[..expected_len]).trim().to_string())
}

fn main() {
    println!("--- Testing Raw TCP CDP Handshake ---");
    match fetch_cdp_targets_raw("127.0.0.1:9222", 800) {
        Ok((payload, duration)) => {
            println!("Success! Handshake completed in: {:.2?}", duration);
            println!("Payload preview: {}", &payload[..payload.len().min(120)]);
        }
        Err(err) => {
            println!("Handshake error (Chrome running on 9222?): {}", err);
            println!("Note: Start Chrome with '--remote-debugging-port=9222' to test live.");
        }
    }
}
