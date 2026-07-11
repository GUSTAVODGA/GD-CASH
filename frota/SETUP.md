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

## 6. Regras de segurança (trava o acesso aos 3 e-mails)

Na aba **Regras** do Firestore, apague tudo e cole o texto abaixo,
**trocando os 3 e-mails** pelos e-mails reais criados no passo 4. Depois **Publicar**.

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

Com isso, mesmo que alguém descubra o endereço do app, sem estar logado com um
desses 3 e-mails **não lê nem escreve nada**.

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
- **CSV:** em **Mais → Exportar lançamentos** sai uma planilha pronta para o
  contador (abre no Excel/Google Planilhas).
