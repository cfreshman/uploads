#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JsonDB = require('auto-json-db');
const { generateThemeCSS } = require('./themes');

// Simple MIME type detection
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.xml': 'application/xml',
    '.md': 'text/markdown'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

const PORT = process.env.PORT || 8768;
const DATA_DIR = process.env.DATA_DIR || './data';
const THEME = process.env.THEME || 'default';
const FILES_DIR = path.join(DATA_DIR, 'files');
const MAX_SIZE = process.env.MAX_SIZE || 1024 * 1024 * 1024; // 1GB default

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

// Initialize database
const db = new JsonDB(path.join(DATA_DIR, 'uploads.json'));

// Initialize db structure if needed
if (!db.data.passwordHash) {
  db.data.passwordHash = null;
}
if (!db.data.uploads) {
  db.data.uploads = {};
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password) {
  if (!db.data.passwordHash) return false;
  return hashPassword(password) === db.data.passwordHash;
}

function generateId(filename) {
  const ext = path.extname(filename);
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id;
  do {
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (db.data.uploads[id + ext]);
  return id + ext;
}

function serveFile(filePath, contentType, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

function checkAuth(req) {
  if (!db.data.passwordHash) return true;
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  return verifyPassword(token);
}

function requireAuth(req, res) {
  if (!checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Serve static files
  if (url.pathname === '/' && req.method === 'GET') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const themeVars = generateThemeCSS(THEME);
    const injectedHtml = html.replace('<style id="theme-vars"></style>', `<style id="theme-vars">${themeVars}</style>`);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(injectedHtml);
    return;
  }
  
  if (url.pathname === '/styles.css' && req.method === 'GET') {
    serveFile('styles.css', 'text/css', res);
    return;
  }
  
  if (url.pathname === '/client.js' && req.method === 'GET') {
    serveFile('client.js', 'application/javascript', res);
    return;
  }
  
  // API: Check auth status
  if (url.pathname === '/api/auth' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      needsSetup: !db.data.passwordHash,
      requiresAuth: !!db.data.passwordHash,
      authenticated: checkAuth(req)
    }));
    return;
  }
  
  // API: Setup password
  if (url.pathname === '/api/setup' && req.method === 'POST') {
    if (db.data.passwordHash) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password already set' }));
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        
        if (!password || password.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password must be at least 4 characters' }));
          return;
        }
        
        db.data.passwordHash = hashPassword(password);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  
  // API: Upload file
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    
    const filename = req.headers['x-filename'] || 'file';
    const description = req.headers['x-description'] || '';
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > MAX_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File too large' }));
      return;
    }
    
    const id = generateId(filename);
    const filePath = path.join(FILES_DIR, id);
    const writeStream = fs.createWriteStream(filePath);
    let uploadedSize = 0;
    
    req.on('data', chunk => {
      uploadedSize += chunk.length;
      writeStream.write(chunk);
    });
    
    req.on('end', () => {
      writeStream.end();
      
      db.data.uploads[id] = {
        id,
        filename,
        description,
        size: uploadedSize,
        uploaded: new Date().toISOString()
      };
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, upload: db.data.uploads[id] }));
    });
    
    req.on('error', (err) => {
      console.error('Upload error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload failed' }));
    });
    
    return;
  }
  
  // API: Get all uploads
  if (url.pathname === '/api/uploads' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    
    const uploadArray = Object.values(db.data.uploads).sort((a, b) => 
      new Date(b.uploaded) - new Date(a.uploaded)
    );
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ uploads: uploadArray }));
    return;
  }
  
  // API: Delete upload
  if (url.pathname.startsWith('/api/uploads/') && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    
    const id = url.pathname.split('/')[3];
    if (db.data.uploads[id]) {
      const filePath = path.join(FILES_DIR, id);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      delete db.data.uploads[id];
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload not found' }));
    }
    return;
  }
  
  // Serve uploaded files at root path (public) - must be last to not conflict with other routes
  const potentialId = url.pathname.slice(1);
  if (potentialId && db.data.uploads[potentialId] && req.method === 'GET') {
    const upload = db.data.uploads[potentialId];
    const filePath = path.join(FILES_DIR, potentialId);
    
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    
    const mimeType = getMimeType(upload.filename);
    
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${upload.filename}"`,
      'Content-Length': upload.size
    });
    
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`📤 uploads running on http://localhost:${PORT}`);
  console.log(`📁 Data stored in ${path.resolve(DATA_DIR)}`);
  console.log(`📏 Max file size: ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB`);
  if (db.data.passwordHash) {
    console.log(`🔒 Password required`);
  } else {
    console.log(`⚠️  No password set - first visitor will set password`);
  }
});

