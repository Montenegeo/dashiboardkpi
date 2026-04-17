// ════════════════════════════════════════════════════════════════
// Montenegro Industria LTDA — Apps Script
//
// COMO USAR:
// 1. Acesse script.google.com → Novo projeto
// 2. Cole todo este código → Salve com Ctrl+S
// 3. Implantar → Nova implantação → App da Web
//    → Executar como: Eu | Acesso: Qualquer pessoa
// 4. Copie a URL → cole no dashboard.html (variável APPS_URL)
// 5. Execute configurarTriggers() UMA VEZ para ativar automações
// ════════════════════════════════════════════════════════════════

// ── Versão do script (muda a cada deploy para confirmar) ──────
const SCRIPT_VERSION = '2026-03-23-v9-pwa';

// ── Chave admin para gerenciar estoquistas ─────────────────────
const ADMIN_KEY = 'mnt@admin2026';

// ── Inicializar usuários (rodar UMA vez no editor do GAS) ────
// Formato: { 'Nome do Usuário': 'senha123' }
function initEstoquistas() {
  const usuarios = {
    'Lucas Montenegro': 'ADM333@',
    'Operador':         'MDAA22!',
    'Gestor':           'DM166H1'
  };
  PropertiesService.getScriptProperties().setProperty('usuarios', JSON.stringify(usuarios));
  Logger.log('Usuários configurados: ' + Object.keys(usuarios).join(', '));
}

// ── IDs das planilhas ─────────────────────────────────────────
const IDS = {
  producao:         '1fgNeGLEf2fcg_X-loxkVHAmjxyjLECofK18DUMkWskk',
  expedicao:        '1iF_XdKdr9jC4wxqHs7Lm8XEAIa9yeAKkbEoHktiFUGo',
  reuniao:          '1Rpj4ZrYcv2-9tPNNXFmDD7-YNZDttzG5Mp66uoacVZ4',
  devolucoes:       '1ZFK2pmper_f-jg3FaZNrU3JPbawEIrsWcYGK-GypiRc',
  prospeccao:       '', // Cole o ID da planilha do form de prospecção aqui
  inventario_lidiane: '', // Cole o ID da planilha do form de inventário da Lidiane aqui
  rastreios:        ''  // Cole o ID da planilha de respostas do Google Form de amostras aqui
};

const GIDS = { producao: 729143139, expedicao: 907565730 };

// ── Green API — WhatsApp ──────────────────────────────────────
const WA = {
  url:      'https://7107.api.greenapi.com',
  instance: '7107547894',
  token:    '1c50f1b9d9be4b2db87dc3c0ba2e7c451ea1d8f81a8d489eb3'
};

const DESTINATARIOS = [
  '5527996461883' // Lucas Montenegro
];

// ── Gestão Click API ──────────────────────────────────────────
const GC = {
  url:    'https://api.gestaoclick.com',
  token:  'ce1b0ea8a6b55279c314c1b42575901635bb0fdd',
  secret: '8d6db29f17cd1450b6db9b472e49103e855046d1'
};

// Metas para alertas
const METAS = {
  roas_shopee_min: 15,
  roas_shopee_meta: 20,
  roas_meta_min: 5,
  shopee_saldo_alerta: 80
};

// ── Gestão Click — busca dados e salva em cache ───────────────
function syncGestaoClick() {
  try {
    const headers = {
      'access_token':        GC.token,
      'secret_access_token': GC.secret,
      'Content-Type':        'application/json'
    };

    const hoje    = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    const iniMes  = Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'America/Sao_Paulo', 'yyyy-MM-dd');

    // ── Vendas do mês ────────────────────────────────────────
    const resVendas = UrlFetchApp.fetch(
      `${GC.url}/vendas?data_inicio=${iniMes}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const vendas = resVendas.getResponseCode() === 200
      ? (JSON.parse(resVendas.getContentText()).data || [])
      : [];

    const pedidosMes  = vendas.length;
    const receitaMes  = vendas.reduce((s, v) => s + gcNum(v.valor_total), 0);
    const ticketMedio = pedidosMes > 0 ? receitaMes / pedidosMes : 0;

    // ── Vendas de hoje (atacado do dia) ──────────────────────
    const resVendasHoje = UrlFetchApp.fetch(
      `${GC.url}/vendas?data_inicio=${hoje}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const vendasHoje  = resVendasHoje.getResponseCode() === 200
      ? (JSON.parse(resVendasHoje.getContentText()).data || [])
      : [];
    const pedidosHoje = vendasHoje.length;
    const receitaHoje = vendasHoje.reduce((s, v) => s + gcNum(v.valor_total), 0);

    // Pedidos inviáveis e cancelados hoje
    const inviaveisHoje  = vendasHoje.filter(v => String(v.status||'').toLowerCase().includes('inviav')).length;
    const canceladosHoje = vendasHoje.filter(v => String(v.status||'').toLowerCase().includes('cancel')).length;

    // Total de unidades vendidas no mês (soma itens de cada pedido)
    const unidadesMes = vendas.reduce((s, v) => {
      const itens = v.itens || [];
      if (itens.length > 0) return s + itens.reduce((si, i) => si + gcNum(i.quantidade || 1), 0);
      return s + gcNum(v.quantidade_itens || 1);
    }, 0);

    // Produtos mais/menos vendidos no mês
    const prodContagem = {};
    vendas.forEach(v => {
      const itens = v.itens || [];
      itens.forEach(item => {
        const nome = (item.nome || item.produto || item.descricao || '').split(' ').slice(0,4).join(' ');
        if (!nome) return;
        prodContagem[nome] = (prodContagem[nome] || 0) + gcNum(item.quantidade || 1);
      });
    });
    const prodOrdenados = Object.entries(prodContagem).sort((a, b) => b[1] - a[1]);
    const maisVendido  = prodOrdenados[0]
      ? `${prodOrdenados[0][0]} (${Math.round(prodOrdenados[0][1])} un)` : '—';
    const menosVendido = prodOrdenados.length > 1
      ? `${prodOrdenados[prodOrdenados.length-1][0]} (${Math.round(prodOrdenados[prodOrdenados.length-1][1])} un)` : '—';

    // ── Produtos / Estoque ───────────────────────────────────
    const resProd = UrlFetchApp.fetch(
      `${GC.url}/produtos?limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const produtos = resProd.getResponseCode() === 200
      ? (JSON.parse(resProd.getContentText()).data || [])
      : [];

    const totalSkus       = produtos.length;
    const zerados         = produtos.filter(p => gcNum(p.estoque) <= 0);
    const criticos        = produtos.filter(p => gcNum(p.estoque) > 0 && gcNum(p.estoque) <= 10);
    const inventarioCusto = produtos
      .filter(p => gcNum(p.estoque) > 0)
      .reduce((s, p) => s + gcNum(p.valor_custo) * gcNum(p.estoque), 0);

    const zeradosNomes  = zerados.slice(0, 5).map(p => p.nome || '?');
    const criticosNomes = criticos.slice(0, 5).map(p => p.nome || '?');

    // ── Recebimentos do mês ──────────────────────────────────
    const resRec = UrlFetchApp.fetch(
      `${GC.url}/recebimentos?data_inicio=${iniMes}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const recebimentos = resRec.getResponseCode() === 200
      ? (JSON.parse(resRec.getContentText()).data || [])
      : [];

    const recebimentosMes = recebimentos.reduce((s, r) => s + gcNum(r.valor_total || r.valor), 0);
    const recebidoMes     = recebimentos.filter(r => String(r.liquidado) === '1').reduce((s, r) => s + gcNum(r.valor_total || r.valor), 0);

    // ── Pagamentos do mês ────────────────────────────────────
    const resPag = UrlFetchApp.fetch(
      `${GC.url}/pagamentos?data_inicio=${iniMes}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const pagamentos = resPag.getResponseCode() === 200
      ? (JSON.parse(resPag.getContentText()).data || [])
      : [];

    const pagamentosMes = pagamentos.reduce((s, p) => s + gcNum(p.valor_total || p.valor), 0);
    const pagoMes       = pagamentos.filter(p => String(p.liquidado) === '1').reduce((s, p) => s + gcNum(p.valor_total || p.valor), 0);

    // ── Recebimentos de hoje ──────────────────────────────────────
    const resRecHoje = UrlFetchApp.fetch(
      `${GC.url}/recebimentos?data_inicio=${hoje}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const recebimentosHoje = resRecHoje.getResponseCode() === 200
      ? (JSON.parse(resRecHoje.getContentText()).data || [])
      : [];
    const recebidoHoje = recebimentosHoje
      .filter(r => String(r.liquidado) === '1')
      .reduce((s, r) => s + gcNum(r.valor_total || r.valor), 0);

    // ── Pagamentos de hoje ────────────────────────────────────────
    const resPagHoje = UrlFetchApp.fetch(
      `${GC.url}/pagamentos?data_inicio=${hoje}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const pagamentosHoje = resPagHoje.getResponseCode() === 200
      ? (JSON.parse(resPagHoje.getContentText()).data || [])
      : [];
    const pagoHoje = pagamentosHoje
      .filter(p => String(p.liquidado) === '1')
      .reduce((s, p) => s + gcNum(p.valor_total || p.valor), 0);

    // ── Monta objeto final ───────────────────────────────────
    const gcData = {
      atualizado_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      vendas: {
        pedidos_mes:      pedidosMes,
        unidades_mes:     Math.round(unidadesMes),
        receita_mes:      Math.round(receitaMes * 100) / 100,
        ticket_medio:     Math.round(ticketMedio * 100) / 100,
        pedidos_hoje:     pedidosHoje,
        receita_hoje:     Math.round(receitaHoje * 100) / 100,
        inviavies_hoje:   inviaveisHoje,
        cancelados_hoje:  canceladosHoje,
        mais_vendido:     maisVendido,
        menos_vendido:    menosVendido
      },
      clientes: {
        // Clientes únicos no mês: contagem de cliente_id distintos nas vendas
        novos_mes: (function() {
          const ids = new Set(vendas.map(v => String(v.cliente_id || v.cliente || '')).filter(Boolean));
          return ids.size;
        })()
      },
      estoque: {
        total_skus:       totalSkus,
        zerados:          zerados.length,
        criticos:         criticos.length,
        inventario_custo: Math.round(inventarioCusto * 100) / 100,
        zerados_nomes:    zeradosNomes,
        criticos_nomes:   criticosNomes,
        produtos_raw:     produtos.slice(0, 200).map(p => ({
          id:          String(p.id||p.codigo||p.nome||''),
          nome:        p.nome||'',
          estoque:     gcNum(p.estoque),
          valor_custo: gcNum(p.valor_custo)
        }))
      },
      financeiro: {
        recebimentos_mes: Math.round(recebimentosMes * 100) / 100,
        recebido_mes:     Math.round(recebidoMes * 100) / 100,
        pagamentos_mes:   Math.round(pagamentosMes * 100) / 100,
        pago_mes:         Math.round(pagoMes * 100) / 100,
        saldo_mes:        Math.round((recebidoMes - pagoMes) * 100) / 100
      },
      saldo_hoje: {
        receita_atacado: Math.round(receitaHoje * 100) / 100,
        recebido:        Math.round(recebidoHoje * 100) / 100,
        pago:            Math.round(pagoHoje * 100) / 100,
        saldo:           Math.round((receitaHoje + recebidoHoje - pagoHoje) * 100) / 100
      }
    };

    // Salva em cache (Script Properties)
    PropertiesService.getScriptProperties().setProperty('gc_cache', JSON.stringify(gcData));
    Logger.log('✅ Gestão Click sync OK — pedidos mês: ' + pedidosMes + ' | inventário: R$' + inventarioCusto.toFixed(2));
    return gcData;

  } catch(e) {
    Logger.log('❌ Gestão Click sync erro: ' + e.message);
    return null;
  }
}

// ── Inventário da Lidiane — verifica se formulário foi preenchido hoje ───────
function checkInventarioLidiane() {
  if (!IDS.inventario_lidiane) return { preenchido: false, quem: '', horario: '' };
  try {
    const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
    const ss   = SpreadsheetApp.openById(IDS.inventario_lidiane);
    const data = ss.getSheets()[0].getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      const ts = data[i][0];
      if (!ts) continue;
      const dataTs = ts instanceof Date
        ? Utilities.formatDate(ts, 'America/Sao_Paulo', 'dd/MM/yyyy')
        : (() => { try { return Utilities.formatDate(new Date(ts), 'America/Sao_Paulo', 'dd/MM/yyyy'); } catch(_) { return ''; } })();
      if (dataTs === hoje) {
        return {
          preenchido: true,
          quem:       String(data[i][1] || 'Lidiane'),
          horario:    ts instanceof Date ? Utilities.formatDate(ts, 'America/Sao_Paulo', 'HH:mm') : ''
        };
      }
    }
    return { preenchido: false, quem: '', horario: '' };
  } catch(e) {
    Logger.log('Inventário Lidiane check erro: ' + e.message);
    return { preenchido: false, quem: '', horario: '' };
  }
}

// Helper: converte valor da API GC (ponto decimal americano "1390.00") para número
function gcNum(val) {
  if (val == null) return 0;
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

// ── Teste manual — rode para validar conexão ──────────────────
function testarGestaoClick() {
  const resultado = syncGestaoClick();
  if (resultado) {
    Logger.log('=== RESULTADO GESTÃO CLICK ===');
    Logger.log(JSON.stringify(resultado, null, 2));
  } else {
    Logger.log('❌ Falha — verifique credenciais e conexão');
  }
}

// ── Monta JSON consolidado (planilhas + Gestão Click) ─────────
function buildJSON() {
  const now  = new Date();
  const hoje = Utilities.formatDate(now, 'America/Sao_Paulo', 'dd/MM/yyyy');

  // Produção — agrupa todos os registros do dia (manhã + tarde + troca de molde)
  const registrosProd = linhasDoDia(IDS.producao, GIDS.producao);
  const turnos = registrosProd.map(r => {
    const gramatura = toNum(r[4]); // col[4] = gramatura em gramas por unidade
    const perdaKg   = toNum(r[6]);
    // Calcula perda_un automaticamente: (perda_kg * 1000) / gramatura
    // Se col[7] tiver valor manual, usa ele; caso contrário calcula
    const perdaUnManual = toNum(r[7]);
    const perdaUn = perdaUnManual > 0
      ? perdaUnManual
      : (gramatura > 0 ? Math.round(perdaKg * 1000 / gramatura) : 0);
    return {
      turno:     String(r[3]||'').replace('da ','').trim(),
      gramatura,
      realizado: toNum(r[5]),
      perda_kg:  perdaKg,
      perda_un:  perdaUn,
      molde:     String(r[8]||''),
      troca:     String(r[9]||'Não'),
      obs:       String(r[10]||'')
    };
  });
  const totalRealizado = turnos.reduce((s, t) => s + t.realizado, 0);
  const totalPerdaKg   = turnos.reduce((s, t) => s + t.perda_kg, 0);
  const totalPerdaUn   = turnos.reduce((s, t) => s + t.perda_un, 0);
  const houveTroca     = turnos.some(t => String(t.troca).toLowerCase() !== 'não' && t.troca !== '');
  const quem           = registrosProd.length > 0 ? String(registrosProd[0][1]||'') : '';

  const expRaw = ultimaLinhaDoDia(IDS.expedicao, GIDS.expedicao);
  const exp    = expRaw || Array(20).fill(''); // vazio se sem preenchimento hoje
  const reu    = ultimaLinha(IDS.reuniao);

  const devSheet = SpreadsheetApp.openById(IDS.devolucoes).getSheets()[0];
  const devRows  = devSheet.getDataRange().getValues().slice(1);
  const devHoje  = devRows.filter(r => String(r[4]).startsWith(hoje.slice(0,5)));

  let prospeccao = { vendedor:'', prospeccoes:0, followups:0, orcamentos:0, valor_fechado:0, obs:'' };
  if (IDS.prospeccao) {
    const pro = ultimaLinha(IDS.prospeccao);
    prospeccao = {
      vendedor: pro[1]||'', prospeccoes: toNum(pro[2]), followups: toNum(pro[3]),
      orcamentos: toNum(pro[4]), valor_fechado: toNum(pro[5]), obs: pro[6]||''
    };
  }

  // Lê cache do Gestão Click (salvo pelo trigger de 10 min)
  let gestaoclick = null;
  try {
    const cached = PropertiesService.getScriptProperties().getProperty('gc_cache');
    if (cached) gestaoclick = JSON.parse(cached);
  } catch(_) {}

  return {
    atualizado_em: Utilities.formatDate(now, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    producao: {
      preenchido_hoje: registrosProd.length > 0,
      quem,
      total_realizado: totalRealizado,
      total_perda_kg:  totalPerdaKg,
      total_perda_un:  totalPerdaUn,
      troca_molde:     houveTroca,
      molde_atual:     turnos.length > 0 ? turnos[0].molde : '',
      gramatura:       turnos.length > 0 ? turnos[0].gramatura : 0,
      obs_geral:       turnos.map(t => t.obs).filter(Boolean).join(' | '),
      turnos,           // array: [{turno, realizado, perda_kg, molde, troca, obs}, ...]
      // campos legados para compatibilidade
      realizado: totalRealizado,
      perda_kg:  totalPerdaKg,
      perda_un:  totalPerdaUn,
      turno:     turnos.map(t => t.turno).join(' + ')
    },
    expedicao: {
      preenchido_hoje:    expRaw !== null,
      pedidos_1impressao: toNum(exp[2]), pedidos_3impressao: toNum(exp[3]),
      sacos_kits: exp[4]||'', etiquetas_sobra: toNum(exp[5]),
      atraso: String(exp[6]||'Não'), pedidos_atrasados: exp[11]||''
    },
    reuniao: {
      // Campos usados: pct_17h, ameaca, horas_extras
      // Removidos (não usados no dashboard): status, coleta_15h, solucao
      pct_17h:      reu[3]||'',
      ameaca:       String(reu[4]||'Não'),
      horas_extras: String(reu[6]||'Não')
    },
    devolucoes: {
      total_dia: devHoje.length,
      itens: devHoje.map(r => ({ rastreio:r[0]||'', produto:r[1]||'', pedido:r[2]||'', estado:r[3]||'' }))
    },
    prospeccao,
    inventario_lidiane: checkInventarioLidiane(),
    gestaoclick,  // null se cache vazio, objeto completo se já sincronizado
    shopee: (function() {
      try {
        const sc = PropertiesService.getScriptProperties().getProperty('shopee_cache');
        return sc ? JSON.parse(sc) : null;
      } catch(_) { return null; }
    })()
  };
}

// ── Shopee API ────────────────────────────────────────────────
const SHOPEE = {
  partner_id:  '1227628',
  partner_key: 'shpk556c4951437248494c5756587a415650454e796e5256724278724e4d7853',
  base_url:    'https://partner.shopeemobile.com/api/v2'
};

// Busca vendas Shopee do dia — retorna receita_hoje e pedidos_hoje
function syncShopee() {
  try {
    const props = PropertiesService.getScriptProperties();
    const partnerId   = props.getProperty('SHOPEE_PARTNER_ID');
    const shopId      = props.getProperty('SHOPEE_SHOP_ID');
    const accessToken = props.getProperty('SHOPEE_ACCESS_TOKEN');

    if (!partnerId || !shopId || !accessToken) {
      Logger.log('⚠️ Shopee: credenciais incompletas — configure SHOPEE_PARTNER_ID, SHOPEE_SHOP_ID e SHOPEE_ACCESS_TOKEN nas Script Properties');
      return null;
    }

    const agora    = Math.floor(Date.now() / 1000);
    const hojeIni  = new Date(); hojeIni.setHours(0,0,0,0);
    const timeFrom = Math.floor(hojeIni.getTime() / 1000);

    // Assina requisição (HMAC-SHA256)
    const path      = '/order/get_order_list';
    const baseStr   = partnerId + path + agora + accessToken + shopId;
    const sign      = Utilities.computeHmacSha256Signature(baseStr, SHOPEE.partner_key)
                        .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');

    const url = `${SHOPEE.base_url}${path}?partner_id=${partnerId}&shop_id=${shopId}&access_token=${accessToken}&timestamp=${agora}&sign=${sign}&time_range_field=create_time&time_from=${timeFrom}&time_to=${agora}&page_size=100&response_optional_fields=item_list`;

    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      Logger.log('❌ Shopee API erro: ' + res.getResponseCode() + ' — ' + res.getContentText().slice(0,200));
      return null;
    }

    const json   = JSON.parse(res.getContentText());
    const orders = (json.response && json.response.order_list) || [];

    const pedidosHoje = orders.length;
    // Receita: busca detalhes dos pedidos para somar valores
    let receitaHoje = 0;
    if (orders.length > 0) {
      const orderNos = orders.slice(0, 50).map(o => o.order_sn).join(',');
      const pathDet  = '/order/get_order_detail';
      const baseD    = partnerId + pathDet + agora + accessToken + shopId;
      const signD    = Utilities.computeHmacSha256Signature(baseD, SHOPEE.partner_key)
                         .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
      const urlDet = `${SHOPEE.base_url}${pathDet}?partner_id=${partnerId}&shop_id=${shopId}&access_token=${accessToken}&timestamp=${agora}&sign=${signD}&order_sn_list=${orderNos}&response_optional_fields=item_list,total_amount`;
      const resDet = UrlFetchApp.fetch(urlDet, { muteHttpExceptions: true });
      if (resDet.getResponseCode() === 200) {
        const detJson = JSON.parse(resDet.getContentText());
        const detOrders = (detJson.response && detJson.response.order_list) || [];
        receitaHoje = detOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
      }
    }

    const shopeeData = {
      pedidos_hoje: pedidosHoje,
      receita_hoje: Math.round(receitaHoje * 100) / 100
    };

    PropertiesService.getScriptProperties().setProperty('shopee_cache', JSON.stringify(shopeeData));
    Logger.log('✅ Shopee sync OK — pedidos hoje: ' + pedidosHoje + ' | receita: R$' + receitaHoje.toFixed(2));
    return shopeeData;

  } catch(e) {
    Logger.log('❌ Shopee sync erro: ' + e.message);
    return null;
  }
}

// ── Resumo diário 18h — enviado via WhatsApp ──────────────────
function resumoDiario18h() {
  const d    = buildJSON();
  const prod = d.producao;
  const exp  = d.expedicao;
  const pro  = d.prospeccao;
  const gc   = d.gestaoclick;
  const inv  = d.inventario_lidiane;

  const totalPedidos = (exp.pedidos_1impressao || 0) + (exp.pedidos_3impressao || 0);

  // Bloco produção
  const blocoProd = prod.turnos && prod.turnos.length > 1
    ? prod.turnos.map(t =>
        `▸ ${t.turno}: ${t.realizado.toLocaleString('pt-BR')} un${t.troca && t.troca !== 'Não' ? ' 🔄' : ''}`
      ).join('\n') + `\n▸ *Total: ${prod.total_realizado.toLocaleString('pt-BR')} un*`
    : `▸ Realizado: ${prod.total_realizado.toLocaleString('pt-BR')} un`;
  const blocoMolde = prod.molde_atual
    ? `▸ Modelo: ${prod.molde_atual}${prod.gramatura > 0 ? ` · ${prod.gramatura}g/un` : ''}`
    : '';
  const blocoPerdas = prod.total_perda_un > 0 ? `▸ Perdas: ${prod.total_perda_un} un` : '';

  // Bloco expedição
  const blocoInviav = (gc && (gc.vendas.inviavies_hoje > 0 || gc.vendas.cancelados_hoje > 0))
    ? `▸ Inviáveis: ${gc.vendas.inviavies_hoje} · Cancelados: ${gc.vendas.cancelados_hoje}`
    : '';
  const blocoAtraso = exp.atraso !== 'Não' ? '⚠️ Atraso identificado' : '';

  // Bloco GC
  const blocoGC = gc ? `
💰 *ATACADO (Gestão Click)*
▸ Pedidos mês: ${gc.vendas.pedidos_mes} · ${gc.vendas.unidades_mes > 0 ? gc.vendas.unidades_mes.toLocaleString('pt-BR') + ' un' : '—'}
▸ Mais vendido: ${gc.vendas.mais_vendido}
▸ Menos vendido: ${gc.vendas.menos_vendido}` : '';

  // Bloco inventário Lidiane
  const blocoInv = IDS.inventario_lidiane
    ? `\n📋 *INVENTÁRIO*\n▸ ${inv.preenchido ? `✅ Preenchido por ${inv.quem}${inv.horario ? ' às ' + inv.horario : ''}` : '⏳ Pendente hoje'}`
    : '';

  const msg =
`🏭 *Montenegro Industria LTDA*
📅 Fechamento ${d.atualizado_em}
━━━━━━━━━━━━━━━━━━━━

📦 *PRODUÇÃO*${prod.troca_molde ? ' 🔄' : ''}
${blocoProd}
${blocoMolde}
${blocoPerdas}
📤 *EXPEDIÇÃO*
▸ Total pedidos: ${totalPedidos}
${blocoInviav}
${blocoAtraso}
💼 *COMERCIAL*
▸ Prospecções: ${pro.prospeccoes}/30
▸ Orçamentos: ${pro.orcamentos}
▸ Fechado hoje: R$ ${pro.valor_fechado.toLocaleString('pt-BR')}
${blocoGC}${blocoInv}

_Enviado automaticamente — Sistema Montenegro_`;

  enviarTodos(msg);
}

// ── Fechamento Semanal — sábado 8h ───────────────────────────
function fechamentoSemanal() {
  const d   = buildJSON();
  const gc  = d.gestaoclick;
  const pro = d.prospeccao;

  // Shopee cache
  let shopee = null;
  try {
    const sc = PropertiesService.getScriptProperties().getProperty('shopee_cache');
    if (sc) shopee = JSON.parse(sc);
  } catch(_) {}

  const semana = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
  const iniSem = new Date(); iniSem.setDate(iniSem.getDate() - 6);
  const iniStr = Utilities.formatDate(iniSem, 'America/Sao_Paulo', 'dd/MM');

  // Bloco vendas
  const recAtacado = gc ? gc.vendas.receita_mes : 0;
  const recVarejo  = shopee ? shopee.receita_hoje : 0; // acúmulo futuro
  const blocoVendas = `
💼 *VENDAS*
▸ Atacado (mês GC): R$ ${recAtacado.toLocaleString('pt-BR')}
▸ Pedidos mês: ${gc ? gc.vendas.pedidos_mes : '—'}
▸ Ticket médio: R$ ${gc ? gc.vendas.ticket_medio.toLocaleString('pt-BR') : '—'}
▸ Varejo (Shopee): ${shopee ? 'R$ ' + shopee.receita_hoje.toLocaleString('pt-BR') : '⏳ aguardando integração'}`;

  // Bloco produção
  const prod = d.producao;
  const blocoProd = `
📦 *PRODUÇÃO*
▸ Último registro: ${prod.total_realizado.toLocaleString('pt-BR')} un
▸ Responsável: ${prod.quem || '—'}
${prod.molde_atual ? `▸ Modelo: ${prod.molde_atual}` : ''}${prod.gramatura > 0 ? ` · ${prod.gramatura}g/un` : ''}
▸ Perdas: ${prod.total_perda_un} un / ${prod.total_perda_kg} kg
${prod.troca_molde ? '▸ 🔄 Houve troca de molde' : ''}`;

  // Bloco financeiro
  const blocoFin = gc ? `
💰 *FINANCEIRO*
▸ Recebido no mês: R$ ${gc.financeiro.recebido_mes.toLocaleString('pt-BR')}
▸ Pago no mês: R$ ${gc.financeiro.pago_mes.toLocaleString('pt-BR')}
▸ Saldo líquido: R$ ${gc.financeiro.saldo_mes.toLocaleString('pt-BR')}
▸ Inventário atual: R$ ${gc.estoque.inventario_custo.toLocaleString('pt-BR')}
▸ SKUs zerados: ${gc.estoque.zerados} | Críticos: ${gc.estoque.criticos}` : '\n💰 *FINANCEIRO*\n▸ GC indisponível';

  // Bloco expedição
  const exp = d.expedicao;
  const dev = d.devolucoes;
  const totalPed = (exp.pedidos_1impressao||0) + (exp.pedidos_3impressao||0);
  const blocoExp = `
📤 *EXPEDIÇÃO*
▸ Pedidos último dia: ${totalPed}
▸ Devoluções: ${dev.total_dia}
${exp.atraso !== 'Não' ? '⚠️ Atraso identificado no último dia' : '✅ Sem atrasos no último dia'}`;

  const msg =
`🏭 *Montenegro Industria LTDA*
📊 *FECHAMENTO SEMANAL*
📅 Semana ${iniStr} – ${semana}
━━━━━━━━━━━━━━━━━━━━
${blocoVendas}
${blocoProd}
${blocoFin}
${blocoExp}

_Relatório automático de sábado — Sistema Montenegro_`;

  enviarTodos(msg);
  Logger.log('✅ Fechamento semanal enviado — ' + semana);
}

// ── Dispara ao receber envio de formulário ────────────────────
function onFormSubmitHandler(e) {
  PropertiesService.getScriptProperties().setProperty(
    'last_form_submit', new Date().toISOString()
  );

  let setor = 'Formulário';
  try {
    const sheetName = e.source.getName();
    if (sheetName.toLowerCase().includes('producao') || sheetName.toLowerCase().includes('produção')) setor = '📦 Produção';
    else if (sheetName.toLowerCase().includes('expedicao') || sheetName.toLowerCase().includes('expedição')) setor = '📤 Expedição';
    else if (sheetName.toLowerCase().includes('reuniao') || sheetName.toLowerCase().includes('reunião')) setor = '🕒 Reunião 15h';
    else if (sheetName.toLowerCase().includes('devolucao') || sheetName.toLowerCase().includes('devolução')) setor = '↩️ Devoluções';
    else if (sheetName.toLowerCase().includes('prospeccao') || sheetName.toLowerCase().includes('prospecção')) setor = '💼 Prospecção';
  } catch(_) {}

  const now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm');
  enviarTodos(`✅ *${setor}* atualizado às ${now} — dashboard disponível`);
}

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE ESTOQUE — itens, fardos e fatores de conversão
// ══════════════════════════════════════════════════════════════
const CATALOGO_EST = {
  fardos: [
    { sku:'FAR-38-120-450', label:'FARDO 38MM | 120ML | 450UN',   fator:450, gc_nome:'Fardo 120ML (450un)' },
    { sku:'FAR-38-200-300', label:'FARDO 38MM | 200ML | 300UN',   fator:300, gc_nome:'Fardo 200ML (300un)' },
    { sku:'FAR-38-300-240', label:'FARDO 38MM | 300ML | 240UN',   fator:240, gc_nome:'Fardo 300ML (240un)' },
    { sku:'FAR-38-500-BL',  label:'FARDO 38MM | 500ML | BOCA LARGA', fator:null, gc_nome:'Fardo 500ML boca larga' },
    { sku:'FAR-28-500-BOR', label:'FARDO 28MM | 500ML | BORRIFADOR', fator:null, gc_nome:'Fardo 500ML borrifador' },
    { sku:'FAR-28-500-KOM', label:'FARDO 28MM | 500ML | KOMBUCHA | 300UN', fator:300, gc_nome:'Fardo kombucha 500ML (300un)' }
  ],
  garrafas: [
    { sku:'GAR-38-120-CRI', label:'GARRAFA 38MM | 120ML | CRISTAL',          fator:1, gc_nome:'Garrafa 120 ML' },
    { sku:'GAR-38-200-CRI', label:'GARRAFA 38MM | 200ML | CRISTAL',          fator:1, gc_nome:'Garrafa 200 ML' },
    { sku:'GAR-38-300-CRI', label:'GARRAFA 38MM | 300ML | CRISTAL',          fator:1, gc_nome:'Garrafa 300 ML' },
    { sku:'GAR-38-500-CRI', label:'GARRAFA 38MM | 500ML | CRISTAL',          fator:1, gc_nome:'Garrafa 500 ML' },
    { sku:'GAR-28-300-KOM', label:'GARRAFA 28MM | 300ML | CRISTAL | KOMBUCHA', fator:1, gc_nome:'Garrafa kombucha' },
    { sku:'GAR-28-500-CRI', label:'GARRAFA 28MM | 500ML | CRISTAL',          fator:1, gc_nome:'Garrafa borrifador' },
    { sku:'GAR-28-500-AMB', label:'GARRAFA 28MM | 500ML | AMBAR',            fator:1, gc_nome:'Garrafa 500ML ambar' }
  ],
  preformas: [
    { sku:'PRE-38-18-CRI', label:'PRE-FORMA 38MM | 18G | CRISTAL | 120-200ML', fator:1, gc_nome:'Pré forma 17.7g (120/200ML)' },
    { sku:'PRE-38-19-CRI', label:'PRE-FORMA 38MM | 19G | CRISTAL | 300ML',    fator:1, gc_nome:'Pré forma 19g (300ML)' },
    { sku:'PRE-28-24-CRI', label:'PRE-FORMA 28MM | 24G | CRISTAL | KOM-500ML',fator:1, gc_nome:'Pré forma 33g (500ML)' },
    { sku:'PRE-28-33-AMB', label:'PRE-FORMA 28MM | 33G | AMBAR | 500ML',     fator:1, gc_nome:'Preforma 33 grs 1810 ambar 10.080' }
  ],
  tampas: [
    { sku:'TAM-38-SUC-PT', label:'TAMPA 38MM | SUCO | PRETA | COM LACRE',    fator:1, gc_nome:'Tampa suco preta lacre' },
    { sku:'TAM-38-SUC-AZ', label:'TAMPA 38MM | SUCO | AZUL | COM LACRE',     fator:1, gc_nome:'Tampa suco azul' },
    { sku:'TAM-38-SUC-RS', label:'TAMPA 38MM | SUCO | ROSA | COM LACRE',     fator:1, gc_nome:'Tampa suco rosa' },
    { sku:'TAM-38-SUC-RX', label:'TAMPA 38MM | SUCO | ROXA | COM LACRE',     fator:1, gc_nome:'Tampa suco roxa' },
    { sku:'TAM-38-SUC-VM', label:'TAMPA 38MM | SUCO | VERMELHA | COM LACRE', fator:1, gc_nome:'Tampa suco vermelha' },
    { sku:'TAM-38-TMP-PT', label:'TAMPA 38MM | TEMPERO | PRETA',             fator:1, gc_nome:'Tampa tempero preta' },
    { sku:'TAM-38-TMP-VM', label:'TAMPA 38MM | TEMPERO | VERMELHA',          fator:1, gc_nome:'Tampa tempero vermelha' },
    { sku:'TAM-28-TRI-PT', label:'TAMPA 28MM | TRIGGER | PRETA',             fator:1, gc_nome:'Tampa trigger preta' },
    { sku:'TAM-28-PUM-PT', label:'TAMPA 28MM | PUMP | PRETA',               fator:1, gc_nome:'Tampa pump preta' },
    { sku:'TAM-28-KOM-BR', label:'TAMPA 28MM | KOMBUCHA | BRANCA',           fator:1, gc_nome:'Tampa kombucha branca' }
  ]
};

function getTodosItens_() {
  return [
    ...CATALOGO_EST.fardos,
    ...CATALOGO_EST.garrafas,
    ...CATALOGO_EST.preformas,
    ...CATALOGO_EST.tampas
  ];
}

function getFatorItem_(sku) {
  const overrides = JSON.parse(
    PropertiesService.getScriptProperties().getProperty('fator_overrides') || '{}'
  );
  if (overrides[sku] != null) return Number(overrides[sku]);
  const item = getTodosItens_().find(i => i.sku === sku);
  return item ? item.fator : null;
}

// ── doPost — recebe lançamentos de estoque do formulário ──────
function doPost(e) {
  try {
    const body  = JSON.parse(e.postData.contents);
    const acao  = body.action || 'lancar';

    // ── Cadastrar rastreio de amostra ─────────────────────────
    if (acao === 'cadastrarRastreio') {
      const { codigo, nome, telefone, interesse } = body;
      if (!codigo || !nome || !telefone || !interesse) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, erro: 'Preencha todos os campos obrigatórios.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      try {
        const prop  = PropertiesService.getScriptProperties();
        const lista = JSON.parse(prop.getProperty('rastreios_data') || '[]');
        const entry = {
          ts:        new Date().toISOString(),
          codigo:    codigo.trim().toUpperCase(),
          nome:      nome.trim(),
          telefone:  telefone.replace(/\D/g, ''),
          interesse: interesse.trim()
        };
        lista.push(entry);
        prop.setProperty('rastreios_data', JSON.stringify(lista));

        // Também grava na planilha se configurada
        if (IDS.rastreios) {
          const ss = SpreadsheetApp.openById(IDS.rastreios);
          ss.getSheets()[0].appendRow([new Date(), entry.codigo, entry.nome, entry.telefone, entry.interesse]);
        }

        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, msg: 'Amostra cadastrada! O sistema monitorará a entrega automaticamente.' }))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, erro: err.message }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── Salvar dados do Controle de Compras ───────────────────
    if (acao === 'salvarCompras') {
      const prop = PropertiesService.getScriptProperties();
      if (body.pedidos !== undefined) prop.setProperty('compras_pedidos', JSON.stringify(body.pedidos));
      if (body.prazos  !== undefined) prop.setProperty('compras_prazos',  JSON.stringify(body.prazos));
      if (body.nextId  !== undefined) prop.setProperty('compras_nextid',  String(body.nextId));
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (acao === 'catalogo') {
      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, catalogo: CATALOGO_EST }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (acao === 'set_fator') {
      // Permite configurar fatores pendentes via POST
      const { sku, fator } = body;
      const prop = PropertiesService.getScriptProperties();
      const overrides = JSON.parse(prop.getProperty('fator_overrides') || '{}');
      overrides[sku] = Number(fator);
      prop.setProperty('fator_overrides', JSON.stringify(overrides));
      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, msg:'Fator salvo: '+sku+' = '+fator }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ação padrão: lancar estoque
    const resultado = processarLancamento_(body);
    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:false, erro: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function processarLancamento_(dados) {
  const { sku, categoria, label, qtd, responsavel, data, obs } = dados;
  const fator = getFatorItem_(sku);

  if (fator === null) {
    return {
      ok: false,
      erro: 'Fator de conversão não definido para este item. Configure-o no painel de fatores.'
    };
  }

  const qtd_num  = Number(qtd);
  const total_un = Math.round(qtd_num * fator);

  const lancamento = {
    sku, categoria, label,
    qtd_informada: qtd_num,
    fator,
    total_unidades: total_un,
    responsavel: responsavel || '',
    data: data || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy'),
    obs: obs || '',
    criado_em: new Date().toISOString()
  };

  // Salva histórico em Script Properties (últimos 300 lançamentos)
  const prop  = PropertiesService.getScriptProperties();
  const lista = JSON.parse(prop.getProperty('lancamentos_estoque') || '[]');
  lista.unshift(lancamento);
  if (lista.length > 300) lista.splice(300);
  prop.setProperty('lancamentos_estoque', JSON.stringify(lista));

  // Tenta atualizar no Gestão Click
  let gc_ok  = false;
  let gc_msg = 'Não tentado';
  try {
    const r = atualizarEstoqueGC_(label, sku, total_un);
    gc_ok  = r.ok;
    gc_msg = r.msg;
  } catch(err) {
    gc_msg = 'Erro: ' + err.message;
  }

  Logger.log(`Lançamento: ${label} | ${qtd_num} × ${fator} = ${total_un} un | GC: ${gc_msg}`);

  return {
    ok: true,
    label,
    qtd_informada: qtd_num,
    fator,
    total_unidades: total_un,
    gc_atualizado: gc_ok,
    gc_msg,
    mensagem: `${label}: ${qtd_num} un/fardo(s) → ${total_un.toLocaleString('pt-BR')} unidades totais`
  };
}

function atualizarEstoqueGC_(label, sku, novaQuantidade) {
  const headers = {
    'access_token':        GC.token,
    'secret_access_token': GC.secret,
    'Content-Type':        'application/json'
  };

  // Busca todos os produtos
  const resList = UrlFetchApp.fetch(`${GC.url}/produtos?limite=500`, {
    headers, muteHttpExceptions: true
  });
  if (resList.getResponseCode() !== 200) {
    return { ok:false, msg:'Falha ao listar produtos GC ('+resList.getResponseCode()+')' };
  }

  const produtos = JSON.parse(resList.getContentText()).data || [];

  // Tenta encontrar por código/SKU, depois por nome aproximado
  const catalogoItem = getTodosItens_().find(i => i.sku === sku);
  let produto = null;

  if (catalogoItem) {
    // 1. Por código exato
    produto = produtos.find(p => p.codigo && p.codigo.toUpperCase() === sku.toUpperCase());
    // 2. Por gc_nome aproximado
    if (!produto) {
      const gcNomeLower = catalogoItem.gc_nome.toLowerCase();
      produto = produtos.find(p => p.nome && p.nome.toLowerCase().includes(gcNomeLower.split(' ').slice(0,2).join(' ')));
    }
    // 3. Por primeiras palavras do label
    if (!produto) {
      const primPalavras = label.toLowerCase().split('|')[0].trim();
      produto = produtos.find(p => p.nome && p.nome.toLowerCase().includes(primPalavras.split(' ')[0]));
    }
  }

  if (!produto || !produto.id) {
    return { ok:false, msg:`Produto não encontrado no GC — atualize manualmente. (sku: ${sku})` };
  }

  // Atualiza estoque via PUT
  const resUp = UrlFetchApp.fetch(`${GC.url}/produtos/${produto.id}`, {
    method: 'PUT',
    headers,
    payload: JSON.stringify({ estoque: novaQuantidade }),
    muteHttpExceptions: true
  });

  const code = resUp.getResponseCode();
  if (code === 200 || code === 201) {
    return { ok:true, msg:`GC atualizado — produto id:${produto.id}, novo estoque: ${novaQuantidade}` };
  }
  return { ok:false, msg:`GC retornou HTTP ${code}: ${resUp.getContentText().slice(0,120)}` };
}

// ── Criar Google Form de Amostras ─────────────────────────────
// Execute UMA VEZ no editor do Apps Script para criar o formulário.
// Após rodar, copie o ID da planilha exibido no Logger para IDS.rastreios
function criarFormRastreio() {
  const form = FormApp.create('Cadastro de Amostras — Montenegro');
  form.setTitle('Cadastro de Amostras')
      .setDescription('Preencha os dados para monitorar a entrega da amostra ao cliente.');

  form.addTextItem()
    .setTitle('Código de rastreio')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Nome do cliente')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Telefone do cliente')
    .setHelpText('Somente números. Ex: 27999990000')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Interesse do Lead')
    .setHelpText('Ex: Tempero 120ml, Suco 300ml...')
    .setRequired(true);

  // Vincula a uma planilha de respostas
  const ss    = SpreadsheetApp.create('Respostas — Amostras Montenegro');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('✅ Form criado: ' + form.getPublishedUrl());
  Logger.log('✅ Planilha ID: ' + ss.getId());
  Logger.log('👉 Cole esse ID em IDS.rastreios no apps_script.gs e faça novo deploy.');
}

// ── doGet — endpoint principal do dashboard ───────────────────
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  // ── OAuth callback da Shopee ─────────────────────────────────
  // Quando o usuário autoriza o app, a Shopee redireciona aqui com ?code=XXX&shop_id=YYY
  if (e && e.parameter && e.parameter.code) {
    try {
      const code   = e.parameter.code;
      const shopId = e.parameter.shop_id || PropertiesService.getScriptProperties().getProperty('SHOPEE_SHOP_ID') || '';
      const ts     = Math.floor(Date.now() / 1000);
      const path   = '/auth/token/get';
      const base   = SHOPEE.partner_id + path + ts;
      const sign   = Utilities.computeHmacSha256Signature(base, SHOPEE.partner_key)
                       .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');

      const payload = JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(SHOPEE.partner_id) });
      const url     = `${SHOPEE.base_url}${path}?partner_id=${SHOPEE.partner_id}&timestamp=${ts}&sign=${sign}`;
      const res     = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload,
        muteHttpExceptions: true
      });

      const data = JSON.parse(res.getContentText());
      if (data && data.access_token) {
        const props = PropertiesService.getScriptProperties();
        props.setProperty('SHOPEE_ACCESS_TOKEN', data.access_token);
        props.setProperty('SHOPEE_REFRESH_TOKEN', data.refresh_token || '');
        props.setProperty('SHOPEE_SHOP_ID', String(shopId));
        Logger.log('✅ Shopee OAuth OK — access_token salvo!');
        return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif;color:green">✅ Shopee autorizada com sucesso!<br>Token salvo. Pode fechar esta aba.</h2>');
      } else {
        Logger.log('❌ Shopee OAuth erro: ' + JSON.stringify(data));
        return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif;color:red">❌ Erro ao obter token:<br>' + JSON.stringify(data) + '</h2>');
      }
    } catch(err) {
      return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif;color:red">❌ Exceção: ' + err.message + '</h2>');
    }
  }

  if (action === 'lastSubmit') {
    const ts = PropertiesService.getScriptProperties().getProperty('last_form_submit') || '';
    return ContentService
      .createTextOutput(JSON.stringify({ last_submit: ts }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'lancamentos') {
    const lista = JSON.parse(
      PropertiesService.getScriptProperties().getProperty('lancamentos_estoque') || '[]'
    );
    return ContentService
      .createTextOutput(JSON.stringify({ lancamentos: lista.slice(0, 50) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'catalogo') {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:true, catalogo: CATALOGO_EST }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'version') {
    return ContentService
      .createTextOutput(JSON.stringify({ version: SCRIPT_VERSION, ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'listarEstoquistas') {
    const pins = JSON.parse(PropertiesService.getScriptProperties().getProperty('estoquistas_pins') || '{}');
    const nomes = Object.keys(pins);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, nomes }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'login') {
    const nome  = (e.parameter.nome  || '').trim();
    const senha = (e.parameter.senha || e.parameter.pin || '').trim();
    const usuarios = JSON.parse(PropertiesService.getScriptProperties().getProperty('usuarios') || '{}');
    if (!nome || !senha || usuarios[nome] !== senha) {
      return ContentService.createTextOutput(JSON.stringify({ ok:false, erro:'Usuário ou senha incorretos' })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok:true, nome })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'gerenciarEstoquistas') {
    // Uso: ?action=gerenciarEstoquistas&adminKey=mnt@admin2026&op=add&nome=João&pin=5678
    // ou: &op=remove&nome=João | &op=list
    const adminKey = e.parameter.adminKey || '';
    if (adminKey !== ADMIN_KEY) return ContentService.createTextOutput(JSON.stringify({ ok:false, erro:'Acesso negado' })).setMimeType(ContentService.MimeType.JSON);
    const pins = JSON.parse(PropertiesService.getScriptProperties().getProperty('estoquistas_pins') || '{}');
    const op   = e.parameter.op || 'list';
    const nome = (e.parameter.nome || '').trim();
    const pin  = (e.parameter.pin  || '').trim();
    if (op === 'add' && nome && pin) {
      pins[nome] = pin;
      PropertiesService.getScriptProperties().setProperty('estoquistas_pins', JSON.stringify(pins));
      return ContentService.createTextOutput(JSON.stringify({ ok:true, msg:`${nome} adicionado`, estoquistas: Object.keys(pins) })).setMimeType(ContentService.MimeType.JSON);
    }
    if (op === 'remove' && nome) {
      delete pins[nome];
      PropertiesService.getScriptProperties().setProperty('estoquistas_pins', JSON.stringify(pins));
      return ContentService.createTextOutput(JSON.stringify({ ok:true, msg:`${nome} removido`, estoquistas: Object.keys(pins) })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok:true, estoquistas: Object.keys(pins) })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'initSenhas') {
    const adminKey = e.parameter.adminKey || '';
    if (adminKey !== ADMIN_KEY) return ContentService.createTextOutput(JSON.stringify({ ok:false, erro:'Acesso negado' })).setMimeType(ContentService.MimeType.JSON);
    const senhas = ['ADM333@', 'MDAA22!', 'DM166H1'];
    PropertiesService.getScriptProperties().setProperty('valid_passwords', JSON.stringify(senhas));
    return ContentService.createTextOutput(JSON.stringify({ ok:true, msg:'Senhas inicializadas', total: senhas.length })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'lancarEstoque') {
    return lancarEstoqueGC_(e.parameter);
  }

  if (action === 'app' || (e && e.parameter && e.parameter.page === 'estoque')) {
    return HtmlService.createHtmlOutputFromFile('estoque')
      .setTitle('Controle de Estoque — Montenegro')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // ── Controle de Compras ───────────────────────────────────────
  // ── Rastreio de Amostras ──────────────────────────────────
  if (action === 'rastreios') {
    try {
      const prop  = PropertiesService.getScriptProperties();
      const lista = JSON.parse(prop.getProperty('rastreios_data') || '[]');
      const rastreios = lista.map(r => ({
        code:           r.codigo,
        customer_name:  r.nome,
        customer_phone: r.telefone,
        interesse:      r.interesse,
        created_at:     r.ts
      }));
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, rastreios }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(e) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, erro: e.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── Formulário de Cadastro de Amostras ───────────────────────
  if (action === 'form') {
    const appsUrl = ScriptApp.getService().getUrl();
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cadastro de Amostras — Montenegro</title>
<style>
  :root {
    --azul: #1a3a6b;
    --azul-light: #2451a3;
    --azul-bg: #eef3fb;
    --verde: #16a34a;
    --vermelho: #dc2626;
    --cinza: #6b7280;
    --borda: #d1d5db;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--azul-bg);
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px 16px 48px;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(26,58,107,.12);
    width: 100%;
    max-width: 480px;
    overflow: hidden;
  }
  .header {
    background: var(--azul);
    padding: 28px 28px 24px;
    text-align: center;
  }
  .header .logo {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,.65);
    margin-bottom: 6px;
  }
  .header h1 {
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.3;
  }
  .header p {
    color: rgba(255,255,255,.75);
    font-size: 13px;
    margin-top: 6px;
    line-height: 1.5;
  }
  .body { padding: 28px; }
  .field { margin-bottom: 20px; }
  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--azul);
    margin-bottom: 6px;
    letter-spacing: .3px;
  }
  label span { color: var(--vermelho); margin-left: 2px; }
  input, select, textarea {
    width: 100%;
    padding: 11px 14px;
    border: 1.5px solid var(--borda);
    border-radius: 8px;
    font-size: 15px;
    color: #1f2937;
    background: #fff;
    transition: border-color .15s, box-shadow .15s;
    -webkit-appearance: none;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--azul-light);
    box-shadow: 0 0 0 3px rgba(36,81,163,.12);
  }
  input::placeholder { color: #9ca3af; }
  .hint {
    font-size: 12px;
    color: var(--cinza);
    margin-top: 5px;
    line-height: 1.4;
  }
  .btn {
    width: 100%;
    padding: 14px;
    background: var(--azul);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s, transform .1s;
    margin-top: 8px;
    letter-spacing: .3px;
  }
  .btn:hover { background: var(--azul-light); }
  .btn:active { transform: scale(.98); }
  .btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }
  .alert {
    display: none;
    border-radius: 8px;
    padding: 14px 16px;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
    margin-bottom: 20px;
  }
  .alert.success { background: #dcfce7; color: #166534; display: flex; gap: 10px; align-items: flex-start; }
  .alert.error   { background: #fee2e2; color: #991b1b; display: flex; gap: 10px; align-items: flex-start; }
  .alert .ico { font-size: 18px; line-height: 1.2; flex-shrink: 0; }
  .footer {
    text-align: center;
    padding: 16px 28px 20px;
    border-top: 1px solid #f3f4f6;
    font-size: 12px;
    color: var(--cinza);
  }
  @media (max-width: 480px) {
    .card { border-radius: 12px; }
    .header { padding: 22px 20px 18px; }
    .body { padding: 20px; }
    .header h1 { font-size: 19px; }
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="logo">Montenegro Indústria</div>
    <h1>📦 Cadastro de Amostras</h1>
    <p>Preencha os dados após enviar a amostra ao cliente. O sistema monitorará a entrega e avisará quando chegar.</p>
  </div>
  <div class="body">
    <div class="alert success" id="msgSucesso">
      <span class="ico">✅</span>
      <div id="msgSucessoText"></div>
    </div>
    <div class="alert error" id="msgErro">
      <span class="ico">❌</span>
      <div id="msgErroText"></div>
    </div>
    <form id="form" novalidate>
      <div class="field">
        <label for="codigo">Código de rastreio<span>*</span></label>
        <input type="text" id="codigo" name="codigo" placeholder="Ex: BR123456789AA" autocomplete="off" spellcheck="false" style="text-transform:uppercase">
        <div class="hint">Código dos Correios ou Shopee Express — sem espaços.</div>
      </div>
      <div class="field">
        <label for="nome">Nome do cliente<span>*</span></label>
        <input type="text" id="nome" name="nome" placeholder="Ex: João Silva">
      </div>
      <div class="field">
        <label for="telefone">Telefone do cliente<span>*</span></label>
        <input type="tel" id="telefone" name="telefone" placeholder="Ex: 27 99999-0000" inputmode="numeric">
        <div class="hint">Somente números — será usado para contato após confirmação de entrega.</div>
      </div>
      <div class="field">
        <label for="interesse">Interesse do Lead<span>*</span></label>
        <input type="text" id="interesse" name="interesse" placeholder="Ex: Tempero 120ml, Suco 300ml, Mix Completo...">
        <div class="hint">Produto(s) de interesse do cliente.</div>
      </div>
      <button type="submit" class="btn" id="btnEnviar">Cadastrar Amostra</button>
    </form>
  </div>
  <div class="footer">Sistema de monitoramento automático · Montenegro Indústria</div>
</div>

<script>
const APPS_URL = '${appsUrl}';

function formatarTel(v) {
  v = v.replace(/\\D/g, '');
  if (v.length <= 10) return v.replace(/(\\d{2})(\\d{4})(\\d{0,4})/, '($1) $2-$3');
  return v.replace(/(\\d{2})(\\d{5})(\\d{0,4})/, '($1) $2-$3');
}

document.getElementById('telefone').addEventListener('input', function() {
  const cur = this.selectionStart;
  this.value = formatarTel(this.value);
});

document.getElementById('codigo').addEventListener('input', function() {
  this.value = this.value.toUpperCase().replace(/\\s/g, '');
});

document.getElementById('form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnEnviar');
  const suc = document.getElementById('msgSucesso');
  const err = document.getElementById('msgErro');
  suc.style.display = 'none';
  err.style.display = 'none';

  const codigo    = document.getElementById('codigo').value.trim();
  const nome      = document.getElementById('nome').value.trim();
  const telefone  = document.getElementById('telefone').value.replace(/\\D/g, '');
  const interesse = document.getElementById('interesse').value.trim();

  if (!codigo || !nome || !telefone || !interesse) {
    document.getElementById('msgErroText').textContent = 'Preencha todos os campos obrigatórios.';
    err.style.display = 'flex'; return;
  }
  if (telefone.length < 10) {
    document.getElementById('msgErroText').textContent = 'Telefone inválido. Digite DDD + número.';
    err.style.display = 'flex'; return;
  }

  btn.disabled = true;
  btn.textContent = 'Cadastrando...';

  try {
    const res = await fetch(APPS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cadastrarRastreio', codigo, nome, telefone, interesse })
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('msgSucessoText').innerHTML =
        '<strong>Amostra cadastrada com sucesso!</strong><br>' + data.msg;
      suc.style.display = 'flex';
      document.getElementById('form').reset();
    } else {
      document.getElementById('msgErroText').textContent = data.erro || 'Erro ao cadastrar. Tente novamente.';
      err.style.display = 'flex';
    }
  } catch(ex) {
    document.getElementById('msgErroText').textContent = 'Falha de conexão. Verifique a internet e tente novamente.';
    err.style.display = 'flex';
  }

  btn.disabled = false;
  btn.textContent = 'Cadastrar Amostra';
  if (suc.style.display !== 'none') window.scrollTo({ top: 0, behavior: 'smooth' });
});
</script>
</body>
</html>`;
    return HtmlService.createHtmlOutput(html)
      .setTitle('Cadastro de Amostras — Montenegro')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'getCompras') {
    const prop   = PropertiesService.getScriptProperties();
    const pedidos = JSON.parse(prop.getProperty('compras_pedidos') || '[]');
    const prazos  = JSON.parse(prop.getProperty('compras_prazos')  || '{}');
    const nextId  = parseInt(prop.getProperty('compras_nextid')    || '1');
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, pedidos, prazos, nextId }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Retorna todos os dados: planilhas + Gestão Click
  return ContentService
    .createTextOutput(JSON.stringify(buildJSON()))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Lançamento de estoque via formulário → Gestão Click ───────
function lancarEstoqueGC_(params) {
  const resp = (msg, ok) => ContentService
    .createTextOutput(JSON.stringify(ok ? {ok:true,...msg} : {ok:false,erro:msg}))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    const itemId       = params.itemId   || '';
    const itemNome     = params.itemNome || '';
    const tipo         = params.tipo     || 'fardo'; // fardo | tampa | preforma
    const responsavel  = params.responsavel || '';

    // Novo frontend sempre envia totalUnidades pré-calculado; fallback para lógica legada
    let totalUnidades = parseInt(params.totalUnidades) || 0;
    if (!totalUnidades) {
      if (tipo === 'tampa') {
        totalUnidades = (parseInt(params.cxFechadas)||0) + (parseInt(params.cxAbertas)||0);
      } else if (tipo === 'preforma') {
        const fechadas = parseInt(params.cxFechadas) || 0;
        const abertas  = parseInt(params.cxAbertas)  || 0;
        const pct      = parseFloat(params.pctAberta) || 100;
        totalUnidades  = Math.round(fechadas + abertas * (pct / 100));
      }
    }

    if (!itemNome) return resp('itemNome obrigatório', false);
    if (totalUnidades < 1) return resp('Quantidade inválida', false);

    const headers = {
      'access_token':        GC.token,
      'secret_access_token': GC.secret,
      'Content-Type':        'application/json'
    };

    // Busca lista de produtos do GC
    const resProd = UrlFetchApp.fetch(`${GC.url}/produtos?limite=500`, { headers, muteHttpExceptions:true });
    if (resProd.getResponseCode() !== 200) return resp('Erro ao buscar produtos do GC: HTTP '+resProd.getResponseCode(), false);

    const produtos = JSON.parse(resProd.getContentText()).data || [];

    // Encontra produto por itemId (SKU) ou por palavras-chave do nome
    const idLower = itemId.toLowerCase();

    // Extrai tokens relevantes (>= 2 chars, sem palavras vazias)
    const tokens = itemNome.toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    let produto = null;

    // Estratégia 1: SKU exato (campo codigo)
    produto = produtos.find(p => (p.codigo || '').toLowerCase() === idLower);

    // Estratégia 2: todos os tokens presentes no nome do GC
    if (!produto && tokens.length) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        return tokens.every(t => pn.includes(t));
      });
    }

    // Estratégia 3: maioria dos tokens (>=60%) para tolerar pequenas divergências
    if (!produto && tokens.length) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        const matches = tokens.filter(t => pn.includes(t)).length;
        return matches / tokens.length >= 0.6;
      });
    }

    // Log para debug — mostra nomes disponíveis no GC quando não encontra
    if (!produto) {
      const nomes = produtos.slice(0, 30).map(p => p.nome).join(' | ');
      Logger.log('❌ Não encontrado: "' + itemNome + '" | Tokens: ' + tokens.join(',') + ' | GC nomes: ' + nomes);
      return resp('Produto não encontrado no GC: "' + itemNome + '" — verifique o log do Apps Script para ver os nomes cadastrados', false);
    }

    // Calcula novo estoque conforme modo da operação
    const estoqueAtual = gcNum(produto.estoque);
    const modo = (params.modo || 'conferencia').toLowerCase().trim();
    if (!['entrada','saida','conferencia'].includes(modo)) {
      return resp('Modo inválido: "' + modo + '". Válidos: entrada, saida, conferencia', false);
    }

    let novoEstoque;
    if (modo === 'entrada') {
      novoEstoque = estoqueAtual + totalUnidades;
    } else if (modo === 'saida') {
      if (totalUnidades > estoqueAtual) {
        return resp('Estoque insuficiente: atual=' + estoqueAtual + ' un, saída solicitada=' + totalUnidades + ' un', false);
      }
      novoEstoque = estoqueAtual - totalUnidades;
    } else {
      // conferencia: substitui (Modelo A)
      novoEstoque = totalUnidades;
    }

    // GC exige objeto completo no PUT — busca produto individual primeiro
    const getIndRes = UrlFetchApp.fetch(`${GC.url}/produtos/${produto.id}`, { headers, muteHttpExceptions:true });
    const getIndCode = getIndRes.getResponseCode();
    if (getIndCode !== 200) {
      return resp('GC GET individual falhou: HTTP '+getIndCode, false);
    }
    const produtoCompleto = JSON.parse(getIndRes.getContentText()).data || {};

    // Remove todos os campos read-only / calculados que GC rejeita no PUT
    const camposRemover = [
      'cadastrado_em','modificado_em','nome_grupo','grupo',
      'estoque_disponivel','imagens','variantes','tributacao',
      'preco_custo_medio','lucro','margem_lucro'
    ];
    camposRemover.forEach(c => delete produtoCompleto[c]);

    // GC retorna estoque como string no GET — mantemos string no PUT
    produtoCompleto.estoque = String(novoEstoque);

    const putBody = JSON.stringify(produtoCompleto);
    Logger.log('PUT body (primeiros 500 chars): ' + putBody.slice(0, 500));

    // IMPORTANTE: não usar contentType aqui — Content-Type já está em headers
    // Duplicar causa conflito no UrlFetchApp e pode corromper o request
    const putRes = UrlFetchApp.fetch(`${GC.url}/produtos/${produto.id}`, {
      method: 'PUT',
      headers,
      payload: putBody,
      muteHttpExceptions: true
    });

    const code = putRes.getResponseCode();
    const putRespText = putRes.getContentText();
    Logger.log('PUT response HTTP '+code+': '+putRespText.slice(0, 300));

    if (code < 200 || code > 299) {
      return resp('GC PUT falhou: HTTP '+code+' — '+putRespText.slice(0,300), false);
    }

    // Salva log do lançamento (últimos 100)
    const logKey = 'lancamentos_estoque';
    let logs = [];
    try { logs = JSON.parse(PropertiesService.getScriptProperties().getProperty(logKey) || '[]'); } catch(_){}
    logs.unshift({
      data:         Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      responsavel,
      modo,
      tipo,
      item:         produto.nome,
      quantidade:   totalUnidades,
      estoque_ant:  estoqueAtual,
      estoque_novo: novoEstoque
    });
    PropertiesService.getScriptProperties().setProperty(logKey, JSON.stringify(logs.slice(0, 100)));

    // Invalida cache do GC para forçar atualização
    PropertiesService.getScriptProperties().deleteProperty('gc_cache');

    const modoLog = { entrada:'+', saida:'-', conferencia:'=' }[modo] || '=';
    Logger.log(`✅ Lançamento [${modo}]: ${produto.nome} | ${modoLog}${totalUnidades} un | ${estoqueAtual} → ${novoEstoque}`);
    return resp({ produto: produto.nome, modo, estoque_anterior: estoqueAtual, estoque_novo: novoEstoque, quantidade_lancada: totalUnidades }, true);

  } catch(e) {
    Logger.log('❌ lancarEstoqueGC_: '+e.message);
    return resp(e.message, false);
  }
}

// ── Alertas ───────────────────────────────────────────────────
function alertaRoasShopee(roas, campanha) {
  if (roas >= METAS.roas_shopee_min) return;
  enviarTodos(
`🚨 *ALERTA — ROAS Shopee baixo*
Campanha: *${campanha}*
ROAS atual: *${roas.toFixed(2)}x* (mínimo: ${METAS.roas_shopee_min}x)
Ação: Revisar criativos e segmentação urgente.`);
}

function alertaSaldoShopee(saldo) {
  if (saldo > METAS.shopee_saldo_alerta) return;
  enviarTodos(
`⚠️ *ALERTA — Saldo Shopee ADS crítico*
Saldo atual: *R$ ${saldo}*
Recarregue antes que as campanhas sejam pausadas.`);
}

// ── WhatsApp ──────────────────────────────────────────────────
function enviarTodos(mensagem) {
  DESTINATARIOS.forEach(numero => enviarWA(numero, mensagem));
}

function enviarWA(numero, mensagem) {
  try {
    const url  = `${WA.url}/waInstance${WA.instance}/sendMessage/${WA.token}`;
    const body = JSON.stringify({ chatId: numero + '@c.us', message: mensagem });
    UrlFetchApp.fetch(url, {
      method: 'POST', contentType: 'application/json',
      payload: body, muteHttpExceptions: true
    });
    Logger.log('✅ WhatsApp enviado para ' + numero);
  } catch(e) {
    Logger.log('❌ Erro WhatsApp: ' + e.message);
  }
}

function testarWhatsApp() {
  enviarWA(DESTINATARIOS[0], '✅ *Teste Montenegro Dashboard*\nWhatsApp integrado com sucesso via Green API!');
}

// ── Helpers ───────────────────────────────────────────────────

// Verifica se uma linha é uma resposta real de formulário
// Coluna 0 = Timestamp do Google Forms — sempre preenchida em respostas reais
function _linhaReal(row) {
  return row[0] && String(row[0]).trim() !== '' && String(row[0]).trim() !== '0';
}

// Retorna a última linha com conteúdo real (pelo timestamp, coluna 0)
function ultimaLinha(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (_linhaReal(data[i])) return data[i];
  }
  return Array(20).fill('');
}

// Retorna a última linha de HOJE (col[0] = timestamp Forms)
// Se não há preenchimento hoje, retorna null
function ultimaLinhaDoDia(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  const hoje  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
  for (let i = data.length - 1; i >= 1; i--) {
    if (!_linhaReal(data[i])) continue;
    const ts = data[i][0];
    let dataTs;
    if (ts instanceof Date) {
      dataTs = Utilities.formatDate(ts, 'America/Sao_Paulo', 'dd/MM/yyyy');
    } else {
      // string ISO "2026-03-21 10:30:00" → converte para Date
      try { dataTs = Utilities.formatDate(new Date(ts), 'America/Sao_Paulo', 'dd/MM/yyyy'); }
      catch(_) { dataTs = ''; }
    }
    if (dataTs === hoje) return data[i];
  }
  return null; // sem preenchimento hoje
}

// Retorna linhas do DIA DE HOJE — vazio se não houve preenchimento hoje
// Regra: múltiplos turnos retornados quando há troca de molde no mesmo dia
function linhasDoDia(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();

  // Data de hoje no formato do formulário (col[2])
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');

  // Coleta TODAS as linhas reais de hoje
  const linhasHoje = [];
  for (let i = 1; i < data.length; i++) {
    if (!_linhaReal(data[i])) continue;
    const dataCol = data[i][2];
    let dataStr;
    if (dataCol instanceof Date) {
      dataStr = Utilities.formatDate(dataCol, 'America/Sao_Paulo', 'dd/MM/yyyy');
    } else {
      dataStr = String(dataCol).trim();
    }
    if (dataStr === hoje) linhasHoje.push(data[i]);
  }

  return linhasHoje; // [] = sem preenchimento hoje
}

function toNum(val) {
  const n = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// ── Configura todos os triggers — rode UMA VEZ ───────────────
function configurarTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Resumo diário às 18h (seg–sex)
  ScriptApp.newTrigger('resumoDiario18h')
    .timeBased().atHour(18).everyDays(1)
    .inTimezone('America/Sao_Paulo').create();

  // Fechamento semanal — sábado às 8h
  ScriptApp.newTrigger('fechamentoSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(8)
    .inTimezone('America/Sao_Paulo').create();

  // Sync Gestão Click a cada 10 minutos
  ScriptApp.newTrigger('syncGestaoClick')
    .timeBased().everyMinutes(10).create();

  // Sync Shopee a cada 30 minutos
  ScriptApp.newTrigger('syncShopee')
    .timeBased().everyMinutes(30).create();

  // onFormSubmit para cada planilha
  Object.values(IDS).forEach(id => {
    if (!id) return;
    try {
      ScriptApp.newTrigger('onFormSubmitHandler')
        .forSpreadsheet(SpreadsheetApp.openById(id))
        .onFormSubmit().create();
    } catch(e) { Logger.log('Trigger form: ' + e.message); }
  });

  Logger.log('✅ Todos os triggers configurados!');
}
