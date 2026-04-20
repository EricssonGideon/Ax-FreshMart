(function () {
  const config = window.FRESHMART_FIREBASE_CONFIG || {};
  const collections = window.FRESHMART_FIREBASE_COLLECTIONS || {
    products: "products",
    orders: "orders",
    users: "users",
    carts: "carts"
  };

  if (!collections.carts) collections.carts = "carts";

  const state = {
    configured: Boolean(config.apiKey && config.projectId && config.appId),
    ready: false,
    app: null,
    db: null,
    auth: null,
    modules: null,
    user: null,
    profile: null
  };

  async function setupFirebase() {
    if (!state.configured) return state;

    const [appModule, authModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js")
    ]);

    state.modules = { appModule, authModule, firestoreModule };
    state.app = appModule.initializeApp(config);
    state.auth = authModule.getAuth(state.app);
    state.db = firestoreModule.getFirestore(state.app);

    authModule.onAuthStateChanged(state.auth, async (user) => {
      state.user = user;
      state.profile = user ? await fetchUserProfile(user.uid) : null;
      document.dispatchEvent(new CustomEvent("freshmart:auth-changed", {
        detail: { user: state.user, profile: state.profile }
      }));
    });

    state.ready = true;
    return state;
  }

  const ready = setupFirebase().catch((error) => {
    console.error("Firebase initialization failed", error);
    return state;
  });

  async function whenReady() {
    return ready;
  }

  function normalizeDoc(docSnapshot) {
    const data = docSnapshot.data();
    return { id: docSnapshot.id, ...data };
  }

  function mapOrder(docSnapshot) {
    const data = docSnapshot.data();
    const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    return {
      id: docSnapshot.id,
      ...data,
      status: data.status || "pending",
      createdAtLabel: createdAtDate ? createdAtDate.toLocaleString() : "Pending server timestamp",
      createdAtDate
    };
  }

  async function fetchUserProfile(uid) {
    await whenReady();
    if (!state.db || !uid) return null;

    const { doc, getDoc } = state.modules.firestoreModule;
    const snapshot = await getDoc(doc(state.db, collections.users, uid));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  }

  async function saveUserProfile(uid, payload) {
    await whenReady();
    if (!state.db || !uid) return null;

    const { doc, setDoc, serverTimestamp } = state.modules.firestoreModule;
    await setDoc(doc(state.db, collections.users, uid), {
      ...payload,
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.profile = await fetchUserProfile(uid);
    return state.profile;
  }

  async function registerUser({ name, email, password, phone, address }) {
    await whenReady();
    if (!state.auth) throw new Error("Firebase is not configured.");

    const { createUserWithEmailAndPassword, updateProfile } = state.modules.authModule;
    const credential = await createUserWithEmailAndPassword(state.auth, email, password);
    if (name) await updateProfile(credential.user, { displayName: name });
    await saveUserProfile(credential.user.uid, {
      name,
      email,
      phone: phone || "",
      address: address || "",
      role: "user"
    });
    return credential.user;
  }

  async function signInUser({ email, password }) {
    await whenReady();
    if (!state.auth) throw new Error("Firebase is not configured.");

    const { signInWithEmailAndPassword } = state.modules.authModule;
    const credential = await signInWithEmailAndPassword(state.auth, email, password);
    state.profile = await fetchUserProfile(credential.user.uid);
    return credential.user;
  }

  async function signOutUser() {
    await whenReady();
    if (!state.auth) return;
    const { signOut } = state.modules.authModule;
    await signOut(state.auth);
  }

  async function getAuthState() {
    await whenReady();
    return {
      configured: state.configured,
      ready: state.ready,
      user: state.user,
      profile: state.profile
    };
  }

  async function fetchProducts() {
    await whenReady();
    if (!state.db) return [];

    const { collection, getDocs, orderBy, query } = state.modules.firestoreModule;
    const snapshot = await getDocs(query(collection(state.db, collections.products), orderBy("name")));
    return snapshot.docs.map((docSnapshot) => normalizeDoc(docSnapshot));
  }

  async function subscribeProducts(callback) {
    await whenReady();
    if (!state.db) return () => {};

    const { collection, onSnapshot, orderBy, query } = state.modules.firestoreModule;
    return onSnapshot(
      query(collection(state.db, collections.products), orderBy("name")),
      (snapshot) => callback(snapshot.docs.map((docSnapshot) => normalizeDoc(docSnapshot))),
      (error) => console.error("Product subscription failed", error)
    );
  }

  async function syncProducts(products) {
    await whenReady();
    if (!state.db) throw new Error("Firebase is not configured.");

    const { doc, writeBatch, serverTimestamp } = state.modules.firestoreModule;
    const batch = writeBatch(state.db);
    products.forEach((product) => {
      batch.set(doc(state.db, collections.products, String(product.id)), {
        ...product,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }

  async function saveProduct(productId, payload) {
    await whenReady();
    if (!state.db) throw new Error("Firebase is not configured.");

    const { doc, setDoc, serverTimestamp } = state.modules.firestoreModule;
    await setDoc(doc(state.db, collections.products, String(productId)), {
      ...payload,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  async function saveOrder(orderPayload) {
    await whenReady();
    if (!state.db) throw new Error("Firebase is not configured.");

    const { addDoc, collection, doc, serverTimestamp, writeBatch } = state.modules.firestoreModule;
    const batch = writeBatch(state.db);
    const orderRef = doc(collection(state.db, collections.orders));
    const items = Array.isArray(orderPayload.items) ? orderPayload.items : [];

    batch.set(orderRef, {
      ...orderPayload,
      items,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    items.forEach((item) => {
      if (!item.productId) return;
      const productRef = doc(state.db, collections.products, String(item.productId));
      batch.set(productRef, {
        stock: Math.max(0, Number(item.stockAfterPurchase ?? 0)),
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();
    return orderRef.id;
  }

  async function fetchOrders({ latestOnly = false, limitCount = 10, status = "all" } = {}) {
    await whenReady();
    if (!state.db) return [];

    const { collection, getDocs, limit, orderBy, query, where } = state.modules.firestoreModule;
    const constraints = [];
    if (status !== "all") constraints.push(where("status", "==", status));
    constraints.push(orderBy("createdAt", "desc"));
    if (latestOnly) constraints.push(limit(limitCount));
    const snapshot = await getDocs(query(collection(state.db, collections.orders), ...constraints));
    return snapshot.docs.map((docSnapshot) => mapOrder(docSnapshot));
  }

  async function subscribeOrders(callback, { status = "all", latestOnly = false, limitCount = 20 } = {}) {
    await whenReady();
    if (!state.db) return () => {};

    const { collection, limit, onSnapshot, orderBy, query, where } = state.modules.firestoreModule;
    const constraints = [];
    if (status !== "all") constraints.push(where("status", "==", status));
    constraints.push(orderBy("createdAt", "desc"));
    if (latestOnly) constraints.push(limit(limitCount));
    return onSnapshot(
      query(collection(state.db, collections.orders), ...constraints),
      (snapshot) => callback(snapshot.docs.map((docSnapshot) => mapOrder(docSnapshot))),
      (error) => console.error("Order subscription failed", error)
    );
  }

  async function subscribeUserOrders(uid, callback) {
    await whenReady();
    if (!state.db || !uid) return () => {};

    const { collection, onSnapshot, orderBy, query, where } = state.modules.firestoreModule;
    return onSnapshot(
      query(collection(state.db, collections.orders), where("userId", "==", uid), orderBy("createdAt", "desc")),
      (snapshot) => callback(snapshot.docs.map((docSnapshot) => mapOrder(docSnapshot))),
      (error) => console.error("User order subscription failed", error)
    );
  }

  async function updateOrderStatus(orderId, status) {
    await whenReady();
    if (!state.db) throw new Error("Firebase is not configured.");

    const { doc, updateDoc, serverTimestamp } = state.modules.firestoreModule;
    await updateDoc(doc(state.db, collections.orders, String(orderId)), {
      status,
      updatedAt: serverTimestamp()
    });
  }

  async function saveUserCart(uid, items) {
    await whenReady();
    if (!state.db || !uid) return;

    const { doc, serverTimestamp, setDoc } = state.modules.firestoreModule;
    await setDoc(doc(state.db, collections.carts, uid), {
      items,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  async function fetchUserCart(uid) {
    await whenReady();
    if (!state.db || !uid) return [];

    const { doc, getDoc } = state.modules.firestoreModule;
    const snapshot = await getDoc(doc(state.db, collections.carts, uid));
    if (!snapshot.exists()) return [];
    const data = snapshot.data();
    return Array.isArray(data.items) ? data.items : [];
  }

  async function subscribeUserCart(uid, callback) {
    await whenReady();
    if (!state.db || !uid) return () => {};

    const { doc, onSnapshot } = state.modules.firestoreModule;
    return onSnapshot(
      doc(state.db, collections.carts, uid),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        callback(Array.isArray(data.items) ? data.items : []);
      },
      (error) => console.error("Cart subscription failed", error)
    );
  }

  async function requireAdminProfile(options = {}) {
    const authState = await getAuthState();
    const isAdmin = Boolean(authState.user && authState.profile?.role === "admin");
    if (isAdmin) return true;

    if (options.redirectOnFail) {
      try {
        sessionStorage.setItem("freshmart_flash_message", options.message || "Admin access only");
      } catch (error) {
        console.warn("Could not store flash message", error);
      }
      window.location.href = options.redirectTo || "index.html";
    }
    return false;
  }

  window.FreshMartFirebase = {
    ready,
    collections,
    getAuthState,
    registerUser,
    signInUser,
    signOutUser,
    fetchUserProfile,
    saveUserProfile,
    fetchProducts,
    subscribeProducts,
    syncProducts,
    saveProduct,
    saveOrder,
    fetchOrders,
    subscribeOrders,
    subscribeUserOrders,
    updateOrderStatus,
    saveUserCart,
    fetchUserCart,
    subscribeUserCart,
    requireAdminProfile
  };
})();
