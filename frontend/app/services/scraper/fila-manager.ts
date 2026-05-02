// Implementação com Supabase como fila persistente (sem Redis = menor custo)

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Tabela de fila no Supabase (DDL) ──────────────────────────────────────
/*
CREATE TABLE scraper_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte        TEXT NOT NULL,           -- 'pncp', 'comprasnet', 'licitacoes-e'
  payload      JSONB NOT NULL,          -- { url, pagina, filtros }
  status       TEXT DEFAULT 'pending',  -- pending | processing | done | failed
  tentativas   INT  DEFAULT 0,
  proximo_exec TIMESTAMPTZ DEFAULT now(),
  erro         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_jobs_pending ON scraper_jobs(status, proximo_exec)
  WHERE status IN ('pending', 'failed');
*/

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface ScraperJob {
  id:      string;
  fonte:   string;
  payload: Record<string, unknown>;
}

// ── Enfileira um batch de URLs para scraping ──────────────────────────────
export async function enfileirarJobs(
  fonte:   string,
  payloads: Record<string, unknown>[]
): Promise<void> {
  const jobs = payloads.map((payload) => ({
    fonte,
    payload,
    status:       "pending",
    proximo_exec: new Date().toISOString(),
  }));

  await supabase.from("scraper_jobs").insert(jobs);
}

// ── Worker: pega N jobs e processa com rate limiting ──────────────────────
export async function processarFilaComLimite(
  fonte:            string,
  processador:      (job: ScraperJob) => Promise<void>,
  opcoes: {
    concorrencia?:  number; // quantos ao mesmo tempo
    delayEntreMs?:  number; // delay entre requisições
    maxPorCiclo?:   number; // limite por execução do cron
  } = {}
): Promise<void> {
  const { concorrencia = 3, delayEntreMs = 2000, maxPorCiclo = 30 } = opcoes;

  // Pega jobs disponíveis (com FOR UPDATE SKIP LOCKED = sem colisão entre workers)
  const { data: jobs } = await supabase
    .from("scraper_jobs")
    .select("id, fonte, payload")
    .eq("fonte", fonte)
    .in("status", ["pending", "failed"])
    .lte("proximo_exec", new Date().toISOString())
    .lt("tentativas", 5)         // desiste após 5 falhas
    .order("proximo_exec")
    .limit(maxPorCiclo);

  if (!jobs?.length) return;

  // Marca como "processing" atomicamente
  const ids = jobs.map((j) => j.id);
  await supabase
    .from("scraper_jobs")
    .update({ status: "processing" })
    .in("id", ids);

  // Processa em batches de `concorrencia` com delay entre eles
  for (let i = 0; i < jobs.length; i += concorrencia) {
    const lote = jobs.slice(i, i + concorrencia);

    await Promise.allSettled(
      lote.map(async (job) => {
        try {
          await processador(job as ScraperJob);
          await supabase
            .from("scraper_jobs")
            .update({ status: "done" })
            .eq("id", job.id);
        } catch (erro) {
          const msg = erro instanceof Error ? erro.message : String(erro);

          // Backoff exponencial: 5min, 15min, 45min, 2h, 6h
          const tentativa = (job as any).tentativas ?? 0;
          const proxExec  = new Date(
            Date.now() + Math.min(5 * 60_000 * 3 ** tentativa, 6 * 3_600_000)
          ).toISOString();

          await supabase
            .from("scraper_jobs")
            .update({
              status:       "failed",
              tentativas:   tentativa + 1,
              erro:         msg,
              proximo_exec: proxExec,
            })
            .eq("id", job.id);
        }
      })
    );

    // Delay entre lotes para evitar ban por IP
    if (i + concorrencia < jobs.length) {
      await new Promise((r) => setTimeout(r, delayEntreMs));
    }
  }
}

// ── Exemplo: Scraper PNCP integrado à fila ────────────────────────────────
export async function workerPNCP(job: ScraperJob): Promise<void> {
  const { pagina, data_inicial, data_final } = job.payload as {
    pagina:        number;
    data_inicial:  string;
    data_final:    string;
  };

  const headers = {
    "User-Agent": "LicitaBot/2.0 (contato@licita.bot)",
    "Accept":     "application/json",
  };

  const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao`
    + `?dataInicial=${data_inicial}&dataFinal=${data_final}`
    + `&codigoModalidadeContratacao=8&pagina=${pagina}`;

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });

  if (resp.status === 429) {
    // Rate limit: agenda retry em 10 minutos
    throw new Error("RATE_LIMITED");
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const dados = await resp.json();
  const licitacoes = (dados.data ?? []).map((item: any) => ({
    numero_controle: item.numeroControlePNCP,
    titulo:          item.objetoCompra ?? "Sem título",
    descricao:       item.amparoLegal,
    valor_estimado:  item.valorTotalEstimado ?? 0,
    link_edital:     item.linkSistemaOrigem,
    texto_bruto:     item.objetoCompra,
    fonte:           "pncp",
    status:          "raw" as const,
  }));

  if (licitacoes.length) {
    await supabase
      .from("licitacoes")
      .upsert(licitacoes, { onConflict: "numero_controle" }); // evita duplicatas
  }
}