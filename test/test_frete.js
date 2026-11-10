// Teste de validação da lógica de frete
function calcularFrete(km) {
    if (km <= 4) return 5.00;
    else if (km <= 5) return 7.00;
    else if (km <= 6) return 8.00;
    else if (km <= 7) return 10.00;
    else return 0;
}

console.log('\n=== TESTE DE FRETE - MONTAE BURGUER ===\n');

const testes = [
    { km: 0.5, esperado: 5.00, desc: 'Muito perto (500m)' },
    { km: 2.0, esperado: 5.00, desc: '2km' },
    { km: 3.9, esperado: 5.00, desc: '3.9km (limite de 4km)' },
    { km: 4.0, esperado: 5.00, desc: 'Exatos 4km' },
    { km: 4.1, esperado: 7.00, desc: '4.1km' },
    { km: 4.5, esperado: 7.00, desc: '4.5km' },
    { km: 5.0, esperado: 7.00, desc: 'Exatos 5km' },
    { km: 5.1, esperado: 8.00, desc: '5.1km' },
    { km: 5.8, esperado: 8.00, desc: '5.8km' },
    { km: 6.0, esperado: 8.00, desc: 'Exatos 6km' },
    { km: 6.1, esperado: 10.00, desc: '6.1km' },
    { km: 6.7, esperado: 10.00, desc: '6.7km' },
    { km: 7.0, esperado: 10.00, desc: 'Exatos 7km (limite maximo)' },
    { km: 7.1, esperado: 0, desc: '7.1km - FORA DA AREA' },
    { km: 10.0, esperado: 0, desc: '10km - FORA DA AREA' }
];

let passou = 0;
let falhou = 0;

testes.forEach((teste, i) => {
    const resultado = calcularFrete(teste.km);
    const ok = resultado === teste.esperado;
    
    if (ok) passou++;
    else falhou++;
    
    const status = ok ? '✓ PASSOU' : '✗ FALHOU';
    const cor = ok ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log(`Teste ${i + 1}: ${teste.desc}`);
    console.log(`  Distancia: ${teste.km}km`);
    console.log(`  Resultado: R$ ${resultado.toFixed(2)}`);
    console.log(`  Esperado: R$ ${teste.esperado.toFixed(2)}`);
    console.log(`  ${cor}${status}${reset}\n`);
});

console.log('=================================');
console.log(`RESUMO: ${passou}/${testes.length} testes passaram`);
if (falhou === 0) {
    console.log('\x1b[32m✓ TODOS OS TESTES PASSARAM!\x1b[0m');
} else {
    console.log(`\x1b[31m✗ ${falhou} teste(s) falharam\x1b[0m`);
}
console.log('=================================\n');
