import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("ESTOQUE_SUPABASE_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type CatalogColor = {
  code?: string;
  label: string;
  page?: number;
  image_data_url: string;
};

type CatalogPayload = {
  organization_id: string;
  company_id: string;
  file_name: string;
  product_name: string;
  origin?: string;
  specs: Record<string, string>;
  colors: CatalogColor[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ ok: false, error: "unauthorized" }, 401);

    const payload = await req.json() as CatalogPayload;
    if (
      !payload.company_id || !payload.organization_id || !payload.product_name ||
      !Array.isArray(payload.colors)
    ) {
      return json({ ok: false, error: "Dados do catalogo incompletos" }, 400);
    }

    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", payload.organization_id)
      .eq("user_id", userData.user.id)
      .eq("active", true)
      .maybeSingle();
    if (
      memberError || !member ||
      !["owner", "admin", "manager"].includes(String(member.role))
    ) {
      return json({ ok: false, error: "Sem permissao para importar catalogo" }, 403);
    }

    const normalizedName = normalizeText(payload.product_name);
    const specs = payload.specs || {};
    const labelRow = {
      organization_id: payload.organization_id,
      company_id: payload.company_id,
      normalized_name: normalizedName,
      display_name: payload.product_name,
      reference: specs.codigo || specs.cont || null,
      width: specs.largura || null,
      weight: [
        specs.gm2 && `G/M2 ${specs.gm2}`,
        specs.gml && `G/ML ${specs.gml}`,
        specs.rendimento && `Rend. ${specs.rendimento}`,
      ].filter(Boolean).join(" · ") || null,
      composition: specs.composicao || null,
      origin: payload.origin || "Catálogo",
      washing_instructions: [],
      ocr_text: Object.entries(specs).map(([key, value]) => `${key}: ${value}`).join("\n"),
      updated_at: new Date().toISOString(),
    };

    const { error: deleteLabelError } = await admin
      .from("product_labels")
      .delete()
      .eq("company_id", payload.company_id)
      .eq("normalized_name", normalizedName);
    if (deleteLabelError) throw deleteLabelError;

    const { error: labelError } = await admin.from("product_labels").insert(labelRow);
    if (labelError) throw labelError;

    const assets = [];
    for (const color of payload.colors) {
      const parsed = parseDataUrl(color.image_data_url);
      const normalizedColor = normalizeText(color.label);
      const path = `${payload.company_id}/${normalizedName}/${normalizedColor}.jpg`;
      const { error: uploadError } = await admin.storage
        .from("product-catalog-images")
        .upload(path, parsed.bytes, { contentType: parsed.mime, upsert: true });
      if (uploadError) throw uploadError;

      assets.push({
        organization_id: payload.organization_id,
        company_id: payload.company_id,
        normalized_name: normalizedName,
        display_name: payload.product_name,
        normalized_color: normalizedColor,
        color_label: color.label,
        color_code: color.code || null,
        image_path: path,
        catalog_file_name: payload.file_name,
        catalog_page: color.page || null,
        updated_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < assets.length; i += 500) {
      const { error } = await admin
        .from("product_catalog_assets")
        .upsert(assets.slice(i, i + 500), {
          onConflict: "company_id,normalized_name,normalized_color",
        });
      if (error) throw error;
    }

    return json({ ok: true, product: payload.product_name, colors: assets.length });
  } catch (error) {
    return json({ ok: false, error: readableError(error) }, 500);
  }
});

function parseDataUrl(value: string) {
  const match = String(value || "").match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Imagem invalida no catalogo");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1] || "image/jpeg", bytes };
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

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
}
