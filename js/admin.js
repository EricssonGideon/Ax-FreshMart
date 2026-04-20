document.addEventListener("DOMContentLoaded", async () => {
  const FM = window.FreshMart;
  const firebase = window.FreshMartFirebase;
  if (!FM || !firebase) return;
  await FM.initBasePage();

  const page = document.body.dataset.page;
  if (page !== "admin" && page !== "inventory") return;

  const allowed = await firebase.requireAdminProfile({
    redirectOnFail: true,
    redirectTo: "index.html",
    message: "Admin access only"
  });
  if (!allowed) return;

  if (page === "admin") initAdminDashboard(FM, firebase);
  if (page === "inventory") initInventoryPage(FM, firebase);
});

function initAdminDashboard(FM, firebase) {
  const root = document.getElementById("admin-dashboard-root");
  if (!root) return;

  let statusFilter = "all";
  let unsubscribe = null;
  let currentOrders = [];

  function getMetrics(orders) {
    const today = new Date();
    const todayOrders = orders.filter((order) => {
      if (!order.createdAtDate) return false;
      return order.createdAtDate.toDateString() === today.toDateString();
    });
    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const lowStock = FM.getCatalog().filter((product) => Number(product.stock || 0) < 5).length;
    return {
      totalOrders: orders.length,
      revenue,
      todayOrders: todayOrders.length,
      lowStock
    };
  }

  function statusClass(status) {
    return status === "delivered" ? "good" : status === "processing" ? "low" : "out";
  }

  function renderChart(orders) {
    const buckets = { pending: 0, processing: 0, delivered: 0 };
    orders.forEach((order) => {
      buckets[order.status] = (buckets[order.status] || 0) + 1;
    });
    const max = Math.max(...Object.values(buckets), 1);
    return `
      <div class="mini-chart">
        ${Object.entries(buckets).map(([label, value]) => `
          <div class="chart-bar-wrap">
            <div class="chart-bar ${statusClass(label)}" style="height:${Math.max(18, Math.round((value / max) * 100))}%"></div>
            <strong>${value}</strong>
            <span>${label}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderOrders(orders) {
    currentOrders = orders;
    const metrics = getMetrics(orders);
    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>Admin Dashboard</h2>
          <p>Realtime order visibility, role-based access, and supermarket operations in one place.</p>
        </div>
      </section>

      <section class="admin-shell">
        <div class="admin-topbar">
          <div class="filters">
            <button class="chip pressable ${statusFilter === "all" ? "active" : ""}" type="button" data-order-filter="all">All Orders</button>
            <button class="chip pressable ${statusFilter === "pending" ? "active" : ""}" type="button" data-order-filter="pending">Pending</button>
            <button class="chip pressable ${statusFilter === "delivered" ? "active" : ""}" type="button" data-order-filter="delivered">Delivered</button>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <a class="btn-secondary pressable" href="inventory.html">Open Inventory</a>
            <button class="btn-secondary pressable" type="button" id="sync-products-btn">Sync Products to Firebase</button>
          </div>
        </div>

        <div class="admin-stats-grid">
          <article class="summary-card"><strong>${metrics.totalOrders}</strong><span>Total Orders</span><b>Live count from Firestore</b></article>
          <article class="summary-card"><strong>${FM.formatPrice(metrics.revenue)}</strong><span>Total Revenue</span><b>Based on current order totals</b></article>
          <article class="summary-card"><strong>${metrics.todayOrders}</strong><span>Today's Orders</span><b>Placed today only</b></article>
          <article class="summary-card"><strong>${metrics.lowStock}</strong><span>Low Stock Products</span><b>Items below 5 units</b></article>
        </div>

        <section class="admin-chart-card">
          <div class="section-head" style="margin-bottom:8px">
            <div>
              <h3 style="font-size:24px">Order Status Mix</h3>
              <p>Simple live chart from incoming Firestore orders.</p>
            </div>
          </div>
          ${renderChart(orders)}
        </section>

        <div class="order-list-grid">
          ${orders.length ? orders.map((order) => `
            <article class="order-card">
              <div class="order-card-head">
                <div>
                  <h3 style="font-size:24px">${FM.escapeHtml(order.customerName || "Guest Checkout")}</h3>
                  <p class="helper" style="margin-top:8px">${FM.escapeHtml(order.customerEmail || "No email")} · ${FM.escapeHtml(order.phone || "No phone")} · ${FM.escapeHtml(order.createdAtLabel)}</p>
                </div>
                <span class="save-pill">${FM.formatPrice(order.total || 0)}</span>
              </div>
              <div class="admin-order-meta">
                <span class="status-pill ${statusClass(order.status)}">${FM.escapeHtml(order.status)}</span>
                <label class="tool-select status-select" aria-label="Update order status">
                  <select data-order-status-id="${order.id}">
                    <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pending</option>
                    <option value="processing" ${order.status === "processing" ? "selected" : ""}>Processing</option>
                    <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>Delivered</option>
                  </select>
                </label>
              </div>
              <p class="helper" style="margin-top:12px">${FM.escapeHtml(order.address || "No address")} · ${FM.escapeHtml(order.deliveryType || "standard")} · ${FM.escapeHtml(order.deliverySlot || "")}</p>
              <div class="order-items">
                ${(order.items || []).map((item) => `
                  <div class="order-item-line">
                    <div>
                      <strong>${FM.escapeHtml(item.name)}</strong>
                      <div class="muted" style="font-size:12px">${item.qty} × ${FM.formatPrice(item.price)} · ${FM.escapeHtml(item.unit || "")}</div>
                    </div>
                    <strong>${FM.formatPrice(item.qty * item.price)}</strong>
                  </div>
                `).join("")}
              </div>
            </article>
          `).join("") : FM.buildEmptyState("No orders yet.", "Realtime order data will appear here as soon as checkout creates documents in Firestore.")}
        </div>
      </section>
    `;
  }

  async function subscribe() {
    if (unsubscribe) unsubscribe();
    unsubscribe = await firebase.subscribeOrders((orders) => {
      renderOrders(orders);
    }, { status: statusFilter });
  }

  document.addEventListener("click", async (event) => {
    const filterButton = event.target.closest("[data-order-filter]");
    if (filterButton) {
      statusFilter = filterButton.dataset.orderFilter;
      await subscribe();
    }

    if (event.target.id === "sync-products-btn") {
      try {
        await firebase.syncProducts(FM.getCatalog());
        FM.showToast("Products synced to Firebase", "success");
      } catch (error) {
        console.error(error);
        FM.showToast(error.message || "Could not sync products", "error");
      }
    }
  });

  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status-id]");
    if (!select) return;
    try {
      await firebase.updateOrderStatus(select.dataset.orderStatusId, select.value);
      FM.showToast("Order status updated", "success");
    } catch (error) {
      console.error(error);
      FM.showToast(error.message || "Could not update order status", "error");
    }
  });

  document.addEventListener("freshmart:catalog-updated", () => {
    renderOrders(currentOrders);
  });

  subscribe();
}

function initInventoryPage(FM, firebase) {
  const root = document.getElementById("inventory-root");
  if (!root) return;

  function inventoryStatus(stock) {
    if (stock === 0) return "Out of Stock";
    if (stock < 5) return "Low Stock";
    return "In Stock";
  }

  function render(products) {
    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>Inventory Control</h2>
          <p>Admin-only stock editing with realtime updates to Firestore.</p>
        </div>
      </section>

      <section class="inventory-admin-layout">
        <article class="inventory-card">
          <div class="section-head" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:24px">Stock Table</h3>
              <p>Edit quantity or price and save directly to Firestore.</p>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${products.map((product) => `
                  <tr>
                    <td>
                      <div class="inventory-thumb">
                        <img src="${product.image}" alt="${product.name}" loading="lazy" width="54" height="54" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
                        <div>
                          <strong>${product.name}</strong>
                          <div class="muted" style="font-size:12px">${FM.CATEGORY_LABELS[product.category]} · ${product.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td><input class="inventory-input" type="number" min="0" value="${product.stock}" data-field="stock" data-product-id="${product.id}"></td>
                    <td><input class="inventory-input" type="number" min="0" step="0.01" value="${product.price}" data-field="price" data-product-id="${product.id}"></td>
                    <td><span class="status-pill ${FM.stockState(product.stock)}">${inventoryStatus(product.stock)}</span></td>
                    <td><button class="btn-secondary pressable" type="button" data-save-product="${product.id}">Save</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </article>

        <article class="inventory-card">
          <div class="section-head" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:24px">Attention Needed</h3>
              <p>Critical stock positions for quick action.</p>
            </div>
          </div>
          <div class="stock-list">
            ${products.filter((product) => product.stock < 5).length ? products.filter((product) => product.stock < 5).sort((a, b) => a.stock - b.stock).map((product) => `
              <article class="stock-item">
                <img src="${product.image}" alt="${product.name}" loading="lazy" width="56" height="56" style="--img-scale:${product.imageFocus.scale};--img-pos:${product.imageFocus.position};">
                <div>
                  <strong>${product.name}</strong>
                  <span class="muted">${FM.formatPrice(product.price)}</span>
                </div>
                <span class="status-pill ${FM.stockState(product.stock)}">${inventoryStatus(product.stock)}</span>
              </article>
            `).join("") : FM.buildEmptyState("No critical stock alerts.", "Products with less than 5 units will appear here.")}
          </div>
        </article>
      </section>
    `;
  }

  document.addEventListener("click", async (event) => {
    const saveButton = event.target.closest("[data-save-product]");
    if (!saveButton) return;
    const product = FM.getProductById(saveButton.dataset.saveProduct);
    if (!product) return;
    const stockInput = document.querySelector(`[data-field="stock"][data-product-id="${product.id}"]`);
    const priceInput = document.querySelector(`[data-field="price"][data-product-id="${product.id}"]`);
    const nextProduct = {
      ...product,
      stock: Math.max(0, Number(stockInput?.value || product.stock)),
      price: Number(Number(priceInput?.value || product.price).toFixed(2))
    };

    try {
      await firebase.saveProduct(product.id, nextProduct);
      FM.persistCatalog(FM.getCatalog().map((item) => item.id === product.id ? nextProduct : item));
      FM.showToast(`${product.name} updated`, "success");
      render(FM.getCatalog());
    } catch (error) {
      console.error(error);
      FM.showToast(error.message || "Could not update product", "error");
    }
  });

  document.addEventListener("freshmart:catalog-updated", () => {
    render(FM.getCatalog());
  });

  render(FM.getCatalog());
}
