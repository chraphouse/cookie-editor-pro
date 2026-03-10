let currentTab = null;
let currentUrl = '';
let currentDomain = '';
let activeTab = 'cookies';
let activeStorageType = 'local';
let editingItem = null;
let editingType = 'cookie';
let confirmCallback = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  try {
    const url = new URL(tab.url);
    currentUrl = url.origin;
    currentDomain = url.hostname;
    document.getElementById('siteInfo').textContent = currentDomain;
  } catch {
    document.getElementById('siteInfo').textContent = 'No site loaded';
    return;
  }

  loadCookies();
  updateStorageCount();
  setupEventListeners();
});

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      document.getElementById(activeTab + 'Tab').classList.add('active');
      if (activeTab === 'storage') loadStorage();
      if (activeTab === 'profiles') loadProfiles();
    });
  });

  // Storage type switching
  document.querySelectorAll('.storage-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.storage-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeStorageType = tab.dataset.storage;
      loadStorage();
    });
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.item').forEach(item => {
      const name = item.dataset.name?.toLowerCase() || '';
      const value = item.dataset.value?.toLowerCase() || '';
      item.style.display = (name.includes(query) || value.includes(query)) ? '' : 'none';
    });
  });

  // Add button
  document.getElementById('addBtn').addEventListener('click', () => {
    editingItem = null;
    editingType = activeTab === 'cookies' ? 'cookie' : 'storage';
    showEditModal(editingType === 'cookie' ? 'Add Cookie' : 'Add Storage Item');
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', handleExport);

  // Import
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importModal').classList.remove('hidden');
  });

  document.getElementById('importCancelBtn').addEventListener('click', () => {
    document.getElementById('importModal').classList.add('hidden');
  });

  document.getElementById('importConfirmBtn').addEventListener('click', handleImport);

  // Delete all
  document.getElementById('deleteAllBtn').addEventListener('click', () => {
    const type = activeTab === 'cookies' ? 'cookies' : activeStorageType + 'Storage items';
    showConfirm(
      'Clear All',
      `Delete all ${type} for ${currentDomain}? This cannot be undone.`,
      handleDeleteAll
    );
  });

  // Edit form
  document.getElementById('editForm').addEventListener('submit', handleSave);
  document.getElementById('cancelBtn').addEventListener('click', () => {
    document.getElementById('editModal').classList.add('hidden');
  });

  // Profile save
  document.getElementById('saveProfileBtn').addEventListener('click', () => {
    document.getElementById('profileNameInput').value = '';
    document.getElementById('profileNameModal').classList.remove('hidden');
    document.getElementById('profileNameInput').focus();
  });

  document.getElementById('profileNameCancelBtn').addEventListener('click', () => {
    document.getElementById('profileNameModal').classList.add('hidden');
  });

  document.getElementById('profileNameSaveBtn').addEventListener('click', handleSaveProfile);

  document.getElementById('profileNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveProfile(); }
  });

  // Confirm modal
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmCallback = null;
  });

  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.add('hidden');
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  });
}

// Confirmation dialog
function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.remove('hidden');
  confirmCallback = callback;
}

// Update header counts
async function updateCookieCount(count) {
  document.getElementById('cookieCount').textContent = count;
}

async function updateStorageCount() {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => localStorage.length + sessionStorage.length,
    });
    document.getElementById('storageCount').textContent = results[0]?.result || 0;
  } catch {
    document.getElementById('storageCount').textContent = '-';
  }
}

// Load cookies for current site
async function loadCookies() {
  const response = await chrome.runtime.sendMessage({
    action: 'getCookies',
    url: currentUrl,
  });

  const list = document.getElementById('cookiesList');
  const cookies = response.cookies || [];
  updateCookieCount(cookies.length);

  if (cookies.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No cookies for this site</p></div>';
    return;
  }

  cookies.sort((a, b) => a.name.localeCompare(b.name));

  list.innerHTML = cookies.map(cookie => {
    const badges = [];
    if (cookie.secure) badges.push('<span class="item-badge secure">Secure</span>');
    if (cookie.httpOnly) badges.push('<span class="item-badge httponly">HttpOnly</span>');
    if (cookie.sameSite !== 'unspecified') badges.push(`<span class="item-badge">${cookie.sameSite}</span>`);

    // Show expiry info
    if (cookie.expirationDate) {
      const exp = new Date(cookie.expirationDate * 1000);
      const now = new Date();
      if (exp < now) {
        badges.push('<span class="item-badge" style="color:#ef4444;background:#2a1010">Expired</span>');
      } else {
        const days = Math.ceil((exp - now) / 86400000);
        if (days <= 1) badges.push('<span class="item-badge" style="color:#f59e0b">Expires today</span>');
      }
    } else {
      badges.push('<span class="item-badge">Session</span>');
    }

    return `
      <div class="item" data-name="${esc(cookie.name)}" data-value="${esc(cookie.value)}" onclick="editCookie('${esc(cookie.name)}')">
        <div class="item-info">
          <div class="item-name">${esc(cookie.name)}</div>
          <div class="item-value">${esc(truncate(cookie.value, 80))}</div>
          <div class="item-meta">${badges.join('')}</div>
        </div>
        <div class="item-actions">
          <button class="item-btn" onclick="event.stopPropagation(); copyCookie('${esc(cookie.name)}')" title="Copy value">Copy</button>
          <button class="item-btn delete" onclick="event.stopPropagation(); deleteCookie('${esc(cookie.name)}')" title="Delete">Del</button>
        </div>
      </div>
    `;
  }).join('');
}

// Load localStorage/sessionStorage
async function loadStorage() {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (type) => {
        const storage = type === 'local' ? localStorage : sessionStorage;
        const items = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          const value = storage.getItem(key);
          items.push({ key, value, size: key.length + value.length });
        }
        return items;
      },
      args: [activeStorageType],
    });

    const items = results[0]?.result || [];
    const list = document.getElementById('storageList');
    updateStorageCount();

    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>No ${activeStorageType}Storage items</p></div>`;
      return;
    }

    items.sort((a, b) => a.key.localeCompare(b.key));

    list.innerHTML = items.map(item => {
      const sizeStr = formatSize(item.size);
      const isJson = item.value.startsWith('{') || item.value.startsWith('[');
      return `
      <div class="item" data-name="${esc(item.key)}" data-value="${esc(item.value)}" onclick="editStorageItem('${esc(item.key)}')">
        <div class="item-info">
          <div class="item-name">${esc(item.key)}</div>
          <div class="item-value">${esc(truncate(item.value, 80))}</div>
          <div class="item-meta">
            <span class="item-badge">${sizeStr}</span>
            ${isJson ? '<span class="item-badge" style="color:#60a5fa">JSON</span>' : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="item-btn" onclick="event.stopPropagation(); copyStorageItem('${esc(item.key)}')" title="Copy value">Copy</button>
          <button class="item-btn delete" onclick="event.stopPropagation(); deleteStorageItem('${esc(item.key)}')" title="Delete">Del</button>
        </div>
      </div>
    `}).join('');
  } catch (e) {
    document.getElementById('storageList').innerHTML =
      '<div class="empty-state"><p>Cannot access storage for this page</p></div>';
  }
}

// Cookie operations
window.editCookie = async function(name) {
  const response = await chrome.runtime.sendMessage({
    action: 'getCookies',
    url: currentUrl,
  });
  const cookie = response.cookies.find(c => c.name === name);
  if (!cookie) return;

  editingItem = cookie;
  editingType = 'cookie';
  showEditModal('Edit Cookie');

  document.getElementById('editName').value = cookie.name;
  document.getElementById('editValue').value = cookie.value;
  document.getElementById('editDomain').value = cookie.domain;
  document.getElementById('editPath').value = cookie.path;
  document.getElementById('editSecure').checked = cookie.secure;
  document.getElementById('editHttpOnly').checked = cookie.httpOnly;
  document.getElementById('editSameSite').value = cookie.sameSite;

  if (cookie.expirationDate) {
    const date = new Date(cookie.expirationDate * 1000);
    document.getElementById('editExpires').value = date.toISOString().slice(0, 16);
  }
};

window.deleteCookie = async function(name) {
  await chrome.runtime.sendMessage({
    action: 'removeCookie',
    url: currentUrl,
    name,
  });
  showStatus('Cookie deleted');
  loadCookies();
};

window.copyCookie = async function(name) {
  const response = await chrome.runtime.sendMessage({
    action: 'getCookies',
    url: currentUrl,
  });
  const cookie = response.cookies.find(c => c.name === name);
  if (cookie) {
    await navigator.clipboard.writeText(cookie.value);
    showStatus('Copied to clipboard');
  }
};

// Storage operations
window.editStorageItem = async function(key) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: (type, k) => {
      const storage = type === 'local' ? localStorage : sessionStorage;
      return storage.getItem(k);
    },
    args: [activeStorageType, key],
  });

  let value = results[0]?.result || '';

  // Pretty-print JSON values for easier editing
  try {
    const parsed = JSON.parse(value);
    value = JSON.stringify(parsed, null, 2);
  } catch {}

  editingItem = { key, value };
  editingType = 'storage';
  showEditModal('Edit Storage Item');

  document.getElementById('editName').value = key;
  document.getElementById('editValue').value = value;
};

window.deleteStorageItem = async function(key) {
  await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: (type, k) => {
      const storage = type === 'local' ? localStorage : sessionStorage;
      storage.removeItem(k);
    },
    args: [activeStorageType, key],
  });
  showStatus('Item deleted');
  loadStorage();
};

window.copyStorageItem = async function(key) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: (type, k) => {
      const storage = type === 'local' ? localStorage : sessionStorage;
      return storage.getItem(k);
    },
    args: [activeStorageType, key],
  });
  const value = results[0]?.result || '';

  // Copy pretty-printed JSON if possible
  let copyValue = value;
  try {
    copyValue = JSON.stringify(JSON.parse(value), null, 2);
  } catch {}

  await navigator.clipboard.writeText(copyValue);
  showStatus('Copied to clipboard');
};

// Profiles
async function loadProfiles() {
  const profiles = await getProfiles();
  const domainProfiles = profiles[currentDomain] || {};
  const names = Object.keys(domainProfiles);
  const list = document.getElementById('profilesList');

  if (names.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No saved profiles for this site</p><p style="margin-top:4px;font-size:11px">Save your current cookies as a profile to quickly switch between accounts</p></div>';
    return;
  }

  list.innerHTML = names.map(name => {
    const profile = domainProfiles[name];
    const count = profile.cookies.length;
    const date = new Date(profile.savedAt).toLocaleDateString();
    return `
      <div class="profile-item">
        <div class="profile-info">
          <div class="profile-name">${esc(name)}</div>
          <div class="profile-meta">${count} cookies &middot; saved ${date}</div>
        </div>
        <div class="profile-actions">
          <button class="item-btn restore" onclick="restoreProfile('${esc(name)}')" title="Restore this profile">Restore</button>
          <button class="item-btn delete" onclick="deleteProfile('${esc(name)}')" title="Delete profile">Del</button>
        </div>
      </div>
    `;
  }).join('');
}

async function getProfiles() {
  const result = await chrome.storage.local.get('cookieProfiles');
  return result.cookieProfiles || {};
}

async function saveProfiles(profiles) {
  await chrome.storage.local.set({ cookieProfiles: profiles });
}

async function handleSaveProfile() {
  const name = document.getElementById('profileNameInput').value.trim();
  if (!name) return;

  const response = await chrome.runtime.sendMessage({
    action: 'getCookies',
    url: currentUrl,
  });

  const cookies = response.cookies || [];
  if (cookies.length === 0) {
    showStatus('No cookies to save', true);
    document.getElementById('profileNameModal').classList.add('hidden');
    return;
  }

  const profiles = await getProfiles();
  if (!profiles[currentDomain]) profiles[currentDomain] = {};

  profiles[currentDomain][name] = {
    cookies: cookies,
    savedAt: Date.now(),
  };

  await saveProfiles(profiles);
  document.getElementById('profileNameModal').classList.add('hidden');
  showStatus(`Profile "${name}" saved (${cookies.length} cookies)`);
  loadProfiles();
}

window.restoreProfile = async function(name) {
  showConfirm(
    'Restore Profile',
    `Replace all current cookies with profile "${name}"? Current cookies will be cleared first.`,
    async () => {
      // Clear existing cookies
      await chrome.runtime.sendMessage({
        action: 'removeAllCookies',
        url: currentUrl,
      });

      // Restore profile cookies
      const profiles = await getProfiles();
      const profile = profiles[currentDomain]?.[name];
      if (!profile) return;

      for (const cookie of profile.cookies) {
        await chrome.runtime.sendMessage({
          action: 'setCookie',
          cookie: {
            url: currentUrl,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain || currentDomain,
            path: cookie.path || '/',
            secure: cookie.secure || false,
            httpOnly: cookie.httpOnly || false,
            sameSite: cookie.sameSite || 'lax',
            expirationDate: cookie.expirationDate,
          },
        });
      }

      showStatus(`Restored ${profile.cookies.length} cookies from "${name}"`);
      loadCookies();
    }
  );
};

window.deleteProfile = async function(name) {
  showConfirm('Delete Profile', `Delete profile "${name}"?`, async () => {
    const profiles = await getProfiles();
    if (profiles[currentDomain]) {
      delete profiles[currentDomain][name];
      if (Object.keys(profiles[currentDomain]).length === 0) {
        delete profiles[currentDomain];
      }
    }
    await saveProfiles(profiles);
    showStatus('Profile deleted');
    loadProfiles();
  });
};

// Modal
function showEditModal(title) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('editModal').classList.remove('hidden');
  document.getElementById('cookieFields').style.display =
    editingType === 'cookie' ? 'block' : 'none';

  if (!editingItem) {
    document.getElementById('editForm').reset();
    document.getElementById('editDomain').value = currentDomain;
    document.getElementById('editPath').value = '/';
  }

  document.getElementById('editName').focus();
}

// Save handler
async function handleSave(e) {
  e.preventDefault();

  const name = document.getElementById('editName').value.trim();
  const value = document.getElementById('editValue').value;

  if (!name) return;

  if (editingType === 'cookie') {
    const cookie = {
      url: currentUrl,
      name,
      value,
      domain: document.getElementById('editDomain').value || currentDomain,
      path: document.getElementById('editPath').value || '/',
      secure: document.getElementById('editSecure').checked,
      httpOnly: document.getElementById('editHttpOnly').checked,
      sameSite: document.getElementById('editSameSite').value,
    };

    const expires = document.getElementById('editExpires').value;
    if (expires) {
      cookie.expirationDate = new Date(expires).getTime() / 1000;
    }

    if (editingItem && editingItem.name !== name) {
      await chrome.runtime.sendMessage({
        action: 'removeCookie',
        url: currentUrl,
        name: editingItem.name,
      });
    }

    await chrome.runtime.sendMessage({ action: 'setCookie', cookie });
    showStatus('Cookie saved');
    loadCookies();
  } else {
    // Compact JSON before saving (user may have edited pretty-printed JSON)
    let saveValue = value;
    try {
      saveValue = JSON.stringify(JSON.parse(value));
    } catch {}

    const oldKey = editingItem?.key;
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (type, key, val, oldKey) => {
        const storage = type === 'local' ? localStorage : sessionStorage;
        if (oldKey && oldKey !== key) storage.removeItem(oldKey);
        storage.setItem(key, val);
      },
      args: [activeStorageType, name, saveValue, oldKey],
    });
    showStatus('Item saved');
    loadStorage();
  }

  document.getElementById('editModal').classList.add('hidden');
}

// Export
async function handleExport() {
  let data;
  if (activeTab === 'cookies') {
    const response = await chrome.runtime.sendMessage({
      action: 'getCookies',
      url: currentUrl,
    });
    data = { type: 'cookies', domain: currentDomain, items: response.cookies };
  } else {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (type) => {
        const storage = type === 'local' ? localStorage : sessionStorage;
        const items = {};
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          items[key] = storage.getItem(key);
        }
        return items;
      },
      args: [activeStorageType],
    });
    data = { type: activeStorageType + 'Storage', domain: currentDomain, items: results[0]?.result || {} };
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentDomain}-${data.type}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Exported successfully');
}

// Import
async function handleImport() {
  const raw = document.getElementById('importData').value.trim();
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    if (data.type === 'cookies' && Array.isArray(data.items)) {
      for (const cookie of data.items) {
        await chrome.runtime.sendMessage({
          action: 'setCookie',
          cookie: {
            url: currentUrl,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain || currentDomain,
            path: cookie.path || '/',
            secure: cookie.secure || false,
            httpOnly: cookie.httpOnly || false,
            sameSite: cookie.sameSite || 'lax',
            expirationDate: cookie.expirationDate,
          },
        });
      }
      showStatus(`Imported ${data.items.length} cookies`);
      loadCookies();
    } else if (data.items && typeof data.items === 'object') {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: (type, items) => {
          const storage = type === 'local' ? localStorage : sessionStorage;
          for (const [key, value] of Object.entries(items)) {
            storage.setItem(key, value);
          }
        },
        args: [activeStorageType, data.items],
      });
      showStatus(`Imported ${Object.keys(data.items).length} items`);
      loadStorage();
    }
  } catch (e) {
    showStatus('Invalid JSON', true);
  }

  document.getElementById('importModal').classList.add('hidden');
  document.getElementById('importData').value = '';
}

// Delete all
async function handleDeleteAll() {
  if (activeTab === 'cookies') {
    const response = await chrome.runtime.sendMessage({
      action: 'removeAllCookies',
      url: currentUrl,
    });
    showStatus(`Deleted ${response.removed} cookies`);
    loadCookies();
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (type) => {
        const storage = type === 'local' ? localStorage : sessionStorage;
        storage.clear();
      },
      args: [activeStorageType],
    });
    showStatus('Storage cleared');
    loadStorage();
  }
}

// Utilities
function showStatus(message, isError = false) {
  const bar = document.getElementById('statusBar');
  bar.textContent = message;
  bar.className = 'status-bar' + (isError ? ' error' : '');
  bar.classList.remove('hidden');
  setTimeout(() => bar.classList.add('hidden'), 2000);
}

function esc(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str, len) {
  if (!str || str.length <= len) return str || '';
  return str.substring(0, len) + '...';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
