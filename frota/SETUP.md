# Lagos Serviços de Transporte — Guia de configuração (Firebase)

O app funciona em **modo demonstração** (dados salvos só no aparelho) enquanto o Firebase
não é configurado. Para que os **3 sócios** vejam os mesmos dados em tempo real, siga os
passos abaixo (uns 15 minutos, tudo gratuito no plano Spark do Firebase).

> É o mesmo processo que fizemos no GD Cash, com duas diferenças:
> login por **e-mail/senha** (em vez de Google) e **um banco compartilhado** entre os 3.

---

## 1. Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com e faça login com sua conta Google.
2. **Adicionar projeto** → nome: `lagos-operacional` → pode desativar o Google Analytics → **Criar**.

## 2. Registrar o app web

1. Na tela inicial do projeto, clique no ícone **`</>` (Web)**.
2. Apelido: `Lagos` → **Registrar app** (não precisa marcar Hosting).
3. Vai aparecer um bloco `const firebaseConfig = { ... }`. **Copie esses valores** e cole
   no topo do arquivo `app.js` desta pasta, substituindo os `"COLE_AQUI"`.

## 3. Ativar o login por e-mail/senha

1. Menu lateral → **Criação (Build)** → **Authentication** → **Vamos começar**.
2. Aba **Método de login** → **E-mail/senha** → ativar a primeira opção → **Salvar**.

## 4. Criar os 3 usuários (os sócios)

A empresa usa **um único e-mail** (ex.: `lagostransportes@gmail.com`), mas cada
sócio precisa do seu próprio login para o app saber quem fez cada lançamento.
O truque é o apelido com **`+`**: tudo que chega para `empresa+qualquercoisa@gmail.com`
cai na caixa de entrada de `empresa@gmail.com`.

1. Ainda em **Authentication**, aba **Usuários** → **Adicionar usuário**.
2. Crie um usuário para cada sócio usando o e-mail da empresa com o apelido,
   cada um com sua própria senha inicial:
   - `lagosoperacional+luispaulo@gmail.com` (Luís Paulo)
   - `lagosoperacional+ygor@gmail.com` (Ygor)
   - `lagosoperacional+thadeu@gmail.com` (Thadeu)
3. **Importante:** o app não tem tela de cadastro de propósito — só entra quem
   você criar aqui. O "Esqueci minha senha" manda o link para a caixa da empresa.

## 4b. Preencher os perfis no app (tela "Quem está usando?")

No topo do `app.js` existe a lista `SOCIOS`. Preencha com o nome e o e-mail de
login de cada sócio (mesmos e-mails do passo 4):

```js
const SOCIOS = [
  { nome: 'Luís Paulo', email: 'lagosoperacional+luispaulo@gmail.com', foto: '' },
  { nome: 'Ygor',       email: 'lagosoperacional+ygor@gmail.com',      foto: '' },
  { nome: 'Thadeu',     email: 'lagosoperacional+thadeu@gmail.com',    foto: '' },
];
```

> ✅ Esta lista **já está preenchida** no `app.js` publicado — não precisa mexer.

Com isso a tela de login vira um seletor de perfis: a pessoa toca no seu nome
e digita só a senha (uma vez por aparelho). `foto` é opcional — sem foto,
aparece a inicial colorida de cada um.

## 5. Criar o banco de dados (Firestore)

1. Menu **Criação (Build)** → **Firestore Database** → **Criar banco de dados**.
2. Local: `southamerica-east1 (São Paulo)` → iniciar em **modo de produção** → **Criar**.

## 6. Regras de segurança (trava o acesso e respeita as permissões)

**Estado atual publicado no Console (conferido pelo dono do projeto).** A regra
real em produção é um **catch-all**: qualquer sócio autorizado lê e grava em
**qualquer coleção**. É o que está versionado em `frota/firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSocio() {
      return request.auth != null && request.auth.token.email in [
        'lagosoperacional+luispaulo@gmail.com',
        'lagosoperacional+ygor@gmail.com',
        'lagosoperacional+thadeu@gmail.com'
      ];
    }
    match /{document=**} {
      allow read, write: if isSocio();
    }
  }
}
```

O que essa regra garante: sem estar logado com um dos 3 e-mails autorizados,
**não se lê nem grava nada**. Como o `match /{document=**}` cobre todas as
coleções, **`financiamentos` já está autorizada** — não é preciso alterar o
Console para publicar o recurso de financiamentos.

> **Diferenciação de papéis (admin / editor / "só visualiza").** Ela existe e é
> aplicada **na interface do app** (função `podeEditar()`/`exigirEdicao()`): o
> "só visualiza" tem os botões de cadastro escondidos e as ações bloqueadas.
> Porém, com a regra catch-all atual, o **Firestore não distingue papéis** — para
> o banco, todo sócio autenticado pode gravar. Ou seja, a restrição do "só
> visualiza" hoje é **apenas no aplicativo**, não reforçada pelo banco.
>
> Reforçar isso no Firestore (enforcement de leitor por coleção, com
> `podeEditar()`) seria **outra etapa, deliberada** — e mudá-la agora poderia
> **bloquear usuários existentes**. Não faz parte desta entrega.

**Validação opcional (não necessária para publicar):** no Console, aba
**Regras → Playground**, simular `get`/`create` em `financiamentos/teste`:
autenticado com um dos 3 e-mails → **allow**; e-mail fora da lista ou não
autenticado → **deny**. No app real, logado como sócio, criar um contrato de
teste e conferir que o documento aparece em `financiamentos`; depois apagar.

**Opção futura (CLI):** para versionar/publicar regras por linha de comando,
adotar `firebase-tools` com `firebase.json` apontando `firestore.rules` e um
`.firebaserc`; então `firebase deploy --only firestore:rules`. Não adotado agora.

## 7. Autorizar o domínio do app

1. **Authentication** → aba **Configurações** → **Domínios autorizados**.
2. Adicione o domínio onde o app vai ficar hospedado (ex.: `gustavodga.github.io`).

## 8. Publicar o app

O app é 100% estático (como o GD Cash): basta hospedar esta pasta `frota/` no
GitHub Pages, Netlify ou similar. Sugestão: criar um repositório próprio para a
empresa (ex.: `lagos`) e copiar esta pasta para lá.

---

## Estrutura dos dados no Firestore

| Coleção    | Conteúdo                                                        |
|------------|-----------------------------------------------------------------|
| `tx`       | Lançamentos (despesas/receitas) com autor, veículo, litros, km  |
| `vehicles` | Veículos da frota (km, óleo, licenciamento, seguro, status)     |
| `drivers`  | Motoristas (CNH, validade, telefone)                            |
| `kmlog`    | Leituras de quilometragem registradas manualmente               |
| `profiles` | Nome de exibição de cada sócio (`profiles/{uid}`)               |
| `eventos`  | Linha do tempo (trocas de veículo, CNH, documentos, cadastros)  |
| `empresa`  | Documento `dados`: CNPJ, endereço, contador, bancos, permissões |
| `anexos`   | Fotos e PDFs (notas, documentos) guardados como texto no próprio banco |

Lançamentos excluídos **não somem**: recebem `deleted: true` (com quem excluiu
e quando) e ficam invisíveis nas telas e nos cálculos, mas recuperáveis na
**Lixeira** (aba Empresa, só administradores). Só o "Excluir para sempre" apaga
de vez.

## Onde os dados e arquivos ficam guardados

- **Serviço:** Google **Cloud Firestore** (banco em nuvem do Firebase), na
  região São Paulo. É o mesmo banco para os 3 sócios — todos veem os mesmos
  dados em tempo real (sincronização automática), e as regras do passo 6
  isolam o acesso a esses 3 e-mails.
- **Fotos e PDFs:** ficam **dentro do próprio Firestore**, na coleção `anexos`,
  guardados como texto (base64). Não usamos o Firebase Storage — assim tudo fica
  num lugar só e no plano gratuito. Cada documento do Firestore cabe até **1 MB**,
  então o app **comprime as fotos** antes de enviar (máx. ~660 KB por imagem) e
  recusa PDFs muito grandes (pede uma foto no lugar).

## Limites do plano gratuito (Spark) e quanto ele comporta

O plano **Spark (gratuito)** oferece, por padrão:

| Recurso              | Limite do plano Spark              |
|----------------------|------------------------------------|
| Armazenamento total  | **1 GiB** (~1.073 milhões de KB)   |
| Leituras por dia     | 50.000                             |
| Gravações por dia    | 20.000                             |
| Exclusões por dia    | 20.000                             |

**Estimativa de consumo (tamanho médio):**

- Um **lançamento** ocupa ~0,5 KB → **1 GiB comporta na casa de centenas de
  milhares** de lançamentos (o texto é minúsculo).
- Uma **foto de nota comprimida** ocupa ~0,3–0,6 MB. Uma **página de PDF**,
  até ~0,7 MB. **São os arquivos que enchem o espaço**, não os lançamentos.
- Na prática, **1 GiB comporta aproximadamente 1.500 a 3.000 fotos/PDFs**
  (contando ~0,4 MB cada), além de folga de sobra para todos os cadastros e
  lançamentos de vários anos.

**Uso diário:** com 3 sócios lançando dezenas de itens por dia, o consumo fica
muito abaixo dos limites de 50 mil leituras / 20 mil gravações. O ponto a
observar ao longo do tempo é o **espaço em disco por causa das fotos**.

## Quando e como aumentar o plano

Aumente o plano quando o **armazenamento** se aproximar de ~0,8 GiB (dá para
ver em **Firebase → Firestore → Uso**) — ou seja, ao acumular ~2.000+ fotos/PDFs.

1. No console do Firebase, menu inferior esquerdo → **Fazer upgrade** →
   plano **Blaze** (pague conforme o uso).
2. No Blaze o armazenamento passa a custar por GB (centavos de dólar por GB/mês)
   e os limites diários somem. Para este porte de empresa, tende a custar pouco.
3. Alternativa para não pagar: **baixar a cópia de segurança** (abaixo),
   arquivar as fotos antigas e apagá-las do app.

## Cópia de segurança (backup) e exportação

Na aba **Empresa** (administradores), em **Cópia de segurança**:

- **Baixar cópia de segurança (.json)** — salva num arquivo os dados essenciais:
  empresa, veículos, motoristas, lançamentos (inclui os da lixeira), km e a
  linha do tempo. Guarde esse arquivo no e-mail/nuvem periodicamente.
- **Exportar lançamentos (.csv)** — planilha pronta para o contador.
- **Documentos** (fotos e PDFs) são exportados **à parte**: abra a ficha da van
  ou do motorista e baixe cada arquivo pela lista de documentos.

## Papéis de acesso (aba Empresa → Sócios e permissões)

- **Administrador** — edita tudo, inclusive os dados da empresa e as permissões.
- **Pode editar** — lança despesas/receitas e altera veículos e motoristas.
- **Só visualiza** — acompanha tudo, mas os botões de cadastro somem e as
  ações de edição são bloqueadas no app.

Todos começam como administradores. O sistema não deixa a empresa ficar sem
pelo menos um administrador. (O controle é feito pelo aplicativo — os três
logins continuam autorizados no Firestore pelas regras do passo 6.)

## Dicas de uso

- **Abastecimento:** lançando combustível com *litros* e *km do painel*, o app
  atualiza o odômetro do veículo sozinho e calcula o **consumo médio (km/L)**.
- **Quilometragem:** além dos abastecimentos, dá para registrar leituras de km
  avulsas (Frota → veículo → *Registrar km*). Com isso o app mostra **quanto
  cada veículo rodou no mês** e o **custo por km**.
- **Alertas automáticos:** licenciamento/seguro vencendo (30 dias), troca de óleo
  por km e CNH dos motoristas aparecem na aba **Início**.
- **CSV e backup:** na aba **Empresa** (administradores) saem a planilha do
  contador (CSV) e a cópia de segurança completa (JSON).
- **Lixeira:** excluir um lançamento (toque longo ou botão *Excluir* no detalhe)
  manda para a **Lixeira** na aba Empresa; administradores recuperam quando
  quiserem ou apagam de vez.
