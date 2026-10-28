"use strict";

module.exports = function createStatic({ fs, path, PUBLIC, MIME }) {
  function serveStatic(req, res, url) {
    let requested;
    try {
      requested =
        url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("URL ไม่ถูกต้อง");
    }
    const file = path.resolve(PUBLIC, "." + requested);
    if (!file.startsWith(PUBLIC + path.sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("ไม่พบไฟล์");
      }
      const type =
        MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  return { serveStatic };
};
