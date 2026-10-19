// Upstream socket connects directly to validated IP, eliminating DNS Rebinding.
const target = await validatePublicHost(hostname, port, {
    allowedPorts: this.allowedPorts,
    lookup: this.lookup
});

// Connect to verified target.address (IP), NOT hostname (prevents TOCTOU)
const upstream = net.connect({ host: target.address, port, family: target.family });
this.sockets.add(upstream);
upstream.setTimeout(this.connectTimeoutMs, () => upstream.destroy(new Error('Timeout')));

// Without 'error' listeners, the timeout or quota destroy() below is an uncaught
// exception that takes down the whole proxy, not just this tunnel.
upstream.on('error', () => clientSocket.destroy());
clientSocket.on('error', () => upstream.destroy());
upstream.once('close', () => this.sockets.delete(upstream));

upstream.once('connect', () => {
    upstream.setTimeout(0); // connect deadline only; a quiet but live tunnel must not be killed
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
});

// Real-time byte counters destroy socket if quota is exceeded
upstream.on('data', (chunk) => {
    connectionBytes += chunk.length;
    this.totalBytes += chunk.length;
    if (connectionBytes > this.maxResponseBytes || this.totalBytes > this.maxTotalBytes) {
        upstream.destroy(new Error('Proxy response limit exceeded'));
        clientSocket.destroy();
    }
});