const PRODUCTION_PORT = 38450;
let staticServer = null;

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

function startStaticServer() {
  return new Promise((resolve) => {
    const outDir = path.join(__dirname, "../out");
    staticServer = http.createServer((req, res) => {
      // 1. SPA routing fallback for static Next.js export
      const parsedUrl = new URL(req.url, "http://127.0.0.1");
      let pathname;
      try {
        pathname = decodeURIComponent(parsedUrl.pathname);
      } catch {
        res.writeHead(400).end(); // malformed escape such as "%E0%A4%A"
        return;
      }
      // Decoding turns "%2f" into "/", so "/..%2fsecret" would escape outDir.
      let filePath = path.resolve(outDir, "." + pathname);
      if (filePath !== outDir && !filePath.startsWith(outDir + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      if (!path.extname(filePath)) {
        filePath = isFile(filePath + ".html")
          ? filePath + ".html"
          : path.join(filePath, "index.html");
      }
      if (!isFile(filePath)) {
        filePath = path.join(outDir, "index.html");
      }
      // Stream file with strict MIME types...
      const stream = fs.createReadStream(filePath);
      stream.on("error", () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      stream.pipe(res);
    });

    // 2. Fallback to dynamic port ONLY if fixed port is busy
    staticServer.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`Port ${PRODUCTION_PORT} in use, falling back to dynamic port.`);
        staticServer.listen(0, "127.0.0.1", () => {
          resolve(staticServer.address().port);
        });
      }
    });

    // 3. Guarantee persistent origin: http://127.0.0.1:38450
    staticServer.listen(PRODUCTION_PORT, "127.0.0.1", () => {
      resolve(PRODUCTION_PORT);
    });
  });
}