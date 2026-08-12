# Ponte Gmail → fila "Notas para revisar" — projeto (Etapa 3)

Projeto e prova **isolada** de como um Google Apps Script localizará os e-mails
do posto, escolherá o PDF certo e produzirá um item para a fila do Lagos, com
segurança e sem duplicidade.

> **Nada aqui acessa Gmail, Firestore, IAM ou credenciais reais.** A lógica está
> em `bridge.mjs` (funções puras) e é exercitada por `../tests/gmail-bridge.mjs`.
> O Apps Script real, os gatilhos, a service account/usuário-robô e as Rules
> **não** fazem parte desta etapa.

Remetente confirmado do posto: **`appisca.nfe@gmail.com`**.

---

## 1. Arquitetura de autenticação

O problema central: **uma service account acessando o Firestore por IAM ignora
as Security Rules**, e o papel de IAM do Firestore é do **banco inteiro** (não dá
para restringir a uma coleção só por IAM). Logo, uma regra baseada em
`request.auth.token.email` **não** limita uma chamada administrativa/IAM. Além
disso, nenhum segredo pode ficar no JavaScript público do GitHub Pages, e o
catch-all dos sócios **não** deve ser ampliado para incluir o robô.

### Recomendada — usuário-robô do Firebase Auth + regra estreita (Rules valem)

O robô tem **identidade própria de usuário final** no Firebase Auth
(ex.: `robo-notas@…`), **fora** do catch-all `isSocio()`. Como ele grava como
usuário autenticado (não como service account), **as Security Rules se aplicam**.
Acrescenta-se uma regra **estreita e separada** (sem tocar no catch-all):

```
// (NÃO aplicar nesta etapa — projeto apenas)
match /notasPendentes/{id} {
  allow create: if request.auth != null
    && request.auth.token.email == 'robo-notas@SEU-DOMINIO'
    && request.resource.data.origem == 'email'
    && request.resource.data.keys().hasOnly([...campos permitidos...])
    && request.resource.data.status == 'recebida';
  allow read, update, delete: if false;   // robô só cria na fila
}
```

- **Identidade:** usuário Firebase Auth dedicado ao robô (e-mail/senha).
- **Onde ficam os segredos:** senha do robô + API key do Firebase nas
  **Script Properties** do Apps Script (nunca no GitHub, nunca no `app.js`).
- **Acesso restrito à entrada da fila:** a regra permite **apenas `create` em
  `notasPendentes`**, com `origem:'email'`, `status:'recebida'` e conjunto de
  campos fechado; **nega** read/update/delete e **todas** as outras coleções
  (`tx`, `vehicles`, `kmlog`, `financiamentos`, …) por padrão deny.
- **Impacto em Rules/IAM:** adiciona **uma** regra `match /notasPendentes`;
  **não** amplia o catch-all; **nenhuma** mudança de IAM.
- **Custo:** R$ 0 (plano Spark) — poucas gravações/dia.
- **Riscos e revogação:** se a senha vazar, o dano máximo é **criar itens na
  fila** (nunca despesa, nunca outras coleções). Revogação **imediata**:
  desabilitar/rotacionar o usuário no Auth ou desligar a regra.
- **Como testar sem a conta do Luiz:** **Firebase Emulator Suite** (Auth +
  Firestore) carregando essas Rules; um harness sintético entra como o
  robô-emulado e comprova que **consegue** criar em `notasPendentes` e é
  **negado** em `tx`/`vehicles`/update/delete. Tudo local; nenhuma conta real.

### Contingência — Cloud Function como único porta-chaves da service account

Se um usuário-robô no Auth não for desejado, uma **Cloud Function (2ª geração)**
é o **único** componente que detém a service account. O Apps Script chama a
função (autenticado por OIDC/segredo compartilhado); o **código da função** só
grava em `notasPendentes`, com allowlist de coleção **e** de campos, rejeitando
qualquer outra forma.

- **Identidade:** service account **exclusiva** da função (Google-managed).
- **Segredos:** a chave da service account **nunca sai da função** (não vai para
  Apps Script nem GitHub); o Apps Script guarda só um token/segredo de chamada.
- **Acesso restrito:** como IAM ignora Rules, a restrição vive no **código da
  função** (único ponto auditável): coleção fixa + campos fixos + validação.
- **Impacto em Rules/IAM:** cria 1 service account + 1 função; Rules inalteradas.
- **Custo:** Cloud Functions exige o plano **Blaze** (pay-per-use); ~10
  chamadas/dia ≈ custo desprezível, mas requer faturamento habilitado.
- **Riscos e revogação:** superfície maior (a função pode, tecnicamente, gravar
  em qualquer coleção — mitigado pelo código). Revogação: desabilitar/excluir a
  função ou rotacionar a chave.
- **Como testar sem o Luiz:** rodar a função localmente (functions-framework /
  emulador) com payloads sintéticos e comprovar que só a fila é escrita.

**Escolha:** a **recomendada** é preferível — mantém as Rules no comando, dá
privilégio mínimo real por coleção, dispensa Blaze e tem raio de dano mínimo.

---

## 2. Por que o acesso fica restrito

- O robô **cria** documentos **apenas** em `notasPendentes`.
- **Nunca** escreve em `tx`, `vehicles`, `kmlog`, `financiamentos` nem em
  qualquer outra coleção; **não** lê, **não** atualiza, **não** apaga.
- O catch-all dos sócios permanece **intacto**; a permissão do robô é uma regra
  separada e estreita.
- Nenhum segredo no front-end público; a autenticação acontece no Apps Script
  (Script Properties) ou dentro da Cloud Function.
- A criação da **despesa** continua sendo **decisão humana** no app; o robô só
  abastece a fila para revisão.

---

## 3. Modelo final SEPARADO (Etapa 4) — dois documentos por PDF

O base64 NÃO fica no metadado. Cada PDF vira **dois** documentos com o **mesmo
id** (`nfe-<sha256>`), gravados nesta ordem (o metadado exige o arquivo):

`notaArquivos/{id}` — só o arquivo (lido sob demanda; a lista/listener nunca o baixa):
```jsonc
{ "notaPendenteId": "nfe-<sha256>", "sha256": "<hex>", "mime": "application/pdf",
  "nome": "nota.pdf", "tamanhoBytes": 283000,
  "dataBase64": "data:application/pdf;base64,….", "criadoEm": <ts> }
```
`notasPendentes/{id}` — metadado leve (SEM base64):
```jsonc
{ "status": "recebida", "origem": "email", "recebidoEm": <ts>,
  "emailMessageId": "<gmail messageId>", "emailFrom": "… <appisca.nfe@gmail.com>",
  "emailAssunto": "<assunto, só proteção adicional>", "sha256": "<hex>",
  "lido": {}, "arquivoId": "nfe-<sha256>", "tamanhoBytes": 283000,
  "txId": null, "motivoRejeicao": null, "erroLeitura": null }
```

O teste 12 comprova que `novaNotaPendente(metadado)` produz uma nota válida
(preserva `id`/`origem`/`arquivoId`/e-mail, `status:'recebida'`, **sem** base64).

### Ciclo do PDF sem duplicação permanente (app)

1. **recebido** — o arquivo existe em `notaArquivos`; o metadado o referencia.
2. **confirmado** — ao confirmar, a despesa recebe o PDF pelo anexo atual
   (`addAnexoRecord`, compatibilidade mantida).
3. **migração** — só **depois** de comprovar que a despesa tem o anexo, a cópia
   transitória (`notaArquivos`) é removida e o metadado passa a referenciar o
   anexo da tx (`anexoTxId`). Fica **uma** cópia permanente.
4. Falha intermediária **não perde** o PDF (permanece em `notaArquivos`); retry
   é idempotente (não duplica arquivo nem despesa).
5. Nota **rejeitada** mantém o PDF.
6. **Sem limpeza automática** ainda. *Política de retenção futura:* arquivos de
   `notaArquivos` órfãos (nota rejeitada há > N dias, ou confirmada e já migrada)
   podem ser expurgados por rotina auditável; o anexo da despesa é a fonte
   definitiva. Não implementada nesta etapa.

---

## 4. Hash, idempotência, marcação e retry

- **Identidade do documento:** `idDocumento(sha256(pdf))` — endereçada por
  **conteúdo** (SHA-256). Dois e-mails com o **mesmo PDF** produzem o mesmo
  `id` → reconhecidos como o **mesmo documento** (sem duplicar). Nome e tamanho
  são só metadados (arquivos diferentes podem ter o mesmo nome/tamanho, por isso
  **não** entram na identidade).
- **Referência por anexo/mensagem:** `refAnexo(messageId, sha256)` — usada na
  **marcação por mensagem** no Gmail.
- **Marcação:** **não** confiar só no label da thread (a thread pode receber
  mensagens/anexos novos). Marca-se **por mensagem/anexo** (`refAnexo`), e a
  **fonte de verdade primária é o armazenamento idempotente** por `idDocumento`.
- **Retry após falha:** se o robô cair **depois** de gravar o item e **antes** de
  marcar o Gmail, ao reprocessar ele recomputa o `sha256` → o item já existe (id
  idêntico) → **não duplica**. Se cair **antes** de gravar, o retry cria o item
  **uma única vez**. A dedup de negócio final (chave de acesso da NF-e) continua
  no momento de **confirmar a despesa**, no app.

---

## 5. Limites e arquivos

- **Firestore:** ~**1 MiB por documento**, contando **todos** os campos.
- Limite **calculado sobre o tamanho serializado COMPLETO** do documento de
  arquivo (base64 + campos), não sobre o máximo teórico: **`docMaxSeguro`
  = 900 000 bytes** (margem de ~145 KiB abaixo do teto), com `maxPdfBytes`
  derivado ≈ **674 KB**. Testado: PDF realista ~283 KB (aceito), exatamente no
  limite (aceito), um byte acima (rejeitado), metadados extras que empurram
  acima (rejeitado), documento final sempre < 1 MiB.
- **Rejeição controlada:** arquivo acima do limite é **ignorado com motivo
  `arquivo_grande`** — **nunca** há corte silencioso; os demais PDFs do mesmo
  e-mail seguem normalmente. No app, a importação para a fila rejeita
  explicitamente com aviso.
- **Firestore × Storage:** guardar o PDF **no Firestore** (base64) mantém tudo
  num lugar só, no plano gratuito, coberto pelas mesmas Rules — bom para
  arquivos pequenos e baixo volume. O **Firebase Storage** seria melhor para
  arquivos grandes/muitos (sem o teto de 1 MiB), mas adiciona outra superfície,
  outras regras e (na prática) Blaze.
- **Recomendação (~10 notas/dia):** manter **no Firestore** — ~10 PDFs/dia de
  algumas centenas de KB ficam muito abaixo de qualquer limite diário; o app já
  comprime/recusa arquivos grandes. Reavaliar o Storage só se o volume crescer
  muito ou os PDFs passarem a ser grandes.

Arquivos:
- `bridge.mjs` — funções puras da ponte (par metadado+arquivo, limites). Não
  carregado pelo app.
- `firestore.rules` — **regras PROPOSTAS** (Emulator-only; NÃO aplicar no
  Console). Robô por UID fixo, só cria os dois documentos da fila.
- `appsscript-template.gs` — **template** do Apps Script (sem segredos, não
  executado; Firebase Auth como usuário final; retry idempotente).
- `README.md` — este projeto.
- `../tests/gmail-bridge.mjs` — casos sintéticos (remetente, PDF/XML, dedup,
  retry, limite, compat com `novaNotaPendente`).
- `../tests/rules.emulator.mjs` — prova de permissões rodando DE VERDADE no
  Firestore Emulator (robô/sócio/comum/anônimo).

## Rodar a prova do Emulator (sem Firebase real)

```bash
# num diretório com firebase-tools + @firebase/rules-unit-testing + firebase:
firebase emulators:exec --only firestore --project lagos-test \
  "node <repo>/frota/tests/rules.emulator.mjs"
```
As regras vêm de `firestore.rules`. Nada real é acessado.
