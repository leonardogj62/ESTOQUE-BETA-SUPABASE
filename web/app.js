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

const state = {
  rows: [],
  health: [],
  query: "",
  source: "todos",
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
}

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

async function supabaseSelect(resource, query, range = null) {
  const headers = { ...restHeaders };
  if (range) headers.range = `${range.from}-${range.to}`;

  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}?${query}`, {
    headers,
  });
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

function readableError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

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
