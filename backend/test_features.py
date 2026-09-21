import sys
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app import app, db, restaurante_aberto, expirar_pedidos_pendentes_antigos
from models import Pedido, STATUS_AGUARDANDO_PAGAMENTO, STATUS_EXPIRADO

from models import STATUS_CANCELADO

from models import Configuracao

def test_schedules():
    with app.app_context():
        Configuracao.set("ignorar_horario_funcionamento", "false")
        os.environ["IGNORAR_HORARIO_FUNCIONAMENTO"] = "false"
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
        assert p1.status == STATUS_CANCELADO, f"p1 deveria ser cancelado mas é {p1.status}"
        assert p2.status == STATUS_AGUARDANDO_PAGAMENTO, f"p2 deveria ser aguardando_pagamento mas é {p2.status}"
        print("✓ Teste de cancelamento/expiração de pedidos PIX antigos passou com sucesso!")

        db.session.delete(p1)
        db.session.delete(p2)
        db.session.commit()

def test_adicionais():
    with app.app_context():
        from app import calcular_preco_unitario_item, PRECO_BASE_COMBO
        preco = calcular_preco_unitario_item("Combo Hambúrguer Artesanal", "1x Blend 120g, 2x Ovo Extra")
        esperado = PRECO_BASE_COMBO + 10.00 + (2 * 4.00)
        assert preco == round(esperado, 2), f"Preço incorreto: {preco} vs {esperado}"
        print("✓ Teste de cálculo de adicionais (incluindo Blend 120g) passou com sucesso!")

def test_dashboard():
    with app.app_context():
        # Cria um cliente de teste autenticado
        with app.test_client() as client:
            with client.session_transaction() as sess:
                sess["admin"] = True
            
            # Insere pedidos de delivery e retirada para teste
            agora = datetime.now(timezone.utc)
            p_del = Pedido(
                nome="Cliente Delivery", whatsapp="(31) 99999-1111", whatsapp_digits="31999991111",
                forma_entrega="Delivery", forma_pagamento="pix", subtotal=50.0, taxa_entrega=7.0, total=57.0,
                status="finalizado", pago=True, criado_em=agora
            )
            p_ret = Pedido(
                nome="Cliente Retirada", whatsapp="(31) 99999-2222", whatsapp_digits="31999992222",
                forma_entrega="Retirada", forma_pagamento="dinheiro", subtotal=40.0, taxa_entrega=0.0, total=40.0,
                status="finalizado", pago=True, criado_em=agora
            )
            db.session.add_all([p_del, p_ret])
            db.session.commit()

            res = client.get("/api/admin/dashboard")
            assert res.status_code == 200, f"Status code inesperado: {res.status_code}"
            data = res.get_json()

            assert "total_taxas_entrega" in data["hoje"], "total_taxas_entrega faltando em hoje"
            assert "valor_delivery" in data["hoje"], "valor_delivery faltando em hoje"
            assert "valor_retirada" in data["hoje"], "valor_retirada faltando em hoje"
            assert data["hoje"]["total_taxas_entrega"] >= 7.0, f"Taxas hoje esperadas >= 7.0, obtido: {data['hoje']['total_taxas_entrega']}"
            assert data["hoje"]["valor_delivery"] >= 57.0, f"Valor delivery hoje obtido: {data['hoje']['valor_delivery']}"
            assert data["hoje"]["valor_retirada"] >= 40.0, f"Valor retirada hoje obtido: {data['hoje']['valor_retirada']}"

            assert "taxas_entrega" in data["totais"], "taxas_entrega faltando em totais"
            assert "valor_delivery" in data["totais"], "valor_delivery faltando em totais"
            assert "valor_retirada" in data["totais"], "valor_retirada faltando em totais"

            # Limpa
            db.session.delete(p_del)
            db.session.delete(p_ret)
            db.session.commit()
            print("✓ Teste de métricas de taxas de entrega e retirada no Dashboard passou com sucesso!")

if __name__ == "__main__":
    test_schedules()
    test_expiration()
    test_adicionais()
    test_dashboard()
    print("TODOS OS TESTES PASSARAM COM SUCESSO!")
