document.addEventListener("DOMContentLoaded", async () => {
  const FM = window.FreshMart;
  const firebase = window.FreshMartFirebase;
  if (!FM || !firebase) return;
  await FM.initBasePage();

  if (document.body.dataset.page !== "profile") return;

  const root = document.getElementById("profile-root");
  if (!root) return;

  const authState = await firebase.getAuthState();
  if (!authState.user) {
    sessionStorage.setItem("freshmart_flash_message", "Please sign in first");
    window.location.href = "login.html";
    return;
  }

  let latestOrders = [];
  let unsubscribe = null;
  let editing = !Boolean(authState.profile?.name || authState.profile?.address || authState.profile?.phone);

  function statusClass(status) {
    return status === "delivered" ? "good" : status === "processing" ? "low" : "out";
  }

  function render() {
    const profile = authState.profile || {};
    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>My Profile</h2>
          <p>Manage personal details, delivery address, and past orders.</p>
        </div>
      </section>

      <section class="profile-layout">
        <article class="inventory-card">
          <div class="section-head" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:24px">Profile Details</h3>
              <p>Saved to Firestore and reused in checkout.</p>
            </div>
            ${editing ? "" : `<button class="btn-secondary pressable" type="button" id="edit-profile-btn">Edit</button>`}
          </div>
          ${editing ? `
            <form id="profile-form" class="checkout-form">
              <div class="field"><label for="profile-name">Name</label><input id="profile-name" name="name" type="text" value="${FM.escapeHtml(profile.name || authState.user.displayName || "")}" required></div>
              <div class="field"><label for="profile-email">Email</label><input id="profile-email" name="email" type="email" value="${FM.escapeHtml(profile.email || authState.user.email || "")}" required></div>
              <div class="field"><label for="profile-phone">Phone</label><input id="profile-phone" name="phone" type="tel" value="${FM.escapeHtml(profile.phone || "")}"></div>
              <div class="field"><label for="profile-address">Address</label><textarea id="profile-address" name="address" placeholder="Delivery address">${FM.escapeHtml(profile.address || "")}</textarea></div>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button class="checkout-btn pressable" type="submit">Save Profile</button>
                ${authState.profile ? `<button class="btn-secondary pressable" type="button" id="cancel-profile-edit">Cancel</button>` : ""}
              </div>
            </form>
          ` : `
            <div class="profile-summary-card">
              <div class="profile-summary-line"><strong>Name</strong><span>${FM.escapeHtml(profile.name || authState.user.displayName || "Not set")}</span></div>
              <div class="profile-summary-line"><strong>Email</strong><span>${FM.escapeHtml(profile.email || authState.user.email || "Not set")}</span></div>
              <div class="profile-summary-line"><strong>Phone</strong><span>${FM.escapeHtml(profile.phone || "Not set")}</span></div>
              <div class="profile-summary-line"><strong>Address</strong><span>${FM.escapeHtml(profile.address || "Not set")}</span></div>
            </div>
          `}
        </article>

        <article class="inventory-card">
          <div class="section-head" style="margin-bottom:12px">
            <div>
              <h3 style="font-size:24px">Order History</h3>
              <p>Realtime order history for the signed-in customer.</p>
            </div>
          </div>
          <div class="order-list-grid">
            ${latestOrders.length ? latestOrders.map((order) => `
              <article class="order-card">
                <div class="order-card-head">
                  <div>
                    <h3 style="font-size:22px">${order.createdAtLabel}</h3>
                    <p class="helper" style="margin-top:8px">${FM.escapeHtml(order.deliveryType || "standard")} · ${FM.escapeHtml(order.deliverySlot || "")}</p>
                  </div>
                  <span class="save-pill">${FM.formatPrice(order.total || 0)}</span>
                </div>
                <div class="admin-order-meta">
                  <span class="status-pill ${statusClass(order.status)}">${FM.escapeHtml(order.status || "pending")}</span>
                  <button class="btn-secondary pressable" type="button" data-reorder-id="${order.id}">Reorder</button>
                </div>
                <div class="order-items">
                  ${(order.items || []).map((item) => `
                    <div class="order-item-line">
                      <div>
                        <strong>${FM.escapeHtml(item.name)}</strong>
                        <div class="muted" style="font-size:12px">${item.qty} × ${FM.formatPrice(item.price)}</div>
                      </div>
                      <strong>${FM.formatPrice(item.qty * item.price)}</strong>
                    </div>
                  `).join("")}
                </div>
              </article>
            `).join("") : FM.buildEmptyState("No orders yet.", "Your placed orders will appear here automatically.")}
          </div>
        </article>
      </section>
    `;
  }

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "profile-form") return;
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      authState.profile = await firebase.saveUserProfile(authState.user.uid, {
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        address: String(data.get("address") || "").trim()
      });
      editing = false;
      FM.showToast("Profile updated", "success");
      render();
    } catch (error) {
      console.error(error);
      FM.showToast(error.message || "Could not update profile", "error");
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.id === "edit-profile-btn") {
      editing = true;
      render();
      return;
    }

    if (event.target.id === "cancel-profile-edit") {
      editing = false;
      render();
      return;
    }

    const button = event.target.closest("[data-reorder-id]");
    if (!button) return;
    const order = latestOrders.find((entry) => entry.id === button.dataset.reorderId);
    if (!order) return;
    FM.reorderItems(order.items || []);
    window.location.href = "cart.html";
  });

  unsubscribe = await firebase.subscribeUserOrders(authState.user.uid, (orders) => {
    latestOrders = orders;
    render();
  });

  window.addEventListener("beforeunload", () => unsubscribe?.(), { once: true });
  render();
});
