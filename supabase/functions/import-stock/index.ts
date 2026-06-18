import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs?target=deno";

type Source = {
  id: string;
  slug: string;
  label: string;
  drive_folder_id: string;
};

type ParsedItem = {
  product: string;
  color: string;
  process: string;
  quantity: number;
};

type ParsedPriceItem = {
  product: string;
  unit: string;
  currency: "BRL" | "USD";
  commissionPrices: Record<string, number>;
  availability: string;
  expectedArrival: string;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = getSupabaseSecretKey();
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
const DEFAULT_PRICE_DRIVE_FOLDER_ID = "1TLFeg3czJkesCOwFl7qMnTUB2B14xLKO";
const PRICE_DRIVE_FILE_ID = Deno.env.get("PRICE_DRIVE_FILE_ID") || "";
const PRICE_DRIVE_FOLDER_ID = Deno.env.get("PRICE_DRIVE_FOLDER_ID") || DEFAULT_PRICE_DRIVE_FOLDER_ID;

let supabase: ReturnType<typeof createClient>;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getSupabaseSecretKey() {
  const estoqueKey = Deno.env.get("ESTOQUE_SUPABASE_SECRET_KEY");
  if (estoqueKey) return estoqueKey;

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return "";

  try {
    const parsed = JSON.parse(secretKeys);
    return parsed.default || Object.values(parsed)[0] || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const params = await readRequestJson(req);

  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return json({ ok: false, error: messageOf(error) }, 500);
  }

  const run = await supabase
    .from("import_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (run.error) {
    return json({ ok: false, error: messageOf(run.error) }, 500);
  }

  const runId = run.data?.id;
  const summary: Record<string, unknown>[] = [];

  try {
    const token = await getGoogleAccessToken();

    if (params.action === "import_prices" || params.import_prices === true) {
      const priceResult = await importPrices(token);
      summary.push(priceResult);

      await supabase
        .from("import_runs")
        .update({
          status: priceResult.status === "failed" ? "failed" : "success",
          summary,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);

      return json({ ok: priceResult.status !== "failed", run_id: runId, summary }, priceResult.status === "failed" ? 500 : 200);
    }

    let sourceQuery = supabase
      .from("stock_sources")
      .select("id, slug, label, drive_folder_id")
      .eq("active", true)
      .order("label");

    if (typeof params.source_slug === "string" && params.source_slug !== "todos") {
      sourceQuery = sourceQuery.eq("slug", params.source_slug);
    }

    const { data: sources, error: sourceError } = await sourceQuery;

    if (sourceError) throw sourceError;

    for (const source of (sources || []) as Source[]) {
      const sourceResult = await importSource(source, token);
      summary.push(sourceResult);
    }

    await supabase
      .from("import_runs")
      .update({
        status: summary.some((s) => s.status === "failed") ? "partial" : "success",
        summary,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return json({ ok: true, run_id: runId, summary });
  } catch (error) {
    await supabase
      .from("import_runs")
      .update({
        status: "failed",
        error_message: messageOf(error),
        summary,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return json({ ok: false, run_id: runId, error: messageOf(error), summary }, 500);
  }
});

function createSupabaseAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL nao esta disponivel na Edge Function");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Chave administrativa ausente. Adicione ESTOQUE_SUPABASE_SECRET_KEY nos Secrets da Edge Function.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function importSource(source: Source, token: string) {
  try {
    const file = await getLatestDriveFile(source.drive_folder_id, token);
    if (!file) {
      await recordStockFile(source, null, "empty", "Nenhum arquivo encontrado", [], {});
      return { source: source.label, status: "empty", products: 0, colors: 0 };
    }

    const bytes = await downloadDriveFile(file, token);
    const parsed = isPdfFile(file) ? await parsePdf(bytes, file, token) : parseSpreadsheet(bytes);
    const items = parsed.items;

    const fileRow = await recordStockFile(
      source,
      file,
      items.length ? "imported" : "empty",
      items.length ? null : "Arquivo encontrado, mas nenhum item foi extraído",
      items,
      parsed.rawMeta,
    );

    if (items.length) {
      await supabase.from("stock_items").delete().eq("file_id", fileRow.id);
      await upsertItems(source, fileRow.id, items);
    }

    return {
      source: source.label,
      status: items.length ? "imported" : "empty",
      file: file.name,
      products: unique(items.map((i) => normalizeText(i.product))).length,
      colors: items.length,
    };
  } catch (error) {
    await recordStockFile(source, null, "failed", messageOf(error), [], {});
    return { source: source.label, status: "failed", error: messageOf(error) };
  }
}

async function getGoogleAccessToken() {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Google OAuth falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

async function getLatestDriveFile(folderId: string, token: string) {
  const q = `'${folderId}' in parents and trashed=false`;
  const url =
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,modifiedTime)",
      pageSize: "30",
    });

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const files = (data.files || []).filter(isStockFile);
  files.sort((a: DriveFile, b: DriveFile) => {
    const byDate = dateScore(b) - dateScore(a);
    if (byDate) return byDate;
    return filePriority(b) - filePriority(a);
  });
  return files[0] || null;
}

async function getDriveFileById(fileId: string, token: string) {
  const url =
    `https://www.googleapis.com/drive/v3/files/${fileId}?` +
    new URLSearchParams({
      fields: "id,name,mimeType,modifiedTime",
    });

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive file falhou: ${res.status} ${await res.text()}`);
  return await res.json() as DriveFile;
}

async function getLatestPriceDriveFile(token: string) {
  if (PRICE_DRIVE_FILE_ID) {
    return await getDriveFileById(PRICE_DRIVE_FILE_ID, token);
  }

  if (!PRICE_DRIVE_FOLDER_ID) {
    throw new Error("Configure PRICE_DRIVE_FILE_ID ou PRICE_DRIVE_FOLDER_ID nos Secrets para importar tabela de preços.");
  }

  const q = `'${PRICE_DRIVE_FOLDER_ID}' in parents and trashed=false`;
  const url =
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,modifiedTime)",
      pageSize: "30",
    });

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list de preços falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const files = (data.files || []).filter(isSpreadsheetFile);
  files.sort((a: DriveFile, b: DriveFile) => dateScore(b) - dateScore(a));
  return files[0] || null;
}

async function downloadDriveFile(file: any, token: string) {
  const url =
    file.mimeType === "application/vnd.google-apps.spreadsheet"
      ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
      : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download falhou (${file.name}): ${res.status} ${await res.text()}`);
  return await res.arrayBuffer();
}

async function importPrices(token: string) {
  try {
    const file = await getLatestPriceDriveFile(token);
    if (!file) {
      await recordPriceFile(null, "failed", "Nenhuma planilha de preços encontrada", []);
      return { source: "Tabela de preços", status: "failed", error: "Nenhuma planilha de preços encontrada" };
    }

    if (!isSpreadsheetFile(file)) {
      throw new Error(`Arquivo de preços não é planilha: ${file.name}`);
    }

    const bytes = await downloadDriveFile(file, token);
    const items = parsePriceSpreadsheet(bytes);
    const fileRow = await recordPriceFile(file, items.length ? "imported" : "failed", items.length ? null : "Nenhum preço foi extraído", items);

    if (items.length) {
      const { error: deleteError } = await supabase.from("price_items").delete().eq("source_type", "drive");
      if (deleteError) throw deleteError;
      await insertPriceItems(fileRow.id, items);
    }

    return {
      source: "Tabela de preços",
      status: items.length ? "imported" : "failed",
      file: file.name,
      items: items.length,
    };
  } catch (error) {
    await recordPriceFile(null, "failed", messageOf(error), []);
    return { source: "Tabela de preços", status: "failed", error: messageOf(error) };
  }
}

async function recordPriceFile(
  file: DriveFile | null,
  status: "imported" | "failed",
  errorMessage: string | null,
  items: ParsedPriceItem[],
) {
  const payload = {
    drive_file_id: file?.id || `missing-price-${Date.now()}`,
    file_name: file?.name || "Tabela de preços não encontrada",
    imported_at: new Date().toISOString(),
    status,
    error_message: errorMessage,
    item_count: items.length,
  };

  const { data, error } = await supabase
    .from("price_files")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

async function insertPriceItems(priceFileId: string, items: ParsedPriceItem[]) {
  const rows = items.map((item) => {
    const values = Object.values(item.commissionPrices);
    return {
      price_file_id: priceFileId,
      normalized_name: normalizeText(item.product),
      display_name: item.product,
      unit: item.unit || unitForProduct(item.product),
      currency: item.currency,
      commission_prices: item.commissionPrices,
      price_1: values[0] ?? null,
      price_2: values[1] ?? null,
      price_3: values[2] ?? null,
      price_4: values[3] ?? null,
      availability: item.availability || null,
      expected_arrival: item.expectedArrival || null,
      source_type: "drive",
      updated_at: new Date().toISOString(),
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("price_items").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

async function recordStockFile(
  source: Source,
  file: any | null,
  status: "imported" | "empty" | "failed",
  errorMessage: string | null,
  items: ParsedItem[],
  rawMeta: Record<string, unknown>,
) {
  const productCount = unique(items.map((i) => normalizeText(i.product))).length;
  const payload = {
    source_id: source.id,
    drive_file_id: file?.id || `missing-${Date.now()}-${source.slug}`,
    file_name: file?.name || "Nenhum arquivo encontrado",
    mime_type: file?.mimeType || null,
    modified_at: file?.modifiedTime || null,
    imported_at: new Date().toISOString(),
    status,
    error_message: errorMessage,
    product_count: productCount,
    color_count: items.length,
    raw_meta: rawMeta,
  };

  const { data, error } = await supabase
    .from("stock_files")
    .upsert(payload, { onConflict: "source_id,drive_file_id" })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

async function upsertItems(source: Source, fileId: string, items: ParsedItem[]) {
  const productRows = unique(items.map((i) => normalizeText(i.product))).map((normalized) => {
    const display = items.find((i) => normalizeText(i.product) === normalized)?.product || normalized;
    return { normalized_name: normalized, display_name: display, updated_at: new Date().toISOString() };
  });

  const { error: productError } = await supabase
    .from("products")
    .upsert(productRows, { onConflict: "normalized_name" });
  if (productError) throw productError;

  const { data: products, error: loadError } = await supabase
    .from("products")
    .select("id, normalized_name")
    .in("normalized_name", productRows.map((p) => p.normalized_name));
  if (loadError) throw loadError;

  const productByName = new Map((products || []).map((p: any) => [p.normalized_name, p.id]));
  const rows = items.map((item) => ({
    file_id: fileId,
    source_id: source.id,
    product_id: productByName.get(normalizeText(item.product)),
    color_name: item.color,
    normalized_color: normalizeText(item.color),
    process_code: item.process || null,
    quantity_meters: item.quantity,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("stock_items").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

function parseSpreadsheet(bytes: ArrayBuffer) {
  const workbook = XLSX.read(bytes, { type: "array" });
  return {
    items: parseWorkbook(workbook),
    rawMeta: { file_kind: "spreadsheet", sheets: workbook.SheetNames },
  };
}

async function parsePdf(bytes: ArrayBuffer, file: DriveFile, token: string) {
  const text = await extractPdfTextWithFallback(bytes, file, token);
  return {
    items: parsePdfText(text),
    rawMeta: {
      file_kind: "pdf",
      text_sample: text.slice(0, 2000),
    },
  };
}

async function extractPdfTextWithFallback(bytes: ArrayBuffer, file: DriveFile, token: string) {
  try {
    return await extractPdfText(bytes);
  } catch (error) {
    return await extractPdfTextViaDriveConversion(bytes, file, token, messageOf(error));
  }
}

async function extractPdfText(bytes: ArrayBuffer) {
  (pdfjs as any).GlobalWorkerOptions.workerSrc =
    "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs?target=deno";

  const task = (pdfjs as any).getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str || "").join(" "));
  }

  return pages.join("\n");
}

async function extractPdfTextViaDriveConversion(bytes: ArrayBuffer, file: DriveFile, token: string, originalError: string) {
  const tempFileName = `Estoque Beta OCR ${file.id}`;
  const boundary = `estoque-beta-${crypto.randomUUID()}`;
  const metadata = {
    name: tempFileName,
    mimeType: "application/vnd.google-apps.document",
  };
  const encoder = new TextEncoder();
  const body = new Blob([
    encoder.encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n`),
    encoder.encode(JSON.stringify(metadata)),
    encoder.encode(`\r\n--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`),
    new Uint8Array(bytes),
    encoder.encode(`\r\n--${boundary}--\r\n`),
  ]);

  const createRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!createRes.ok) {
    throw new Error(`Leitor de PDF falhou: ${originalError}. Conversao pelo Drive falhou: ${createRes.status} ${await createRes.text()}`);
  }

  const created = await createRes.json();
  const tempId = created.id;

  try {
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${tempId}/export?mimeType=text/plain`,
      { headers: { authorization: `Bearer ${token}` } },
    );

    if (!exportRes.ok) {
      throw new Error(`Exportacao de texto do PDF falhou: ${exportRes.status} ${await exportRes.text()}`);
    }

    return await exportRes.text();
  } finally {
    await fetch(`https://www.googleapis.com/drive/v3/files/${tempId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  }
}

function parsePdfText(text: string): ParsedItem[] {
  const prepared = text
    .replace(/\r/g, "\n")
    .replace(/(?!^)(Nome\s*:)/gi, "\n$1")
    .replace(/(?!^)(Cor\s*:)/gi, "\n$1");
  const lines = prepared.split(/\n+/).map(cleanText).filter(Boolean);
  const items: ParsedItem[] = [];
  let product = "";
  let pendingColor = "";

  for (const line of lines) {
    const nameMatch = line.match(/^Nome\s*:\s*(.+)$/i);
    if (nameMatch) {
      product = cleanPdfProductName(nameMatch[1]);
      pendingColor = "";
      continue;
    }

    const colorMatch = line.match(/^Cor\s*:\s*(.+?)(?:\s+\(\d+\s+items?\))?(?:\s+([\d.]+,\d+))?\s*$/i);
    if (colorMatch && product) {
      const color = cleanPdfColorName(colorMatch[1]);
      const inlineQuantity = parseNumber(colorMatch[2]);
      if (color && inlineQuantity > 0) {
        items.push({ product, color, process: "", quantity: inlineQuantity });
        pendingColor = "";
      } else {
        pendingColor = color;
      }
      continue;
    }

    if (pendingColor && product) {
      const quantity = parseNumber(line);
      if (quantity > 0) {
        items.push({ product, color: pendingColor, process: "", quantity });
        pendingColor = "";
      }
    }
  }

  return compactItems(items);
}

function cleanPdfProductName(value: string) {
  return cleanText(value)
    .replace(/\s+R\$\s*[\d.,]+\s+[\d.,]+\s*$/i, "")
    .replace(/\s+[\d.,]+\s+[\d.,]+\s*$/i, "")
    .replace(/\s+R\$\s*[\d.,]+\s*$/i, "")
    .trim();
}

function cleanPdfColorName(value: string) {
  return cleanText(value)
    .replace(/\s+\(\d+\s+items?\)\s*$/i, "")
    .trim();
}

function parseWorkbook(workbook: XLSX.WorkBook): ParsedItem[] {
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    const structured = parseNomeCorProcesso(rows);
    if (structured.length) return structured;
    const tabular = parseTabela(rows);
    if (tabular.length) return tabular;
  }
  return [];
}

function parsePriceSpreadsheet(bytes: ArrayBuffer) {
  const workbook = XLSX.read(bytes, { type: "array" });
  const items: ParsedPriceItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    items.push(...parsePriceRows(rows));
  }

  return compactPriceItems(items);
}

function parsePriceRows(rows: any[][]) {
  let best: any = null;

  for (let h = 0; h < Math.min(rows.length, 40); h++) {
    const headers = rows[h].map(normalizeHeader);
    const productCol = choosePriceColumn(headers, "product");
    const priceCols = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header, index }) => index !== productCol && isPriceHeader(header));

    if (productCol < 0 || !priceCols.length) continue;
    const score = priceCols.length * 5 + columnScore(headers[productCol], "product");
    if (!best || score > best.score) {
      best = {
        row: h,
        productCol,
        unitCol: choosePriceColumn(headers, "unit"),
        currencyCol: choosePriceColumn(headers, "currency"),
        availabilityCol: choosePriceColumn(headers, "availability"),
        expectedCol: choosePriceColumn(headers, "expected"),
        priceCols,
        score,
      };
    }
  }

  if (!best) return [];

  const items: ParsedPriceItem[] = [];
  for (let i = best.row + 1; i < rows.length; i++) {
    const row = rows[i];
    const product = cleanText(row[best.productCol]);
    if (!product || /^(TOTAL|SUBTOTAL|PRODUTO|DESCRICAO|NOME COMERCIAL)$/i.test(product)) continue;
    const unit = best.unitCol >= 0 ? cleanText(row[best.unitCol]) : unitForProduct(product);

    const commissionPrices: Record<string, number> = {};
    for (const col of best.priceCols) {
      const price = parsePriceValue(row[col.index], row[col.index + 1], unit);
      if (!(price > 0)) continue;
      const label = cleanCommissionLabel(col.header);
      commissionPrices[label] = roundMoney(price);
    }

    if (!Object.keys(commissionPrices).length) continue;

    const rowCurrency = best.currencyCol >= 0 ? parseCurrency(row[best.currencyCol]) : null;
    const headerCurrency = parseCurrency(best.priceCols.map((col: any) => col.header).join(" "));
    const currency = rowCurrency || headerCurrency || "BRL";

    items.push({
      product,
      unit,
      currency,
      commissionPrices,
      availability: best.availabilityCol >= 0 ? cleanText(row[best.availabilityCol]) : "",
      expectedArrival: best.expectedCol >= 0 ? cleanText(row[best.expectedCol]) : "",
    });
  }

  return items;
}

function compactPriceItems(items: ParsedPriceItem[]) {
  const map = new Map<string, ParsedPriceItem>();
  for (const item of items) {
    const key = `${normalizeText(item.product)}||${item.currency}`;
    const current = map.get(key);
    if (current) {
      current.commissionPrices = { ...current.commissionPrices, ...item.commissionPrices };
      current.unit ||= item.unit;
      current.availability ||= item.availability;
      current.expectedArrival ||= item.expectedArrival;
    } else {
      map.set(key, { ...item, commissionPrices: { ...item.commissionPrices } });
    }
  }
  return [...map.values()];
}

function choosePriceColumn(headers: string[], type: string) {
  let best = -1;
  let bestScore = 0;
  headers.forEach((header, index) => {
    let score = 0;
    if (type === "product" && /\b(NOME COMERCIAL|NOME PRODUTO|PRODUTO|DESCRICAO|MATERIAL|ARTIGO|TECIDO|ITEM)\b/.test(header)) score = 5;
    if (type === "unit" && /\b(UNIDADE|UNID|UND|UNIT|MEDIDA|UM)\b/.test(header)) score = 5;
    if (type === "currency" && /\b(MOEDA|CURRENCY|CAMBIO)\b/.test(header)) score = 5;
    if (type === "availability" && /\b(DISPONIBILIDADE|DISPONIVEL|STATUS|ENTREGA)\b/.test(header)) score = 5;
    if (type === "expected" && /\b(PREVISAO|CHEGADA|ETA|PREVISTO)\b/.test(header)) score = 5;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

function isPriceHeader(header: string) {
  if (!header) return false;
  if (/\b(PRECO|PREÇO|VALOR|COMISSAO|COMISSAO|COMIS|R\$|U\$|USD|DOLAR|DOLLAR)\b/.test(header)) return true;
  if (/TABELA/.test(header)) return true;
  if (/%/.test(header)) return true;
  return false;
}

function cleanCommissionLabel(header: string) {
  const cleaned = cleanText(header)
    .replace(/\b(PRECO|PREÇO|VALOR|COMISSAO|COMISSÃO|COMIS)\b/gi, "")
    .replace(/\b(R\$|U\$|USD|BRL|DOLAR|DOLLAR)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Preço";
}

function parsePriceValue(value: unknown, nextValue: unknown, unit: string) {
  if (typeof value === "number") return value;

  const text = String(value || "");
  if (/^(R\$|U\$|USD|BRL)$/i.test(text.trim())) {
    return parseNumber(nextValue);
  }

  const unitMatch = String(unit || "").toUpperCase().startsWith("KG") ? "KG" : "MT";
  const unitPrice = extractUnitPrice(text, unitMatch);
  if (unitPrice > 0) return unitPrice;

  return parseNumber(value);
}

function extractUnitPrice(text: string, unit: "KG" | "MT") {
  const normalized = text.replace(/\s+/g, " ").trim();
  const pattern = new RegExp(`(?:R\\$|U\\$|USD)?\\s*([\\d.]+,\\d{2}|\\d+\\.\\d{1,2})\\s*${unit}\\b`, "i");
  const match = normalized.match(pattern);
  if (!match) return NaN;
  return parseNumber(match[1]);
}

function parseCurrency(value: unknown): "BRL" | "USD" | null {
  const normalized = normalizeText(String(value || ""));
  if (/\b(USD|DOLAR|DOLLAR|U)\b/.test(normalized) || /U\$/.test(String(value || ""))) return "USD";
  if (/\b(BRL|REAL|REAIS|R)\b/.test(normalized) || /R\$/.test(String(value || ""))) return "BRL";
  return null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function unitForProduct(product: string) {
  return /\bMALHAS?\b/i.test(normalizeText(product)) ? "kg" : "m";
}

function parseNomeCorProcesso(rows: any[][]): ParsedItem[] {
  const items: ParsedItem[] = [];
  let product = "";
  let process = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.slice(0, 6).map((c) => String(c || "").trim());
    const joined = cells.join(" ");
    const processMatch = joined.match(/processo\s*[:\s]\s*([A-Z0-9\-./]+)/i);
    if (processMatch) {
      process = processMatch[1].trim();
      continue;
    }

    const nameCell = cells.find((c) => /^Nome\s*[:\s]/i.test(c));
    if (nameCell) {
      product = (nameCell.match(/Nome\s*[:\s]\s*(.+?)(?:\s*\(|$)/i)?.[1] || "").replace(/\s+/g, " ").trim();
      continue;
    }

    const colorIndex = cells.findIndex((c) => /^Cor\s*[:\s]/i.test(c));
    const colorCell = colorIndex >= 0 ? cells[colorIndex] : "";
    if (!colorCell || !product) continue;

    const color = (colorCell.match(/^Cor\s*[:\s]\s*(.+?)(?:\s*\(|$)/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const detailed = parseColorDetails(rows, i, product, color);
    if (detailed.length) {
      items.push(...detailed);
      continue;
    }

    const quantity = findQuantityOnColorRow(row, colorIndex);
    if (color && quantity > 0) items.push({ product, color, process, quantity });
  }

  return compactItems(items);
}

function parseColorDetails(rows: any[][], colorRowIndex: number, product: string, color: string) {
  const headerIndex = findDetailHeaderIndex(rows, colorRowIndex + 1);
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeHeader);
  const quantityCol = chooseColumn(headers, "quantity");
  const processCol = chooseColumn(headers, "process");
  if (quantityCol < 0) return [];

  const items: ParsedItem[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const normalized = normalizeText(row.join(" "));
    if (!normalized && items.length) break;
    if (normalized.startsWith("NOME ") || normalized.includes(" NOME ") || normalized.startsWith("COR ")) break;
    if (/QTDE EM ESTOQUE|SUBCLASSE/.test(normalized)) break;

    const quantity = parseNumber(row[quantityCol]);
    const process = processCol >= 0 ? cleanText(row[processCol]) : "";
    if (quantity > 0) items.push({ product, color, process, quantity });
  }

  return items;
}

function findDetailHeaderIndex(rows: any[][], startIndex: number) {
  for (let i = startIndex; i < Math.min(rows.length, startIndex + 5); i++) {
    const normalized = normalizeText(rows[i].join(" "));
    if (/QTDE EM ESTOQUE|QUANTIDADE|QTD|QTDE/.test(normalized) && /PROCESSO|LOTE|REFERENCIA|REF/.test(normalized)) {
      return i;
    }
  }
  return -1;
}

function findQuantityOnColorRow(row: any[], colorIndex: number) {
  const candidates = row
    .slice(Math.max(0, colorIndex + 1), Math.min(row.length, colorIndex + 7))
    .map(parseNumber)
    .filter((value) => value > 0);

  if (!candidates.length) return NaN;
  return Math.max(...candidates);
}

function parseTabela(rows: any[][]): ParsedItem[] {
  let best: any = null;

  for (let h = 0; h < Math.min(rows.length, 35); h++) {
    const headers = rows[h].map(normalizeHeader);
    const cols = {
      product: chooseColumn(headers, "product"),
      color: chooseColumn(headers, "color"),
      quantity: chooseColumn(headers, "quantity"),
      process: chooseColumn(headers, "process"),
    };
    if (cols.product < 0 || cols.color < 0 || cols.quantity < 0) continue;
    const score = columnScore(headers[cols.product], "product") + columnScore(headers[cols.color], "color") + columnScore(headers[cols.quantity], "quantity");
    if (!best || score > best.score) best = { row: h, cols, score };
  }

  if (!best) return [];

  const items: ParsedItem[] = [];
  for (let i = best.row + 1; i < rows.length; i++) {
    const row = rows[i];
    const product = cleanText(row[best.cols.product]);
    const color = cleanText(row[best.cols.color]);
    const process = best.cols.process >= 0 ? cleanText(row[best.cols.process]) : "";
    const quantity = parseNumber(row[best.cols.quantity]);
    if (!product || !color || !(quantity > 0)) continue;
    if (/^(TOTAL|SUBTOTAL|SALDO|PRODUTO|DESCRICAO|NOME COMERCIAL)$/i.test(product)) continue;
    items.push({ product, color, process, quantity });
  }

  return compactItems(items);
}

function compactItems(items: ParsedItem[]) {
  const map = new Map<string, ParsedItem>();
  for (const item of items) {
    const key = `${normalizeText(item.product)}||${normalizeText(item.color)}||${item.process || ""}`;
    const current = map.get(key);
    if (current) current.quantity += item.quantity;
    else map.set(key, { ...item });
  }
  return [...map.values()];
}

function columnScore(header: string, type: string) {
  let score = 0;
  if (type === "product") {
    if (/\b(NOME COMERCIAL|NOME PRODUTO|PRODUTO|DESCRICAO|MATERIAL|ARTIGO|TECIDO|ITEM)\b/.test(header)) score += 4;
    if (/\b(COR|PROCESSO|LOTE|QTD|QTDE|SALDO|ESTOQUE|DISPONIVEL|TOTAL|MT)\b/.test(header)) score -= 3;
  }
  if (type === "color" && /\b(COR|CORES|COLOR)\b/.test(header)) score += 5;
  if (type === "quantity") {
    if (/\b(SALDO|ESTOQUE|DISPONIVEL|QUANTIDADE|QUANT|QTD|QTDE|METRAGEM|METROS|MTS|TOTAL|MT)\b/.test(header)) score += 5;
    if (/\b(PRECO|VALOR|CUSTO)\b/.test(header)) score -= 5;
  }
  if (type === "process" && /\b(PROCESSO|LOTE|CONTAINER|REFERENCIA|REF|PEDIDO|IMPORTACAO)\b/.test(header)) score += 4;
  return score;
}

function chooseColumn(headers: string[], type: string) {
  let best = -1;
  let bestScore = 0;
  headers.forEach((header, index) => {
    const score = columnScore(header, type);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

function isStockFile(file: DriveFile) {
  return isSpreadsheetFile(file) || isPdfFile(file);
}

function isSpreadsheetFile(file: DriveFile) {
  const name = String(file.name || "").toLowerCase();
  return (
    file.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimeType === "application/vnd.ms-excel" ||
    file.mimeType === "application/vnd.google-apps.spreadsheet" ||
    /\.xlsx?$/.test(name)
  );
}

function isPdfFile(file: DriveFile) {
  return file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

function filePriority(file: DriveFile) {
  if (isSpreadsheetFile(file)) return 2;
  if (isPdfFile(file)) return 1;
  return 0;
}

function dateScore(file: DriveFile) {
  const named = String(file.name || "").match(/(\d{2})[._-](\d{2})[._-](\d{2,4})/);
  if (named) {
    const year = named[3].length === 4 ? Number(named[3]) : 2000 + Number(named[3]);
    return new Date(year, Number(named[2]) - 1, Number(named[1])).getTime();
  }
  return new Date(file.modifiedTime || 0).getTime();
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  let raw = String(value || "").trim().replace(/[^\d,.\-]/g, "");
  if (!raw) return NaN;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(raw);
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: unknown) {
  return normalizeText(String(value || "")).replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function readRequestJson(req: Request) {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
