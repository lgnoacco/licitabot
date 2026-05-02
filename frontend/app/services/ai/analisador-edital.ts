import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Inicializa o SDK do Gemini com a sua chave
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Schema de saída (Zod valida o JSON da IA) ──────────────────────────────
const AnaliseEditalSchema = z.object({
  setor_slug: z.enum([
    "civil", "eletrica", "telecom",
    "saneamento", "ti", "consultoria", "outros"
  ]),
  confianca_setor: z.number().min(0).max(1),

  dados_criticos: z.object({
    valor_estimado:    z.number().nullable(),
    municipio:         z.string().nullable(),
    uf:                z.string().length(2).nullable(),
    prazo_execucao_dias: z.number().nullable(),
    data_abertura:     z.string().nullable(), // ISO 8601
    exige_acervo_tecnico: z.boolean(),
    acervos_requeridos: z.array(z.string()),
  }),

  metadados_setor: z.record(z.string(), z.unknown()), // flexível por setor

  resumo_executivo: z.object({
    desafio_tecnico:   z.string().max(300),
    desafio_financeiro: z.string().max(300),
    desafio_juridico:  z.string().max(300),
  }),

  score_viabilidade: z.number().int().min(0).max(100),
  justificativa_score: z.string().max(2000).describe("Justificativa da nota..."),
});

export type AnaliseEdital = z.infer<typeof AnaliseEditalSchema>;

// ── Trunca o edital para ~12k tokens (controle de custo) ──────────────────
function truncarTexto(texto: string, maxChars = 48_000): string {
  if (texto.length <= maxChars) return texto;
  // Preserva início (objeto/escopo) e fim (exigências técnicas)
  const metade = Math.floor(maxChars / 2);
  return (
    texto.slice(0, metade) +
    "\n\n[... TRECHO CENTRAL OMITIDO PARA REDUZIR CUSTO ...]\n\n" +
    texto.slice(-metade)
  );
}

// ── Função principal ───────────────────────────────────────────────────────
export async function analisarEdital(
  licitacaoId: string,
  textoBruto: string
): Promise<AnaliseEdital> {

  const textoTruncado = truncarTexto(textoBruto);

  const systemPrompt = `Você é um especialista em licitações públicas brasileiras com 20 anos de experiência.
Analise o edital fornecido e retorne EXCLUSIVAMENTE um objeto JSON válido.
Siga o schema exato solicitado. Para metadados_setor, inclua campos relevantes ao setor identificado:
- Civil: tipo_obra, exige_crea, bdi_referencia_percentual
- TI: linguagens_requeridas, exige_iso27001, tipo_contratacao
- Telecom: tecnologias, cobertura_geografica
- Saneamento: tipo_sistema, capacidade_m3_dia`;

  const userPrompt = `Analise este edital e retorne o JSON estruturado:

SCHEMA ESPERADO:
{
  "setor_slug": "civil|eletrica|telecom|saneamento|ti|consultoria|outros",
  "confianca_setor": 0.0-1.0,
  "dados_criticos": {
    "valor_estimado": number|null,
    "municipio": "string|null",
    "uf": "XX|null",
    "prazo_execucao_dias": number|null,
    "data_abertura": "ISO8601|null",
    "exige_acervo_tecnico": boolean,
    "acervos_requeridos": ["string"]
  },
  "metadados_setor": {},
  "resumo_executivo": {
    "desafio_tecnico": "max 300 chars",
    "desafio_financeiro": "max 300 chars",
    "desafio_juridico": "max 300 chars"
  },
  "score_viabilidade": 0-100,
  "justificativa_score": "max 500 chars"
}

EDITAL:
${textoTruncado}`;

  // Configura o modelo (Gemini 2x'.5 Flash é o ideal para leitura de documentos rápido e barato)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json", // Força a saída ser um JSON puro
    },
  });

  // ── Retry com backoff exponencial ─────────────────────────────────────
  let tentativa = 0;
  const maxTentativas = 3;

  while (tentativa < maxTentativas) {
    try {
      
      // Chamada para o Gemini
      const resultado = await model.generateContent(userPrompt);
      const textoResposta = resultado.response.text();

      // Como forçamos o responseMimeType, o texto já vem como JSON puro, mas o replace é uma garantia extra de segurança
      const jsonLimpo = textoResposta
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/,      "")
        .trim();

      const analise = AnaliseEditalSchema.parse(JSON.parse(jsonLimpo));

      // ── Persiste no Supabase ─────────────────────────────────────────
      const { data: setor } = await supabase
        .from("setores")
        .select("id")
        .eq("slug", analise.setor_slug)
        .single();

      await supabase
        .from("licitacoes")
        .update({
          status:            "analyzed",
          setor_id:          setor?.id ?? null,
          resumo_executivo:  JSON.stringify(analise.resumo_executivo),
          score_viabilidade: analise.score_viabilidade,
          metadados_setor:   analise.metadados_setor,
          uf:                analise.dados_criticos.uf,
          municipio:         analise.dados_criticos.municipio,
          valor_estimado:    analise.dados_criticos.valor_estimado,
          data_abertura:     analise.dados_criticos.data_abertura,
          updated_at:        new Date().toISOString(),
        })
        .eq("id", licitacaoId);

      return analise;

    } catch (erro) {
      console.error(`Tentativa ${tentativa + 1} falhou:`, erro);
      tentativa++;
      if (tentativa >= maxTentativas) throw erro;
      // Backoff: 2s, 4s, 8s
      await new Promise((r) => setTimeout(r, 2 ** tentativa * 1000));
    }
  }

  throw new Error("Máximo de tentativas atingido");
}