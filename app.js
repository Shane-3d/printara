// ===== USER AUTH =====
function getUsers() {
  return JSON.parse(localStorage.getItem('profab_users') || '[]');
}
function saveUsers(u) {
  localStorage.setItem('profab_users', JSON.stringify(u));
  cloudPush();
}
function getUserSession() {
  return JSON.parse(localStorage.getItem('profab_user_session') || 'null');
}
function saveUserSession(u) { localStorage.setItem('profab_user_session', JSON.stringify(u)); }
function clearUserSession() { localStorage.removeItem('profab_user_session'); }

function hashPwd(pwd) { return btoa(encodeURIComponent(pwd)); }

function registerUser(e) {
  e.preventDefault();
  const form = e.target;
  const firstName = form.regFirstName.value.trim();
  const lastName  = form.regLastName.value.trim();
  const email     = form.regEmail.value.trim().toLowerCase();
  const pwd       = form.regPwd.value;
  const err       = document.getElementById('regError');

  const users = getUsers();
  if (users.find(u => u.email === email)) {
    err.textContent = 'An account with that email already exists.';
    err.classList.add('visible');
    return;
  }
  const profile = {
    firstName, lastName, email,
    phone: form.regPhone?.value.trim() || ''
  };
  const user = {
    id: 'usr-' + Date.now().toString(36),
    name: `${firstName} ${lastName}`,
    email, pwHash: hashPwd(pwd), profile,
    registeredAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  saveUserSession({ id: user.id, name: user.name, email: user.email });
  err.classList.remove('visible');
  closeAuth();
  updateUserNav();
  showToast(`Welcome, ${firstName}! ✓`);
}

function loginUser(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.loginEmail.value.trim().toLowerCase();
  const pwd = form.loginPwd.value;
  const err = document.getElementById('loginUserError');

  const user = getUsers().find(u => u.email === email && u.pwHash === hashPwd(pwd));
  if (!user) {
    err.textContent = 'Incorrect email or password.';
    err.classList.add('visible');
    setTimeout(() => err.classList.remove('visible'), 3000);
    return;
  }
  const session = { id: user.id, name: user.name, email: user.email };
  saveUserSession(session);
  err.classList.remove('visible');
  closeAuth();
  updateUserNav();
  showToast(`Welcome back, ${user.name}! ✓`);
}

function logoutUser() {
  clearUserSession();
  updateUserNav();
  showToast('Logged out.');
}

function updateUserNav() {
  let session = getUserSession();
  // If account was deleted by admin, clear the stale session
  if (session && !getUsers().find(u => u.id === session.id)) {
    clearUserSession();
    session = null;
  }
  const loginBtn = document.getElementById('navLoginBtn');
  const userBtn = document.getElementById('navUserBtn');
  const userNameEl = document.getElementById('navUserName');
  if (!loginBtn) return;
  if (session) {
    loginBtn.style.display = 'none';
    userBtn.style.display = 'flex';
    if (userNameEl) userNameEl.textContent = session.name;
  } else {
    loginBtn.style.display = 'flex';
    userBtn.style.display = 'none';
  }
  updateNotifBadge();
  // Sync sidebar account section
  const sidebarLogin = document.getElementById('sidebarLoginBtn');
  const sidebarUser  = document.getElementById('sidebarUserSection');
  const sidebarName  = document.getElementById('sidebarUserName');
  if (sidebarLogin) sidebarLogin.style.display = session ? 'none' : 'flex';
  if (sidebarUser)  sidebarUser.style.display  = session ? 'block' : 'none';
  if (sidebarName && session) sidebarName.textContent = session.name;
}

function openAuth(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('authModal').classList.add('open');
  document.getElementById('authOverlay').classList.add('open');
}
function closeAuth() {
  document.getElementById('authModal').classList.remove('open');
  document.getElementById('authOverlay').classList.remove('open');
}
function switchAuthTab(tab) {
  document.getElementById('authLoginPanel').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('authSignupPanel').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('authTabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authTabSignup').classList.toggle('active', tab === 'signup');
}

function openMyOrders() {
  const session = getUserSession();
  if (!session) { openAuth('login'); return; }
  renderMyOrders();
  document.getElementById('myOrdersModal').classList.add('open');
  document.getElementById('myOrdersOverlay').classList.add('open');
}
function closeMyOrders() {
  document.getElementById('myOrdersModal').classList.remove('open');
  document.getElementById('myOrdersOverlay').classList.remove('open');
}

function renderMyOrders() {
  const session = getUserSession();
  const el = document.getElementById('myOrdersList');
  if (!el || !session) return;
  const orders = getOrders().filter(o => o.userId === session.id);
  if (orders.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:40px 0;"><div class="empty-icon">📋</div><h3>No orders yet</h3><p>Your orders will appear here once you place one.</p></div>';
    return;
  }
  el.innerHTML = orders.map(o => {
    const date = new Date(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const isMerits = o.paymentMethod === 'merits';
    const totalDisplay = isMerits ? `${(o.meritsTotal || Math.round(o.total * 100)).toLocaleString()} merits` : `$${Number(o.total).toFixed(2)}`;
    const statusClass = o.status === 'Complete' ? 'status--complete' : o.status === 'Rejected' ? 'status--rejected' : 'status--new';
    const itemSummary = o.items.map(i => `${i.name} ×${i.qty}`).join(', ');
    return `
      <div class="my-order-card">
        <div class="my-order-header">
          <span class="my-order-id">${o.id}</span>
          <span class="order-status-badge ${statusClass}">${o.status}</span>
        </div>
        <div class="my-order-date">${date}</div>
        <div class="my-order-items">${itemSummary}</div>
        <div class="my-order-footer">
          <span class="my-order-total">${totalDisplay}</span>
          <span class="my-order-pay">${isMerits ? '⭐ Merits' : '💵 Cash'}</span>
        </div>
      </div>`;
  }).join('');
}

// ===== NOTIFICATIONS =====
function getNotifications() {
  return JSON.parse(localStorage.getItem('profab_notifications') || '[]');
}
function saveNotifications(n) {
  localStorage.setItem('profab_notifications', JSON.stringify(n));
  cloudPush();
}
function addNotification(userId, type, orderId, message) {
  if (!userId) return;
  const notifs = getNotifications();
  notifs.unshift({ id: 'notif-' + Date.now().toString(36), userId, type, orderId, message, date: new Date().toISOString(), read: false });
  saveNotifications(notifs);
}
function updateNotifBadge() {
  const session = getUserSession();
  const bell = document.getElementById('notifBellBtn');
  const badge = document.getElementById('notifBadge');
  if (!bell) return;
  if (!session) { bell.style.display = 'none'; return; }
  const count = getNotifications().filter(n => n.userId === session.id && !n.read).length;
  bell.style.display = 'inline-flex';
  if (badge) {
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}
function openNotifications() {
  const session = getUserSession();
  if (!session) { openAuth('login'); return; }
  renderNotifications();
  document.getElementById('notifModal').classList.add('open');
  document.getElementById('notifOverlay').classList.add('open');
  // Pull latest from cloud then re-render
  cloudPull().then(() => {
    renderNotifications();
    markAllNotifsRead(session.id);
  });
}
function closeNotifications() {
  document.getElementById('notifModal')?.classList.remove('open');
  document.getElementById('notifOverlay')?.classList.remove('open');
  updateNotifBadge();
}
function markAllNotifsRead(userId) {
  const notifs = getNotifications();
  let changed = false;
  notifs.forEach(n => { if (n.userId === userId && !n.read) { n.read = true; changed = true; } });
  if (changed) saveNotifications(notifs);
}
function renderNotifications() {
  const session = getUserSession();
  const el = document.getElementById('notifList');
  if (!el || !session) return;
  const notifs = getNotifications().filter(n => n.userId === session.id);
  if (notifs.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--text3);">No notifications yet.</div>';
    return;
  }
  el.innerHTML = notifs.map(n => {
    const date = new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const isRejected = n.type === 'custom_rejected';
    const icon = isRejected ? '✕' : '✓';
    const colorClass = isRejected ? 'notif--rejected' : 'notif--complete';
    return `
      <div class="notif-item ${colorClass}${n.read ? ' notif--read' : ''}">
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          <div class="notif-msg">${n.message}</div>
          <div class="notif-date">${date}</div>
        </div>
      </div>`;
  }).join('');
}

// ===== DATA LAYER =====
function getProducts() {
  return JSON.parse(localStorage.getItem('profab_products') || '[]');
}
function saveProducts(products) {
  localStorage.setItem('profab_products', JSON.stringify(products));
  cloudPush();
}
function getOrders() {
  return JSON.parse(localStorage.getItem('profab_orders') || '[]');
}
function saveOrders(orders) {
  localStorage.setItem('profab_orders', JSON.stringify(orders));
  cloudPush();
}

// ===== CLOUD SYNC (JSONBin.io) =====
function getCloudConfig() {
  const cfg = window.PROFAB_CONFIG || {};
  return {
    key: cfg.cloudKey || localStorage.getItem('profab_cloud_key') || '',
    bin: cfg.cloudBin || localStorage.getItem('profab_cloud_bin') || ''
  };
}
function saveCloudConfig(key, bin) {
  localStorage.setItem('profab_cloud_key', key.trim());
  localStorage.setItem('profab_cloud_bin', bin.trim());
  // Also update the in-memory config so it takes effect immediately
  if (window.PROFAB_CONFIG) {
    window.PROFAB_CONFIG.cloudKey = key.trim();
    window.PROFAB_CONFIG.cloudBin = bin.trim();
  }
}

let _pushTimer = null;
function cloudPush() {
  // Debounce — wait 800ms after last save before pushing
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(async () => {
    const { key, bin } = getCloudConfig();
    if (!key || !bin) return;
    try {
      await fetch(`https://api.jsonbin.io/v3/b/${bin}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
        body: JSON.stringify({
          orders: getOrders(),
          products: getProducts(),
          users: getUsers(),
          ci_sessions: JSON.parse(localStorage.getItem('profab_ci_sessions') || '[]'),
          ci_active: JSON.parse(localStorage.getItem('profab_ci_active') || 'null'),
          notifications: getNotifications()
        })
      });
      setSyncStatus('Synced ✓', 'ok');
    } catch {
      setSyncStatus('Sync failed', 'err');
    }
  }, 800);
}

async function cloudPull() {
  const { key, bin } = getCloudConfig();
  if (!key || !bin) return false;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${bin}/latest`, {
      headers: { 'X-Master-Key': key }
    });
    if (!res.ok) return false;
    const { record } = await res.json();
    if (record.orders)      localStorage.setItem('profab_orders',      JSON.stringify(record.orders));
    if (record.products)    localStorage.setItem('profab_products',    JSON.stringify(record.products));
    if (record.users)       localStorage.setItem('profab_users',       JSON.stringify(record.users));
    if (record.ci_sessions) localStorage.setItem('profab_ci_sessions', JSON.stringify(record.ci_sessions));
    if (record.ci_active !== undefined) {
      if (record.ci_active) localStorage.setItem('profab_ci_active', JSON.stringify(record.ci_active));
      else localStorage.removeItem('profab_ci_active');
    }
    if (record.notifications) localStorage.setItem('profab_notifications', JSON.stringify(record.notifications));
    setSyncStatus('Synced ✓', 'ok');
    return true;
  } catch {
    setSyncStatus('Sync failed', 'err');
    return false;
  }
}

async function createNewBin() {
  const key = document.getElementById('cloudKeyInput')?.value.trim();
  if (!key) { setSyncStatus('Enter your API key first.', 'err'); return; }
  setSyncStatus('Creating bin…', '');
  try {
    const res = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': key,
        'X-Bin-Name': 'Pro-Fab 3D',
        'X-Bin-Private': 'true'
      },
      body: JSON.stringify({
          orders: getOrders(),
          products: getProducts(),
          users: getUsers(),
          ci_sessions: JSON.parse(localStorage.getItem('profab_ci_sessions') || '[]'),
          ci_active: JSON.parse(localStorage.getItem('profab_ci_active') || 'null'),
          notifications: getNotifications()
        })
    });
    if (!res.ok) { setSyncStatus('Invalid API key.', 'err'); return; }
    const { metadata } = await res.json();
    document.getElementById('cloudBinInput').value = metadata.id;
    saveCloudConfig(key, metadata.id);
    setSyncStatus('Bin created & synced ✓', 'ok');
    updateSyncBadge();
  } catch {
    setSyncStatus('Could not reach JSONBin.', 'err');
  }
}

async function saveCloudSettings() {
  const key = document.getElementById('cloudKeyInput')?.value.trim();
  const bin = document.getElementById('cloudBinInput')?.value.trim();
  if (!key || !bin) { setSyncStatus('Both fields are required.', 'err'); return; }
  saveCloudConfig(key, bin);
  setSyncStatus('Connecting…', '');
  const ok = await cloudPull();
  if (ok) {
    updateSyncBadge();
    if (typeof window['renderOrders'] === 'function') window['renderOrders']();
    showToast('Cloud sync enabled ✓');
  } else {
    setSyncStatus('Connection failed — check key & bin ID.', 'err');
  }
}

async function manualSync() {
  setSyncStatus('Syncing…', '');
  const ok = await cloudPull();
  if (ok) {
    if (typeof window['renderOrders'] === 'function') window['renderOrders']();
    if (typeof window['renderManage'] === 'function') window['renderManage']();
    renderProducts();
    showToast('Synced from cloud ✓');
  }
}

function setSyncStatus(msg, type) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'sync-status' + (type === 'ok' ? ' sync-ok' : type === 'err' ? ' sync-err' : '');
}

function updateSyncBadge() {
  const { key, bin } = getCloudConfig();
  const active = !!(key && bin);
  const badge = document.getElementById('syncBadge');
  if (badge) badge.style.display = active ? 'inline-block' : 'none';
  const keyEl = document.getElementById('cloudKeyInput');
  const binEl = document.getElementById('cloudBinInput');
  if (keyEl) keyEl.value = key;
  if (binEl) binEl.value = bin;
  // Show hint if credentials are in config.js (not just localStorage)
  const fromConfig = !!(window.PROFAB_CONFIG?.cloudKey && window.PROFAB_CONFIG?.cloudBin);
  const hint = document.getElementById('configHint');
  const steps = document.getElementById('configSteps');
  if (hint)  hint.style.display  = fromConfig ? 'block' : 'none';
  if (steps) steps.style.display = fromConfig ? 'none'  : 'block';
}
function getCart() {
  return JSON.parse(localStorage.getItem('profab_cart') || '[]');
}
function saveCart(cart) {
  localStorage.setItem('profab_cart', JSON.stringify(cart));
}

// ===== SEED DEMO PRODUCTS =====
(function seedDemo() {
  if (getProducts().length === 0) {
    const demo = [
      {
        id: 'demo1',
        name: 'Cable Management Clip',
        category: 'Organization',
        price: 4.99,
        description: 'Snap-on cable clips that keep your desk tidy. Works with cables up to 8mm diameter. Designed to mount under desks or on walls.',
        material: 'PLA',
        printTime: '~45 min',
        dimensions: '25 × 15 × 10 mm',
        image: '',
        emoji: '🖇️',
        inStock: true
      },
      {
        id: 'demo2',
        name: 'Parametric Phone Stand',
        category: 'Desk Accessories',
        price: 12.99,
        description: 'Adjustable phone stand that holds any smartphone at the perfect viewing angle. Non-slip base included.',
        material: 'PETG',
        printTime: '~2.5 hrs',
        dimensions: '90 × 75 × 50 mm',
        image: '',
        emoji: '📱',
        inStock: true
      },
      {
        id: 'demo3',
        name: 'Modular Wall Hook',
        category: 'Home',
        price: 7.50,
        description: 'Minimalist wall hook that mounts flush to the wall. Holds up to 5 lbs. Available in sets of 3.',
        material: 'PLA',
        printTime: '~1.5 hrs',
        dimensions: '60 × 30 × 20 mm',
        image: '',
        emoji: '🪝',
        inStock: true
      }
    ];
    saveProducts(demo);
  }
})();

// ===== CART =====
function addToCart(productId, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.productId === productId);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ productId, qty });
  }
  saveCart(cart);
  updateCartUI();
  showToast('Added to cart ✓');
}

function removeFromCart(productId) {
  const cart = getCart().filter(i => i.productId !== productId);
  saveCart(cart);
  updateCartUI();
  renderCartDrawer();
}

function setCartQty(productId, qty) {
  const cart = getCart();
  const item = cart.find(i => i.productId === productId);
  if (item) {
    item.qty = Math.max(1, qty);
    saveCart(cart);
    updateCartUI();
    renderCartDrawer();
  }
}

function cartTotal() {
  const cart = getCart();
  const products = getProducts();
  return cart.reduce((sum, item) => {
    const p = products.find(p => p.id === item.productId);
    return sum + (p ? effectivePrice(p) * item.qty : 0);
  }, 0);
}

function cartCount() {
  return getCart().reduce((s, i) => s + i.qty, 0);
}

function updateCartUI() {
  const el = document.getElementById('cartCount');
  if (el) el.textContent = cartCount();
}

function renderCartDrawer() {
  const el = document.getElementById('cartItems');
  if (!el) return;
  const cart = getCart();
  const products = getProducts();

  if (cart.length === 0) {
    el.innerHTML = '<div class="cart-empty-msg">Your cart is empty</div>';
    document.getElementById('cartTotal').textContent = '$0.00';
    return;
  }

  el.innerHTML = cart.map(item => {
    const p = products.find(p => p.id === item.productId);
    if (!p) return '';
    const imgHtml = p.image
      ? `<img src="${p.image}" class="cart-item-img" alt="${p.name}" />`
      : `<div class="cart-item-img">${p.emoji || '📦'}</div>`;
    const ep = effectivePrice(p);
    const priceHtml = isOnSale(p)
      ? `<span class="price-was">$${(p.price * item.qty).toFixed(2)}</span><span class="price-sale">$${(ep * item.qty).toFixed(2)}</span>`
      : `$${(ep * item.qty).toFixed(2)}`;
    return `
      <div class="cart-item">
        ${imgHtml}
        <div class="cart-item-info">
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-price">${priceHtml}</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="setCartQty('${p.id}', ${item.qty - 1})">−</button>
          <span class="qty-display">${item.qty}</span>
          <button class="qty-btn" onclick="setCartQty('${p.id}', ${item.qty + 1})">+</button>
          <button class="remove-btn" onclick="removeFromCart('${p.id}')" title="Remove">✕</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('cartTotal').textContent = `$${cartTotal().toFixed(2)}`;
}

// ===== CART DRAWER TOGGLE =====
function toggleCart() {
  document.getElementById('cartDrawer').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
  renderCartDrawer();
}

// ===== SALE HELPERS =====
function effectivePrice(p) {
  return (p.salePrice != null && p.salePrice < p.price) ? p.salePrice : p.price;
}
function isOnSale(p) {
  return p.salePrice != null && p.salePrice < p.price;
}

// ===== PRODUCT GRID =====
function renderProducts() {
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');
  if (!grid) return;
  const products = getProducts().filter(p => p.inStock);

  if (products.length === 0) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  grid.style.display = 'grid';
  if (empty) empty.style.display = 'none';

  grid.innerHTML = products.map(p => {
    const imgHtml = p.image
      ? `<img src="${p.image}" class="product-img" alt="${p.name}" />`
      : `<div class="product-img-placeholder">${p.emoji || '📦'}</div>`;
    const sale    = isOnSale(p);
    const effPrice = effectivePrice(p);
    const merits  = Math.round(effPrice * 100).toLocaleString();
    const pctOff  = sale ? Math.round((1 - effPrice / p.price) * 100) : 0;
    const priceHtml = sale
      ? `<div class="product-price">
           <span class="price-was">$${Number(p.price).toFixed(2)}</span>
           <span class="price-sale">$${Number(effPrice).toFixed(2)}</span>
           <span class="price-merits">${merits} merits</span>
         </div>`
      : `<div class="product-price">
           $${Number(p.price).toFixed(2)}
           <span class="price-merits">${merits} merits</span>
         </div>`;
    return `
      <div class="product-card${sale ? ' product-card--sale' : ''}" onclick="openModal('${p.id}')">
        ${sale ? `<div class="sale-badge">${pctOff}% OFF</div>` : ''}
        ${imgHtml}
        <div class="product-body">
          <div class="product-category">${p.category}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description}</div>
          <div class="product-footer">
            ${priceHtml}
            <button class="add-btn" onclick="event.stopPropagation(); addToCart('${p.id}')">+ Add</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ===== PRODUCT MODAL =====
function openModal(productId) {
  const p = getProducts().find(p => p.id === productId);
  if (!p) return;

  const imgHtml = p.image
    ? `<img src="${p.image}" class="modal-product-img" alt="${p.name}" />`
    : `<div class="modal-product-placeholder">${p.emoji || '📦'}</div>`;

  document.getElementById('modalContent').innerHTML = `
    ${imgHtml}
    <div class="modal-category">${p.category}</div>
    <div class="modal-name">${p.name}</div>
    <div class="modal-desc">${p.description}</div>
    <div class="modal-price">
      ${isOnSale(p)
        ? `<span class="price-was">$${Number(p.price).toFixed(2)}</span>
           <span class="price-sale">$${Number(effectivePrice(p)).toFixed(2)}</span>
           <span class="sale-badge sale-badge--inline">${Math.round((1-effectivePrice(p)/p.price)*100)}% OFF</span>`
        : `$${Number(p.price).toFixed(2)}`}
      <span class="modal-price-merits">${Math.round(effectivePrice(p) * 100).toLocaleString()} merits</span>
    </div>
    <div class="modal-meta">
      ${p.material ? `<span class="meta-tag">🧱 ${p.material}</span>` : ''}
      ${p.printTime ? `<span class="meta-tag">⏱️ ${p.printTime}</span>` : ''}
      ${p.dimensions ? `<span class="meta-tag">📐 ${p.dimensions}</span>` : ''}
    </div>
    <div class="modal-qty">
      <label>Qty:</label>
      <input type="number" class="modal-qty-input" id="modalQty" value="1" min="1" max="99" />
    </div>
    <button class="btn-primary btn-full" onclick="addToCart('${p.id}', parseInt(document.getElementById('modalQty').value) || 1); closeModal();">
      Add to Cart
    </button>`;

  document.getElementById('productModal').classList.add('open');
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('productModal').classList.remove('open');
  document.getElementById('modalOverlay').classList.remove('open');
}

// ===== CHECKOUT =====
function checkout() {
  if (getCart().length === 0) return;
  const session = getUserSession();
  if (!session) {
    toggleCart();
    openAuth('login');
    return;
  }
  toggleCart();
  const user = getUsers().find(u => u.id === session.id);
  const pro = user?.profile || {};
  const addrEl = document.getElementById('confirmAddress');
  if (addrEl) {
    addrEl.innerHTML = `
      <div class="confirm-ship-block">
        <div class="confirm-ship-label">Ordering as</div>
        <div class="confirm-ship-info">
          <strong>${pro.firstName || session.name} ${pro.lastName || ''}</strong><br/>
          ${pro.email || session.email}
          ${pro.phone ? ` · ${pro.phone}` : ''}
        </div>
      </div>`;
  }
  buildOrderSummary();
  document.getElementById('orderModal').classList.add('open');
  document.getElementById('orderOverlay').classList.add('open');
}

function buildOrderSummary() {
  const cart = getCart();
  const products = getProducts();
  const el = document.getElementById('orderSummary');
  if (!el) return;

  const isMerits = document.querySelector('input[name="paymentMethod"]:checked')?.value === 'merits';
  const total = cartTotal();
  const meritsTotal = Math.round(total * 100);

  const lines = cart.map(item => {
    const p = products.find(p => p.id === item.productId);
    if (!p) return '';
    const lineTotal = p.price * item.qty;
    const amountDisplay = isMerits
      ? `${Math.round(lineTotal * 100).toLocaleString()} merits`
      : `$${lineTotal.toFixed(2)}`;
    return `<div class="order-line"><span>${p.name} × ${item.qty}</span><span>${amountDisplay}</span></div>`;
  }).join('');

  const totalDisplay = isMerits
    ? `${meritsTotal.toLocaleString()} merits`
    : `$${total.toFixed(2)}`;

  el.innerHTML = `
    <div class="order-summary-title">Order Summary</div>
    ${lines}
    ${isMerits ? `<div class="order-line merits-rate-note"><span>Rate</span><span>$1.00 = 100 merits</span></div>` : ''}
    <div class="order-line order-line-total"><span>Total</span><span>${totalDisplay}</span></div>`;
}

function closeOrder() {
  document.getElementById('orderModal').classList.remove('open');
  document.getElementById('orderOverlay').classList.remove('open');
}

function submitOrder(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const session = getUserSession();
  if (!session) { closeOrder(); openAuth('login'); return; }

  const user = getUsers().find(u => u.id === session.id);
  const pro = user?.profile || {};
  const cart = getCart();
  const products = getProducts();

  const order = {
    id: 'ORD-' + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    status: 'New',
    customer: {
      name:  pro.firstName ? `${pro.firstName} ${pro.lastName}` : session.name,
      email: pro.email || session.email,
      phone: pro.phone || ''
    },
    userId: session.id,
    notes: data.notes || '',
    paymentMethod: data.paymentMethod || 'cash',
    meritsTotal: Math.round(cartTotal() * 100),
    items: cart.map(item => {
      const p = products.find(p => p.id === item.productId);
      return { name: p ? p.name : item.productId, qty: item.qty, price: p ? effectivePrice(p) : 0, origPrice: p ? p.price : 0 };
    }),
    total: cartTotal()
  };

  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  saveCart([]);
  updateCartUI();

  closeOrder();
  const payLabel = data.paymentMethod === 'merits'
    ? `Merits (${order.meritsTotal.toLocaleString()} merits)`
    : 'Cash';
  document.getElementById('successMsg').textContent =
    `Order ${order.id} placed! Payment: ${payLabel}. We'll reach out to ${order.customer.email} to confirm.`;
  document.getElementById('successModal').classList.add('open');
  document.getElementById('successOverlay').classList.add('open');
  form.reset();
}

function closeSuccess() {
  document.getElementById('successModal').classList.remove('open');
  document.getElementById('successOverlay').classList.remove('open');
}

// ===== CUSTOM ORDERS =====
function openCustomOrder() {
  const session = getUserSession();
  if (!session) {
    openAuth('login');
    return;
  }
  document.getElementById('customModal').classList.add('open');
  document.getElementById('customOverlay').classList.add('open');
}

function closeCustomOrder() {
  document.getElementById('customModal')?.classList.remove('open');
  document.getElementById('customOverlay')?.classList.remove('open');
}

let _customPhotoData = null;

function handleCustomPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    _customPhotoData = ev.target.result;
    const preview = document.getElementById('customPhotoPreview');
    const placeholder = document.getElementById('photoPlaceholder');
    const removeBtn = document.getElementById('photoRemoveBtn');
    preview.src = _customPhotoData;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeCustomPhoto(e) {
  e.stopPropagation();
  _customPhotoData = null;
  document.getElementById('customPhotoInput').value = '';
  document.getElementById('customPhotoPreview').style.display = 'none';
  document.getElementById('customPhotoPreview').src = '';
  document.getElementById('photoPlaceholder').style.display = 'block';
  document.getElementById('photoRemoveBtn').style.display = 'none';
}

function submitCustomOrder(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const session = getUserSession();
  if (!session) { closeCustomOrder(); openAuth('login'); return; }

  const user = getUsers().find(u => u.id === session.id);
  const pro = user?.profile || {};

  const request = {
    id: 'CUS-' + Date.now().toString(36).toUpperCase(),
    type: 'custom',
    date: new Date().toISOString(),
    status: 'New',
    customer: {
      name:  pro.firstName ? `${pro.firstName} ${pro.lastName}` : session.name,
      email: pro.email || session.email,
      phone: pro.phone || ''
    },
    userId: session.id,
    description: data.description,
    paymentMethod: data.paymentMethod || 'cash',
    photo: _customPhotoData || null
  };

  const orders = getOrders();
  orders.unshift(request);
  saveOrders(orders);

  closeCustomOrder();
  form.reset();
  removeCustomPhoto({ stopPropagation: () => {} });
  document.getElementById('successMsg').textContent =
    `Custom request ${request.id} submitted! We'll review your description and reach out to ${request.customer.email} with a quote.`;
  document.getElementById('successModal').classList.add('open');
  document.getElementById('successOverlay').classList.add('open');
}

// ===== RECEIPT =====
function printLastReceipt() {
  const orders = getOrders();
  if (orders.length === 0) return;
  printReceipt(orders[0]);
}

function printReceipt(order) {
  const isMerits = order.paymentMethod === 'merits';
  const payLabel = isMerits ? 'Merits' : 'Cash';
  const meritsTotal = order.meritsTotal || Math.round(order.total * 100);
  const logoUrl = new URL('Pro-Fab 3d logo.jpg', window.location.href).href;

  const date = new Date(order.date).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const itemRows = order.items.map(i => {
    const lineTotal = i.price * i.qty;
    const amountDisplay = isMerits
      ? `${Math.round(lineTotal * 100).toLocaleString()} merits`
      : `$${lineTotal.toFixed(2)}`;
    return `
    <tr>
      <td>${i.name}</td>
      <td style="text-align:center;">${i.qty}</td>
      <td style="text-align:right;">${amountDisplay}</td>
    </tr>`;
  }).join('');

  const totalDisplay = isMerits
    ? `${meritsTotal.toLocaleString()} merits`
    : `$${Number(order.total).toFixed(2)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt — ${order.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #111;
      background: #fff;
      padding: 40px;
      max-width: 680px;
      margin: 0 auto;
    }
    .receipt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #1a3a6e;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .receipt-header img { height: 70px; width: auto; }
    .receipt-header-right { text-align: right; }
    .receipt-header-right h1 {
      font-size: 26px; font-weight: 800; color: #1a3a6e; letter-spacing: 1px;
    }
    .receipt-header-right .order-id { font-size: 13px; color: #555; margin-top: 4px; }
    .receipt-header-right .order-date { font-size: 12px; color: #888; margin-top: 2px; }
    .section-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 1px; color: #888; margin-bottom: 6px;
    }
    .customer-block {
      background: #f5f7fa; border-radius: 8px;
      padding: 16px 20px; margin-bottom: 24px;
    }
    .customer-block p { font-size: 14px; line-height: 1.7; color: #222; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead tr { background: #1a3a6e; color: #fff; }
    thead th {
      padding: 10px 12px; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    thead th:last-child { text-align: right; }
    thead th:nth-child(2) { text-align: center; }
    tbody tr { border-bottom: 1px solid #e8e8e8; }
    tbody tr:last-child { border-bottom: none; }
    tbody td { padding: 11px 12px; font-size: 14px; color: #222; }
    .totals-block { border-top: 2px solid #1a3a6e; margin-top: 0; padding-top: 12px; }
    .payment-row {
      display: flex; justify-content: space-between;
      font-size: 13px; color: #555; padding: 4px 12px;
    }
    .rate-row {
      display: flex; justify-content: space-between;
      font-size: 12px; color: #999; padding: 2px 12px; font-style: italic;
    }
    .total-row {
      display: flex; justify-content: space-between;
      font-size: 22px; font-weight: 800; color: #1a3a6e; padding: 8px 12px 4px;
    }
    .merits-badge {
      display: inline-block; background: #fff8e1; color: #b8860b;
      border: 1px solid #f0c030; border-radius: 4px;
      padding: 1px 8px; font-size: 12px; font-weight: 700; margin-left: 6px;
    }
    .notes-block {
      margin-top: 20px; border-left: 3px solid #1a3a6e;
      padding: 10px 14px; background: #f5f7fa;
      font-size: 13px; color: #444; border-radius: 0 6px 6px 0;
    }
    .footer-block {
      margin-top: 36px; padding-top: 16px;
      border-top: 1px solid #ddd; text-align: center;
      font-size: 12px; color: #aaa;
    }
    @media print {
      body { padding: 20px; }
      @page { size: letter; margin: 0.6in; }
    }
  </style>
</head>
<body>
  <div class="receipt-header">
    <img src="${logoUrl}" alt="Pro-Fab 3D" />
    <div class="receipt-header-right">
      <h1>ORDER RECEIPT</h1>
      <div class="order-id">${order.id}</div>
      <div class="order-date">${date}</div>
    </div>
  </div>

  <div class="section-label">Customer</div>
  <div class="customer-block">
    <p>
      <strong>${order.customer.name}</strong><br/>
      ${order.customer.email}${order.customer.phone ? '<br/>' + order.customer.phone : ''}
    </p>
  </div>

  <div class="section-label" style="margin-bottom:0;">Items</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Product</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">${isMerits ? 'Merits' : 'Amount'}</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-block">
    <div class="payment-row">
      <span>Payment Method</span>
      <span>${payLabel}${isMerits ? '<span class="merits-badge">1 USD = 100 merits</span>' : ''}</span>
    </div>
    ${isMerits ? `<div class="rate-row"><span>Dollar equivalent</span><span>$${Number(order.total).toFixed(2)}</span></div>` : ''}
    <div class="total-row"><span>Total</span><span>${totalDisplay}</span></div>
  </div>

  ${order.notes ? `<div class="notes-block"><strong>Notes:</strong> ${order.notes}</div>` : ''}

  <div class="footer-block">
    Thank you for your order! Reference order <strong>${order.id}</strong> for any questions.<br/>
    Pro-Fab 3D — Custom 3D Printed Products
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=780,height=960');
  win.addEventListener('load', () => {
    win.print();
    URL.revokeObjectURL(url);
  });
}

// ===== TOAST =====
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(80px);
      background:#4caf82; color:#fff; padding:10px 20px; border-radius:10px;
      font-weight:600; font-size:14px; z-index:9999; transition:transform .3s;
      box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(80px)'; }, 2200);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await cloudPull();
  renderProducts();
  updateCartUI();
  updateUserNav();
});
