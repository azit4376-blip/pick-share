"use strict";

const SHEET_ID = "1lLggHBBBSncQ6aY2X1NVCgRVEvTM9xidhR1Cni8MPew";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=%EC%8B%9C%ED%8A%B81`;
const SITE_URL = "https://azit4376-blip.github.io/pick-share/";
const THEME_KEY = "pick-share-theme";

const CATEGORIES = Object.freeze([
    { id: "all", label: "전체", description: "전체 등록 상품을 확인합니다.", tags: [] },
    { id: "delivery", label: "배송·수납", description: "배달가방, 파티션, 짐대와 탑박스 등 적재 장비", tags: ["가방", "네스터", "파티션", "짐대", "탑박스"] },
    { id: "mobile", label: "거치·모바일", description: "휴대전화 거치대, 케이스, 마운트와 충전 액세서리", tags: ["거치대", "케이스", "마운트", "케이블", "딱판", "컵홀더", "워치 스트랩"] },
    { id: "communication", label: "통신·촬영", description: "블루투스 헤드셋, 액션캠, 블랙박스와 저장장치", tags: ["블루투스", "액션캠", "블랙박스", "메모리", "마이크 액세서리"] },
    { id: "vehicle", label: "주행·정비", description: "배터리, 공기주입기, 점프스타터와 차량 편의 장비", tags: ["배터리", "공기주입기", "점프스타터", "백미러", "크로스바", "쿠션", "열선", "관리용품"] },
    { id: "wear", label: "의류·계절", description: "방한·여름용품, 신발, 우의와 라이딩 의류", tags: ["의류", "신발", "장화", "비옷", "바라클라바", "토시", "겨울", "여름"] },
    { id: "lifestyle", label: "라이더 생활", description: "건강, 음료, 전자기기와 일상 편의 상품", tags: ["영양제", "텀블러", "노트북", "세탁기", "생활용품", "기타"] }
]);

const state = {
    products: [],
    category: "all",
    detail: "all",
    query: ""
};

const dom = {};
let toastTimer = null;

function cleanCsvValue(value) {
    return String(value || "").replace(/^"|"$/g, "").replace(/""/g, "\"").trim();
}

function parseProductsCsv(csv) {
    return csv.split(/\r?\n/).slice(1).filter(Boolean).map((row, index) => {
        const columns = row.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map(cleanCsvValue);
        const tags = columns[0].split(",").map((tag) => tag.trim()).filter(Boolean);
        const link = safeUrl(columns[2]);
        return {
            index,
            tags,
            name: columns[1],
            link,
            image: safeUrl(columns[3], true),
            badge: columns[4],
            category: resolveProductCategory(tags)
        };
    }).filter((product) => product.name && product.link);
}

function safeUrl(value, upgradeHttp = false) {
    if (!value) return "";
    try {
        const url = new URL(value, SITE_URL);
        if (!['http:', 'https:'].includes(url.protocol)) return "";
        if (upgradeHttp && url.protocol === "http:") url.protocol = "https:";
        return url.href;
    } catch {
        return "";
    }
}

function resolveProductCategory(tags) {
    const categories = CATEGORIES.slice(1);
    return categories.find((category) => tags.includes(category.label))?.id
        || categories.find((category) => category.tags.some((tag) => tags.includes(tag)))?.id
        || "lifestyle";
}

function categoryById(id) {
    return CATEGORIES.find((category) => category.id === id) || CATEGORIES[0];
}

function detailTagEntries(products, categoryId = "all") {
    const masterLabels = new Set(CATEGORIES.slice(1).map((category) => category.label));
    const scopedProducts = categoryId === "all"
        ? products
        : products.filter((product) => product.category === categoryId);
    const counts = new Map();

    scopedProducts.forEach((product) => {
        product.tags.forEach((tag) => {
            if (!masterLabels.has(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
        });
    });

    const preferredTags = categoryId === "all"
        ? CATEGORIES.slice(1).flatMap((category) => category.tags)
        : categoryById(categoryId).tags;
    const extraTags = [...counts.keys()]
        .filter((tag) => !preferredTags.includes(tag))
        .sort((left, right) => left.localeCompare(right, "ko-KR"));

    return [...new Set([...preferredTags, ...extraTags])]
        .filter((tag) => counts.has(tag))
        .map((tag) => ({ tag, count: counts.get(tag) }));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        "\"": "&quot;"
    })[character]);
}

function platformFor(link) {
    const host = new URL(link).hostname.toLowerCase();
    if (host.includes("coupang.com")) return { label: "COUPANG", className: "platform-coupang" };
    if (host.includes("naver")) return { label: "NAVER", className: "platform-naver" };
    if (host.includes("aliexpress")) return { label: "ALIEXPRESS", className: "platform-aliexpress" };
    return { label: "SHOP", className: "" };
}

function normalizeSearch(value) {
    return value.trim().toLocaleLowerCase("ko-KR");
}

function filteredProducts() {
    return state.products.filter((product) => {
        const matchesCategory = state.category === "all" || product.category === state.category;
        if (!matchesCategory) return false;
        if (state.detail !== "all" && !product.tags.includes(state.detail)) return false;
        if (!state.query) return true;
        const category = categoryById(product.category);
        const haystack = [product.name, product.tags.join(" "), category.label, platformFor(product.link).label].join(" ").toLocaleLowerCase("ko-KR");
        return haystack.includes(state.query);
    }).sort((left, right) => Number(Boolean(right.image)) - Number(Boolean(left.image)) || left.index - right.index);
}

function fallbackMarkup(name) {
    const initials = name.replace(/[^0-9A-Za-z가-힣]/g, "").slice(0, 2) || "P&S";
    return `<div class="image-fallback" aria-label="상품 이미지 준비 중"><strong>${escapeHtml(initials)}</strong></div>`;
}

function productCardMarkup(product) {
    const platform = platformFor(product.link);
    const category = categoryById(product.category);
    const detailTags = product.tags.filter((tag) => tag !== category.label);
    const tags = (detailTags.length ? detailTags : [category.label]).slice(0, 2).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    const image = product.image
        ? `<a href="${escapeHtml(product.link)}" target="_blank" rel="noopener noreferrer sponsored" tabindex="-1" aria-hidden="true"><img class="product-image" src="${escapeHtml(product.image)}" alt="" loading="lazy" decoding="async" data-name="${escapeHtml(product.name)}"></a>`
        : fallbackMarkup(product.name);

    return `<article class="product-card">
        <div class="product-media">
            <span class="platform-badge ${platform.className}">${platform.label}</span>
            ${image}
        </div>
        <div class="product-body">
            <div class="product-tags">${tags}</div>
            <h3 class="product-title"><a href="${escapeHtml(product.link)}" target="_blank" rel="noopener noreferrer sponsored">${escapeHtml(product.name)}</a></h3>
            <div class="product-actions">
                <a class="product-link" href="${escapeHtml(product.link)}" target="_blank" rel="noopener noreferrer sponsored">상품 정보 보기</a>
                <button class="copy-link" type="button" data-copy-link="${escapeHtml(product.link)}" aria-label="${escapeHtml(product.name)} 링크 복사" title="링크 복사">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>
                </button>
            </div>
        </div>
    </article>`;
}

function renderLoading() {
    dom.productGrid.setAttribute("aria-busy", "true");
    dom.productGrid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join("");
    dom.errorState.hidden = true;
    dom.emptyState.hidden = true;
}

function renderCategoryList() {
    const counts = Object.fromEntries(CATEGORIES.map((category) => [category.id, 0]));
    counts.all = state.products.length;
    state.products.forEach((product) => counts[product.category] += 1);
    dom.categoryList.innerHTML = CATEGORIES.map((category) => `
        <button class="category-button" type="button" data-category="${category.id}" aria-pressed="${state.category === category.id}">
            ${category.label}<span class="category-count">${counts[category.id]}</span>
        </button>`).join("");
}

function renderDetailCategoryList() {
    const entries = detailTagEntries(state.products, state.category);
    const scopedCount = state.category === "all"
        ? state.products.length
        : state.products.filter((product) => product.category === state.category).length;
    const selectedExists = entries.some(({ tag }) => tag === state.detail);
    if (!selectedExists) state.detail = "all";

    dom.detailCategoryPanel.hidden = entries.length === 0;
    dom.detailCategoryList.innerHTML = [
        { tag: "all", label: "전체 세부", count: scopedCount },
        ...entries.map(({ tag, count }) => ({ tag, label: tag, count }))
    ].map(({ tag, label, count }) => `
        <button class="detail-category-button" type="button" data-detail-category="${escapeHtml(tag)}" aria-pressed="${state.detail === tag}">
            ${escapeHtml(label)}<span class="detail-category-count">${count}</span>
        </button>`).join("");
}

function renderProducts() {
    const products = filteredProducts();
    const category = categoryById(state.category);
    const hasQuery = Boolean(state.query);
    const hasDetail = state.detail !== "all";

    dom.productGrid.setAttribute("aria-busy", "false");
    dom.productGrid.innerHTML = products.map(productCardMarkup).join("");
    dom.productGrid.hidden = products.length === 0;
    dom.emptyState.hidden = products.length > 0;
    dom.errorState.hidden = true;
    dom.resultsTitle.textContent = hasDetail
        ? (category.id === "all" ? state.detail : `${category.label} · ${state.detail}`)
        : (category.id === "all" ? "전체 상품" : category.label);
    dom.resultsSummary.textContent = hasQuery
        ? `검색 조건에 맞는 ${products.length.toLocaleString("ko-KR")}개 상품입니다.`
        : `${products.length.toLocaleString("ko-KR")}개 상품을 확인할 수 있습니다.`;
    dom.categoryDescription.textContent = hasDetail
        ? `${category.id === "all" ? "전체 카테고리" : category.label}에서 ‘${state.detail}’ 항목을 확인합니다.`
        : category.description;

    dom.productGrid.querySelectorAll(".product-image").forEach((image) => {
        image.addEventListener("error", () => {
            const media = image.closest(".product-media");
            const link = image.closest("a");
            if (link) link.remove();
            media.insertAdjacentHTML("beforeend", fallbackMarkup(image.dataset.name));
        }, { once: true });
    });
}

async function fetchProducts() {
    renderLoading();
    dom.dataState.textContent = "상품 정보 확인 중";
    try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12000);
        const response = await fetch(`${SHEET_URL}&t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        window.clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const products = parseProductsCsv(await response.text());
        if (!products.length) throw new Error("상품 데이터가 비어 있습니다.");

        state.products = products;
        dom.totalProducts.textContent = products.length.toLocaleString("ko-KR");
        dom.dataState.textContent = "최신 목록 자동 반영";
        renderCategoryList();
        renderDetailCategoryList();
        renderProducts();
    } catch (error) {
        console.warn("Pick & Share catalog:", error.message);
        dom.productGrid.hidden = true;
        dom.productGrid.setAttribute("aria-busy", "false");
        dom.emptyState.hidden = true;
        dom.errorState.hidden = false;
        dom.resultsSummary.textContent = "상품 정보를 불러오지 못했습니다.";
        dom.dataState.textContent = "연결 확인 필요";
    }
}

function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => dom.toast.classList.remove("visible"), 2200);
}

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}

async function shareSite() {
    if (navigator.share) {
        try {
            await navigator.share({ title: "Pick & Share", text: "라이더 장비를 용도별로 확인해 보세요.", url: SITE_URL });
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }
    await copyText(SITE_URL);
    showToast("사이트 주소를 복사했습니다.");
}

function applyTheme(theme) {
    const isDark = theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    dom.themeToggle.setAttribute("aria-pressed", String(isDark));
    dom.themeIcon.innerHTML = isDark
        ? '<path d="M20.7 15.1A8 8 0 0 1 8.9 3.3 9 9 0 1 0 20.7 15Z"/>'
        : '<path d="M12 4a1 1 0 0 0 1-1V1h-2v2a1 1 0 0 0 1 1Zm0 16a1 1 0 0 0-1 1v2h2v-2a1 1 0 0 0-1-1ZM4 12a1 1 0 0 0-1-1H1v2h2a1 1 0 0 0 1-1Zm19-1h-2a1 1 0 1 0 0 2h2v-2Zm-4.6-5.4 1.4-1.4-1.4-1.4L17 4.2l1.4 1.4ZM5.6 18.4l-1.4 1.4 1.4 1.4L7 19.8l-1.4-1.4ZM5.6 5.6 7 4.2 5.6 2.8 4.2 4.2l1.4 1.4Zm12.8 12.8L17 19.8l1.4 1.4 1.4-1.4-1.4-1.4ZM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>';
}

function runCatalogSelfCheck() {
    if (resolveProductCategory(["가방", "네스터"]) !== "delivery") throw new Error("배송 카테고리 분류 실패");
    if (resolveProductCategory(["케이스", "겨울"]) !== "mobile") throw new Error("카테고리 우선순위 실패");
    if (resolveProductCategory(["의류·계절", "케이스"]) !== "wear") throw new Error("대표 카테고리 분류 실패");
    const testProducts = [
        { category: "vehicle", tags: ["주행·정비", "크로스바"] },
        { category: "vehicle", tags: ["주행·정비", "배터리"] },
        { category: "wear", tags: ["의류·계절", "겨울"] }
    ];
    const allDetails = detailTagEntries(testProducts);
    if (!allDetails.some(({ tag, count }) => tag === "크로스바" && count === 1)) throw new Error("세부 카테고리 생성 실패");
    if (allDetails.some(({ tag }) => tag === "주행·정비")) throw new Error("대표 카테고리 중복 노출 실패");
    if (detailTagEntries(testProducts, "wear").some(({ tag }) => tag === "크로스바")) throw new Error("세부 카테고리 범위 실패");
    if (safeUrl("javascript:alert(1)")) throw new Error("URL 검증 실패");
    return true;
}

function cacheDom() {
    ["share-site", "theme-toggle", "theme-icon", "total-products", "data-state", "search-input", "search-clear", "category-list", "detail-category-panel", "detail-category-list", "category-description", "results-title", "results-summary", "product-grid", "empty-state", "error-state", "retry-button", "top-button", "toast"].forEach((id) => {
        dom[id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = document.getElementById(id);
    });
}

function bindEvents() {
    dom.categoryList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        state.category = button.dataset.category;
        state.detail = "all";
        renderCategoryList();
        renderDetailCategoryList();
        renderProducts();
    });

    dom.detailCategoryList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-detail-category]");
        if (!button) return;
        state.detail = button.dataset.detailCategory;
        renderDetailCategoryList();
        renderProducts();
    });

    dom.searchInput.addEventListener("input", () => {
        state.query = normalizeSearch(dom.searchInput.value);
        dom.searchClear.hidden = !state.query;
        renderProducts();
    });

    dom.searchClear.addEventListener("click", () => {
        dom.searchInput.value = "";
        state.query = "";
        dom.searchClear.hidden = true;
        renderProducts();
        dom.searchInput.focus();
    });

    dom.productGrid.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy-link]");
        if (!button) return;
        try {
            await copyText(button.dataset.copyLink);
            showToast("상품 링크를 복사했습니다.");
        } catch {
            showToast("링크를 복사하지 못했습니다.");
        }
    });

    dom.shareSite.addEventListener("click", shareSite);
    dom.retryButton.addEventListener("click", fetchProducts);
    dom.themeToggle.addEventListener("click", () => {
        const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
        localStorage.setItem(THEME_KEY, nextTheme);
        applyTheme(nextTheme);
    });
    dom.topButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => dom.topButton.classList.toggle("visible", window.scrollY > 500), { passive: true });
}

function initialize() {
    cacheDom();
    runCatalogSelfCheck();
    const savedTheme = localStorage.getItem(THEME_KEY);
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(savedTheme || preferredTheme);
    bindEvents();
    fetchProducts();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", initialize);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseProductsCsv, resolveProductCategory, detailTagEntries, safeUrl, runCatalogSelfCheck };
    if (require.main === module) {
        runCatalogSelfCheck();
        console.log("Pick & Share catalog self-check: PASS");
    }
}
