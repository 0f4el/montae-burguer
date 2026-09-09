// --- GERENCIAMENTO DO CARRINHO ---

let cart = [];
let builderQuantity = 1;

function changeBuilderQuantity(delta) {
    builderQuantity = Math.max(1, (builderQuantity || 1) + delta);
    const qtyEl = document.getElementById('builder-quantity');
    if (qtyEl) qtyEl.textContent = builderQuantity;
    if (typeof updateCalculatedTotal === 'function') {
        updateCalculatedTotal();
    }
}

function openCartDrawer() {
    const backdrop = document.getElementById('cart-drawer-backdrop');
    const drawer = document.getElementById('cart-drawer');
    if (!backdrop || !drawer) return;

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        drawer.classList.remove('translate-x-full');
    }, 10);
}

function closeCartDrawer() {
    const backdrop = document.getElementById('cart-drawer-backdrop');
    const drawer = document.getElementById('cart-drawer');
    if (!backdrop || !drawer) return;

    drawer.classList.add('translate-x-full');
    backdrop.classList.add('opacity-0');
    setTimeout(() => backdrop.classList.add('hidden'), 300);
}

// --- CONTROLE DOS BOTOES + E - DOS EXTRAS ---
function changeExtraQty(itemId, delta) {
    const qtySpan = document.getElementById(`extra-qty-${itemId}`);
    const input = document.getElementById(`extra-input-${itemId}`);
    
    if (!qtySpan || !input) return;

    let currentQty = parseInt(qtySpan.textContent) || 0;
    currentQty += delta;
    if (currentQty < 0) currentQty = 0;

    qtySpan.textContent = currentQty;
    input.value = currentQty;

    updateCalculatedTotal();
}

function calculateCartTotal() {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
}

// Reseta todas as escolhas do Construtor para o estado inicial
function resetBuilderSelections() {
    const form = document.getElementById('burger-builder-form');
    if (!form) return;

    // 1. Reseta os rádios padrão da base
    const defaultPao = form.querySelector('input[name="pao"][value="Brioche"]');
    if (defaultPao) defaultPao.checked = true;

    const defaultPonto = form.querySelector('input[name="ponto"][value="Ao Ponto"]');
    if (defaultPonto) defaultPonto.checked = true;

    const defaultCebola = form.querySelector('input[name="cebola_base"][value="Onion Rings"]');
    if (defaultCebola) defaultCebola.checked = true;

    const defaultQueijo = form.querySelector('input[name="queijo_base"][value="Mussarela"]');
    if (defaultQueijo) defaultQueijo.checked = true;

    const defaultMolho = form.querySelector('input[name="molho_gratis"][value="Baconese"]');
    if (defaultMolho) defaultMolho.checked = true;

    const obsInput = document.getElementById('builder-observacoes');
    if (obsInput) obsInput.value = '';

    // 2. Reseta as quantidades de todos os adicionais extras
    const extraInputs = form.querySelectorAll('input[name="adicional_qty"]');
    extraInputs.forEach(input => {
        input.value = 0;
        // Pega a chave da ID (ex: extra-input-ovo -> ovo)
        const key = input.id.replace('extra-input-', '');
        const qtySpan = document.getElementById(`extra-qty-${key}`);
        if (qtySpan) qtySpan.textContent = '0';
    });

    // 3. Reseta a quantidade total do construtor para 1
    builderQuantity = 1;
    const qtyEl = document.getElementById('builder-quantity');
    if (qtyEl) qtyEl.textContent = '1';
}

// Exibe ou oculta o campo de troco conforme o pagamento escolhido
function toggleTrocoField(isDinheiro) {
    const trocoContainer = document.getElementById('troco-container');
    const trocoInput = document.getElementById('checkout-troco');
    
    if (!trocoContainer) return;

    if (isDinheiro) {
        trocoContainer.classList.remove('hidden');
    } else {
        trocoContainer.classList.add('hidden');
        if (trocoInput) trocoInput.value = '';
    }
}

// Envio do formulário com novo formato dos adicionais
function submitBurgerForm() {
    // Verificação de funcionamento da cozinha
    if (typeof verificarStatusRestaurante === 'function') {
        const status = verificarStatusRestaurante();
        if (!status.estaAberto) {
            if (typeof abrirModalHorarios === 'function') {
                abrirModalHorarios();
            } else {
                alert(`O restaurante está fechado no momento.\n${status.proximaAbertura}`);
            }
            return;
        }
    }

    const form = document.getElementById('burger-builder-form');
    if (!form) return;

    // Coleta dos campos base obrigatórios
    const pao = form.querySelector('input[name="pao"]:checked')?.value || 'Brioche';
    const ponto = form.querySelector('input[name="ponto"]:checked')?.value || 'Ao Ponto';
    const cebola = form.querySelector('input[name="cebola_base"]:checked')?.value || 'Onion Rings';
    const queijo = form.querySelector('input[name="queijo_base"]:checked')?.value || 'Mussarela';
    const molhoGratis = form.querySelector('input[name="molho_gratis"]:checked')?.value || 'Baconese';

    // Coleta dos adicionais com quantidade > 0
    let adicionais = [];
    let precoAdicionais = 0;

    const extraInputs = form.querySelectorAll('input[name="adicional_qty"]');
    extraInputs.forEach(input => {
        const qty = parseInt(input.value) || 0;
        if (qty > 0) {
            const name = input.getAttribute('data-name');
            const price = parseFloat(input.getAttribute('data-price')) || 0;
            adicionais.push(`${qty}x ${name}`);
            precoAdicionais += price * qty;
        }
    });

    const precoBase = 29.90;
    const precoUnitarioTotal = precoBase + precoAdicionais;
    const observacao = document.getElementById('builder-observacoes')?.value.trim() || '';

    const newItem = {
        id: Date.now(),
        title: "Combo Hambúrguer Artesanal",
        price: precoUnitarioTotal,
        quantity: builderQuantity,
        pao: pao,
        ponto: ponto,
        cebola: cebola,
        queijo: queijo,
        molhoGratis: molhoGratis,
        adicionais: adicionais.length > 0 ? adicionais.join(', ') : 'Nenhum',
        observacao: observacao
    };

    cart.push(newItem);
    renderCart();

    if (typeof showToast === 'function') {
        showToast(`${builderQuantity}x Combo Adicionado!`, `Pão ${pao}, Cebola ${cebola} e Queijo ${queijo}.`);
    }

    resetBuilderSelections();

    if (typeof closeBuilder === 'function') {
        closeBuilder();
    }
}

function updateQuantity(id, delta) {
    const item = cart.find(item => item.id === id);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
        removeItem(id);
    } else {
        renderCart();
    }
}

function removeItem(id) {
    cart = cart.filter(item => item.id !== id);
    renderCart();
}

// Renderização do Carrinho
function renderCart() {
    const container = document.getElementById('cart-items-container');
    const countBadgeHeader = document.getElementById('cart-count-header');
    const countBadgeMobile = document.getElementById('cart-count');
    const subtotalEl = document.getElementById('cart-subtotal');
    const btnCheckout = document.getElementById('btn-checkout');

    if (!container) return;

    const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    if (countBadgeHeader) countBadgeHeader.textContent = totalCount;
    if (countBadgeMobile) countBadgeMobile.textContent = totalCount;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                <i class="fa-solid fa-cart-flatbed text-4xl mb-3 text-neutral-700"></i>
                <p class="text-sm font-bold uppercase tracking-wider">Seu carrinho está vazio</p>
                <p class="text-xs mt-1">Monte seu hambúrguer e adicione ao pedido.</p>
            </div>
        `;
        if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
        if (btnCheckout) btnCheckout.disabled = true;
        return;
    }

    const statusLoja = typeof verificarStatusRestaurante === 'function' ? verificarStatusRestaurante() : { estaAberto: true };

    if (btnCheckout) {
        if (!statusLoja.estaAberto) {
            btnCheckout.disabled = true;
            btnCheckout.className = "w-full py-3.5 rounded-2xl bg-neutral-800 text-neutral-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-not-allowed border border-neutral-700";
            btnCheckout.innerHTML = `<i class="fa-solid fa-lock text-xs text-red-400"></i> <span>Restaurante Fechado</span>`;
        } else {
            btnCheckout.disabled = false;
            btnCheckout.className = "w-full py-3.5 rounded-2xl bg-[#FF9F0D] hover:bg-[#E08800] text-black text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition duration-200 shadow-lg shadow-[#FF9F0D]/20 active:scale-95";
            btnCheckout.innerHTML = `<span>Finalizar Pedido</span> <i class="fa-solid fa-arrow-right text-xs"></i>`;
        }
    }

    let itemsHTML = '';
    cart.forEach((item) => {
        const itemTotal = item.price * item.quantity;

        itemsHTML += `
            <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-md relative overflow-hidden">
                <div class="flex items-start justify-between">
                    <div>
                        <h4 class="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                            <i class="fa-solid fa-burger text-[#FF9F0D]"></i> ${item.title}
                        </h4>
                    </div>
                    <button onclick="removeItem(${item.id})" class="text-neutral-500 hover:text-red-400 text-xs transition p-1">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>

                <div class="flex flex-wrap gap-1 my-0.5 text-[10px]">
                    <span class="bg-black/60 border border-[#FF9F0D]/40 text-[#FF9F0D] font-bold px-2 py-0.5 rounded-md">Pão: ${item.pao}</span>
                    <span class="bg-black/60 border border-neutral-700 text-gray-200 font-bold px-2 py-0.5 rounded-md">Ponto: ${item.ponto}</span>
                    <span class="bg-black/60 border border-neutral-700 text-gray-200 font-bold px-2 py-0.5 rounded-md">Cebola: ${item.cebola}</span>
                    <span class="bg-black/60 border border-neutral-700 text-gray-200 font-bold px-2 py-0.5 rounded-md">Queijo: ${item.queijo}</span>
                    <span class="bg-black/60 border border-neutral-700 text-emerald-400 font-bold px-2 py-0.5 rounded-md">Molho: ${item.molhoGratis}</span>
                </div>
                ${item.adicionais !== 'Nenhum' ? `<p class="text-[10px] text-gray-400"><strong>Extras:</strong> ${item.adicionais}</p>` : ''}
                ${item.observacao ? `<p class="text-[10px] text-amber-400/90 italic"><strong>Obs:</strong> ${item.observacao}</p>` : ''}
                
                <div class="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                    <div class="flex items-center gap-2 bg-black/70 rounded-lg p-1 border border-neutral-800">
                        <button onclick="updateQuantity(${item.id}, -1)" class="w-6 h-6 rounded bg-neutral-800 text-gray-300 font-bold hover:bg-neutral-700 flex items-center justify-center text-xs">-</button>
                        <span class="text-xs font-black text-white px-1.5">${item.quantity}</span>
                        <button onclick="updateQuantity(${item.id}, 1)" class="w-6 h-6 rounded bg-neutral-800 text-gray-300 font-bold hover:bg-neutral-700 flex items-center justify-center text-xs">+</button>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-gray-500 block">Total do item</span>
                        <span class="text-xs font-black text-[#FF9F0D]">R$ ${itemTotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = itemsHTML;

    const total = calculateCartTotal();
    if (subtotalEl) subtotalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

// --- LÓGICA DO MODAL DE CHECKOUT ---

function openCheckoutModal() {
    if (cart.length === 0) return;

    // Verificação de funcionamento
    if (typeof verificarStatusRestaurante === 'function') {
        const status = verificarStatusRestaurante();
        if (!status.estaAberto) {
            if (typeof abrirModalHorarios === 'function') {
                abrirModalHorarios();
            } else {
                alert(`O restaurante está fechado no momento.\n${status.proximaAbertura}`);
            }
            return;
        }
    }

    closeCartDrawer();

    const backdrop = document.getElementById('checkout-modal-backdrop');
    const modal = document.getElementById('checkout-modal');

    if (!backdrop || !modal) return;

    // Reseta o formulário de checkout
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.reset();
    }

    // Reseta tipo de entrega e troco para os estados padrões
    const deliveryRadio = document.querySelector('input[name="delivery-type"][value="Delivery"]');
    if (deliveryRadio) deliveryRadio.checked = true;

    toggleAddressField(true);
    toggleTrocoField(false);

    if (typeof window.resetDeliveryState === 'function') {
        window.resetDeliveryState();
    }

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        modal.classList.remove('scale-95');
        modal.classList.add('scale-100');
    }, 10);
}

function closeCheckoutModal() {
    const backdrop = document.getElementById('checkout-modal-backdrop');
    const modal = document.getElementById('checkout-modal');

    if (!backdrop || !modal) return;

    modal.classList.remove('scale-100');
    modal.classList.add('scale-95');
    backdrop.classList.add('opacity-0');

    setTimeout(() => {
        backdrop.classList.add('hidden');
    }, 300);
}

function toggleAddressField(isDelivery) {
    const addressContainer = document.getElementById('address-container');
    const requiredAddressFields = document.querySelectorAll('.address-field');

    if (!addressContainer) return;

    if (isDelivery) {
        addressContainer.classList.remove('hidden');
        requiredAddressFields.forEach(field => field.required = true);
    } else {
        addressContainer.classList.add('hidden');
        requiredAddressFields.forEach(field => {
            field.required = false;
            field.value = ''; // Limpa os valores ao mudar para Retirada
        });
        const complementEl = document.getElementById('checkout-complement');
        if (complementEl) complementEl.value = '';
    }
}

// Máscara do WhatsApp
function handlePhoneMask(event) {
    event.target.setCustomValidity("");

    let value = event.target.value.replace(/\D/g, "");

    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 7) {
        value = value.replace(/^(\d{2})(\d{1})(\d{4})(\d{0,4})/, "($1) $2 $3 $4");
    } else if (value.length > 3) {
        value = value.replace(/^(\d{2})(\d{1})(\d{0,4})/, "($1) $2 $3");
    } else if (value.length > 2) {
        value = value.replace(/^(\d{2})(\d{0,1})/, "($1) $2");
    } else if (value.length > 0) {
        value = value.replace(/^(\d*)/, "($1");
    }

    event.target.value = value;
}