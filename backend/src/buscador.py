import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client

# 1. Carrega as senhas e conecta ao Supabase
load_dotenv()
url_supabase = os.environ.get("SUPABASE_URL")
key_supabase = os.environ.get("SUPABASE_KEY")
supabase = create_client(url_supabase, key_supabase)


def fazer_faxina_no_banco(dias_de_validade=1):
    print(f"\n🧹 Iniciando a faxina: procurando licitações com mais de {dias_de_validade} dia(s)...")
    
    # Calcula qual é a data limite de corte
    data_limite = (datetime.now() - timedelta(days=dias_de_validade)).isoformat()
    
    try:
        # Pede ao Supabase para deletar tudo onde a data de criação ('created_at') for menor ('lt') que a data limite
        resposta = supabase.table("licitacoes").delete().lt("created_at", data_limite).execute()
        
        # O Supabase retorna os dados apagados, então podemos contar quantos foram
        quantidade_apagada = len(resposta.data) if resposta.data else 0
        print(f"✅ Faxina concluída! {quantidade_apagada} licitação(ões) antiga(s) apagada(s).")
        
    except Exception as e:
        print(f"❌ Erro ao limpar o banco: {e}")

def garimpar_licitacoes():
    print("Buscando licitações de Pregão Eletrônico no PNCP...")
    print("Aguardando resposta do servidor (limite de 15 segundos)...")

    url_governo = (
        "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
        "?dataInicial=20260320&dataFinal=20260324"
        "&codigoModalidadeContratacao=8&pagina=1"
    )

    # Máscara de navegador
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }

    try:
        resposta = requests.get(url_governo, headers=headers, timeout=15)

        if resposta.status_code != 200:
            print(f"\n⚠️ O servidor do governo falhou (Erro {resposta.status_code}).")
            return

        if not resposta.text.strip():
            print("\n❌ O servidor retornou uma resposta vazia.")
            return

        content_type = resposta.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            print(f"\n❌ Resposta não é JSON. Content-Type recebido: {content_type}")
            return

        dados_brutos = resposta.json()

        if "data" not in dados_brutos or len(dados_brutos["data"]) == 0:
            print("\nNenhuma licitação encontrada para esses dias.")
            return

        licitacoes_encontradas = dados_brutos["data"]
        quantidade = len(licitacoes_encontradas)
        print(f"\n🎯 Sucesso! Encontrei {quantidade} licitações na página 1. Processando...")

        # Lista vazia que vai guardar todas as licitações tratadas
        lote_para_salvar = []

        # O LAÇO MÁGICO: Passa por cada licitação da lista do governo
        for item in licitacoes_encontradas:
            titulo = item.get("objetoCompra", "Sem título")
            
            # Limpa o dado individual
            dado_limpo = {
                "titulo": titulo,
                "descricao": item.get("amparoLegal", "Sem descrição"),
                "valor_estimado": item.get("valorTotalEstimado", 0.0),
                "link_edital": item.get("linkSistemaOrigem", "Sem link"),
            }
            
            # Adiciona na nossa lista de lote
            lote_para_salvar.append(dado_limpo)

        # 4. Salva o LOTE INTEIRO no Supabase de uma vez só!
        if lote_para_salvar:
            supabase.table("licitacoes").insert(lote_para_salvar).execute()
            print(f"✅ {len(lote_para_salvar)} licitações salvas no banco de dados com sucesso!")

    except requests.exceptions.Timeout:
        print("\n❌ Demorou demais! O servidor do Governo está muito lento.")
    except Exception as e:
        print(f"\n❌ Erro inesperado: {type(e).__name__}: {e}")

if __name__ == "__main__":
    # 1. Faz a limpeza primeiro (apaga tudo que tem mais de 1 dia)
    fazer_faxina_no_banco(dias_de_validade=1)
    
    # 2. Depois busca as novas licitações
    garimpar_licitacoes()

    
    