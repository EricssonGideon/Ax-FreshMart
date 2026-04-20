document.addEventListener("DOMContentLoaded", async () => {
  const FM = window.FreshMart;
  if (!FM) return;
  await FM.initBasePage();

  const page = document.body.dataset.page;
  if (page === "home") initHomePage(FM);
  if (page === "products") initProductsPage(FM);
  if (page === "product") initProductPage(FM);
  if (page === "wishlist") initWishlistPage(FM);
});

function initHomePage(FM) {
  const root = document.getElementById("home-root");
  if (!root) return;

  function render() {
    const catalog = FM.getCatalog();
    const recent = FM.getRecent().map((id) => FM.getProductById(id)).filter(Boolean);
    const featured = [...catalog].sort((a, b) => b.popularity - a.popularity).slice(0, 6);
    const freshPicks = catalog.filter((product) => product.category === "fruit" || product.category === "veg").slice(0, 4);
    const lowStock = catalog.filter((product) => product.stock < 5).sort((a, b) => a.stock - b.stock).slice(0, 4);

    root.innerHTML = `
      <section class="hero">
        <div class="hero-banner">
          <div class="hero-copy">
            <div class="eyebrow">FreshMart Mobile Supermarket</div>
            <h2>Fast grocery shopping with a <span>real app-like flow</span>.</h2>
            <p>Browse smart categories, save favorites, sync carts, and move from product discovery to checkout with a smoother mobile-first experience.</p>
            <div class="hero-actions">
              <a class="btn-primary pressable" href="products.html">Start Shopping</a>
              <button class="btn-secondary pressable" type="button" id="hero-open-cart">Open Quick Cart</button>
            </div>
            <div class="mini-grid">
              <article class="mini-card"><strong>Products</strong><span>${catalog.length}</span></article>
              <article class="mini-card"><strong>Favorites</strong><span>${FM.getFavorites().length}</span></article>
              <article class="mini-card"><strong>Recent Views</strong><span>${recent.length}</span></article>
            </div>
          </div>
        </div>

        <div class="hero-panel panel">
          <div class="stats">
            <article class="stat"><strong>${catalog.filter((item) => item.stock > 0).length}</strong><span>Available</span></article>
            <article class="stat"><strong>${catalog.filter((item) => item.stock < 5).length}</strong><span>Low Stock</span></article>
            <article class="stat"><strong>${new Set(catalog.map((item) => item.category)).size}</strong><span>Aisles</span></article>
          </div>
          <div class="hero-note">
            <small>What Changed</small>
            <p>The existing FreshMart structure now behaves more like a production grocery storefront, especially on small screens.</p>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div>
            <h3>Popular This Week</h3>
            <p>High-performing products with strong availability and ratings.</p>
          </div>
          <a class="ghost-btn pressable" href="products.html">Browse All</a>
        </div>
        <div class="product-grid">
          ${featured.map((product) => FM.buildProductCard(product, { hideDescription: true })).join("")}
        </div>
      </section>

      <section class="section spotlight-grid">
        <article class="metric-card">
          <div class="section-head">
            <div>
              <h3 style="font-size:26px">Fresh Picks</h3>
              <p>Produce-focused products for quick basket building.</p>
            </div>
          </div>
          <div class="deal-grid">
            ${freshPicks.map((product) => `
              <article class="deal-card">
                <img src="${product.image}" alt="${product.name}" loading="lazy" width="260" height="160" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
                <div><strong>${product.name}</strong><span>${FM.CATEGORY_LABELS[product.category]} · ${product.unit}</span></div>
                <div class="price-line"><b>${FM.formatPrice(product.price)}</b><span class="save-pill">${FM.stockInline(product.stock)}</span></div>
              </article>
            `).join("")}
          </div>
        </article>

        <article class="metric-card">
          <div class="section-head">
            <div>
              <h3 style="font-size:26px">Low Stock Alerts</h3>
              <p>Products shoppers should grab before they sell out.</p>
            </div>
          </div>
          <div class="stock-list">
            ${lowStock.length ? lowStock.map((product) => `
              <article class="stock-item">
                <img src="${product.image}" alt="${product.name}" loading="lazy" width="56" height="56" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
                <div>
                  <strong>${product.name}</strong>
                  <span class="muted">${FM.formatPrice(product.price)}</span>
                </div>
                <span class="status-pill ${FM.stockState(product.stock)}">${FM.stockInline(product.stock)}</span>
              </article>
            `).join("") : FM.buildEmptyState("Stock looks healthy.", "Low stock items will appear here automatically.")}
          </div>
        </article>
      </section>

      <section class="section">
        <div class="section-head">
          <div>
            <h3>Recently Viewed</h3>
            <p>Jump back into the products you checked most recently.</p>
          </div>
        </div>
        <div class="recent-grid">
          ${recent.length ? recent.map((product) => `
            <article class="recent-card panel">
              <img src="${product.image}" alt="${product.name}" loading="lazy" width="84" height="84" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
              <div>
                <strong>${product.name}</strong>
                <p>${FM.CATEGORY_LABELS[product.category]} · ${FM.formatPrice(product.price)}</p>
              </div>
              <a class="ghost-btn pressable" href="product.html?id=${product.id}" data-product-link="${product.id}">View</a>
            </article>
          `).join("") : FM.buildEmptyState("Nothing viewed yet.", "Product views will appear here automatically.")}
        </div>
      </section>
    `;
  }

  document.addEventListener("click", (event) => {
    if (event.target.id === "hero-open-cart") FM.openCartDrawer(true);
  });

  document.addEventListener("freshmart:updated", render);
  document.addEventListener("freshmart:catalog-updated", render);
  render();
}

function initProductsPage(FM) {
  let activeCategory = "all";
  let sortOrder = "popular";
  let availability = "all";
  let priceRange = "all";
  let search = FM.getQueryParam("q");

  const grid = document.getElementById("products-grid");
  const count = document.getElementById("product-count");
  const searchInput = document.getElementById("products-search");
  const sortSelect = document.getElementById("products-sort");
  const filters = document.getElementById("category-filters");
  const availabilitySelect = document.getElementById("availability-filter");
  const priceSelect = document.getElementById("price-filter");
  const availabilityMobile = document.getElementById("availability-filter-mobile");
  const priceMobile = document.getElementById("price-filter-mobile");
  const drawer = document.getElementById("filter-drawer");
  const filterOpen = document.getElementById("open-filter-drawer");
  const filterClose = document.getElementById("close-filter-drawer");
  const filterOverlay = document.getElementById("filter-overlay");

  if (searchInput) searchInput.value = search;

  function matchesPrice(product) {
    if (priceRange === "under-5") return product.price < 5;
    if (priceRange === "5-10") return product.price >= 5 && product.price <= 10;
    if (priceRange === "above-10") return product.price > 10;
    return true;
  }

  function matchesAvailability(product) {
    if (availability === "in-stock") return product.stock > 0;
    if (availability === "low-stock") return product.stock > 0 && product.stock < 5;
    if (availability === "out-of-stock") return product.stock === 0;
    return true;
  }

  function getFilteredProducts() {
    const searchLower = search.trim().toLowerCase();
    const list = FM.getCatalog().filter((product) => {
      const categoryMatch = activeCategory === "all" || product.category === activeCategory;
      const text = `${product.name} ${product.sku} ${FM.CATEGORY_LABELS[product.category]} ${product.unit}`.toLowerCase();
      return categoryMatch && matchesAvailability(product) && matchesPrice(product) && (!searchLower || text.includes(searchLower));
    });
    switch (sortOrder) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list.sort((a, b) => FM.getRating(b) - FM.getRating(a));
        break;
      case "trending":
        list.sort((a, b) => b.trendingScore - a.trendingScore);
        break;
      case "name-asc":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        list.sort((a, b) => b.popularity - a.popularity);
    }
    return list;
  }

  function render() {
    const products = getFilteredProducts();
    count.textContent = `${products.length} product${products.length === 1 ? "" : "s"} shown`;
    grid.innerHTML = products.length
      ? products.map((product) => FM.buildProductCard(product)).join("")
      : FM.buildEmptyState("No products matched your search.", "Try a broader keyword or reset one of the product filters.");
  }

  function openFilterDrawer(open) {
    drawer?.classList.toggle("open", open);
    filterOverlay?.classList.toggle("open", open);
    document.body.classList.toggle("drawer-open", open);
  }

  searchInput?.addEventListener("input", (event) => {
    search = event.target.value;
    const params = new URLSearchParams(window.location.search);
    if (search.trim()) params.set("q", search.trim());
    else params.delete("q");
    history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    render();
  });

  sortSelect?.addEventListener("change", (event) => {
    sortOrder = event.target.value;
    render();
  });

  availabilitySelect?.addEventListener("change", (event) => {
    availability = event.target.value;
    if (availabilityMobile) availabilityMobile.value = availability;
    render();
  });

  priceSelect?.addEventListener("change", (event) => {
    priceRange = event.target.value;
    if (priceMobile) priceMobile.value = priceRange;
    render();
  });

  availabilityMobile?.addEventListener("change", (event) => {
    availability = event.target.value;
    if (availabilitySelect) availabilitySelect.value = availability;
    render();
  });

  priceMobile?.addEventListener("change", (event) => {
    priceRange = event.target.value;
    if (priceSelect) priceSelect.value = priceRange;
    render();
  });

  filters?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    filters.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
    button.classList.add("active");
    render();
  });

  filterOpen?.addEventListener("click", () => openFilterDrawer(true));
  filterClose?.addEventListener("click", () => openFilterDrawer(false));
  filterOverlay?.addEventListener("click", () => openFilterDrawer(false));

  document.addEventListener("freshmart:updated", render);
  document.addEventListener("freshmart:catalog-updated", render);
  render();
}

function initProductPage(FM) {
  const product = FM.getProductById(FM.getQueryParam("id"));
  const root = document.getElementById("product-root");
  if (!root) return;

  if (!product) {
    root.innerHTML = FM.buildEmptyState("Product not found.", "The requested product could not be loaded from the shared catalog.");
    return;
  }

  FM.recordRecent(product.id);

  function render() {
    const current = FM.getProductById(product.id);
    const related = FM.getSuggestedProducts([current.id]).slice(0, 4);

    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>${current.name}</h2>
          <p>${FM.CATEGORY_LABELS[current.category]} · ${current.sku} · ${FM.stockInline(current.stock)}</p>
        </div>
      </section>

      <section class="detail-layout">
        <article class="detail-image panel">
          <img src="${current.image}" alt="${current.name}" loading="lazy" width="540" height="540" style="--img-scale:${Math.max(current.imageFocus.scale - 0.02, 1.08)};--img-pos:${current.imageFocus.position};">
        </article>
        <article class="detail-panel">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${current.badge ? `<span class="badge ${current.badge}">${FM.badgeText(current.badge)}</span>` : ""}
            <span class="pill ${FM.stockState(current.stock)}">${FM.stockLabel(current.stock)}</span>
          </div>
          <div class="price">${FM.formatPrice(current.price)}<small>${current.unit} · ${current.sku}</small></div>
          <div class="product-rating" style="justify-content:flex-start">
            <span class="star-row"><span class="star">★</span><b>${FM.getRating(current).toFixed(1)}</b><span>(${FM.getReviewCount(current)} reviews)</span></span>
          </div>
          <p class="product-copy" style="font-size:15px">${current.description}</p>
          <div class="detail-grid">
            <div class="detail-item"><strong>Unit</strong><span>${current.unit}</span></div>
            <div class="detail-item"><strong>Stock</strong><span>${current.stock}</span></div>
            <div class="detail-item"><strong>Expiry</strong><span>${current.expiry}</span></div>
            <div class="detail-item"><strong>Delivery</strong><span>Same-day slots available</span></div>
          </div>
          <div class="detail-item">
            <strong>Rate This Product</strong>
            <div class="rating-actions" style="margin-top:10px">
              ${[1, 2, 3, 4, 5].map((star) => `<button class="star-btn pressable" type="button" data-action="rate" data-product-id="${current.id}" data-value="${star}">${star <= Math.round(FM.getRating(current)) ? "★" : "☆"}</button>`).join("")}
              <span class="muted" style="font-size:13px">Tap a star to add your rating.</span>
            </div>
          </div>
          <div class="sticky-product-bar">
            <button class="add-btn pressable sticky-add-btn" type="button" data-action="add" data-product-id="${current.id}" ${current.stock === 0 ? "disabled" : ""}>${current.stock === 0 ? "Sold Out" : "Add to Cart"}</button>
            <button class="ghost-btn pressable" type="button" data-action="favorite" data-product-id="${current.id}">${FM.getFavorites().includes(current.id) ? "Remove Favorite" : "Save to Favorites"}</button>
          </div>
          <div>
            <strong style="display:block;margin-bottom:10px">Customer Reviews</strong>
            <div class="reviews">
              ${current.reviews.slice(0, 3).map((review) => `
                <article class="review">
                  <strong>${review.name} · ${"★".repeat(review.rating)}</strong>
                  <p>${review.text}</p>
                </article>
              `).join("")}
            </div>
          </div>
        </article>
      </section>

      <section class="section">
        <div class="section-head">
          <div>
            <h3>You May Also Like</h3>
            <p>Suggested products from related aisles.</p>
          </div>
        </div>
        <div class="product-grid">
          ${related.map((item) => FM.buildProductCard(item, { hideDescription: true })).join("")}
        </div>
      </section>
    `;
  }

  document.addEventListener("freshmart:updated", render);
  document.addEventListener("freshmart:catalog-updated", render);
  render();
}

function initWishlistPage(FM) {
  const root = document.getElementById("wishlist-root");
  if (!root) return;

  function render() {
    const favorites = FM.getFavorites().map((id) => FM.getProductById(id)).filter(Boolean);
    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>Wishlist</h2>
          <p>Your saved products stay available across every page and device session.</p>
        </div>
      </section>
      <section class="favorites-grid">
        ${favorites.length
          ? favorites.map((product) => FM.buildProductCard(product)).join("")
          : FM.buildEmptyState("No favorites saved yet.", "Tap the heart on any product card to keep your regular grocery picks close.")}
      </section>
    `;
  }

  document.addEventListener("freshmart:updated", render);
  document.addEventListener("freshmart:catalog-updated", render);
  render();
}
