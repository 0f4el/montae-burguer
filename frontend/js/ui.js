// --- INTERFACE DE USUÁRIO (UI) & CONSTRUTOR DE HAMBÚRGUER ---

// Abre/Exibe o construtor
function revealAndScrollBuilder() {
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

    const builderSection = document.getElementById('construtor');
    if (!builderSection) return;

    resetBuilderSelections();

    if (builderSection.classList.contains('hidden')) {
        builderSection.classList.remove('hidden');
        builderSection.classList.add('fade-in-slide');
    }

    builderSection.scrollIntoView({ behavior: 'smooth' });
}

// Fecha o construtor
function closeBuilder() {
    const builderSection = document.getElementById('construtor');
    const comboSection = document.getElementById('secao-combo');

    if (comboSection) comboSection.scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        if (builderSection) {
            builderSection.classList.add('hidden');
            builderSection.classList.remove('fade-in-slide');
        }
    }, 300);
}

// Controle de quantidade de Adicionais Extras (+ / -)
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

// Atualiza o valor do hambúrguer no topo do Construtor em tempo real
function updateCalculatedTotal() {
    const precoBase = 29.90;
    let precoAdicionais = 0;

    const extraInputs = document.querySelectorAll('input[name="adicional_qty"]');
    extraInputs.forEach(input => {
        const qty = parseInt(input.value) || 0;
        const price = parseFloat(input.getAttribute('data-price')) || 0;
        precoAdicionais += qty * price;
    });

    const builderQty = parseInt(document.getElementById('builder-quantity')?.textContent) || 1;
    const totalFinal = (precoBase + precoAdicionais) * builderQty;

    const priceDisplay = document.getElementById('builder-total-price');
    if (priceDisplay) {
        priceDisplay.textContent = `R$ ${totalFinal.toFixed(2).replace('.', ',')}`;
    }
}

// Reseta todas as escolhas do Construtor para o estado inicial
function resetBuilderSelections() {
    const form = document.getElementById('burger-builder-form');
    if (!form) return;

    // 1. Reseta os rádios padrão da base (SEM ALTERAR NADA DA BASE)
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

    // 2. Reseta as quantidades de TODOS os adicionais extras (incluindo Queijo Extra, Cebola Extra, etc)
    const extraInputs = form.querySelectorAll('input[name="adicional_qty"]');
    extraInputs.forEach(input => {
        input.value = 0;
        const key = input.id.replace('extra-input-', '');
        const qtySpan = document.getElementById(`extra-qty-${key}`);
        if (qtySpan) qtySpan.textContent = '0';
    });

    // 3. Reseta a quantidade total do construtor
    builderQuantity = 1;
    const qtyEl = document.getElementById('builder-quantity');
    if (qtyEl) qtyEl.textContent = '1';

    if (typeof updateCalculatedTotal === 'function') {
        updateCalculatedTotal();
    }
}

// Exibe a notificação flutuante na tela
function showToast(title, desc) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-desc').textContent = desc;

    toast.classList.remove('translate-y-[-150%]');

    setTimeout(() => {
        toast.classList.add('translate-y-[-150%]');
    }, 3500);
}