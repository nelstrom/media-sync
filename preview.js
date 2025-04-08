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
  
  // Start a simple HTTP server with byte range support
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
    
    // Check if the file exists
    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(500);
          res.end('Server Error: ' + err.code);
        }
        return;
      }
      
      // Handle byte range requests (essential for media seeking)
      const isMedia = /\.(mp4|m4a|mp3|ogg|ogv)$/i.test(filePath);
      const range = req.headers.range;
      
      if (isMedia && range) {
        // Parse the range header
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunkSize = (end - start) + 1;
        
        // Create read stream with range
        const fileStream = fs.createReadStream(filePath, { start, end });
        
        // Send appropriate headers
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType
        });
        
        // Pipe the file stream to the response
        fileStream.pipe(res);
      } else {
        // For non-range requests, serve the full file
        res.writeHead(200, { 
          'Content-Type': contentType,
          'Content-Length': stats.size,
          'Accept-Ranges': 'bytes'  // Indicate we support range requests
        });
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      }
    });
  });
  
  const port = 3000;
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
    console.log('Press Ctrl+C to stop the server');
  });
});