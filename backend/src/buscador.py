import os
from wsgiref import headers
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

def garimpar_licitacoes(max_paginas=5):
    print("\n🎯 Buscando novos editais no PNCP...")

    hoje = datetime.now()
    data_inicial = (hoje - timedelta(days=3)).strftime('%Y%m%d')
    data_final = hoje.strftime('%Y%m%d')

    total_salvo = 0

    for pagina in range(1, max_paginas + 1):
        url_governo = (
            f"https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
            f"?dataInicial={data_inicial}&dataFinal={data_final}"
            f"&codigoModalidadeContratacao=8&pagina={pagina}&tamanhoPagina=50"
        )

        try:
            resposta = requests.get(url_governo, headers=headers, timeout=15)
            resposta.raise_for_status()
            dados = resposta.json()

            licitacoes = dados.get("data", [])
            if not licitacoes:
                print(f"📭 Página {pagina} vazia, encerrando.")
                break

            lote = []
            for item in licitacoes:
                lote.append({
                    "numero_controle": item.get("numeroControlePNCP"),
                    "titulo": item.get("objetoCompra", "Sem título")[:255],
                    "orgao": item.get("orgaoEntidade", {}).get("razaoSocial", "Não informado"),
                    "valor_estimado": item.get("valorTotalEstimado", 0.0),
                    "link_edital": item.get("linkSistemaOrigem"),
                    "uf": item.get("unidadeOrgao", {}).get("ufSigla"),
                    "municipio": item.get("unidadeOrgao", {}).get("municipioNome"),  # ✅ corrigido
                    "texto_bruto": item.get("objetoCompra"),
                    "fonte": "pncp",
                    "status": "raw"
                })

            supabase.table("licitacoes").upsert(lote, on_conflict="numero_controle").execute()
            total_salvo += len(lote)
            print(f"✅ Página {pagina}: {len(lote)} licitações salvas")

        except Exception as e:
            print(f"❌ Erro na página {pagina}: {e}")
            break

    print(f"\n🚀 Total sincronizado: {total_salvo} licitações")

if __name__ == "__main__":
    # 1. Limpa o que for muito velho (2 dias)
    fazer_faxina_no_banco(dias_de_validade=2)
    
    # 2. Busca as novas
    garimpar_licitacoes()   