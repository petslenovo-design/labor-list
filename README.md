# Labor List

Sistema web de gestão de mão de obra em produção: operadores, líderes, linhas, skill matrix, treinamentos, status de RH, horas extras e planejamento. Desenvolvido para uso em rede interna com autenticação LDAP.

## Estrutura do repositório

```
labor-list/
├── labor-list-backend/    # API Node.js (Express + PostgreSQL + Socket.io)
└── labor-list-frontend/   # SPA React (Create React App)
```

## Funcionalidades

| Módulo | Rota | Descrição |
|--------|------|-----------|
| Dashboard | `/dashboard` | KPIs, gráficos e exportação CSV |
| Gestão de Equipe | `/equipe` | Status RH, HE, polivalência |
| Skill Matrix | `/matrix` | Alocações produto/posto |
| Gestão de Treinamentos | `/treinamentos` | Controle de treinamentos |
| Mapa de Calor | `/heatmap` | Visualização de competências |
| Planejamento HE | `/planejamento-he` | Planejamento de hora extra |
| Configurações | `/configuracoes` | Cadastros, acessos e transferências |

### Perfis de acesso

- **MASTER** — Engenharia (produtos, acesso amplo)
- **SUPERVISAO** — Gestão de acessos e visão ampla
- **LIDER** — Gestão da própria equipe

## Stack

| Camada | Tecnologias |
|--------|-------------|
| Backend | Express 5, PostgreSQL (`pg`), JWT, LDAP (`ldapjs`), ExcelJS, Socket.io |
| Frontend | React 19, React Router 7, Axios, Chart.js, react-hot-toast, Socket.io-client |

## Pré-requisitos

- Node.js 18+
- PostgreSQL com schema `skill_matrix` e tabelas criadas
- Servidor LDAP acessível (exceto login de emergência MASTER)
- Rede interna (API e WebSocket usam HTTP na porta 5008)

## Configuração

### Backend (`labor-list-backend/.env`)

```env
PORT=5008
JWT_SECRET=sua_chave_secreta_forte

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=senha
DB_NAME=nome_do_banco

LDAP_URL=ldap://seu-servidor-ldap
```

### Frontend

A API é montada dinamicamente com o hostname do navegador:

`http://<hostname>:5008/api`

Não é obrigatório arquivo `.env` no frontend, desde que o backend esteja acessível na porta 5008 do mesmo host.

## Como executar

### 1. Backend

```bash
cd labor-list-backend
npm install
node src/server.js
```

O servidor sobe na porta **5008** (ou o valor de `PORT` no `.env`) com WebSockets ativos.

### 2. Frontend

```bash
cd labor-list-frontend
npm install
npm start
```

Acesse pelo navegador (ex.: `http://localhost:3000` ou o IP da máquina na rede).

> **Importante:** frontend e backend devem ser acessados pelo **mesmo hostname** (IP ou nome), pois o frontend aponta a API para `http://<hostname>:5008`.

## Autenticação

1. **LDAP** — Usuário de rede + senha; o login precisa estar cadastrado em `usuarios_acesso`.
2. **MASTER (emergência)** — Conta de fallback no código; use apenas em ambiente controlado.

O token JWT expira em **12 horas** e é armazenado no `localStorage` do navegador.

## API (resumo)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/login` | Não | Login LDAP / MASTER |
| GET | `/api/carregar_tudo` | JWT | Carga inicial de todos os dados |
| GET | `/api/exportar_excel` | JWT | Download do relatório `.xlsx` |
| POST | `/api/:action` | JWT | Operações de escrita (mutations) |

### Ações (`POST /api/:action`)

Exemplos de `action`:

- `salvar_colaborador`, `excluir_colaborador`, `alterar_status`
- `confirmar_he`, `remover_he`, `sync_planejamento`
- `salvar_alocacao_multipla`, `excluir_alocacao`, `zerar_treinamentos`
- `transferir_operador`, `atualizar_linhas_cobertura`, `salvar_yield_colaborador`
- `salvar_usuario_acesso`, `excluir_usuario_acesso`
- `salvar_produto`, `excluir_produto` (apenas perfil MASTER)

Após mutações bem-sucedidas, o servidor emite o evento **`dados_atualizados`** via Socket.io para atualizar os painéis conectados.

## Cadastro de líder e acesso

Para perfil **LIDER**:

- O **login LDAP** (`login_ldap`) é usado apenas para autenticar.
- O **nome** em `usuarios_acesso` deve ser **igual** ao nome do líder em `colaboradores` (cargo `Líder`), para o sistema vincular filtros e o cadastro automático de líder.

Ao conceder acesso com perfil LIDER, o backend busca um colaborador com o mesmo nome; se não existir, cria um registro de líder automaticamente.

## Banco de dados

- Schema PostgreSQL: **`skill_matrix`** (definido em `labor-list-backend/src/config/db.js`)
- Tabelas principais: `colaboradores`, `produtos`, `linhas`, `postos`, `alocacoes`, `colaborador_linhas`, `usuarios_acesso`, `planejamentos_he`, `logs_auditoria`, entre outras.

Este repositório não inclui scripts de migration; o schema deve existir previamente no ambiente.

## Segurança (produção)

Antes de expor em produção, revise:

- [ ] Remover ou proteger login MASTER hardcoded em `authController.js`
- [ ] Usar `JWT_SECRET` forte e exclusivo por ambiente
- [ ] Restringir CORS e origem do Socket.io
- [ ] Preferir HTTPS em rede corporativa
- [ ] Não versionar arquivos `.env`
- [ ] Completar autorização por perfil em todas as ações da API

## Licença

ISC (conforme `package.json` do backend). Ajuste conforme a política da sua organização.
