// --- LÓGICA DE CHECKOUT E INTEGRAÇÃO INFINITEPAY / WHATSAPP ---

const API_URL = 'https://montae-burguer-api.onrender.com';
const PEDIDO_PENDENTE_STORAGE_KEY = 'montae-pedido-pendente';

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
    const deliveryType = document.querySelector('input[name="delivery-type"]:checked')?.value;
    const isDelivery = deliveryType === 'Delivery';
    
    const subtotalSpan = document.getElementById('checkout-summary-subtotal');
    if (subtotalSpan) subtotalSpan.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

    const freteSpan = document.getElementById('checkout-summary-frete');
    if (freteSpan) {
        if (isDelivery && isDeliveryAreaValid) {
            freteSpan.textContent = `R$ ${currentTaxaEntrega.toFixed(2).replace('.', ',')}`;
        } else if (!isDelivery) {
            freteSpan.textContent = 'R$ 0,00';
        }
    }

    const totalSpan = document.getElementById('checkout-summary-total');
    if (totalSpan) {
        const total = isDelivery && isDeliveryAreaValid
            ? subtotal + currentTaxaEntrega
            : subtotal;
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

// Atualiza a frase de tempo de espera e alterna o campo de endereço
function handleDeliveryTypeChange(isDelivery) {
    // Chama a função existente que esconde/exibe o campo de endereço
    if (typeof toggleAddressField === 'function') {
        toggleAddressField(isDelivery);
    }

    atualizarResumoCheckout();

    const tempoBox = document.getElementById('tempo-espera-dinamico');
    if (tempoBox) {
        if (isDelivery) {
            tempoBox.innerHTML = `
                <i class="fa-solid fa-clock text-[#FF9F0D]"></i>
                <span>Tempo estimado para <strong>Delivery</strong>: <strong class="text-[#FF9F0D]">60 - 80 min</strong></span>
            `;
        } else {
            tempoBox.innerHTML = `
                <i class="fa-solid fa-clock text-[#FF9F0D]"></i>
                <span>Tempo estimado para <strong>Retirada</strong>: <strong class="text-[#FF9F0D]">30 min</strong></span>
            `;
        }
    }
}

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

// Salva o pedido antes do redirecionamento para permitir retomá-lo depois.
function salvarPedidoPendente(pedido) {
    try {
        localStorage.setItem(PEDIDO_PENDENTE_STORAGE_KEY, JSON.stringify(pedido));
    } catch (error) {
        console.warn('Não foi possível salvar o pedido pendente no navegador.', error);
    }
}

function obterPedidoPendente() {
    try {
        const pedido = localStorage.getItem(PEDIDO_PENDENTE_STORAGE_KEY);
        return pedido ? JSON.parse(pedido) : null;
    } catch (error) {
        console.warn('Não foi possível recuperar o pedido pendente.', error);
        return null;
    }
}

function limparPedidoPendente() {
    localStorage.removeItem(PEDIDO_PENDENTE_STORAGE_KEY);
}

// Cria um link de checkout da InfinitePay e redireciona o cliente para pagar.
async function processarPedidoPix(orderDetails) {
    const modal = document.getElementById('pix-modal');
    const loading = document.getElementById('pix-loading');

    if (modal) modal.classList.remove('hidden');
    if (loading) loading.classList.remove('hidden');

    const pedidoPendente = {
        status: 'criando_pagamento',
        createdAt: new Date().toISOString(),
        orderDetails,
        cart: JSON.parse(JSON.stringify(cart))
    };
    salvarPedidoPendente(pedidoPendente);

    try {
        const response = await fetch(`${API_URL}/api/criar-pix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                total: orderDetails.totalAmount,
                nome: orderDetails.name
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Erro ao criar a cobrança.');
        }

        const data = await response.json();

        if (!data.checkout_url || !data.order_nsu) {
            throw new Error('Resposta de pagamento incompleta.');
        }

        salvarPedidoPendente({
            ...pedidoPendente,
            status: 'aguardando_pagamento',
            payment: {
                orderNsu: data.order_nsu,
                checkoutUrl: data.checkout_url
            }
        });

        window.location.assign(data.checkout_url);

    } catch (error) {
        alert(error.message || "Erro ao criar a cobrança. Tente novamente.");
        fecharModalPix();
    }
}

function mostrarRecuperacaoPedido() {
    if (new URLSearchParams(window.location.search).has('pedido_confirmado')) return;

    const pedido = obterPedidoPendente();
    if (!pedido?.orderDetails || !Array.isArray(pedido.cart) || pedido.status === 'concluido') return;

    cart = pedido.cart;
    renderCart();

    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-lg flex-col gap-3 rounded-xl border border-[#FF9F0D] bg-neutral-900 p-4 text-sm text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between';
    notification.innerHTML = '<span>Você tem um pedido pendente. O carrinho foi restaurado.</span>';

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';
    const continueButton = document.createElement('button');
    continueButton.className = 'rounded-lg bg-[#FF9F0D] px-3 py-2 text-xs font-black text-black';
    continueButton.textContent = pedido.payment?.checkoutUrl ? 'Continuar pagamento' : 'Revisar pedido';
    continueButton.onclick = () => {
        if (pedido.payment?.checkoutUrl) {
            window.location.assign(pedido.payment.checkoutUrl);
        } else {
            openCheckoutModal();
        }
    };

    const discardButton = document.createElement('button');
    discardButton.className = 'rounded-lg border border-neutral-600 px-3 py-2 text-xs font-bold text-gray-300';
    discardButton.textContent = 'Descartar';
    discardButton.onclick = () => {
        limparPedidoPendente();
        notification.remove();
    };

    actions.append(continueButton, discardButton);
    notification.append(actions);
    document.body.append(notification);
}

function concluirPedidoRetornado() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('pedido_confirmado')) return;

    const pedido = obterPedidoPendente();
    if (!pedido?.orderDetails || !Array.isArray(pedido.cart) || pedido.status !== 'pagamento_confirmado') return;

    history.replaceState({}, document.title, window.location.pathname);
    cart = pedido.cart;
    renderCart();
    pedido.orderDetails.paymentMethod = pedido.captureMethod === 'pix'
        ? 'PIX (PAGO E CONFIRMADO)'
        : 'PAGAMENTO ONLINE (PAGO E CONFIRMADO)';
    finalizarERedirecionarWhatsApp(pedido.orderDetails);
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
    limparPedidoPendente();
}

document.addEventListener('DOMContentLoaded', () => {
    concluirPedidoRetornado();
    mostrarRecuperacaoPedido();
});
