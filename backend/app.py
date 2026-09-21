import os
import re
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from flask_cors import CORS
from sqlalchemy import func, or_

from models import (
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_AGUARDANDO_PAGAMENTO,
    STATUS_CANCELADO,
    STATUS_EXPIRADO,
    STATUS_KANBAN,
    Configuracao,
    ItemPedido,
    Pedido,
    agora_utc,
    db,
)
from payments import consultar_pagamento_infinitepay, criar_checkout_infinitepay

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
INSTANCE_DIR = BACKEND_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="",
    template_folder=str(BACKEND_DIR / "templates"),
    instance_path=str(INSTANCE_DIR),
)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "troque-esta-chave-em-producao")

database_url = os.getenv(
    "DATABASE_URL",
    "sqlite:///" + (INSTANCE_DIR / "montae.db").as_posix(),
)
# Render fornece URLs do Postgres iniciando com postgres://, mas o SQLAlchemy 1.4+ exige postgresql://
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

db.init_app(app)
CORS(app, supports_credentials=True)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "montaeadmin")


def restaurante_aberto(dt=None):
    """
    Verifica se o restaurante está aberto com base no fuso horário de Brasília (UTC-3):
    Segunda: 18:30 às 23:00
    Terça-feira: Fechado
    Quarta: 18:30 às 23:00
    Quinta: 18:30 às 23:00
    Sexta: 18:30 às 00:00 (23:59:59)
    Sábado: 18:30 às 00:00 (23:59:59)
    Domingo: 18:30 às 23:00
    
    Pode ser desativado pelo admin através do painel.
    """
    # Verifica se a validação de horário está desativada (configuração do banco tem prioridade)
    ignorar = Configuracao.get("ignorar_horario_funcionamento", "false").lower()
    if ignorar in ("true", "1", "yes"):
        return True, ""
    
    # Fallback para variável de ambiente (compatibilidade)
    if os.getenv("IGNORAR_HORARIO_FUNCIONAMENTO", "false").lower() in ("true", "1", "yes"):
        return True, ""

    now_utc = dt or agora_utc()
    fuso_br = timezone(timedelta(hours=-3))
    agora_br = now_utc.astimezone(fuso_br)
    dia_semana = agora_br.weekday()  # Python: 0=Seg, 1=Ter, 2=Qua, 3=Qui, 4=Sex, 5=Sáb, 6=Dom
    minutos = agora_br.hour * 60 + agora_br.minute

    # 0=Seg, 2=Qua, 3=Qui, 6=Dom: 18:30 (1110) até 23:00 (1380)
    # 4=Sex, 5=Sáb: 18:30 (1110) até 24:00 (1440)
    # 1=Terça: Fechado
    aberto = False
    if dia_semana in (0, 2, 3, 6):
        aberto = (1110 <= minutos <= 1380)
    elif dia_semana in (4, 5):
        aberto = (1110 <= minutos <= 1440)
    else:
        aberto = False

    if not aberto:
        mensagem = (
            "O restaurante está fechado no momento. "
            "Horário de atendimento: Seg, Qua, Qui e Dom das 18:30 às 23:00 | "
            "Sex e Sáb das 18:30 às 00:00 | Terça-feira: Fechado."
        )
        return False, mensagem

    return True, ""


def expirar_pedidos_pendentes_antigos(minutos=60):
    """
    Marca como 'cancelado' pedidos com status 'aguardando_pagamento' ou 'expirado'
    que foram criados há mais de `minutos` minutos (padrão: 60).
    Pedidos expirados também são movidos para cancelado.
    """
    expirados = []
    try:
        limite = agora_utc() - timedelta(minutes=minutos)
        pedidos_pendentes = (
            Pedido.query.filter(
                Pedido.status.in_([STATUS_AGUARDANDO_PAGAMENTO, STATUS_EXPIRADO]),
                Pedido.pago == False,  # noqa: E712
            )
            .all()
        )

        for pedido in pedidos_pendentes:
            if not pedido.criado_em:
                continue
            criado = pedido.criado_em
            if criado.tzinfo is None:
                criado = criado.replace(tzinfo=timezone.utc)
            if criado <= limite:
                pedido.status = STATUS_CANCELADO
                pedido.atualizado_em = agora_utc()
                expirados.append(pedido)

        if expirados:
            db.session.commit()
    except Exception as exc:
        print(f"Erro ao expirar pedidos antigos: {exc}")
        db.session.rollback()
    return expirados

def somente_digitos(valor):
    return re.sub(r"\D", "", str(valor or ""))


def erro(mensagem, status=400):
    return jsonify({"detail": mensagem}), status


def login_admin_obrigatorio(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            if request.path.startswith("/api/"):
                return erro("Não autorizado.", 401)
            return redirect(url_for("admin_login"))
        return view(*args, **kwargs)

    return wrapper


def ativar_pedido_pago(pedido, capture_method=None):
    if capture_method:
        pedido.captura_pagamento = capture_method
        pedido.forma_pagamento = (
            "PIX (PAGO E CONFIRMADO)"
            if capture_method == "pix"
            else "PAGAMENTO ONLINE (PAGO E CONFIRMADO)"
        )

    pedido.pago = True
    # Reativa pedido cancelado, expirado ou aguardando pagamento quando o pagamento é confirmado
    if pedido.status in (STATUS_AGUARDANDO_PAGAMENTO, STATUS_EXPIRADO, STATUS_CANCELADO):
        pedido.status = STATUS_AGUARDANDO_APROVACAO
        pedido.atualizado_em = agora_utc()

    db.session.commit()
    return pedido


import unicodedata

TABELA_PRECOS_ADICIONAIS = {
    # Extras do Hambúrguer
    "blend 120g": 10.00,
    "blend 120g (carne extra)": 10.00,
    "carne extra": 10.00,
    "ovo extra": 4.00,
    "bacon extra": 5.00,
    "queijo cheddar extra": 4.00,
    "queijo mussarela extra": 4.00,
    "queijo prato extra": 4.00,
    "onion rings extra": 4.00,
    "cebola chapeada extra": 3.00,
    "cebola caramelizada extra": 3.50,
    "baconese extra": 3.00,
    "maionese temperada extra": 3.00,
    
    # Bebidas
    "coca-cola 1l": 12.00,
    "coca cola 1l": 12.00,
    "coca-cola zero 1l": 12.00,
    "coca cola zero 1l": 12.00,
    "guarana antarctica 1l": 10.00,
    "guaraná antarctica 1l": 10.00,
    "quarana antarctica 1l": 10.00,
    "quarana antárctica 1l": 10.00,
    "mate couro 1l": 9.00,
    "suco lata (uva)": 8.00,
    "suco lata uva": 8.00,
    "suco lata (manga)": 8.00,
    "suco lata manga": 8.00,
    "suco lata (pêssego)": 8.00,
    "suco lata (pessego)": 8.00,
    "suco lata pessego": 8.00,
    "suco caixinha 250ml (uva)": 5.00,
    "suco caixinha 250ml uva": 5.00,
    "suco caixinha 250 ml (uva)": 5.00,
    "suco caixinha 250 ml uva": 5.00,
    "suco caixinha 250ml (manga)": 5.00,
    "suco caixinha 250ml manga": 5.00,
    "suco caixinha 250 ml (manga)": 5.00,
    "suco caixinha 250 ml manga": 5.00,
    "suco caixinha 250ml (goiaba)": 5.00,
    "suco caixinha 250ml goiaba": 5.00,
    "suco caixinha 250 ml (goiaba)": 5.00,
    "suco caixinha 250 ml goiaba": 5.00,
}

def normalizar_chave_adicional(texto):
    if not texto:
        return ""
    t = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    t = re.sub(r'[^\w\s\d]', ' ', t.lower())
    return re.sub(r'\s+', ' ', t).strip()

TABELA_NORMALIZADA = {normalizar_chave_adicional(k): v for k, v in TABELA_PRECOS_ADICIONAIS.items()}

PRECO_BASE_COMBO = 29.90
PRECO_ITEM_TESTE = 1.00


def calcular_preco_unitario_item(titulo, adicionais_str):
    if "teste" in titulo.lower():
        return PRECO_ITEM_TESTE
    preco = PRECO_BASE_COMBO
    if not adicionais_str or adicionais_str.strip().lower() in ("nenhum", ""):
        return round(preco, 2)

    for part in adicionais_str.split(","):
        part = part.strip()
        if not part:
            continue
        match = re.match(r"^(\d+)\s*x\s*(.*)$", part, re.IGNORECASE)
        if match:
            qty = int(match.group(1))
            nome_extra = match.group(2).strip()
        else:
            qty = 1
            nome_extra = part.strip()
        
        # Busca direta ou normalizada
        preco_extra = TABELA_PRECOS_ADICIONAIS.get(nome_extra.lower())
        if preco_extra is None:
            preco_extra = TABELA_NORMALIZADA.get(normalizar_chave_adicional(nome_extra), 0.0)
        
        preco += qty * preco_extra
    return round(preco, 2)


def montar_itens(payload_itens):
    itens = []
    if not isinstance(payload_itens, list) or not payload_itens:
        raise ValueError("O pedido precisa ter ao menos um hambúrguer.")

    for bruto in payload_itens:
        quantidade = int(bruto.get("quantity") or bruto.get("quantidade") or 1)
        if quantidade <= 0:
            raise ValueError("Item do pedido com quantidade inválida.")

        adicionais = bruto.get("adicionais")
        if isinstance(adicionais, list):
            adicionais = ", ".join(str(item) for item in adicionais if item)

        titulo = str(bruto.get("title") or bruto.get("titulo") or "Combo Hambúrguer Artesanal").strip()
        adicionais_str = str(adicionais or "Nenhum").strip()
        preco_calculado = calcular_preco_unitario_item(titulo, adicionais_str)

        itens.append(
            ItemPedido(
                titulo=titulo,
                quantidade=quantidade,
                preco=preco_calculado,
                pao=str(bruto.get("pao") or ""),
                ponto=str(bruto.get("ponto") or ""),
                cebola=str(bruto.get("cebola") or ""),
                queijo=str(bruto.get("queijo") or ""),
                molho_gratis=str(bruto.get("molhoGratis") or bruto.get("molho_gratis") or ""),
                adicionais=adicionais_str,
                observacao=str(bruto.get("observacao") or ""),
            )
        )
    return itens


with app.app_context():
    db.create_all()


@app.get("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/pagamento-sucesso.html")
def pagamento_sucesso():
    return send_from_directory(FRONTEND_DIR, "pagamento-sucesso.html")


@app.get("/admin/login")
def admin_login():
    if session.get("admin"):
        return redirect(url_for("admin_painel"))
    return render_template("admin_login.html", erro=None)


@app.post("/admin/login")
def admin_login_post():
    senha = (request.form.get("password") or "").strip()
    if senha != ADMIN_PASSWORD:
        return render_template("admin_login.html", erro="Senha incorreta."), 401
    session["admin"] = True
    return redirect(url_for("admin_painel"))


@app.post("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("admin_login"))


@app.get("/admin")
@login_admin_obrigatorio
def admin_painel():
    return render_template("admin.html")


@app.get("/api/health")
def health():
    return {"status": "Servidor Flask do Montaê Burguer rodando com sucesso!"}


@app.get("/api/status-loja")
def status_loja():
    aberto, msg = restaurante_aberto()
    return jsonify({
        "aberto": aberto,
        "mensagem": msg if not aberto else "Restaurante aberto para pedidos.",
    })


@app.post("/api/pedidos")
def criar_pedido():
    aberto, msg_fechado = restaurante_aberto()
    if not aberto:
        return erro(msg_fechado)

    data = request.get_json(silent=True) or {}
    nome = str(data.get("nome") or data.get("name") or "").strip()
    whatsapp = str(data.get("whatsapp") or data.get("phone") or "").strip()
    digits = somente_digitos(whatsapp)
    forma_entrega = str(data.get("forma_entrega") or data.get("deliveryType") or "").strip()
    forma_pagamento = str(data.get("forma_pagamento") or data.get("paymentMethod") or "").strip().lower()
    observacao = str(data.get("observacao") or data.get("notes") or "").strip()
    troco = str(data.get("troco") or "").strip()
    endereco = str(data.get("endereco") or data.get("address") or "").strip()
    itens_payload = data.get("hamburgueres") or data.get("itens") or data.get("cart") or []

    if not nome:
        return erro("Informe o nome do cliente.")
    if len(digits) != 11 or digits[2] != "9":
        return erro("Informe um WhatsApp válido no formato (DDD) 9 XXXX XXXX.")
    if forma_entrega not in ("Delivery", "Retirada"):
        return erro("Forma de entrega inválida.")
    if forma_pagamento not in ("pix", "cartao_entrega", "dinheiro"):
        return erro("Forma de pagamento inválida.")
    if forma_entrega == "Delivery" and (not endereco or endereco.startswith("N/A")):
        return erro("Informe o endereço de entrega.")

    try:
        itens = montar_itens(itens_payload)
        subtotal_calculado = round(sum(item.preco * item.quantidade for item in itens), 2)
        taxa_informada = round(float(data.get("taxaEntrega") or data.get("taxa_entrega") or 0), 2)
        taxa_entrega = max(0.0, taxa_informada) if forma_entrega == "Delivery" else 0.0
        total_calculado = round(subtotal_calculado + taxa_entrega, 2)
        subtotal = subtotal_calculado
        total = total_calculado
    except (TypeError, ValueError) as exc:
        return erro(str(exc) if str(exc) else "Dados do pedido inválidos.")

    if total <= 0:
        return erro("O total do pedido deve ser maior que zero.")

    pedido = Pedido(
        nome=nome,
        whatsapp=whatsapp,
        whatsapp_digits=digits,
        forma_entrega=forma_entrega,
        endereco=endereco if forma_entrega == "Delivery" else None,
        observacao=observacao or None,
        forma_pagamento=forma_pagamento,
        troco=troco if forma_pagamento == "dinheiro" else None,
        subtotal=subtotal,
        taxa_entrega=taxa_entrega if forma_entrega == "Delivery" else 0,
        total=total,
        status=STATUS_AGUARDANDO_PAGAMENTO if forma_pagamento == "pix" else STATUS_AGUARDANDO_APROVACAO,
        pago=False,
        itens=itens,
    )
    db.session.add(pedido)
    db.session.flush()

    resposta = {"pedido": pedido.to_dict()}

    if forma_pagamento == "pix":
        checkout, falha = criar_checkout_infinitepay(nome, total)
        if falha:
            db.session.rollback()
            return falha
        pedido.order_nsu = checkout["order_nsu"]
        db.session.commit()
        resposta["pedido"] = pedido.to_dict()
        resposta["checkout_url"] = checkout["checkout_url"]
        resposta["order_nsu"] = checkout["order_nsu"]
        return jsonify(resposta)

    db.session.commit()
    resposta["pedido"] = pedido.to_dict()
    return jsonify(resposta), 201


@app.post("/api/pedidos/acompanhar")
def acompanhar_pedido():
    expirar_pedidos_pendentes_antigos()
    data = request.get_json(silent=True) or {}
    tipo = str(data.get("tipo") or "").strip().lower()
    consulta = str(data.get("consulta") or data.get("q") or "").strip()
    digits = somente_digitos(consulta)

    if not consulta:
        return erro("Informe o WhatsApp ou o Nome para acompanhar o pedido.")

    filtros = []

    if tipo == "nome":
        if len(consulta) < 2:
            return erro("Informe pelo menos 2 caracteres do nome para buscar.")
        filtros.append(func.lower(func.trim(Pedido.nome)) == consulta.lower())
    elif tipo == "whatsapp":
        if not digits or len(digits) < 8:
            return erro("Informe um número de WhatsApp válido (mínimo 8 dígitos).")
        termo_whatsapp = digits[-11:] if len(digits) >= 11 else digits
        filtros.append(Pedido.whatsapp_digits.contains(termo_whatsapp))
    else:
        # Fallback genérico se o tipo não for especificado
        if digits and len(digits) >= 8:
            termo_whatsapp = digits[-11:] if len(digits) >= 11 else digits
            filtros.append(Pedido.whatsapp_digits.contains(termo_whatsapp))
        if len(consulta) >= 2:
            filtros.append(func.lower(func.trim(Pedido.nome)) == consulta.lower())

    if not filtros:
        return erro("Informe um WhatsApp válido ou o seu nome.")

    pedidos = (
        Pedido.query.filter(or_(*filtros))
        .order_by(Pedido.criado_em.desc())
        .limit(8)
        .all()
    )
    return jsonify({"pedidos": [pedido.to_dict() for pedido in pedidos]})


@app.post("/api/verificar-pix")
def verificar_pix():
    expirar_pedidos_pendentes_antigos()
    data = request.get_json(silent=True) or {}
    campos = ("order_nsu", "transaction_nsu", "slug")
    if any(not str(data.get(campo) or "").strip() for campo in campos):
        return erro("Dados de confirmação incompletos.")

    pagamento, falha = consultar_pagamento_infinitepay(
        data["order_nsu"], data["transaction_nsu"], data["slug"]
    )
    if falha:
        return falha

    pedido = Pedido.query.filter_by(order_nsu=data["order_nsu"]).first()
    if pagamento["paid"] and pedido:
        ativar_pedido_pago(pedido, pagamento.get("capture_method"))

    return jsonify(
        {
            "paid": pagamento["paid"],
            "capture_method": pagamento.get("capture_method"),
            "pedido": pedido.to_dict() if pedido and pagamento["paid"] else None,
        }
    )


@app.post("/api/webhooks/infinitepay")
def webhook_infinitepay():
    payload = request.get_json(silent=True) or {}
    order_nsu = payload.get("order_nsu")
    transaction_nsu = payload.get("transaction_nsu")
    slug = payload.get("slug") or os.getenv("INFINITEPAY_HANDLE", "").strip()

    if order_nsu and transaction_nsu:
        pedido = Pedido.query.filter_by(order_nsu=order_nsu).first()
        if pedido and not pedido.pago:
            # Consulta a API da InfinitePay para validar autenticidade do pagamento
            pagamento, falha = consultar_pagamento_infinitepay(order_nsu, transaction_nsu, slug)
            if not falha and pagamento and pagamento.get("paid"):
                ativar_pedido_pago(pedido, pagamento.get("capture_method") or payload.get("capture_method") or "pix")
                print(f"Pagamento InfinitePay autenticado e confirmado para o pedido {order_nsu}.")
            else:
                print(f"Webhook InfinitePay recebido mas o pagamento não foi validado na API: {order_nsu}")
    return {"status": "ok"}


@app.get("/api/admin/pedidos")
@login_admin_obrigatorio
def admin_listar_pedidos():
    expirar_pedidos_pendentes_antigos()
    pedidos = (
        Pedido.query.filter(Pedido.status.in_(STATUS_KANBAN))
        .order_by(Pedido.criado_em.asc())
        .all()
    )
    colunas = {status: [] for status in STATUS_KANBAN}
    for pedido in pedidos:
        colunas[pedido.status].append(pedido.to_dict())
    return jsonify({"colunas": colunas})


@app.get("/api/admin/pedidos/todos")
@login_admin_obrigatorio
def admin_listar_todos_pedidos():
    expirar_pedidos_pendentes_antigos()
    pedidos = Pedido.query.order_by(Pedido.criado_em.desc()).all()
    return jsonify({"pedidos": [pedido.to_dict() for pedido in pedidos]})


@app.get("/api/admin/dashboard")
@login_admin_obrigatorio
def admin_dashboard():
    """Retorna estatísticas do comércio para o dashboard administrativo"""
    fuso_br = timezone(timedelta(hours=-3))
    agora_br = agora_utc().astimezone(fuso_br)
    inicio_hoje = agora_br.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_semana = inicio_hoje - timedelta(days=agora_br.weekday())
    inicio_mes = agora_br.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Converter para UTC para consultas no banco
    inicio_hoje_utc = inicio_hoje.astimezone(timezone.utc)
    inicio_semana_utc = inicio_semana.astimezone(timezone.utc)
    inicio_mes_utc = inicio_mes.astimezone(timezone.utc)

    # Status que representam vendas efetivas (não cancelados/expirados/aguardando)
    status_venda = [
        STATUS_AGUARDANDO_APROVACAO, "em_preparacao",
        "pronto_para_retirada", "saiu_para_entrega", "finalizado",
    ]

    def stats_periodo(inicio_utc):
        pedidos = Pedido.query.filter(
            Pedido.criado_em >= inicio_utc,
            Pedido.status.in_(status_venda),
        ).all()
        total_vendas = round(sum(p.total for p in pedidos), 2)
        total_pedidos = len(pedidos)
        ticket_medio = round(total_vendas / total_pedidos, 2) if total_pedidos else 0
        total_taxas_entrega = round(sum(float(p.taxa_entrega or 0) for p in pedidos if p.forma_entrega == "Delivery"), 2)
        valor_delivery = round(sum(p.total for p in pedidos if p.forma_entrega == "Delivery"), 2)
        valor_retirada = round(sum(p.total for p in pedidos if p.forma_entrega != "Delivery"), 2)
        delivery = sum(1 for p in pedidos if p.forma_entrega == "Delivery")
        retirada = total_pedidos - delivery
        pix = sum(1 for p in pedidos if "pix" in (p.forma_pagamento or "").lower())
        dinheiro = sum(1 for p in pedidos if p.forma_pagamento == "dinheiro")
        cartao = sum(1 for p in pedidos if "cartao" in (p.forma_pagamento or "").lower())
        return {
            "total_vendas": total_vendas,
            "total_pedidos": total_pedidos,
            "ticket_medio": ticket_medio,
            "total_taxas_entrega": total_taxas_entrega,
            "valor_delivery": valor_delivery,
            "valor_retirada": valor_retirada,
            "delivery": delivery,
            "retirada": retirada,
            "pix": pix,
            "dinheiro": dinheiro,
            "cartao": cartao,
        }

    hoje = stats_periodo(inicio_hoje_utc)
    semana = stats_periodo(inicio_semana_utc)
    mes = stats_periodo(inicio_mes_utc)

    # Vendas dos últimos 7 dias (para gráfico)
    vendas_por_dia = []
    for i in range(6, -1, -1):
        dia = inicio_hoje - timedelta(days=i)
        dia_seguinte = dia + timedelta(days=1)
        dia_utc = dia.astimezone(timezone.utc)
        dia_seguinte_utc = dia_seguinte.astimezone(timezone.utc)
        pedidos_dia = Pedido.query.filter(
            Pedido.criado_em >= dia_utc,
            Pedido.criado_em < dia_seguinte_utc,
            Pedido.status.in_(status_venda),
        ).all()
        vendas_por_dia.append({
            "data": dia.strftime("%d/%m"),
            "dia_semana": ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][dia.weekday()],
            "total": round(sum(p.total for p in pedidos_dia), 2),
            "pedidos": len(pedidos_dia),
        })

    # Pedidos recentes (últimos 5 finalizados)
    recentes = Pedido.query.filter(
        Pedido.status == "finalizado"
    ).order_by(Pedido.atualizado_em.desc()).limit(5).all()

    # Totais gerais (all time)
    total_geral = Pedido.query.filter(Pedido.status.in_(status_venda)).count()
    receita_geral = db.session.query(
        func.coalesce(func.sum(Pedido.total), 0)
    ).filter(Pedido.status.in_(status_venda)).scalar()
    total_taxas_geral = db.session.query(
        func.coalesce(func.sum(Pedido.taxa_entrega), 0)
    ).filter(Pedido.status.in_(status_venda), Pedido.forma_entrega == "Delivery").scalar()
    total_retirada_geral = db.session.query(
        func.coalesce(func.sum(Pedido.total), 0)
    ).filter(Pedido.status.in_(status_venda), Pedido.forma_entrega != "Delivery").scalar()
    total_delivery_geral = db.session.query(
        func.coalesce(func.sum(Pedido.total), 0)
    ).filter(Pedido.status.in_(status_venda), Pedido.forma_entrega == "Delivery").scalar()

    # Pedidos cancelados hoje
    cancelados_hoje = Pedido.query.filter(
        Pedido.criado_em >= inicio_hoje_utc,
        Pedido.status.in_([STATUS_CANCELADO, STATUS_EXPIRADO]),
    ).count()

    return jsonify({
        "hoje": hoje,
        "semana": semana,
        "mes": mes,
        "vendas_por_dia": vendas_por_dia,
        "recentes": [p.to_dict(incluir_itens=False) for p in recentes],
        "totais": {
            "pedidos": total_geral,
            "receita": round(float(receita_geral), 2),
            "taxas_entrega": round(float(total_taxas_geral), 2),
            "valor_retirada": round(float(total_retirada_geral), 2),
            "valor_delivery": round(float(total_delivery_geral), 2),
        },
        "cancelados_hoje": cancelados_hoje,
        "hora_servidor": agora_br.strftime("%H:%M"),
    })

@app.get("/api/admin/configuracoes/horario-funcionamento")
@login_admin_obrigatorio
def obter_config_horario():
    """Retorna o estado atual da validação de horário de funcionamento"""
    ignorar = Configuracao.get("ignorar_horario_funcionamento", "false")
    return jsonify({
        "ignorar_horario_funcionamento": ignorar.lower() in ("true", "1", "yes"),
        "aberto_agora": restaurante_aberto()[0]
    })

@app.post("/api/admin/configuracoes/horario-funcionamento")
@login_admin_obrigatorio
def atualizar_config_horario():
    """Ativa ou desativa a validação de horário de funcionamento"""
    data = request.get_json(silent=True) or {}
    ignorar = data.get("ignorar", False)
    
    Configuracao.set("ignorar_horario_funcionamento", "true" if ignorar else "false")
    
    return jsonify({
        "success": True,
        "ignorar_horario_funcionamento": ignorar,
        "mensagem": "Horário de funcionamento desativado. Loja aceita pedidos 24/7." if ignorar 
                   else "Horário de funcionamento ativado. Loja só aceita pedidos no horário configurado."
    })

@app.patch("/api/admin/pedidos/<int:pedido_id>/status")
@login_admin_obrigatorio
def admin_atualizar_status(pedido_id):
    data = request.get_json(silent=True) or {}
    novo_status = str(data.get("status") or "").strip()
    if novo_status not in STATUS_KANBAN:
        return erro("Status inválido.")

    pedido = Pedido.query.get_or_404(pedido_id)
    if pedido.status not in STATUS_KANBAN and pedido.status != STATUS_AGUARDANDO_PAGAMENTO:
        return erro("Este pedido não pode ser movido no quadro.")
    if pedido.status == STATUS_AGUARDANDO_PAGAMENTO:
        return erro("Este pedido ainda está aguardando pagamento.")

    pedido.status = novo_status
    pedido.atualizado_em = agora_utc()
    db.session.commit()
    return jsonify({"pedido": pedido.to_dict()})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
