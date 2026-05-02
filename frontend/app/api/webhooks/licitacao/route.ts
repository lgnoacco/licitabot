import { NextResponse } from "next/server";
import { analisarEdital } from "../../../services/ai/analisador-edital";

// Aumenta o tempo limite da Vercel de 10 para 60 segundos (Essencial para Inteligência Artificial!)
export const maxDuration = 60; 

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function POST(request: Request) {
  // Pegando a autorização
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const licitacao = body.record;

  // Se não for um INSERT novo ou se vier sem texto, a gente ignora
  if (body.type !== "INSERT" || !licitacao?.texto_bruto) {
    return NextResponse.json({ message: "Ignorado - Não é inserção ou sem texto" });
  }

  try {
    // ⚠️ A MÁGICA AQUI: O 'await' obriga a Vercel a ficar de portas abertas
    // esperando o Gemini ler, pensar e salvar no Supabase!
    await analisarEdital(licitacao.id, licitacao.texto_bruto);
    
    // Só devolve o 200 OK DEPOIS que o banco de dados foi atualizado com sucesso.
    return NextResponse.json({ success: true, message: "Edital mastigado pela IA com sucesso!" });

  } catch (error) {
    console.error("Erro fatal durante a análise da IA:", error);
    return NextResponse.json({ erro: "A IA tropeçou no edital" }, { status: 500 });
  }
}