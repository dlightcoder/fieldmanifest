/* ===================== STATE ===================== */
let adminSession = JSON.parse(localStorage.getItem('dlight_admin_session') || 'null');
let adminShopsCache = [];
let adminAgentsCache = [];

/* ===================== API HELPERS (shared shape with the agent app) ===================== */
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
function setAdminAuthMode(mode) {
  document.getElementById('tabAdminLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabAdminBootstrap').classList.toggle('active', mode === 'bootstrap');
  document.getElementById('adminLoginForm').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('adminBootstrapForm').style.display = mode === 'bootstrap' ? 'block' : 'none';
}

async function handleAdminLogin(e) {
  e.preventDefault();
  try {
    const admin = await apiPost('adminLogin', {
      username: document.getElementById('adminLoginUser').value,
      password: document.getElementById('adminLoginPass').value
    });
    adminSession = admin;
    localStorage.setItem('dlight_admin_session', JSON.stringify(adminSession));
    boot();
  } catch (err) {
    showError('adminAuthError', err.message);
  }
  return false;
}

async function handleBootstrapAdmin(e) {
  e.preventDefault();
  try {
    const admin = await apiPost('bootstrapAdmin', {
      name: document.getElementById('bootName').value,
      username: document.getElementById('bootUser').value,
      password: document.getElementById('bootPass').value
    });
    adminSession = admin;
    localStorage.setItem('dlight_admin_session', JSON.stringify(adminSession));
    boot();
  } catch (err) {
    showError('adminAuthError', err.message);
  }
  return false;
}

function adminLogout() {
  localStorage.removeItem('dlight_admin_session');
  adminSession = null;
  location.reload();
}

/* ===================== BOOT ===================== */
async function boot() {
  if (!adminSession || !adminSession.adminId) {
    document.getElementById('adminAuthScreen').style.display = 'block';
    document.getElementById('adminApp').style.display = 'none';
    return;
  }
  document.getElementById('adminAuthScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  document.getElementById('adminGreeting').textContent = 'Welcome, ' + adminSession.name.split(' ')[0];
  await refreshAll();
}

async function refreshAll() {
  try {
    [adminShopsCache, adminAgentsCache] = await Promise.all([
      apiGet('listShopsAdmin', { adminId: adminSession.adminId }),
      apiGet('listAgents')
    ]);
  } catch (err) {
    console.error(err);
    if (/admin login required/i.test(err.message)) adminLogout();
  }
  renderAdminShops();
  renderAdminAgents();
}

/* ===================== SHOPS + INVITES ===================== */
function inviteLinkFor(token) {
  return `${location.origin}${location.pathname.replace(/admin\.html$/, 'index.html')}?invite=${token}`;
}

async function handleAdminCreateShop(e) {
  e.preventDefault();
  try {
    const shop = await apiPost('adminCreateShop', {
      adminId: adminSession.adminId,
      shopName: document.getElementById('newShopName').value,
      ecCode: document.getElementById('newShopEcCode').value,
      contactName: document.getElementById('newShopContact').value,
      phone: document.getElementById('newShopPhone').value,
      location: document.getElementById('newShopLocation').value
    });
    const link = inviteLinkFor(shop.inviteToken);
    const card = document.getElementById('newInviteCard');
    card.style.display = 'block';
    card.innerHTML = `
      <div class="shop-name">${escapeHtml(shop.shopName)} — EC ${escapeHtml(String(shop.ecCode))}</div>
      <div class="shop-meta" style="word-break:break-all;">${escapeHtml(link)}</div>
      <button class="btn small" style="margin-top:10px;" onclick="copyText('${link}')">Copy invite link</button>
      <p class="helper-text">Share this link with the agent so they can set their own password.</p>
    `;
    e.target.reset();
    await refreshAll();
  } catch (err) { alert(err.message); }
  return false;
}

async function copyInviteLink(token) {
  await copyText(inviteLinkFor(token));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Invite link copied.');
  } catch (err) {
    prompt('Copy this link:', text);
  }
}

async function regenerateInvite(ecCode) {
  if (!confirm('This invalidates the old link for EC ' + ecCode + '. Continue?')) return;
  try {
    const result = await apiPost('regenerateInvite', { adminId: adminSession.adminId, ecCode });
    await copyText(inviteLinkFor(result.inviteToken));
    await refreshAll();
  } catch (err) { alert(err.message); }
}

function renderAdminShops() {
  const search = (document.getElementById('adminShopSearch')?.value || '').toLowerCase();
  const list = adminShopsCache.filter(s =>
    !search ||
    String(s.ShopName).toLowerCase().includes(search) ||
    String(s.ECCode).toLowerCase().includes(search) ||
    String(s.Location).toLowerCase().includes(search)
  );
  const container = document.getElementById('adminShopsList');
  if (list.length === 0) { container.innerHTML = emptyState('No shops yet — create one above.'); return; }
  const tagClass = s => s === 'Claimed' ? 'tag-done' : (s === 'Pending Invite' ? 'tag-pending' : 'tag-open');
  container.innerHTML = list.slice(0, 200).map(s => `
    <div class="label-card">
      <div class="label-code">${s.ECCode || '—'}</div>
      <div class="label-body">
        <div class="label-name">${escapeHtml(s.ShopName)}</div>
        <div class="label-meta">${escapeHtml(s.ContactName || '')} ${s.Phone ? '· ' + escapeHtml(s.Phone) : ''}</div>
        <div class="label-meta">${escapeHtml(s.Location || '')}</div>
        ${s.InviteStatus ? `<span class="label-tag ${tagClass(s.InviteStatus)}">${escapeHtml(s.InviteStatus)}</span>` : ''}
        ${s.InviteStatus === 'Pending Invite' ? `
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn small" onclick="copyInviteLink('${s.InviteToken}')">Copy link</button>
            <button class="btn small secondary" onclick="regenerateInvite('${s.ECCode}')">Regenerate</button>
          </div>` : ''}
        ${s.InviteStatus === 'Claimed' ? `
          <div style="margin-top:8px;">
            <button class="btn small secondary" onclick="regenerateInvite('${s.ECCode}')">Reassign / new link</button>
          </div>` : ''}
      </div>
    </div>
  `).join('');
}

/* ===================== AGENTS ===================== */
function renderAdminAgents() {
  const container = document.getElementById('adminAgentsList');
  if (adminAgentsCache.length === 0) { container.innerHTML = emptyState('No agents yet.'); return; }
  const topLevel = adminAgentsCache.filter(a => !a.ParentAgentID);
  container.innerHTML = topLevel.map(a => {
    const subAgents = adminAgentsCache.filter(sa => String(sa.ParentAgentID) === String(a.AgentID));
    return `
    <div class="label-card">
      <div class="label-body" style="width:100%;">
        <div class="label-name">${escapeHtml(a.Name)} <span class="role-badge">${escapeHtml(a.Role || 'Agent')}</span></div>
        <div class="label-meta">${escapeHtml(a.AgentID)} · ${escapeHtml(a.ShopName || 'No shop')} ${a.ECCode ? '(EC ' + escapeHtml(String(a.ECCode)) + ')' : ''}</div>
        ${subAgents.length ? `<div class="label-meta">Sub-agents: ${subAgents.map(sa => escapeHtml(sa.Name)).join(', ')}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ===================== ADMIN USERS ===================== */
async function handleCreateAdmin(e) {
  e.preventDefault();
  try {
    await apiPost('createAdmin', {
      adminId: adminSession.adminId,
      name: document.getElementById('newAdminName').value,
      username: document.getElementById('newAdminUser').value,
      password: document.getElementById('newAdminPass').value
    });
    e.target.reset();
    alert('Admin user created.');
  } catch (err) { alert(err.message); }
  return false;
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
