# 🔧 Código de Implementação - Otimizações

## 1. Solução Polling (schedule.js)

### Opção A: Aumentar Intervalo (Mais Fácil)
```javascript
// Linha 173 de frontend/js/schedule.js
// DE:
setInterval(buscarStatusServidor, 15000); // 15 segundos

// PARA:
setInterval(buscarStatusServidor, 60000); // 60 segundos (reduz 75% do tráfego)
```

### Opção B: Polling Inteligente (Recomendado)
```javascript
// Adicionar no final de schedule.js
let intervaloAtual = 60000;
let intervalId;
let tempoInativo = 0;

function iniciarPollingInteligente() {
    intervalId = setInterval(buscarStatusServidor, intervaloAtual);
    
    // Detecta atividade do usuário
    let timeoutInatividade;
    const resetarInatividade = () => {
        tempoInativo = 0;
        if (intervaloAtual !== 30000) {
            clearInterval(intervalId);
            intervaloAtual = 30000; // 30s quando ativo
            intervalId = setInterval(buscarStatusServidor, intervaloAtual);
        }
        
        clearTimeout(timeoutInatividade);
        timeoutInatividade = setTimeout(() => {
            if (intervaloAtual !== 120000) {
                clearInterval(intervalId);
                intervaloAtual = 120000; // 2 min quando inativo
                intervalId = setInterval(buscarStatusServidor, intervaloAtual);
            }
        }, 120000);
    };
    
    document.addEventListener('mousemove', resetarInatividade);
    document.addEventListener('click', resetarInatividade);
    document.addEventListener('scroll', resetarInatividade);
}

// Substituir no DOMContentLoaded:
window.addEventListener('DOMContentLoaded', () => {
    buscarStatusServidor();
    iniciarPollingInteligente(); // Em vez de setInterval simples
});
```

---

## 2. Paginação de Pedidos (backend/app.py)

```python
# Substituir a rota admin_listar_pedidos (linha ~587)
@app.get("/api/admin/pedidos")
@login_admin_obrigatorio
def admin_listar_pedidos():
    """Lista pedidos do quadro Kanban com paginação"""
    pagina = request.args.get('pagina', 1, type=int)
    por_pagina = request.args.get('por_pagina', 50, type=int)
    
    # Limitar para evitar sobrecarga
    por_pagina = min(por_pagina, 100)
    
    query = Pedido.query.filter(Pedido.status.in_(STATUS_KANBAN))
    paginacao = query.order_by(Pedido.criado_em.desc()).paginate(
        page=pagina,
        per_page=por_pagina,
        error_out=False
    )
    
    return jsonify({
        "pedidos": [p.to_dict(incluir_itens=False) for p in paginacao.items],
        "total": paginacao.total,
        "pagina": pagina,
        "tem_proxima": paginacao.has_next
    })

# Adicionar nova rota para detalhes completos
@app.get("/api/admin/pedidos/<int:pedido_id>")
@login_admin_obrigatorio
def admin_obter_pedido_detalhado(pedido_id):
    """Retorna detalhes completos de um pedido específico"""
    pedido = Pedido.query.get_or_404(pedido_id)
    return jsonify({"pedido": pedido.to_dict(incluir_itens=True)})
```

---

## 3. Lazy Loading Correto (backend/models.py)

```python
# Linha 74-80, mudar de:
itens = db.relationship(
    "ItemPedido",
    backref="pedido",
    cascade="all, delete-orphan",
    order_by="ItemPedido.id",
    lazy="selectin",  # ❌ REMOVE ISSO
)

# Para:
itens = db.relationship(
    "ItemPedido",
    backref="pedido",
    cascade="all, delete-orphan",
    order_by="ItemPedido.id",
    lazy="select",  # ✅ Só carrega quando acessado
)
```

---

## 4. Implementar Cache (backend/app.py)

### Instalar dependência primeiro:
```bash
pip install Flask-Caching
pip freeze > requirements.txt  # Atualizar requirements
```

### Adicionar no início do app.py:
```python
# Após as importações existentes (linha ~16)
from flask_caching import Cache

# Após configurar o app (linha ~69, depois do CORS)
cache = Cache(app, config={
    'CACHE_TYPE': 'simple',
    'CACHE_DEFAULT_TIMEOUT': 60
})
```

### Adicionar cache nas rotas críticas:
```python
# Rota de status (linha ~556)
@app.get("/api/status-loja")
@cache.cached(timeout=10, query_string=True)  # Cache de 10 segundos
def status_loja():
    aberto, msg = restaurante_aberto()
    return jsonify({"aberto": aberto, "ativo": aberto, "mensagem": msg})

# Limpar cache quando admin alterar configuração (linha ~865)
@app.post("/api/admin/configuracoes/horario-funcionamento")
@login_admin_obrigatorio
def atualizar_config_horario():
    data = request.get_json(silent=True) or {}
    # ... código existente ...
    
    cache.delete_memoized(status_loja)  # ✅ ADICIONAR ESTA LINHA
    
    return jsonify({
        "success": True,
        "ativo": ativo,
        # ... resto da resposta
    })
```

---

## 5. Otimizar Dashboard (backend/app.py)

```python
# Adicionar cache no dashboard (linha ~666)
@app.get("/api/admin/dashboard")
@login_admin_obrigatorio
@cache.cached(timeout=60)  # Cache de 1 minuto
def admin_dashboard():
    # ... código existente permanece igual ...
    pass

# Otimizar consultas usando apenas agregações
# Substituir queries que carregam objetos por:
total_hoje = db.session.query(
    func.count(Pedido.id),
    func.sum(Pedido.total)
).filter(
    Pedido.status == STATUS_FINALIZADO,
    func.date(Pedido.criado_em) == datetime.now().date()
).first()

pedidos_hoje_count = total_hoje[0] or 0
vendas_hoje_valor = round(total_hoje[1] or 0, 2)
```

---

## 6. Compressão GZIP

### Instalar:
```bash
pip install Flask-Compress
pip freeze > requirements.txt
```

### Adicionar no app.py:
```python
# Após importações (linha ~16)
from flask_compress import Compress

# Após configurar CORS (linha ~69)
Compress(app)
```

Isso automaticamente comprime todas as respostas > 500 bytes, reduzindo tráfego em ~70%.

---

## 📊 Ordem de Implementação Recomendada

1. **Imediato** (5 minutos): Aumentar intervalo de polling para 60s
2. **Rápido** (15 minutos): Mudar lazy loading
3. **Médio** (30 minutos): Instalar e configurar cache + compress
4. **Avançado** (1-2 horas): Implementar paginação completa
