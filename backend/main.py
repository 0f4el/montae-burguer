import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import mercadopago

# Carrega o .env se existir localmente (no Render ele apenas ignora)
load_dotenv()

app = FastAPI()

# Permite comunicação com o Front-end
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pega o token do ambiente (Render Environment Variable ou .env local)
MERCADO_PAGO_TOKEN = os.getenv("MERCADO_PAGO_TOKEN")

if not MERCADO_PAGO_TOKEN:
    raise RuntimeError("ERRO FATAL: Token do Mercado Pago (MERCADO_PAGO_TOKEN) não configurado!")

print(f"[OK] Token carregado. Primeiros 20 chars: {MERCADO_PAGO_TOKEN[:20]}...")

# Configura o SDK do Mercado Pago
sdk = mercadopago.SDK(MERCADO_PAGO_TOKEN)


@app.get("/")
def home():
    return {"status": "Servidor do Montaê Burguer rodando com sucesso!"}


# 1. ROTA PARA CRIAR O PIX
@app.post("/api/criar-pix")
async def criar_pix(data: dict):
    try:
        total = float(data.get("total", 0))
        nome = data.get("nome")

        # MP rejeita nomes vazios ou numéricos
        if not nome or not nome.strip() or nome.strip().isdigit():
            nome = "Cliente Avulso"

        email = data.get("email", "")
        if not email or "@" not in email or email.endswith("@email.com"):
            email = "comprador.montae@gmail.com"

        first_name = nome.split()[0]
        last_name = nome.split()[-1] if len(nome.split()) > 1 else "Avulso"

        payment_data = {
            "transaction_amount": round(total, 2),
            "description": f"Pedido Montaê Burguer - {nome}",
            "payment_method_id": "pix",
            "payer": {
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "identification": {
                    "type": "CPF",
                    "number": "14068608245"
                }
            }
        }

        print(f"[DEBUG] Enviando para MP: total={total}, nome={nome}, email={email}")

        payment_response = sdk.payment().create(payment_data)

        if payment_response["status"] not in [200, 201]:
            print("Erro retornado pelo Mercado Pago:", payment_response["response"])
            raise HTTPException(
                status_code=400,
                detail=payment_response["response"].get("message", "Erro ao comunicar com o Mercado Pago")
            )

        payment = payment_response["response"]

        return {
            "payment_id": payment["id"],
            "qr_code_base64": payment["point_of_interaction"]["transaction_data"]["qr_code_base64"],
            "qr_code_copia_cola": payment["point_of_interaction"]["transaction_data"]["qr_code"]
        }

    except Exception as e:
        print("ERRO INTERNO NO SERVIDOR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


# 2. ROTA PARA VERIFICAR STATUS DO PAGAMENTO PELO ID (REAL)
@app.get("/api/verificar-pix/{payment_id}")
async def verificar_pix(payment_id: str):
    try:
        payment_response = sdk.payment().get(payment_id)
        payment_info = payment_response.get("response", {})
        return {"status": payment_info.get("status")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 3. ROTA DE WEBHOOK
@app.post("/api/webhooks/mercadopago")
async def webhook_mercadopago(request: Request):
    try:
        query_params = request.query_params
        topic = query_params.get("topic") or query_params.get("type")
        payment_id = query_params.get("data.id") or query_params.get("id")

        if topic == "payment" and payment_id:
            payment_response = sdk.payment().get(payment_id)
            payment_info = payment_response.get("response", {})
            if payment_info.get("status") == "approved":
                print(f"Pagamento {payment_id} APROVADO via Webhook!")

        return {"status": "ok"}
    except Exception as e:
        print("Erro no Webhook:", str(e))
        return {"status": "error"}, 500