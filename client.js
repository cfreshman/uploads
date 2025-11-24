const form = document.getElementById('uploadForm');
const result = document.getElementById('result');
const resultUrl = document.getElementById('resultUrl');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const error = document.getElementById('error');
const uploadsList = document.getElementById('uploadsList');
const searchInput = document.getElementById('searchInput');
const storageInfo = document.getElementById('storageInfo');
const fileInput = document.getElementById('file');
const fileLabel = document.getElementById('fileLabel');

let allUploads = [];
let authToken = localStorage.getItem('uploads_auth') || null;
let hasPromptedThisSession = false;

function getHeaders() {
  const headers = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

async function checkAuth() {
  try {
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const res = await fetch('/api/auth', { headers });
    const data = await res.json();
    
    if (data.needsSetup) {
      const password = prompt('create password (min 4 characters):');
      if (!password || password.length < 4) {
        alert('password must be at least 4 characters');
        await checkAuth();
        return;
      }
      
      const setupRes = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (setupRes.ok) {
        authToken = password;
        localStorage.setItem('uploads_auth', password);
      } else {
        alert('setup failed');
        await checkAuth();
      }
      return;
    }
    
    if (data.requiresAuth && !data.authenticated) {
      if (hasPromptedThisSession) {
        // Already prompted this page load, show error
        document.body.innerHTML = `
          <div style="font-family: 'Google Sans Code', monospace; padding: 2rem; text-align: center; max-width: 400px; margin: 0 auto;">
            <div style="font-size: 0.875rem; margin-bottom: 1rem;">incorrect or missing password</div>
            <div style="font-size: 0.75rem; color: #999;">
              <a href="https://github.com/cfreshman/uploads" style="color: #000; text-decoration: underline;">github.com/cfreshman/uploads</a>
            </div>
          </div>
        `;
        return;
      }
      
      hasPromptedThisSession = true;
      localStorage.removeItem('uploads_auth');
      authToken = null;
      
      const password = prompt('enter password:');
      if (!password) {
        document.body.innerHTML = `
          <div style="font-family: 'Google Sans Code', monospace; padding: 2rem; text-align: center; max-width: 400px; margin: 0 auto;">
            <div style="font-size: 0.875rem; margin-bottom: 1rem;">incorrect or missing password</div>
            <div style="font-size: 0.75rem; color: #999;">
              <a href="https://github.com/cfreshman/uploads" style="color: #000; text-decoration: underline;">github.com/cfreshman/uploads</a>
            </div>
          </div>
        `;
        return;
      }
      
      authToken = password;
      localStorage.setItem('uploads_auth', password);
      // Password stored - don't call checkAuth again, just continue
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.remove('show');
  
  const fileInput = document.getElementById('file');
  const descriptionInput = document.getElementById('description');
  const file = fileInput.files[0];
  
  if (!file) {
    error.textContent = 'Please select a file';
    error.classList.add('show');
    return;
  }
  
  try {
    const headers = getHeaders();
    headers['X-Filename'] = file.name;
    if (descriptionInput.value) {
      headers['X-Description'] = descriptionInput.value;
    }
    
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: headers,
      body: file
    });
    
    if (res.status === 401) {
      localStorage.removeItem('uploads_auth');
      authToken = null;
      return;
    }
    
    if (!res.ok) {
      const data = await res.json();
      error.textContent = data.error || 'Upload failed';
      error.classList.add('show');
      return;
    }
    
    const data = await res.json();
    const downloadUrl = window.location.origin + '/api/download/' + data.id;
    resultUrl.textContent = downloadUrl;
    result.classList.add('show');
    
    form.reset();
    loadUploads();
  } catch (err) {
    error.textContent = 'Network error';
    error.classList.add('show');
  }
});

async function deleteUpload(id) {
  if (!confirm('Delete this upload?')) return;
  
  try {
    const res = await fetch(`/api/uploads/${id}`, { 
      method: 'DELETE',
      headers: getHeaders()
    });
    
    if (res.status === 401) {
      localStorage.removeItem('uploads_auth');
      authToken = null;
      return;
    }
    
    if (res.ok) {
      loadUploads();
    }
  } catch (err) {
    alert('Failed to delete upload');
  }
}

function copyLink(id) {
  const url = window.location.origin + '/api/download/' + id;
  navigator.clipboard.writeText(url);
  
  // Visual feedback
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = 'copied!';
  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderUploads(uploads, isFiltered = false) {
  if (uploads && uploads.length > 0) {
    uploadsList.innerHTML = uploads.map(upload => `
      <div class="upload-item">
        <div class="upload-header">
          <div class="upload-name">${escapeHtml(upload.filename)}</div>
          <div class="upload-actions">
            <button class="upload-btn" onclick="copyLink('${upload.id}')">copy link</button>
            <button class="upload-btn delete" onclick="deleteUpload('${upload.id}')">delete</button>
          </div>
        </div>
        ${upload.description ? `<div class="upload-description">${escapeHtml(upload.description)}</div>` : ''}
        <div class="upload-meta">
          <span>${formatBytes(upload.size)}</span>
          <span>${new Date(upload.uploaded).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');
  } else {
    const message = isFiltered ? 'no matching uploads' : 'no uploads yet. upload your first file above';
    uploadsList.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

function filterUploads() {
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    renderUploads(allUploads, false);
    return;
  }
  
  const filtered = allUploads.filter(upload => 
    upload.filename.toLowerCase().includes(query) || 
    (upload.description && upload.description.toLowerCase().includes(query))
  );
  
  renderUploads(filtered, true);
}

async function loadUploads() {
  try {
    const res = await fetch('/api/uploads', {
      headers: getHeaders()
    });
    
    if (res.status === 401) {
      localStorage.removeItem('uploads_auth');
      authToken = null;
      return;
    }
    
    const data = await res.json();
    allUploads = data.uploads || [];
    
    // Update storage info
    const totalBytes = allUploads.reduce((sum, upload) => sum + upload.size, 0);
    storageInfo.textContent = `${formatBytes(totalBytes)} used`;
    
    filterUploads();
  } catch (err) {
    console.error('Failed to load uploads:', err);
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(resultUrl.textContent);
  copyBtn.textContent = 'copied!';
  copyBtn.classList.add('copied');
  setTimeout(() => {
    copyBtn.textContent = 'copy to clipboard';
    copyBtn.classList.remove('copied');
  }, 2000);
});

searchInput.addEventListener('input', filterUploads);

// Update file label when file is selected
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    fileLabel.textContent = fileInput.files[0].name;
  } else {
    fileLabel.textContent = 'choose file';
  }
});

// Clear form
clearBtn.addEventListener('click', () => {
  form.reset();
  fileLabel.textContent = 'choose file';
  result.classList.remove('show');
});

checkAuth().then(() => loadUploads());

