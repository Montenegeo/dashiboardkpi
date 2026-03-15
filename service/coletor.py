"""
Montenegro — Coleta com smart polling: só busca dados quando há novo submit
"""

import json
import logging
import requests
from datetime import datetime
from pathlib import Path
from config import APPS_URL, DADOS_DIR, HIST_DIR

log = logging.getLogger("coletor")

_ultimo_submit_visto: str = ""


def _checar_novo_submit() -> bool:
    """Consulta ?action=lastSubmit — True se houve envio novo."""
    global _ultimo_submit_visto
    if not APPS_URL:
        return False
    try:
        r = requests.get(f"{APPS_URL}?action=lastSubmit", timeout=10, allow_redirects=True)
        if r.status_code == 200:
            ts = r.json().get("last_submit", "")
            if ts and ts != _ultimo_submit_visto:
                _ultimo_submit_visto = ts
                log.info(f"Novo envio detectado: {ts}")
                return True
    except Exception as e:
        log.debug(f"Erro ao checar lastSubmit: {e}")
    return False


def coletar(forcar=False):
    """Busca dados completos. Só recarrega se houver novo submit (smart polling)."""
    if not APPS_URL:
        log.warning("APPS_URL não configurada — configure em service/config.py")
        return None

    if not forcar and not _checar_novo_submit():
        log.debug("Sem novos envios — usando cache local")
        return carregar_ultimo()

    try:
        r = requests.get(APPS_URL, timeout=30, allow_redirects=True)
        if r.status_code == 200:
            dados = r.json()
            salvar(dados)
            return dados
        log.warning(f"Apps Script retornou {r.status_code}")
    except Exception as e:
        log.error(f"Erro ao coletar dados: {e}")
    return None


def salvar(dados: dict):
    """Salva dashboard.json e histórico diário."""
    hoje = datetime.now().strftime("%Y-%m-%d")
    Path(DADOS_DIR).mkdir(parents=True, exist_ok=True)
    Path(HIST_DIR).mkdir(parents=True, exist_ok=True)

    with open(Path(DADOS_DIR) / "dashboard.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

    with open(Path(HIST_DIR) / f"{hoje}.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

    log.info(f"Salvo → dashboard.json + historico/{hoje}.json")


def carregar_ultimo():
    """Último JSON salvo (fallback)."""
    atual = Path(DADOS_DIR) / "dashboard.json"
    if atual.exists():
        with open(atual, encoding="utf-8") as f:
            return json.load(f)
    return None
