// --- CONTROLE DE HORÁRIOS DE ATENDIMENTO (MONTAÊ BURGUER) ---
// Horários:
// Segunda: 18:30 às 23:00
// Terça-feira: Fechado
// Quarta: 18:30 às 23:00
// Quinta: 18:30 às 23:00
// Sexta: 18:30 às 00:00
// Sábado: 18:30 às 00:00
// Domingo: 18:30 às 23:00

const REGRAS_FUNCIONAMENTO = {
    0: { nome: "Domingo", aberto: true, inicioMin: 18 * 60 + 30, fimMin: 23 * 60, texto: "18:30 às 23:00" },
    1: { nome: "Segunda-feira", aberto: true, inicioMin: 18 * 60 + 30, fimMin: 23 * 60, texto: "18:30 às 23:00" },
    2: { nome: "Terça-feira", aberto: false, inicioMin: 0, fimMin: 0, texto: "Fechado" },
    3: { nome: "Quarta-feira", aberto: true, inicioMin: 18 * 60 + 30, fimMin: 23 * 60, texto: "18:30 às 23:00" },
    4: { nome: "Quinta-feira", aberto: true, inicioMin: 18 * 60 + 30, fimMin: 23 * 60, texto: "18:30 às 23:00" },
    5: { nome: "Sexta-feira", aberto: true, inicioMin: 18 * 60 + 30, fimMin: 24 * 60, texto: "18:30 às 00:00" },
    6: { nome: "Sábado", aberto: true, inicioMin: 18 * 60 + 30, fimMin: 24 * 60, texto: "18:30 às 00:00" }
};

/**
 * Retorna o status atual do restaurante com base no fuso horário de Brasília (UTC-3).
 */
function verificarStatusRestaurante(dateObj = null) {
    const spStr = (dateObj || new Date()).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const spDate = new Date(spStr);
    const diaSemana = spDate.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    const hora = spDate.getHours();
    const minuto = spDate.getMinutes();
    const minutosAtuais = hora * 60 + minuto;

    const regraHoje = REGRAS_FUNCIONAMENTO[diaSemana];

    let estaAberto = false;
    if (regraHoje.aberto && minutosAtuais >= regraHoje.inicioMin && minutosAtuais <= regraHoje.fimMin) {
        estaAberto = true;
    }

    // Calcular mensagem da próxima abertura
    let proximaAbertura = '';
    if (!estaAberto) {
        if (regraHoje.aberto && minutosAtuais < regraHoje.inicioMin) {
            proximaAbertura = 'Abrimos hoje às 18:30';
        } else if (diaSemana === 1 && minutosAtuais > regraHoje.fimMin) {
            proximaAbertura = 'Abrimos quarta-feira às 18:30 (terça-feira fechado)';
        } else if (diaSemana === 2) {
            proximaAbertura = 'Abrimos quarta-feira às 18:30';
        } else {
            const proxDia = (diaSemana + 1) % 7;
            const regraProx = REGRAS_FUNCIONAMENTO[proxDia];
            if (proxDia === 2) {
                proximaAbertura = 'Abrimos quarta-feira às 18:30';
            } else {
                proximaAbertura = `Abrimos ${regraProx.nome.toLowerCase()} às 18:30`;
            }
        }
    }

    return {
        estaAberto,
        diaSemana,
        nomeDia: regraHoje.nome,
        horarioHoje: regraHoje.texto,
        proximaAbertura,
        horaAtualFormatada: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
    };
}

/**
 * Abre o modal informativo de horários de funcionamento.
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
 * Atualiza o conteúdo visual do modal de horários com base no dia e hora atuais.
 */
function atualizarConteudoModalHorarios() {
    const status = verificarStatusRestaurante();
    const statusContainer = document.getElementById('modal-horarios-status');
    const listaDias = document.getElementById('modal-horarios-lista');

    if (statusContainer) {
        if (status.estaAberto) {
            statusContainer.innerHTML = `
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black text-xs uppercase tracking-wider">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Aberto Agora (Fecha às ${status.horarioHoje.split(' às ')[1] || '23:00'})</span>
                </div>
            `;
        } else {
            statusContainer.innerHTML = `
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-black text-xs uppercase tracking-wider">
                    <span class="w-2 h-2 rounded-full bg-red-500"></span>
                    <span>Fechado no Momento</span>
                </div>
                <p class="text-xs text-neutral-400 mt-1 font-semibold">${status.proximaAbertura}</p>
            `;
        }
    }

    if (listaDias) {
        const diasSemana = [
            { id: 1, nome: "Segunda-feira", horario: "18:30 às 23:00" },
            { id: 2, nome: "Terça-feira", horario: "Fechado", fechado: true },
            { id: 3, nome: "Quarta-feira", horario: "18:30 às 23:00" },
            { id: 4, nome: "Quinta-feira", horario: "18:30 às 23:00" },
            { id: 5, nome: "Sexta-feira", horario: "18:30 às 00:00" },
            { id: 6, nome: "Sábado", horario: "18:30 às 00:00" },
            { id: 0, nome: "Domingo", horario: "18:30 às 23:00" },
        ];

        let html = '';
        diasSemana.forEach(d => {
            const isHoje = d.id === status.diaSemana;
            const bgClass = isHoje 
                ? 'bg-[#FF9F0D]/15 border-[#FF9F0D]/60 text-white font-black shadow-md' 
                : 'bg-neutral-900/60 border-neutral-800 text-neutral-300';
            const badgeHoje = isHoje ? `<span class="text-[10px] bg-[#FF9F0D] text-black font-black px-1.5 py-0.5 rounded uppercase ml-1.5">Hoje</span>` : '';
            const corHorario = d.fechado ? 'text-red-400 font-bold' : (isHoje ? 'text-[#FF9F0D] font-black' : 'text-neutral-300');

            html += `
                <li class="flex items-center justify-between p-2.5 rounded-xl border ${bgClass} transition">
                    <div class="flex items-center">
                        <span class="text-xs">${d.nome}</span>
                        ${badgeHoje}
                    </div>
                    <span class="text-xs ${corHorario}">${d.horario}</span>
                </li>
            `;
        });
        listaDias.innerHTML = html;
    }
}

/**
 * Atualiza todos os elementos visuais na página (badges no header, banner de aviso, botões do carrinho).
 */
function atualizarInterfaceHorario() {
    const status = verificarStatusRestaurante();

    // 1. Badge do Header / Navegação
    const badgeHeader = document.getElementById('status-restaurante-badge');
    if (badgeHeader) {
        if (status.estaAberto) {
            badgeHeader.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[11px] font-black tracking-wide cursor-pointer hover:bg-emerald-500/30 transition";
            badgeHeader.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Aberto</span>
            `;
        } else {
            badgeHeader.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-[11px] font-black tracking-wide cursor-pointer hover:bg-red-500/30 transition";
            badgeHeader.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-red-500"></span>
                <span>Fechado</span>
            `;
        }
    }

    // 2. Banner de Alerta Superior (quando fechado)
    const bannerFechado = document.getElementById('banner-restaurante-fechado');
    const bannerTexto = document.getElementById('banner-fechado-texto');
    if (bannerFechado) {
        if (!status.estaAberto) {
            bannerFechado.classList.remove('hidden');
            if (bannerTexto) {
                bannerTexto.textContent = `Restaurante Fechado no momento • ${status.proximaAbertura}`;
            }
        } else {
            bannerFechado.classList.add('hidden');
        }
    }

    // 3. Atualização do botão no construtor e carrinho se fechado
    const btnSubmitBuilder = document.getElementById('btn-builder-submit');
    if (btnSubmitBuilder) {
        if (!status.estaAberto) {
            btnSubmitBuilder.classList.remove('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
            btnSubmitBuilder.classList.add('bg-neutral-800', 'text-neutral-400', 'hover:bg-neutral-700');
            btnSubmitBuilder.innerHTML = `<i class="fa-solid fa-clock text-xs"></i> <span>Restaurante Fechado</span>`;
        } else {
            btnSubmitBuilder.classList.remove('bg-neutral-800', 'text-neutral-400', 'hover:bg-neutral-700');
            btnSubmitBuilder.classList.add('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
            btnSubmitBuilder.innerHTML = `<i class="fa-solid fa-cart-plus text-sm sm:text-base"></i> <span>Adicionar</span>`;
        }
    }

    const btnCheckout = document.getElementById('btn-checkout');
    if (btnCheckout && !status.estaAberto) {
        btnCheckout.classList.remove('bg-[#FF9F0D]', 'hover:bg-[#E08800]', 'text-black');
        btnCheckout.classList.add('bg-neutral-800', 'text-neutral-400', 'cursor-not-allowed');
        btnCheckout.innerHTML = `<i class="fa-solid fa-lock text-xs"></i> <span>Fechado no Momento</span>`;
    }
}

// Inicializa no carregamento e atualiza a cada 60 segundos
window.addEventListener('DOMContentLoaded', () => {
    atualizarInterfaceHorario();
    setInterval(atualizarInterfaceHorario, 60000);
});

// Exporta globalmente para uso em cart.js e checkout.js
window.verificarStatusRestaurante = verificarStatusRestaurante;
window.abrirModalHorarios = abrirModalHorarios;
window.fecharModalHorarios = fecharModalHorarios;
window.atualizarInterfaceHorario = atualizarInterfaceHorario;
