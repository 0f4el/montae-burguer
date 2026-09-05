import os
from uuid import uuid4

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INFINITEPAY_HANDLE = os.getenv("INFINITEPAY_HANDLE", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")
PUBLIC_BACKEND_URL = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
INFINITEPAY_API_URL = "https://api.checkout.infinitepay.io"


@app.get("/")
def home():
    return {"status": "Servidor do Montaê Burguer rodando com sucesso!"}


def get_infinitepay_config():
    missing = []
    if not INFINITEPAY_HANDLE:
        missing.append("INFINITEPAY_HANDLE")
    if not FRONTEND_URL:
        missing.append("FRONTEND_URL")
    if not PUBLIC_BACKEND_URL:
        missing.append("PUBLIC_BACKEND_URL")

    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Configuração da InfinitePay ausente: {', '.join(missing)}",
        )


@app.post("/api/criar-pix")
def criar_pix(data: dict):
    """Cria um checkout hospedado pela InfinitePay para o pedido."""
    get_infinitepay_config()

    try:
        total = round(float(data.get("total", 0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Valor do pedido inválido.")

    if total <= 0:
        raise HTTPException(status_code=400, detail="O total do pedido deve ser maior que zero.")

    name = str(data.get("nome") or "Cliente").strip() or "Cliente"
    phone = "".join(character for character in str(data.get("telefone") or "") if character.isdigit())
    order_nsu = f"montae-{uuid4().hex}"

    payload = {
        "handle": INFINITEPAY_HANDLE,
        "order_nsu": order_nsu,
        "redirect_url": f"{FRONTEND_URL}/pagamento-sucesso.html",
        "webhook_url": f"{PUBLIC_BACKEND_URL}/api/webhooks/infinitepay",
        "items": [
            {
                "quantity": 1,
                "price": int(round(total * 100)),
                "description": f"Pedido Montaê Burguer - {name}",
            }
        ],
    }

    if phone:
        payload["customer"] = {"name": name, "phone_number": f"+55{phone}"}

    try:
        response = requests.post(
            f"{INFINITEPAY_API_URL}/links", json=payload, timeout=15
        )
        response.raise_for_status()
        payment_data = response.json()
    except requests.RequestException:
        raise HTTPException(
            status_code=502,
            detail="Não foi possível criar a cobrança na InfinitePay.",
        )
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="A InfinitePay retornou uma resposta inválida.",
        )

    checkout_url = payment_data.get("url")
    if not checkout_url:
        raise HTTPException(
            status_code=502,
            detail="A InfinitePay não retornou o link de pagamento.",
        )

    return {"checkout_url": checkout_url, "order_nsu": order_nsu}


@app.post("/api/verificar-pix")
def verificar_pix(data: dict):
    """Confirma no provedor o pagamento recebido no retorno do checkout."""
    get_infinitepay_config()

    fields = ("order_nsu", "transaction_nsu", "slug")
    if any(not str(data.get(field) or "").strip() for field in fields):
        raise HTTPException(status_code=400, detail="Dados de confirmação incompletos.")

    payload = {
        "handle": INFINITEPAY_HANDLE,
        "order_nsu": data["order_nsu"],
        "transaction_nsu": data["transaction_nsu"],
        "slug": data["slug"],
    }

    try:
        response = requests.post(
            f"{INFINITEPAY_API_URL}/payment_check", json=payload, timeout=15
        )
        response.raise_for_status()
        payment_data = response.json()
    except requests.RequestException:
        raise HTTPException(
            status_code=502,
            detail="Não foi possível consultar o pagamento na InfinitePay.",
        )
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="A InfinitePay retornou uma resposta inválida.",
        )

    return {
        "paid": payment_data.get("paid") is True,
        "capture_method": payment_data.get("capture_method"),
    }


@app.post("/api/webhooks/infinitepay")
async def webhook_infinitepay(request: Request):
    """Recebe a confirmação assíncrona da InfinitePay e responde rapidamente."""
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Webhook inválido.")

    order_nsu = payload.get("order_nsu")
    transaction_nsu = payload.get("transaction_nsu")
    if order_nsu and transaction_nsu:
        print(f"Pagamento InfinitePay confirmado para o pedido {order_nsu}.")

    return {"status": "ok"}
