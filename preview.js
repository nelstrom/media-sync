// Simple preview server script (ES Module)
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

// ES Module directory workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build the project first
console.log('Building the project...');
exec('npm run build', (err) => {
  if (err) {
    console.error('Error building the project:', err);
    return;
  }
  
  // Start a simple HTTP server
  const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './' || filePath === '.') {
      filePath = './index.html';
    }
    
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
      case '.js':
        contentType = 'text/javascript';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.mp4':
      case '.m4a':
        contentType = 'audio/mp4';
        break;
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.ogg':
      case '.ogv':
        contentType = 'application/ogg';
        break;
    }
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(500);
          res.end('Server Error: ' + err.code);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
  
  const port = 3000;
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
    console.log('Press Ctrl+C to stop the server');
  });
});