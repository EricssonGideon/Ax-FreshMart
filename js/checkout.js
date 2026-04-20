document.addEventListener("DOMContentLoaded", async () => {
  const FM = window.FreshMart;
  if (!FM) return;
  await FM.initBasePage();

  if (document.body.dataset.page === "checkout") initCheckoutPage(FM);
});

async function initCheckoutPage(FM) {
  const form = document.getElementById("checkout-form");
  const summaryRoot = document.getElementById("checkout-summary-root");
  const deliveryType = document.getElementById("delivery-type");
  const firebase = FM.getFirebase();
  if (!form || !summaryRoot || !deliveryType) return;

  async function prefillUserDetails() {
    if (!firebase) return;
    const authState = await firebase.getAuthState();
    if (!authState.user || !authState.profile) return;
    document.getElementById("customer-name").value = authState.profile.name || authState.user.displayName || "";
    document.getElementById("customer-address").value = authState.profile.address || "";
    document.getElementById("customer-phone").value = authState.profile.phone || "";
    document.getElementById("customer-email").value = authState.profile.email || authState.user.email || "";
  }

  function renderSummary() {
    const info = FM.pricingSummary(deliveryType.value);
    summaryRoot.innerHTML = info.entries.length ? `
      <div class="order-list">
        ${info.entries.map((item) => `
          <div class="order-line">
            <div>
              <strong>${item.name}</strong>
              <small class="muted">${item.qty} × ${FM.formatPrice(item.price)}</small>
            </div>
            <strong>${FM.formatPrice(item.qty * item.price)}</strong>
          </div>
        `).join("")}
      </div>
      <div class="summary-line"><span>Subtotal</span><span>${FM.formatPrice(info.subtotal)}</span></div>
      <div class="summary-line discount"><span>Discount</span><span>-${FM.formatPrice(info.discount)}</span></div>
      <div class="summary-line"><span>Delivery</span><span>${FM.formatPrice(info.delivery)}</span></div>
      <div class="summary-line saved"><span>You Saved</span><span>${FM.formatPrice(info.totalSavings)}</span></div>
      <div class="summary-line total"><span>Total</span><span>${FM.formatPrice(info.total)}</span></div>
    ` : FM.buildEmptyState("No items ready for checkout.", "Add products to your cart to preview the full order summary here.");
  }

  deliveryType.addEventListener("change", renderSummary);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const info = FM.pricingSummary(deliveryType.value);
    if (!info.entries.length) {
      FM.showToast("Your cart is empty", "warn");
      return;
    }

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const address = String(data.get("address") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const slot = String(data.get("slot") || "");
    const type = String(data.get("deliveryType") || "standard");

    if (!name || !address || !phone || !email) {
      FM.showToast("Please complete all checkout fields", "warn");
      return;
    }

    try {
      if (!firebase) throw new Error("Firebase bootstrap file is missing.");

      const authState = await firebase.getAuthState();

      if (authState.user) {
        await firebase.saveUserProfile(authState.user.uid, {
          name,
          email,
          phone,
          address
        });
      }

      await firebase.saveOrder({
        userId: authState.user?.uid || null,
        customerName: name,
        customerEmail: email,
        phone,
        address,
        deliveryType: type,
        deliverySlot: slot,
        subtotal: info.subtotal,
        discount: info.discount,
        delivery: info.delivery,
        total: info.total,
        couponCode: FM.getCouponCode() || "",
        items: info.entries.map((item) => ({
          productId: item.id,
          sku: item.sku,
          name: item.name,
          price: item.price,
          qty: item.qty,
          unit: item.unit,
          image: item.image,
          stockAfterPurchase: Math.max(0, Number(item.stock || 0) - Number(item.qty || 0))
        }))
      });

      FM.setCart([]);
      form.reset();
      deliveryType.value = "standard";
      renderSummary();
      FM.showToast(`Order placed for ${name}`, "success");
      window.location.href = "profile.html";
    } catch (error) {
      console.error(error);
      FM.showToast(error.message || "Could not save order to Firebase", "error");
    }
  });

  document.addEventListener("freshmart:updated", renderSummary);
  await prefillUserDetails();
  renderSummary();
}
