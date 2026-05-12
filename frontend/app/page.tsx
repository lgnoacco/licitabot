"use client";

import { useState, useEffect } from 'react';
import { supabase } from '../src/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO TRADUTORA
function formatarDescricao(texto: string): string {
  if (!texto) return '';

  try {
    const obj = JSON.parse(texto);
      if (typeof obj === 'object' && obj !== null) {
      if (obj.texto_bruto && typeof obj.texto_bruto === 'string') return obj.texto_bruto;
      if (obj.descricao && typeof obj.descricao === 'string') return obj.descricao;
      if (obj.nome     && typeof obj.nome     === 'string') return obj.nome;
      const primeiroValorString = Object.values(obj).find((v) => typeof v === 'string');
      if (primeiroValorString) return primeiroValorString as string;
    }
  } catch {
    // Não é JSON — devolve o texto como veio
  }

  return texto;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DAS CATEGORIAS (Você pode alterar ou adicionar mais aqui)
const CATEGORIAS = [
  { id: 'Todas', label: 'Todas as Categorias', palavrasChave: [] },
  { id: 'Tecnologia', label: '💻 Tecnologia e TI', palavrasChave: ['tecnologia', 'software', 'computador', 'informática', 'ti', 'sistema', 'notebook'] },
  { id: 'Saúde', label: '⚕️ Saúde e Insumos', palavrasChave: ['saúde', 'médico', 'hospital', 'remédio', 'clínica', 'sus', 'medicamento'] },
  { id: 'Veículos', label: '🚗 Veículos e Frota', palavrasChave: ['veículo', 'frota', 'carro', 'emplacamento', 'mecânica', 'pneu', 'motocicleta', 'peças'] },
  { id: 'Educação', label: '📚 Educação', palavrasChave: ['educação', 'escola', 'ensino', 'didático', 'professor', 'curso'] },
  { id: 'Serviços', label: '🛠️ Serviços Gerais', palavrasChave: ['limpeza', 'manutenção', 'obra', 'reforma', 'conservação', 'zeladoria'] },
];

export default function Home() {
  const [licitacoes, setLicitacoes] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  
  // NOVO ESTADO: Guarda a categoria que o usuário selecionou no menu
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('Todas');
  
  const [carregando, setCarregando] = useState(true);
  const [editalAberto, setEditalAberto] = useState<any | null>(null);

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

  const termosBusca = busca.toLowerCase().trim().split(/\s+/);

  const licitacoesFiltradas = licitacoes.filter((licitacao) => {
    const titulo = (licitacao.titulo || '').toLowerCase();
    const descricao = formatarDescricao(licitacao.texto_bruto || '').toLowerCase();
    const orgao = (licitacao.orgao || '').toLowerCase();
    
    const textoCompleto = `${titulo} ${descricao} ${orgao}`;

    // 1. Filtro da Barra de Pesquisa (Texto)
    const atendeBusca = termosBusca.length === 1 && termosBusca[0] === ''
      ? true
      : termosBusca.every(termo => textoCompleto.includes(termo));

    // 2. Filtro do Menu de Categoria (A Mágica)
    let atendeCategoria = true;
    if (categoriaSelecionada !== 'Todas') {
      const configCategoria = CATEGORIAS.find(c => c.id === categoriaSelecionada);
      if (configCategoria && configCategoria.palavrasChave.length > 0) {
        // Verifica se pelo menos UMA das palavras-chave da categoria existe no edital
        atendeCategoria = configCategoria.palavrasChave.some(palavra => textoCompleto.includes(palavra));
      }
    }

    // A licitação só aparece se passar nos dois filtros
    return atendeBusca && atendeCategoria;
  });

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans relative">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Painel LicitaBot 🤖</h1>
            <p className="text-slate-500 mt-2">Suas últimas oportunidades de Pregão Eletrônico capturadas.</p>
          </div>

          {/* ÁREA DE FILTROS: Busca + Categoria */}
          <div className="flex flex-col md:flex-row gap-4">
            
            {/* Barra de Pesquisa */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Pesquise por palavras-chave, órgão, município..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full p-4 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-700"
              />
            </div>

            {/* Seletor de Categorias */}
            <div className="md:w-72 shrink-0 relative">
              <select
                value={categoriaSelecionada}
                onChange={(e) => setCategoriaSelecionada(e.target.value)}
                className="w-full p-4 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none transition-all text-slate-700 bg-white appearance-none cursor-pointer font-medium"
              >
                {CATEGORIAS.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
              {/* Ícone customizado de setinha pro dropdown não ficar com cara de sistema velho */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

          </div>
        </header>

        {carregando ? (
          <p className="text-slate-500 font-medium">Carregando licitações do banco de dados...</p>
        ) : (
          <div className="grid gap-6">
            {licitacoesFiltradas.length === 0 ? (
              <div className="bg-white p-10 rounded-xl border border-slate-200 text-center">
                <p className="text-slate-500 text-lg">Nenhuma licitação encontrada para os filtros selecionados.</p>
              </div>
            ) : (
              licitacoesFiltradas.map((licitacao) => {
                const cidade = licitacao.cidade || licitacao.municipio;
                const estado = licitacao.estado || licitacao.uf;
                const localizacao = [cidade, estado].filter(Boolean).join(' - ');

                return (
                  <div key={licitacao.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow flex flex-col">
                    
                    <h2 className="text-xl font-bold text-blue-800 mb-4">{licitacao.titulo}</h2>

                    <div className="flex flex-col gap-2 mb-4">
                      {licitacao.orgao && (
                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className="font-semibold tracking-wide">{licitacao.orgao}</span>
                        </div>
                      )}

                      {localizacao && (
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="font-medium tracking-wide">{localizacao}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 font-medium">Valor Estimado:</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                          {licitacao.valor_estimado != null 
                            ? `R$ ${licitacao.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                            : 'Valor não informado'}
                        </span>
                      </div>

                      <button
                        onClick={() => setEditalAberto(licitacao)}
                        className="text-sm font-semibold bg-slate-900 text-white px-5 py-2.5 rounded-lg hover:bg-slate-800 transition-colors"
                      >
                        Ver Detalhes do Edital
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {editalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-200">
            
            <div className="sticky top-0 bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-start rounded-t-2xl z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 pr-8">{editalAberto.titulo}</h2>
                
                <div className="flex flex-col gap-1.5 mt-3">
                  {editalAberto.orgao && (
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="font-semibold tracking-wide">{editalAberto.orgao}</span>
                    </div>
                  )}

                  {(editalAberto.cidade || editalAberto.municipio || editalAberto.estado || editalAberto.uf) && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-medium tracking-wide">
                        {[editalAberto.cidade || editalAberto.municipio, editalAberto.estado || editalAberto.uf].filter(Boolean).join(' - ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={() => setEditalAberto(null)}
                className="text-slate-400 hover:text-slate-700 p-2 -mr-2 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-8">
              <div className="mb-10">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Descrição Completa</h3>
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {formatarDescricao(editalAberto.texto_bruto)}
                </div>
              </div>
            </div>
            
            {editalAberto.link_edital && editalAberto.link_edital !== 'Sem link' && editalAberto.link_edital !== 'EMPTY' && (
              <div className="bg-slate-50 px-8 py-6 rounded-b-2xl border-t border-slate-100 flex justify-end">
                <a
                  href={editalAberto.link_edital}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                >
                  Acessar Fonte Oficial
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}