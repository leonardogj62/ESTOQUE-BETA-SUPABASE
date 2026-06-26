const CONFIG = {
  supabaseUrl: "https://jqffpijcrzflojahbfyp.supabase.co",
  supabaseAnonKey: "sb_publishable_AdUjgkJxz54MDgLX_b9tfw_yTJVh4I6",
  importFunctionUrl: "https://jqffpijcrzflojahbfyp.supabase.co/functions/v1/import-stock",
  importCatalogFunctionUrl: "https://jqffpijcrzflojahbfyp.supabase.co/functions/v1/import-avil-catalog",
  publicAppUrl: "https://leonardogj62.github.io/ESTOQUE-BETA-SUPABASE/web/",
};

const state = {
  session: null,
  companies: [],
  companyId: localStorage.getItem("estoque_company_id") || "",
  membership: null,
  rows: [],
  health: [],
  prices: [],
  labels: [],
  catalogAssets: [],
  catalogAssetsById: new Map(),
  refreshSeq: 0,
  query: "",
  source: "todos",
  avilFinish: "todos",
  priceQuery: "",
  priceCurrency: "todos",
  groupByProcess: false,
  expandedResults: new Set(),
  expandedWashing: new Set(),
  expandedAllResults: false,
  report: {
    scope: "visible",
    query: "",
    selected: new Set(),
  },
  compare: {
    source: "visible",
    finish: "todos",
    query: "",
    kinds: new Set(["esgotou", "voltou", "diminuiu", "aumentou", "novo"]),
    result: null,
  },
  showroom: {
    updates: [],
    itemCounts: new Map(),
  },
  selectorSelected: new Set(),
  registry: {
    type: "companies",
    rows: [],
    query: "",
    editing: null,
    companySources: [],
  },
};

const AVIL_SOURCE_SLUGS = new Set(["avil-malhas-estoque", "avil-tecidos-estoque"]);
const AVIL_FINISH_FILTERS = [
  { slug: "todos", label: "Todos" },
  { slug: "lisa", label: "Lisa" },
  { slug: "estampada", label: "Estampada" },
];

const REGISTRY_CONFIG = {
  companies: {
    title: "Empresas representadas",
    singular: "empresa",
    name: "trade_name",
    order: "trade_name.asc",
    fields: [
      ["trade_name", "Nome fantasia", "text", true],
      ["legal_name", "Razão social", "text"],
      ["tax_id", "CNPJ / documento", "text"],
      ["state_registration", "Inscrição estadual", "text"],
      ["email", "E-mail", "email"],
      ["phone", "Telefone", "tel"],
      ["website", "Site", "url"],
      ...addressFields(),
      ["price_drive_folder_id", "Pasta de preços no Drive", "text"],
      ["label_drive_folder_id", "Pasta de etiquetas no Drive", "text"],
      ["notes", "Observações", "textarea"],
    ],
  },
  products: {
    title: "Produtos",
    singular: "produto",
    name: "display_name",
    order: "display_name.asc",
    fields: [
      ["display_name", "Nome do produto", "text", true],
      ["reference", "Referência", "text"],
      ["category", "Categoria", "text"],
      ["unit", "Unidade", "select", false, [["m", "Metros"], ["kg", "Quilos"], ["un", "Unidades"]]],
      ["barcode", "Código de barras", "text"],
      ["ncm", "NCM", "text"],
      ["description", "Descrição", "textarea"],
      ["notes", "Observações", "textarea"],
    ],
  },
  customers: {
    title: "Clientes",
    singular: "cliente",
    name: "trade_name",
    order: "trade_name.asc",
    fields: partyFields(true),
  },
  suppliers: {
    title: "Fornecedores",
    singular: "fornecedor",
    name: "trade_name",
    order: "trade_name.asc",
    fields: partyFields(false),
  },
  carriers: {
    title: "Transportadoras",
    singular: "transportadora",
    name: "trade_name",
    order: "trade_name.asc",
    fields: [
      ...partyFields(false),
      ["delivery_regions", "Regiões atendidas", "textarea"],
    ],
  },
  sales_representatives: {
    title: "Vendedores",
    singular: "vendedor",
    name: "full_name",
    order: "full_name.asc",
    fields: [
      ["full_name", "Nome completo", "text", true],
      ["document", "CPF / documento", "text"],
      ["email", "E-mail", "email"],
      ["phone", "Telefone", "tel"],
      ["commission_percent", "Comissão padrão (%)", "number"],
      ["territory", "Região / carteira", "text"],
      ["notes", "Observações", "textarea"],
    ],
  },
};

function partyFields(includeCredit) {
  const fields = [
    ["trade_name", "Nome fantasia", "text", true],
    ["legal_name", "Razão social", "text"],
    ["tax_id", "CNPJ / documento", "text"],
    ["state_registration", "Inscrição estadual", "text"],
    ["contact_name", "Pessoa de contato", "text"],
    ["email", "E-mail", "email"],
    ["phone", "Telefone", "tel"],
    ...addressFields(),
  ];
  if (includeCredit) fields.push(["credit_limit", "Limite de crédito", "number"]);
  fields.push(["notes", "Observações", "textarea"]);
  return fields;
}

function addressFields() {
  return [
    ["address_postal_code", "CEP", "text"],
    ["address_street", "Endereço", "text"],
    ["address_number", "Número", "text"],
    ["address_complement", "Complemento", "text"],
    ["address_district", "Bairro", "text"],
    ["address_city", "Cidade", "text"],
    ["address_state", "Estado", "text"],
  ];
}

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
  stockReportButton: document.getElementById("stock-report-button"),
  stockCompareButton: document.getElementById("stock-compare-button"),
  stockComparePage: document.getElementById("stock-compare-page"),
  stockCompareTitle: document.getElementById("stock-compare-title"),
  stockCompareSubtitle: document.getElementById("stock-compare-subtitle"),
  stockCompareResults: document.getElementById("stock-compare-results"),
  backStockCompareButton: document.getElementById("back-stock-compare-button"),
  generateStockComparePdfButton: document.getElementById("generate-stock-compare-pdf-button"),
  results: document.getElementById("results"),
  count: document.getElementById("result-count"),
  emptyTemplate: document.getElementById("empty-template"),
  // abas
  mainTabs: document.getElementById("main-tabs"),
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
  importAvilButton: document.getElementById("import-avil-button"),
  avilFileInput: document.getElementById("avil-file-input"),
  importAvilCatalogButton: document.getElementById("import-avil-catalog-button"),
  avilCatalogFileInput: document.getElementById("avil-catalog-file-input"),
  catalogImageModal: document.getElementById("catalog-image-modal"),
  catalogImageTitle: document.getElementById("catalog-image-title"),
  catalogImagePreview: document.getElementById("catalog-image-preview"),
  catalogImageMeta: document.getElementById("catalog-image-meta"),
  closeCatalogImageButton: document.getElementById("close-catalog-image-button"),
  companySelect: document.getElementById("company-select"),
  accountButton: document.getElementById("account-button"),
  tabCadastros: document.getElementById("tab-cadastros"),
  authModal: document.getElementById("auth-modal"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authMessage: document.getElementById("auth-message"),
  cancelAuthButton: document.getElementById("cancel-auth-button"),
  signupButton: document.getElementById("signup-button"),
  loginButton: document.getElementById("login-button"),
  registryHeading: document.getElementById("registry-heading"),
  registrySummary: document.getElementById("registry-summary"),
  registrySearch: document.getElementById("registry-search"),
  registryResults: document.getElementById("registry-results"),
  newRegistryButton: document.getElementById("new-registry-button"),
  registryModal: document.getElementById("registry-modal"),
  registryModalTitle: document.getElementById("registry-modal-title"),
  registryForm: document.getElementById("registry-form"),
  cancelRegistryButton: document.getElementById("cancel-registry-button"),
  saveRegistryButton: document.getElementById("save-registry-button"),
  stockReportModal: document.getElementById("stock-report-modal"),
  stockReportScope: document.getElementById("stock-report-scope"),
  stockReportSearch: document.getElementById("stock-report-search"),
  stockReportSelectVisible: document.getElementById("stock-report-select-visible"),
  stockReportClear: document.getElementById("stock-report-clear"),
  stockReportSummary: document.getElementById("stock-report-summary"),
  stockReportList: document.getElementById("stock-report-list"),
  stockReportCount: document.getElementById("stock-report-count"),
  cancelStockReportButton: document.getElementById("cancel-stock-report-button"),
  generateStockReportButton: document.getElementById("generate-stock-report-button"),
  stockCompareModal: document.getElementById("stock-compare-modal"),
  stockCompareSource: document.getElementById("stock-compare-source"),
  stockCompareFinish: document.getElementById("stock-compare-finish"),
  stockCompareSearch: document.getElementById("stock-compare-search"),
  cancelStockCompareButton: document.getElementById("cancel-stock-compare-button"),
  runStockCompareButton: document.getElementById("run-stock-compare-button"),
};

const configured = !CONFIG.supabaseUrl.startsWith("COLE_AQUI");

// Configura worker do pdfjs (carregado via CDN no index.html)
if (typeof window !== "undefined" && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

boot();

async function boot() {
  if (!configured) {
    els.status.textContent = "Configure Supabase URL e anon key em web/app.js";
    renderEmpty("Supabase ainda não configurado", "Cole as chaves em web/app.js para começar.");
    return;
  }

  await restoreSession();
  await loadCompanies();
  bindEvents();
  renderCompanySwitcher();
  syncAccessUi();
  await refreshAll();
  await checkShareTarget();
  if (window.lucide) window.lucide.createIcons();
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
  els.importAvilButton.addEventListener("click", () => els.avilFileInput.click());
  els.avilFileInput.addEventListener("change", runAvilImport);
  els.importAvilCatalogButton.addEventListener("click", () => els.avilCatalogFileInput.click());
  els.avilCatalogFileInput.addEventListener("change", runAvilCatalogImport);
  els.closeCatalogImageButton.addEventListener("click", closeCatalogImageModal);
  els.catalogImageModal.addEventListener("click", (event) => {
    if (event.target === els.catalogImageModal) closeCatalogImageModal();
  });
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
  els.stockReportButton.addEventListener("click", openStockReportModal);
  els.stockCompareButton.addEventListener("click", openStockCompareModal);
  els.cancelStockCompareButton.addEventListener("click", closeStockCompareModal);
  els.stockCompareModal.addEventListener("click", (event) => {
    if (event.target === els.stockCompareModal) closeStockCompareModal();
  });
  els.runStockCompareButton.addEventListener("click", runStockComparisonReport);
  els.backStockCompareButton.addEventListener("click", closeStockComparisonPage);
  els.generateStockComparePdfButton.addEventListener("click", generateStockComparePdf);
  els.cancelStockReportButton.addEventListener("click", closeStockReportModal);
  els.stockReportModal.addEventListener("click", (event) => {
    if (event.target === els.stockReportModal) closeStockReportModal();
  });
  els.stockReportScope.addEventListener("change", () => {
    state.report.scope = els.stockReportScope.value;
    state.report.selected = new Set();
    renderStockReportList();
  });
  els.stockReportSearch.addEventListener("input", () => {
    state.report.query = els.stockReportSearch.value.trim();
    renderStockReportList();
  });
  els.stockReportSelectVisible.addEventListener("click", selectVisibleReportRows);
  els.stockReportClear.addEventListener("click", () => {
    state.report.selected = new Set();
    renderStockReportList();
  });
  els.generateStockReportButton.addEventListener("click", generateStockReportPdf);
  els.results.addEventListener("click", (event) => {
    const target = event.target;
    const washingBtn = target instanceof Element
      ? target.closest(".washing-toggle")
      : target?.parentElement?.closest(".washing-toggle");
    if (washingBtn) {
      toggleWashingBlock(washingBtn.dataset.key);
      return;
    }

    const catalogButton = target instanceof Element
      ? target.closest(".catalog-image-button")
      : target?.parentElement?.closest(".catalog-image-button");
    if (catalogButton) {
      openCatalogImageModal(catalogButton.dataset.catalogId);
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

  els.companySelect.addEventListener("change", async () => {
    state.companyId = els.companySelect.value;
    localStorage.setItem("estoque_company_id", state.companyId);
    resetResultExpansion();
    syncAccessUi();
    await refreshAll();
    if (!els.tabCadastros.hidden) await loadRegistry();
  });

  els.accountButton.addEventListener("click", () => {
    if (state.session) {
      if (confirm("Deseja sair do acesso administrativo?")) signOut();
    } else {
      openAuthModal();
    }
  });
  els.cancelAuthButton.addEventListener("click", closeAuthModal);
  els.authModal.addEventListener("click", (event) => {
    if (event.target === els.authModal) closeAuthModal();
  });
  els.loginButton.addEventListener("click", signIn);
  els.signupButton.addEventListener("click", signUp);

  document.querySelector(".registry-nav").addEventListener("click", async (event) => {
    const button = event.target.closest(".registry-nav-button");
    if (!button) return;
    state.registry.type = button.dataset.registry;
    state.registry.query = "";
    els.registrySearch.value = "";
    document.querySelectorAll(".registry-nav-button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    await loadRegistry();
  });
  els.registrySearch.addEventListener("input", () => {
    state.registry.query = els.registrySearch.value.trim();
    renderRegistry();
  });
  els.newRegistryButton.addEventListener("click", () => openRegistryModal());
  els.cancelRegistryButton.addEventListener("click", closeRegistryModal);
  els.registryModal.addEventListener("click", (event) => {
    if (event.target === els.registryModal) closeRegistryModal();
  });
  els.saveRegistryButton.addEventListener("click", saveRegistry);
  els.registryResults.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-registry-action]");
    if (!button) return;
    const row = state.registry.rows.find((item) => String(item.id) === button.dataset.id);
    if (!row) return;
    if (button.dataset.registryAction === "edit") openRegistryModal(row);
    if (button.dataset.registryAction === "toggle") await toggleRegistryRow(row);
  });
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function switchTab(tabName) {
  closeStockComparisonPage();
  els.tabBusca.hidden = tabName !== "busca";
  els.tabMostruario.hidden = tabName !== "mostruario";
  els.tabPrecos.hidden = tabName !== "precos";
  els.tabCadastros.hidden = tabName !== "cadastros";
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  if (tabName === "cadastros") loadRegistry();
}

// ---------------------------------------------------------------------------
// Acesso e empresa ativa
// ---------------------------------------------------------------------------

async function restoreSession() {
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (hash.get("access_token")) {
      const accessToken = hash.get("access_token");
      const userRes = await fetch(`${CONFIG.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: CONFIG.supabaseAnonKey, authorization: `Bearer ${accessToken}` },
      });
      const user = userRes.ok ? await userRes.json() : null;
      const session = {
        access_token: accessToken,
        refresh_token: hash.get("refresh_token"),
        expires_at: Math.floor(Date.now() / 1000) + Number(hash.get("expires_in") || 3600),
        user,
      };
      persistSession(session);
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      return;
    }
    const stored = JSON.parse(localStorage.getItem("estoque_session") || "null");
    if (!stored?.access_token) return;
    const expiresAt = Number(stored.expires_at || 0);
    if (expiresAt && expiresAt * 1000 < Date.now() + 60000 && stored.refresh_token) {
      state.session = await refreshSession(stored.refresh_token);
    } else {
      state.session = stored;
    }
  } catch {
    localStorage.removeItem("estoque_session");
  }
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: CONFIG.supabaseAnonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    localStorage.removeItem("estoque_session");
    return null;
  }
  const session = await res.json();
  persistSession(session);
  return session;
}

function persistSession(session) {
  state.session = session;
  if (session) localStorage.setItem("estoque_session", JSON.stringify(session));
  else localStorage.removeItem("estoque_session");
}

function requestHeaders({ write = false, prefer = "" } = {}) {
  const headers = {
    apikey: CONFIG.supabaseAnonKey,
    accept: "application/json",
  };
  if (state.session?.access_token) headers.authorization = `Bearer ${state.session.access_token}`;
  if (write) headers["content-type"] = "application/json";
  if (prefer) headers.prefer = prefer;
  return headers;
}

async function loadCompanies() {
  try {
    const companyFields = state.session
      ? "*"
      : "id,trade_name,slug,public_read,active";
    state.companies = await supabaseSelect("companies", `select=${companyFields}&active=eq.true&order=trade_name.asc`);
    if (state.session) {
      const memberships = await supabaseSelect(
        "organization_members",
        `select=organization_id,role,active&user_id=eq.${encodeURIComponent(sessionUserId())}&active=eq.true`
      );
      state.membership = memberships[0] || null;
    }
    if (!state.companies.some((company) => company.id === state.companyId)) {
      state.companyId = state.companies[0]?.id || "";
      if (state.companyId) localStorage.setItem("estoque_company_id", state.companyId);
    }
  } catch (error) {
    console.error(error);
    state.companies = [];
  }
}

function renderCompanySwitcher() {
  els.companySelect.innerHTML = state.companies.length
    ? state.companies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.trade_name)}</option>`).join("")
    : `<option value="">Nenhuma empresa</option>`;
  els.companySelect.value = state.companyId;
}

function currentCompany() {
  return state.companies.find((company) => company.id === state.companyId) || null;
}

function currentOrganizationId() {
  return currentCompany()?.organization_id || state.membership?.organization_id || "";
}

function sessionUserId() {
  return state.session?.user?.id || state.session?.user_id || "";
}

function syncAccessUi() {
  const signedIn = Boolean(state.session?.access_token && state.membership);
  const company = currentCompany();
  const isAvil = company?.slug === "avil-tecidos";

  const label = state.session?.user?.email || "Sair";
  els.accountButton.textContent = signedIn ? label : "Entrar";

  [els.importButton, els.importLabelsButton, els.importPricesButton, els.newPriceButton, els.newUpdateBtn].forEach((button) => {
    button.disabled = !signedIn;
    button.title = signedIn ? "" : "Entre para alterar dados";
  });

  // Botão Drive: esconde para AVIL (ela não tem pasta no Drive)
  els.importButton.hidden = isAvil;
  els.importLabelsButton.hidden = isAvil;

  // Botão AVIL: aparece só para empresa AVIL, requer login
  els.importAvilButton.hidden = !isAvil;
  els.importAvilButton.disabled = !signedIn;
  els.importAvilButton.title = signedIn ? "" : "Entre para enviar estoque";
  els.importAvilCatalogButton.hidden = !isAvil;
  els.importAvilCatalogButton.disabled = !signedIn;
  els.importAvilCatalogButton.title = signedIn ? "" : "Entre para enviar catálogo";

  els.newRegistryButton.disabled = !signedIn;
  els.registrySummary.textContent = signedIn
    ? "Cadastros do escritório e da empresa ativa"
    : "Entre para criar ou alterar cadastros";
}

function requireSession() {
  if (state.session?.access_token && state.membership) return true;
  openAuthModal();
  return false;
}

function openAuthModal() {
  els.authMessage.textContent = "";
  els.authPassword.value = "";
  els.authModal.hidden = false;
  els.authEmail.focus();
}

function closeAuthModal() {
  els.authModal.hidden = true;
}

async function authRequest(path, body) {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: CONFIG.supabaseAnonKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.msg || payload.message || payload.error_description || "Não foi possível concluir o acesso.");
  return payload;
}

async function signIn() {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !password) {
    els.authMessage.textContent = "Informe o e-mail e a senha.";
    return;
  }
  els.loginButton.disabled = true;
  els.authMessage.textContent = "Entrando...";
  try {
    const session = await authRequest("token?grant_type=password", { email, password });
    persistSession(session);
    await loadCompanies();
    renderCompanySwitcher();
    syncAccessUi();
    closeAuthModal();
    await refreshAll();
  } catch (error) {
    els.authMessage.textContent = readableError(error);
  } finally {
    els.loginButton.disabled = false;
  }
}

async function signUp() {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || password.length < 6) {
    els.authMessage.textContent = "Informe um e-mail e uma senha com pelo menos 6 caracteres.";
    return;
  }
  els.signupButton.disabled = true;
  els.authMessage.textContent = "Criando acesso...";
  try {
    const redirectTo = location.protocol.startsWith("http")
      ? `${location.origin}${location.pathname}`
      : CONFIG.publicAppUrl;
    const result = await authRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, { email, password });
    if (result.access_token) {
      persistSession(result);
      await loadCompanies();
      renderCompanySwitcher();
      syncAccessUi();
      closeAuthModal();
      await refreshAll();
    } else {
      els.authMessage.textContent = "Acesso criado. Confirme o e-mail recebido e depois clique em Entrar.";
    }
  } catch (error) {
    els.authMessage.textContent = readableError(error);
  } finally {
    els.signupButton.disabled = false;
  }
}

async function signOut() {
  if (state.session?.access_token) {
    await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: requestHeaders(),
    }).catch(() => {});
  }
  persistSession(null);
  state.membership = null;
  await loadCompanies();
  renderCompanySwitcher();
  syncAccessUi();
  switchTab("busca");
  await refreshAll();
}

// ---------------------------------------------------------------------------
// Dados de estoque (busca)
// ---------------------------------------------------------------------------

async function refreshAll() {
  if (!state.companyId) {
    els.status.textContent = "Cadastre ou selecione uma empresa";
    return;
  }
  const refreshSeq = ++state.refreshSeq;
  els.status.textContent = "Carregando dados...";
  state.prices = [];
  state.labels = [];
  setCatalogAssets([]);
  const [health, stock] = await Promise.all([loadHealth(), loadStock()]);
  if (refreshSeq !== state.refreshSeq) return;
  state.health = health;
  state.rows = stock;
  renderHealth();
  renderFilters();
  renderResults();
  const lastImport = health.map((h) => h.imported_at).filter(Boolean).sort().at(-1);
  els.status.textContent = lastImport ? `Atualizado em ${formatDate(lastImport)}` : "Sem importação concluída";

  Promise.all([loadPrices(), loadLabels(), loadCatalogAssets()])
    .then(([prices, labels, catalogAssets]) => {
      if (refreshSeq !== state.refreshSeq) return;
      state.prices = prices;
      state.labels = labels;
      setCatalogAssets(catalogAssets);
      renderResults();
      renderPrices();
      if (window.lucide) window.lucide.createIcons();
    })
    .catch((error) => {
      console.error(error);
    });
}

async function loadHealth() {
  try {
    return await supabaseSelect("v_source_health", `select=*&company_id=eq.${encodeURIComponent(state.companyId)}`);
  } catch (error) {
    els.status.textContent = "Erro ao carregar saúde dos estoques";
    console.error(error);
    return [];
  }
}

async function loadStock() {
  try {
    return await supabaseSelectAll("v_stock_search", `select=*&company_id=eq.${encodeURIComponent(state.companyId)}&order=product_name.asc`);
  } catch (error) {
    els.status.textContent = "Erro ao carregar busca";
    console.error(error);
    return [];
  }
}

async function loadPrices() {
  try {
    return await supabaseSelectAll("price_items", `select=*&company_id=eq.${encodeURIComponent(state.companyId)}&order=display_name.asc,updated_at.desc`);
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function loadLabels() {
  try {
    return await supabaseSelectAll("product_labels", `select=*&company_id=eq.${encodeURIComponent(state.companyId)}&order=display_name.asc`);
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function loadCatalogAssets() {
  try {
    return await supabaseSelectAll(
      "product_catalog_assets",
      `select=id,company_id,normalized_name,display_name,normalized_color,color_label,color_code,image_path,catalog_file_name,catalog_page&company_id=eq.${encodeURIComponent(state.companyId)}&order=display_name.asc,color_label.asc`,
    );
  } catch (error) {
    console.error(error);
    return [];
  }
}

function setCatalogAssets(assets) {
  state.catalogAssets = (assets || []).map((asset) => ({
    ...asset,
    normalizedProductForMatch: normalize(asset.display_name || asset.normalized_name || ""),
    normalizedColorForMatch: normalize(asset.color_label || asset.normalized_color || ""),
  }));
  state.catalogAssetsById = new Map(state.catalogAssets.map((asset) => [String(asset.id), asset]));
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

async function runImport() {
  if (!requireSession()) return;
  if (CONFIG.importFunctionUrl.startsWith("COLE_AQUI")) {
    alert("Configure importFunctionUrl em web/app.js antes de importar.");
    return;
  }

  els.importButton.disabled = true;
  els.importButton.textContent = "Importando...";
  els.status.textContent = "Importando arquivos do Drive...";

  try {
    const headers = requestHeaders({ write: true });

    const sources = state.health.length ? state.health : [{ slug: "todos", label: "Todos os estoques" }];
    const failures = [];

    for (const source of sources) {
      els.status.textContent = `Importando ${source.label}...`;
      const res = await fetch(CONFIG.importFunctionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ source_slug: source.slug, company_id: state.companyId }),
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
  if (!requireSession()) return;
  if (CONFIG.importFunctionUrl.startsWith("COLE_AQUI")) {
    alert("Configure importFunctionUrl em web/app.js antes de importar.");
    return;
  }

  els.importPricesButton.disabled = true;
  els.importPricesButton.textContent = "Importando...";
  els.status.textContent = "Importando tabela de preços...";

  try {
    const headers = requestHeaders({ write: true });

    const res = await fetch(CONFIG.importFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "import_prices", company_id: state.companyId }),
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
  if (!requireSession()) return;
  if (CONFIG.importFunctionUrl.startsWith("COLE_AQUI")) {
    alert("Configure importFunctionUrl em web/app.js antes de importar.");
    return;
  }

  els.importLabelsButton.disabled = true;
  els.importLabelsButton.textContent = "Importando...";
  els.status.textContent = "Importando etiquetas...";

  try {
    const headers = requestHeaders({ write: true });

    const res = await fetch(CONFIG.importFunctionUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "import_labels", company_id: state.companyId }),
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

async function extractPdfTextBrowser(file) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error("pdfjs não carregado");
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageTexts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupa itens pelo Y arredondado para reconstruir linhas
    const lineMap = new Map();
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str });
    }

    // Ordena por Y decrescente (PDF conta de baixo pra cima), X crescente dentro de cada linha
    const lines = [...lineMap.keys()]
      .sort((a, b) => b - a)
      .map((y) =>
        lineMap.get(y)
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str)
          .join(" ")
          .trim()
      )
      .filter(Boolean);

    pageTexts.push(lines.join("\n"));
  }

  return pageTexts.join("\n");
}

async function checkShareTarget() {
  const params = new URLSearchParams(location.search);
  if (!params.has("avil-import")) return;
  history.replaceState(null, "", location.pathname);

  try {
    const cache = await caches.open("avil-pending-v1");
    const cached = await cache.match("/pending-avil-file");
    if (!cached) return;

    const fileName = cached.headers.get("X-File-Name") || "avil.pdf";
    const bytes = await cached.arrayBuffer();
    await cache.delete("/pending-avil-file");

    const file = new File([bytes], fileName, { type: "application/pdf" });

    // Muda para empresa AVIL automaticamente se disponível
    const avilCompany = state.companies.find((c) => c.slug === "avil-tecidos");
    if (avilCompany && state.companyId !== String(avilCompany.id)) {
      state.companyId = String(avilCompany.id);
      els.companySelect.value = state.companyId;
      localStorage.setItem("estoque_company_id", state.companyId);
      syncAccessUi();
    }

    if (!state.session?.access_token || !state.membership) {
      els.status.textContent = `PDF "${fileName}" recebido — Entre para importar o estoque AVIL.`;
      return;
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    els.avilFileInput.files = dt.files;
    await runAvilImport();
  } catch (err) {
    els.status.textContent = "Erro ao receber arquivo compartilhado.";
    console.error("[share-target]", err);
  }
}

async function runAvilImport() {
  if (!requireSession()) return;
  const file = els.avilFileInput.files?.[0];
  if (!file) return;

  // Detecta a fonte pela slug baseado no nome do arquivo
  const nameLower = file.name.toLowerCase();
  const sourceSlug = nameLower.includes("malhas") ? "avil-malhas-estoque" : "avil-tecidos-estoque";
  const sourceLabel = nameLower.includes("malhas") ? "AVIL Malhas" : "AVIL Tecidos";

  els.importAvilButton.disabled = true;
  els.importAvilButton.textContent = "Lendo PDF...";
  els.status.textContent = `Lendo ${sourceLabel}...`;

  try {
    const pdfText = await extractPdfTextBrowser(file);

    els.importAvilButton.textContent = "Enviando...";
    els.status.textContent = `Importando ${sourceLabel}...`;

    const authHeaders = requestHeaders();
    const form = new FormData();
    form.append("action", "import_avil");
    form.append("company_id", state.companyId);
    form.append("source_slug", sourceSlug);
    form.append("file", file);
    form.append("pdf_text", pdfText);

    const res = await fetch(CONFIG.importFunctionUrl, {
      method: "POST",
      headers: { authorization: authHeaders.authorization || "" },
      body: form,
    });
    const payload = await res.json();

    if (!res.ok || payload.ok === false) {
      throw new Error(readableError(payload.error || payload || "Importação AVIL falhou"));
    }

    const result = payload.summary?.[0] || {};
    const itemCount = result.items ?? result.colors ?? 0;
    const skipped = result.skipped ?? 0;
    els.status.textContent = `${sourceLabel} importado: ${itemCount} itens, ${skipped} linhas ignoradas`;

    await refreshAll();
  } catch (error) {
    els.status.textContent = readableError(error);
  } finally {
    els.importAvilButton.disabled = false;
    els.importAvilButton.textContent = "Enviar PDF AVIL";
    els.avilFileInput.value = "";
  }
}

async function runAvilCatalogImport() {
  const files = [...(els.avilCatalogFileInput.files || [])];
  if (!files.length) return;
  if (!requireSession()) {
    els.avilCatalogFileInput.value = "";
    return;
  }

  els.importAvilCatalogButton.disabled = true;
  const originalText = els.importAvilCatalogButton.textContent;
  try {
    const summaries = [];
    for (const file of files) {
      els.importAvilCatalogButton.textContent = `Lendo ${file.name.slice(0, 18)}...`;
      const payload = await extractAvilCatalogPayload(file);
      payload.organization_id = currentOrganizationId();
      payload.company_id = state.companyId;
      els.importAvilCatalogButton.textContent = `Enviando ${payload.product_name.slice(0, 18)}...`;
      const res = await fetch(CONFIG.importCatalogFunctionUrl, {
        method: "POST",
        headers: requestHeaders({ write: true }),
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.ok === false) throw new Error(readableError(result.error || result || "Importação do catálogo falhou"));
      summaries.push(`${result.product || payload.product_name}: ${result.colors || payload.colors.length} cor(es)`);
    }
    els.status.textContent = `Catálogo AVIL importado: ${summaries.join(" | ")}`;
    state.labels = await loadLabels();
    setCatalogAssets(await loadCatalogAssets());
    renderResults();
  } catch (error) {
    els.status.textContent = readableError(error);
  } finally {
    els.importAvilCatalogButton.disabled = false;
    els.importAvilCatalogButton.textContent = originalText || "Enviar Catálogo AVIL";
    els.avilCatalogFileInput.value = "";
  }
}

async function extractAvilCatalogPayload(file) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error("pdfjs não carregado");
  const bytes = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: bytes }).promise;
  if (pdf.numPages < 3) throw new Error("Catálogo sem páginas de cores.");

  const specsText = await extractPdfPageText(pdf, 2);
  const { productName, specs } = parseAvilCatalogSpecs(specsText, file.name);
  const colors = [];
  for (let pageNo = 3; pageNo <= pdf.numPages; pageNo++) {
    const text = await extractPdfPageText(pdf, pageNo);
    const caption = parseAvilCatalogColor(text);
    if (!caption?.label) continue;
    const imageData = await renderPdfPageImage(pdf, pageNo);
    colors.push({ ...caption, page: pageNo, image_data_url: imageData });
  }
  if (!productName) throw new Error("Não consegui identificar o produto do catálogo.");
  if (!colors.length) throw new Error("Não consegui identificar cores no catálogo.");
  return {
    file_name: file.name,
    product_name: productName,
    specs,
    colors,
  };
}

async function extractPdfPageText(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  const content = await page.getTextContent();
  return content.items.map((item) => item.str || "").join("\n").trim();
}

async function renderPdfPageImage(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.78);
}

function parseAvilCatalogSpecs(text, fileName) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const productName = cleanCatalogProductName(lines[0] || fileName.replace(/\.pdf$/i, ""));
  const joined = lines.join("\n");
  const specs = {
    cont: catalogMatch(joined, /Cont\s*[-–]\s*([^\n]+)/i),
    codigo: catalogMatch(joined, /C[oó]digo\s*[-–]\s*([^\n]+)/i) || catalogMatch(fileName, /COD\s*[-,]?\s*(\d+)/i),
    largura: catalogMatch(joined, /Largura\s*[-–]\s*([^\n]+)/i),
    composicao: catalogMatch(joined, /Comp\.?\s*[-–]\s*([^\n]+)/i),
    gm2: catalogMatch(joined, /G\/M[²2]\s*[-–]\s*([^\n]+)/i),
    gml: catalogMatch(joined, /G\/ML\s*[-–]\s*([^\n]+)/i),
    rendimento: catalogMatch(joined, /Rend\.?\s*[-–]\s*([^\n]+)/i),
  };
  return { productName, specs };
}

function parseAvilCatalogColor(text) {
  const line = String(text || "").split(/\n+/).map((item) => item.trim()).filter(Boolean).at(-1) || "";
  const match = line.match(/^(\d+)\s*[-–]\s*(.+)$/);
  if (match) return { code: match[1], label: match[2].trim() };
  return line ? { label: line } : null;
}

function cleanCatalogProductName(value) {
  return String(value || "")
    .replace(/\.pdf$/i, "")
    .replace(/,\s*COD.*$/i, "")
    .replace(/\s*-\s*UNIFICADO\s*$/i, " LISO")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogMatch(text, pattern) {
  return String(text || "").match(pattern)?.[1]?.replace(/^•\s*/, "").trim() || "";
}

// ---------------------------------------------------------------------------
// Supabase: leitura
// ---------------------------------------------------------------------------

async function supabaseSelect(resource, query, range = null) {
  const headers = requestHeaders();
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
    headers: requestHeaders({ write: true, prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Escrita no Supabase falhou");
  return payload;
}

async function supabaseDelete(resource, query) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}?${query}`, {
    method: "DELETE",
    headers: requestHeaders({ write: true }),
  });
  if (!res.ok) {
    const payload = await res.json();
    throw new Error(payload.message || "Exclusão no Supabase falhou");
  }
}

async function supabaseUpdate(resource, query, body) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}?${query}`, {
    method: "PATCH",
    headers: requestHeaders({ write: true, prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Atualização no Supabase falhou");
  return payload;
}

async function supabaseUpsert(resource, conflict, body) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${resource}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: requestHeaders({ write: true, prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Gravação no Supabase falhou");
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
  const hasAvil = hasAvilRows();
  if (!hasAvil) state.avilFinish = "todos";

  els.filters.innerHTML = `
    <div class="filter-group">
      ${labels.map((item) => (
        `<button class="filter ${state.source === item.slug ? "active" : ""}" data-source="${item.slug}">${escapeHtml(item.label)}</button>`
      )).join("")}
    </div>
    ${hasAvil ? `
      <div class="filter-group">
        ${AVIL_FINISH_FILTERS.map((item) => (
          `<button class="filter ${state.avilFinish === item.slug ? "active" : ""}" data-avil-finish="${item.slug}">${escapeHtml(item.label)}</button>`
        )).join("")}
      </div>
    ` : ""}
  `;

  els.filters.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.source = button.dataset.source;
      resetResultExpansion();
      renderFilters();
      renderResults();
    });
  });
  els.filters.querySelectorAll("[data-avil-finish]").forEach((button) => {
    button.addEventListener("click", () => {
      state.avilFinish = button.dataset.avilFinish || "todos";
      resetResultExpansion();
      renderFilters();
      renderResults();
    });
  });
}

function filteredStockRows() {
  return state.rows.filter((row) => {
    const bySource = state.source === "todos" || row.source_slug === state.source;
    if (!bySource) return false;
    if (!matchesAvilFinish(row)) return false;

    const q = normalize(state.query);
    if (!q) return true;
    return normalize(row.product_name).includes(q)
      || normalize(row.color_name).includes(q)
      || normalize(row.process_code || "").includes(q);
  });
}

function hasAvilRows() {
  return state.rows.some((row) => AVIL_SOURCE_SLUGS.has(row.source_slug));
}

function matchesAvilFinish(row) {
  if (state.avilFinish === "todos") return true;
  if (!AVIL_SOURCE_SLUGS.has(row.source_slug)) return true;
  return matchesFinish(row, state.avilFinish);
}

function matchesFinish(row, finish) {
  const product = normalize(row.product_name);
  if (finish === "lisa") {
    return /\bLISA\b|\bLISO\b/.test(product);
  }
  if (finish === "estampada") {
    return /\bESTAMPAD[OA]S?\b|\bEST\b/.test(product);
  }
  return true;
}

function isMalhaRow(row) {
  return row.source_slug === "avil-malhas-estoque"
    || row.unit === "kg"
    || /\bMALHAS?\b/.test(normalize(row.source_label))
    || /^M\./.test(normalize(row.product_name));
}

function isTecidoRow(row) {
  return row.source_slug === "avil-tecidos-estoque"
    || (!isMalhaRow(row) && (row.unit === "m" || /\bTECIDOS?\b/.test(normalize(row.source_label)) || /^T\./.test(normalize(row.product_name))));
}

function renderResults() {
  const filtered = filteredStockRows();

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
  if (window.lucide) window.lucide.createIcons();
}

// ---------------------------------------------------------------------------
// Relatório PDF de estoque
// ---------------------------------------------------------------------------

function openStockReportModal() {
  if (!state.rows.length) {
    alert("Não há estoque carregado para gerar relatório.");
    return;
  }
  state.report.scope = "visible";
  state.report.query = "";
  state.report.selected = new Set();
  els.stockReportScope.value = state.report.scope;
  els.stockReportSearch.value = "";
  els.stockReportModal.hidden = false;
  renderStockReportList();
}

function closeStockReportModal() {
  els.stockReportModal.hidden = true;
}

function reportCandidateRows() {
  let rows;
  switch (state.report.scope) {
    case "visible":
      rows = filteredStockRows();
      break;
    case "tecidos":
      rows = state.rows.filter((row) => isTecidoRow(row));
      break;
    case "malhas":
      rows = state.rows.filter((row) => isMalhaRow(row));
      break;
    case "lisa":
      rows = state.rows.filter((row) => matchesFinish(row, "lisa"));
      break;
    case "estampada":
      rows = state.rows.filter((row) => matchesFinish(row, "estampada"));
      break;
    default:
      rows = [...state.rows];
      break;
  }

  const q = normalize(state.report.query);
  if (!q) return rows;
  return rows.filter((row) => normalize(row.product_name).includes(q)
    || normalize(row.color_name).includes(q)
    || normalize(row.process_code || "").includes(q)
    || normalize(row.source_label).includes(q));
}

function renderStockReportList() {
  const rows = reportCandidateRows();
  const shown = rows.slice(0, 500);
  els.stockReportSummary.textContent = rows.length > shown.length
    ? `${rows.length} item(ns) filtrado(s), mostrando ${shown.length}`
    : `${rows.length} item(ns) filtrado(s)`;

  if (!rows.length) {
    els.stockReportList.innerHTML = `<div class="empty"><strong>Nenhum item neste filtro.</strong></div>`;
  } else {
    els.stockReportList.innerHTML = shown.map((row) => {
      const key = stockRowKey(row);
      const checked = state.report.selected.has(key) ? "checked" : "";
      return `
        <label class="selector-item ${checked ? "selected" : ""}">
          <input type="checkbox" data-report-key="${escapeAttr(key)}" ${checked}>
          <span class="selector-item-info">
            <span class="selector-product-name">${escapeHtml(row.product_name)}</span>
            <span class="selector-meta">${escapeHtml(reportRowMeta(row))}</span>
          </span>
        </label>
      `;
    }).join("");

    els.stockReportList.querySelectorAll("[data-report-key]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.report.selected.add(input.dataset.reportKey);
        else state.report.selected.delete(input.dataset.reportKey);
        renderStockReportList();
      });
    });
  }

  const selectedCount = state.report.selected.size;
  els.stockReportCount.textContent = `${selectedCount} item(ns) selecionado(s)`;
  els.generateStockReportButton.disabled = selectedCount === 0;
}

function selectVisibleReportRows() {
  state.report.selected = new Set(reportCandidateRows().map(stockRowKey));
  renderStockReportList();
}

function reportRowMeta(row) {
  return [
    row.source_label,
    row.color_name && `Cor ${row.color_name}`,
    row.process_code && `Proc. ${row.process_code}`,
    formatQuantity(row.quantity_meters, row.unit || unitForProduct(row.product_name)),
  ].filter(Boolean).join(" · ");
}

async function generateStockReportPdf() {
  const selected = selectedReportRows();
  if (!selected.length) {
    alert("Selecione pelo menos um item.");
    return;
  }
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    alert("Gerador de PDF ainda não carregou. Tente novamente em alguns segundos.");
    return;
  }

  els.generateStockReportButton.disabled = true;
  els.generateStockReportButton.textContent = "Gerando...";
  try {
    const doc = new jsPdf({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const isAvilReport = currentCompany()?.slug === "avil-tecidos";
    const titleY = isAvilReport ? 46 : 18;
    if (isAvilReport) {
      const logo = await loadImageDataUrl("./assets/avil-logo.jpg");
      if (logo) doc.addImage(logo, "JPEG", (pageWidth - 42) / 2, 10, 42, 28);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Relatorio de estoque", pageWidth / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${currentCompany()?.trade_name || "Empresa"} · ${new Date().toLocaleString("pt-BR")}`, pageWidth / 2, titleY + 6, { align: "center" });
    doc.text(`Filtro: ${reportScopeLabel()} · ${selected.length} item(ns)`, pageWidth / 2, titleY + 11, { align: "center" });

    const rows = selected
      .sort(compareStockRows)
      .map((row) => [
        row.product_name || "",
        row.source_label || "",
        row.color_name || "",
        row.process_code || "",
        formatQuantity(row.quantity_meters, row.unit || unitForProduct(row.product_name)),
      ]);

    doc.autoTable({
      startY: titleY + 18,
      head: [["Produto", "Fonte", "Cor", "Processo", "Quantidade"]],
      body: rows,
      styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [0, 72, 124], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 243] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 25, halign: "right" },
      },
      margin: { left: 10, right: 10 },
      didDrawPage: () => {
        const page = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Pagina ${page}`, pageWidth - 12, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });

    doc.save(`estoque-${slugify(currentCompany()?.trade_name || "empresa")}-${new Date().toISOString().slice(0, 10)}.pdf`);
    closeStockReportModal();
  } catch (error) {
    alert("Não foi possível gerar o PDF: " + readableError(error));
  } finally {
    els.generateStockReportButton.disabled = state.report.selected.size === 0;
    els.generateStockReportButton.textContent = "Gerar PDF";
  }
}

function selectedReportRows() {
  const selected = state.report.selected;
  return state.rows.filter((row) => selected.has(stockRowKey(row)));
}

function reportScopeLabel() {
  return els.stockReportScope.selectedOptions[0]?.textContent || "Itens selecionados";
}

async function loadImageDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Logo do relatorio nao carregou", error);
    return "";
  }
}

function stockRowKey(row) {
  return [
    row.product_id || row.product_name,
    row.source_slug || row.source_id,
    row.normalized_color || normalize(row.color_name),
    row.process_code || "",
  ].join("|||");
}

function compareStockRows(a, b) {
  return String(a.product_name || "").localeCompare(String(b.product_name || ""), "pt-BR")
    || String(a.source_label || "").localeCompare(String(b.source_label || ""), "pt-BR")
    || String(a.color_name || "").localeCompare(String(b.color_name || ""), "pt-BR");
}

// ---------------------------------------------------------------------------
// Comparação de estoque importado
// ---------------------------------------------------------------------------

function openStockCompareModal() {
  populateStockCompareSourceOptions();
  state.compare.source = "visible";
  state.compare.finish = state.avilFinish || "todos";
  state.compare.query = state.query || "";
  state.compare.kinds = new Set(["esgotou", "voltou", "diminuiu", "aumentou", "novo"]);
  els.stockCompareSource.value = state.compare.source;
  els.stockCompareFinish.value = state.compare.finish;
  els.stockCompareSearch.value = state.compare.query;
  document.querySelectorAll("[name='stock-compare-kind']").forEach((input) => {
    input.checked = true;
  });
  els.stockCompareModal.hidden = false;
}

function closeStockCompareModal() {
  els.stockCompareModal.hidden = true;
}

function populateStockCompareSourceOptions() {
  const fixed = [
    ["visible", "Filtro atual da busca"],
    ["all", "Todos"],
    ["tecidos", "Todos tecidos"],
    ["malhas", "Todas malhas"],
  ];
  const sourceOptions = state.health.map((source) => [source.slug, source.label]);
  els.stockCompareSource.innerHTML = fixed.concat(sourceOptions).map(([value, label]) => (
    `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`
  )).join("");
}

async function runStockComparisonReport() {
  if (!state.companyId) return;
  const filters = readStockCompareFilters();
  closeStockCompareModal();
  showStockComparisonPage();
  els.stockCompareTitle.textContent = "Relatório de comparação";
  els.stockCompareSubtitle.textContent = comparisonFilterSummary(filters);
  els.stockCompareResults.innerHTML = "<p class=\"showroom-loading\">Comparando último estoque com histórico...</p>";
  els.generateStockComparePdfButton.disabled = true;

  try {
    const comparison = await buildStockComparison(filters);
    state.compare.result = comparison;
    renderStockComparison(comparison);
  } catch (error) {
    state.compare.result = null;
    els.stockCompareResults.innerHTML = `<div class="empty"><strong>Erro ao comparar estoque</strong><p>${escapeHtml(readableError(error))}</p></div>`;
  }
}

function readStockCompareFilters() {
  const kinds = new Set([...document.querySelectorAll("[name='stock-compare-kind']:checked")].map((input) => input.value));
  return {
    source: els.stockCompareSource.value || "visible",
    finish: els.stockCompareFinish.value || "todos",
    query: els.stockCompareSearch.value.trim(),
    kinds: kinds.size ? kinds : new Set(["esgotou", "voltou", "diminuiu", "aumentou", "novo"]),
  };
}

function showStockComparisonPage() {
  els.mainTabs.hidden = true;
  els.tabBusca.hidden = true;
  els.tabMostruario.hidden = true;
  els.tabPrecos.hidden = true;
  els.tabCadastros.hidden = true;
  els.stockComparePage.hidden = false;
  els.stockComparePage.scrollIntoView({ behavior: "smooth" });
}

function closeStockComparisonPage() {
  if (!els.stockComparePage || els.stockComparePage.hidden) return;
  els.stockComparePage.hidden = true;
  els.mainTabs.hidden = false;
  const active = document.querySelector(".tab.active")?.dataset.tab || "busca";
  els.tabBusca.hidden = active !== "busca";
  els.tabMostruario.hidden = active !== "mostruario";
  els.tabPrecos.hidden = active !== "precos";
  els.tabCadastros.hidden = active !== "cadastros";
}

async function buildStockComparison(filters = defaultStockCompareFilters()) {
  const activeSources = comparisonSourceSlugs(filters);
  if (!activeSources.length) {
    return { status: "empty", groups: [], sourcePairs: [] };
  }

  const sources = await supabaseSelectAll(
    "stock_sources",
    `select=id,slug,label&company_id=eq.${encodeURIComponent(state.companyId)}`
  );
  const sourceBySlug = new Map(sources.map((source) => [source.slug, source]));
  const selectedSources = activeSources.map((slug) => sourceBySlug.get(slug)).filter(Boolean);
  if (!selectedSources.length) {
    return { status: "empty", groups: [], sourcePairs: [] };
  }

  const files = await supabaseSelectAll(
    "stock_files",
    `select=id,source_id,file_name,imported_at,product_count,color_count,status&company_id=eq.${encodeURIComponent(state.companyId)}&status=eq.imported&source_id=in.(${selectedSources.map((s) => s.id).join(",")})&order=imported_at.desc`
  );

  const sourcePairs = selectedSources.map((source) => {
    const sourceFiles = files
      .filter((file) => file.source_id === source.id)
      .sort((a, b) => String(b.imported_at || "").localeCompare(String(a.imported_at || "")));
    return { source, current: sourceFiles[0] || null, previous: sourceFiles[1] || null, files: sourceFiles };
  });

  const comparable = sourcePairs.filter((pair) => pair.current && pair.previous);
  if (!comparable.length) {
    return { status: "no_previous", groups: [], sourcePairs };
  }

  const fileIds = [...new Set(comparable.flatMap((pair) => pair.files.map((file) => file.id)))];
  const items = await supabaseSelectAll(
    "stock_items",
    `select=file_id,source_id,product_id,color_name,normalized_color,process_code,quantity_meters,products(display_name,normalized_name,unit)&company_id=eq.${encodeURIComponent(state.companyId)}&file_id=in.(${fileIds.join(",")})`
  );

  const itemsByFile = new Map();
  for (const item of items) {
    if (!itemsByFile.has(item.file_id)) itemsByFile.set(item.file_id, []);
    itemsByFile.get(item.file_id).push(item);
  }

  const buckets = {
    esgotou: [],
    voltou: [],
    diminuiu: [],
    aumentou: [],
    novo: [],
  };

  for (const pair of comparable) {
    const currentRows = filterComparisonItems(itemsByFile.get(pair.current.id) || [], filters);
    const previousRows = filterComparisonItems(itemsByFile.get(pair.previous.id) || [], filters);
    const olderRows = filterComparisonItems(pair.files.slice(1).flatMap((file) => itemsByFile.get(file.id) || []), filters);
    const currentMap = new Map(currentRows.map((item) => [stockItemHistoryKey(item), item]));
    const previousMap = new Map(previousRows.map((item) => [stockItemHistoryKey(item), item]));
    const olderKeys = new Set(olderRows.map(stockItemHistoryKey));
    const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);

    for (const key of keys) {
      const current = currentMap.get(key) || null;
      const previous = previousMap.get(key) || null;
      const currentQty = current ? Number(current.quantity_meters || 0) : 0;
      const previousQty = previous ? Number(previous.quantity_meters || 0) : 0;
      const item = current || previous;
      const row = comparisonRow(item, pair.source, previousQty, currentQty);

      if (!matchesComparisonSearch(row, filters.query)) continue;
      if (previousQty > 0 && currentQty <= 0) buckets.esgotou.push(row);
      else if (previousQty <= 0 && currentQty > 0 && olderKeys.has(key)) buckets.voltou.push(row);
      else if (previousQty <= 0 && currentQty > 0) buckets.novo.push(row);
      else if (currentQty > previousQty) buckets.aumentou.push(row);
      else if (currentQty < previousQty) buckets.diminuiu.push(row);
    }
  }

  Object.keys(buckets).forEach((key) => {
    if (!filters.kinds.has(key)) buckets[key] = [];
  });
  Object.values(buckets).forEach((rows) => rows.sort(compareComparisonRows));
  return { status: "ok", groups: buckets, sourcePairs, filters };
}

function defaultStockCompareFilters() {
  return {
    source: "visible",
    finish: state.avilFinish || "todos",
    query: state.query || "",
    kinds: new Set(["esgotou", "voltou", "diminuiu", "aumentou", "novo"]),
  };
}

function comparisonSourceSlugs(filters) {
  if (filters.source === "visible") {
    return state.source !== "todos"
      ? [state.source]
      : state.health.map((source) => source.slug).filter(Boolean);
  }
  if (filters.source === "all") return state.health.map((source) => source.slug).filter(Boolean);
  if (filters.source === "malhas") return state.health.filter(isMalhaSource).map((source) => source.slug);
  if (filters.source === "tecidos") return state.health.filter(isTecidoSource).map((source) => source.slug);
  return [filters.source].filter(Boolean);
}

function isMalhaSource(source) {
  return source.slug === "avil-malhas-estoque" || /\bMALHAS?\b/.test(normalize(source.label));
}

function isTecidoSource(source) {
  return source.slug === "avil-tecidos-estoque" || /\bTECIDOS?\b/.test(normalize(source.label));
}

function filterComparisonItems(items, filters) {
  if (filters.finish === "todos") return items;
  return items.filter((item) => matchesFinish({ product_name: productDisplayName(item) }, filters.finish));
}

function matchesComparisonSearch(row, query) {
  const q = normalize(query);
  if (!q) return true;
  return normalize(row.product_name).includes(q)
    || normalize(row.source_label).includes(q)
    || normalize(row.color_name).includes(q)
    || normalize(row.process_code).includes(q);
}

function stockItemHistoryKey(item) {
  return [
    item.product_id,
    item.source_id,
    item.normalized_color || normalize(item.color_name),
    item.process_code || "",
  ].join("|||");
}

function productDisplayName(item) {
  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  return product?.display_name || product?.normalized_name || item.product_name || "";
}

function productUnit(item) {
  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  return product?.unit || unitForProduct(productDisplayName(item));
}

function comparisonRow(item, source, previousQty, currentQty) {
  return {
    product_name: productDisplayName(item),
    source_label: source.label,
    color_name: item.color_name,
    process_code: item.process_code || "",
    unit: productUnit(item),
    prev_quantity: previousQty,
    curr_quantity: currentQty,
    delta: currentQty - previousQty,
  };
}

function compareComparisonRows(a, b) {
  return compareStockRows(a, b)
    || String(a.process_code || "").localeCompare(String(b.process_code || ""), "pt-BR");
}

function renderStockComparison({ status, groups, sourcePairs }) {
  els.generateStockComparePdfButton.disabled = status !== "ok";

  if (status === "empty") {
    els.stockCompareResults.innerHTML = `<div class="empty"><strong>Nenhuma fonte encontrada para comparar.</strong></div>`;
    return;
  }

  if (status === "no_previous") {
    els.stockCompareResults.innerHTML = `
      <div class="empty">
        <strong>Ainda não existe estoque anterior suficiente.</strong>
        <p>Depois da próxima importação desta empresa, a comparação mostra esgotados, retornos, aumentos, reduções e novidades.</p>
      </div>
    `;
    return;
  }

  const total = Object.values(groups).reduce((sum, rows) => sum + rows.length, 0);
  const comparedSources = sourcePairs
    .filter((pair) => pair.current && pair.previous)
    .map((pair) => `${pair.source.label}: ${formatDate(pair.previous.imported_at)} -> ${formatDate(pair.current.imported_at)}`)
    .join(" | ");

  if (!total) {
    els.stockCompareResults.innerHTML = `
      <p class="diff-notice">${escapeHtml(comparedSources)}</p>
      <div class="empty"><strong>Nenhuma alteração encontrada entre os dois estoques.</strong></div>
    `;
    return;
  }

  els.stockCompareResults.innerHTML = `
    <p class="diff-notice">${escapeHtml(comparedSources)}</p>
    ${renderStockDiffTable(groups.esgotou, "Esgotou", "row-down")}
    ${renderStockDiffTable(groups.voltou, "Voltou para o estoque", "row-up")}
    ${renderStockDiffTable(groups.diminuiu, "Diminuiu", "row-down")}
    ${renderStockDiffTable(groups.aumentou, "Aumentou", "row-up")}
    ${renderStockDiffTable(groups.novo, "Novo", "row-new")}
  `;
}

function renderStockDiffTable(rows, title, rowClass) {
  if (!rows.length) return "";
  return `
    <details class="diff-group" open>
      <summary>${escapeHtml(title)} · ${rows.length}</summary>
      <div class="diff-table-wrap">
        <table class="diff-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Fonte</th>
              <th>Cor</th>
              <th>Processo</th>
              <th>Antes</th>
              <th>Agora</th>
              <th>Dif.</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="${rowClass}">
                <td>${escapeHtml(row.product_name)}</td>
                <td>${escapeHtml(row.source_label)}</td>
                <td>${escapeHtml(row.color_name || "")}</td>
                <td>${escapeHtml(row.process_code || "")}</td>
                <td>${escapeHtml(formatQuantity(row.prev_quantity, row.unit))}</td>
                <td>${escapeHtml(formatQuantity(row.curr_quantity, row.unit))}</td>
                <td class="diff-delta">${escapeHtml(formatSignedQuantity(row.delta, row.unit))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function comparisonFilterSummary(filters) {
  const sourceLabel = compareSourceLabel(filters.source);
  const finishLabel = AVIL_FINISH_FILTERS.find((item) => item.slug === filters.finish)?.label || "Todos";
  const kinds = [...filters.kinds].map(comparisonKindLabel).join(", ");
  return [
    `Fonte: ${sourceLabel}`,
    `Acabamento: ${finishLabel}`,
    filters.query && `Busca: ${filters.query}`,
    `Alterações: ${kinds}`,
  ].filter(Boolean).join(" · ");
}

function compareSourceLabel(source) {
  if (source === "visible") return "Filtro atual da busca";
  if (source === "all") return "Todos";
  if (source === "tecidos") return "Todos tecidos";
  if (source === "malhas") return "Todas malhas";
  return state.health.find((item) => item.slug === source)?.label || source;
}

function comparisonKindLabel(kind) {
  return {
    esgotou: "Esgotou",
    voltou: "Voltou",
    diminuiu: "Diminuiu",
    aumentou: "Aumentou",
    novo: "Novo",
  }[kind] || kind;
}

function comparisonKindClass(kind) {
  return {
    esgotou: "row-down",
    voltou: "row-up",
    diminuiu: "row-down",
    aumentou: "row-up",
    novo: "row-new",
  }[kind] || "";
}

function comparisonGroupsList(groups) {
  return [
    ["esgotou", "Esgotou", groups.esgotou || []],
    ["voltou", "Voltou para o estoque", groups.voltou || []],
    ["diminuiu", "Diminuiu", groups.diminuiu || []],
    ["aumentou", "Aumentou", groups.aumentou || []],
    ["novo", "Novo", groups.novo || []],
  ];
}

async function generateStockComparePdf() {
  const result = state.compare.result;
  if (!result || result.status !== "ok") {
    alert("Gere uma comparação antes de baixar o PDF.");
    return;
  }
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    alert("Gerador de PDF ainda não carregou. Tente novamente em alguns segundos.");
    return;
  }

  els.generateStockComparePdfButton.disabled = true;
  els.generateStockComparePdfButton.textContent = "Gerando...";
  try {
    const doc = new jsPdf({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const isAvilReport = currentCompany()?.slug === "avil-tecidos";
    const titleY = isAvilReport ? 42 : 16;
    if (isAvilReport) {
      const logo = await loadImageDataUrl("./assets/avil-logo.jpg");
      if (logo) doc.addImage(logo, "JPEG", (pageWidth - 38) / 2, 8, 38, 25);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Relatorio de comparacao de estoque", pageWidth / 2, titleY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${currentCompany()?.trade_name || "Empresa"} · ${new Date().toLocaleString("pt-BR")}`, pageWidth / 2, titleY + 6, { align: "center" });
    doc.text(comparisonFilterSummary(result.filters), pageWidth / 2, titleY + 11, { align: "center", maxWidth: pageWidth - 24 });

    let startY = titleY + 18;
    for (const [kind, title, rows] of comparisonGroupsList(result.groups)) {
      if (!rows.length) continue;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${title} · ${rows.length}`, 10, startY);
      doc.autoTable({
        startY: startY + 3,
        head: [["Produto", "Fonte", "Cor", "Processo", "Antes", "Agora", "Dif."]],
        body: rows.map((row) => [
          row.product_name || "",
          row.source_label || "",
          row.color_name || "",
          row.process_code || "",
          formatQuantity(row.prev_quantity, row.unit),
          formatQuantity(row.curr_quantity, row.unit),
          formatSignedQuantity(row.delta, row.unit),
        ]),
        styles: { fontSize: 7, cellPadding: 1.4, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: [0, 72, 124], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 243] },
        columnStyles: {
          0: { cellWidth: 74 },
          1: { cellWidth: 34 },
          2: { cellWidth: 34 },
          3: { cellWidth: 34 },
          4: { cellWidth: 24, halign: "right" },
          5: { cellWidth: 24, halign: "right" },
          6: { cellWidth: 24, halign: "right" },
        },
        margin: { left: 10, right: 10 },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const cls = comparisonKindClass(kind);
          if (cls === "row-up") data.cell.styles.fillColor = [240, 252, 232];
          if (cls === "row-down") data.cell.styles.fillColor = [252, 232, 232];
          if (cls === "row-new") data.cell.styles.fillColor = [232, 240, 252];
        },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, pageWidth - 12, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        },
      });
      startY = doc.lastAutoTable.finalY + 9;
      if (startY > doc.internal.pageSize.getHeight() - 24) {
        doc.addPage();
        startY = 14;
      }
    }

    doc.save(`comparacao-estoque-${slugify(currentCompany()?.trade_name || "empresa")}-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (error) {
    alert("Não foi possível gerar o PDF da comparação: " + readableError(error));
  } finally {
    els.generateStockComparePdfButton.disabled = false;
    els.generateStockComparePdfButton.textContent = "Gerar PDF";
  }
}

function groupByProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    const productName = displayProductNameForRow(row);
    const key = resultKey("produto", productName);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: productName,
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
    const productName = displayProductNameForRow(row);
    const key = resultKey("processo", productName, process);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: productName,
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
  const catalogAssets = catalogAssetsForProduct(product.name);
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
          ${primaryLabel ? renderLabelHeader(primaryLabel, catalogAssets.length) : ""}
        </div>
        <span class="product-arrow" aria-hidden="true">⌄</span>
      </button>
      ${primaryLabel ? renderWashingPanel(primaryLabel, product.key, washingOpen) : ""}
      <div class="color-list" ${expanded ? "" : "hidden"}>
        ${product.items.map((item) => renderColorRow(item)).join("")}
      </div>
    </article>
  `;
}

function renderColorRow(item) {
  const asset = catalogAssetForItem(item);
  return `
    <div class="color-row">
      ${renderCatalogButton(asset)}
      <div>
        <strong>${escapeHtml(displayColorName(item, asset))}</strong>
        <div class="color-meta">${escapeHtml(item.source_label)}${item.process_code ? ` · Processo: ${escapeHtml(item.process_code)}` : ""}</div>
      </div>
      <div class="qty">${formatQuantity(Number(item.quantity_meters || 0), unitForProduct(item.product_name))}</div>
    </div>
  `;
}

function displayProductNameForRow(row) {
  const label = primaryLabelForProduct(labelsForProduct(row.product_name));
  if (label?.display_name) return label.display_name;

  if (AVIL_SOURCE_SLUGS.has(row.source_slug)) {
    const lisoMatch = String(row.product_name || "").match(/^(.+?\bLIS[OA])\b/i);
    if (lisoMatch) return normalizeAvilDisplayName(lisoMatch[1]);
  }

  return row.product_name;
}

function normalizeAvilDisplayName(value) {
  return String(value || "")
    .replace(/^(T|M)\.\s*/i, (_, prefix) => `${prefix.toUpperCase()}. `)
    .replace(/\s+/g, " ")
    .trim();
}

function displayColorName(item, asset = catalogAssetForItem(item)) {
  if (!asset?.color_label) return item.color_name;
  return `${asset.color_label} · ${item.color_name}`;
}

function catalogAssetsForProduct(productName) {
  const normalizedName = normalize(productName);
  return state.catalogAssets.filter((asset) => {
    const assetName = asset.normalizedProductForMatch || normalize(asset.display_name || asset.normalized_name || "");
    return assetName === normalizedName || normalizedName.includes(assetName) || assetName.includes(normalizedName);
  });
}

function catalogAssetForItem(item) {
  const productAssets = catalogAssetsForProduct(item.product_name);
  if (!productAssets.length) return null;
  const color = normalize(item.color_name);
  const stockColorCode = catalogColorCodeFromStock(item.color_name);
  return productAssets.find((asset) => (asset.normalizedColorForMatch || normalize(asset.color_label)) === color)
    || productAssets.find((asset) => stockColorCode && catalogColorCodesEqual(asset.color_code, stockColorCode))
    || productAssets.find((asset) => color.includes(asset.normalizedColorForMatch || normalize(asset.color_label)) || (asset.normalizedColorForMatch || normalize(asset.color_label)).includes(color))
    || null;
}

function catalogColorCodeFromStock(colorName) {
  const match = String(colorName || "").match(/-(\d+)$/);
  return match ? String(Number(match[1])) : "";
}

function catalogColorCodesEqual(a, b) {
  if (!a || !b) return false;
  return String(Number(a)) === String(Number(b));
}

function renderCatalogButton(asset) {
  if (!asset) return `<span class="catalog-thumb catalog-thumb-empty" aria-hidden="true"></span>`;
  return `
    <button class="catalog-image-button" type="button" data-catalog-id="${escapeAttr(asset.id)}" title="Ver imagem da cor ${escapeAttr(asset.color_label)}" aria-label="Ver imagem da cor ${escapeAttr(asset.color_label)}">
      <i data-lucide="image" aria-hidden="true"></i>
    </button>
  `;
}

function openCatalogImageModal(assetId) {
  const asset = state.catalogAssetsById.get(String(assetId || ""));
  if (!asset) return;
  const url = catalogImageUrl(asset.image_path);
  els.catalogImageTitle.textContent = asset.color_label || "Imagem da cor";
  els.catalogImagePreview.src = url;
  els.catalogImagePreview.alt = asset.color_label || "Imagem da cor";
  els.catalogImageMeta.textContent = [
    asset.display_name,
    asset.color_code ? `Cor ${asset.color_code}` : "",
    asset.catalog_file_name,
  ].filter(Boolean).join(" · ");
  els.catalogImageModal.hidden = false;
}

function closeCatalogImageModal() {
  els.catalogImageModal.hidden = true;
  els.catalogImagePreview.removeAttribute("src");
  els.catalogImagePreview.alt = "";
}

function catalogImageUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (String(path || "").startsWith("assets/") || String(path || "").startsWith("./assets/")) {
    return String(path).replace(/^\.\//, "./");
  }
  return `${CONFIG.supabaseUrl}/storage/v1/object/public/product-catalog-images/${encodeURI(path).replace(/%2F/g, "/")}`;
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

function renderLabelHeader(label, assetCount = 0) {
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
      ${assetCount ? `<div class="label-composition">${assetCount} imagem(ns) de cor cadastrada(s)</div>` : ""}
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
  const filtered = filteredStockRows();
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
  if (!requireSession()) return;
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
      `company_id=eq.${encodeURIComponent(state.companyId)}&source_type=eq.manual&normalized_name=eq.${encodeURIComponent(normalized)}&currency=eq.${encodeURIComponent(currency)}`
    );

    const values = Object.values(commissions);
    await supabaseInsert("price_items", {
      organization_id: currentOrganizationId(),
      company_id: state.companyId,
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

function formatSignedQuantity(value, unit) {
  const qty = Math.round(Number(value || 0));
  return `${qty > 0 ? "+" : ""}${qty} ${unit}`;
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
      `select=id,updated_at,note&company_id=eq.${encodeURIComponent(state.companyId)}&order=updated_at.desc`
    );
    const itemRows = await supabaseSelectAll(
      "showroom_update_items",
      `select=update_id,product_name&company_id=eq.${encodeURIComponent(state.companyId)}`
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
    `update_id=lt.${updateId}&company_id=eq.${encodeURIComponent(state.companyId)}&select=*&order=update_id.desc,id.desc`
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
  if (!requireSession()) return;
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
    const [update] = await supabaseInsert("showroom_updates", {
      organization_id: currentOrganizationId(),
      company_id: state.companyId,
      note: null,
    });

    // Insere os itens em lotes de 500
    for (let i = 0; i < items.length; i += 500) {
      const batch = items.slice(i, i + 500).map((item) => ({
        ...item,
        organization_id: currentOrganizationId(),
        company_id: state.companyId,
        update_id: update.id,
      }));
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
// Cadastros administrativos
// ---------------------------------------------------------------------------

async function loadRegistry() {
  const type = state.registry.type;
  const config = REGISTRY_CONFIG[type];
  els.registryHeading.textContent = config.title;
  els.registryResults.innerHTML = `<p class="showroom-loading">Carregando...</p>`;

  try {
    if (type === "companies") {
      state.registry.rows = state.session && currentOrganizationId()
        ? await supabaseSelectAll("companies", `select=*&organization_id=eq.${encodeURIComponent(currentOrganizationId())}&order=${config.order}`)
        : state.companies;
    } else if (type === "products") {
      state.registry.rows = await supabaseSelectAll(
        "products",
        `select=*&company_id=eq.${encodeURIComponent(state.companyId)}&order=${config.order}`
      );
    } else if (state.session && currentOrganizationId()) {
      state.registry.rows = await supabaseSelectAll(
        type,
        `select=*&organization_id=eq.${encodeURIComponent(currentOrganizationId())}&order=${config.order}`
      );
    } else {
      state.registry.rows = [];
    }
    renderRegistry();
  } catch (error) {
    els.registryResults.innerHTML = `<div class="empty"><strong>Não foi possível carregar</strong><p>${escapeHtml(readableError(error))}</p></div>`;
  }
}

function renderRegistry() {
  const config = REGISTRY_CONFIG[state.registry.type];
  const q = normalize(state.registry.query);
  const rows = state.registry.rows.filter((row) => {
    const values = [row[config.name], row.legal_name, row.reference, row.tax_id, row.email, row.phone, row.category];
    return !q || values.some((value) => normalize(value || "").includes(q));
  });

  els.registrySummary.textContent = state.session
    ? `${rows.length} registro(s) · ${currentCompany()?.trade_name || "empresa ativa"}`
    : `${rows.length} registro(s) · entre para alterar`;

  if (!rows.length) {
    els.registryResults.innerHTML = `<div class="empty"><strong>Nenhum ${escapeHtml(config.singular)} cadastrado</strong><p>${state.session ? "Use Novo cadastro para começar." : "Entre no acesso administrativo para consultar esta área."}</p></div>`;
    return;
  }

  els.registryResults.innerHTML = rows.map((row) => {
    const name = row[config.name] || "Sem nome";
    const meta = registryMeta(row);
    const contact = [row.contact_name, row.email, row.phone].filter(Boolean).join(" · ");
    return `
      <div class="registry-row">
        <div>
          <div class="registry-name">${escapeHtml(name)}</div>
          ${meta ? `<div class="registry-meta">${escapeHtml(meta)}</div>` : ""}
          <span class="status-label ${row.active === false ? "inactive" : ""}">${row.active === false ? "Inativo" : "Ativo"}</span>
        </div>
        <div class="registry-contact">${escapeHtml(contact || row.website || row.delivery_regions || "")}</div>
        <div class="registry-actions">
          <button data-registry-action="edit" data-id="${escapeHtml(row.id)}" type="button" ${state.session ? "" : "disabled"}>Editar</button>
          <button data-registry-action="toggle" data-id="${escapeHtml(row.id)}" type="button" ${state.session ? "" : "disabled"}>${row.active === false ? "Ativar" : "Inativar"}</button>
        </div>
      </div>`;
  }).join("");
}

function registryMeta(row) {
  if (state.registry.type === "products") {
    return [row.reference && `Ref. ${row.reference}`, row.category, row.unit].filter(Boolean).join(" · ");
  }
  if (state.registry.type === "sales_representatives") {
    return [row.territory, row.commission_percent != null && `${row.commission_percent}%`].filter(Boolean).join(" · ");
  }
  return [row.legal_name, row.tax_id].filter(Boolean).join(" · ");
}

async function openRegistryModal(row = null) {
  if (!requireSession()) return;
  const type = state.registry.type;
  const config = REGISTRY_CONFIG[type];
  state.registry.editing = row;
  state.registry.companySources = [];
  if (type === "companies" && row) {
    state.registry.companySources = await supabaseSelectAll(
      "stock_sources",
      `select=slug,drive_folder_id&company_id=eq.${encodeURIComponent(row.id)}`
    );
  }
  els.registryModalTitle.textContent = row ? `Editar ${config.singular}` : `Novo ${config.singular}`;
  els.registryForm.innerHTML = config.fields.map((field) => renderRegistryField(field, row || {})).join("")
    + (type === "companies" ? renderCompanySourceFields() : "")
    + `<label class="form-check"><input name="active" type="checkbox" ${(row?.active ?? true) ? "checked" : ""}> Cadastro ativo</label>`
    + (type === "companies" ? `<label class="form-check"><input name="public_read" type="checkbox" ${row?.public_read ? "checked" : ""}> Permitir consulta pública desta empresa</label>` : "");
  els.registryModal.hidden = false;
  els.registryForm.querySelector("input, select, textarea")?.focus();
}

function renderRegistryField(field, row) {
  const [name, label, type, required, options] = field;
  const value = name.startsWith("address_")
    ? row.address?.[name.replace("address_", "")] ?? ""
    : row[name] ?? "";
  if (type === "textarea") {
    return `<label class="form-field"><span>${escapeHtml(label)}</span><textarea name="${escapeHtml(name)}" rows="3" ${required ? "required" : ""}>${escapeHtml(value)}</textarea></label>`;
  }
  if (type === "select") {
    return `<label class="form-field"><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
  }
  return `<label class="form-field"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${type === "number" ? "step=\"0.01\"" : ""}></label>`;
}

function renderCompanySourceFields() {
  const sources = [
    ["masc-pronta-entrega", "Estoque masculino · pronta entrega"],
    ["masc-programacao", "Estoque masculino · programação"],
    ["fem-pronta-entrega", "Estoque feminino · pronta entrega"],
    ["fem-programacao", "Estoque feminino · programação"],
    ["fem-promocao", "Estoque feminino · promoção"],
  ];
  return `<div class="form-section-title">Pastas de estoque no Google Drive</div>${sources.map(([slug, label]) => {
    const value = state.registry.companySources.find((source) => source.slug === slug)?.drive_folder_id || "";
    return `<label class="form-field"><span>${escapeHtml(label)}</span><input name="source_${escapeHtml(slug)}" value="${escapeHtml(value)}" placeholder="ID da pasta"></label>`;
  }).join("")}`;
}

function closeRegistryModal() {
  els.registryModal.hidden = true;
  state.registry.editing = null;
}

async function saveRegistry() {
  if (!requireSession()) return;
  const type = state.registry.type;
  const config = REGISTRY_CONFIG[type];
  const form = new FormData(els.registryForm);
  const requiredField = config.fields.find((field) => field[3]);
  if (requiredField && !String(form.get(requiredField[0]) || "").trim()) {
    alert(`Informe ${requiredField[1].toLowerCase()}.`);
    return;
  }

  const payload = {};
  for (const [name, , fieldType] of config.fields) {
    const raw = String(form.get(name) || "").trim();
    if (name.startsWith("address_")) continue;
    payload[name] = fieldType === "number" ? (raw ? Number(raw) : null) : (raw || null);
  }
  if (config.fields.some((field) => field[0].startsWith("address_"))) {
    payload.address = Object.fromEntries(addressFields().map(([name]) => [
      name.replace("address_", ""),
      String(form.get(name) || "").trim(),
    ]).filter(([, value]) => value));
  }
  payload.active = form.get("active") === "on";

  if (type === "companies") {
    payload.organization_id = currentOrganizationId();
    payload.slug = slugify(payload.trade_name);
    payload.public_read = form.get("public_read") === "on";
  } else if (type === "products") {
    payload.organization_id = currentOrganizationId();
    payload.company_id = state.companyId;
    payload.normalized_name = normalize(payload.display_name);
  } else {
    payload.organization_id = currentOrganizationId();
  }

  els.saveRegistryButton.disabled = true;
  els.saveRegistryButton.textContent = "Salvando...";
  try {
    let saved;
    if (state.registry.editing) {
      [saved] = await supabaseUpdate(type, `id=eq.${encodeURIComponent(state.registry.editing.id)}`, payload);
    } else {
      [saved] = await supabaseInsert(type, payload);
    }
    if (type === "companies") {
      await saveCompanySources(saved.id, saved.organization_id, form);
      await loadCompanies();
      renderCompanySwitcher();
    }
    closeRegistryModal();
    await loadRegistry();
    if (type === "products") await refreshAll();
  } catch (error) {
    alert(`Erro ao salvar ${config.singular}: ${readableError(error)}`);
  } finally {
    els.saveRegistryButton.disabled = false;
    els.saveRegistryButton.textContent = "Salvar";
  }
}

async function saveCompanySources(companyId, organizationId, form) {
  const definitions = [
    ["masc-pronta-entrega", "Masc. Pronta Entrega", "masc", "pronta_entrega"],
    ["masc-programacao", "Masc. Programação", "masc", "programacao"],
    ["fem-pronta-entrega", "Fem. Pronta Entrega", "fem", "pronta_entrega"],
    ["fem-programacao", "Fem. Programação", "fem", "programacao"],
    ["fem-promocao", "Fem. Promoção", "fem", "promocao"],
  ];
  const rows = definitions.map(([slug, label, category, availability]) => ({
    organization_id: organizationId,
    company_id: companyId,
    slug,
    label,
    category,
    availability,
    drive_folder_id: String(form.get(`source_${slug}`) || "").trim() || "nao-configurada",
    active: Boolean(String(form.get(`source_${slug}`) || "").trim()),
  }));
  await supabaseUpsert("stock_sources", "company_id,slug", rows);
}

async function toggleRegistryRow(row) {
  if (!requireSession()) return;
  try {
    await supabaseUpdate(state.registry.type, `id=eq.${encodeURIComponent(row.id)}`, { active: row.active === false });
    await loadRegistry();
    if (state.registry.type === "companies") {
      await loadCompanies();
      renderCompanySwitcher();
    }
  } catch (error) {
    alert("Não foi possível alterar o cadastro: " + readableError(error));
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function readableError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      return readableError(parsed);
    } catch {
      return error;
    }
  }
  if (error && typeof error === "object") {
    if (error.error) return readableError(error.error);
    if (error.message) return String(error.message);
    if (Array.isArray(error.summary) && error.summary.length) {
      return error.summary.map(readableError).join(" | ");
    }
    if (error.source || error.status) {
      return [error.source, error.status, error.details].filter(Boolean).join(" - ") || "Operação não concluída";
    }
  }
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
