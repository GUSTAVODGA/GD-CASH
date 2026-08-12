# Testes — leitor de NF-e/DANFE (Frota / Lagos)

Testes reproduzíveis do parser de notas de combustível e do fluxo
"texto nativo → parser → OCR" (Etapa 1).

## Rodar

```bash
node frota/tests/parse-nfe.mjs
```

Requisitos:

- **Playwright** instalado (`import 'playwright'`) e Chromium disponível.
  - `CHROMIUM_PATH` (opcional): caminho do executável do Chromium.
- `PDFJS_LOCAL` (opcional): pasta contendo `pdf.local.js` e
  `pdf.worker.local.js` (mesma versão do app, 3.11.174). Com isso, os testes
  de **fluxo PDF** (texto nativo, multipágina, só-imagem) rodam offline.
  Sem isso, o runner tenta o CDN; se não houver rede, esses testes são
  **PULADOS** e o núcleo do parser roda 100% offline.

O runner copia os arquivos do app para uma pasta temporária e força o modo
demonstração — **não altera o código-fonte versionado**.

## Fixtures

- `fixtures/nfe-danfe-sintetica.txt` — DANFE **sintética** (identificadores
  fictícios: CNPJ, número, série, placa e chave de acesso inventados; a chave
  usa modelo `55`). Os valores numéricos (258,89 / 34,1100 / 7,5900 / 3169) são
  apenas montantes, não identificam ninguém.

**Nunca** versione o PDF real nem dados reais de notas/clientes nas fixtures.

## Cobertura

Parser (offline): valor, litros (4 casas), preço/litro, odômetro (com o caso
rodovia `KM 88` × veículo `KM: 3169`), chave de acesso (44 dígitos, com e sem
rótulo, inválida, e 44 dígitos sem contexto que **não** é aceito cegamente),
número/série/CNPJ, combustível, placa (fiscal, Mercosul em complementares e
rejeição de sequências que não são placa), validação tolerante que não corrige
valores incoerentes, e campos ausentes sem erro. Regressão dos consumidores
(conferência → despesa de combustível → vínculo ao veículo → km espelhado →
anexo) e OCR indisponível sem travar. Fluxo PDF (requer pdf.js): texto nativo
sem OCR, multipágina e decisão de OCR para PDF só-imagem.
