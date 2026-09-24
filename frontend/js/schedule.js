// --- CONTROLE DE HORÁRIOS E STATUS DO RESTAURANTE (MONTAÊ BURGUER) ---
// O status de funcionamento é controlado dinamicamente via Painel Administrativo (/api/status-loja)

let statusRestauranteCache = {
    estaAberto: true,
    mensagem: "",
    carregado: false
};

/**
 * Consulta o status atual da loja no servidor backend
 */
async function buscarStatusServidor() {
    try {
        const res = await fetch("/api/status-loja?t=" + Date.now(), {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" }
        });
        if (res.ok) {
            const data = await res.json();
            const aberto = Boolean(data.aberto ?? data.ativo ?? true);
            statusRestauranteCache = {
                estaAberto: aberto,
                mensagem: data.mensagem || (aberto ? "Restaurante aberto para pedidos." : "O restaurante está fechado para pedidos no momento."),
                carregado: true
            };
            atualizarInterfaceHorario();
            return statusRestauranteCache;
        }
    } catch (err) {
        console.warn("Não foi possível consultar status da loja no servidor:", err);
    }
    return statusRestauranteCache;
}

/**
 * Retorna o status atual do restaurante.
 */
function verificarStatusRestaurante() {
    return {
        estaAberto: statusRestauranteCache.estaAberto,
        mensagem: statusRestauranteCache.mensagem || (statusRestauranteCache.estaAberto ? "" : "O restaurante está fechado para pedidos no momento."),
        proximaAbertura: statusRestauranteCache.estaAberto ? "Aberto para pedidos" : "Restaurante temporariamente desativado para novos pedidos"
    };
}

/**
 * Abre o modal informativo de restaurante fechado / horários.
 */
function abrirModalHorarios() {
    const backdrop = document.getElementById('modal-horarios-backdrop');
    if (!backdrop) return;

    atualizarConteudoModalHorarios();
    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
}

/**
 * Fecha o modal de horários.
 */
function fecharModalHorarios() {
    const backdrop = document.getElementById('modal-horarios-backdrop');
    if (!backdrop) return;

    backdrop.classList.add('hidden');
    backdrop.classList.remove('flex');
}

/**
 * Atualiza o conteúdo visual do modal de horários/status.
 */
function atualizarConteudoModalHorarios() {
    const status = verificarStatusRestaurante();
    const statusContainer = document.getElementById('modal-horarios-status');
    const msgContainer = document.getElementById('modal-horarios-msg');

    if (statusContainer) {
        if (status.estaAberto) {
            statusContainer.innerHTML = `
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black text-xs uppercase tracking-wider">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Aberto para Pedidos</span>
                </div>
            `;
        } else {
            statusContainer.innerHTML = `
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black text-xs uppercase tracking-wider">
                    <span class="w-2 h-2 rounded-full bg-red-500"></span>
                    <span>Fechado para Pedidos</span>
                </div>
            `;
        }
    }

    if (msgContainer) {
        msgContainer.textContent = status.mensagem || (status.estaAberto ? "Estamos prontos para receber o seu pedido!" : "Nosso horário de funcionamento está desativado no momento. Por favor, volte mais tarde!");
    }
}

/**
 * Atualiza todos os elementos visuais na página (badges no header, banner de aviso, botões).
 */
function atualizarInterfaceHorario() {
    const status = verificarStatusRestaurante();

    // 1. Badge do Header / Navegação
    const badgeHeader = document.getElementById('status-restaurante-badge');
    if (badgeHeader) {
        if (status.estaAberto) {
            badgeHeader.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[11px] font-black tracking-wide cursor-pointer hover:bg-emerald-500/30 transition shadow-sm";
            badgeHeader.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Aberto</span>
            `;
            badgeHeader.title = "Restaurante aberto para receber pedidos!";
        } else {
            badgeHeader.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-[11px] font-black tracking-wide cursor-pointer hover:bg-red-500/30 transition shadow-sm";
            badgeHeader.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-red-500"></span>
                <span>Fechado</span>
            `;
            badgeHeader.title = "Restaurante fechado no momento. Clique para mais detalhes.";
        }
    }

    // 2. Banner de Alerta Superior (quando fechado)
    const bannerFechado = document.getElementById('banner-restaurante-fechado');
    const bannerTexto = document.getElementById('banner-fechado-texto');
    if (bannerFechado) {
        if (!status.estaAberto) {
            bannerFechado.classList.remove('hidden');
            if (bannerTexto) {
                bannerTexto.textContent = status.mensagem || "Aviso: Restaurante Fechado no momento. Pedidos temporariamente desativados.";
            }
        } else {
            bannerFechado.classList.add('hidden');
        }
    }

    // 3. Atualização do botão no construtor
    const btnSubmitBuilder = document.getElementById('btn-builder-submit');
    if (btnSubmitBuilder) {
        if (!status.estaAberto) {
            btnSubmitBuilder.classList.remove('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
            btnSubmitBuilder.classList.add('bg-neutral-800', 'text-neutral-400', 'hover:bg-neutral-700');
            btnSubmitBuilder.innerHTML = `<i class="fa-solid fa-lock text-xs"></i> <span>Restaurante Fechado</span>`;
        } else {
            btnSubmitBuilder.classList.remove('bg-neutral-800', 'text-neutral-400', 'hover:bg-neutral-700');
            btnSubmitBuilder.classList.add('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
            btnSubmitBuilder.innerHTML = `<i class="fa-solid fa-cart-plus text-sm sm:text-base"></i> <span>Adicionar</span>`;
        }
    }

    // 4. Atualização do botão de checkout
    const btnCheckout = document.getElementById('btn-checkout');
    if (btnCheckout) {
        if (!status.estaAberto) {
            btnCheckout.classList.remove('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
            btnCheckout.classList.add('bg-neutral-800', 'text-neutral-400', 'cursor-not-allowed');
            btnCheckout.innerHTML = `<i class="fa-solid fa-lock text-xs"></i> <span>Restaurante Fechado</span>`;
        } else {
            btnCheckout.classList.remove('bg-neutral-800', 'text-neutral-400', 'cursor-not-allowed');
            btnCheckout.classList.add('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
            btnCheckout.innerHTML = `<span>Finalizar Pedido</span> <i class="fa-solid fa-arrow-right text-xs"></i>`;
        }
    }
}

// Inicializa no carregamento e consulta a cada 15 segundos
window.addEventListener('DOMContentLoaded', () => {
    buscarStatusServidor();
    setInterval(buscarStatusServidor, 15000);
});

// Exporta globalmente para uso em cart.js, checkout.js e ui.js
window.buscarStatusServidor = buscarStatusServidor;
window.verificarStatusRestaurante = verificarStatusRestaurante;
window.abrirModalHorarios = abrirModalHorarios;
window.fecharModalHorarios = fecharModalHorarios;
window.atualizarInterfaceHorario = atualizarInterfaceHorario;
