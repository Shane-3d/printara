// ===== DB HELPERS (browser → Netlify Functions → MySQL) ======================
// All writes are fire-and-forget; localStorage stays the synchronous source of truth.

async function _dbGet(path) {
  try { const r = await fetch(path); return r.ok ? r.json() : null; } catch { return null; }
}
async function _dbPost(path, body) {
  try { await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch {}
}
async function _dbPut(path, body) {
  try { await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch {}
}
async function _dbDelete(path) {
  try { await fetch(path, { method: 'DELETE' }); } catch {}
}

// Pull all entities from MySQL in parallel and refresh localStorage caches.
async function syncAllFromDB() {
  try {
    const [users, orders, notifications, products] = await Promise.all([
      _dbGet('/.netlify/functions/accounts'),
      _dbGet('/.netlify/functions/orders'),
      _dbGet('/.netlify/functions/notifications'),
      _dbGet('/.netlify/functions/listings'),
    ]);
    if (Array.isArray(users)         && users.length)         localStorage.setItem('profab_users',         JSON.stringify(users));
    if (Array.isArray(orders)        && orders.length)        localStorage.setItem('profab_orders',        JSON.stringify(orders));
    if (Array.isArray(notifications) && notifications.length) localStorage.setItem('profab_notifications', JSON.stringify(notifications));
    if (Array.isArray(products)      && products.length)      localStorage.setItem('profab_products',      JSON.stringify(products));
  } catch { /* DB unavailable — continue with cached data */ }
}

// ===== USER AUTH =====
function getUsers() {
  return JSON.parse(localStorage.getItem('profab_users') || '[]');
}
function saveUsers(u) {
  localStorage.setItem('profab_users', JSON.stringify(u));
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
  _dbPost('/.netlify/functions/accounts', user);
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
}
function addNotification(userId, type, orderId, message) {
  if (!userId) return;
  const notif = { id: 'notif-' + Date.now().toString(36), userId, type, orderId, message, date: new Date().toISOString(), read: false };
  const notifs = getNotifications();
  notifs.unshift(notif);
  saveNotifications(notifs);
  _dbPost('/.netlify/functions/notifications', notif);
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
  markAllNotifsRead(session.id);
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
}

// ===== LISTINGS DB SYNC =====
// Pulls listings from MySQL (via Netlify Function) and refreshes localStorage cache.
// Called once on page load; all synchronous getProducts() calls still read from cache.
async function syncListingsFromDB() {
  try {
    const res = await fetch('/.netlify/functions/listings');
    if (!res.ok) return;
    const products = await res.json();
    if (Array.isArray(products) && products.length > 0) {
      localStorage.setItem('profab_products', JSON.stringify(products));
    }
  } catch {
    // DB unavailable — continue with cached/localStorage data
  }
}

// Write a single product to MySQL.
async function dbUpsertProduct(product) {
  try {
    await fetch('/.netlify/functions/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
  } catch { /* non-fatal */ }
}

// Delete a single product from MySQL.
async function dbDeleteProduct(id) {
  try {
    await fetch(`/.netlify/functions/listings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch { /* non-fatal */ }
}

// Update a field on a product in MySQL.
async function dbUpdateProduct(patch) {
  try {
    await fetch('/.netlify/functions/listings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch { /* non-fatal */ }
}
function getOrders() {
  return JSON.parse(localStorage.getItem('profab_orders') || '[]');
}
function saveOrders(orders) {
  localStorage.setItem('profab_orders', JSON.stringify(orders));
}

function saveStripeKey() {
  const key = document.getElementById('stripeKeyInput')?.value.trim();
  if (!key || (!key.startsWith('pk_live_') && !key.startsWith('pk_test_'))) {
    showToast('Enter a valid Stripe publishable key (starts with pk_live_ or pk_test_).');
    return;
  }
  localStorage.setItem('profab_stripe_key', key);
  const saved = document.getElementById('stripeKeySaved');
  if (saved) { saved.style.display = 'block'; setTimeout(() => saved.style.display = 'none', 4000); }
}

async function manualSync() {
  showToast('Syncing…');
  await syncAllFromDB();
  if (typeof window['renderOrders'] === 'function') window['renderOrders']();
  if (typeof window['renderManage'] === 'function') window['renderManage']();
  renderProducts();
  showToast('Synced from database ✓');
}
function getCart() {
  return JSON.parse(localStorage.getItem('profab_cart') || '[]');
}
function saveCart(cart) {
  localStorage.setItem('profab_cart', JSON.stringify(cart));
}

// ===== SEED DEMO PRODUCTS =====
(function seedDemo() {
  // Only seed once — never re-seed if the user has deleted all products
  if (localStorage.getItem('profab_seed_done')) return;
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
  localStorage.setItem('profab_seed_done', '1');
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
  removeOrderPhoto({ stopPropagation: () => {} });
}

async function submitOrder(e) {
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
    photo: _orderPhotoData || null,
    paymentMethod: data.paymentMethod || 'cash',
    meritsTotal: Math.round(cartTotal() * 100),
    items: cart.map(item => {
      const p = products.find(p => p.id === item.productId);
      return { name: p ? p.name : item.productId, qty: item.qty, price: p ? effectivePrice(p) : 0, origPrice: p ? p.price : 0 };
    }),
    total: cartTotal()
  };

  // Card payment — run Stripe charge before saving the order
  if (data.paymentMethod === 'card') {
    const ok = await processCardPayment(order);
    if (!ok) return; // error already shown in card element
  }

  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  _dbPost('/.netlify/functions/orders', order);
  saveCart([]);
  updateCartUI();

  // Reset card element for next use
  if (_stripeCard) { _stripeCard.clear(); _stripeCardMounted = false; _stripeCard = null; }
  document.getElementById('stripeCardSection').style.display = 'none';
  const btn = document.getElementById('placeOrderBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Place Order →'; }

  removeOrderPhoto({ stopPropagation: () => {} });
  closeOrder();
  const payLabel = data.paymentMethod === 'merits'
    ? `Merits (${order.meritsTotal.toLocaleString()} merits)`
    : data.paymentMethod === 'card' ? 'Card (paid ✓)' : 'Cash';
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

let _orderPhotoData = null;

function handleOrderPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 1024;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      _orderPhotoData = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('orderPhotoPreview').src = _orderPhotoData;
      document.getElementById('orderPhotoPreview').style.display = 'block';
      document.getElementById('orderPhotoPlaceholder').style.display = 'none';
      document.getElementById('orderPhotoRemoveBtn').style.display = 'block';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removeOrderPhoto(e) {
  e.stopPropagation();
  _orderPhotoData = null;
  const inp = document.getElementById('orderPhotoInput');
  if (inp) inp.value = '';
  document.getElementById('orderPhotoPreview').style.display = 'none';
  document.getElementById('orderPhotoPreview').src = '';
  document.getElementById('orderPhotoPlaceholder').style.display = 'block';
  document.getElementById('orderPhotoRemoveBtn').style.display = 'none';
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
  _dbPost('/.netlify/functions/orders', request);

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

// ===== THEME & COLOR ENGINE =====
const THEME_DARK = {
  '--bg':'#0a0a0f','--bg2':'#111118','--bg3':'#16161f',
  '--surface':'#1a1a26','--surface2':'#22223a',
  '--border':'rgba(255,255,255,0.08)',
  '--text':'#f0f0f8','--text2':'#9090b0','--text3':'#606080',
  '--accent':'#7c6af7','--green':'#4caf82'
};
const THEME_LIGHT = {
  '--bg':'#f2f3f7','--bg2':'#e8eaf0','--bg3':'#dddfe8',
  '--surface':'#ffffff','--surface2':'#eceef5',
  '--border':'rgba(0,0,0,0.09)',
  '--text':'#18182e','--text2':'#52526e','--text3':'#9494b0',
  '--accent':'#7c6af7','--green':'#4caf82'
};

function _hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function _shift(hex, amt) {
  const cap = v => Math.min(255,Math.max(0,v));
  return '#' + _hexToRgb(hex).map(v => cap(v+amt).toString(16).padStart(2,'0')).join('');
}
function _hexAlpha(hex, a) {
  const [r,g,b] = _hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function _luminance(hex) {
  return _hexToRgb(hex).reduce((s,v) => s + v, 0) / 3;
}

function applyThemeVars(base, custom) {
  const root = document.documentElement;
  // Clear all inline overrides first
  Object.keys(THEME_DARK).forEach(p => root.style.removeProperty(p));
  root.style.removeProperty('--header-bg');
  // Apply base theme
  Object.entries(base).forEach(([p,v]) => root.style.setProperty(p, v));
  // Apply custom color overrides
  if (custom) {
    if (custom.bg) {
      root.style.setProperty('--bg', custom.bg);
      root.style.setProperty('--bg2', _shift(custom.bg, _luminance(custom.bg) > 128 ? -14 : 10));
      root.style.setProperty('--bg3', _shift(custom.bg, _luminance(custom.bg) > 128 ? -24 : 18));
    }
    if (custom.surface) {
      root.style.setProperty('--surface', custom.surface);
      root.style.setProperty('--surface2', _shift(custom.surface, _luminance(custom.surface) > 128 ? -12 : 14));
    }
    if (custom.text) {
      root.style.setProperty('--text', custom.text);
      const isLight = _luminance(custom.text) > 128;
      root.style.setProperty('--text2', _shift(custom.text, isLight ? -50 : 50));
      root.style.setProperty('--text3', _shift(custom.text, isLight ? -100 : 100));
    }
    if (custom.accent) root.style.setProperty('--accent', custom.accent);
  }
  // Always derive header-bg from current --bg
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg.startsWith('#')) root.style.setProperty('--header-bg', _hexAlpha(bg, 0.9));
  else root.style.setProperty('--header-bg', bg.replace(')',',0.9)').replace('rgb','rgba'));
}

function _getThemePreset() {
  return localStorage.getItem('profab_theme') === 'light' ? THEME_LIGHT : THEME_DARK;
}
function _getCustomColors() {
  try { return JSON.parse(localStorage.getItem('profab_colors') || 'null'); } catch { return null; }
}

function initTheme() {
  applyThemeVars(_getThemePreset(), _getCustomColors());
  _updateThemeUI();
}

function toggleTheme() {
  const isLight = localStorage.getItem('profab_theme') !== 'light';
  localStorage.setItem('profab_theme', isLight ? 'light' : 'dark');
  applyThemeVars(isLight ? THEME_LIGHT : THEME_DARK, _getCustomColors());
  _updateThemeUI();
  syncColorPickers();
}

function _updateThemeUI() {
  const isLight = localStorage.getItem('profab_theme') === 'light';
  const icon = isLight ? '☀️' : '🌙';
  ['themeToggleBtn','themeToggleSettings','shopThemeBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = id === 'themeToggleBtn' ? icon : (isLight ? '☀️ Light' : '🌙 Dark');
  });
}

function applyCustomColor(key, value) {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) return;
  const custom = _getCustomColors() || {};
  custom[key] = value;
  localStorage.setItem('profab_colors', JSON.stringify(custom));
  applyThemeVars(_getThemePreset(), custom);
  syncColorPickers();
}

function saveCustomColors() {
  const s = document.getElementById('colorStatus') || document.getElementById('shopColorStatus');
  if (s) { s.style.display = 'block'; setTimeout(() => s.style.display = 'none', 2000); }
  showToast('Colors saved ✓');
}

function resetCustomColors() {
  localStorage.removeItem('profab_colors');
  applyThemeVars(_getThemePreset(), null);
  syncColorPickers();
  showToast('Colors reset to default.');
}

function syncColorPickers() {
  const cs = getComputedStyle(document.documentElement);
  const get = p => cs.getPropertyValue(p).trim();
  [['colorBg','--bg'],['colorText','--text'],['colorAccent','--accent'],['colorSurface','--surface']].forEach(([id,prop]) => {
    const val = get(prop);
    if (!/^#[0-9a-fA-F]{6}$/i.test(val)) return;
    const picker = document.getElementById(id);
    const hexIn  = document.getElementById(id + 'Hex');
    if (picker) picker.value = val;
    if (hexIn)  hexIn.value  = val;
    // shop panel mirrors
    const sp = document.getElementById('shop' + id.charAt(0).toUpperCase() + id.slice(1));
    const sh = document.getElementById('shop' + id.charAt(0).toUpperCase() + id.slice(1) + 'Hex');
    if (sp) sp.value = val;
    if (sh) sh.value = val;
  });
  _updateThemeUI();
}

// Run immediately (before DOMContentLoaded) so there's no flash of wrong theme
initTheme();

// ===== SHOP SETTINGS PANEL =====
function openShopSettings() {
  syncColorPickers();
  const panel   = document.getElementById('shopSettingsPanel');
  const overlay = document.getElementById('shopSettingsOverlay');
  if (!panel) return;
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    panel.style.transform   = 'translateX(0)';
    overlay.style.opacity   = '1';
  });
  // sync account state
  const session = getUserSession();
  const loginBtn     = document.getElementById('shopSettingsLoginBtn');
  const logoutBtn    = document.getElementById('shopSettingsLogoutBtn');
  const userEl       = document.getElementById('shopSettingsUser');
  const ordersBtn    = document.getElementById('shopSettingsOrdersBtn');
  const notifBtn     = document.getElementById('settingsNotifBtn');
  if (loginBtn)  loginBtn.style.display  = session ? 'none'  : 'block';
  if (logoutBtn) logoutBtn.style.display = session ? 'block' : 'none';
  if (userEl)    { userEl.textContent = session ? `Signed in as ${session.name}` : ''; userEl.style.display = session ? 'block' : 'none'; }
  if (ordersBtn) ordersBtn.style.display = session ? 'block' : 'none';
  if (notifBtn)  notifBtn.style.display  = session ? 'flex'  : 'none';

  // populate cart count badge
  const cartCountEl = document.getElementById('settingsCartCount');
  if (cartCountEl) {
    const c = cartCount();
    cartCountEl.textContent = c > 0 ? `(${c})` : '';
  }

  // populate notification unread count
  const notifCountEl = document.getElementById('settingsNotifCount');
  if (notifCountEl && session) {
    const unread = getNotifications().filter(n => n.userId === session.id && !n.read).length;
    notifCountEl.textContent = unread > 0 ? `(${unread})` : '';
  } else if (notifCountEl) {
    notifCountEl.textContent = '';
  }
}
function closeShopSettings() {
  const panel   = document.getElementById('shopSettingsPanel');
  const overlay = document.getElementById('shopSettingsOverlay');
  if (!panel) return;
  panel.style.transform = 'translateX(100%)';
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.style.display = 'none'; }, 280);
}

// ===== STRIPE PAYMENTS =====
let _stripe = null;
let _stripeCard = null;
let _stripeCardMounted = false;

function getStripeKey() {
  return window.PROFAB_CONFIG?.stripeKey || localStorage.getItem('profab_stripe_key') || '';
}

function initStripe() {
  const key = getStripeKey();
  if (!key || !window.Stripe) return;
  _stripe = window.Stripe(key);
  // Show card option in payment methods
  const cardOption = document.getElementById('cardPaymentOption');
  if (cardOption) cardOption.style.display = '';
}

function onPaymentMethodChange() {
  const val = document.querySelector('input[name="paymentMethod"]:checked')?.value;
  const cardSection = document.getElementById('stripeCardSection');
  if (!cardSection) return;

  if (val === 'card') {
    cardSection.style.display = 'block';
    if (!_stripeCardMounted && _stripe) {
      const elements = _stripe.elements({
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6af7',
            colorBackground: getComputedStyle(document.documentElement).getPropertyValue('--surface2').trim() || '#1a1a26',
            colorText: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#f0f0f8',
            borderRadius: '8px',
          }
        }
      });
      _stripeCard = elements.create('card', { hidePostalCode: true });
      _stripeCard.mount('#stripeCardElement');
      _stripeCard.on('change', e => {
        const errEl = document.getElementById('stripeCardError');
        if (errEl) errEl.textContent = e.error ? e.error.message : '';
      });
      _stripeCardMounted = true;
    }
  } else {
    cardSection.style.display = 'none';
  }
  buildOrderSummary();
}

async function processCardPayment(order) {
  const btn = document.getElementById('placeOrderBtn');
  const errEl = document.getElementById('stripeCardError');
  btn.disabled = true;
  btn.textContent = 'Processing…';

  try {
    // Call serverless function to create PaymentIntent
    const res = await fetch('/.netlify/functions/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(order.total * 100), // cents
        currency: 'usd',
        orderId: order.id,
        customerName: order.customer.name,
        customerEmail: order.customer.email,
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Payment setup failed. Check your Stripe configuration.');
    }

    const { clientSecret } = await res.json();

    const result = await _stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: _stripeCard,
        billing_details: { name: order.customer.name, email: order.customer.email }
      }
    });

    if (result.error) {
      if (errEl) errEl.textContent = result.error.message;
      btn.disabled = false;
      btn.textContent = 'Place Order →';
      return false;
    }

    // Payment succeeded
    order.paymentMethod = 'card';
    order.stripePaymentId = result.paymentIntent.id;
    order.status = 'Paid';
    return true;

  } catch (err) {
    if (errEl) errEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Place Order →';
    return false;
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme(); // re-apply after DOM ready so UI buttons sync
  renderProducts(); // render immediately from localStorage — no wait
  updateCartUI();
  updateUserNav();
  initStripe();
  await syncAllFromDB(); // sync all entities from MySQL
  renderProducts();
  updateCartUI();
});
