import sys
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app import app, db, restaurante_aberto, expirar_pedidos_pendentes_antigos
from models import Pedido, STATUS_AGUARDANDO_PAGAMENTO, STATUS_EXPIRADO

def test_schedules():
    # Terça 19:00 BRT -> Fechado
    dt_terca = datetime(2026, 9, 8, 22, 0, tzinfo=timezone.utc)
    aberto_terca, msg = restaurante_aberto(dt_terca)
    assert not aberto_terca, f"Terça deveria estar fechado, obtido: {aberto_terca}"
    assert "fechado" in msg.lower()

    # Quarta 19:00 BRT -> Aberto
    dt_quarta = datetime(2026, 9, 9, 22, 0, tzinfo=timezone.utc)
    aberto_quarta, msg = restaurante_aberto(dt_quarta)
    assert aberto_quarta, f"Quarta 19:00 deveria estar aberto, obtido: {aberto_quarta}"

    # Quarta 15:00 BRT -> Fechado
    dt_quarta_tarde = datetime(2026, 9, 9, 18, 0, tzinfo=timezone.utc)
    aberto_quarta_tarde, msg = restaurante_aberto(dt_quarta_tarde)
    assert not aberto_quarta_tarde, "Quarta 15:00 deveria estar fechado"

    # Sexta 23:30 BRT -> Aberto (vai até 00:00)
    dt_sex_noite = datetime(2026, 9, 12, 2, 30, tzinfo=timezone.utc)
    aberto_sex, msg = restaurante_aberto(dt_sex_noite)
    assert aberto_sex, "Sexta 23:30 deveria estar aberto"

    # Domingo 23:30 BRT -> Fechado (vai até 23:00)
    dt_dom_noite = datetime(2026, 9, 14, 2, 30, tzinfo=timezone.utc)
    aberto_dom, msg = restaurante_aberto(dt_dom_noite)
    assert not aberto_dom, "Domingo 23:30 deveria estar fechado"

    print("✓ Testes de horários de funcionamento passaram com sucesso!")

def test_expiration():
    with app.app_context():
        agora = datetime.now(timezone.utc)
        p1 = Pedido(
            nome="Teste Expirar", whatsapp="(31) 99999-9999", whatsapp_digits="31999999999",
            forma_entrega="Retirada", forma_pagamento="pix", subtotal=30.0, total=30.0,
            status=STATUS_AGUARDANDO_PAGAMENTO, pago=False,
            criado_em=agora - timedelta(minutes=70)
        )
        p2 = Pedido(
            nome="Teste Recente", whatsapp="(31) 99999-9999", whatsapp_digits="31999999999",
            forma_entrega="Retirada", forma_pagamento="pix", subtotal=30.0, total=30.0,
            status=STATUS_AGUARDANDO_PAGAMENTO, pago=False,
            criado_em=agora - timedelta(minutes=10)
        )
        db.session.add_all([p1, p2])
        db.session.commit()

        expirados = expirar_pedidos_pendentes_antigos(minutos=60)
        db.session.refresh(p1)
        db.session.refresh(p2)
        assert p1.status == STATUS_EXPIRADO, f"p1 deveria ser expirado mas é {p1.status}"
        assert p2.status == STATUS_AGUARDANDO_PAGAMENTO, f"p2 deveria ser aguardando_pagamento mas é {p2.status}"
        print("✓ Teste de expiração de pedidos PIX antigos passou com sucesso!")

        db.session.delete(p1)
        db.session.delete(p2)
        db.session.commit()

if __name__ == "__main__":
    test_schedules()
    test_expiration()
    print("TODOS OS TESTES PASSARAM COM SUCESSO!")
