import os
import re
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from flask_cors import CORS
from sqlalchemy import or_

from models import (
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_AGUARDANDO_PAGAMENTO,
    STATUS_EXPIRADO,
    STATUS_KANBAN,
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


def expirar_pedidos_pendentes_antigos(minutos=60):
    """
    Marca como 'expirado' pedidos com status 'aguardando_pagamento'
    que foram criados há mais de `minutos` minutos (padrão: 60).
    """
    expirados = []
    try:
        limite = agora_utc() - timedelta(minutes=minutos)
        pedidos_pendentes = (
            Pedido.query.filter(
                Pedido.status == STATUS_AGUARDANDO_PAGAMENTO,
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
                pedido.status = STATUS_EXPIRADO
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
    if pedido.status in (STATUS_AGUARDANDO_PAGAMENTO, STATUS_EXPIRADO):
        pedido.status = STATUS_AGUARDANDO_APROVACAO
        pedido.atualizado_em = agora_utc()

    db.session.commit()
    return pedido


TABELA_PRECOS_ADICIONAIS = {
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
}
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
            nome_extra = match.group(2).strip().lower()
        else:
            qty = 1
            nome_extra = part.lower()
        preco_extra = TABELA_PRECOS_ADICIONAIS.get(nome_extra, 0.0)
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


@app.post("/api/pedidos")
def criar_pedido():
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

    if not digits:
        return erro("Informe o WhatsApp ou o ID do pedido.")

    filtros = []

    if tipo == "id":
        try:
            filtros.append(Pedido.id == int(digits))
        except (ValueError, OverflowError):
            return erro("Número de pedido inválido.")
    elif tipo == "whatsapp":
        if len(digits) < 8:
            return erro("Informe um número de WhatsApp válido (mínimo 8 dígitos).")
        termo_whatsapp = digits[-11:] if len(digits) >= 11 else digits
        filtros.append(Pedido.whatsapp_digits.contains(termo_whatsapp))
    else:
        # Fallback genérico se o tipo não for especificado
        if len(digits) <= 7:
            try:
                filtros.append(Pedido.id == int(digits))
            except (ValueError, OverflowError):
                pass
        if len(digits) >= 8:
            termo_whatsapp = digits[-11:] if len(digits) >= 11 else digits
            filtros.append(Pedido.whatsapp_digits.contains(termo_whatsapp))

    if not filtros:
        return erro("Informe um WhatsApp válido ou o número do pedido.")

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
