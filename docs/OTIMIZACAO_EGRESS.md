# 🚀 Guia de Otimização - Redução de Egress no Supabase

## 📊 Problemas Identificados e Soluções

### 1. ⚠️ CRÍTICO: Polling Agressivo (Economia estimada: 70-80%)

**Problema Atual:**
```javascript
// frontend/js/schedule.js:173
setInterval(buscarStatusServidor, 15000); // A cada 15 segundos
```

**Impacto:**
- 100 usuários = 400 requests/minuto
- 1.000 usuários = 4.000 requests/minuto
- Com resposta de ~2KB = 8MB/minuto = **11GB/dia** só nessa funcionalidade!

**Solução Imediata: Aumentar Intervalo**
```javascript
// Mudar de 15s para 60s (reduz em 75%)
setInterval(buscarStatusServidor, 60000); // 1 minuto
```

**Solução Avançada: Server-Sent Events (SSE)**
Elimina polling completamente! O servidor notifica o cliente apenas quando há mudanças.

---

### 2. ⚠️ CRÍTICO: Queries Sem Paginação

**Problema Atual:**
```python
# app.py linha 587 - Carrega TODOS os pedidos
@app.get("/api/admin/pedidos")
def admin_listar_pedidos():
    pedidos = Pedido.query.all()  # 🔴 PROBLEMA!
    return jsonify({"pedidos": [p.to_dict() for p in pedidos]})
```

**Impacto:**
- 1.000 pedidos × 10KB cada = **10MB por requisição**
- Admin acessando 10x/dia = 100MB/dia
- 30 dias = **3GB/mês** só nessa rota!

**Solução: Implementar Paginação**
- Carregar apenas 20-50 pedidos por vez
- Usar lazy loading nos itens dos pedidos
- Carregar detalhes completos apenas quando necessário

---

### 3. ⚠️ MÉDIO: Eager Loading Desnecessário

**Problema:**
```python
# models.py linha 79
lazy="selectin"  # Carrega TODOS os itens de TODOS os pedidos automaticamente
```

**Solução:**
Mudar para `lazy="select"` e controlar quando carregar itens através do parâmetro `incluir_itens`.

---

### 4. ⚠️ ALTO: Ausência de Cache

Toda requisição vai direto ao banco. Implementar Flask-Caching pode reduzir 50-70% do tráfego em rotas frequentes como `/api/status-loja`.

---

### 5. ⚠️ MÉDIO: Dashboard Carrega Dados Desnecessários

Dashboard carrega objetos completos quando só precisa de agregações (COUNT, SUM).

---

## 📈 Resumo de Economia Estimada

| Otimização | Economia | Prioridade |
|------------|----------|------------|
| 1. Reduzir polling de 15s → 60s | **75%** | 🔴 CRÍTICA |
| 2. Implementar SSE | **90%** | 🟢 Alta |
| 3. Paginação de pedidos | **60-80%** | 🔴 CRÍTICA |
| 4. Lazy loading correto | **20-30%** | 🟡 Média |
| 5. Cache de 10s no status | **50%** | 🟢 Alta |
| 6. Otimizar queries dashboard | **40%** | 🟡 Média |

**Economia Total Combinada: 80-90% do Egress atual**

---

## 🎯 Plano de Ação Recomendado

### Fase 1 - Ganhos Rápidos (1 hora)
1. ✅ Aumentar intervalo de polling de 15s para 60s
2. ✅ Adicionar paginação em `/api/admin/pedidos`
3. ✅ Mudar lazy loading para `"select"`

### Fase 2 - Otimização Média (2-3 horas)
4. ✅ Implementar Flask-Caching
5. ✅ Otimizar queries de dashboard
6. ✅ Adicionar cache ao status da loja

### Fase 3 - Solução Definitiva (4-5 horas)
7. ✅ Implementar SSE para status em tempo real
8. ✅ Adicionar índices no banco de dados
9. ✅ Implementar compressão gzip nas respostas
