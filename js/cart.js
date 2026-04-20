document.addEventListener("DOMContentLoaded", async () => {
  const FM = window.FreshMart;
  if (!FM) return;
  await FM.initBasePage();

  if (document.body.dataset.page === "cart") initCartPage(FM);
});

function initCartPage(FM) {
  const root = document.getElementById("cart-root");
  if (!root) return;

  function render() {
    const info = FM.pricingSummary();
    const suggestions = FM.getSuggestedProducts(info.entries.map((item) => item.id));

    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>Your Cart</h2>
          <p>${info.itemCount} item${info.itemCount === 1 ? "" : "s"} synced locally and with Firebase when signed in.</p>
        </div>
      </section>

      <section class="cart-layout">
        <div class="cart-items">
          ${info.entries.length ? info.entries.map((item) => `
            <article class="cart-item panel">
              <img src="${item.image}" alt="${item.name}" loading="lazy" width="64" height="64" style="--img-scale:${item.imageFocus.scale};--img-pos:${item.imageFocus.position};">
              <div>
                <div class="cart-item-top">
                  <div>
                    <strong>${item.name}</strong>
                    <div class="muted" style="font-size:12px">${item.unit}</div>
                  </div>
                  <button class="remove-btn pressable" type="button" data-cart-action="remove" data-product-id="${item.id}">Remove</button>
                </div>
                <div class="qty">
                  <button class="qty-btn pressable" type="button" data-cart-action="delta" data-product-id="${item.id}" data-delta="-1">-</button>
                  <span>${item.qty}</span>
                  <button class="qty-btn pressable" type="button" data-cart-action="delta" data-product-id="${item.id}" data-delta="1" ${item.qty >= item.stock ? "disabled" : ""}>+</button>
                  <span class="muted" style="font-size:12px">${FM.stockInline(item.stock)}</span>
                </div>
              </div>
              <strong style="font-family:'Playfair Display',serif;color:var(--brand)">${FM.formatPrice(item.qty * item.price)}</strong>
            </article>
          `).join("") : FM.buildEmptyState("Your cart is empty.", "Add products from the catalog, then use coupons and checkout options here like a real grocery app.")}
        </div>

        <aside class="checkout-summary">
          <h3 style="font-family:'Playfair Display',serif;font-size:28px;color:var(--brand)">Cart Summary</h3>
          <p class="helper" style="margin-top:6px">Use SAVE10, FRESH5, or FREESHIP.</p>
          <div class="coupon-box">
            <input id="coupon-input" type="text" placeholder="Coupon code" value="${FM.getCouponCode()}">
            <button class="btn-secondary pressable" id="apply-coupon" type="button">Apply</button>
          </div>
          <div class="summary-line"><span>Subtotal</span><span>${FM.formatPrice(info.subtotal)}</span></div>
          <div class="summary-line discount"><span>Discount</span><span>-${FM.formatPrice(info.discount)}</span></div>
          <div class="summary-line"><span>Delivery</span><span>${FM.formatPrice(info.delivery)}</span></div>
          <div class="summary-line saved"><span>You Saved</span><span>${FM.formatPrice(info.totalSavings)}</span></div>
          <div class="summary-line total"><span>Payable</span><span>${FM.formatPrice(info.total)}</span></div>
          <p class="helper" style="margin:8px 0 0">${info.couponMeta.message || (FM.getCouponCode() ? "Coupon not recognized." : "Coupons are applied at cart level and reused at checkout.")}</p>
          <a class="checkout-btn pressable" href="checkout.html" ${info.entries.length ? "" : "style='pointer-events:none;opacity:.55'"}>Proceed to Checkout</a>
        </aside>
      </section>

      <section class="section">
        <div class="section-head">
          <div>
            <h3>Suggested Products</h3>
            <p>Easy add-ons based on what is already in your basket.</p>
          </div>
        </div>
        <div class="product-grid">
          ${suggestions.length ? suggestions.map((product) => FM.buildProductCard(product, { hideDescription: true })).join("") : FM.buildEmptyState("Suggestions will appear soon.", "Add a product first so we can suggest related items.")}
        </div>
      </section>
    `;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (button) {
      const productId = button.dataset.productId;
      if (button.dataset.cartAction === "remove") FM.removeFromCart(productId);
      if (button.dataset.cartAction === "delta") FM.changeCartQty(productId, Number(button.dataset.delta));
    }

    if (event.target.id === "apply-coupon") {
      const input = document.getElementById("coupon-input");
      FM.setCouponCode((input?.value || "").trim().toUpperCase());
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "coupon-input") {
      event.preventDefault();
      FM.setCouponCode(event.target.value.trim().toUpperCase());
      render();
    }
  });

  document.addEventListener("freshmart:updated", render);
  document.addEventListener("freshmart:catalog-updated", render);
  render();
}
