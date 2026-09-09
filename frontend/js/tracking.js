function abrirModalAcompanhar() {
    const backdrop = document.getElementById('tracking-modal-backdrop');
    const modal = document.getElementById('tracking-modal');
    if (!backdrop || !modal) return;

    const results = document.getElementById('tracking-results');
    const input = document.getElementById('tracking-query');
    const selectTipo = document.getElementById('tracking-type');
    
    if (results) results.innerHTML = '';
    if (selectTipo) selectTipo.value = 'whatsapp';
    alternarTipoAcompanhamento();
    if (input) input.value = '';

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        modal.classList.remove('scale-95');
        modal.classList.add('scale-100');
        input?.focus();
    }, 10);
}

function alternarTipoAcompanhamento() {
    const selectTipo = document.getElementById('tracking-type');
    const label = document.getElementById('tracking-query-label');
    const input = document.getElementById('tracking-query');
    if (!input) return;

    const tipo = selectTipo ? selectTipo.value : 'whatsapp';
    input.value = '';

    if (tipo === 'id') {
        if (label) label.textContent = 'Número do Pedido (ID)';
        input.placeholder = 'Ex: 12';
        input.type = 'text';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.removeAttribute('maxlength');
    } else {
        if (label) label.textContent = 'Número do WhatsApp';
        input.placeholder = 'Ex: (31) 9 9999 9999';
        input.type = 'tel';
        input.setAttribute('maxlength', '16');
    }
}

function handleTrackingInput(event) {
    const selectTipo = document.getElementById('tracking-type');
    if (selectTipo && selectTipo.value === 'whatsapp' && typeof handlePhoneMask === 'function') {
        handlePhoneMask(event);
    } else if (selectTipo && selectTipo.value === 'id') {
        event.target.value = event.target.value.replace(/\D/g, '');
    }
}

function fecharModalAcompanhar() {
    const backdrop = document.getElementById('tracking-modal-backdrop');
    const modal = document.getElementById('tracking-modal');
    if (!backdrop || !modal) return;

    modal.classList.remove('scale-100');
    modal.classList.add('scale-95');
    backdrop.classList.add('opacity-0');
    setTimeout(() => backdrop.classList.add('hidden'), 300);
}

function statusBadgeClass(status) {
    const map = {
        aguardando_pagamento: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
        aguardando_aprovacao: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
        em_preparacao: 'bg-[#FF9F0D]/20 text-[#FF9F0D] border border-[#FF9F0D]/40',
        pronto_para_retirada: 'bg-teal-500/20 text-teal-300 border border-teal-500/40',
        saiu_para_entrega: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
        finalizado: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        expirado: 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
    };
    return map[status] || 'bg-neutral-800 text-gray-300';
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function formatMoney(valor) {
    return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

function renderPedidoAcompanhamento(pedido) {
    const itens = (pedido.hamburgueres || []).map((item) => `
        <div class="rounded-xl border border-neutral-800 bg-black/40 p-3">
            <p class="text-xs font-black text-white">${escapeHtml(item.quantidade)}x ${escapeHtml(item.titulo)}</p>
            <p class="text-[11px] text-gray-400">Pão ${escapeHtml(item.pao)} · ${escapeHtml(item.ponto)} · ${escapeHtml(item.cebola)} · ${escapeHtml(item.queijo)} · ${escapeHtml(item.molho_gratis)}</p>
            ${item.adicionais && item.adicionais !== 'Nenhum' ? `<p class="text-[11px] text-gray-400">Extras: ${escapeHtml(item.adicionais)}</p>` : ''}
            ${item.observacao ? `<p class="text-[11px] text-amber-300">Obs: ${escapeHtml(item.observacao)}</p>` : ''}
        </div>
    `).join('');

    const criado = pedido.criado_em ? new Date(pedido.criado_em).toLocaleString('pt-BR') : '';

    const msgWhatsapp = encodeURIComponent(`Olá! Gostaria de informações sobre o meu pedido #${pedido.id}.`);

    return `
        <article class="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-[#FF9F0D]">Pedido #${escapeHtml(pedido.id)}</p>
                    <h4 class="text-sm font-black text-white">${escapeHtml(pedido.nome)}</h4>
                    <p class="text-[11px] text-gray-400">${criado}</p>
                </div>
                <span class="rounded-lg px-2 py-1 text-[10px] font-black uppercase ${statusBadgeClass(pedido.status)}">${escapeHtml(pedido.status_label)}</span>
            </div>
            <p class="text-[11px] text-gray-300">${escapeHtml(pedido.forma_entrega)}${pedido.endereco ? ` · ${escapeHtml(pedido.endereco)}` : ''}</p>
            <p class="text-xs font-black text-[#FF9F0D]">${formatMoney(pedido.total)}</p>
            <div class="space-y-2">${itens}</div>
            <div class="pt-2 border-t border-neutral-800/80 flex justify-end">
                <a href="https://wa.me/553190081997?text=${msgWhatsapp}" 
                   target="_blank" 
                   rel="noopener noreferrer" 
                   class="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition">
                    <i class="fa-brands fa-whatsapp"></i> Falar sobre o pedido #${pedido.id}
                </a>
            </div>
        </article>
    `;
}

async function buscarPedidoAcompanhamento(event) {
    event.preventDefault();
    const selectTipo = document.getElementById('tracking-type');
    const tipo = selectTipo ? selectTipo.value : 'whatsapp';
    const input = document.getElementById('tracking-query');
    const results = document.getElementById('tracking-results');
    const consulta = input?.value.trim() || '';
    if (!results) return;

    results.innerHTML = '<p class="text-xs text-gray-400">Buscando pedido...</p>';

    try {
        const response = await fetch('/api/pedidos/acompanhar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, consulta })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.detail || 'Não foi possível buscar o pedido.');
        }

        if (!data.pedidos || data.pedidos.length === 0) {
            const labelTipo = tipo === 'whatsapp' ? 'WhatsApp' : 'ID';
            results.innerHTML = `<p class="text-xs text-gray-400">Nenhum pedido encontrado com este ${labelTipo}.</p>`;
            return;
        }

        results.innerHTML = data.pedidos.map(renderPedidoAcompanhamento).join('');
    } catch (error) {
        results.innerHTML = `<p class="text-xs text-red-400">${error.message}</p>`;
    }
}

function abrirModalPedidoRecebido(pedido) {
    const backdrop = document.getElementById('order-success-backdrop');
    const idEl = document.getElementById('order-success-id');
    const statusEl = document.getElementById('order-success-status');
    if (!backdrop || !pedido) return;

    if (idEl) idEl.textContent = `#${pedido.id}`;
    if (statusEl) statusEl.textContent = pedido.status_label || 'Aguardando aprovação';
    backdrop.classList.remove('hidden');
}

function fecharModalPedidoRecebido() {
    const backdrop = document.getElementById('order-success-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

function obterHistoricoPedidos() {
    try {
        const salvos = localStorage.getItem('montae-historico-pedidos');
        return salvos ? JSON.parse(salvos) : [];
    } catch {
        return [];
    }
}

function salvarUltimoPedidoId(id) {
    if (!id) return;
    try {
        const historico = obterHistoricoPedidos();
        const idNum = Number(id);
        const listaAtualizada = [idNum, ...historico.filter(item => item !== idNum)].slice(0, 15);
        localStorage.setItem('montae-historico-pedidos', JSON.stringify(listaAtualizada));
        localStorage.setItem('montae-ultimo-pedido-id', String(id));
    } catch {
        localStorage.setItem('montae-ultimo-pedido-id', String(id));
    }
}
