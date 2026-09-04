let chavePixCopiaCola = "";

// Função para disparar ao clicar no botão "Avançar/Confirmar Pedido"
async function processarPedidoPix() {
    const modal = document.getElementById('pix-modal');
    const loading = document.getElementById('pix-loading');
    const content = document.getElementById('pix-content');

    // Abre o modal em estado de carregamento
    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    content.classList.add('hidden');

    // Exemplo de dados coletados do formulário/carrinho
    const dadosPedido = {
        total: 35.90, // Substitua pelo valor real calculado no seu carrinho
        nome: "Cliente Teste",
        email: "cliente@email.com"
    };

    try {
        const response = await fetch('http://127.0.0.1:8000/api/criar-pix', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosPedido)
        });

        if (!response.ok) throw new Error('Erro ao gerar o PIX.');

        const data = await response.json();

        // Insere a imagem Base64 retornada pelo Python no <img>
        document.getElementById('pix-qr-image').src = `data:image/png;base64,${data.qr_code_base64}`;
        
        // Guarda a chave Copia e Cola
        chavePixCopiaCola = data.qr_code_copia_cola;

        // Oculta loader e exibe o QR Code
        loading.classList.add('hidden');
        content.classList.remove('hidden');
        content.classList.add('flex');

    } catch (error) {
        alert("Erro ao gerar o código PIX. Tente novamente.");
        fecharModalPix();
    }
}

// Função para copiar o código Pix para a área de transferência
function copiarChavePix() {
    if (!chavePixCopiaCola) return;

    navigator.clipboard.writeText(chavePixCopiaCola).then(() => {
        const btnText = document.getElementById('btn-copy-text');
        btnText.innerText = "Copiado com Sucesso!";
        
        setTimeout(() => {
            btnText.innerText = "Copiar Chave PIX";
        }, 3000);
    });
}

// Função para fechar o modal
function fecharModalPix() {
    document.getElementById('pix-modal').classList.add('hidden');
}