const config = window.CAMP_SITE_CONFIG || {};
const state = { camps: [], filtered: [], compare: new Set() };
const mobileViewport = window.matchMedia("(max-width: 760px)");

const elements = {
  list: document.querySelector("#camp-list"), count: document.querySelector("#result-count"), empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"), county: document.querySelector("#filter-county"), drive: document.querySelector("#filter-drive"),
  booking: document.querySelector("#filter-booking"), altitude: document.querySelector("#filter-altitude"), surface: document.querySelector("#filter-surface"),
  rain: document.querySelector("#filter-rain"),
  kids: document.querySelector("#filter-kids"), lodging: document.querySelector("#filter-lodging"), car: document.querySelector("#filter-car"),
  carSide: document.querySelector("#filter-car-side"), rvLodging: document.querySelector("#filter-rv-lodging"),
  sort: document.querySelector("#sort-select"), active: document.querySelector("#active-filters"), filters: document.querySelector("#filters"),
  compareDock: document.querySelector("#compare-dock"), compareSummary: document.querySelector("#compare-summary"), compareDialog: document.querySelector("#compare-dialog"),
  compareTable: document.querySelector("#compare-table"),
  mobileFilterButton: document.querySelector("#mobile-filter-button"), filterBackdrop: document.querySelector("#filter-backdrop"),
  closeMobileFilters: document.querySelector("#close-mobile-filters"), applyMobileFilters: document.querySelector("#apply-mobile-filters")
};

const isKnown = value => value && value !== "不確定";
const hasKids = camp => isKnown(camp.兒童設施) && camp.兒童設施 !== "無";
const hasLodging = camp => camp.是否免搭帳 === "是";
const dataStatusClass = value => ({
  資料較完整: "complete",
  部分資料待補: "partial",
  資料持續補充: "building"
}[value] || "");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
const formatAltitude = value => value == null ? "不確定" : `${value} m`;
const matchesAltitudeBand = (altitude, band) => {
  if (!band) return true;
  if (!Number.isFinite(altitude)) return false;
  if (band === "1000-plus") return altitude >= 1000;
  if (band === "750-999") return altitude >= 750 && altitude <= 999;
  if (band === "500-749") return altitude >= 500 && altitude <= 749;
  return altitude <= 499;
};
const sortWithTrailing = (values, trailing) => {
  const trailingSet = new Set(trailing);
  const regular = values.filter(value => !trailingSet.has(value)).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  return [...regular, ...trailing.filter(value => values.includes(value))];
};
const countyDisplayOrder = [
  // 北部
  "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "宜蘭縣",
  // 中部
  "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣",
  // 南部
  "嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣",
  // 東部
  "花蓮縣", "臺東縣",
  // 離島
  "澎湖縣", "金門縣", "連江縣"
];
const sortCountiesByRegion = counties => {
  const indexByCounty = new Map(countyDisplayOrder.map((county, index) => [county, index]));
  return [...counties].sort((left, right) => {
    if (left === "不確定") return 1;
    if (right === "不確定") return -1;
    const leftIndex = indexByCounty.get(left);
    const rightIndex = indexByCounty.get(right);
    if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex;
    if (leftIndex != null) return -1;
    if (rightIndex != null) return 1;
    return left.localeCompare(right, "zh-Hant");
  });
};

function getGoogleAiUrl(camp) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", `${camp.營地} ${camp.縣市} ${camp.鄉鎮} 露營資訊`);
  url.searchParams.set("udm", "50");
  url.searchParams.set("hl", "zh-TW");
  return url.toString();
}

function renderTags(camp) {
  const tags = [];
  if (camp.雨棚區 === "有") tags.push(["有雨棚", ""]);
  if (hasKids(camp)) tags.push([camp.兒童設施, "sky"]);
  if (hasLodging(camp)) tags.push([camp.住宿類型, ""]);
  if (camp.能否車露 === "是") tags.push(["可車露", ""]);
  if (camp.車停帳邊 === "是") tags.push(["車停帳邊", ""]);
  if (camp["Wi-Fi"] === "有") tags.push(["有 Wi-Fi", "sky"]);
  if (camp["Wi-Fi"] === "無") tags.push(["無 Wi-Fi", ""]);
  return tags.slice(0, 4).map(([text, style]) => `<span class="tag ${style}">${escapeHtml(text)}</span>`).join("");
}

function renderMapActions(camp) {
  const verified = camp.Google地點狀態 === "已核對" && camp.Google導航連結;
  if (!verified) {
    return `<a class="secondary-button" href="${escapeHtml(camp["Google Map 連結"])}" target="_blank" rel="noopener" title="此地點尚待交叉核對">Google Map</a><button class="primary-link" type="button" disabled title="地點核對完成後提供導航">導航</button>`;
  }
  return `<a class="secondary-button" href="${escapeHtml(camp["Google Map 連結"])}" target="_blank" rel="noopener">Google Map</a><a class="primary-link" href="${escapeHtml(camp.Google導航連結)}" target="_blank" rel="noopener">導航</a>`;
}

function cardTemplate(camp) {
  const selected = state.compare.has(camp.營地);
  const bath = camp.衛浴設備評價 === "不確定" ? "衛浴評價不確定" : camp.衛浴設備評價;
  const compareButton = mobileViewport.matches ? "" : `<button class="compare-button" type="button" data-compare="${escapeHtml(camp.營地)}" aria-pressed="${selected}" aria-label="${selected ? "移出" : "加入"}比較" title="${selected ? "移出" : "加入"}比較">${selected ? "✓" : "+"}</button>`;
  return `<article class="camp-card">
    <div class="card-head"><div><h2>${escapeHtml(camp.營地)}</h2><p class="location">${escapeHtml(camp.縣市)} ${escapeHtml(camp.鄉鎮)} · ${escapeHtml(camp.訂位平台)}／${escapeHtml(camp.訂位方式)}</p></div><span class="rating">${camp.Google星等 ? `★ ${camp.Google星等.toFixed(1)}${Number.isInteger(camp.評論數) ? ` <small class="review-count">(${camp.評論數}則評論)</small>` : ""}` : "未評分"}</span></div>
    <dl class="quick-facts"><div><dt>車程</dt><dd>${escapeHtml(camp.車程)}</dd></div><div><dt>海拔</dt><dd>${formatAltitude(camp.海拔高度)}</dd></div><div><dt>場地</dt><dd>${escapeHtml(camp.營地材質)}</dd></div></dl>
    <p class="summary">${escapeHtml(camp.特色摘要)}</p>
    <div class="tags">${renderTags(camp)}</div>
    <p class="summary">${escapeHtml(bath)}</p>
    <div class="data-status-note">
      <span class="data-status ${dataStatusClass(camp.資料狀態)}">資料狀態：${escapeHtml(camp.資料狀態)}</span>
    </div>
    <div class="card-actions"><a class="secondary-button google-ai-link" href="${escapeHtml(getGoogleAiUrl(camp))}" target="_blank" rel="noopener" title="以營地名稱與所在地開啟 Google AI 模式搜尋">Google AI資訊</a>${renderMapActions(camp)}${compareButton}</div>
  </article>`;
}

function getMatchingCamps() {
  const query = elements.search.value.trim().toLowerCase();
  return state.camps.filter(camp => {
    const searchable = `${camp.營地} ${camp.縣市} ${camp.鄉鎮}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (!elements.county.value || camp.縣市 === elements.county.value)
      && (!elements.booking.value || camp.訂位平台 === elements.booking.value)
      && (!elements.drive.value || (Number.isFinite(camp.車程分鐘) && camp.車程分鐘 <= Number(elements.drive.value)))
      && matchesAltitudeBand(camp.海拔高度, elements.altitude.value)
      && (!elements.surface.value || camp.營地材質 === elements.surface.value)
      && (!elements.rain.checked || camp.雨棚區 === "有")
      && (!elements.kids.checked || hasKids(camp))
      && (!elements.lodging.checked || hasLodging(camp))
      && (!elements.car.checked || camp.能否車露 === "是")
      && (!elements.carSide.checked || camp.車停帳邊 === "是")
      && (!elements.rvLodging.checked || camp.露營車住宿 === "是");
  });
}

function shuffleCamps(camps) {
  for (let index = camps.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [camps[index], camps[target]] = [camps[target], camps[index]];
  }
}

function applyFilters({ reshuffle = true } = {}) {
  state.filtered = getMatchingCamps();
  sortCamps(reshuffle);
  render();
}

function sortCamps(reshuffle = false) {
  const sort = elements.sort.value;
  if (sort === "random") {
    if (reshuffle) shuffleCamps(state.filtered);
    return;
  }
  state.filtered.sort((a, b) => {
    const driveA = Number.isFinite(a.車程分鐘) ? a.車程分鐘 : Number.MAX_SAFE_INTEGER;
    const driveB = Number.isFinite(b.車程分鐘) ? b.車程分鐘 : Number.MAX_SAFE_INTEGER;
    const altitudeA = Number.isFinite(a.海拔高度) ? a.海拔高度 : -1;
    const altitudeB = Number.isFinite(b.海拔高度) ? b.海拔高度 : -1;
    if (sort === "rating") return (b.Google星等 || 0) - (a.Google星等 || 0) || driveA - driveB;
    if (sort === "altitude") return altitudeB - altitudeA || driveA - driveB;
    return driveA - driveB || (b.Google星等 || 0) - (a.Google星等 || 0);
  });
}

function renderActiveFilters() {
  const chips = [];
  if (elements.search.value) chips.push(`搜尋：${elements.search.value}`);
  [[elements.county,"縣市"],[elements.booking,"訂位平台"],[elements.surface,"場地"]].forEach(([el,label]) => { if (el.value) chips.push(`${label}：${el.value}`); });
  if (elements.drive.value) chips.push(`車程 ≤ ${elements.drive.options[elements.drive.selectedIndex].text}`);
  if (elements.altitude.value) chips.push(`海拔：${elements.altitude.options[elements.altitude.selectedIndex].text}`);
  if (elements.rain.checked) chips.push("有雨棚");
  if (elements.kids.checked) chips.push("親子設施");
  if (elements.lodging.checked) chips.push("免搭帳");
  if (elements.car.checked) chips.push("可在車內過夜");
  if (elements.carSide.checked) chips.push("車停帳邊");
  if (elements.rvLodging.checked) chips.push("有露營車房型");
  elements.active.innerHTML = chips.map(chip => `<span class="filter-chip">${escapeHtml(chip)}</span>`).join("");
}

function render() {
  elements.count.textContent = `找到 ${state.filtered.length} 個營地`;
  elements.list.innerHTML = state.filtered.map(cardTemplate).join("");
  elements.empty.hidden = state.filtered.length !== 0;
  if (elements.applyMobileFilters) elements.applyMobileFilters.textContent = `顯示 ${state.filtered.length} 個結果`;
  renderActiveFilters();
  bindCardActions();
  updateCompareDock();
}

function setMobileFiltersOpen(open) {
  elements.filters.classList.toggle("open", open);
  elements.filterBackdrop?.classList.toggle("open", open);
  document.body.classList.toggle("filter-open", open);
  elements.mobileFilterButton?.setAttribute("aria-expanded", String(open));
  elements.mobileFilterButton?.setAttribute("aria-label", open ? "關閉篩選" : "開啟篩選");
  if (open) elements.filters.scrollTop = 0;
}

function showFilteredResults() {
  applyFilters({ reshuffle: true });
  setMobileFiltersOpen(false);
  document.querySelector(".results")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function previewMobileResultCount() {
  if (elements.applyMobileFilters) elements.applyMobileFilters.textContent = `顯示 ${getMatchingCamps().length} 個結果`;
}

function bindCardActions() {
  document.querySelectorAll("[data-compare]").forEach(button => button.addEventListener("click", () => toggleCompare(button.dataset.compare)));
}

function toggleCompare(name) {
  if (state.compare.has(name)) state.compare.delete(name);
  else if (state.compare.size < 3) state.compare.add(name);
  else return;
  render();
}

function updateCompareDock() {
  const names = [...state.compare];
  elements.compareDock.hidden = mobileViewport.matches || names.length === 0;
  elements.compareSummary.textContent = names.join("、");
}

function renderComparison() {
  const camps = [...state.compare].map(name => state.camps.find(camp => camp.營地 === name)).filter(Boolean);
  const rows = [
    ["位置", c => `${c.縣市} ${c.鄉鎮}`], ["Google 星等", c => c.Google星等 ? c.Google星等.toFixed(1) : "不確定"],
    ["Google 評論數", c => Number.isInteger(c.評論數) ? `${c.評論數} 則` : "不確定"],
    ["車程", c => c.車程], ["海拔", c => formatAltitude(c.海拔高度)], ["營地材質", c => c.營地材質], ["可在車內過夜", c => c.能否車露],
    ["車停帳邊", c => c.車停帳邊], ["露營車房型", c => c.露營車住宿], ["Wi-Fi", c => c["Wi-Fi"]],
    ["雨棚", c => c.雨棚區], ["親子設施", c => c.兒童設施], ["是否免搭帳", c => c.是否免搭帳],
    ["住宿類型", c => c.住宿類型], ["訂位方式", c => `${c.訂位平台}／${c.訂位方式}`],
    ["衛浴評價", c => c.衛浴設備評價], ["資料狀態", c => c.資料狀態]
  ];
  elements.compareTable.innerHTML = `<table class="compare-table"><thead><tr><th>比較項目</th>${camps.map(c => `<th>${escapeHtml(c.營地)}</th>`).join("")}</tr></thead><tbody>${rows.map(([label,get]) => `<tr><td>${label}</td>${camps.map(c => `<td>${escapeHtml(get(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function resetFilters() {
  document.querySelectorAll("#filters select").forEach(select => { select.value = ""; });
  document.querySelectorAll("#filters input[type=checkbox]").forEach(input => { input.checked = false; });
  elements.search.value = "";
  elements.sort.value = "random";
  if (mobileViewport.matches && elements.filters.classList.contains("open")) previewMobileResultCount();
  else applyFilters({ reshuffle: true });
}

async function init() {
  let camps = window.CAMP_DATA;
  if (!Array.isArray(camps)) {
    const response = await fetch("data/camps.json");
    if (!response.ok) throw new Error("營地資料載入失敗");
    camps = await response.json();
  }
  state.camps = camps;
  const counties = [...new Set(state.camps.map(camp => camp.縣市))];
  sortCountiesByRegion(counties).forEach(county => elements.county.add(new Option(county, county)));
  const bookingPlatforms = [...new Set(state.camps.map(camp => camp.訂位平台))];
  sortWithTrailing(bookingPlatforms, ["其他", "不確定"]).forEach(platform => elements.booking.add(new Option(platform, platform)));
  elements.search.addEventListener("input", () => applyFilters({ reshuffle: false }));
  [elements.county, elements.booking, elements.drive, elements.altitude, elements.surface, elements.rain, elements.kids, elements.lodging, elements.car, elements.carSide, elements.rvLodging]
    .filter(Boolean)
    .forEach(element => element.addEventListener("change", () => {
      if (mobileViewport.matches && elements.filters.classList.contains("open")) previewMobileResultCount();
      else applyFilters({ reshuffle: true });
    }));
  elements.sort.addEventListener("change", () => applyFilters({ reshuffle: elements.sort.value === "random" }));
  document.querySelector("#reset-filters").addEventListener("click", resetFilters);
  elements.mobileFilterButton?.addEventListener("click", () => setMobileFiltersOpen(!elements.filters.classList.contains("open")));
  elements.closeMobileFilters?.addEventListener("click", () => setMobileFiltersOpen(false));
  elements.filterBackdrop?.addEventListener("click", () => setMobileFiltersOpen(false));
  elements.applyMobileFilters?.addEventListener("click", showFilteredResults);
  document.addEventListener("keydown", event => { if (event.key === "Escape") setMobileFiltersOpen(false); });
  document.querySelector("#open-compare").addEventListener("click", () => { renderComparison(); elements.compareDialog.showModal(); });
  document.querySelector("#close-compare").addEventListener("click", () => elements.compareDialog.close());
  mobileViewport.addEventListener("change", () => {
    if (mobileViewport.matches && elements.compareDialog.open) elements.compareDialog.close();
    render();
  });
  applyFilters({ reshuffle: true });
  if (mobileViewport.matches) {
    setMobileFiltersOpen(true);
    previewMobileResultCount();
  }
}

init().catch(error => {
  elements.list.innerHTML = `<div class="empty-state"><h2>資料暫時無法載入</h2><p>${escapeHtml(error.message)}</p></div>`;
});
