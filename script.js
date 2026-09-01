/**
 * script.js — Vanilla JS only. No frameworks, no backend, no database.
 * كل بيانات المنيو تُقرأ من menu.json، والسلة تُحفظ في localStorage،
 * والطلب يُرسل عبر رابط واتساب (wa.me) بدون أي API خارجي.
 */
(function(){
  "use strict";

  /* ---------------------------------------------------------
     الحالة العامة (State)
     --------------------------------------------------------- */
  let MENU = null;          // بيانات المنيو الكاملة من menu.json
  let cart = [];            // عناصر السلة
  let activeCategory = "all";
  let currentProduct = null;   // المنتج المفتوح حالياً داخل الـ Bottom Sheet
  let currentOptionIndex = 0;
  let currentQty = 1;
  let isRestaurantOpen = null; // null = لم يُحسب بعد

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     عناصر DOM
     --------------------------------------------------------- */
  const el = (id) => document.getElementById(id);

  const categoriesNav   = el("categories");
  const menuSections     = el("menuSections");
  const emptyState       = el("emptyState");
  const searchInput      = el("searchInput");
  const searchClear      = el("searchClear");

  const overlay          = el("overlay");

  const productSheet     = el("productSheet");
  const productSheetTitle= el("productSheetTitle");
  const productSheetImg  = el("productSheetImg");
  const optionsBlock     = el("optionsBlock");
  const optionsTitle     = el("optionsTitle");
  const optionsList      = el("optionsList");
  const productNote      = el("productNote");
  const confirmAddBtn    = el("confirmAddBtn");
  const confirmAddPrice  = el("confirmAddPrice");
  const qtyValue         = el("qtyValue");
  const qtyPlus          = el("qtyPlus");
  const qtyMinus         = el("qtyMinus");

  const cartSheet        = el("cartSheet");
  const cartItemsWrap    = el("cartItems");
  const cartTotalValue   = el("cartTotalValue");
  const closedBanner     = el("closedBanner");
  const custName         = el("custName");
  const custPhone        = el("custPhone");
  const phoneHint        = el("phoneHint");
  const custAddress      = el("custAddress");
  const custNote         = el("custNote");
  const sendOrderBtn     = el("sendOrderBtn");

  const cartFab          = el("cartFab");
  const cartFabCount     = el("cartFabCount");
  const cartFabTotal     = el("cartFabTotal");

  const toastEl          = el("toast");

  const statusBtn        = el("statusBtn");
  const statusDot        = el("statusDot");
  const statusText       = el("statusText");
  const statusSheet      = el("statusSheet");
  const statusDotLarge   = el("statusDotLarge");
  const statusDetailText = el("statusDetailText");
  const statusDetailSub  = el("statusDetailSub");
  const statusHoursLabel = el("statusHoursLabel");

  /* ---------------------------------------------------------
     أدوات مساعدة
     --------------------------------------------------------- */
  function fmtPrice(n){
    const num = Math.round(n);
    return num.toLocaleString("en-US") + " " + (CONFIG.CURRENCY || "د.ع");
  }

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.classList.remove("show"), 2200);
  }

  function uid(){ return "it_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

  function isValidPhone(v){
    return /^[0-9]{11}$/.test((v||"").trim());
  }

  function saveCart(){
    try{ localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cart)); }catch(e){ /* ignore quota errors */ }
  }
  function loadCart(){
    try{
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      cart = raw ? JSON.parse(raw) : [];
    }catch(e){ cart = []; }
  }

  /* ---------------------------------------------------------
     تحميل بيانات المنيو
     --------------------------------------------------------- */
  async function loadMenu(){
    const res = await fetch("menu.json", { cache: "no-store" });
    MENU = await res.json();

    applyRestaurantInfo();
    renderCategories();
    renderProducts();
  }

  function applyRestaurantInfo(){
    const r = MENU.restaurant;
    el("restName").textContent = r.name;
    el("restAddress").querySelector("span").textContent = r.address;
    el("logoImg").src = r.logo;
    el("logoImg").alt = "شعار " + r.name;

    const heroImg = document.querySelector(".hero-food-img");
    if(heroImg) heroImg.alt = r.name + " - صنف مميز من المنيو";

    document.title = r.name + " | المنيو الرسمي";

    const phone = CONFIG.PHONE_TEL || ("+" + r.phone);
    el("callBtn").href = "tel:" + phone;
    el("phoneText").textContent = CONFIG.PHONE_DISPLAY || r.phone;
    el("mapBtn").href = CONFIG.MAPS_URL || "#";

    if(CONFIG.BUSINESS_HOURS && CONFIG.BUSINESS_HOURS.label){
      statusHoursLabel.textContent = CONFIG.BUSINESS_HOURS.label;
    }
  }

  /* ---------------------------------------------------------
     أوقات الدوام — حساب فعلي بتوقيت بغداد (Asia/Baghdad)
     يدعم عبور منتصف الليل (مثال: 10:00 → 03:00 اليوم التالي)
     --------------------------------------------------------- */
  function getBaghdadMinutesNow(){
    const tz = (CONFIG.BUSINESS_HOURS && CONFIG.BUSINESS_HOURS.timezone) || "Asia/Baghdad";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    let hour = 0, minute = 0;
    parts.forEach(p=>{
      if(p.type === "hour") hour = parseInt(p.value, 10) % 24;
      if(p.type === "minute") minute = parseInt(p.value, 10);
    });
    return hour * 60 + minute;
  }

  function parseHHMM(str){
    const [h, m] = String(str).split(":").map(n=> parseInt(n, 10));
    return (h % 24) * 60 + (m || 0);
  }

  function formatArabicTime(hhmm){
    const total = parseHHMM(hhmm);
    let h = Math.floor(total / 60);
    const m = total % 60;
    let period;
    if(h >= 0 && h < 4) period = "فجراً";
    else if(h < 12) period = "صباحاً";
    else if(h < 17) period = "ظهراً";
    else period = "مساءً";
    let h12 = h % 12;
    if(h12 === 0) h12 = 12;
    const mm = m === 0 ? "" : `:${String(m).padStart(2,"0")}`;
    return `${h12}${mm} ${period}`;
  }

  function computeStatus(){
    const hours = (CONFIG && CONFIG.BUSINESS_HOURS) || { open: "10:00", close: "03:00" };
    const openMin = parseHHMM(hours.open);
    const closeMin = parseHHMM(hours.close);
    const nowMin = getBaghdadMinutesNow();

    const crossesMidnight = closeMin <= openMin;
    let open;
    if(crossesMidnight){
      open = (nowMin >= openMin) || (nowMin < closeMin);
    } else {
      open = (nowMin >= openMin) && (nowMin < closeMin);
    }

    const openLabel = formatArabicTime(hours.open);
    const closeLabel = formatArabicTime(hours.close);

    return {
      open,
      shortText: open ? "مفتوح الآن" : "مغلق الآن",
      detailText: open ? "المطعم مفتوح الآن" : "المطعم مغلق الآن",
      subText: open ? `يغلق الساعة ${closeLabel}` : `يفتح الساعة ${openLabel}`,
    };
  }

  function updateStatusUI(){
    const s = computeStatus();
    isRestaurantOpen = s.open;

    statusDot.classList.toggle("is-open", s.open);
    statusDot.classList.toggle("is-closed", !s.open);
    statusText.textContent = s.shortText;

    if(statusDotLarge){
      statusDotLarge.classList.toggle("is-open", s.open);
      statusDotLarge.classList.toggle("is-closed", !s.open);
    }
    if(statusDetailText) statusDetailText.textContent = s.detailText;
    if(statusDetailSub) statusDetailSub.textContent = s.subText;

    if(closedBanner){
      closedBanner.hidden = s.open;
    }
  }

  function initStatusEngine(){
    updateStatusUI();
    setInterval(updateStatusUI, 60 * 1000);
    document.addEventListener("visibilitychange", ()=>{
      if(document.visibilityState === "visible") updateStatusUI();
    });
  }

  statusBtn.addEventListener("click", ()=>{
    updateStatusUI();
    openSheet(statusSheet);
  });
  el("statusSheetClose").addEventListener("click", ()=> closeSheet(statusSheet));

  /* ---------------------------------------------------------
     التصنيفات (Categories)
     --------------------------------------------------------- */
  function renderCategories(){
    categoriesNav.innerHTML = "";
    MENU.categories.forEach(cat=>{
      const btn = document.createElement("button");
      btn.className = "cat-pill" + (cat.id === activeCategory ? " active" : "");
      btn.textContent = cat.name;
      btn.dataset.cat = cat.id;
      btn.addEventListener("click", ()=> onCategoryClick(cat.id));
      categoriesNav.appendChild(btn);
    });
  }

  function onCategoryClick(catId){
    activeCategory = catId;
    [...categoriesNav.children].forEach(b=> b.classList.toggle("active", b.dataset.cat === catId));

    if(catId === "all"){
      window.scrollTo({ top: menuSections.offsetTop - 130, behavior: prefersReducedMotion ? "auto" : "smooth" });
      renderProducts();
      return;
    }
    renderProducts();
    requestAnimationFrame(()=>{
      const target = document.querySelector(`.menu-section[data-cat="${catId}"]`);
      if(target){
        const y = target.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
    });
  }

  /* ---------------------------------------------------------
     المنتجات (Products)
     --------------------------------------------------------- */
  function getFilteredProducts(){
    const q = (searchInput.value || "").trim().toLowerCase();
    return MENU.products.filter(p=>{
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch = !q || p.name.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }

  function groupByCategory(products){
    const order = MENU.categories.filter(c=>c.id!=="all").map(c=>c.id);
    const map = {};
    products.forEach(p=>{
      if(!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return order.filter(id=>map[id]).map(id=>({ catId:id, catName: MENU.categories.find(c=>c.id===id).name, items: map[id] }));
  }

  /* ---- ظهور تدريجي للبطاقات عند دخولها مجال الرؤية ---- */
  let revealObserver = null;
  function getRevealObserver(){
    if(prefersReducedMotion || typeof IntersectionObserver === "undefined") return null;
    if(revealObserver) return revealObserver;
    revealObserver = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("reveal-in");
          entry.target.classList.remove("reveal-init");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    return revealObserver;
  }

  function renderProducts(){
    const filtered = getFilteredProducts();
    menuSections.innerHTML = "";

    if(filtered.length === 0){
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    const groups = groupByCategory(filtered);
    groups.forEach(group=>{
      const section = document.createElement("section");
      section.className = "menu-section";
      section.dataset.cat = group.catId;

      // تجميع فرعي حسب "group" (مثل: كلاسك برجر / موسكو برجر) داخل نفس التصنيف
      const subGroups = {};
      group.items.forEach(p=>{
        const key = p.group || group.catName;
        if(!subGroups[key]) subGroups[key] = [];
        subGroups[key].push(p);
      });

      Object.keys(subGroups).forEach(subKey=>{
        const h = document.createElement("h2");
        h.className = "menu-section-title";
        h.textContent = subKey;
        section.appendChild(h);

        subGroups[subKey].forEach(p=> section.appendChild(renderProductCard(p)));
      });

      menuSections.appendChild(section);
    });
  }

  function getBasePrice(p){
    if(p.customizable) return Math.min(...p.options.map(o=>o.price));
    return p.price;
  }

  function renderProductCard(p){
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.id = p.id;

    const priceLabel = p.customizable
      ? `<small>ابتداءً من</small> ${fmtPrice(getBasePrice(p))}`
      : fmtPrice(p.price);

    card.innerHTML = `
      <div class="product-image">
        <img src="${p.image}" alt="${p.name}" loading="lazy" width="140" height="140">
      </div>
      <div class="product-info">
        <div class="product-actions">
          <button class="btn-pill-add" type="button" aria-label="إضافة ${p.name}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            إضافة
          </button>
          <div class="inline-stepper" data-id="${p.id}">
            <button class="inc" aria-label="زيادة">+</button>
            <span class="inline-qty">0</span>
            <button class="dec" aria-label="إنقاص">−</button>
          </div>
        </div>
        ${p.customizable ? `<p class="customizable-tag">قابل للتخصيص</p>` : ``}
        <p class="product-name">${p.name}</p>
        <p class="product-price">${priceLabel}</p>
      </div>
    `;

    const addBtn = card.querySelector(".btn-pill-add");
    addBtn.addEventListener("click", ()=> handleAddClick(p, card));

    const stepper = card.querySelector(".inline-stepper");
    stepper.querySelector(".inc").addEventListener("click", ()=> quickAdjustQty(p, card, +1));
    stepper.querySelector(".dec").addEventListener("click", ()=> quickAdjustQty(p, card, -1));

    syncInlineStepper(p, card);

    const observer = getRevealObserver();
    if(observer){
      card.classList.add("reveal-init");
      observer.observe(card);
    }

    return card;
  }

  function findSimpleCartLine(productId){
    return cart.find(it => it.productId === productId && !it.customizable);
  }

  function syncInlineStepper(p, card){
    if(p.customizable) return; // المنتجات القابلة للتخصيص تفتح Bottom Sheet دائماً
    const line = findSimpleCartLine(p.id);
    const stepper = card.querySelector(".inline-stepper");
    const addBtn = card.querySelector(".btn-pill-add");
    const qtySpan = stepper.querySelector(".inline-qty");
    if(line && line.qty > 0){
      stepper.classList.add("show");
      addBtn.style.display = "none";
      qtySpan.textContent = line.qty;
    } else {
      stepper.classList.remove("show");
      addBtn.style.display = "";
    }
  }

  function handleAddClick(p, card){
    if(p.customizable){
      openProductSheet(p);
    } else {
      addSimpleItem(p, +1);
      syncInlineStepper(p, card);
      showToast(`تمت إضافة ${p.name} إلى السلة`);
      updateCartFab(true);
    }
  }

  function quickAdjustQty(p, card, delta){
    addSimpleItem(p, delta);
    syncInlineStepper(p, card);
    updateCartFab(delta > 0);
  }

  function addSimpleItem(p, delta){
    let line = findSimpleCartLine(p.id);
    if(!line){
      if(delta <= 0) return;
      line = { id: uid(), productId: p.id, name: p.name, image: p.image, customizable:false,
                optionLabel: null, qty: 0, unitPrice: p.price, note: "" };
      cart.push(line);
    }
    line.qty += delta;
    if(line.qty <= 0){
      cart = cart.filter(it => it.id !== line.id);
    }
    saveCart();
  }

  /* ---------------------------------------------------------
     Bottom Sheet — المنتج (خيارات)
     --------------------------------------------------------- */
  function openProductSheet(p){
    currentProduct = p;
    currentOptionIndex = 0;
    currentQty = 1;

    productSheetTitle.textContent = p.name;
    productSheetImg.src = p.image;
    productSheetImg.alt = p.name;
    productNote.value = "";

    // الخيارات (Radio)
    if(p.customizable){
      optionsBlock.hidden = false;
      optionsTitle.textContent = p.optionsTitle || "الخيارات";
      optionsList.innerHTML = "";
      p.options.forEach((opt, idx)=>{
        const row = document.createElement("div");
        row.className = "option-row" + (idx === 0 ? " selected" : "");
        row.dataset.idx = idx;
        row.innerHTML = `
          <span class="option-price">${fmtPrice(opt.price)}</span>
          <span class="option-label">${opt.label}</span>
          <span class="radio"></span>
        `;
        row.addEventListener("click", ()=>{
          currentOptionIndex = idx;
          [...optionsList.children].forEach(r=> r.classList.remove("selected"));
          row.classList.add("selected");
          updateSheetPrice();
        });
        optionsList.appendChild(row);
      });
    } else {
      optionsBlock.hidden = true;
    }

    qtyValue.textContent = "1";
    updateSheetPrice();
    openSheet(productSheet);
  }

  function computeUnitPrice(){
    const p = currentProduct;
    return p.customizable ? p.options[currentOptionIndex].price : p.price;
  }

  function updateSheetPrice(){
    const unit = computeUnitPrice();
    confirmAddPrice.textContent = fmtPrice(unit * currentQty);
  }

  qtyPlus.addEventListener("click", ()=>{
    currentQty += 1;
    qtyValue.textContent = currentQty;
    updateSheetPrice();
  });
  qtyMinus.addEventListener("click", ()=>{
    if(currentQty <= 1) return;
    currentQty -= 1;
    qtyValue.textContent = currentQty;
    updateSheetPrice();
  });

  confirmAddBtn.addEventListener("click", ()=>{
    const p = currentProduct;
    const unit = computeUnitPrice();

    cart.push({
      id: uid(),
      productId: p.id,
      name: p.name,
      image: p.image,
      customizable: true,
      optionLabel: p.customizable ? p.options[currentOptionIndex].label : null,
      qty: currentQty,
      unitPrice: unit,
      note: productNote.value.trim()
    });
    saveCart();
    showToast(`تمت إضافة ${p.name} إلى السلة`);
    closeSheet(productSheet);
    updateCartFab(true);
    renderProducts(); // لتحديث أي stepper مرتبط بنفس المنتج البسيط
  });

  /* ---------------------------------------------------------
     السلة (Cart Sheet)
     --------------------------------------------------------- */
  function cartTotal(){
    return cart.reduce((sum, it)=> sum + it.unitPrice * it.qty, 0);
  }
  function cartCount(){
    return cart.reduce((sum, it)=> sum + it.qty, 0);
  }

  function updateCartFab(pulse){
    const count = cartCount();
    if(count > 0){
      cartFab.hidden = false;
      cartFabCount.textContent = count;
      cartFabTotal.textContent = fmtPrice(cartTotal());
      if(pulse && !prefersReducedMotion){
        cartFab.classList.remove("pulse");
        // إعادة تشغيل الأنيميشن
        void cartFab.offsetWidth;
        cartFab.classList.add("pulse");
      }
    } else {
      cartFab.hidden = true;
    }
  }

  function renderCartItems(){
    cartItemsWrap.innerHTML = "";
    if(cart.length === 0){
      cartItemsWrap.innerHTML = `
        <div class="cart-empty">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.6a2 2 0 0 0 2-1.6L21 8H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <p>سلتك فارغة حالياً</p>
        </div>`;
      cartTotalValue.textContent = fmtPrice(0);
      return;
    }

    cart.forEach(item=>{
      const row = document.createElement("div");
      row.className = "cart-item";
      const metaParts = [];
      if(item.optionLabel) metaParts.push(item.optionLabel);
      if(item.note) metaParts.push("ملاحظة: " + item.note);

      row.innerHTML = `
        <div class="cart-item-top">
          <div>
            <p class="cart-item-name">${item.name}</p>
            ${metaParts.length ? `<p class="cart-item-meta">${metaParts.join(" — ")}</p>` : ``}
          </div>
          <div class="cart-item-price">${fmtPrice(item.unitPrice * item.qty)}</div>
        </div>
        <div class="cart-item-bottom">
          <button class="cart-item-remove" type="button">إزالة</button>
          <div class="cart-item-stepper">
            <button class="inc" aria-label="زيادة">+</button>
            <span>${item.qty}</span>
            <button class="dec" aria-label="إنقاص">−</button>
          </div>
        </div>
      `;

      row.querySelector(".cart-item-remove").addEventListener("click", ()=>{
        cart = cart.filter(it=> it.id !== item.id);
        saveCart();
        renderCartItems();
        updateCartFab();
        renderProducts();
      });
      row.querySelector(".inc").addEventListener("click", ()=>{
        item.qty += 1;
        saveCart();
        renderCartItems();
        updateCartFab();
        renderProducts();
      });
      row.querySelector(".dec").addEventListener("click", ()=>{
        item.qty -= 1;
        if(item.qty <= 0) cart = cart.filter(it=> it.id !== item.id);
        saveCart();
        renderCartItems();
        updateCartFab();
        renderProducts();
      });

      cartItemsWrap.appendChild(row);
    });

    cartTotalValue.textContent = fmtPrice(cartTotal());
  }

  cartFab.addEventListener("click", ()=>{
    renderCartItems();
    if(closedBanner) closedBanner.hidden = isRestaurantOpen !== false;
    openSheet(cartSheet);
  });

  /* ---------------------------------------------------------
     إرسال الطلب عبر واتساب
     --------------------------------------------------------- */
  function buildWhatsAppMessage(){
    const r = MENU.restaurant;
    const lines = [];

    lines.push(`مرحباً 👋 أرغب بطلب التالي من ${r.name}:`);
    lines.push("");

    cart.forEach((item, i)=>{
      const parts = [`${i+1}) ${item.name}`];
      if(item.optionLabel) parts.push(`(${item.optionLabel})`);
      parts.push(`× ${item.qty}`);
      parts.push(`— ${fmtPrice(item.unitPrice * item.qty)}`);
      lines.push(parts.join(" "));
      if(item.note) lines.push(`   ملاحظة: ${item.note}`);
    });

    lines.push("");
    lines.push(`المجموع: ${fmtPrice(cartTotal())}`);
    lines.push("");
    lines.push(`الاسم: ${custName.value.trim()}`);
    lines.push(`الهاتف: ${custPhone.value.trim()}`);
    lines.push(`العنوان: ${custAddress.value.trim()}`);

    if(custNote.value.trim()){
      lines.push(`ملاحظات: ${custNote.value.trim()}`);
    }

    lines.push("");
    lines.push("شكراً لكم 🌹");

    return lines.join("\n");
  }

  sendOrderBtn.addEventListener("click", ()=>{
    if(cart.length === 0){
      showToast("السلة فارغة، أضف منتجاً أولاً");
      return;
    }
    if(!custName.value.trim() || !custPhone.value.trim() || !custAddress.value.trim()){
      showToast("يرجى تعبئة الاسم ورقم الهاتف والعنوان");
      return;
    }
    if(!isValidPhone(custPhone.value)){
      phoneHint.hidden = false;
      custPhone.focus();
      showToast("رقم الهاتف يجب أن يتكون من 11 رقم");
      return;
    }
    phoneHint.hidden = true;

    const msg = buildWhatsAppMessage();
    const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");

    // تفريغ السلة بعد الإرسال
    cart = [];
    saveCart();
    renderCartItems();
    updateCartFab();
    renderProducts();
    closeSheet(cartSheet);
    showToast("تم تجهيز طلبك في واتساب ✅");
  });

  /* ---------------------------------------------------------
     التحكم بالـ Bottom Sheets العام
     --------------------------------------------------------- */
  let lastFocusedEl = null;

  function openSheet(sheetEl){
    lastFocusedEl = document.activeElement;
    overlay.classList.add("show");
    sheetEl.classList.add("open");
    document.body.style.overflow = "hidden";
    const closeBtn = sheetEl.querySelector(".close-btn");
    if(closeBtn) closeBtn.focus({ preventScroll: true });
  }
  function closeSheet(sheetEl){
    sheetEl.classList.remove("open");
    if(![...document.querySelectorAll(".sheet")].some(s=> s.classList.contains("open"))){
      overlay.classList.remove("show");
      document.body.style.overflow = "";
    }
    if(lastFocusedEl && typeof lastFocusedEl.focus === "function"){
      lastFocusedEl.focus({ preventScroll: true });
    }
  }
  function closeAllSheets(){
    document.querySelectorAll(".sheet.open").forEach(s=> s.classList.remove("open"));
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  el("productSheetClose").addEventListener("click", ()=> closeSheet(productSheet));
  el("cartSheetClose").addEventListener("click", ()=> closeSheet(cartSheet));
  overlay.addEventListener("click", closeAllSheets);

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      const openSheetEl = document.querySelector(".sheet.open");
      if(openSheetEl) closeSheet(openSheetEl);
    }
  });

  /* ---------------------------------------------------------
     تحقق رقم الهاتف (أرقام فقط، 11 رقم بالضبط)
     --------------------------------------------------------- */
  custPhone.addEventListener("input", ()=>{
    custPhone.value = custPhone.value.replace(/[^0-9]/g, "").slice(0, 11);
    if(!phoneHint.hidden) phoneHint.hidden = true;
  });

  /* ---------------------------------------------------------
     البحث
     --------------------------------------------------------- */
  let searchTimer = null;
  searchInput.addEventListener("input", ()=>{
    searchClear.hidden = !searchInput.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=>{
      if(searchInput.value.trim()){
        activeCategory = "all";
        [...categoriesNav.children].forEach(b=> b.classList.toggle("active", b.dataset.cat === "all"));
      }
      renderProducts();
    }, 200);
  });

  searchClear.addEventListener("click", ()=>{
    searchInput.value = "";
    searchClear.hidden = true;
    renderProducts();
    searchInput.focus();
  });

  /* ---------------------------------------------------------
     التهيئة
     --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async ()=>{
    loadCart();
    initStatusEngine();
    try{
      await loadMenu();
    }catch(err){
      menuSections.innerHTML = `<p style="text-align:center;color:#8b857d;padding:40px 0">تعذر تحميل بيانات المنيو (menu.json). تأكد من رفع الملف بجانب index.html.</p>`;
      console.error(err);
    }
    updateCartFab();
  });

  /* ---------------------------------------------------------
     تسجيل الـ Service Worker (اختياري وآمن — لتفعيل PWA فقط)
     --------------------------------------------------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* تجاهل بصمت */ });
    });
  }

})();
