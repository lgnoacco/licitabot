import os
from dotenv import load_dotenv
from supabase import create_client

# 1. Carrega as chaves secretas do ficheiro .env
load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

# 2. Efetua a ligação ao Supabase
supabase = create_client(url, key)

def testar():
    print("A iniciar o teste de ligação com a base de dados...")
    
    # 3. Cria um dado falso de licitação para testar
    dados_teste = {
        "titulo": "Licitação Teste - Papel A4",
        "descricao": "O sistema ligou com sucesso ao Supabase!",
        "valor_estimado": 1500.50,
        "link_edital": "https://google.com"
    }
    
    try:
        # 4. Tenta inserir na tabela 'licitacoes'
        resposta = supabase.table("licitacoes").insert(dados_teste).execute()
        print("\n✅ Sucesso absoluto! O dado foi guardado na base de dados.")
        print("Veja o retorno do Supabase:", resposta.data)
    except Exception as e:
        print(f"\n❌ Ups, deu erro: {e}")

if __name__ == "__main__":
    testar()