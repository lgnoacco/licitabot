import os
import time
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Carrega as configurações
load_dotenv()
url_supabase = os.environ.get("SUPABASE_URL")
key_supabase = os.environ.get("SUPABASE_SERVICE_KEY")

if not url_supabase or not key_supabase:
    print("❌ Erro: SUPABASE_URL ou SUPABASE_SERVICE_KEY não encontradas no .env")
    exit()

supabase: Client = create_client(url_supabase, key_supabase)

def fazer_faxina_no_banco(dias_de_validade=30):
    """Apaga licitações antigas para não lotar o plano gratuito do Supabase"""
    print(f"\n🧹 Iniciando faxina: removendo editais com mais de {dias_de_validade} dias...")
    data_limite = (datetime.now() - timedelta(days=dias_de_validade)).isoformat()

    try:
        resposta = supabase.table("licitacoes").delete().lt("created_at", data_limite).execute()
        print(f"✅ Faxina concluída! {len(resposta.data)} itens removidos.")
    except Exception as e:
        print(f"⚠️ Aviso na faxina: {e}")

def buscar_pagina(url, headers, max_tentativas=3):
    """Busca uma página com retry e backoff exponencial"""
    for tentativa in range(max_tentativas):
        try:
            resposta = requests.get(url, headers=headers, timeout=30)  # ✅ 30s
            resposta.raise_for_status()
            return resposta.json()
        except requests.exceptions.Timeout:
            print(f"⏱️ Timeout na tentativa {tentativa + 1}/{max_tentativas}...")
            if tentativa < max_tentativas - 1:
                time.sleep(2 ** (tentativa + 1))  # 2s, 4s, 8s
        except requests.exceptions.RequestException as e:
            print(f"❌ Erro na requisição: {e}")
            if tentativa < max_tentativas - 1:
                time.sleep(2 ** (tentativa + 1))
    return None

def garimpar_licitacoes(max_paginas=5):
    print("\n🎯 Buscando novos editais no PNCP...")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    }

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

        print(f"📡 Buscando página {pagina}...")
        dados = buscar_pagina(url_governo, headers)

        if not dados:
            print(f"❌ Página {pagina} falhou após todas as tentativas, encerrando.")
            break

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
                "municipio": item.get("unidadeOrgao", {}).get("municipioNome"),
                "texto_bruto": item.get("objetoCompra"),
                "fonte": "pncp",
                "status": "raw"
            })

        try:
            supabase.table("licitacoes").upsert(lote, on_conflict="numero_controle").execute()
            total_salvo += len(lote)
            print(f"✅ Página {pagina}: {len(lote)} licitações salvas")
        except Exception as e:
            print(f"❌ Erro ao salvar página {pagina}: {e}")

        # Pequena pausa entre páginas pra não sobrecarregar a API do governo
        time.sleep(1)

    print(f"\n🚀 Total sincronizado: {total_salvo} licitações")

if __name__ == "__main__":
    fazer_faxina_no_banco(dias_de_validade=30)  # ✅ 30 dias (era 2, muito agressivo)
    garimpar_licitacoes()