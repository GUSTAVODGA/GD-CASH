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
   podem ser expurgados por rotina auditável. Não implementada nesta etapa.

**Quem exclui a cópia transitória?** O **sócio autenticado**, pelo app, no ato
da confirmação (a exclusão passa pelo catch-all dos sócios). O **robô não tem
permissão** de excluir. A remoção só ocorre **depois** de o anexo permanente da
despesa estar comprovadamente salvo (`addAnexoRecord` retornou sem erro). Se a
remoção falhar, sobra **uma cópia extra** (anexo + `notaArquivos`), **nunca** se
perde o documento; um retry não cria anexos duplicados (id de tx determinístico +
dedup do anexo por conteúdo).

**Fonte permanente após a confirmação:** o **anexo da despesa** (`anexos`, mesmo
sistema atual). O metadado guarda `anexoTxId`. **Se a despesa for excluída**
depois: o anexo **persiste** (a exclusão da tx é *soft delete*, não remove
`anexos`); a nota **reabre** para revisão e o PDF continua **acessível** via
`anexoTxId`. Nunca há confirmação silenciosa de despesa inexistente.

---

## 4. Gravação atômica, idempotência, marcação e retry

- **Gravação ATÔMICA obrigatória:** o par (`notaArquivos/{id}` + `notasPendentes/
  {id}`) é criado numa **única** operação `documents:commit` com **duas writes**,
  cada uma com `currentDocument.exists=false`. Se qualquer parte falhar,
  **nenhuma** das duas existe. Duas requisições sequenciais **não** são
  atomicidade — não são usadas.
- **Vínculo BILATERAL nas regras:** `getAfter()`/`existsAfter()` validam o par
  na mesma operação — criar um sem o outro, ids/hashes divergentes, ou apontar
  para um doc antigo de outra nota são **negados** (ver seção Regras).
- **Identidade endereçada por conteúdo:** `id = 'nfe-' + sha256(pdf)`, e as regras
  exigem `sha256 == hashDoId(id)`. Logo, **a existência de um id prova o
  conteúdo**. Isso torna a idempotência **segura mesmo SEM leitura**: no retry, o
  robô reenvia o mesmo commit com `exists=false`; se o par já existe, recebe
  **FAILED_PRECONDITION** e trata como *já ingerido* — sem precisar ler para
  confirmar que é o mesmo par (conteúdo diferente ⇒ sha diferente ⇒ id diferente,
  nunca colide). **Não** se trata qualquer `ALREADY_EXISTS` como sucesso cego: só
  é seguro porque o id é o hash do conteúdo.
- **Marcação:** **não** confiar só no label da thread (ela pode receber anexos
  novos). A proteção **primária** é o armazenamento idempotente por `id` de
  conteúdo; a marcação da thread (`lagos-ingerido`) só acontece quando **tudo**
  deu certo. Se metadado **ou** arquivo falhar, o e-mail **não** é marcado →
  retry seguro no próximo ciclo.
- A dedup de **negócio** final (chave de acesso da NF-e) continua no momento de
  **confirmar a despesa**, no app.

---

## 5. Limites e arquivos

- **Teto do Firestore:** **1 048 576 bytes por documento**.
- Limite pela **fórmula REAL do Firestore** (não JSON.stringify): `string =
  bytes UTF-8 + 1`; `inteiro/timestamp = 8`; `null/bool = 1`; `mapa/array = 32 +
  itens`; **nome do doc** = Σ(segmento+1) + 16; **total** = nomeDoc + Σ(campos) + 32.
- **Cálculo exato** (id `notaArquivos/nfe-<64hex>`): overhead sem o valor do
  base64 = **371 bytes**; margem de segurança **48 576 bytes** →
  `docSizeMax` = **1 000 000**. Como um valor string de comprimento *L* soma
  exatamente *L* bytes, `maxBase64Len = 1 000 000 − 371 =` **999 629** e
  `maxPdfBytes = ⌊999 629 × ¾⌋ =` **749 721**. Todos os documentos finais ficam
  ≤ 1 000 000 < 1 048 576 (folga de ~48 KiB até o teto).
- **Testado:** PDF realista ~283 KB (aceito), exatamente no limite (aceito), um
  byte acima (rejeitado), metadados extras que empurram acima (rejeitado),
  documento final sempre < 1 MiB.
- **Data URL vs base64 cru:** guardamos o **base64 CRU** em `dataBase64` (sem o
  prefixo `data:application/pdf;base64,`, 28 bytes). O `mime` já é um campo, então
  o prefixo é **redundante** e só aumenta o overhead — o app reconstrói o data URL
  ao carregar. Reduz o documento e simplifica.
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
