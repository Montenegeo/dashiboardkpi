import os
import webbrowser
import sys
from datetime import datetime
try:
    from apify_client import ApifyClient
except ImportError:
    print("ERRO: Instale a lib: pip install apify-client")
    sys.exit(1)

# CONFIGURAÇÕES
APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
LOCATION    = "Espírito Santo, Brazil"
MAX_LEADS   = 30

LISTAS_ALVO = {
    "1_Temperos_Condimentos": ["fabrica de tempero", "marca de tempero", "tempero artesanal", "industria de condimentos"],
    "2_Bebidas_Sucos": ["fabrica de suco", "marca de suco", "agua de coco fabricante", "kombucha fabricante"],
    "3_Saneantes_Limpeza": ["fabrica de saneantes", "industria de produtos de limpeza", "fabrica de desengraxante"]
}

def buscar_google_maps(client, keywords, lista_nome):
    print(f"\n[APIFY] Buscando leads: {lista_nome}...")
    # Usando o Actor oficial da Apify
    run_input = {
        "searchStringsArray": keywords,
        "locationQuery": LOCATION,
        "maxCrawledPlacesPerSearch": MAX_LEADS,
        "language": "pt-BR",
    }
    try:
        # Google Maps Scraper (compass/crawler-google-places)
        run = client.actor("compass/crawler-google-places").call(run_input=run_input)
        if not run:
            print("        ✗ Erro: Actor não iniciou.")
            return []

        dataset_id = run["defaultDatasetId"]
        print(f"        ✓ Sucesso! Baixando dados...")
        return client.dataset(dataset_id).list_items().items
    except Exception as e:
        print(f"        ✗ Erro na API: {e}")
        return []

def gerar_html(nome_lista, leads):
    if not leads: return
    # Filtra e remove duplicados
    unicos = {l.get("title"): l for l in leads if l.get("title") and (l.get("phone") or l.get("website"))}.values()

    linhas = ""
    for l in unicos:
        nome, fone = l.get("title"), l.get("phone", "")
        site, maps = l.get("website", ""), l.get("url", "")
        zap = f'<a href="https://wa.me/55{"".join(filter(str.isdigit, fone))}" target="_blank">WhatsApp</a>' if fone else "-"

        linhas += f"<tr><td><b>{nome}</b><br><small>{l.get('categoryName','')}</small></td><td>{l.get('address','')}</td><td>{fone}<br>{zap}</td><td><a href='{site}'>Site</a> | <a href='{maps}'>Maps</a></td></tr>"

    html = f"<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;padding:20px'><h2>{nome_lista}</h2><table border='1' cellpadding='10' style='border-collapse:collapse;width:100%'><thead><tr style='background:#eee'><th>Empresa</th><th>Endereço</th><th>Contato</th><th>Links</th></tr></thead><tbody>{linhas}</tbody></table></body></html>"

    filename = f"leads_{nome_lista}.html"
    with open(filename, "w", encoding="utf-8") as f: f.write(html)
    print(f"[HTML] Gerado: {filename}")
    webbrowser.open(f"file://{os.path.abspath(filename)}")

if __name__ == "__main__":
    client = ApifyClient(APIFY_TOKEN)
    for nome, k in LISTAS_ALVO.items():
        gerar_html(nome, buscar_google_maps(client, k, nome))
