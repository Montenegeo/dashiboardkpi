"""
Montenegro Industria LTDA — Configuração central do serviço
Credenciais reais ficam no arquivo .env (nunca sobe para o GitHub)
"""

import os

# Caminhos absolutos
BASE_DIR   = "/Users/lucasmmonte/Montenegro"
DADOS_DIR  = f"{BASE_DIR}/dados"
HIST_DIR   = f"{DADOS_DIR}/historico"
SEM_DIR    = f"{DADOS_DIR}/semanal"
LOG_DIR    = f"{BASE_DIR}/logs"

# Apps Script — cole a URL após implantar
APPS_URL = os.getenv("APPS_URL", "")

# Green API — WhatsApp
WA_API_URL  = os.getenv("GREEN_API_URL",      "https://7107.api.greenapi.com")
WA_INSTANCE = os.getenv("GREEN_ID_INSTANCE",  "")
WA_TOKEN    = os.getenv("GREEN_API_TOKEN",     "")

# Destinatários dos alertas (separados por vírgula no .env)
DESTINATARIOS = [n.strip() for n in os.getenv("WA_DESTINATARIOS", "").split(",") if n.strip()]

# Metas e thresholds
ROAS_SHOPEE_MIN   = 15
ROAS_SHOPEE_META  = 20
ROAS_META_MIN     = 5
SHOPEE_SALDO_MIN  = 80.0

# Horário do resumo diário (18h)
HORA_RESUMO = 18

# Intervalo de polling (60s — smart: só coleta dados se houver novo submit)
INTERVALO_COLETA = 60
