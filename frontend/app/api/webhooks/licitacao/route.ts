import { NextResponse } from "next/server";
import { analisarEdital } from "../../../services/ai/analisador-edital";

// A mesma senha que você colocou no .env.local
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function POST(request: Request) {
  const headers = new Headers({ "ngrok-skip-browser-warning": "true" });
  
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401, headers });
  }

  const body = await request.json();
  const licitacao = body.record;

  if (body.type !== "INSERT" || !licitacao?.texto_bruto) {
    return NextResponse.json({ message: "Ignorado" }, { headers });
  }

  // ✅ Responde imediatamente e processa em background
  // waitUntil garante que o processo termine mesmo após o response
  const response = NextResponse.json({ success: true, message: "Enfileirado" }, { headers });
  
  // Fire-and-forget (sem await)
  analisarEdital(licitacao.id, licitacao.texto_bruto).catch(console.error);
  
  return response;
}