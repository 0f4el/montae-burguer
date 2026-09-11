from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

STATUS_AGUARDANDO_PAGAMENTO = "aguardando_pagamento"
STATUS_AGUARDANDO_APROVACAO = "aguardando_aprovacao"
STATUS_EM_PREPARACAO = "em_preparacao"
STATUS_PRONTO_PARA_RETIRADA = "pronto_para_retirada"
STATUS_SAIU_PARA_ENTREGA = "saiu_para_entrega"
STATUS_FINALIZADO = "finalizado"
STATUS_CANCELADO = "cancelado"
STATUS_EXPIRADO = "expirado"

STATUS_KANBAN = (
    STATUS_AGUARDANDO_APROVACAO,
    STATUS_EM_PREPARACAO,
    STATUS_PRONTO_PARA_RETIRADA,
    STATUS_SAIU_PARA_ENTREGA,
    STATUS_FINALIZADO,
    STATUS_CANCELADO,
)

STATUS_LABELS = {
    STATUS_AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    STATUS_AGUARDANDO_APROVACAO: "Aguardando aprovação",
    STATUS_EM_PREPARACAO: "Em preparação",
    STATUS_PRONTO_PARA_RETIRADA: "Pronto para retirada",
    STATUS_SAIU_PARA_ENTREGA: "Saiu para entrega",
    STATUS_FINALIZADO: "Finalizado",
    STATUS_CANCELADO: "Cancelado",
    STATUS_EXPIRADO: "Expirado",
}


def agora_utc():
    return datetime.now(timezone.utc)


def format_iso_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class Pedido(db.Model):
    __tablename__ = "pedidos"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False, index=True)
    whatsapp = db.Column(db.String(30), nullable=False)
    whatsapp_digits = db.Column(db.String(20), nullable=False, index=True)
    forma_entrega = db.Column(db.String(20), nullable=False)
    endereco = db.Column(db.Text)
    observacao = db.Column(db.Text)
    forma_pagamento = db.Column(db.String(80), nullable=False)
    troco = db.Column(db.String(80))
    subtotal = db.Column(db.Float, nullable=False)
    taxa_entrega = db.Column(db.Float, nullable=False, default=0)
    total = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(40), nullable=False, index=True)
    criado_em = db.Column(db.DateTime, nullable=False, default=agora_utc)
    atualizado_em = db.Column(db.DateTime, nullable=False, default=agora_utc, onupdate=agora_utc)
    order_nsu = db.Column(db.String(80), unique=True, index=True)
    pago = db.Column(db.Boolean, nullable=False, default=False)
    whatsapp_enviado = db.Column(db.Boolean, nullable=False, default=False)
    captura_pagamento = db.Column(db.String(40))

    itens = db.relationship(
        "ItemPedido",
        backref="pedido",
        cascade="all, delete-orphan",
        order_by="ItemPedido.id",
    )

    def to_dict(self, incluir_itens=True):
        payload = {
            "id": self.id,
            "nome": self.nome,
            "whatsapp": self.whatsapp,
            "forma_entrega": self.forma_entrega,
            "endereco": self.endereco,
            "observacao": self.observacao,
            "forma_pagamento": self.forma_pagamento,
            "troco": self.troco,
            "subtotal": round(self.subtotal or 0, 2),
            "taxa_entrega": round(self.taxa_entrega or 0, 2),
            "total": round(self.total or 0, 2),
            "status": self.status,
            "status_label": STATUS_LABELS.get(self.status, self.status),
            "criado_em": format_iso_utc(self.criado_em),
            "pago": bool(self.pago),
        }
        if incluir_itens:
            payload["hamburgueres"] = [item.to_dict() for item in self.itens]
        return payload


class ItemPedido(db.Model):
    __tablename__ = "itens_pedido"

    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey("pedidos.id"), nullable=False)
    titulo = db.Column(db.String(120), nullable=False)
    quantidade = db.Column(db.Integer, nullable=False, default=1)
    preco = db.Column(db.Float, nullable=False)
    pao = db.Column(db.String(80))
    ponto = db.Column(db.String(80))
    cebola = db.Column(db.String(80))
    queijo = db.Column(db.String(80))
    molho_gratis = db.Column(db.String(80))
    adicionais = db.Column(db.Text)
    observacao = db.Column(db.Text)

    def to_dict(self):
        return {
            "id": self.id,
            "titulo": self.titulo,
            "quantidade": self.quantidade,
            "preco": round(self.preco or 0, 2),
            "pao": self.pao,
            "ponto": self.ponto,
            "cebola": self.cebola,
            "queijo": self.queijo,
            "molho_gratis": self.molho_gratis,
            "adicionais": self.adicionais or "Nenhum",
            "observacao": self.observacao or "",
        }
