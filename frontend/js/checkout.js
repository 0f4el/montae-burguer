// --- LÓGICA DE CHECKOUT E INTEGRAÇÃO MERCADO PAGO / WHATSAPP ---

let pixCheckInterval = null;

// Configuração de Entrega e Bairros
const ORIGEM_BURGER = "Dom Bosco, Belo Horizonte - MG"; 
const LINK_IFOOD = "https://www.ifood.com.br"; // Substitua pelo link real do seu restaurante no iFood

const BAIRROS_TAXA_FIXA = [
    "dom bosco", "gloria", "glória", "ipanema", 
    "california 1", "california 2", "california velho", 
    "joao pinheiro", "joão pinheiro", "altos dos pinheiros", 
    "dom cabral", "coracao eucaristico", "coração eucarístico"
];

// Função que calcula a taxa de frete por Bairro ou por Distância (Google Distance Matrix API)
async function calcularFrete(bairroDestino, enderecoCompleto) {
    if (!bairroDestino) return { valor: 0, status: 'ok' };

    const bairroFormatado = bairroDestino.trim().toLowerCase();

    // 1. Verificação dos Bairros Fixos (R$ 4,00)
    if (BAIRROS_TAXA_FIXA.includes(bairroFormatado)) {
        return { valor: 4.00, status: 'ok' };
    }

    // 2. Cálculo por Distância para os demais bairros
    try {
        if (typeof google === 'undefined' || !google.maps || !google.maps.DistanceMatrixService) {
            console.warn("Google Maps API não carregada. Aplicando taxa padrão de R$ 5.00.");
            return { valor: 5.00, status: 'ok' };
        }

        const service = new google.maps.DistanceMatrixService();
        const response = await service.getDistanceMatrix({
            origins: [ORIGEM_BURGER],
            destinations: [enderecoCompleto],
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.METRIC
        });

        const resultado = response.rows[0]?.elements[0];

        if (!resultado || resultado.status !== "OK") {
            return { valor: 5.00, status: 'ok' }; // Fallback de segurança
        }

        const distanciaKm = resultado.distance.value / 1000;

        if (distanciaKm <= 4) {
            return { valor: 5.00, status: 'ok' };
        } else if (distanciaKm <= 5) {
            return { valor: 7.00, status: 'ok' };
        } else {
            return { 
                valor: 0, 
                status: 'fora_da_area', 
                mensagem: "Infelizmente não entregamos nessa região por motoboy (acima de 5km).\n\nVocê pode pedir pelo nosso iFood ou combinar a entrega via Uber no nosso WhatsApp!" 
            };
        }

    } catch (error) {
        console.error("Erro ao calcular distância:", error);
        return { valor: 5.00, status: 'ok' };
    }
}

// Variáveis de Estado do Autocomplete
let autocompleteInstance = null;
let currentNeighborhood = "";
let currentStreet = "";
let currentFormattedAddress = "";
let currentTaxaEntrega = 0;
let isDeliveryAreaValid = true;

// Inicializa o Autocomplete do Google Maps
function initAutocomplete() {
    const input = document.getElementById('checkout-autocomplete');
    if (!input) return;

    autocompleteInstance = new google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: { 'country': ['br'] }
    });

    autocompleteInstance.addListener('place_changed', onPlaceChanged);

    // Invalida a seleção se o usuário editar manualmente o texto depois de selecionar
    input.addEventListener('input', () => {
        if (currentFormattedAddress !== "") {
            currentFormattedAddress = "";
            currentNeighborhood = "";
            currentStreet = "";
            currentTaxaEntrega = 0;
            isDeliveryAreaValid = true;
            const freteSpan = document.getElementById('checkout-summary-frete');
            if (freteSpan) {
                freteSpan.textContent = "Calculando...";
                freteSpan.classList.remove('text-red-500', 'text-emerald-400');
            }
            atualizarResumoCheckout();
        }
    });
}

// Escuta o carregamento da janela para inicializar o maps se possível
window.addEventListener('load', () => {
    if (typeof google !== 'undefined' && google.maps && google.maps.places) {
        initAutocomplete();
    }
});

async function onPlaceChanged() {
    const place = autocompleteInstance.getPlace();
    
    if (!place.geometry) {
        alert("Por favor, selecione um endereço da lista sugerida pelo Google.");
        return;
    }

    currentStreet = "";
    currentNeighborhood = "";
    currentFormattedAddress = place.formatted_address;

    // Extrair componentes (Bairro e Rua)
    for (const component of place.address_components) {
        const types = component.types;
        if (types.includes("route")) {
            currentStreet = component.long_name;
        }
        if (types.includes("sublocality") || types.includes("sublocality_level_1") || types.includes("neighborhood")) {
            currentNeighborhood = component.long_name;
        }
    }

    const freteSpan = document.getElementById('checkout-summary-frete');
    if (freteSpan) freteSpan.textContent = "Calculando...";

    const freteResult = await calcularFrete(currentNeighborhood, currentFormattedAddress);

    if (freteResult.status === 'fora_da_area') {
        isDeliveryAreaValid = false;
        if (freteSpan) {
            freteSpan.textContent = "Indisponível";
            freteSpan.classList.remove('text-emerald-400');
            freteSpan.classList.add('text-red-500');
        }
        
        alert(freteResult.mensagem);
        const irParaIfood = confirm("Deseja ser redirecionado para o nosso iFood agora?");
        if (irParaIfood) {
            window.open(LINK_IFOOD, '_blank');
        }
        atualizarResumoCheckout();
        return;
    }

    isDeliveryAreaValid = true;
    currentTaxaEntrega = freteResult.valor;
    if (freteSpan) {
        freteSpan.classList.remove('text-red-500');
        freteSpan.classList.add('text-emerald-400');
    }
    atualizarResumoCheckout();
}

function atualizarResumoCheckout() {
    const subtotal = calculateCartTotal();
    
    const subtotalSpan = document.getElementById('checkout-summary-subtotal');
    if (subtotalSpan) subtotalSpan.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

    const freteSpan = document.getElementById('checkout-summary-frete');
    if (freteSpan && isDeliveryAreaValid) {
        freteSpan.textContent = `R$ ${currentTaxaEntrega.toFixed(2).replace('.', ',')}`;
    }

    const totalSpan = document.getElementById('checkout-summary-total');
    if (totalSpan) {
        const total = isDeliveryAreaValid ? (subtotal + currentTaxaEntrega) : subtotal;
        totalSpan.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    }
}

// Expõe a função para atualizar o resumo caso o carrinho mude
window.atualizarResumoCheckout = atualizarResumoCheckout;

window.resetDeliveryState = function() {
    currentNeighborhood = "";
    currentStreet = "";
    currentFormattedAddress = "";
    currentTaxaEntrega = 0;
    isDeliveryAreaValid = true;
    const freteSpan = document.getElementById('checkout-summary-frete');
    if (freteSpan) {
        freteSpan.textContent = "Calculando...";
        freteSpan.classList.remove('text-red-500');
        freteSpan.classList.add('text-emerald-400');
    }
    const input = document.getElementById('checkout-autocomplete');
    if (input) input.value = '';
    atualizarResumoCheckout();
};

// Função principal disparada pelo formulário de checkout
async function handleCheckoutSubmit(event) {
    event.preventDefault();

    const name = document.getElementById('checkout-name')?.value || '';
    const phoneInput = document.getElementById('checkout-phone');
    const deliveryType = document.querySelector('input[name="delivery-type"]:checked')?.value || 'Delivery';
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'pix';
    const notes = document.getElementById('checkout-notes')?.value || '';
    const troco = document.getElementById('checkout-troco')?.value || '';

    if (!phoneInput) return;

    const rawPhone = phoneInput.value.replace(/\D/g, "");
    phoneInput.setCustomValidity("");

    // Validação do formato do WhatsApp
    if (rawPhone.length !== 11 || rawPhone[2] !== '9') {
        phoneInput.setCustomValidity("Insira um WhatsApp válido no formato (DDD) 9 XXXX XXXX.");
        phoneInput.reportValidity();
        return;
    }

    let addressFormatted = "N/A (Retirada no Local)";
    let taxaEntrega = 0;

    // Processamento de entrega e cálculo do frete com Autocomplete
    if (deliveryType === 'Delivery') {
        if (!currentFormattedAddress) {
            alert("Por favor, selecione um endereço da busca do Google antes de continuar.");
            return;
        }
        if (!isDeliveryAreaValid) {
            alert("Infelizmente o endereço selecionado está fora da nossa área de entrega via motoboy.");
            return;
        }

        const number = document.getElementById('checkout-number')?.value || '';
        const complement = document.getElementById('checkout-complement')?.value || '';

        addressFormatted = `${currentStreet || currentFormattedAddress}, Nº ${number}`;
        if (currentNeighborhood) addressFormatted += ` - ${currentNeighborhood}`;
        if (complement) addressFormatted += ` (${complement})`;

        taxaEntrega = currentTaxaEntrega;
    }

    const subtotal = calculateCartTotal();
    const totalAmount = subtotal + taxaEntrega;

    const orderDetails = {
        name,
        phone: phoneInput.value,
        deliveryType,
        address: addressFormatted,
        paymentMethod,
        notes,
        subtotal,
        taxaEntrega,
        totalAmount,
        troco
    };

    closeCheckoutModal();

    // Redirecionamento por forma de pagamento
    if (paymentMethod === 'pix') {
        processarPedidoPix(orderDetails);
    } else {
        finalizarERedirecionarWhatsApp(orderDetails);
    }
}

// Gera o QR Code PIX chamando o Backend Python
async function processarPedidoPix(orderDetails) {
    const modal = document.getElementById('pix-modal');
    const loading = document.getElementById('pix-loading');
    const content = document.getElementById('pix-content');

    if (modal) modal.classList.remove('hidden');
    if (loading) loading.classList.remove('hidden');
    if (content) {
        content.classList.add('hidden');
        content.classList.remove('flex');
    }

    try {
        const response = await fetch('https://montae-burguer-api.onrender.com/api/criar-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                total: orderDetails.totalAmount,
                nome: orderDetails.name,
                email: "comprador.montae@gmail.com"
            })
        });

        if (!response.ok) throw new Error('Erro ao gerar o PIX.');

        const data = await response.json();

        const qrImg = document.getElementById('pix-qr-image');
        if (qrImg) qrImg.src = `data:image/png;base64,${data.qr_code_base64}`;
        
        chavePixCopiaCola = data.qr_code_copia_cola;

        if (loading) loading.classList.add('hidden');
        if (content) {
            content.classList.remove('hidden');
            content.classList.add('flex');
        }

        iniciarVerificacaoPagamento(data.payment_id, orderDetails);

    } catch (error) {
        alert("Erro ao gerar o código PIX. Tente novamente.");
        fecharModalPix();
    }
}

// Checa o status do pagamento no servidor
function iniciarVerificacaoPagamento(paymentId, orderDetails) {
    if (pixCheckInterval) clearInterval(pixCheckInterval);

    pixCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`https://montae-burguer-api.onrender.com/api/verificar-pix/${paymentId}`);
            if (response.ok) {
                const data = await response.json();
                
                if (data.status === 'approved') {
                    clearInterval(pixCheckInterval);
                    fecharModalPix();
                    
                    orderDetails.paymentMethod = "PIX (PAGO E CONFIRMADO)";
                    finalizarERedirecionarWhatsApp(orderDetails);
                }
            }
        } catch (err) {
            console.error("Aguardando confirmação do pagamento...", err);
        }
    }, 3000);
}

// Monta a mensagem final formatada com os itens do combo e taxa de entrega
function finalizarERedirecionarWhatsApp(details) {
    const phoneRestaurant = "5531990081997";

    let itemsList = "";
    cart.forEach(item => {
        itemsList += `• *${item.quantity}x ${item.title}*\n`;
        itemsList += `  └ Pão: ${item.pao} | Ponto: ${item.ponto}\n`;
        itemsList += `  └ Cebola (Base): ${item.cebola} | Queijo (Base): ${item.queijo}\n`;
        itemsList += `  └ Molho Grátis: ${item.molhoGratis}\n`;
        
        if (item.adicionais && item.adicionais !== 'Nenhum') {
            itemsList += `  └ Extras: ${item.adicionais}\n`;
        }
        if (item.observacao && item.observacao.trim() !== '') {
            itemsList += `  └ Obs: ${item.observacao}\n`;
        }
        itemsList += `  └ Subtotal: R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}\n\n`;
    });

    let message = `*🍔 NOVO PEDIDO - MONTAÊ BURGUER*\n\n`;
    message += `*CLIENTE:* ${details.name}\n`;
    message += `*CONTATO:* ${details.phone}\n`;
    message += `*FORMA DE ENTREGA:* ${details.deliveryType}\n\n`;

    if (details.deliveryType === 'Delivery') {
        message += `*ENDEREÇO DE ENTREGA:*\n${details.address}\n\n`;
    }

    message += `*FORMA DE PAGAMENTO:* ${details.paymentMethod.toUpperCase()}\n`;
    if (details.paymentMethod === 'dinheiro' && details.troco) {
        message += `*TROCO PARA:* R$ ${details.troco}\n`;
    }
    if (details.notes) message += `*OBSERVAÇÕES:* ${details.notes}\n`;
    
    message += `\n*ITENS DO PEDIDO:*\n${itemsList}`;
    
    if (details.deliveryType === 'Delivery') {
        message += `*SUBTOTAL:* R$ ${details.subtotal.toFixed(2).replace('.', ',')}\n`;
        message += `*TAXA DE ENTREGA:* R$ ${details.taxaEntrega.toFixed(2).replace('.', ',')}\n`;
    }
    
    message += `*TOTAL DO PEDIDO:* R$ ${details.totalAmount.toFixed(2).replace('.', ',')}`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${phoneRestaurant}?text=${encodedMessage}`, '_blank');

    cart = [];
    renderCart();
}