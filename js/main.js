(function () {
  const STORAGE_KEYS = {
    cart: "freshmart_cart_v5",
    favorites: "freshmart_favorites_v5",
    theme: "freshmart_theme_v5",
    recent: "freshmart_recent_v5",
    ratings: "freshmart_ratings_v5",
    catalog: "freshmart_catalog_v5",
    coupon: "freshmart_coupon_v5"
  };
  const SESSION_KEYS = {
    catalog: "freshmart_catalog_session_v1"
  };

  const COUPONS = {
    SAVE10: { type: "percent", value: 10, min: 20, label: "10% off orders above $20" },
    FRESH5: { type: "flat", value: 5, min: 35, label: "$5 off orders above $35" },
    FREESHIP: { type: "ship", value: 100, min: 15, label: "Free delivery above $15" }
  };

  const CATEGORY_LABELS = {
    fruit: "Fruits",
    veg: "Vegetables",
    dairy: "Dairy",
    bakery: "Bakery",
    drink: "Drinks",
    snack: "Snacks"
  };

  const CATEGORY_ORDER = ["all", "fruit", "veg", "dairy", "bakery", "drink", "snack"];

  const state = {
    catalog: null,
    cartSubscription: null,
    productSubscription: null,
    syncingCart: false,
    cartSyncTimer: null,
    globalEventsBound: false,
    headerEventsBound: false
  };

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function saveSessionJSON(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function loadSessionJSON(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeImagePath(path) {
    if (!path) return "assets/images/ax-logo.png";
    if (path.startsWith("assets/")) return path;
    if (path.startsWith("images/")) return path.replace(/^images\//, "assets/images/");
    return path;
  }

  function normalizeCatalog(products) {
    return products.map((product, index) => ({
      ...product,
      id: String(product.id),
      image: normalizeImagePath(product.image),
      imageFocus: product.imageFocus || { scale: 1.14, position: "center" },
      reviews: Array.isArray(product.reviews) ? product.reviews : [],
      createdAt: product.createdAt || Date.now() - index * 1000
    }));
  }

  async function loadCatalog() {
    if (state.catalog) return state.catalog;

    const sessionCatalog = loadSessionJSON(SESSION_KEYS.catalog, null);
    if (sessionCatalog && Array.isArray(sessionCatalog) && sessionCatalog.length) {
      state.catalog = normalizeCatalog(sessionCatalog);
      return state.catalog;
    }

    const override = loadJSON(STORAGE_KEYS.catalog, null);
    if (override && Array.isArray(override) && override.length) {
      state.catalog = normalizeCatalog(override);
      return state.catalog;
    }

    const firebase = getFirebase();
    if (firebase) {
      const products = await firebase.fetchProducts();
      if (products.length) {
        state.catalog = normalizeCatalog(products);
        saveJSON(STORAGE_KEYS.catalog, state.catalog);
        saveSessionJSON(SESSION_KEYS.catalog, state.catalog);
        return state.catalog;
      }
    }

    const response = await fetch("data/products.json");
    const products = await response.json();
    state.catalog = normalizeCatalog(products);
    saveSessionJSON(SESSION_KEYS.catalog, state.catalog);
    return state.catalog;
  }

  function persistCatalog(products) {
    state.catalog = normalizeCatalog(products);
    saveJSON(STORAGE_KEYS.catalog, state.catalog);
    saveSessionJSON(SESSION_KEYS.catalog, state.catalog);
    emitStoreUpdate();
  }

  function clearCatalogCache() {
    localStorage.removeItem(STORAGE_KEYS.catalog);
    sessionStorage.removeItem(SESSION_KEYS.catalog);
    state.catalog = null;
  }

  function getCatalog() {
    return state.catalog || [];
  }

  function getProductById(id) {
    return getCatalog().find((product) => product.id === String(id));
  }

  function getCart() {
    return loadJSON(STORAGE_KEYS.cart, []);
  }

  function scheduleCartSync() {
    clearTimeout(state.cartSyncTimer);
    state.cartSyncTimer = setTimeout(async () => {
      const firebase = getFirebase();
      if (!firebase || state.syncingCart) return;
      const authState = await firebase.getAuthState();
      if (!authState.user) return;
      try {
        state.syncingCart = true;
        await firebase.saveUserCart(authState.user.uid, getCart());
      } catch (error) {
        console.error("Cart sync failed", error);
      } finally {
        state.syncingCart = false;
      }
    }, 180);
  }

  function setCart(cart, options = {}) {
    saveJSON(STORAGE_KEYS.cart, cart);
    if (!options.skipRemote) scheduleCartSync();
    emitStoreUpdate();
  }

  function getFavorites() {
    return loadJSON(STORAGE_KEYS.favorites, []);
  }

  function setFavorites(favorites) {
    saveJSON(STORAGE_KEYS.favorites, favorites);
    emitStoreUpdate();
  }

  function getRecent() {
    return loadJSON(STORAGE_KEYS.recent, []);
  }

  function setRecent(recent) {
    saveJSON(STORAGE_KEYS.recent, recent);
    emitStoreUpdate();
  }

  function getRatings() {
    return loadJSON(STORAGE_KEYS.ratings, {});
  }

  function setRatings(ratings) {
    saveJSON(STORAGE_KEYS.ratings, ratings);
    emitStoreUpdate();
  }

  function getCouponCode() {
    return localStorage.getItem(STORAGE_KEYS.coupon) || "";
  }

  function setCouponCode(code) {
    localStorage.setItem(STORAGE_KEYS.coupon, code);
    emitStoreUpdate();
  }

  function getTheme() {
    return localStorage.getItem(STORAGE_KEYS.theme);
  }

  function setTheme(theme) {
    const dark = theme === "dark";
    document.body.classList.toggle("dark-mode", dark);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    const label = document.querySelector(".js-theme-label");
    if (label) label.textContent = dark ? "Light Mode" : "Dark Mode";
  }

  function initTheme() {
    const stored = getTheme();
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
    setTheme("light");
  }

  function toggleTheme() {
    setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
  }

  function formatPrice(value) {
    return `$${Number(value || 0).toFixed(2)}`;
  }

  function stockState(stock) {
    if (stock === 0) return "out";
    if (stock < 5) return "low";
    return "good";
  }

  function stockLabel(stock) {
    if (stock === 0) return "Out of Stock";
    if (stock < 5) return "Low Stock";
    return "In Stock";
  }

  function stockInline(stock) {
    if (stock === 0) return "Sold out";
    if (stock < 5) return `Only ${stock} left`;
    return `${stock} in stock`;
  }

  function badgeText(badge) {
    return ({
      fresh: "Fresh Pick",
      sale: "Discount",
      organic: "Organic",
      new: "New Arrival",
      best: "Best Seller"
    })[badge] || badge;
  }

  function isFavorite(id) {
    return getFavorites().includes(String(id));
  }

  function getRating(product) {
    const ratings = getRatings();
    const userRatings = ratings[product.id] || [];
    const total = product.ratingBase * product.reviewCount + userRatings.reduce((sum, value) => sum + value, 0);
    const count = product.reviewCount + userRatings.length;
    return Number((total / Math.max(count, 1)).toFixed(1));
  }

  function getReviewCount(product) {
    const ratings = getRatings();
    return product.reviewCount + (ratings[product.id] || []).length;
  }

  function cartEntries() {
    return getCart().map((entry) => {
      const product = getProductById(entry.id);
      if (!product) return null;
      return {
        ...product,
        qty: Math.max(1, Math.min(product.stock || 1, Number(entry.qty) || 1))
      };
    }).filter(Boolean);
  }

  function getCouponMeta(subtotal) {
    const code = getCouponCode().trim().toUpperCase();
    if (!code || !COUPONS[code]) return { code: "", label: "", discount: 0, valid: false, message: "" };
    const coupon = COUPONS[code];
    if (subtotal < coupon.min) {
      return { code, label: coupon.label, discount: 0, valid: false, message: `${code} requires a subtotal of ${formatPrice(coupon.min)}.` };
    }
    if (coupon.type === "percent") {
      const discount = Number(Math.min(subtotal * coupon.value / 100, 12).toFixed(2));
      return { code, label: coupon.label, discount, valid: true, message: `${code} applied successfully.` };
    }
    if (coupon.type === "flat") {
      return { code, label: coupon.label, discount: Number(coupon.value.toFixed(2)), valid: true, message: `${code} applied successfully.` };
    }
    return { code, label: coupon.label, discount: 0, valid: true, message: `${code} gives free delivery.` };
  }

  function deliveryBaseFee(subtotal) {
    if (subtotal >= 60) return 0;
    if (subtotal >= 30) return 2.99;
    return 5.99;
  }

  function pricingSummary(deliveryType = "standard") {
    const entries = cartEntries();
    const itemCount = entries.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = entries.reduce((sum, item) => sum + item.qty * item.price, 0);
    const couponMeta = getCouponMeta(subtotal);
    const discount = couponMeta.discount;
    const baseFee = deliveryBaseFee(subtotal);
    const expressSurcharge = deliveryType === "express" && entries.length ? 4.5 : 0;
    let delivery = baseFee + expressSurcharge;
    if (couponMeta.code === "FREESHIP" && couponMeta.valid) delivery = 0;
    const deliverySavings = couponMeta.code === "FREESHIP" && couponMeta.valid ? baseFee + expressSurcharge : baseFee === 0 && entries.length ? 5.99 : 0;
    const totalSavings = discount + deliverySavings;
    const total = Math.max(0, subtotal - discount + delivery);
    return { entries, itemCount, subtotal, discount, delivery, total, totalSavings, couponMeta };
  }

  function updateHeaderCounters() {
    const cartCount = cartEntries().reduce((sum, item) => sum + item.qty, 0);
    const favoriteCount = getFavorites().length;
    document.querySelectorAll(".js-cart-count").forEach((node) => {
      node.textContent = String(cartCount);
    });
    document.querySelectorAll(".js-favorite-count").forEach((node) => {
      node.textContent = String(favoriteCount);
    });
  }

  function emitStoreUpdate() {
    updateHeaderCounters();
    renderCartDrawer();
    document.dispatchEvent(new CustomEvent("freshmart:updated"));
  }

  function showToast(message, type = "success") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span><button class="pressable" type="button" style="color:inherit;cursor:pointer">x</button>`;
    stack.appendChild(toast);
    const remove = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector("button").addEventListener("click", remove);
    setTimeout(remove, 2000);
  }

  function addToCart(id, quantity = 1, options = {}) {
    const product = getProductById(id);
    if (!product || product.stock === 0) return;
    const cart = getCart();
    const existing = cart.find((entry) => entry.id === String(id));
    if (existing) {
      if (existing.qty >= product.stock) {
        showToast(`Only ${product.stock} available for ${product.name}`, "warn");
        return;
      }
      existing.qty = Math.min(product.stock, existing.qty + quantity);
    } else {
      cart.push({ id: String(id), qty: Math.min(quantity, product.stock) });
    }
    setCart(cart);
    document.dispatchEvent(new CustomEvent("freshmart:cart-added", { detail: { id: String(id) } }));
    if (!options.silent) showToast(`${product.name} added to cart`, "success");
  }

  function updateCartQty(id, nextQty) {
    const product = getProductById(id);
    const cart = getCart();
    const entry = cart.find((item) => item.id === String(id));
    if (!product || !entry) return;
    const qty = Math.max(0, Math.min(product.stock, Number(nextQty)));
    if (qty === 0) {
      removeFromCart(id, false);
      return;
    }
    entry.qty = qty;
    setCart(cart);
  }

  function changeCartQty(id, delta) {
    const entry = getCart().find((item) => item.id === String(id));
    if (!entry) return;
    updateCartQty(id, entry.qty + Number(delta));
  }

  function removeFromCart(id, notify = true) {
    const product = getProductById(id);
    const cart = getCart().filter((item) => item.id !== String(id));
    setCart(cart);
    if (notify && product) showToast(`${product.name} removed from cart`, "info");
  }

  function toggleFavorite(id) {
    const product = getProductById(id);
    if (!product) return;
    let favorites = getFavorites();
    if (favorites.includes(String(id))) {
      favorites = favorites.filter((item) => item !== String(id));
      showToast(`${product.name} removed from favorites`, "info");
    } else {
      favorites = [String(id), ...favorites.filter((item) => item !== String(id))];
      showToast(`${product.name} saved to favorites`, "success");
    }
    setFavorites(favorites);
  }

  function recordRecent(id) {
    const recent = [String(id), ...getRecent().filter((item) => item !== String(id))].slice(0, 8);
    setRecent(recent);
  }

  function rateProduct(id, value) {
    const product = getProductById(id);
    if (!product) return;
    const ratings = getRatings();
    if (!ratings[String(id)]) ratings[String(id)] = [];
    ratings[String(id)].push(Number(value));
    setRatings(ratings);
    showToast("Thanks for rating this product", "success");
  }

  function reorderItems(items) {
    items.forEach((item) => addToCart(item.productId || item.id, item.qty || 1, { silent: true }));
    showToast("Items added back to cart", "success");
  }

  function getSuggestedProducts(sourceIds = []) {
    const sourceSet = new Set(sourceIds.map(String));
    const categories = new Set(
      sourceIds
        .map((id) => getProductById(id))
        .filter(Boolean)
        .map((product) => product.category)
    );

    return getCatalog()
      .filter((product) => !sourceSet.has(product.id) && product.stock > 0 && (categories.size === 0 || categories.has(product.category)))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 4);
  }

  function buildProductCard(product, options = {}) {
    const stateClass = stockState(product.stock);
    return `
      <article class="product-card ${options.compact ? "compact" : ""}" data-product-id="${product.id}">
        <div class="product-media">
          <img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async" width="360" height="360" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
          ${product.badge ? `<div class="badge-stack"><span class="badge ${product.badge}">${badgeText(product.badge)}</span></div>` : ""}
          <button class="favorite-btn pressable ${isFavorite(product.id) ? "active" : ""}" type="button" data-action="favorite" data-product-id="${product.id}" aria-label="Toggle favorite">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFavorite(product.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="m12 21-1.1-1C5.1 14.8 2 12 2 8.5A4.5 4.5 0 0 1 6.5 4c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 15.5 4 4.5 4.5 0 0 1 20 8.5c0 3.5-3.1 6.3-8.9 11.5z"></path></svg>
          </button>
          <span class="tap-pill">${stockLabel(product.stock)}</span>
        </div>
        <div class="product-body">
          <div class="product-head">
            <div>
              <div class="category-tag">${CATEGORY_LABELS[product.category]}</div>
              <strong>${product.name}</strong>
            </div>
            <span class="pill ${stateClass}">${stockInline(product.stock)}</span>
          </div>
          <div class="product-rating">
            <span class="star-row"><span class="star">★</span><b>${getRating(product).toFixed(1)}</b> <span>(${getReviewCount(product)})</span></span>
            <span>${product.unit}</span>
          </div>
          <p class="product-copy">${options.hideDescription ? `${CATEGORY_LABELS[product.category]} · ${product.unit}` : product.description}</p>
          <div class="product-footer">
            <div class="price">${formatPrice(product.price)}<small>${product.unit} · ${product.sku}</small></div>
            <div class="product-actions">
              <a class="ghost-btn pressable" href="product.html?id=${product.id}" data-product-link="${product.id}">Details</a>
              <button class="add-btn pressable" type="button" data-action="add" data-product-id="${product.id}" ${product.stock === 0 ? "disabled" : ""}>${product.stock === 0 ? "Sold Out" : "Add"}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function buildEmptyState(title, copy) {
    return `<div class="empty-state"><strong>${title}</strong><p>${copy}</p></div>`;
  }

  function buildSkeletonCards(count = 6) {
    return `<div class="skeleton-grid">${Array.from({ length: count }).map(() => `
      <article class="skeleton-card">
        <div class="skeleton-line media"></div>
        <div class="skeleton-line title"></div>
        <div class="skeleton-line text"></div>
        <div class="skeleton-line text short"></div>
      </article>
    `).join("")}</div>`;
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  function navigateToProduct(id) {
    recordRecent(id);
    window.location.href = `product.html?id=${id}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderHeader() {
    const host = document.getElementById("site-header");
    if (!host) return;
    const page = document.body.dataset.page || "home";
    host.innerHTML = `
      <div class="nav" id="site-nav">
        <a class="brand" href="index.html">
          <div class="brand-mark"><img src="assets/images/ax-logo.png" alt="FreshMart logo" width="48" height="48"></div>
          <div class="brand-copy">
            <h1>FreshMart</h1>
            <p>Smart Supermarket</p>
          </div>
        </a>

        <button class="menu-btn pressable" id="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
        </button>

        <nav class="nav-links">
          <a class="nav-link pressable ${page === "home" ? "active" : ""}" href="index.html">Home</a>
          <a class="nav-link pressable ${page === "products" ? "active" : ""}" href="products.html">Products</a>
          <a class="nav-link pressable ${page === "wishlist" ? "active" : ""}" href="wishlist.html">Wishlist</a>
          <a class="nav-link pressable ${page === "cart" ? "active" : ""}" href="cart.html">Cart</a>
          <a class="nav-link pressable ${page === "checkout" ? "active" : ""}" href="checkout.html">Checkout</a>
          <a class="nav-link pressable ${page === "profile" ? "active" : ""}" href="profile.html">Account</a>
          <a class="nav-link pressable ${page === "admin" || page === "inventory" ? "active" : ""}" href="admin.html">Admin</a>
        </nav>

        <div class="nav-tools">
          <form class="search-shell" id="nav-search-form">
            <label class="search" aria-label="Search products">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
              <input id="nav-search-input" type="search" placeholder="Search groceries, brands, SKU..." autocomplete="off" value="${page === "products" ? escapeHtml(getQueryParam("q")) : ""}">
            </label>
            <div class="nav-search-suggestions" id="nav-search-suggestions"></div>
          </form>

          <button class="theme-toggle pressable" id="theme-toggle" type="button">
            <span>◐</span>
            <span class="js-theme-label">Dark Mode</span>
          </button>

          <a class="tool-btn pressable" href="wishlist.html">
            <span>Favorites</span>
            <span class="counter js-favorite-count">0</span>
          </a>

          <button class="cart-btn pressable" type="button" id="cart-drawer-toggle">
            <span>Cart</span>
            <span class="counter js-cart-count">0</span>
          </button>

          <div class="auth-shell" id="auth-shell">
            <a class="tool-btn pressable" href="login.html">Login</a>
          </div>
        </div>
      </div>
    `;
  }

  function renderFooter() {
    const host = document.getElementById("site-footer");
    if (!host) return;
    host.innerHTML = `
      <div class="footer-grid">
        <div class="footer-copy">
          <strong style="font-family:'Playfair Display',serif;font-size:24px;color:var(--brand)">FreshMart</strong>
          <p>Mobile-first supermarket shopping with Firebase-backed auth, cart sync, order tracking, and admin controls.</p>
        </div>
        <p style="color:var(--muted)">© <span id="footer-year"></span> FreshMart. All rights reserved.</p>
      </div>
    `;
    const year = host.querySelector("#footer-year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function renderBottomNav() {
    let nav = document.getElementById("bottom-nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "bottom-nav";
      nav.className = "bottom-nav";
      document.body.appendChild(nav);
    }
    const page = document.body.dataset.page || "home";
    nav.innerHTML = `
      <a class="${page === "home" ? "active" : ""}" href="index.html"><span>Home</span></a>
      <a class="${page === "products" ? "active" : ""}" href="products.html"><span>Search</span></a>
      <button type="button" id="bottom-cart-trigger"><span>Cart</span><b class="js-cart-count">0</b></button>
      <a class="${page === "profile" || page === "login" ? "active" : ""}" href="profile.html"><span>Account</span></a>
    `;
  }

  function renderCartDrawer() {
    let drawer = document.getElementById("cart-drawer");
    if (!drawer) {
      drawer = document.createElement("aside");
      drawer.id = "cart-drawer";
      drawer.className = "cart-drawer";
      document.body.appendChild(drawer);
    }
    let overlay = document.getElementById("cart-drawer-overlay");
    if (!overlay) {
      overlay = document.createElement("button");
      overlay.id = "cart-drawer-overlay";
      overlay.className = "cart-drawer-overlay";
      overlay.type = "button";
      overlay.setAttribute("aria-label", "Close cart drawer");
      document.body.appendChild(overlay);
    }
    const info = pricingSummary();
    const suggestions = getSuggestedProducts(info.entries.map((item) => item.id));
    drawer.innerHTML = `
      <div class="drawer-head">
        <div>
          <strong>Quick Cart</strong>
          <p>${info.itemCount} item${info.itemCount === 1 ? "" : "s"} ready</p>
        </div>
        <button class="close-btn pressable" type="button" id="cart-drawer-close">Close</button>
      </div>
      <div class="drawer-body">
        ${info.entries.length ? info.entries.map((item) => `
          <article class="drawer-item">
            <img src="${item.image}" alt="${item.name}" loading="lazy" width="56" height="56" style="--img-scale:${item.imageFocus.scale};--img-pos:${item.imageFocus.position};">
            <div>
              <strong>${item.name}</strong>
              <span>${item.qty} x ${formatPrice(item.price)}</span>
            </div>
            <button class="remove-btn pressable" type="button" data-cart-action="remove" data-product-id="${item.id}">Remove</button>
          </article>
        `).join("") : buildEmptyState("Cart is empty.", "Add a few groceries to see them here instantly.")}
        ${suggestions.length ? `
          <div class="drawer-suggest">
            <div class="section-mini-head">
              <strong>Suggested for you</strong>
            </div>
            <div class="drawer-suggest-grid">
              ${suggestions.map((product) => `
                <article class="drawer-suggest-card">
                  <img src="${product.image}" alt="${product.name}" loading="lazy" width="80" height="80" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
                  <strong>${product.name}</strong>
                  <span>${formatPrice(product.price)}</span>
                  <button class="add-btn pressable" type="button" data-action="add" data-product-id="${product.id}">Add</button>
                </article>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
      <div class="drawer-foot">
        <div class="summary-line total"><span>Total</span><span>${formatPrice(info.total)}</span></div>
        <div class="drawer-actions">
          <a class="btn-secondary pressable" href="cart.html">Open Cart</a>
          <a class="checkout-btn pressable" href="checkout.html">Checkout</a>
        </div>
      </div>
    `;
  }

  function openCartDrawer(open) {
    const drawer = document.getElementById("cart-drawer");
    const overlay = document.getElementById("cart-drawer-overlay");
    if (!drawer || !overlay) return;
    drawer.classList.toggle("open", open);
    overlay.classList.toggle("open", open);
    document.body.classList.toggle("drawer-open", open);
  }

  function openNav(open) {
    const nav = document.getElementById("site-nav");
    const button = document.getElementById("menu-toggle");
    if (!nav || !button) return;
    nav.classList.toggle("open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("menu-open", open);
  }

  function renderSuggestions(term) {
    const box = document.getElementById("nav-search-suggestions");
    if (!box) return;
    const search = term.trim().toLowerCase();
    if (!search) {
      box.classList.remove("open");
      box.innerHTML = "";
      return;
    }
    const suggestions = getCatalog().filter((product) => {
      const haystack = `${product.name} ${product.sku} ${CATEGORY_LABELS[product.category]}`.toLowerCase();
      return haystack.includes(search);
    }).slice(0, 5);

    if (!suggestions.length) {
      box.classList.remove("open");
      box.innerHTML = "";
      return;
    }

    box.classList.add("open");
    box.innerHTML = suggestions.map((product) => `
      <button class="suggestion-item pressable" type="button" data-action="suggestion" data-product-id="${product.id}">
        <img src="${product.image}" alt="${product.name}" width="42" height="42" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
        <div style="text-align:left">
          <strong>${product.name}</strong>
          <span>${CATEGORY_LABELS[product.category]} · ${formatPrice(product.price)}</span>
        </div>
      </button>
    `).join("");
  }

  function getFirebase() {
    return window.FreshMartFirebase || null;
  }

  async function refreshAuthUI() {
    const shell = document.getElementById("auth-shell");
    if (!shell) return;

    const firebase = getFirebase();
    if (!firebase) {
      shell.innerHTML = `<a class="tool-btn pressable" href="login.html">Login</a>`;
      return;
    }

    const authState = await firebase.getAuthState();
    if (!authState.configured || !authState.user) {
      shell.innerHTML = `<a class="tool-btn pressable" href="login.html">Login</a>`;
      return;
    }

    const name = authState.profile?.name || authState.user.email || "Account";
    const role = authState.profile?.role || "user";
    shell.innerHTML = `
      <div class="auth-inline">
        <a class="auth-badge" href="profile.html">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(role)}</span>
        </a>
        <button class="tool-btn pressable" type="button" id="sign-out-btn">Sign Out</button>
      </div>
    `;
  }

  async function syncCartWithUser() {
    const firebase = getFirebase();
    if (!firebase) return;

    if (state.cartSubscription) {
      state.cartSubscription();
      state.cartSubscription = null;
    }

    const authState = await firebase.getAuthState();
    if (!authState.user) return;

    const remoteCart = await firebase.fetchUserCart(authState.user.uid);
    const localCart = getCart();
    if (remoteCart.length) {
      setCart(remoteCart, { skipRemote: true });
    } else if (localCart.length) {
      await firebase.saveUserCart(authState.user.uid, localCart);
    }

    state.cartSubscription = await firebase.subscribeUserCart(authState.user.uid, (items) => {
      if (state.syncingCart) return;
      saveJSON(STORAGE_KEYS.cart, items);
      emitStoreUpdate();
    });
  }

  async function watchRemoteCatalog() {
    const firebase = getFirebase();
    if (!firebase || state.productSubscription) return;
    state.productSubscription = await firebase.subscribeProducts((products) => {
      if (!products.length) return;
      state.catalog = normalizeCatalog(products);
      saveJSON(STORAGE_KEYS.catalog, state.catalog);
      saveSessionJSON(SESSION_KEYS.catalog, state.catalog);
      document.dispatchEvent(new CustomEvent("freshmart:catalog-updated"));
      emitStoreUpdate();
    });
  }

  function showFlashMessage() {
    try {
      const message = sessionStorage.getItem("freshmart_flash_message");
      if (!message) return;
      sessionStorage.removeItem("freshmart_flash_message");
      showToast(message, "warn");
    } catch (error) {
      console.warn("Could not load flash message", error);
    }
  }

  function bindGlobalEvents() {
    if (state.globalEventsBound) return;
    state.globalEventsBound = true;
    document.addEventListener("click", async (event) => {
      const actionNode = event.target.closest("[data-action]");
      if (actionNode) {
        const { action, productId, value } = actionNode.dataset;
        if (action === "add") addToCart(productId, 1);
        if (action === "favorite") toggleFavorite(productId);
        if (action === "suggestion") navigateToProduct(productId);
        if (action === "rate") rateProduct(productId, Number(value));
      }

      if (event.target.closest("[data-product-link]")) {
        const link = event.target.closest("[data-product-link]");
        recordRecent(link.dataset.productLink);
      }

      if (event.target.id === "sign-out-btn") {
        const firebase = getFirebase();
        if (!firebase) return;
        await firebase.signOutUser();
        showToast("Signed out successfully", "info");
        window.location.href = "login.html";
      }

      if (event.target.id === "cart-drawer-toggle" || event.target.id === "bottom-cart-trigger") {
        openCartDrawer(true);
      }

      if (event.target.id === "cart-drawer-close" || event.target.id === "cart-drawer-overlay") {
        openCartDrawer(false);
      }

      const searchShell = document.querySelector(".search-shell");
      if (searchShell && !searchShell.contains(event.target)) {
        renderSuggestions("");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        openNav(false);
        openCartDrawer(false);
        renderSuggestions("");
      }
    });

    document.addEventListener("freshmart:auth-changed", async () => {
      await refreshAuthUI();
      await syncCartWithUser();
    });

    document.addEventListener("freshmart:cart-added", (event) => {
      const card = document.querySelector(`[data-product-id="${event.detail.id}"]`);
      if (!card) return;
      card.classList.add("recently-added");
      setTimeout(() => card.classList.remove("recently-added"), 650);
    });
  }

  function bindHeaderEvents() {
    if (state.headerEventsBound) return;
    state.headerEventsBound = true;
    const menuToggle = document.getElementById("menu-toggle");
    const navSearchInput = document.getElementById("nav-search-input");
    const navSearchForm = document.getElementById("nav-search-form");
    const themeToggle = document.getElementById("theme-toggle");

    if (menuToggle) {
      menuToggle.addEventListener("click", () => {
        const nav = document.getElementById("site-nav");
        openNav(!nav.classList.contains("open"));
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", toggleTheme);
    }

    if (navSearchInput) {
      navSearchInput.addEventListener("input", (event) => {
        renderSuggestions(event.target.value);
      });
    }

    if (navSearchForm) {
      navSearchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = navSearchInput ? navSearchInput.value.trim() : "";
        window.location.href = `products.html${value ? `?q=${encodeURIComponent(value)}` : ""}`;
      });
    }
  }

  async function initBasePage() {
    await loadCatalog();
    renderHeader();
    renderFooter();
    renderBottomNav();
    renderCartDrawer();
    initTheme();
    updateHeaderCounters();
    bindHeaderEvents();
    bindGlobalEvents();
    await refreshAuthUI();
    await syncCartWithUser();
    await watchRemoteCatalog();
    showFlashMessage();
    requestAnimationFrame(() => document.body.classList.add("page-ready"));
  }

  window.FreshMart = {
    STORAGE_KEYS,
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    COUPONS,
    initBasePage,
    loadCatalog,
    getCatalog,
    persistCatalog,
    clearCatalogCache,
    getProductById,
    formatPrice,
    stockState,
    stockLabel,
    stockInline,
    badgeText,
    getRating,
    getReviewCount,
    cartEntries,
    pricingSummary,
    getCart,
    setCart,
    addToCart,
    updateCartQty,
    changeCartQty,
    removeFromCart,
    reorderItems,
    getFavorites,
    setFavorites,
    toggleFavorite,
    getRecent,
    setRecent,
    recordRecent,
    getRatings,
    setRatings,
    rateProduct,
    getCouponCode,
    setCouponCode,
    getSuggestedProducts,
    buildProductCard,
    buildEmptyState,
    buildSkeletonCards,
    getQueryParam,
    navigateToProduct,
    showToast,
    emitStoreUpdate,
    updateHeaderCounters,
    refreshAuthUI,
    getFirebase,
    escapeHtml,
    openCartDrawer
  };
})();
