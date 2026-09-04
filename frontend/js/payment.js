let chavePixCopiaCola = "";

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
