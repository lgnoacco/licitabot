import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Carrega as configurações
load_dotenv()
url_supabase = os.environ.get("SUPABASE_URL")
# Use a SERVICE_KEY para ter permissão de deletar e inserir sem restrições
key_supabase = os.environ.get("SUPABASE_SERVICE_KEY") 

if not url_supabase or not key_supabase:
    print("❌ Erro: SUPABASE_URL ou SUPABASE_SERVICE_KEY não encontradas no .env")
    exit()

supabase: Client = create_client(url_supabase, key_supabase)

def fazer_faxina_no_banco(dias_de_validade=2):
    """ Apaga licitações antigas para não lotar o plano gratuito do Supabase """
    print(f"\n🧹 Iniciando faxina: removendo editais com mais de {dias_de_validade} dias...")
    data_limite = (datetime.now() - timedelta(days=dias_de_validade)).isoformat()
    
    try:
        resposta = supabase.table("licitacoes").delete().lt("created_at", data_limite).execute()
        print(f"✅ Faxina concluída! {len(resposta.data)} itens removidos.")
    except Exception as e:
        print(f"⚠️ Aviso na faxina: {e}")

def garimpar_licitacoes():
    print("\n🎯 Buscando novos editais no PNCP (Pregão Eletrônico)...")

    hoje = datetime.now()
    data_inicial = (hoje - timedelta(days=3)).strftime('%Y%m%d')
    data_final = hoje.strftime('%Y%m%d')

    url_governo = (
        f"https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
        f"?dataInicial={data_inicial}&dataFinal={data_final}"
        "&codigoModalidadeContratacao=8&pagina=1"
    )

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }

    try:
        resposta = requests.get(url_governo, headers=headers, timeout=15)
        resposta.raise_for_status()
        dados = resposta.json()
        
        licitacoes = dados.get("data", [])
        if not licitacoes:
            print("📭 Nenhuma licitação nova encontrada.")
            return

        print(f"📦 Processando {len(licitacoes)} editais...")

        lote_para_salvar = []

        for item in licitacoes:
            # Mapeamento para o novo Schema do Banco de Dados
            dado_tratado = {
                "numero_controle": item.get("numeroControlePNCP"), # ID Único do governo
                "titulo": item.get("objetoCompra", "Sem título")[:255],
                "orgao": item.get("orgaoEntidade", {}).get("razaoSocial", "Não informado"),
                "valor_estimado": item.get("valorTotalEstimado", 0.0),
                "link_edital": item.get("linkSistemaOrigem"),
                "uf": item.get("unidadeOrgao", {}).get("ufSigla"),
                "municipio": item.get("unidadeOrgao", {}).get("nomeUnidade"),
                "texto_bruto": item.get("objetoCompra"), # Texto que a IA vai ler
                "fonte": "pncp",
                "status": "raw" # Essencial para disparar o Webhook da IA
            }
            lote_para_salvar.append(dado_tratado)

        # Usamos UPSERT em vez de INSERT. 
        # Se o numero_controle já existir, ele só atualiza (evita erro de duplicata)
        if lote_para_salvar:
            supabase.table("licitacoes").upsert(lote_para_salvar, on_conflict="numero_controle").execute()
            print(f"🚀 {len(lote_para_salvar)} licitações sincronizadas com sucesso!")

    except Exception as e:
        print(f"❌ Erro no garimpo: {e}")

if __name__ == "__main__":
    # 1. Limpa o que for muito velho (2 dias)
    fazer_faxina_no_banco(dias_de_validade=2)
    
    # 2. Busca as novas
    garimpar_licitacoes()   