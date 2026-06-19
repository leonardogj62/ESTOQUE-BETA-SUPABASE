const CONFIG = {
  supabaseUrl: "https://jqffpijcrzflojahbfyp.supabase.co",
  supabaseAnonKey: "sb_publishable_AdUjgkJxz54MDgLX_b9tfw_yTJVh4I6",
  importFunctionUrl: "https://jqffpijcrzflojahbfyp.supabase.co/functions/v1/import-stock",
  importFunctionBearer: "COLE_AQUI_UM_TOKEN_SECRETO_OPCIONAL",
};

const restHeaders = {
  apikey: CONFIG.supabaseAnonKey,
  accept: "application/json",
};

const writeHeaders = {
  apikey: CONFIG.supabaseAnonKey,
  authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
  "content-type": "application/json",
  prefer: "return=representation",
};

const state = {
  rows: [],
  health: [],
  prices: [],
  labels: [],
  query: "",
  source: "todos",
  priceQuery: "",
  priceCurrency: "todos",
  groupByProcess: false,
  expandedResults: new Set(),
  expandedWashing: new Set(),
  expandedAllResults: false,
  showroom: {
    updates: [],
    itemCounts: new Map(),
  },
  selectorSelected: new Set(),
};

const els = {
  status: document.getElementById("status"),
  input: document.getElementById("search-input"),
  refresh: document.getElementById("refresh-button"),
  importButton: document.getElementById("import-button"),
  importLabelsButton: document.getElementById("import-labels-button"),
  healthGrid: document.getElementById("health-grid"),
  filters: document.getElementById("source-filters"),
  toggleAllProducts: document.getElementById("toggle-all-products"),
  groupProcessButton: document.getElementById("group-process-button"),
  results: document.getElementById("results"),
  count: document.getElementById("result-count"),
  emptyTemplate: document.getElementById("empty-template"),
  // abas
  tabBusca: document.getElementById("tab-busca"),
  tabMostruario: document.getElementById("tab-mostruario"),
  tabPrecos: document.getElementById("tab-precos"),
  priceSearch: document.getElementById("price-search-input"),
  priceCurrencyFilter: document.getElementById("price-currency-filter"),
  importPricesButton: document.getElementById("import-prices-button"),
  newPriceButton: document.getElementById("new-price-button"),
  priceResults: document.getElementById("price-results"),
  priceCount: document.getElementById("price-count"),
  priceModal: document.getElementById("price-modal"),
  manualPriceProduct: document.getElementById("manual-price-product"),
  manualPriceUnit: document.getElementById("manual-price-unit"),
  manualPriceCurrency: document.getElementById("manual-price-currency"),
  manualPriceCommissions: document.getElementById("manual-price-commissions"),
  manualPriceAvailability: document.getElementById("manual-price-availability"),
  manualPriceExpected: document.getElementById("manual-price-expected"),
  cancelPriceBtn: document.getElementById("cancel-price-btn"),
  savePriceBtn: document.getElementById("save-price-btn"),
  // mostruário
  newUpdateBtn: document.getElementById("new-update-btn"),
  showroomHistory: document.getElementById("showroom-history"),
  showroomDiffSection: document.getElementById("showroom-diff-section"),
  showroomDiffTitle: document.getElementById("showroom-diff-title"),
  showroomDiff: document.getElementById("showroom-diff"),
  closeDiffBtn: document.getElementById("close-diff-btn"),
  // modal seletor
  modal: document.getElementById("product-selector-modal"),
  modalSearch: document.getElementById("product-selector-search"),
  modalList: document.getElementById("product-selector-list"),
  selectorCount: document.getElementById("selector-count"),
  confirmBtn: document.getElementById("confirm-update-btn"),
  cancelBtn: document.getElementById("cancel-update-btn"),
};

const configured = !CONFIG.supabaseUrl.startsWith("COLE_AQUI");

boot();

async function boot() {
  if (!configured) {
    els.status.textContent = "Configure Supabase URL e anon key em web/app.js";
    renderEmpty("Supabase ainda não configurado", "Cole as chaves em web/app.js para começar.");
    return;
  }

  bindEvents();
  await refreshAll();
}

function bindEvents() {
  els.input.addEventListener("input", () => {
    state.query = els.input.value.trim();
    resetResultExpansion();
    renderResults();
  });

  els.refresh.addEventListener("click", refreshAll);
  els.importButton.addEventListener("click", runImport);
  els.importLabelsButton.addEventListener("click", runLabelImport);
  els.importPricesButton.addEventListener("click", runPriceImport);
  els.newPriceButton.addEventListener("click", openPriceModal);
  els.cancelPriceBtn.addEventListener("click", closePriceModal);
  els.savePriceBtn.addEventListener("click", saveManualPrice);
  els.priceModal.addEventListener("click", (event) => {
    if (event.target === els.priceModal) closePriceModal();
  });
  els.priceSearch.addEventListener("input", () => {
    state.priceQuery = els.priceSearch.value.trim();
    renderPrices();
  });
  els.priceCurrencyFilter.addEventListener("change", () => {
    state.priceCurrency = els.priceCurrencyFilter.value;
    renderPrices();
  });
  els.toggleAllProducts.addEventListener("click", toggleAllCurrentResults);
  els.groupProcessButton.addEventListener("click", () => {
    state.groupByProcess = !state.groupByProcess;
    resetResultExpansion();
    renderResults();
  });
  els.results.addEventListener("click", (event) => {
    const target = event.target;
    const washingBtn = target instanceof Element
      ? target.closest(".washing-toggle")
      : target?.parentElement?.closest(".washing-toggle");
    if (washingBtn) {
      toggleWashingBlock(washingBtn.dataset.key);
      return;
    }

    const btn = target instanceof Element
      ? target.closest(".product-toggle")
      : target?.parentElement?.closest(".product-toggle");
    if (!btn) return;
    toggleProductBlock(btn.dataset.key);
  });

  // Navegação entre abas
  document.getElementById("main-tabs").addEventListener("click", (event) => {
    const target = event.target;
    const btn = target instanceof Element
      ? target.closest(".tab")
      : target?.parentElement?.closest(".tab");
    if (!btn) return;
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === "mostruario") loadAndRenderShowroom();
    if (btn.dataset.tab === "precos") renderPrices();
  });

  // Mostruário
  els.newUpdateBtn.addEventListener("click", openProductSelector);
  els.closeDiffBtn.addEventListener("click", () => {
    els.showroomDiffSection.hidden = true;
  });

  // Modal
  els.cancelBtn.addEventListener("click", closeProductSelector);
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeProductSelector();
  });
  els.confirmBtn.addEventListener("click", saveShowroomUpdate);
  els.modalSearch.addEventListener("input", () => {
    renderProductSelectorItems(els.modalSearch.value);
  });
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function switchTab(tabName) {
  els.tabBusca.hidden = tabName !== "busca";
  els.tabMostruario.hidden = tabName !== "mostruario";
  els.tabPrecos.hidden = tabName !== "precos";
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
}

// ---------------------------------------------------------------------------
// Dados de estoque (busca)
// ---------------------------------------------------------------------------

async function refreshAll() {
  els.status.textContent = "Carregando dados...";
  const [health, stock, prices, labels] = await Promise.all([loadHealth(), loadStock(), loadPrices(), loadLabels()]);
  state.health = health;
  state.rows = stock;
  state.prices = prices;
  state.labels = labels;
  renderHealth();
  renderFilters();
  renderResults();
  renderPrices();
  const lastImport = health.map((h) => h.imported_at).filter(Boolean).sort().at(-1);
  els.status.textContent = lastImport ? `Atualizado em ${formatDate(lastImport)}` : "Sem importação concluída";
}

async function loadHealth() {
  try {
    return await supabaseSelect("v_source_health", "select=*");
  } catch (error) {
    els.status.textContent = "Erro ao carregar saúde dos estoques";
    console.error(error);
    return [];
  }
}

async function loadStock() {
  try {
    return await supabaseSelectAll("v_stock_search", "select=*&order=product_name.asc");
  } catch (error) {
    els.status.textContent = "Erro ao carregar busca";
    console.error(error);
    return [];
  }
}

async function loadPrices() {
  try {
    return await supabaseSelectAll("price_items", "select=*&order=display_name.asc,updated_at.desc");
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function loadLabels() {
  try {
    return await supabaseSelectAll("product_labels", "select=*&order=display_name.asc");
  } catch (error) {
    console.error(error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

async function runImport() {
  if (CONFIG.importFunctionUrl.startsWith("COLE_AQUI")) {
    alert("Configure importFunctionUrl em web/app.js antes de importar.");
    return;
  }

  els.importButton.disabled = true;
  els.importButton.textContent = "Importando...";
  els.status.textContent = "Importando arquivos do Drive...";

  try {
    const headers = { ...restHeaders, "content-type": "application/json" };
    if (!CONFIG.importFunctionBearer.startsWith("COLE_AQUI")) {
      headers.authorization = `Bearer ${CONFIG.importFunctionBearer}`;
    }

    const sources = state.health.length ? state.health : [{ slug: "todos", label: "Todos os estoques" }];
    const failures = [];

    for (const source of sources) {
      els.status.textContent = `Importando ${source.label}...`;
      const res = await fetch(CONFIG.importFunctionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ source_slug: source.slug }),
      });
      const payload = await res.json();
      if (!res.ok || payload.ok === false) {
        failures.push(`${source.label}: ${readableError(payload.error || payload || "Importação falhou")}`);
      }
      await refreshAll();
    }

    if (failures.length) throw new Error(failures.join(" | "));
    await refreshAll();
  } catch (error) {
    els.status.textContent = readableError(error);
  } finally {
    els.importButton.disabled = false;
    els.importButton.textContent = "Importar Drive";
  }
}

async function runPriceImport() {
  if (CONFIG.importFunctionUrl.startsWith("COLE_AQUI")) {
    alert("Configure importFunctionUrl em web/app.js antes de importar.");
    return;
  }

  els.importPricesButton.disabled = true;
  els.importPricesButton.textContent = "Importando...";
  els.status.textContent = "Importando tabela de preços...";

  try {
    const headers = { ...restHeaders, "content-type": "application/json" };
    if (!CONFIG.importFunctionBearer.startsWith("COLE_AQUI")) {
      headers.authorization = `Bearer ${CONFIG.importFunctionBearer}`;
    }

    const res = await fetch(CONFIG.importFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "import_prices" }),
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(readableError(payload.error || payload || "Importação de preços falhou"));
    }

    state.prices = await loadPrices();
    renderPrices();
    renderResults();
    els.status.textContent = "Tabela de preços importada";
  } catch (error) {
    els.status.textContent = readableError(error);
  } finally {
    els.importPricesButton.disabled = false;
    els.importPricesButton.textContent = "Importar Preços";
  }
}

async function runLabelImport() {
  if (CONFIG.importFunctionUrl.startsWith("COLE_AQUI")) {
    alert("Configure importFunctionUrl em web/app.js antes de importar.");
    return;
  }

  els.importLabelsButton.disabled = true;
  els.importLabelsButton.textContent = "Importando...";
  els.status.textContent = "Importando etiquetas...";

  try {
    const headers = { ...restHeaders, "content-type": "application/json" };
    if (!CONFIG.importFunctionBearer.startsWith("COLE_AQUI")) {
      headers.authorization = `Bearer ${CONFIG.importFunctionBearer}`;
    }

    const res = await fetch(CONFIG.importFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "import_labels" }),
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(readableError(payload.error || payload || "Importação de etiquetas falhou"));
    }

    state.labels = await loadLabels();
    renderResults();
    els.status.textContent = "Etiquetas importadas";
  } catch (error) {
    els.status.textContent = readableError(error);
  } finally {
    els.importLabelsButton.disabled = false;
    els.importLabelsButton.textContent = "Importar Etiquetas";
  }
}

// ---------------------------------------------------------------------------
// Supabase: leitura
// ---------------------------------------------------------------------------

async function supabaseSelect(resource, query, range = null) {
  const headers = { ...restHeaders };
  if (range) headers.range = `${range.from}-${range.to}`;

  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}?${query}`, { headers });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Consulta ao Supabase falhou");
  return payload || [];
}

async function supabaseSelectAll(resource, query) {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; from < 50000; from += pageSize) {
    const page = await supabaseSelect(resource, query, { from, to: from + pageSize - 1 });
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Supabase: escrita
// ---------------------------------------------------------------------------

async function supabaseInsert(resource, body) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}`, {
    method: "POST",
    headers: writeHeaders,
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Escrita no Supabase falhou");
  return payload;
}

async function supabaseDelete(resource, query) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}?${query}`, {
    method: "DELETE",
    headers: writeHeaders,
  });
  if (!res.ok) {
    const payload = await res.json();
    throw new Error(payload.message || "Exclusão no Supabase falhou");
  }
}

// ---------------------------------------------------------------------------
// Render: busca de estoque
// ---------------------------------------------------------------------------

function renderHealth() {
  els.healthGrid.innerHTML = state.health.map((source) => {
    const status = source.status || "empty";
    const count = Number(source.product_count || 0);
    return `
      <article class="health-card ${status === "imported" && count > 0 ? "ok" : status}">
        <div class="health-label">${escapeHtml(source.label)}</div>
        <div class="health-count">${count}</div>
        <div class="health-meta">
          ${escapeHtml(source.file_name || "Nenhum arquivo")}<br>
          ${source.imported_at ? escapeHtml(formatDate(source.imported_at)) : "Nunca importado"}
          ${source.error_message ? `<br>${escapeHtml(source.error_message)}` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderFilters() {
  const labels = [{ slug: "todos", label: "Todos" }]
    .concat(state.health.map((h) => ({ slug: h.slug, label: h.label })));
  els.filters.innerHTML = labels.map((item) => (
    `<button class="filter ${state.source === item.slug ? "active" : ""}" data-source="${item.slug}">${escapeHtml(item.label)}</button>`
  )).join("");

  els.filters.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.source = button.dataset.source;
      resetResultExpansion();
      renderFilters();
      renderResults();
    });
  });
}

function renderResults() {
  const filtered = state.rows.filter((row) => {
    const bySource = state.source === "todos" || row.source_slug === state.source;
    if (!bySource) return false;
    const q = normalize(state.query);
    if (!q) return true;
    return normalize(row.product_name).includes(q)
      || normalize(row.color_name).includes(q)
      || normalize(row.process_code || "").includes(q);
  });

  if (!filtered.length) {
    renderEmpty("Nenhum produto encontrado", "Tente outro filtro ou rode uma nova importação.");
    updateResultControlLabels([]);
    return;
  }

  const grouped = state.groupByProcess ? groupByProductProcess(filtered) : groupByProduct(filtered);
  syncExpandedResults(grouped);
  els.count.textContent = state.groupByProcess
    ? `${grouped.length} processo(s) · ${filtered.length} cor(es)`
    : `${grouped.length} produto(s) · ${filtered.length} cor(es)`;
  els.results.innerHTML = grouped.map(renderProduct).join("");
  updateResultControlLabels(grouped);
}

function groupByProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = resultKey("produto", row.product_name);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: row.product_name,
        subtitle: "",
        items: [],
      });
    }
    map.get(key).items.push(row);
  }
  return [...map.values()];
}

function groupByProductProcess(rows) {
  const map = new Map();
  for (const row of rows) {
    const process = row.process_code || "Sem processo";
    const key = resultKey("processo", row.product_name, process);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: row.product_name,
        subtitle: `Processo: ${process}`,
        items: [],
      });
    }
    map.get(key).items.push(row);
  }
  return [...map.values()];
}

function renderProduct(product) {
  const total = product.items.reduce((sum, item) => sum + Number(item.quantity_meters || 0), 0);
  const sources = [...new Map(product.items.map((i) => [i.source_label, i])).values()];
  const expanded = state.expandedResults.has(product.key);
  const unit = unitForProduct(product.name);
  const productPrices = pricesForProduct(product.name);
  const productLabels = labelsForProduct(product.name);
  const primaryLabel = primaryLabelForProduct(productLabels);
  const washingOpen = state.expandedWashing.has(product.key);
  return `
    <article class="product-card ${expanded ? "expanded" : ""}">
      <button class="product-head product-toggle" type="button" data-key="${escapeHtml(product.key)}" aria-expanded="${expanded ? "true" : "false"}">
        <div class="product-summary">
          <div class="product-name">${escapeHtml(product.name)}</div>
          ${product.subtitle ? `<div class="product-process">${escapeHtml(product.subtitle)}</div>` : ""}
          <div class="product-total">${product.items.length} cor(es) · ${formatQuantity(total, unit)}</div>
          <div class="source-tags">
            ${sources.map((s) => `<span class="tag ${sourceClass(s)}">${escapeHtml(s.source_label)}</span>`).join("")}
          </div>
          ${productPrices.length ? `<div class="price-tags">${productPrices.slice(0, 2).map(renderPriceTag).join("")}</div>` : ""}
          ${primaryLabel ? renderLabelHeader(primaryLabel, productLabels.length) : ""}
        </div>
        <span class="product-arrow" aria-hidden="true">⌄</span>
      </button>
      ${primaryLabel ? renderWashingPanel(primaryLabel, product.key, washingOpen) : ""}
      <div class="color-list" ${expanded ? "" : "hidden"}>
        ${product.items.map((item) => `
          <div class="color-row">
            <div>
              <strong>${escapeHtml(item.color_name)}</strong>
              <div class="color-meta">${escapeHtml(item.source_label)}${item.process_code ? ` · Processo: ${escapeHtml(item.process_code)}` : ""}</div>
            </div>
            <div class="qty">${formatQuantity(Number(item.quantity_meters || 0), unitForProduct(item.product_name))}</div>
          </div>
        `).join("")}
      </div>
      <div class="label-list" ${expanded && productLabels.length ? "" : "hidden"}>
        <div class="label-list-title">Etiquetas do produto</div>
        ${productLabels.slice(0, 8).map(renderProductLabel).join("")}
        ${productLabels.length > 8 ? `<div class="label-more">Mostrando 8 de ${productLabels.length} etiqueta(s)</div>` : ""}
      </div>
    </article>
  `;
}

function labelsForProduct(productName) {
  const normalizedName = normalize(productName);
  return state.labels.filter((label) => {
    const labelName = normalize(label.display_name || label.normalized_name || "");
    return labelName === normalizedName || normalizedName.includes(labelName) || labelName.includes(normalizedName);
  }).sort((a, b) => {
    const scoreDiff = labelScore(b) - labelScore(a);
    if (scoreDiff) return scoreDiff;
    if (a.reference && !b.reference) return -1;
    if (!a.reference && b.reference) return 1;
    return String(a.display_name || "").localeCompare(String(b.display_name || ""));
  });
}

function labelScore(label) {
  return [
    label.reference,
    label.width,
    label.weight,
    label.composition,
    label.origin,
    Array.isArray(label.washing_instructions) && label.washing_instructions.length,
  ].filter(Boolean).length;
}

function primaryLabelForProduct(labels) {
  return labels.find((label) => labelScore(label) > 1) || labels[0] || null;
}

function renderLabelHeader(label) {
  const facts = [
    label.reference ? `Ref ${label.reference}` : null,
    label.width ? `Larg. ${label.width}` : null,
    label.weight ? `Gram. ${label.weight}` : null,
  ].filter(Boolean);
  const composition = fullComposition(label.composition);

  return `
    <div class="label-header">
      ${facts.length ? `<div class="label-tech-line">${escapeHtml(facts.join(" · "))}</div>` : ""}
      ${composition ? `<div class="label-composition">${escapeHtml(composition)}</div>` : ""}
    </div>
  `;
}

function renderWashingPanel(label, productKey, open) {
  const instructions = normalizeWashingInstructions(label.washing_instructions);
  if (!instructions.length) return "";

  return `
    <div class="washing-panel">
      <button class="washing-toggle" type="button" data-key="${escapeHtml(productKey)}" aria-expanded="${open ? "true" : "false"}">
        ${open ? "Ocultar modo de lavagem" : "Mostrar modo de lavagem"}
      </button>
      <div class="washing-content" ${open ? "" : "hidden"}>
        ${renderWashingIcons(instructions, 20)}
        <div class="washing-text">${instructions.map(escapeHtml).join(" · ")}</div>
      </div>
    </div>
  `;
}

function renderProductLabel(label) {
  const photoUrl = label.drive_photo_id ? `https://drive.google.com/file/d/${encodeURIComponent(label.drive_photo_id)}/view` : "";
  const details = [
    label.reference ? `Ref: ${label.reference}` : "",
    label.width ? `Largura: ${label.width}` : "",
    label.weight ? `Gramatura: ${label.weight}` : "",
    label.composition ? `Composição: ${label.composition}` : "",
  ].filter(Boolean);

  return `
    <div class="product-label-card">
      <div>
        <strong>${escapeHtml(label.display_name || "Etiqueta")}</strong>
        ${details.length ? `<div class="label-details">${details.map(escapeHtml).join(" · ")}</div>` : ""}
        ${renderWashingIcons(label.washing_instructions, 10)}
        ${label.ocr_text ? `<div class="label-ocr">${escapeHtml(label.ocr_text)}</div>` : ""}
      </div>
      ${photoUrl ? `<a class="label-photo-link" href="${photoUrl}" target="_blank" rel="noopener">Ver foto</a>` : ""}
    </div>
  `;
}

function fullComposition(composition) {
  if (!composition) return "";
  const parts = String(composition).split(";").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : String(composition).trim();
}

function renderWashingIcons(instructions, limit = 6) {
  const items = normalizeWashingInstructions(instructions)
    .map(washingIconFor)
    .filter(Boolean);
  if (!items.length) return "";
  return `
    <div class="washing-icons" aria-label="Modos de lavagem">
      ${items.slice(0, limit).map((item) => `
        <span class="wash-icon" title="${escapeAttr(item.label)}" aria-label="${escapeAttr(item.label)}">${escapeHtml(item.icon)}</span>
      `).join("")}
      ${items.length > limit ? `<span class="wash-icon more" title="${items.length - limit} modo(s) a mais">+${items.length - limit}</span>` : ""}
    </div>
  `;
}

function normalizeWashingInstructions(instructions) {
  if (!instructions) return [];
  if (Array.isArray(instructions)) return instructions.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof instructions === "string") {
    try {
      const parsed = JSON.parse(instructions);
      if (Array.isArray(parsed)) return normalizeWashingInstructions(parsed);
    } catch (_) {
      return instructions.split(";").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function washingIconFor(instruction) {
  const text = normalize(instruction).toLowerCase();
  if (!text) return null;
  if (text.includes("30") || text.includes("lavar ate 30")) return { icon: "30°", label: instruction };
  if (text.includes("mao")) return { icon: "✋", label: instruction };
  if (text.includes("nao alvejar")) return { icon: "△×", label: instruction };
  if (text.includes("nao secar em tambor")) return { icon: "▢○×", label: instruction };
  if (text.includes("secar em tambor")) return { icon: "▢○•", label: instruction };
  if (text.includes("secagem vertical")) return { icon: "▯│", label: instruction };
  if (text.includes("secagem horizontal")) return { icon: "▯─", label: instruction };
  if (text.includes("passar baixa") || text.includes("passar em baixa")) return { icon: "♨", label: instruction };
  if (text.includes("nao passar")) return { icon: "♨×", label: instruction };
  if (text.includes("nao lavar a seco")) return { icon: "P×", label: instruction };
  if (text.includes("lavagem a seco")) return { icon: "P", label: instruction };
  if (text.includes("limpeza profissional a umido") || /\bw\b/i.test(instruction)) return { icon: "W", label: instruction };
  return { icon: "i", label: instruction };
}

function renderEmpty(title, detail) {
  els.results.innerHTML = `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
  els.count.textContent = "";
}

function resultKey(...parts) {
  return parts.map((part) => normalize(part)).join("|||");
}

function resetResultExpansion() {
  state.expandedResults = new Set();
  state.expandedWashing = new Set();
  state.expandedAllResults = false;
}

function syncExpandedResults(groups) {
  const validKeys = new Set(groups.map((group) => group.key));
  state.expandedWashing = new Set([...state.expandedWashing].filter((key) => validKeys.has(key)));

  if (state.expandedAllResults) {
    state.expandedResults = new Set(groups.map((group) => group.key));
    return;
  }
  state.expandedResults = new Set([...state.expandedResults].filter((key) => validKeys.has(key)));
}

function toggleProductBlock(key) {
  if (!key) return;
  if (state.expandedResults.has(key)) {
    state.expandedResults.delete(key);
  } else {
    state.expandedResults.add(key);
  }
  state.expandedAllResults = false;
  renderResults();
}

function toggleWashingBlock(key) {
  if (!key) return;
  if (state.expandedWashing.has(key)) {
    state.expandedWashing.delete(key);
  } else {
    state.expandedWashing.add(key);
  }
  renderResults();
}

function toggleAllCurrentResults() {
  const filtered = state.rows.filter((row) => {
    const bySource = state.source === "todos" || row.source_slug === state.source;
    if (!bySource) return false;
    const q = normalize(state.query);
    if (!q) return true;
    return normalize(row.product_name).includes(q)
      || normalize(row.color_name).includes(q)
      || normalize(row.process_code || "").includes(q);
  });
  const grouped = state.groupByProcess ? groupByProductProcess(filtered) : groupByProduct(filtered);
  state.expandedAllResults = !state.expandedAllResults;
  state.expandedResults = state.expandedAllResults
    ? new Set(grouped.map((group) => group.key))
    : new Set();
  renderResults();
}

function updateResultControlLabels(groups) {
  els.groupProcessButton.textContent = state.groupByProcess ? "Agrupar por produto" : "Separar por processo";
  els.groupProcessButton.classList.toggle("active", state.groupByProcess);

  const allVisibleOpen = groups.length > 0 && groups.every((group) => state.expandedResults.has(group.key));
  els.toggleAllProducts.textContent = allVisibleOpen ? "Fechar todos" : "Abrir todos";
  els.toggleAllProducts.disabled = groups.length === 0;
}

// ---------------------------------------------------------------------------
// Preços
// ---------------------------------------------------------------------------

function renderPrices() {
  if (!els.priceResults) return;

  const q = normalize(state.priceQuery);
  const filtered = latestPrices().filter((price) => {
    const byCurrency = state.priceCurrency === "todos" || price.currency === state.priceCurrency;
    if (!byCurrency) return false;
    if (!q) return true;
    const commissions = Object.keys(readCommissionPrices(price)).join(" ");
    return normalize(price.display_name).includes(q) || normalize(commissions).includes(q);
  });

  els.priceCount.textContent = `${filtered.length} preço(s)`;
  if (!filtered.length) {
    els.priceResults.innerHTML = `
      <div class="empty">
        <strong>Nenhum preço encontrado</strong>
        <p>Importe a tabela do Drive ou insira um preço manualmente.</p>
      </div>`;
    return;
  }

  els.priceResults.innerHTML = filtered.map(renderPriceCard).join("");
}

function latestPrices() {
  const map = new Map();
  for (const price of state.prices) {
    const key = `${price.normalized_name}|||${price.currency}`;
    const current = map.get(key);
    if (!current || priceRank(price) > priceRank(current)) map.set(key, price);
  }
  return [...map.values()].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
}

function priceRank(price) {
  const sourceWeight = price.source_type === "manual" ? 2 : 1;
  return sourceWeight * 1e15 + new Date(price.updated_at || 0).getTime();
}

function pricesForProduct(productName) {
  const normalized = normalize(productName);
  return latestPrices().filter((price) => price.normalized_name === normalized);
}

function renderPriceCard(price) {
  const commissions = readCommissionPrices(price);
  return `
    <article class="price-card">
      <div>
        <div class="price-product">${escapeHtml(price.display_name)}</div>
        <div class="price-meta">
          ${escapeHtml(price.unit || unitForProduct(price.display_name))} · ${currencyLabel(price.currency)}
          ${price.availability ? ` · ${escapeHtml(price.availability)}` : ""}
          ${price.expected_arrival ? ` · ${escapeHtml(price.expected_arrival)}` : ""}
          ${price.source_type === "manual" ? " · manual" : " · Drive"}
        </div>
      </div>
      <div class="commission-grid">
        ${Object.entries(commissions).map(([label, value]) => `
          <div class="commission-pill">
            <span>${escapeHtml(label)}</span>
            <strong>${formatMoney(value, price.currency)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderPriceTag(price) {
  const commissions = readCommissionPrices(price);
  const first = Object.entries(commissions)[0];
  if (!first) return "";
  return `<span class="price-tag">${formatMoney(first[1], price.currency)}</span>`;
}

function readCommissionPrices(price) {
  if (price.commission_prices && typeof price.commission_prices === "object") {
    return price.commission_prices;
  }
  const fallback = {};
  ["price_1", "price_2", "price_3", "price_4"].forEach((field, index) => {
    if (price[field] != null) fallback[`Preço ${index + 1}`] = Number(price[field]);
  });
  return fallback;
}

function openPriceModal() {
  els.manualPriceProduct.value = "";
  els.manualPriceUnit.value = "m";
  els.manualPriceCurrency.value = "BRL";
  els.manualPriceCommissions.value = "";
  els.manualPriceAvailability.value = "";
  els.manualPriceExpected.value = "";
  els.savePriceBtn.textContent = "Salvar";
  els.priceModal.hidden = false;
  els.manualPriceProduct.focus();
}

function closePriceModal() {
  els.priceModal.hidden = true;
  els.savePriceBtn.textContent = "Salvar";
}

async function saveManualPrice() {
  const product = els.manualPriceProduct.value.trim();
  const currency = els.manualPriceCurrency.value;
  const commissions = parseCommissionInput(els.manualPriceCommissions.value);
  if (!product) {
    alert("Informe o nome do produto.");
    return;
  }
  if (!Object.keys(commissions).length) {
    alert("Informe pelo menos uma comissão e valor.");
    return;
  }

  els.savePriceBtn.disabled = true;
  els.savePriceBtn.textContent = "Salvando...";

  try {
    const normalized = normalize(product);
    await supabaseDelete(
      "price_items",
      `source_type=eq.manual&normalized_name=eq.${encodeURIComponent(normalized)}&currency=eq.${encodeURIComponent(currency)}`
    );

    const values = Object.values(commissions);
    await supabaseInsert("price_items", {
      normalized_name: normalized,
      display_name: product,
      unit: els.manualPriceUnit.value,
      currency,
      commission_prices: commissions,
      price_1: values[0] ?? null,
      price_2: values[1] ?? null,
      price_3: values[2] ?? null,
      price_4: values[3] ?? null,
      availability: els.manualPriceAvailability.value.trim() || null,
      expected_arrival: els.manualPriceExpected.value.trim() || null,
      source_type: "manual",
      updated_at: new Date().toISOString(),
    });

    closePriceModal();
    state.prices = await loadPrices();
    renderPrices();
    renderResults();
  } catch (error) {
    alert("Erro ao salvar preço: " + readableError(error));
  } finally {
    els.savePriceBtn.disabled = false;
    els.savePriceBtn.textContent = "Salvar";
  }
}

function parseCommissionInput(value) {
  const result = {};
  const lines = String(value || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(.+?)(?:=|:|-)\s*(.+)$/);
    if (!match) continue;
    const label = match[1].trim();
    const amount = parseMoney(match[2]);
    if (label && amount > 0) result[label] = amount;
  }
  return result;
}

function parseMoney(value) {
  let raw = String(value || "").trim().replace(/[^\d,.\-]/g, "");
  if (!raw) return NaN;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  return Math.round(Number.parseFloat(raw) * 100) / 100;
}

function formatMoney(value, currency) {
  const symbol = currency === "USD" ? "U$" : "R$";
  const formatted = Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`;
}

function currencyLabel(currency) {
  return currency === "USD" ? "U$" : "R$";
}

function formatQuantity(value, unit) {
  return `${Math.round(Number(value || 0))} ${unit}`;
}

function unitForProduct(productName) {
  return /\bMALHAS?\b/.test(normalize(productName)) ? "kg" : "m";
}

// ---------------------------------------------------------------------------
// Mostruário: histórico
// ---------------------------------------------------------------------------

async function loadAndRenderShowroom() {
  els.showroomHistory.innerHTML = "<p class=\"showroom-loading\">Carregando histórico...</p>";
  try {
    const updates = await supabaseSelect(
      "showroom_updates",
      "select=id,updated_at,note&order=updated_at.desc"
    );
    const itemRows = await supabaseSelectAll(
      "showroom_update_items",
      "select=update_id,product_name"
    );
    state.showroom.updates = updates;
    state.showroom.itemCounts = summarizeShowroomItemCounts(itemRows);
    renderShowroomSection();
  } catch (error) {
    els.showroomHistory.innerHTML = `<div class="empty"><strong>Erro ao carregar histórico</strong><p>${escapeHtml(readableError(error))}</p></div>`;
  }
}

function summarizeShowroomItemCounts(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.update_id)) {
      map.set(item.update_id, { itemCount: 0, products: new Set() });
    }
    const entry = map.get(item.update_id);
    entry.itemCount += 1;
    entry.products.add(item.product_name);
  }

  return new Map([...map.entries()].map(([updateId, entry]) => [
    updateId,
    { itemCount: entry.itemCount, productCount: entry.products.size },
  ]));
}

function renderShowroomSection() {
  if (!state.showroom.updates.length) {
    els.showroomHistory.innerHTML = `
      <div class="empty">
        <strong>Nenhuma atualização registrada</strong>
        <p>Clique em "Atualizar Mostruário" para registrar a primeira.</p>
      </div>`;
    return;
  }

  els.showroomHistory.innerHTML = state.showroom.updates.map((u) => `
    <article class="showroom-card">
      <div>
        <div class="showroom-card-date">${escapeHtml(formatDate(u.updated_at))}</div>
        <div class="showroom-card-summary">${escapeHtml(showroomUpdateSummary(u.id))}</div>
      </div>
      ${u.note ? `<div class="showroom-card-note">${escapeHtml(u.note)}</div>` : ""}
      <button class="showroom-view-diff" data-id="${u.id}" type="button">Ver comparação</button>
    </article>
  `).join("");

  els.showroomHistory.querySelectorAll(".showroom-view-diff").forEach((btn) => {
    btn.addEventListener("click", () => viewShowroomDiff(Number(btn.dataset.id)));
  });
}

function showroomUpdateSummary(updateId) {
  const counts = state.showroom.itemCounts.get(updateId);
  if (!counts) return "Sem itens registrados";
  return `${counts.productCount} produto(s) · ${counts.itemCount} cor(es)/fonte(s)`;
}

// ---------------------------------------------------------------------------
// Mostruário: diff
// ---------------------------------------------------------------------------

async function viewShowroomDiff(updateId) {
  els.showroomDiffSection.hidden = false;
  els.showroomDiff.innerHTML = "<p class=\"showroom-loading\">Calculando comparação...</p>";

  const update = state.showroom.updates.find((u) => u.id === updateId);
  els.showroomDiffTitle.textContent = update
    ? `Comparação — ${formatDate(update.updated_at)}`
    : "Comparação";

  try {
    const { diff, comparisonStatus } = await getShowroomDiff(updateId);
    renderShowroomDiff(diff, comparisonStatus);
  } catch (error) {
    els.showroomDiff.innerHTML = `<div class="empty"><strong>Erro ao carregar comparação</strong><p>${escapeHtml(readableError(error))}</p></div>`;
  }

  els.showroomDiffSection.scrollIntoView({ behavior: "smooth" });
}

async function getShowroomDiff(updateId) {
  const current = await supabaseSelectAll(
    "showroom_update_items",
    `update_id=eq.${updateId}&select=*&order=product_name.asc,source_label.asc,color.asc`
  );

  if (!current.length) {
    return {
      diff: [],
      comparisonStatus: "empty",
    };
  }

  const previousItems = await supabaseSelectAll(
    "showroom_update_items",
    `update_id=lt.${updateId}&select=*&order=update_id.desc,id.desc`
  );

  const prevMap = new Map();
  for (const item of previousItems) {
    const key = showroomItemKey(item);
    if (!prevMap.has(key)) prevMap.set(key, item);
  }

  const diff = current.map((item) => {
    const key = showroomItemKey(item);
    const prevItem = prevMap.get(key);
    const prevQty = prevItem != null ? Number(prevItem.quantity_at_time) : null;
    const currQty = Number(item.quantity_at_time);
    return {
      ...item,
      prev_quantity: prevQty,
      delta: prevQty !== null ? currQty - prevQty : null,
      isNew: !prevItem,
    };
  });

  const hasComparableItems = diff.some((item) => !item.isNew);
  return {
    diff,
    comparisonStatus: hasComparableItems ? "compared" : "no_common_previous",
  };
}

function showroomItemKey(item) {
  return `${item.product_name}|||${item.source_label}|||${item.color ?? ""}`;
}

function renderShowroomDiff(diff, comparisonStatus) {
  if (!diff.length) {
    els.showroomDiff.innerHTML = `<div class="empty"><strong>Nenhum item registrado nesta atualização.</strong></div>`;
    return;
  }

  if (comparisonStatus === "no_common_previous") {
    els.showroomDiff.innerHTML = `
      <p class="diff-notice">Ainda não existe atualização anterior com estes mesmos produtos e cores. Este registro fica salvo como base para a próxima comparação.</p>
      ${renderDiffTable(diff.map((i) => ({ ...i, rowClass: "row-new" })), `${diff.length} item(ns) registrado(s)`)}
    `;
    return;
  }

  const changed = diff.filter((i) => !i.isNew && i.delta !== 0);
  const newItems = diff.filter((i) => i.isNew);
  const unchanged = diff.filter((i) => !i.isNew && i.delta === 0);

  let html = "";
  if (changed.length) {
    html += renderDiffTable(
      changed.map((i) => ({ ...i, rowClass: i.delta > 0 ? "row-up" : "row-down" })),
      `${changed.length} item(ns) com alteração`
    );
  }
  if (newItems.length) {
    html += renderDiffTable(
      newItems.map((i) => ({ ...i, rowClass: "row-new" })),
      `${newItems.length} item(ns) novo(s) nesta atualização`
    );
  }
  if (unchanged.length) {
    html += renderDiffTable(
      unchanged.map((i) => ({ ...i, rowClass: "" })),
      `${unchanged.length} item(ns) sem alteração`,
      true
    );
  }

  els.showroomDiff.innerHTML = html || `<div class="empty"><strong>Nenhuma alteração detectada.</strong></div>`;
}

function renderDiffTable(items, title, collapsed = false) {
  return `
    <details class="diff-group" ${collapsed ? "" : "open"}>
      <summary>${escapeHtml(title)}</summary>
      <div class="diff-table-wrap">
        <table class="diff-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Fonte</th>
              <th>Cor</th>
              <th>Anterior</th>
              <th>Atual</th>
              <th>Diferença</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((i) => `
              <tr class="${i.rowClass}">
                <td>${escapeHtml(i.product_name)}</td>
                <td>${escapeHtml(i.source_label)}</td>
                <td>${escapeHtml(i.color || "—")}</td>
                <td>${i.prev_quantity !== null ? Math.round(i.prev_quantity) + " m" : "—"}</td>
                <td>${Math.round(Number(i.quantity_at_time))} m</td>
                <td class="diff-delta">${
                  i.delta !== null
                    ? (i.delta > 0 ? "+" : "") + Math.round(i.delta) + " m"
                    : "—"
                }</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

// ---------------------------------------------------------------------------
// Mostruário: modal seletor de produtos
// ---------------------------------------------------------------------------

function openProductSelector() {
  if (!state.rows.length) {
    alert("Os dados de estoque ainda não foram carregados. Aguarde ou clique em Atualizar.");
    return;
  }
  state.selectorSelected = new Set();
  els.modalSearch.value = "";
  els.confirmBtn.textContent = "Confirmar";
  renderProductSelectorItems("");
  updateSelectorCount();
  els.modal.hidden = false;
  els.modalSearch.focus();
}

function closeProductSelector() {
  els.modal.hidden = true;
  state.selectorSelected = new Set();
  els.confirmBtn.textContent = "Confirmar";
}

function getProductGroups(filterText) {
  const q = normalize(filterText);
  const map = new Map();
  for (const row of state.rows) {
    const key = row.product_name;
    if (!map.has(key)) {
      map.set(key, { product_name: row.product_name, rows: [] });
    }
    map.get(key).rows.push(row);
  }

  const groups = [...map.values()];
  if (!q) return groups;

  return groups.filter(
    (g) =>
      normalize(g.product_name).includes(q) ||
      g.rows.some((r) => normalize(r.color_name || "").includes(q))
  );
}

function renderProductSelectorItems(filterText) {
  const groups = getProductGroups(filterText);
  const MAX_SHOW = 300;
  const shown = groups.slice(0, MAX_SHOW);
  const hidden = groups.length - shown.length;

  if (!groups.length) {
    els.modalList.innerHTML = `<p class="selector-more">Nenhum produto encontrado.</p>`;
    return;
  }

  els.modalList.innerHTML =
    shown.map((g) => {
      const key = g.product_name;
      const checked = state.selectorSelected.has(key);
      const sources = [...new Set(g.rows.map((row) => row.source_label))];
      return `
        <label class="selector-item ${checked ? "selected" : ""}" data-key="${escapeHtml(key)}">
          <input type="checkbox" ${checked ? "checked" : ""}>
          <div class="selector-item-info">
            <div class="selector-product-name">${escapeHtml(g.product_name)}</div>
            <div class="selector-meta">${escapeHtml(sources.join(", "))} · ${g.rows.length} cor(es)/fonte(s)</div>
          </div>
        </label>
      `;
    }).join("") +
    (hidden > 0
      ? `<p class="selector-more">+${hidden} não mostrado(s). Refine a busca.</p>`
      : "");

  els.modalList.querySelectorAll(".selector-item").forEach((label) => {
    const checkbox = label.querySelector("input[type=checkbox]");
    checkbox.addEventListener("change", () => {
      const key = label.dataset.key;
      if (checkbox.checked) {
        state.selectorSelected.add(key);
        label.classList.add("selected");
      } else {
        state.selectorSelected.delete(key);
        label.classList.remove("selected");
      }
      updateSelectorCount();
    });
  });
}

function updateSelectorCount() {
  const count = state.selectorSelected.size;
  els.selectorCount.textContent = `${count} produto(s) selecionado(s)`;
  els.confirmBtn.disabled = count === 0;
}

// ---------------------------------------------------------------------------
// Mostruário: salvar atualização
// ---------------------------------------------------------------------------

async function saveShowroomUpdate() {
  els.confirmBtn.disabled = true;
  els.confirmBtn.textContent = "Salvando...";

  try {
    // Monta uma foto consolidada do estoque atual dos produtos selecionados.
    const itemMap = new Map();
    for (const key of state.selectorSelected) {
      const rows = state.rows.filter((r) => r.product_name === key);
      for (const row of rows) {
        const itemKey = `${row.product_name}|||${row.source_label}|||${row.color_name || ""}`;
        const current = itemMap.get(itemKey) || {
          product_name: row.product_name,
          source_label: row.source_label,
          color: row.color_name || null,
          quantity_at_time: 0,
        };
        current.quantity_at_time += Number(row.quantity_meters || 0);
        itemMap.set(itemKey, current);
      }
    }

    const items = [...itemMap.values()];

    if (!items.length) {
      throw new Error("Nenhum item de estoque foi encontrado para os produtos selecionados.");
    }

    // Cria o registro pai em showroom_updates
    const [update] = await supabaseInsert("showroom_updates", { note: null });

    // Insere os itens em lotes de 500
    for (let i = 0; i < items.length; i += 500) {
      const batch = items.slice(i, i + 500).map((item) => ({ ...item, update_id: update.id }));
      await supabaseInsert("showroom_update_items", batch);
    }

    closeProductSelector();
    await loadAndRenderShowroom();

    // Abre automaticamente o diff da atualização recém-criada
    await viewShowroomDiff(update.id);
  } catch (error) {
    alert("Erro ao salvar: " + readableError(error));
    els.confirmBtn.disabled = false;
    els.confirmBtn.textContent = "Confirmar";
  }
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function readableError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sourceClass(source) {
  if (source.availability === "pronta_entrega") return "pe";
  if (source.availability === "promocao") return "promo";
  return "";
}

function normalize(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
