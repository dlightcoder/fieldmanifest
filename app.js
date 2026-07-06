/* ===================== STATE ===================== */
let session = JSON.parse(localStorage.getItem('dlight_session') || 'null');
let shopsCache = [];
let visitsCache = [];
let tasksCache = [];
let salesCache = [];
let issuesCache = [];

/* ===================== API HELPERS ===================== */
async function apiGet(action, params = {}) {
  const q = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${API_URL}?${q}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiPost(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

function showError(elId, message) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

/* ===================== AUTH ===================== */
function setAuthMode(mode) {
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('loginForm').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = mode === 'register' ? 'block' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('loginPhone').value;
  const pin = document.getElementById('loginPin').value;
  try {
    const agent = await apiPost('loginAgent', { phone, pin });
    session = agent;
    localStorage.setItem('dlight_session', JSON.stringify(session));
    boot();
  } catch (err) {
    showError('authError', err.message);
  }
  return false;
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const phone = document.getElementById('regPhone').value;
  const pin = document.getElementById('regPin').value;
  const region = document.getElementById('regRegion').value;
  const shopName = document.getElementById('regShopName').value;
  const ecCode = document.getElementById('regEcCode').value;
  try {
    const agent = await apiPost('registerAgent', { name, phone, pin, region, shopName, ecCode });
    session = agent;
    localStorage.setItem('dlight_session', JSON.stringify(session));
    boot();
  } catch (err) {
    showError('authError', err.message);
  }
  return false;
}

function logout() {
  localStorage.removeItem('dlight_session');
  session = null;
  location.reload();
}

/* ===================== VIEW SWITCHING ===================== */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');
}

/* ===================== BOOT ===================== */
async function boot() {
  if (!session || !session.agentId) {
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('tabBar').classList.add('hidden');
    return;
  }
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('tabBar').classList.remove('hidden');
  document.getElementById('agentGreeting').textContent = 'Welcome, ' + session.name.split(' ')[0];
  const shopBit = session.shopName ? ` · ${session.shopName}` : '';
  document.getElementById('agentSub').textContent = `${session.agentId} · ${session.region || 'UNASSIGNED'}${shopBit}`;

  await refreshAll();
}

async function refreshAll() {
  try {
    [shopsCache, visitsCache, tasksCache, salesCache, issuesCache] = await Promise.all([
      apiGet('listShops'),
      apiGet('listVisits', { agentId: session.agentId }),
      apiGet('listTasks', { agentId: session.agentId }),
      apiGet('listSales', { agentId: session.agentId }),
      apiGet('listIssues', { agentId: session.agentId })
    ]);
  } catch (err) {
    console.error(err);
  }
  renderShops();
  renderVisits();
  renderTasks();
  renderSales();
  renderIssues();
  populateShopSelects();
  updateStats();
}

function updateStats() {
  document.getElementById('statShops').textContent = shopsCache.length;
  const today = new Date().toDateString();
  document.getElementById('statVisitsToday').textContent =
    visitsCache.filter(v => new Date(v.Timestamp).toDateString() === today).length;
  document.getElementById('statTasksOpen').textContent =
    tasksCache.filter(t => t.Status !== 'Done').length;
}

/* ===================== SHOPS ===================== */
async function handleRegisterShop(e) {
  e.preventDefault();
  const payload = {
    ecCode: document.getElementById('shopEcCode').value,
    shopName: document.getElementById('shopName').value,
    contactName: document.getElementById('shopContact').value,
    phone: document.getElementById('shopPhone').value,
    location: document.getElementById('shopLocation').value,
    agentId: session.agentId,
    agentName: session.name
  };
  try {
    await apiPost('registerShop', payload);
    e.target.reset();
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
  return false;
}

function renderShops() {
  const search = (document.getElementById('shopSearch')?.value || '').toLowerCase();
  const list = shopsCache.filter(s =>
    !search ||
    String(s.ShopName).toLowerCase().includes(search) ||
    String(s.ECCode).toLowerCase().includes(search) ||
    String(s.Location).toLowerCase().includes(search)
  );
  const container = document.getElementById('shopsList');
  if (list.length === 0) {
    container.innerHTML = emptyState('No EC shops match yet.');
    return;
  }
  container.innerHTML = list.slice(0, 100).map(s => `
    <div class="label-card">
      <div class="label-code">${s.ECCode || '—'}</div>
      <div class="label-body">
        <div class="label-name">${escapeHtml(s.ShopName)}</div>
        <div class="label-meta">${escapeHtml(s.ContactName || '')} ${s.Phone ? '· ' + escapeHtml(s.Phone) : ''}</div>
        <div class="label-meta">${escapeHtml(s.Location || '')}</div>
      </div>
    </div>
  `).join('');
}

function populateShopSelects() {
  const opts = '<option value="">Select a shop...</option>' + shopsCache.map(s =>
    `<option value="${s.ECCode}|${escapeHtml(s.ShopName)}">${s.ECCode ? s.ECCode + ' — ' : ''}${escapeHtml(s.ShopName)}</option>`
  ).join('');
  ['visitShopSelect', 'saleShopSelect', 'issueShopSelect'].forEach(id => {
    const el = document.getElementById(id);
    const current = el.value;
    el.innerHTML = opts;
    el.value = current;
  });
}

/* ===================== VISITS ===================== */
async function handleLogVisit(e) {
  e.preventDefault();
  const [ecCode, shopName] = document.getElementById('visitShopSelect').value.split('|');
  try {
    await apiPost('logVisit', {
      ecCode, shopName,
      agentId: session.agentId, agentName: session.name,
      notes: document.getElementById('visitNotes').value
    });
    e.target.reset();
    await refreshAll();
  } catch (err) { alert(err.message); }
  return false;
}

function renderVisits() {
  const container = document.getElementById('visitsList');
  if (visitsCache.length === 0) { container.innerHTML = emptyState('No visits logged yet.'); return; }
  const sorted = [...visitsCache].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  container.innerHTML = sorted.slice(0, 50).map(v => `
    <div class="label-card">
      <div class="label-code">${v.ECCode || '—'}</div>
      <div class="label-body">
        <div class="label-name">${escapeHtml(v.ShopName)}</div>
        <div class="label-meta">${new Date(v.Timestamp).toLocaleString()}</div>
        ${v.Notes ? `<div class="label-meta">${escapeHtml(v.Notes)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

/* ===================== TASKS ===================== */
async function handleAddTask(e) {
  e.preventDefault();
  try {
    await apiPost('addTask', {
      agentId: session.agentId, agentName: session.name,
      title: document.getElementById('taskTitle').value,
      description: document.getElementById('taskDesc').value,
      dueDate: document.getElementById('taskDue').value
    });
    e.target.reset();
    await refreshAll();
  } catch (err) { alert(err.message); }
  return false;
}

async function markTaskDone(taskId) {
  try {
    await apiPost('completeTask', { taskId });
    await refreshAll();
  } catch (err) { alert(err.message); }
}

function renderTasks() {
  const container = document.getElementById('tasksList');
  if (tasksCache.length === 0) { container.innerHTML = emptyState('No tasks yet — add one above.'); return; }
  const sorted = [...tasksCache].sort((a, b) => (a.Status === 'Done') - (b.Status === 'Done'));
  container.innerHTML = sorted.map(t => `
    <div class="label-card">
      <div class="label-body" style="width:100%;">
        <div class="label-name">${escapeHtml(t.Title)}</div>
        ${t.Description ? `<div class="label-meta">${escapeHtml(t.Description)}</div>` : ''}
        <div class="label-meta">${t.DueDate ? 'Due ' + t.DueDate : ''}</div>
        <span class="label-tag ${t.Status === 'Done' ? 'tag-done' : 'tag-pending'}">${t.Status}</span>
        ${t.Status !== 'Done' ? `<button class="btn small" style="margin-top:8px;display:block;" onclick="markTaskDone('${t.TaskID}')">Mark done</button>` : ''}
      </div>
    </div>
  `).join('');
}

/* ===================== SALES ===================== */
async function handleLogSale(e) {
  e.preventDefault();
  const [ecCode, shopName] = document.getElementById('saleShopSelect').value.split('|');
  try {
    await apiPost('logSale', {
      ecCode, shopName,
      agentId: session.agentId, agentName: session.name,
      product: document.getElementById('saleProduct').value,
      quantity: document.getElementById('saleQty').value,
      amount: document.getElementById('saleAmount').value
    });
    e.target.reset();
    await refreshAll();
  } catch (err) { alert(err.message); }
  return false;
}

function renderSales() {
  const container = document.getElementById('salesList');
  if (salesCache.length === 0) { container.innerHTML = emptyState('No sales recorded yet.'); return; }
  const sorted = [...salesCache].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  container.innerHTML = sorted.slice(0, 50).map(s => `
    <div class="label-card">
      <div class="label-code">${s.ECCode || '—'}</div>
      <div class="label-body">
        <div class="label-name">${escapeHtml(s.Product)} × ${s.Quantity}</div>
        <div class="label-meta">${escapeHtml(s.ShopName)} · KES ${s.Amount}</div>
        <div class="label-meta">${new Date(s.Date).toLocaleString()}</div>
      </div>
    </div>
  `).join('');
}

/* ===================== ISSUES ===================== */
async function handleLogIssue(e) {
  e.preventDefault();
  const [ecCode, shopName] = document.getElementById('issueShopSelect').value.split('|');
  try {
    await apiPost('logIssue', {
      ecCode, shopName,
      agentId: session.agentId, agentName: session.name,
      description: document.getElementById('issueDesc').value
    });
    e.target.reset();
    await refreshAll();
  } catch (err) { alert(err.message); }
  return false;
}

function renderIssues() {
  const container = document.getElementById('issuesList');
  if (issuesCache.length === 0) { container.innerHTML = emptyState('No issues reported yet.'); return; }
  const sorted = [...issuesCache].sort((a, b) => new Date(b.Date) - new Date(a.Date));
  container.innerHTML = sorted.slice(0, 50).map(i => `
    <div class="label-card">
      <div class="label-code">${i.ECCode || '—'}</div>
      <div class="label-body">
        <div class="label-name">${escapeHtml(i.ShopName)}</div>
        <div class="label-meta">${escapeHtml(i.Description)}</div>
        <span class="label-tag tag-open">${i.Status}</span>
      </div>
    </div>
  `).join('');
}

/* ===================== UTIL ===================== */
function emptyState(msg) {
  return `<div class="empty-state"><div class="glyph">&#9728;</div>${msg}</div>`;
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ===================== INIT ===================== */
boot();
