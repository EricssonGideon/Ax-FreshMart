document.addEventListener("DOMContentLoaded", async () => {
  const FM = window.FreshMart;
  const firebase = window.FreshMartFirebase;
  if (!FM || !firebase) return;
  await FM.initBasePage();

  if (document.body.dataset.page !== "login") return;

  const root = document.getElementById("auth-root");
  if (!root) return;

  async function render(mode = "login") {
    const authState = await firebase.getAuthState();
    const signedIn = authState.user;
    root.innerHTML = `
      <section class="page-header">
        <div class="page-title">
          <h2>${signedIn ? "Account Access" : "Login & Register"}</h2>
          <p>${firebase && authState.configured ? "Firebase Auth is ready for password-based login." : "Add your Firebase config to enable authentication and Firestore writes."}</p>
        </div>
      </section>

      <section class="auth-layout">
        <article class="auth-card">
          <div class="auth-tabs">
            <button class="chip pressable ${mode === "login" ? "active" : ""}" type="button" data-auth-mode="login">Login</button>
            <button class="chip pressable ${mode === "register" ? "active" : ""}" type="button" data-auth-mode="register">Register</button>
          </div>

          ${signedIn ? `
            <h3>${FM.escapeHtml(authState.profile?.name || authState.user.email || "FreshMart account")}</h3>
            <p class="helper" style="margin-top:10px">Signed in as ${FM.escapeHtml(authState.user.email || "current user")} with role <strong>${FM.escapeHtml(authState.profile?.role || "user")}</strong>.</p>
            <div class="auth-message">Use the profile page for address details, order history, and reordering. Admins can open the dashboard and inventory tools from the main navigation.</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">
              <a class="btn-secondary pressable" href="profile.html">Open Profile</a>
              <a class="btn-secondary pressable" href="admin.html">Open Admin Dashboard</a>
              <button class="btn-primary pressable" type="button" id="auth-sign-out">Sign Out</button>
            </div>
          ` : `
            <h3>${mode === "login" ? "Welcome back" : "Create account"}</h3>
            <p class="helper" style="margin-top:10px">${mode === "login" ? "Use your email and password to access synced cart and order history." : "New accounts are stored in Firebase Auth and mirrored into the Firestore users collection."}</p>
            <form class="checkout-form" id="auth-form" style="margin-top:18px">
              ${mode === "register" ? `<div class="field"><label for="auth-name">Name</label><input id="auth-name" name="name" type="text" placeholder="Enter full name" required></div>` : ""}
              <div class="field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" placeholder="name@example.com" required></div>
              <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" placeholder="Enter password" required></div>
              ${mode === "register" ? `<div class="field"><label for="auth-phone">Phone</label><input id="auth-phone" name="phone" type="tel" placeholder="07X XXX XXXX"></div>` : ""}
              ${mode === "register" ? `<div class="field"><label for="auth-address">Address</label><textarea id="auth-address" name="address" placeholder="Delivery address"></textarea></div>` : ""}
              <button class="checkout-btn pressable" type="submit">${mode === "login" ? "Login" : "Create Account"}</button>
            </form>
          `}
        </article>

        <article class="auth-card">
          <h3>FreshMart Notes</h3>
          <p class="helper" style="margin-top:10px">This storefront uses modular Firebase Auth and Firestore collections for <code>products</code>, <code>orders</code>, <code>users</code>, and <code>carts</code>.</p>
          <div class="auth-message">
            Admin access is role-based. A user's Firestore document in the <code>users</code> collection must contain <strong>role: "admin"</strong>.
          </div>
        </article>
      </section>
    `;

    bind(mode);
  }

  function bind(mode) {
    root.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => render(button.dataset.authMode));
    });

    const signOutButton = document.getElementById("auth-sign-out");
    signOutButton?.addEventListener("click", async () => {
      await firebase.signOutUser();
      FM.showToast("Signed out successfully", "info");
      window.location.href = "login.html";
    });

    const form = document.getElementById("auth-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = new FormData(form);
        if (mode === "login") {
          await firebase.signInUser({
            email: String(data.get("email") || "").trim(),
            password: String(data.get("password") || "")
          });
          FM.showToast("Logged in successfully", "success");
        } else {
          await firebase.registerUser({
            name: String(data.get("name") || "").trim(),
            email: String(data.get("email") || "").trim(),
            password: String(data.get("password") || ""),
            phone: String(data.get("phone") || "").trim(),
            address: String(data.get("address") || "").trim()
          });
          FM.showToast("Account created successfully", "success");
        }
        window.location.href = "profile.html";
      } catch (error) {
        console.error(error);
        FM.showToast(error.message || "Authentication failed", "error");
      }
    });
  }

  document.addEventListener("freshmart:auth-changed", () => render("login"));
  render("login");
});
