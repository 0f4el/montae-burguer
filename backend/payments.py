import os
from uuid import uuid4

import requests
from flask import jsonify

INFINITEPAY_API_URL = "https://api.checkout.infinitepay.io"


def infinitepay_config():
    handle = os.getenv("INFINITEPAY_HANDLE", "").strip()
    frontend_url = os.getenv("FRONTEND_URL", "").rstrip("/")
    public_backend_url = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
    missing = [
        nome
        for nome, valor in (
            ("INFINITEPAY_HANDLE", handle),
            ("FRONTEND_URL", frontend_url),
            ("PUBLIC_BACKEND_URL", public_backend_url),
        )
        if not valor
    ]
    if missing:
        return None, (
            jsonify({"detail": f"Configuração da InfinitePay ausente: {', '.join(missing)}"}),
            503,
        )
    return {
        "handle": handle,
        "frontend_url": frontend_url,
        "public_backend_url": public_backend_url,
    }, None


def criar_checkout_infinitepay(nome, total):
    config, erro = infinitepay_config()
    if erro:
        return None, erro

    order_nsu = f"montae-{uuid4().hex}"
    payload = {
        "handle": config["handle"],
        "order_nsu": order_nsu,
        "redirect_url": f"{config['frontend_url']}/pagamento-sucesso.html",
        "webhook_url": f"{config['public_backend_url']}/api/webhooks/infinitepay",
        "items": [
            {
                "quantity": 1,
                "price": int(round(float(total) * 100)),
                "description": f"Pedido Montaê Burguer - {nome}",
            }
        ],
    }

    try:
        response = requests.post(
            f"{INFINITEPAY_API_URL}/links", json=payload, timeout=15
        )
        response.raise_for_status()
        payment_data = response.json()
    except requests.HTTPError as error:
        provider_response = error.response
        provider_detail = (
            provider_response.text[:500].strip() if provider_response is not None else ""
        )
        print(
            "InfinitePay recusou a criação do link: "
            f"status={provider_response.status_code if provider_response is not None else 'desconhecido'} "
            f"detail={provider_detail}"
        )
        return None, (
            jsonify({"detail": provider_detail or "A InfinitePay recusou a criação da cobrança."}),
            502,
        )
    except requests.RequestException:
        return None, (
            jsonify({"detail": "Não foi possível criar a cobrança na InfinitePay."}),
            502,
        )
    except ValueError:
        return None, (
            jsonify({"detail": "A InfinitePay retornou uma resposta inválida."}),
            502,
        )

    checkout_url = payment_data.get("url")
    if not checkout_url:
        return None, (
            jsonify({"detail": "A InfinitePay não retornou o link de pagamento."}),
            502,
        )

    return {"checkout_url": checkout_url, "order_nsu": order_nsu}, None


def consultar_pagamento_infinitepay(order_nsu, transaction_nsu, slug):
    config, erro = infinitepay_config()
    if erro:
        return None, erro

    payload = {
        "handle": config["handle"],
        "order_nsu": order_nsu,
        "transaction_nsu": transaction_nsu,
        "slug": slug,
    }

    try:
        response = requests.post(
            f"{INFINITEPAY_API_URL}/payment_check", json=payload, timeout=15
        )
        response.raise_for_status()
        payment_data = response.json()
    except requests.HTTPError as error:
        provider_response = error.response
        provider_detail = (
            provider_response.text[:500].strip() if provider_response is not None else ""
        )
        print(
            "InfinitePay recusou a consulta do pagamento: "
            f"status={provider_response.status_code if provider_response is not None else 'desconhecido'} "
            f"detail={provider_detail}"
        )
        return None, (
            jsonify({"detail": provider_detail or "A InfinitePay recusou a consulta do pagamento."}),
            502,
        )
    except requests.RequestException:
        return None, (
            jsonify({"detail": "Não foi possível consultar o pagamento na InfinitePay."}),
            502,
        )
    except ValueError:
        return None, (
            jsonify({"detail": "A InfinitePay retornou uma resposta inválida."}),
            502,
        )

    return {
        "paid": payment_data.get("paid") is True,
        "capture_method": payment_data.get("capture_method"),
    }, None
