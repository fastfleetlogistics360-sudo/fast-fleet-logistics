(function () {
  "use strict";

  var CONFIG = window.FASTFLEET_SUPABASE || {};
  var TABLES = {
    orders: CONFIG.ordersTable || "delivery_orders",
    profiles: CONFIG.profilesTable || "user_profiles"
  };
  var supabaseClient = null;
  var mapRegistry = {};

  var STORAGE = {
    session: "fastfleet.session",
    profiles: "fastfleet.profiles",
    orders: "fastfleet.orders",
    riders: "fastfleet.riders",
    businesses: "fastfleet.businesses",
    tickets: "fastfleet.tickets",
    deletionRequests: "fastfleet.accountDeletionRequests",
    consent: "fastfleet.dataConsent",
    wallet: "fastfleet.wallet",
    walletTransactions: "fastfleet.wallet.transactions",
    theme: "fastfleet.theme"
  };

  var STATUS_FLOW = [
    "Order received",
    "Courier assigned",
    "Picked up",
    "In transit",
    "Delivered"
  ];

  function iconSvg(name) {
    var icons = {
      home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
      order: '<path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/>',
      track: '<path d="M12 21s7-4.8 7-11a7 7 0 0 0-14 0c0 6.2 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
      dashboard: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
      services: '<path d="M4 7h16"/><path d="M7 7v10"/><path d="M17 7v10"/><path d="M5 17h14"/><path d="M9 4h6l1 3H8z"/>',
      riders: '<circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M7 17h4l2-6h3l2 6"/><path d="M11 11 9 8h4"/><path d="M15 7h2"/>',
      support: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M4 12v4a2 2 0 0 0 2 2h1v-6H4Z"/><path d="M20 12v4a2 2 0 0 1-2 2h-1v-6h3Z"/><path d="M14 20h-3"/>',
      account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      wallet: '<path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z"/><path d="M4 7V5a2 2 0 0 1 2-2h11"/><path d="M17 13h4"/><circle cx="17" cy="13" r="1"/>',
      activity: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 4-7"/>',
      privacy: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/><path d="M9.5 12.5 11 14l3.5-4"/>',
      book: '<path d="M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 1-3-3z"/><path d="M8 4v16"/><path d="M10 8h5"/><path d="M10 12h4"/>',
      menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
      close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>'
    };
    return '<svg class="menu-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.account) + "</svg>";
  }

  var COURIERS = [
    { name: "Tunde A.", vehicle: "Motorbike", rating: "4.94", phone: "+234 801 220 4410" },
    { name: "Amara N.", vehicle: "Car", rating: "4.91", phone: "+234 809 117 3320" },
    { name: "Kelvin O.", vehicle: "Van", rating: "4.88", phone: "+234 806 551 0921" },
    { name: "Seyi B.", vehicle: "Box truck", rating: "4.96", phone: "+234 810 456 7712" }
  ];

  var LOCATION_SUGGESTIONS = [
    "Aba, Abia", "Umuahia, Abia", "Yola, Adamawa", "Uyo, Akwa Ibom", "Awka, Anambra",
    "Onitsha, Anambra", "Nnewi, Anambra", "Bauchi, Bauchi", "Yenagoa, Bayelsa", "Makurdi, Benue",
    "Maiduguri, Borno", "Calabar, Cross River", "Asaba, Delta", "Warri, Delta", "Sapele, Delta",
    "Abakaliki, Ebonyi", "Benin City, Edo", "Ado Ekiti, Ekiti", "Enugu, Enugu", "Abuja, FCT",
    "Gombe, Gombe", "Owerri, Imo", "Dutse, Jigawa", "Kaduna, Kaduna", "Zaria, Kaduna",
    "Kano, Kano", "Katsina, Katsina", "Birnin Kebbi, Kebbi", "Lokoja, Kogi", "Ilorin, Kwara",
    "Ikeja, Lagos", "Lagos Island, Lagos", "Victoria Island, Lagos", "Lekki, Lagos", "Ajah, Lagos",
    "Ikorodu, Lagos", "Epe, Lagos", "Badagry, Lagos", "Surulere, Lagos", "Yaba, Lagos",
    "Maryland, Lagos", "Ogba, Lagos", "Agege, Lagos", "Mushin, Lagos", "Apapa, Lagos",
    "Abeokuta, Ogun", "Ijebu Ode, Ogun", "Sagamu, Ogun", "Ota, Ogun", "Ilaro, Ogun",
    "Agbara, Ogun", "Mowe, Ogun", "Ibafo, Ogun", "Sango Ota, Ogun", "Owode, Ogun",
    "Lafia, Nasarawa", "Minna, Niger", "Akure, Ondo", "Osogbo, Osun", "Ile Ife, Osun",
    "Ibadan, Oyo", "Ogbomoso, Oyo", "Jos, Plateau", "Port Harcourt, Rivers", "Sokoto, Sokoto",
    "Jalingo, Taraba", "Damaturu, Yobe", "Gusau, Zamfara",
    "Adetokunbo Ademola Street, Victoria Island, Lagos", "Ahmadu Bello Way, Victoria Island, Lagos",
    "Akin Adesola Street, Victoria Island, Lagos", "Bishop Oluwole Street, Victoria Island, Lagos",
    "Kofo Abayomi Street, Victoria Island, Lagos", "Ozumba Mbadiwe Avenue, Victoria Island, Lagos",
    "Adeola Odeku Street, Victoria Island, Lagos", "Ligali Ayorinde Street, Victoria Island, Lagos",
    "Awolowo Road, Ikoyi, Lagos", "Bourdillon Road, Ikoyi, Lagos", "Glover Road, Ikoyi, Lagos",
    "Kingsway Road, Ikoyi, Lagos", "Alexander Avenue, Ikoyi, Lagos", "Banana Island Road, Ikoyi, Lagos",
    "Admiralty Way, Lekki Phase 1, Lagos", "Fola Osibo Street, Lekki Phase 1, Lagos",
    "Adebayo Doherty Road, Lekki Phase 1, Lagos", "Freedom Way, Lekki Phase 1, Lagos",
    "Agungi Ajiran Road, Lekki, Lagos", "Chevron Drive, Lekki, Lagos", "Orchid Road, Lekki, Lagos",
    "Elf Bus Stop, Lekki Epe Expressway, Lagos", "Abraham Adesanya Road, Ajah, Lagos",
    "Addo Road, Ajah, Lagos", "Badore Road, Ajah, Lagos", "Ogombo Road, Ajah, Lagos",
    "Allen Avenue, Ikeja, Lagos", "Adeniyi Jones Avenue, Ikeja, Lagos", "Obafemi Awolowo Way, Ikeja, Lagos",
    "Opebi Road, Ikeja, Lagos", "Toyin Street, Ikeja, Lagos", "Alausa Secretariat Road, Ikeja, Lagos",
    "Mobolaji Bank Anthony Way, Ikeja, Lagos", "Kudirat Abiola Way, Oregun, Lagos",
    "Ikorodu Road, Maryland, Lagos", "Town Planning Way, Ilupeju, Lagos", "Coker Road, Ilupeju, Lagos",
    "Bode Thomas Street, Surulere, Lagos", "Adeniran Ogunsanya Street, Surulere, Lagos",
    "Ogunlana Drive, Surulere, Lagos", "Adelabu Street, Surulere, Lagos", "Western Avenue, Surulere, Lagos",
    "Herbert Macaulay Way, Yaba, Lagos", "Murtala Muhammed Way, Yaba, Lagos", "Commercial Avenue, Yaba, Lagos",
    "University Road, Akoka, Lagos", "Adeniji Adele Road, Lagos Island, Lagos", "Broad Street, Lagos Island, Lagos",
    "Marina Road, Lagos Island, Lagos", "Nnamdi Azikiwe Street, Lagos Island, Lagos",
    "Apapa Oshodi Expressway, Lagos", "Creek Road, Apapa, Lagos", "Liverpool Road, Apapa, Lagos",
    "Fatai Atere Way, Mushin, Lagos", "Ladipo Street, Mushin, Lagos", "Ago Palace Way, Okota, Lagos",
    "Okota Road, Isolo, Lagos", "Iyana Ipaja Road, Lagos", "Lasu Isheri Road, Lagos",
    "Abeokuta Expressway, Lagos", "Oba Akran Avenue, Ikeja, Lagos", "Iju Road, Agege, Lagos",
    "College Road, Ogba, Lagos", "Acme Road, Ogba, Lagos", "Ketu Ikosi Road, Lagos",
    "CMD Road, Magodo, Lagos", "Aina Street, Ojodu, Lagos", "Osolo Way, Ajao Estate, Lagos",
    "Awolowo Avenue, Abeokuta, Ogun", "Kuto Road, Abeokuta, Ogun", "Lalubu Road, Abeokuta, Ogun",
    "Panseke Road, Abeokuta, Ogun", "Ibara Housing Estate Road, Abeokuta, Ogun",
    "Asero Road, Abeokuta, Ogun", "Onikolobo Road, Abeokuta, Ogun", "Lafenwa Road, Abeokuta, Ogun",
    "Sapon Road, Abeokuta, Ogun", "Oke Ilewo Road, Abeokuta, Ogun", "Abeokuta Sagamu Road, Ogun",
    "Lagos Abeokuta Expressway, Ogun", "Idi Iroko Road, Ogun", "Ota Idiroko Road, Ogun",
    "Joju Road, Ota, Ogun", "Iju Ota Road, Ota, Ogun", "Tollgate Road, Ota, Ogun",
    "Atan Ota Road, Ogun", "Agbara Lusada Road, Ogun", "Mowe Ofada Road, Ogun",
    "Ibafo Road, Ogun", "Sagamu Benin Expressway, Ogun", "Akarigbo Road, Sagamu, Ogun",
    "Ijebu Ode Epe Road, Ogun", "Folagbade Street, Ijebu Ode, Ogun", "Abeokuta Ilaro Road, Ogun"
  ];

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function preferredTheme() {
    var saved = "";
    try {
      saved = localStorage.getItem(STORAGE.theme) || "";
    } catch (error) {
      saved = "";
    }
    if (saved === "dark" || saved === "light") return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }

  function applyTheme(theme) {
    var nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
    try {
      localStorage.setItem(STORAGE.theme, nextTheme);
    } catch (error) {
      // Theme still applies for the current page when storage is unavailable.
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      var active = button.getAttribute("data-theme-choice") === nextTheme;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function themeToggleMarkup() {
    return "" +
      '<div class="theme-toggle" data-theme-toggle aria-label="Theme">' +
        '<button type="button" data-theme-choice="light" aria-label="Use light theme">☀</button>' +
        '<button type="button" data-theme-choice="dark" aria-label="Use dark theme">☾</button>' +
      "</div>";
  }

  function initTheme() {
    document.querySelectorAll(".nav-actions").forEach(function (nav) {
      if (!nav.querySelector("[data-theme-toggle]")) {
        nav.insertAdjacentHTML("afterbegin", themeToggleMarkup());
      }
    });
    document.querySelectorAll(".mobile-panel").forEach(function (panel) {
      if (!panel.querySelector("[data-theme-toggle]")) {
        panel.insertAdjacentHTML("afterbegin", '<div class="mobile-theme-row">' + themeToggleMarkup() + "</div>");
      }
    });
    if (!document.querySelector("[data-theme-toggle]")) {
      document.body.insertAdjacentHTML("afterbegin", '<div class="floating-theme-toggle">' + themeToggleMarkup() + "</div>");
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyTheme(button.getAttribute("data-theme-choice"));
      });
    });
    applyTheme(preferredTheme());
  }

  function hasSupabaseConfig() {
    var host = String(location.hostname || "");
    if (host.indexOf("hcodx.com") !== -1 || host === "localhost" || host === "127.0.0.1") return false;
    return Boolean(
      window.supabase &&
      CONFIG.url &&
      CONFIG.anonKey &&
      CONFIG.url.indexOf("YOUR_") === -1 &&
      CONFIG.anonKey.indexOf("YOUR_") === -1
    );
  }

  function client() {
    if (!hasSupabaseConfig()) return null;
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
    }
    return supabaseClient;
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function textFromForm(form, name) {
    var field = form.elements[name];
    return field ? String(field.value || "").trim() : "";
  }

  function selectedValue(form, name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    if (checked) return checked.value;
    return textFromForm(form, name);
  }

  function simpleHash(text) {
    var hash = 0;
    var str = String(text || "");
    for (var i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function formatMoney(value) {
    var amount = Math.max(0, Math.round(Number(value) || 0));
    return "NGN " + amount.toLocaleString("en-NG");
  }

  function firstName(value) {
    return String(value || "there").trim().split(/\s+/)[0] || "there";
  }

  function sessionRole(session) {
    var meta = session && session.user && session.user.user_metadata ? session.user.user_metadata : {};
    return meta.role || meta.account_type || "customer";
  }

  function walletBalance() {
    return Number(readJson(STORAGE.wallet, { balance: 0 }).balance || 0);
  }

  function writeWalletBalance(balance) {
    writeJson(STORAGE.wallet, { balance: Math.max(0, Number(balance) || 0), updated_at: new Date().toISOString() });
  }

  function walletTransactions() {
    return readJson(STORAGE.walletTransactions, []);
  }

  function addWalletTransaction(type, amount, detail, status, provider) {
    var rows = walletTransactions();
    rows.unshift({
      type: type,
      amount: Number(amount) || 0,
      detail: detail || "FastFleet wallet",
      status: status || "successful",
      provider: provider || "FastFleet",
      created_at: new Date().toISOString()
    });
    writeJson(STORAGE.walletTransactions, rows.slice(0, 20));
  }

  function formatDate(value) {
    if (!value) return "Today";
    try {
      return new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (error) {
      return String(value);
    }
  }

  function makeOrderCode() {
    var tail = Date.now().toString().slice(-6);
    var suffix = Math.floor(10 + Math.random() * 90);
    return "FFL-" + tail + "-" + suffix;
  }

  function vehicleLabel(value) {
    return {
      bike: "Motorbike",
      car: "Car",
      van: "Delivery van",
      truck: "Box truck"
    }[value] || "Motorbike";
  }

  function speedLabel(value) {
    return {
      standard: "Standard",
      express: "Express",
      priority: "Priority",
      scheduled: "Scheduled"
    }[value] || "Standard";
  }

  function statusClass(status) {
    if (status === "Delivered") return "green";
    if (status === "In transit" || status === "Picked up") return "orange";
    return "";
  }

  function estimateDelivery(input) {
    var pickup = input.pickup || "";
    var dropoff = input.dropoff || "";
    var vehicle = input.vehicle || "bike";
    var speed = input.speed || "standard";
    var seed = simpleHash(pickup + "|" + dropoff + "|" + vehicle);
    var distance = Math.max(2.4, Math.round(((seed % 290) / 10 + 3.2) * 10) / 10);
    var base = { bike: 1800, car: 3200, van: 6500, truck: 12000 }[vehicle] || 1800;
    var perKm = { bike: 220, car: 320, van: 520, truck: 880 }[vehicle] || 220;
    var multiplier = { standard: 1, express: 1.28, priority: 1.68, scheduled: 1.12 }[speed] || 1;
    var price = (base + distance * perKm) * multiplier;
    var minutes = Math.round((distance / (vehicle === "bike" ? 28 : 22)) * 60 + (speed === "standard" || speed === "scheduled" ? 28 : 14));

    return {
      distance: distance,
      price: Math.round(price / 50) * 50,
      eta: Math.max(18, minutes)
    };
  }

  function courierFor(order) {
    var list = COURIERS.filter(function (courier) {
      if (order.vehicle_type === "bike") return courier.vehicle === "Motorbike";
      if (order.vehicle_type === "car") return courier.vehicle === "Car";
      if (order.vehicle_type === "van") return courier.vehicle === "Van";
      if (order.vehicle_type === "truck") return courier.vehicle === "Box truck";
      return true;
    });
    var candidates = list.length ? list : COURIERS;
    return candidates[simpleHash(order.order_code || order.pickup_address) % candidates.length];
  }

  function sampleOrder() {
    var order = {
      order_code: "FFL-DEMO-1001",
      customer_name: "Demo customer",
      customer_phone: "+234 800 000 0000",
      recipient_name: "Recipient",
      recipient_phone: "+234 800 111 1111",
      pickup_address: "Victoria Island, Lagos",
      dropoff_address: "Ikeja GRA, Lagos",
      package_type: "Retail parcel",
      vehicle_type: "bike",
      delivery_speed: "express",
      payment_method: "card",
      distance_km: 22.4,
      price_ngn: 10850,
      status: "In transit",
      created_at: new Date().toISOString()
    };
    var courier = courierFor(order);
    order.courier_name = courier.name;
    order.courier_phone = courier.phone;
    return order;
  }

  async function getSession() {
    var c = client();
    if (c) {
      try {
        var result = await c.auth.getSession();
        if (result.data && result.data.session) return result.data.session;
      } catch (error) {
        showToast("Supabase session check failed. Demo session is still available.", "error");
      }
    }
    return readJson(STORAGE.session, null);
  }

  function localSessionFrom(profile) {
    return {
      access_token: "local-demo-session",
      user: {
        id: "local-" + simpleHash(profile.email),
        email: profile.email,
        user_metadata: {
          full_name: profile.full_name || profile.email,
          phone: profile.phone || "",
          account_type: profile.account_type || "customer",
          role: profile.account_type === "rider" ? "rider" : "customer"
        }
      }
    };
  }

  async function signUp(profile) {
    var c = client();
    if (c) {
      var result = await c.auth.signUp({
        email: profile.email,
        password: profile.password,
        options: {
          emailRedirectTo: location.origin + "/auth.html",
          data: {
            full_name: profile.full_name,
            phone: profile.phone,
            account_type: profile.account_type
          }
        }
      });
      if (result.error) throw result.error;
      if (result.data && result.data.session) {
        await upsertProfile(result.data.session.user, profile);
      }
      return result.data;
    }

    var profiles = readJson(STORAGE.profiles, {});
    profiles[profile.email] = {
      full_name: profile.full_name,
      phone: profile.phone,
      account_type: profile.account_type,
      email: profile.email
    };
    writeJson(STORAGE.profiles, profiles);
    writeJson(STORAGE.session, localSessionFrom(profile));
    return { session: readJson(STORAGE.session, null) };
  }

  async function signIn(credentials) {
    var c = client();
    if (c) {
      var result = await c.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });
      if (result.error) throw result.error;
      return result.data;
    }

    var profiles = readJson(STORAGE.profiles, {});
    var profile = profiles[credentials.email] || {
      full_name: credentials.email.split("@")[0],
      phone: "",
      account_type: "customer",
      email: credentials.email
    };
    writeJson(STORAGE.session, localSessionFrom(profile));
    return { session: readJson(STORAGE.session, null) };
  }

  async function signInWithProvider(provider) {
    var c = client();
    if (c) {
      var result = await c.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: location.origin + "/dashboard.html"
        }
      });
      if (result.error) throw result.error;
      return result.data;
    }

    var email = provider + "@fastfleet.local";
    var profile = {
      full_name: provider === "apple" ? "Apple User" : "Google User",
      phone: "",
      account_type: "customer",
      email: email
    };
    writeJson(STORAGE.session, localSessionFrom(profile));
    return { session: readJson(STORAGE.session, null) };
  }

  async function signOut() {
    var c = client();
    if (c) {
      await c.auth.signOut();
    }
    localStorage.removeItem(STORAGE.session);
    await updateAuthUi();
    showToast("Signed out.");
  }

  async function upsertProfile(user, profile) {
    var c = client();
    if (!c || !user) return;
    try {
      await c.from(TABLES.profiles).upsert({
        id: user.id,
        email: user.email,
        full_name: profile.full_name,
        phone: profile.phone,
        account_type: profile.account_type,
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      // The app still works if the optional profile table has not been created yet.
    }
  }

  async function saveOrder(order) {
    var session = await getSession();
    var user = session && session.user;
    var c = client();
    var payload = Object.assign({}, order, {
      user_id: user ? user.id : null,
      user_email: user ? user.email : "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (c && user) {
      try {
        var result = await c.from(TABLES.orders).insert(payload).select().single();
        if (result.error) throw result.error;
        return result.data;
      } catch (error) {
        showToast("Saved locally. Run the Supabase schema to sync orders online.", "error");
      }
    }

    var orders = readJson(STORAGE.orders, []);
    orders.unshift(payload);
    writeJson(STORAGE.orders, orders);
    return payload;
  }

  async function fetchOrders() {
    var session = await getSession();
    var user = session && session.user;
    var c = client();
    if (c && user) {
      try {
        var result = await c
          .from(TABLES.orders)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        return result.data || [];
      } catch (error) {
        showToast("Could not load Supabase orders. Showing local orders.", "error");
      }
    }

    var all = readJson(STORAGE.orders, []);
    if (!user) return all;
    return all.filter(function (order) {
      return order.user_email === user.email || order.user_id === user.id;
    });
  }

  async function findOrder(code) {
    var normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;
    var c = client();
    if (c) {
      try {
        var result = await c
          .from(TABLES.orders)
          .select("*")
          .eq("order_code", normalized)
          .maybeSingle();
        if (result.error) throw result.error;
        if (result.data) return result.data;
      } catch (error) {
        showToast("Could not search Supabase. Checking local orders.", "error");
      }
    }
    return readJson(STORAGE.orders, []).find(function (order) {
      return String(order.order_code).toUpperCase() === normalized;
    }) || null;
  }

  function showToast(message, type) {
    var region = document.querySelector("[data-toast-region]");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("data-toast-region", "");
      document.body.appendChild(region);
    }
    var toast = document.createElement("div");
    toast.className = "toast" + (type ? " " + type : "");
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(function () {
      toast.remove();
    }, 4300);
  }

  async function updateAuthUi() {
    var session = await getSession();
    var user = session && session.user;
    var name = user && user.user_metadata && user.user_metadata.full_name
      ? user.user_metadata.full_name
      : user && user.email
        ? user.email.split("@")[0]
        : "";

    document.querySelectorAll("[data-auth-signed-in]").forEach(function (el) {
      el.hidden = !user;
    });
    document.querySelectorAll("[data-auth-signed-out]").forEach(function (el) {
      el.hidden = Boolean(user);
    });
    document.querySelectorAll("[data-hero-signed-in]").forEach(function (el) {
      el.hidden = !user;
    });
    document.querySelectorAll("[data-hero-signed-out]").forEach(function (el) {
      el.hidden = Boolean(user);
    });
    document.querySelectorAll("[data-user-name]").forEach(function (el) {
      el.textContent = name || "Account";
    });
    document.querySelectorAll("[data-dashboard-greeting]").forEach(function (el) {
      el.textContent = firstName(name);
    });
    document.querySelectorAll("[data-supabase-mode]").forEach(function (el) {
      el.textContent = hasSupabaseConfig()
        ? "Secure account mode is active. Your deliveries can sync online."
        : "Preview mode is active. Your account stays on this browser until you host the site.";
    });
    updateWalletUi();
  }

  function standardSocialLinks() {
    return '' +
      '<div class="footer-socials" aria-label="FastFleet social links">' +
        '<a href="https://www.instagram.com/fastfleetlogistics" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2Zm8.4 2H7.8C5.7 4 4 5.7 4 7.8v8.4C4 18.3 5.7 20 7.8 20h8.4c2.1 0 3.8-1.7 3.8-3.8V7.8C20 5.7 18.3 4 16.2 4ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.3-2.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"/></svg></a>' +
        '<a href="https://www.facebook.com/fastfleetlogistics" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12.06C22 6.48 17.52 2 11.94 2S2 6.48 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.24 0-1.63.77-1.63 1.56v1.89h2.77l-.44 2.91h-2.33V22C18.34 21.24 22 17.08 22 12.06Z"/></svg></a>' +
        '<a href="https://www.linkedin.com/company/fastfleet-logistics" aria-label="LinkedIn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.91 1.64-1.86 3.37-1.86 3.6 0 4.27 2.37 4.27 5.46v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45Z"/></svg></a>' +
        '<a href="https://x.com/fastfleetng" aria-label="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.24 2h3.26l-7.11 8.13L22.75 22H16.2l-5.13-6.7L5.2 22H1.94l7.6-8.69L1.5 2h6.72l4.64 6.13L18.24 2Zm-1.14 17.9h1.8L7.24 3.99H5.3L17.1 19.9Z"/></svg></a>' +
      '</div>';
  }

  function syncShell() {
    document.querySelectorAll(".footer").forEach(function (footer) {
      footer.innerHTML =
        '<div class="footer-grid">' +
          '<div><a class="brand" href="index.html"><img class="brand-logo" src="assets/fastfleet-logo.png" alt="FAST FLEET LOGISTICS logo"><span class="brand-title"><strong>FAST FLEET</strong><span>LOGISTICS</span></span></a><p>Fast dispatch, trusted riders, wallet payments, and live delivery tracking.</p>' + standardSocialLinks() + '</div>' +
          '<div><strong>Customers</strong><a href="order.html">Book delivery</a><a href="track.html">Track package</a><a href="dashboard.html">Dashboard</a></div>' +
          '<div><strong>Company</strong><a href="register-driver.html">Register driver</a><a href="register-business.html">Register business</a><a href="support.html">Support</a><a href="services.html">Services</a><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms</a><a href="cookies.html">Cookies</a><a href="ndpr.html">NDPR</a></div>' +
        '</div>';
    });

    document.querySelectorAll(".nav-actions").forEach(function (nav) {
      if (nav.querySelector("[data-wallet-topup]")) return;
      nav.insertAdjacentHTML("afterbegin", '<button class="button secondary" data-auth-signed-in data-wallet-topup hidden type="button">Wallet top up</button>');
    });

    document.querySelectorAll(".mobile-panel").forEach(function (panel) {
      if (panel.querySelector("[data-wallet-topup]")) return;
      panel.insertAdjacentHTML("beforeend", '<button class="button secondary" data-auth-signed-in data-wallet-topup hidden type="button">Wallet top up</button>');
    });
  }

  function initLocationSearch() {
    var options = LOCATION_SUGGESTIONS.map(function (item) {
      return '<option value="' + escapeHtml(item) + '"></option>';
    }).join("");
    document.querySelectorAll("[data-location-list]").forEach(function (list) {
      list.innerHTML = options;
    });
  }

  function initSchedulePickup() {
    var toggle = document.querySelector("[data-schedule-toggle]");
    var panel = document.querySelector("[data-schedule-panel]");
    var pickup = document.querySelector("#homePickupLocation");
    if (!toggle || !panel) return;
    toggle.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        var date = panel.querySelector('input[name="pickup_date"]');
        if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
      }
    });
    panel.addEventListener("submit", function (event) {
      event.preventDefault();
      var params = new URLSearchParams();
      if (pickup && pickup.value.trim()) params.set("pickup", pickup.value.trim());
      params.set("speed", "scheduled");
      ["pickup_date", "pickup_time", "package_type"].forEach(function (name) {
        var field = panel.elements[name];
        if (field && field.value) params.set(name, field.value);
      });
      location.href = "order.html?" + params.toString();
    });
  }

  function decorateMobileMenus() {
    var icons = {
      home: "home",
      order: "order",
      track: "track",
      dashboard: "dashboard",
      services: "services",
      riders: "riders",
      support: "support",
      account: "account",
      privacy: "privacy",
      safety: "privacy",
      wallet: "wallet",
      activity: "activity",
      help: "support",
      book: "book"
    };
    document.querySelectorAll(".menu-toggle, .app-menu-button").forEach(function (button) {
      if (!button.querySelector("svg")) button.innerHTML = iconSvg("menu");
    });
    document.querySelectorAll("[data-mobile-close]").forEach(function (button) {
      if (!button.querySelector("svg")) button.innerHTML = iconSvg("close");
    });
    document.querySelectorAll(".mobile-panel > a").forEach(function (link) {
      if (link.querySelector(".menu-icon")) return;
      var text = String(link.textContent || "").trim().toLowerCase();
      var key = Object.keys(icons).find(function (name) { return text.indexOf(name) !== -1; });
      link.insertAdjacentHTML("afterbegin", '<span class="menu-icon">' + iconSvg(key ? icons[key] : "account") + "</span>");
    });
    document.querySelectorAll(".drawer-shortcut, .drawer-link").forEach(function (link) {
      var icon = link.querySelector("span");
      if (!icon || icon.querySelector("svg")) return;
      var text = String(link.textContent || "").trim().toLowerCase();
      var key = Object.keys(icons).find(function (name) { return text.indexOf(name) !== -1; });
      icon.classList.add("menu-icon");
      icon.innerHTML = iconSvg(key ? icons[key] : "account");
    });
  }

  function updateWalletUi() {
    setText("[data-wallet-balance]", formatMoney(walletBalance()));
    var list = document.querySelector("[data-wallet-transactions]");
    if (!list) return;
    var rows = walletTransactions();
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">No wallet transactions yet.</div>';
      return;
    }
    list.innerHTML = rows.map(function (row) {
      var credit = Number(row.amount) >= 0;
      var status = String(row.status || "successful").toLowerCase();
      var label = String(row.type || "Wallet activity");
      return '' +
        '<div class="transaction-row transaction-' + escapeHtml(status) + '">' +
          '<div><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(statusLabel(status)) + ' · ' + escapeHtml(row.provider || row.detail || formatDate(row.created_at)) + '</span></div>' +
          '<strong class="' + (credit ? "credit" : "") + '">' + (credit ? "+" : "-") + formatMoney(Math.abs(Number(row.amount) || 0)) + '</strong>' +
        '</div>';
    }).join("");
  }

  function statusLabel(status) {
    if (status === "successful") return "Successful";
    if (status === "pending") return "Pending";
    if (status === "failed") return "Failed";
    return status.replace(/_/g, " ");
  }

  function initSmartWallet() {
    document.addEventListener("click", async function (event) {
      var button = event.target.closest("[data-wallet-topup]");
      if (!button) return;
      var session = await getSession();
      if (!session || !session.user) {
        showToast("Sign in before topping up your wallet.", "error");
        window.setTimeout(function () { location.href = "auth.html?return=dashboard.html"; }, 700);
        return;
      }
      var modal = document.createElement("div");
      modal.className = "smart-wallet-modal";
      modal.innerHTML =
        '<div class="smart-wallet-card">' +
          '<span class="kicker">Smart wallet</span>' +
          '<h2>Top up wallet</h2>' +
          '<p>Wallet funding is handled through Paystack and credited only after payment verification.</p>' +
          '<div class="field"><label for="smartWalletAmount">Amount</label><input id="smartWalletAmount" inputmode="numeric" value="10000" placeholder="10000"></div>' +
          '<div class="hero-actions"><button class="button primary" data-wallet-confirm type="button">Continue to Paystack</button><button class="button secondary" data-wallet-close type="button">Cancel</button></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector("[data-wallet-close]").addEventListener("click", function () {
        modal.remove();
      });
      var confirmButton = modal.querySelector("[data-wallet-confirm]");
      confirmButton.addEventListener("click", async function () {
        var input = modal.querySelector("#smartWalletAmount");
        var amount = Number(String(input.value || "").replace(/[^\d]/g, ""));
        if (!amount || amount < 500) {
          showToast("Enter at least NGN 500.", "error");
          return;
        }
        try {
          confirmButton.disabled = true;
          confirmButton.textContent = "Opening Paystack...";
          var returnTo = location.pathname && location.pathname !== "/" ? location.pathname : "/dashboard.html";
          var response = await fetch("/api/wallet/topup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: amount, walletType: "customer", returnTo: returnTo })
          });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(data.error || "Could not start Paystack top up.");
          if (!data.authorizationUrl) throw new Error("Paystack did not return a checkout link.");
          location.href = data.authorizationUrl;
        } catch (error) {
          confirmButton.disabled = false;
          confirmButton.textContent = "Continue to Paystack";
          showToast(error.message || "Could not connect to Paystack.", "error");
        }
      });
    });
  }

  function initNavigation() {
    var current = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav-links a, .mobile-panel a").forEach(function (link) {
      var href = (link.getAttribute("href") || "").split("#")[0].toLowerCase();
      if ((current === "" && href === "index.html") || href === current) {
        link.classList.add("is-active");
      }
    });

    var panel = document.querySelector("[data-mobile-panel]");
    var toggles = document.querySelectorAll("[data-mobile-toggle]");
    if (toggles.length && panel) {
      toggles.forEach(function (toggle) {
        toggle.addEventListener("click", function () {
          panel.classList.toggle("is-open");
        });
      });
      panel.querySelectorAll("[data-mobile-close]").forEach(function (button) {
        button.addEventListener("click", function () {
          panel.classList.remove("is-open");
        });
      });
      panel.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          panel.classList.remove("is-open");
        });
      });
    }

    document.querySelectorAll("[data-sign-out]").forEach(function (button) {
      button.addEventListener("click", function () {
        signOut();
      });
    });

    document.querySelectorAll("[data-delete-account]").forEach(function (button) {
      button.addEventListener("click", function () {
        requestAccountDeletion();
      });
    });
  }

  async function requestAccountDeletion() {
    var session = await getSession();
    if (!session || !session.user) {
      showToast("Sign in before requesting account deletion.", "error");
      window.setTimeout(function () {
        location.href = "auth.html?return=dashboard.html";
      }, 700);
      return;
    }
    var confirmed = window.confirm("Request deletion of your FastFleet account and personal data? Active deliveries and legally required payment records may need review first.");
    if (!confirmed) return;
    var payload = {
      user_id: session.user.id,
      email: session.user.email || "",
      status: "queued",
      requested_at: new Date().toISOString()
    };
    var c = client();
    if (c) {
      try {
        var result = await c.from("account_deletion_requests").insert(payload);
        if (result.error) throw result.error;
      } catch (error) {
        showToast("Deletion request saved locally. Run the schema to sync deletion requests in Supabase.", "error");
      }
    }
    var rows = readJson(STORAGE.deletionRequests, []);
    rows.unshift(payload);
    writeJson(STORAGE.deletionRequests, rows);
    showToast("Account deletion request queued.", "success");
  }

  function initCookieConsent() {
    if (readJson(STORAGE.consent, null)) return;
    var banner = document.createElement("div");
    banner.className = "consent-banner";
    banner.innerHTML =
      '<div><strong>Data and cookie notice</strong><p>FastFleet uses Supabase sessions, Paystack payment references, and map/location data to run bookings, wallet payments, tracking, and support. See the Privacy Policy for details.</p></div>' +
      '<div class="hero-actions" style="margin-top:0"><a class="button secondary small" href="privacy.html">Privacy</a><button class="button primary small" type="button">Accept</button></div>';
    document.body.appendChild(banner);
    banner.querySelector("button").addEventListener("click", function () {
      writeJson(STORAGE.consent, { accepted: true, at: new Date().toISOString() });
      banner.remove();
    });
  }

  function initSocialAuthButtons() {
    document.querySelectorAll("[data-oauth-provider]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var provider = button.getAttribute("data-oauth-provider");
        try {
          button.disabled = true;
          await signInWithProvider(provider);
          if (!hasSupabaseConfig()) {
            await updateAuthUi();
            showToast(provider === "apple" ? "Apple demo sign-in ready." : "Google demo sign-in ready.", "success");
            window.setTimeout(function () {
              location.href = "dashboard.html";
            }, 650);
          }
        } catch (error) {
          button.disabled = false;
          showToast(error.message || "Social sign-in failed.", "error");
        }
      });
    });
  }

  function initHeroAdSlider() {
    var root = document.querySelector("[data-ad-hero]");
    if (!root) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll("[data-ad-slide]"));
    var dots = Array.prototype.slice.call(root.querySelectorAll("[data-ad-dot]"));
    var copy = root.querySelector("[data-ad-copy]");
    var eyebrow = root.querySelector("[data-ad-eyebrow]");
    var title = root.querySelector("[data-ad-title]");
    var body = root.querySelector("[data-ad-body]");
    var active = 0;
    var ads = [
      {
        eyebrow: "FastFleet for customers",
        title: "Fast delivery with visible <span>control.</span>",
        body: "Book bike, car, and van deliveries with live status and trusted riders."
      },
      {
        eyebrow: "Same-day dispatch",
        title: "Same-day city movement, neatly <span>tracked.</span>",
        body: "Built for retail vendors, offices, food dispatch, pharmacy runs, and urgent errands."
      },
      {
        eyebrow: "Earn with your vehicle",
        title: "Turn your vehicle into delivery <span>income.</span>",
        body: "Drivers can apply, submit KYC, get reviewed, and start receiving jobs."
      },
      {
        eyebrow: "Business logistics",
        title: "A polished dispatch layer for growing <span>vendors.</span>",
        body: "Saved addresses, scheduled routes, wallet records, and support in one place."
      },
      {
        eyebrow: "Trusted rider network",
        title: "Trusted logistics for daily <span>movement.</span>",
        body: "Zone-based dispatch, rider approval, realtime locations, and support built for scale."
      }
    ];

    function render(index) {
      active = index;
      slides.forEach(function (slide, slideIndex) {
        slide.classList.toggle("is-active", slideIndex === active);
      });
      dots.forEach(function (dot, dotIndex) {
        dot.classList.toggle("is-active", dotIndex === active);
      });
      if (copy) {
        copy.classList.remove("is-switching");
        void copy.offsetWidth;
        copy.classList.add("is-switching");
      }
      if (eyebrow) eyebrow.textContent = ads[active].eyebrow;
      if (title) title.innerHTML = ads[active].title;
      if (body) body.textContent = ads[active].body;
    }

    dots.forEach(function (dot, index) {
      dot.addEventListener("click", function () {
        render(index);
      });
    });

    window.setInterval(function () {
      render((active + 1) % ads.length);
    }, 6200);
  }

  function initAuthPage() {
    var tabs = document.querySelectorAll("[data-auth-tab]");
    if (!tabs.length) return;

    function activateTab(target) {
      tabs.forEach(function (item) {
        item.classList.toggle("is-active", item.getAttribute("data-auth-tab") === target);
      });
      document.querySelectorAll("[data-auth-form]").forEach(function (form) {
        form.classList.toggle("is-active", form.getAttribute("data-auth-form") === target);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        activateTab(tab.getAttribute("data-auth-tab"));
      });
    });

    if (location.hash === "#signup" || location.hash === "#signin") {
      activateTab(location.hash.slice(1));
    }

    var returnTo = new URLSearchParams(location.search).get("return") || "dashboard.html";

    document.querySelectorAll("[data-auth-form]").forEach(function (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        var mode = form.getAttribute("data-auth-form");
        try {
          if (mode === "signin") {
            var signInResult = await signIn({
              email: textFromForm(form, "email"),
              password: textFromForm(form, "password")
            });
            showToast("Welcome back.", "success");
            window.setTimeout(function () {
              location.href = sessionRole(signInResult.session || readJson(STORAGE.session, null)) === "rider" ? "driver.html" : returnTo;
            }, 650);
          } else {
            var result = await signUp({
              full_name: textFromForm(form, "full_name"),
              phone: textFromForm(form, "phone"),
              email: textFromForm(form, "email"),
              password: textFromForm(form, "password"),
              account_type: textFromForm(form, "account_type") || "customer"
            });
            await updateAuthUi();
            if (result && result.session) {
              showToast("Account created.", "success");
              window.setTimeout(function () {
                location.href = sessionRole(result.session) === "rider" ? "driver.html" : returnTo;
              }, 650);
            } else {
              showToast("Account created. You can sign in once your email is confirmed.", "success");
            }
          }
        } catch (error) {
          showToast(error.message || "Authentication failed.", "error");
        }
      });
    });
  }

  function prefillOrderForm(form) {
    var params = new URLSearchParams(location.search);
    ["pickup", "dropoff", "vehicle", "speed", "pickup_date", "pickup_time", "package_type"].forEach(function (name) {
      if (!params.has(name)) return;
      var field = form.elements[name];
      if (field) field.value = params.get(name);
    });
  }

  function initOrderPage() {
    var form = document.querySelector("[data-order-form]");
    if (!form) return;
    prefillOrderForm(form);

    var priceNode = document.querySelector("[data-order-price]");
    var distanceNode = document.querySelector("[data-order-distance]");
    var etaNode = document.querySelector("[data-order-eta]");
    var vehicleNode = document.querySelector("[data-order-vehicle]");
    var courierNode = document.querySelector("[data-courier-preview]");

    function currentEstimate() {
      return estimateDelivery({
        pickup: textFromForm(form, "pickup"),
        dropoff: textFromForm(form, "dropoff"),
        vehicle: selectedValue(form, "vehicle"),
        speed: selectedValue(form, "speed")
      });
    }

    function renderEstimate() {
      var estimate = currentEstimate();
      if (priceNode) priceNode.textContent = formatMoney(estimate.price);
      if (distanceNode) distanceNode.textContent = estimate.distance + " km";
      if (etaNode) etaNode.textContent = estimate.eta + " min";
      if (vehicleNode) vehicleNode.textContent = vehicleLabel(selectedValue(form, "vehicle"));
      if (courierNode) {
        var previewOrder = {
          order_code: textFromForm(form, "pickup") + textFromForm(form, "dropoff"),
          vehicle_type: selectedValue(form, "vehicle"),
          pickup_address: textFromForm(form, "pickup")
        };
        var courier = courierFor(previewOrder);
        courierNode.innerHTML =
          '<strong>' + escapeHtml(courier.name) + '</strong>' +
          '<span>' + escapeHtml(courier.vehicle) + ' nearby, rated ' + escapeHtml(courier.rating) + '</span>';
      }
      return estimate;
    }

    form.addEventListener("input", renderEstimate);
    form.addEventListener("change", renderEstimate);
    renderEstimate();

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var session = await getSession();
      if (!session || !session.user) {
        showToast("Create an account or sign in before placing a delivery.", "error");
        window.setTimeout(function () {
          location.href = "auth.html?return=order.html";
        }, 800);
        return;
      }

      var estimate = currentEstimate();
      var order = {
        order_code: makeOrderCode(),
        customer_name: textFromForm(form, "customer_name"),
        customer_phone: textFromForm(form, "customer_phone"),
        recipient_name: textFromForm(form, "recipient_name"),
        recipient_phone: textFromForm(form, "recipient_phone"),
        pickup_address: textFromForm(form, "pickup"),
        dropoff_address: textFromForm(form, "dropoff"),
        pickup_note: textFromForm(form, "pickup_note"),
        pickup_date: textFromForm(form, "pickup_date"),
        pickup_time: textFromForm(form, "pickup_time"),
        package_type: textFromForm(form, "package_type"),
        vehicle_type: selectedValue(form, "vehicle"),
        delivery_speed: selectedValue(form, "speed"),
        payment_method: textFromForm(form, "payment_method"),
        distance_km: estimate.distance,
        price_ngn: estimate.price,
        eta_minutes: estimate.eta,
        status: "Courier assigned"
      };
      var courier = courierFor(order);
      order.courier_name = courier.name;
      order.courier_phone = courier.phone;

      try {
        if (order.payment_method === "wallet" || order.payment_method === "business") {
          if (walletBalance() < order.price_ngn) {
            showToast("Insufficient wallet balance. Top up before checkout payment.", "error");
            return;
          }
          writeWalletBalance(walletBalance() - order.price_ngn);
          addWalletTransaction("Check out payment", -order.price_ngn, order.order_code, "successful", "FastFleet");
          updateWalletUi();
        }
        var saved = await saveOrder(order);
        showToast("Delivery order received. Courier assigned.", "success");
        window.setTimeout(function () {
          location.href = "track.html?code=" + encodeURIComponent(saved.order_code);
        }, 750);
      } catch (error) {
        showToast(error.message || "Could not place order.", "error");
      }
    });
  }

  function initUseLocationButtons() {
    document.querySelectorAll("[data-use-location]").forEach(function (button) {
      button.addEventListener("click", function () {
        var targetName = button.getAttribute("data-use-location");
        var target = document.querySelector('[name="' + targetName + '"]');
        if (!navigator.geolocation) {
          showToast("Location is not available in this browser.", "error");
          return;
        }
        button.disabled = true;
        button.textContent = "Locating...";
        navigator.geolocation.getCurrentPosition(function (position) {
          var lat = position.coords.latitude.toFixed(5);
          var lng = position.coords.longitude.toFixed(5);
          if (target) {
            target.value = "Current location (" + lat + ", " + lng + ")";
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          updateMapToLocation(lat, lng);
          button.disabled = false;
          button.textContent = "Use my location";
          showToast("Pickup location added.", "success");
        }, function () {
          button.disabled = false;
          button.textContent = "Use my location";
          showToast("Location permission was not granted.", "error");
        }, { enableHighAccuracy: true, timeout: 10000 });
      });
    });
  }

  function mapFallback(element, label) {
    if (!element || element.querySelector(".map-fallback")) return;
    element.innerHTML =
      '<div class="map-fallback">' +
        '<div class="fallback-route"></div>' +
        '<span class="fallback-pin start"></span>' +
        '<span class="fallback-driver">FF</span>' +
        '<span class="fallback-pin end"></span>' +
        '<div class="map-caption">' +
          '<strong>' + escapeHtml(label || "Live delivery map") + '</strong>' +
          '<span>Pickup, courier and drop-off route preview.</span>' +
        '</div>' +
      '</div>';
  }

  function initMaps() {
    document.querySelectorAll(".js-map").forEach(function (element) {
      var label = element.getAttribute("data-map-label") || "FastFleet route";
      if (!window.L) {
        mapFallback(element, label);
        return;
      }

      var center = [6.5244, 3.3792];
      var map = window.L.map(element, {
        zoomControl: false,
        attributionControl: false
      }).setView(center, 12);
      window.L.control.zoom({ position: "bottomright" }).addTo(map);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
      }).addTo(map);

      var start = center;
      var end = [6.6018, 3.3515];
      var middle = [6.557, 3.397];
      var route = window.L.polyline([start, middle, end], {
        color: "#ff6a00",
        weight: 5,
        opacity: 0.86
      }).addTo(map);
      window.L.marker(start).addTo(map).bindPopup("Pickup");
      window.L.marker(middle).addTo(map).bindPopup("Courier nearby");
      window.L.marker(end).addTo(map).bindPopup("Drop-off");
      map.fitBounds(route.getBounds(), { padding: [28, 28] });

      mapRegistry[element.id || element.getAttribute("data-map-id") || "map"] = {
        map: map,
        route: route
      };
    });
  }

  function updateMapToLocation(lat, lng) {
    Object.keys(mapRegistry).forEach(function (key) {
      var item = mapRegistry[key];
      var start = [Number(lat), Number(lng)];
      var end = [Number(lat) + 0.045, Number(lng) + 0.05];
      var middle = [Number(lat) + 0.024, Number(lng) + 0.015];
      item.map.setView(start, 13);
      item.route.setLatLngs([start, middle, end]);
    });
  }

  function timelineHtml(order) {
    var index = Math.max(0, STATUS_FLOW.indexOf(order.status || "Order received"));
    return STATUS_FLOW.map(function (status, statusIndex) {
      var done = statusIndex < index;
      var current = statusIndex === index;
      var reached = statusIndex <= index;
      var cls = done ? " is-done" : current ? " is-current" : "";
      if (reached) cls += " is-reached";
      if (statusIndex < index) cls += " is-rail-done";
      var hint = {
        "Order received": "FastFleet has received the delivery request.",
        "Courier assigned": "A verified courier has accepted the order.",
        "Picked up": "The package has been collected from pickup.",
        "In transit": "The courier is heading to the destination.",
        "Delivered": "The recipient has confirmed delivery."
      }[status];
      return '' +
        '<div class="timeline-step' + cls + '">' +
          '<div class="timeline-rail"><span class="timeline-dot"></span></div>' +
          '<div class="timeline-content"><strong>' + status + '</strong><span>' + hint + '</span></div>' +
        '</div>';
    }).join("");
  }

  function orderCardHtml(order) {
    return '' +
      '<article class="order-card">' +
        '<header>' +
          '<div><strong>' + escapeHtml(order.order_code) + '</strong><div class="route-pair"><span>' + escapeHtml(formatDate(order.created_at)) + '</span></div></div>' +
          '<span class="status-pill ' + statusClass(order.status) + '">' + escapeHtml(order.status || "Order received") + '</span>' +
        '</header>' +
        '<div class="route-pair">' +
          '<div><span>Pickup</span>' + escapeHtml(order.pickup_address) + '</div>' +
          '<div><span>Drop-off</span>' + escapeHtml(order.dropoff_address) + '</div>' +
        '</div>' +
        '<div class="list-row">' +
          '<span>' + escapeHtml(vehicleLabel(order.vehicle_type)) + ' / ' + escapeHtml(speedLabel(order.delivery_speed)) + '</span>' +
          '<strong>' + formatMoney(order.price_ngn) + '</strong>' +
        '</div>' +
        '<a class="button secondary small" href="track.html?code=' + encodeURIComponent(order.order_code) + '">Track order <span aria-hidden="true">-></span></a>' +
      '</article>';
  }

  async function initDashboard() {
    var list = document.querySelector("[data-dashboard-orders]");
    if (!list) return;
    var session = await getSession();
    var gate = document.querySelector("[data-dashboard-gate]");
    if (!session || !session.user) {
      if (gate) gate.hidden = false;
      list.innerHTML = '<div class="empty-state">Sign in to see your deliveries, receipts and live status.</div>';
      return;
    }
    if (gate) gate.hidden = true;
    var orders = await fetchOrders();
    if (!orders.length) {
      list.innerHTML = '<div class="empty-state">No delivery orders yet. Place your first dispatch request to see it here.</div>';
    } else {
      list.innerHTML = orders.map(orderCardHtml).join("");
    }

    var active = orders.filter(function (order) {
      return order.status !== "Delivered";
    }).length;
    var totalSpend = orders.reduce(function (sum, order) {
      return sum + (Number(order.price_ngn) || 0);
    }, 0);

    setText("[data-stat-orders]", orders.length);
    setText("[data-stat-active]", active);
    setText("[data-stat-spend]", formatMoney(totalSpend));
    updateWalletUi();
  }

  async function initTrackPage() {
    var form = document.querySelector("[data-track-form]");
    var details = document.querySelector("[data-track-details]");
    if (!form || !details) return;

    async function render(code, allowSample) {
      var order = code ? await findOrder(code) : null;
      if (!order && allowSample) order = sampleOrder();
      if (!order) {
        details.innerHTML = '<div class="empty-state">No delivery found for that tracking code.</div>';
        return;
      }
      details.innerHTML =
        '<div class="panel pad">' +
          '<div class="panel-head">' +
            '<div><span class="kicker">Tracking code</span><h2>' + escapeHtml(order.order_code) + '</h2></div>' +
            '<span class="status-pill ' + statusClass(order.status) + '">' + escapeHtml(order.status || "Order received") + '</span>' +
          '</div>' +
          '<div class="route-pair">' +
            '<div><span>Pickup</span>' + escapeHtml(order.pickup_address) + '</div>' +
            '<div><span>Drop-off</span>' + escapeHtml(order.dropoff_address) + '</div>' +
          '</div>' +
          '<div class="quote-box">' +
            '<div class="quote-row"><span>Courier</span><strong>' + escapeHtml(order.courier_name || courierFor(order).name) + '</strong></div>' +
            '<div class="quote-row"><span>Phone</span><strong>' + escapeHtml(order.courier_phone || courierFor(order).phone) + '</strong></div>' +
            '<div class="quote-row"><span>Vehicle</span><strong>' + escapeHtml(vehicleLabel(order.vehicle_type)) + '</strong></div>' +
            '<div class="quote-row"><span>Fee</span><strong>' + formatMoney(order.price_ngn) + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="panel pad"><h3>Delivery timeline</h3><div class="timeline">' + timelineHtml(order) + '</div></div>';
    }

    var params = new URLSearchParams(location.search);
    var initial = params.get("code");
    form.elements.code.value = initial || "";
    await render(initial, true);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      await render(textFromForm(form, "code"), false);
    });
  }

  function setText(selector, value) {
    var node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function initSupportForm() {
    var form = document.querySelector("[data-support-form]");
    if (!form) return;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var session = await getSession();
      var payload = {
        user_id: session && session.user ? session.user.id : null,
        contact_name: textFromForm(form, "name"),
        contact_email: textFromForm(form, "email"),
        contact_phone: textFromForm(form, "phone"),
        topic: textFromForm(form, "topic"),
        subject: textFromForm(form, "topic"),
        message: textFromForm(form, "message"),
        priority: "normal",
        status: "open",
        created_at: new Date().toISOString()
      };
      var sentOnline = false;
      var c = client();
      if (c) {
        try {
          var result = await c.from("support_tickets").insert(payload);
          if (result.error) throw result.error;
          sentOnline = true;
        } catch (error) {
          showToast("Support request saved locally. Check Supabase support_tickets policy if online insert is blocked.", "error");
        }
      }
      var rows = readJson(STORAGE.tickets, []);
      rows.unshift(payload);
      writeJson(STORAGE.tickets, rows);
      form.reset();
      if (!sentOnline) {
        var mailBody = encodeURIComponent(payload.message + "\n\nName: " + payload.contact_name + "\nPhone: " + payload.contact_phone + "\nEmail: " + payload.contact_email);
        window.location.href = "mailto:support@fastfleetlogistics.com?subject=" + encodeURIComponent("FastFleet support: " + payload.topic) + "&body=" + mailBody;
      }
      showToast(sentOnline ? "Support request sent." : "Support request saved and email composer opened.", "success");
    });
  }

  function initSimpleStorageForm(selector, storageKey, message) {
    var form = document.querySelector(selector);
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var payload = {};
      Array.prototype.slice.call(form.elements).forEach(function (field) {
        if (field.name) payload[field.name] = field.value;
      });
      payload.created_at = new Date().toISOString();
      var rows = readJson(storageKey, []);
      rows.unshift(payload);
      writeJson(storageKey, rows);
      form.reset();
      showToast(message, "success");
    });
  }

  ready(function () {
    initTheme();
    syncShell();
    decorateMobileMenus();
    initLocationSearch();
    initNavigation();
    initCookieConsent();
    initHeroAdSlider();
    initSchedulePickup();
    initSmartWallet();
    initSocialAuthButtons();
    initAuthPage();
    initOrderPage();
    initUseLocationButtons();
    initMaps();
    initDashboard();
    initTrackPage();
    initSimpleStorageForm("[data-rider-form]", STORAGE.riders, "Rider application received.");
    initSimpleStorageForm("[data-business-form]", STORAGE.businesses, "Business application received.");
    initSupportForm();
    updateAuthUi();

    var c = client();
    if (c) {
      c.auth.onAuthStateChange(function () {
        updateAuthUi();
      });
    }
  });

  window.FastFleet = {
    signOut: signOut,
    showToast: showToast
  };
})();
