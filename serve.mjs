// Optional local preview. GitHub Pages does not need this file to run.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2] || 8766);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Port must be an integer between 1024 and 65535.');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.R':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.otf':'font/otf', '.woff2':'font/woff2' };
const server = http.createServer(async (req,res)=>{
  try {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file = resolve(root, '.'+path);
    if (file !== resolve(root) && !file.startsWith(resolve(root)+sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/`));
