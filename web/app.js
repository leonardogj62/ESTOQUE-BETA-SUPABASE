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
  query: "",
  source: "todos",
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
  healthGrid: document.getElementById("health-grid"),
  filters: document.getElementById("source-filters"),
  results: document.getElementById("results"),
  count: document.getElementById("result-count"),
  emptyTemplate: document.getElementById("empty-template"),
  // abas
  tabBusca: document.getElementById("tab-busca"),
  tabMostruario: document.getElementById("tab-mostruario"),
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
    renderResults();
  });

  els.refresh.addEventListener("click", refreshAll);
  els.importButton.addEventListener("click", runImport);

  // Navegação entre abas
  document.getElementById("main-tabs").addEventListener("click", (event) => {
    const target = event.target;
    const btn = target instanceof Element
      ? target.closest(".tab")
      : target?.parentElement?.closest(".tab");
    if (!btn) return;
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === "mostruario") loadAndRenderShowroom();
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
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
}

// ---------------------------------------------------------------------------
// Dados de estoque (busca)
// ---------------------------------------------------------------------------

async function refreshAll() {
  els.status.textContent = "Carregando dados...";
  const [health, stock] = await Promise.all([loadHealth(), loadStock()]);
  state.health = health;
  state.rows = stock;
  renderHealth();
  renderFilters();
  renderResults();
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

  els.count.textContent = `${filtered.length} cor(es)`;
  if (!filtered.length) {
    renderEmpty("Nenhum produto encontrado", "Tente outro filtro ou rode uma nova importação.");
    return;
  }

  const grouped = groupByProduct(filtered);
  els.results.innerHTML = grouped.map(renderProduct).join("");
}

function groupByProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.product_name)) map.set(row.product_name, []);
    map.get(row.product_name).push(row);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
}

function renderProduct(product) {
  const total = product.items.reduce((sum, item) => sum + Number(item.quantity_meters || 0), 0);
  const sources = [...new Map(product.items.map((i) => [i.source_label, i])).values()];
  return `
    <article class="product-card">
      <div class="product-head">
        <div class="product-name">${escapeHtml(product.name)}</div>
        <div class="product-total">${product.items.length} cor(es) · ${Math.round(total)} m</div>
        <div class="source-tags">
          ${sources.map((s) => `<span class="tag ${sourceClass(s)}">${escapeHtml(s.source_label)}</span>`).join("")}
        </div>
      </div>
      ${product.items.map((item) => `
        <div class="color-row">
          <div>
            <strong>${escapeHtml(item.color_name)}</strong>
            <div class="color-meta">${escapeHtml(item.source_label)}${item.process_code ? ` · Processo: ${escapeHtml(item.process_code)}` : ""}</div>
          </div>
          <div class="qty">${Math.round(Number(item.quantity_meters || 0))} m</div>
        </div>
      `).join("")}
    </article>
  `;
}

function renderEmpty(title, detail) {
  els.results.innerHTML = `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
  els.count.textContent = "";
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
