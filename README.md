# Avenco

Clareza para decidir. Controle para avançar. App pessoal de finanças: receitas, gastos, contas fixas, dívidas, patrimônio, metas e pendências, com visão do dia, da semana e do mês.

## Ficha

- **Abrir:** https://gustavodga.github.io/GD-CASH/ (Safari → Compartilhar → Adicionar à Tela de Início)
- **Quem usa:** Gustavo
- **Onde ficam os dados:** Firebase próprio (`gd-cash-45999`), na conta Google de quem entra. Regras em `firestore.rules` e `storage.rules`.
- **Publicação:** GitHub Pages, a cada push na `main`. Sem etapa de build.
- **Testes:** `npm test` (unitários com Node + ponta a ponta com Playwright). O workflow `ci.yml` roda os dois em todo push.

## Estrutura

```
index.html, style.css, app.js   o app (HTML, CSS e JavaScript puros)
manifest.json, sw.js, icon-*    instalação na tela inicial e funcionamento offline
firestore.rules, storage.rules  regras de segurança do Firebase
tests/                          testes unitários e de ponta a ponta
vendor-jspdf*.js                geração de PDF
```

O nome do repositório (GD-CASH) é o nome antigo do app. Ele foi mantido porque o endereço publicado depende dele: renomear tiraria do ar o app já instalado nos aparelhos.
