"use client"; // Isso avisa o Next.js que esta tela tem interatividade em tempo real

import { useState, useEffect } from 'react';
import { supabase } from '../src/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO TRADUTORA
// Recebe qualquer string. Se for um JSON do governo (ex: {"codigo":19,"nome":"Lei...","descricao":"Dispensa..."}),
// extrai só o campo "descricao" (ou "nome", como fallback). Caso contrário,
// devolve o texto original sem alteração.
// ─────────────────────────────────────────────────────────────────────────────
function formatarDescricao(texto: string): string {
  if (!texto) return '';

  // Tenta fazer o parse como JSON
  try {
    const obj = JSON.parse(texto);

    // Prioridade: campo "descricao" → "nome" → qualquer valor string dentro do objeto
    if (typeof obj === 'object' && obj !== null) {
      if (obj.descricao && typeof obj.descricao === 'string') return obj.descricao;
      if (obj.nome     && typeof obj.nome     === 'string') return obj.nome;

      // Último recurso: primeiro valor string encontrado
      const primeiroValorString = Object.values(obj).find((v) => typeof v === 'string');
      if (primeiroValorString) return primeiroValorString as string;
    }
  } catch {
    // Não é JSON — devolve o texto como veio
  }

  return texto;
}

export default function Home() {
  // 2. Os "Estados" (Memória da tela)
  const [licitacoes, setLicitacoes] = useState<any[]>([]); // Guarda as licitações originais
  const [busca, setBusca] = useState(''); // Guarda o que você está digitando
  const [carregando, setCarregando] = useState(true); // Controla o aviso de "Carregando"

  // 3. Busca os dados no banco assim que a tela abre
  useEffect(() => {
    async function carregarDados() {
      const { data, error } = await supabase
        .from('licitacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setLicitacoes(data);
      }
      setCarregando(false);
    }
    carregarDados();
  }, []);

  // 4. O MOTOR DE BUSCA: Busca inteligente por palavras-chave e proteção contra null
  const termosBusca = busca.toLowerCase().trim().split(/\s+/); // Quebra a frase em palavras

  const licitacoesFiltradas = licitacoes.filter((licitacao) => {
    // Proteção: se o título ou descrição vier nulo do banco, não quebra a tela
    const titulo = (licitacao.titulo || '').toLowerCase();
    const descricao = formatarDescricao(licitacao.descricao || '').toLowerCase();
    
    // Junta tudo num textão só para facilitar a busca
    const textoCompleto = `${titulo} ${descricao}`;

    // Se a barra estiver vazia, mostra todos os editais
    if (termosBusca.length === 1 && termosBusca[0] === '') {
      return true;
    }

    // A Mágica: Verifica se TODAS as palavras digitadas existem em algum lugar do texto do edital
    return termosBusca.every(termo => textoCompleto.includes(termo));
  });

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Painel LicitaBot 🤖</h1>
            <p className="text-slate-500 mt-2">Suas últimas oportunidades de Pregão Eletrônico capturadas.</p>
          </div>

          {/* BARRA DE PESQUISA */}
          <div className="relative">
            <input
              type="text"
              placeholder="Pesquise por palavras-chave (ex: Buffet, Medalhas)..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full p-4 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-700"
            />
          </div>
        </header>

        {/* LÓGICA DE EXIBIÇÃO DA TELA */}
        {carregando ? (
          <p className="text-slate-500 font-medium">Carregando licitações do banco de dados...</p>
        ) : (
          <div className="grid gap-6">
            {licitacoesFiltradas.length === 0 ? (
              <div className="bg-white p-10 rounded-xl border border-slate-200 text-center">
                <p className="text-slate-500 text-lg">Nenhuma licitação encontrada para "{busca}".</p>
              </div>
            ) : (
              licitacoesFiltradas.map((licitacao) => (
                <div key={licitacao.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                  <h2 className="text-xl font-bold text-blue-800 mb-3">{licitacao.titulo}</h2>

                  {/* ↓ formatarDescricao transforma o JSON em texto legível */}
                  <p className="text-slate-600 mb-5 text-sm leading-relaxed whitespace-pre-wrap">
                    {formatarDescricao(licitacao.descricao)}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 font-medium">Valor Estimado:</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                        {/* AQUI ESTÁ A CORREÇÃO ANTI-ERRO */}
                        {licitacao.valor_estimado != null 
                          ? `R$ ${licitacao.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                          : 'Valor não informado'}
                      </span>
                    </div>

                    {licitacao.link_edital &&
                      licitacao.link_edital !== 'Sem link' &&
                      licitacao.link_edital !== 'EMPTY' && (
                        <a
                          href={licitacao.link_edital}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Acessar Edital
                        </a>
                      )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}