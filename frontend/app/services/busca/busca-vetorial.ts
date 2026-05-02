import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient }        from "@supabase/supabase-js";

const genai    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Gera embedding de 768 dimensões (Gemini, custo ~$0 para volumes moderados)
async function gerarEmbedding(texto: string): Promise<number[]> {
  const model    = genai.getGenerativeModel({ model: "text-embedding-004" });
  const resultado = await model.embedContent(texto);
  return resultado.embedding.values;
}

// ── Indexa uma licitação (chama após análise da IA) ────────────────────────
export async function indexarLicitacao(
  licitacaoId: string,
  titulo:      string,
  textoBruto:  string
): Promise<void> {
  // Usa título + primeiros 2000 chars para embedding (custo controlado)
  const textoParaEmbedding = `${titulo}\n\n${textoBruto.slice(0, 2000)}`;
  const embedding = await gerarEmbedding(textoParaEmbedding);

  await supabase
    .from("licitacoes")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", licitacaoId);
}

// ── Busca licitações similares a um projeto existente ─────────────────────
export interface ResultadoBuscaSimilar {
  id:               string;
  titulo:           string;
  municipio:        string;
  uf:               string;
  valor_estimado:   number;
  score_viabilidade: number;
  similaridade:     number; // 0-1
  link_edital:      string;
}

export async function buscarSimilares(
  descricaoProjeto: string,
  opcoes: {
    limite?:        number;
    uf_filtro?:     string;
    setor_slug?:    string;
    score_minimo?:  number;
  } = {}
): Promise<ResultadoBuscaSimilar[]> {

  const { limite = 10, uf_filtro, setor_slug, score_minimo = 50 } = opcoes;

  const embedding = await gerarEmbedding(descricaoProjeto);

  // Chama a função RPC no Supabase (definida abaixo no SQL)
  const { data, error } = await supabase.rpc("buscar_licitacoes_similares", {
    query_embedding:   JSON.stringify(embedding),
    match_threshold:   0.75,     // similaridade mínima (cosine)
    match_count:       limite,
    p_uf:              uf_filtro  ?? null,
    p_setor_slug:      setor_slug ?? null,
    p_score_minimo:    score_minimo,
  });

  if (error) throw new Error(`Erro na busca vetorial: ${error.message}`);
  return data ?? [];
}