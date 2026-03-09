# SimulaEduca — Plano de Deploy & Escalabilidade

> **Infraestrutura alvo (MVP):** Hostinger VPS KVM2 — 2 vCPU · 4 GB RAM · 100 GB NVMe
> **Objetivo:** Deploy de produção com Docker Compose, praticando orquestração de containers com as melhores práticas.

---

## Sumário

1. [Visão Geral da Arquitetura de Deploy](#1-visão-geral-da-arquitetura-de-deploy)
2. [Pré-requisitos e Setup Inicial do VPS](#2-pré-requisitos-e-setup-inicial-do-vps)
3. [Containerização da Aplicação Next.js](#3-containerização-da-aplicação-nextjs)
4. [Docker Compose de Produção](#4-docker-compose-de-produção)
5. [Alocação de Recursos (Budget de 4 GB)](#5-alocação-de-recursos-budget-de-4-gb)
6. [Rede, Reverse Proxy e SSL](#6-rede-reverse-proxy-e-ssl)
7. [Gestão de Secrets e Variáveis de Ambiente](#7-gestão-de-secrets-e-variáveis-de-ambiente)
8. [Estratégia de Backup e Persistência](#8-estratégia-de-backup-e-persistência)
9. [CI/CD — Pipeline de Deploy Automatizado](#9-cicd--pipeline-de-deploy-automatizado)
10. [Monitoramento e Observabilidade](#10-monitoramento-e-observabilidade)
11. [Segurança (Hardening)](#11-segurança-hardening)
12. [Plano de Escalabilidade](#12-plano-de-escalabilidade)
13. [Checklist de Deploy](#13-checklist-de-deploy)
14. [Referências e Recursos de Estudo](#14-referências-e-recursos-de-estudo)

---

## 1. Visão Geral da Arquitetura de Deploy

```
                    ┌──────── INTERNET ─────────┐
                    │                            │
                    ▼                            │
           ┌───────────────┐                     │
           │  Cloudflare   │  (DNS + CDN + WAF)  │
           │   (opcional)  │                     │
           └──────┬────────┘                     │
                  │ :443                         │
       ┌──────────▼──────────────────────────────┘
       │   Hostinger VPS KVM2 (2 CPU / 4 GB)
       │
       │   ┌────────────────────────────────┐
       │   │     Nginx Proxy Manager        │ ← SSL Termination (Let's Encrypt)
       │   │     (ou Nginx + Certbot)       │
       │   └────────┬───────────────────────┘
       │            │ :3000 (internal)
       │   ┌────────▼───────────────────────┐
       │   │     Next.js (standalone)       │ ← App container
       │   │     node server.js             │
       │   └────────┬───────────────────────┘
       │            │
       │   ┌────────▼───────────────────────┐
       │   │   PostgreSQL 16 + pgvector     │ ← Dados + Vetores
       │   └────────────────────────────────┘
       │
       │   ┌────────────────────────────────┐
       │   │   Redis 7 (Alpine)             │ ← Cache / Sessões / Filas
       │   └────────────────────────────────┘
       │
       └─────────────────────────────────────
```

### Serviços do Stack

| Serviço | Imagem Base | Função | Porta Interna |
|---------|-------------|--------|---------------|
| **nginx** | `jc21/nginx-proxy-manager` | Reverse proxy + SSL | 80, 443, 81 (admin) |
| **app** | Custom (multi-stage) | Next.js 16 standalone | 3000 |
| **postgres** | `pgvector/pgvector:pg16` | BD relacional + vetorial | 5432 |
| **redis** | `redis:7-alpine` | Cache / Rate limit | 6379 |

---

## 2. Pré-requisitos e Setup Inicial do VPS

### 2.1 Sistema Operacional

Escolha **Ubuntu 22.04 LTS** ou **24.04 LTS** no painel da Hostinger. É o mais documentado para Docker.

### 2.2 Acesso e Segurança Básica

```bash
# 1. Conectar via SSH
ssh root@SEU_IP_VPS

# 2. Atualizar o sistema
apt update && apt upgrade -y

# 3. Criar usuário não-root
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

# 4. Configurar SSH key (desabilitar login por senha depois)
ssh-copy-id deploy@SEU_IP_VPS

# 5. Configurar firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2.3 Instalar Docker e Docker Compose

```bash
# Instalar Docker Engine (método oficial)
curl -fsSL https://get.docker.com | sh

# Verificar instalação
docker --version          # >= 24.x
docker compose version    # >= 2.20 (plugin integrado)

# Habilitar Docker no boot
systemctl enable docker
```

### 2.4 Configurar Swap (recomendado para 4 GB RAM)

```bash
# Criar swap de 2 GB como segurança contra OOM
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Tornar permanente
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

# Ajustar swappiness (usar swap apenas quando necessário)
echo 'vm.swappiness=10' | tee -a /etc/sysctl.conf
sysctl -p
```

> [!TIP]
> O swap de 2 GB serve como "rede de segurança" para picos de memória. Em operação normal, o sistema deve funcionar dentro dos 4 GB sem usar swap.

---

## 3. Containerização da Aplicação Next.js

### 3.1 Dockerfile — Multi-Stage Build

Criar `Dockerfile` na raiz do projeto:

```dockerfile
# ===== STAGE 1: Dependências =====
FROM node:20-alpine AS deps
WORKDIR /app

# Instalar dependências necessárias para native modules
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Instalação limpa e reproduzível
RUN npm ci --ignore-scripts
# Gerar Prisma Client dentro do container
RUN npx prisma generate

# ===== STAGE 2: Build =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variáveis de build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ===== STAGE 3: Runner (Produção) =====
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar apenas o necessário
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copiar Prisma para migrations em runtime (se necessário)
COPY --from=builder /app/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### 3.2 Habilitar Standalone Output

No `next.config.ts`, adicionar:

```typescript
const nextConfig = {
  output: 'standalone',
  // ... suas configs existentes
};
```

> [!IMPORTANT]
> O modo `standalone` reduz a imagem Docker de ~1.5 GB para ~150-200 MB, incluindo apenas os arquivos necessários para rodar em produção.

### 3.3 `.dockerignore`

Criar `.dockerignore` na raiz:

```
node_modules
.next
.git
.gitignore
*.md
docker-compose*.yml
.env*
storage/
seed_*.txt
```

---

## 4. Docker Compose de Produção

Criar `docker-compose.prod.yml`:

```yaml
services:
  # ── Reverse Proxy ──────────────────────────────────────────────
  nginx:
    image: jc21/nginx-proxy-manager:latest
    container_name: simulaeduca_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81"        # Painel admin do NPM (bloquear no firewall após configurar)
    volumes:
      - nginx_data:/data
      - nginx_letsencrypt:/etc/letsencrypt
    networks:
      - frontend
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.25"
        reservations:
          memory: 64M

  # ── Aplicação Next.js ─────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: Dockerfile
    # Em produção, usar imagem do registry:
    # image: ghcr.io/seu-usuario/simulaeduca:latest
    container_name: simulaeduca_app
    restart: unless-stopped
    env_file:
      - .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - frontend
      - backend
    deploy:
      resources:
        limits:
          memory: 1024M
          cpus: "0.75"
        reservations:
          memory: 256M

  # ── Banco de Dados ────────────────────────────────────────────
  postgres:
    image: pgvector/pgvector:pg16
    container_name: simulaeduca_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: simulaeduca
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: simulaeduca_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql
      - ./docker/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U simulaeduca -d simulaeduca_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend
    deploy:
      resources:
        limits:
          memory: 1536M
          cpus: "0.75"
        reservations:
          memory: 512M

  # ── Cache ─────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: simulaeduca_redis
    restart: unless-stopped
    command: >
      redis-server
      --appendonly yes
      --maxmemory 128mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.25"
        reservations:
          memory: 64M

volumes:
  postgres_data:
  redis_data:
  nginx_data:
  nginx_letsencrypt:

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true   # Sem acesso externo direto
```

### Por que separar em duas networks?

| Network | Acesso Externo | Serviços | Propósito |
|---------|----------------|----------|-----------|
| `frontend` | ✅ Sim | nginx, app | Tráfego HTTP/S público |
| `backend` | ❌ Não (`internal`) | app, postgres, redis | Comunicação interna segura |

O PostgreSQL e Redis **nunca ficam expostos** à internet. Apenas o Nginx tem portas públicas.

---

## 5. Alocação de Recursos (Budget de 4 GB)

### 5.1 Distribuição de Memória

```
┌─────────────────────────────────────────────────────┐
│                  4 GB RAM Total                     │
├──────────────┬──────────────────────────────────────┤
│ SO + Docker  │  ~512 MB                             │
├──────────────┼──────────────────────────────────────┤
│ PostgreSQL   │  1.5 GB  (limite)  │ 512 MB (reserva)│
├──────────────┼──────────────────────────────────────┤
│ Next.js App  │  1 GB   (limite)  │ 256 MB (reserva) │
├──────────────┼──────────────────────────────────────┤
│ Redis        │  256 MB (limite)  │  64 MB (reserva) │
├──────────────┼──────────────────────────────────────┤
│ Nginx        │  256 MB (limite)  │  64 MB (reserva) │
├──────────────┼──────────────────────────────────────┤
│ Swap (disco) │  2 GB   (emergência)                 │
└──────────────┴──────────────────────────────────────┘
Total limites: 512 + 1536 + 1024 + 256 + 256 = 3584 MB ✅
Margem: ~512 MB para picos e overhead do kernel
```

### 5.2 Tuning do PostgreSQL para 4 GB VPS

Criar `docker/postgresql.conf`:

```ini
# Memória
shared_buffers = 384MB            # ~25% da RAM alocada ao PG
effective_cache_size = 1GB        # Estimativa de cache do SO
work_mem = 8MB                    # Por operação de sort/hash
maintenance_work_mem = 128MB      # Para VACUUM, CREATE INDEX

# Conexões
max_connections = 30              # Suficiente para MVP (Prisma pool ~5-10)
                                  # Cada conexão usa ~10MB

# WAL / Write Performance
wal_buffers = 16MB
checkpoint_completion_target = 0.9
min_wal_size = 256MB
max_wal_size = 1GB

# Query Planner
random_page_cost = 1.1            # SSD/NVMe (Hostinger usa NVMe)
effective_io_concurrency = 200    # NVMe

# pgvector
# HNSW index fica em memória; monitorar com pg_stat_activity
# Para poucos vetores (< 10k), a performance será boa sem tuning extra

# Logging
log_min_duration_statement = 1000  # Log queries > 1s (debug)
```

### 5.3 O que monitorar

```bash
# Ver uso de recursos em tempo real
docker stats

# Exemplo de saída esperada (uso normal MVP):
# CONTAINER         CPU %   MEM USAGE / LIMIT
# simulaeduca_app   2-10%   200-400MB / 1GB
# simulaeduca_pg    1-5%    300-600MB / 1.5GB
# simulaeduca_redis 0.1%    20-50MB / 256MB
# simulaeduca_nginx 0.1%    30-60MB / 256MB
```

> [!WARNING]
> **Sobre pgvector:** Com < 10.000 vetores (dimensão 1536), o uso de memória do HNSW index será modesto (~50-100 MB extra). Se o volume de material RAG crescer muito, o PostgreSQL será o primeiro gargalo. Veja a [seção 12](#12-plano-de-escalabilidade) para estratégias de escala.

---

## 6. Rede, Reverse Proxy e SSL

### 6.1 Opção A: Nginx Proxy Manager (Recomendado para aprendizado)

O **Nginx Proxy Manager (NPM)** oferece uma interface web para gerenciar proxy e SSL sem editar configs manualmente.

**Setup:**
1. Acessar `http://SEU_IP:81` após o primeiro `docker compose up`
2. Login padrão: `admin@example.com` / `changeme`
3. Adicionar **Proxy Host**:
   - Domain: `simulaeduca.com.br` (ou subdomínio)
   - Forward Hostname: `app` (nome do serviço Docker)
   - Forward Port: `3000`
   - Ativar SSL > Let's Encrypt > Force SSL

> [!TIP]
> Após configurar o NPM, bloqueie a porta 81 no firewall:
> ```bash
> ufw deny 81/tcp
> ```
> Quando precisar acessar novamente, libere temporariamente.

### 6.2 Opção B: Nginx Manual + Certbot

Para quem quer entender o Nginx por baixo dos panos. Substituir o serviço `nginx` no compose por:

```yaml
nginx:
  image: nginx:alpine
  container_name: simulaeduca_nginx
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./docker/nginx/conf.d:/etc/nginx/conf.d:ro
    - ./docker/nginx/certbot/conf:/etc/letsencrypt:ro
    - ./docker/nginx/certbot/www:/var/www/certbot:ro
  networks:
    - frontend

certbot:
  image: certbot/certbot
  volumes:
    - ./docker/nginx/certbot/conf:/etc/letsencrypt
    - ./docker/nginx/certbot/www:/var/www/certbot
  entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h; done'"
```

Config Nginx (`docker/nginx/conf.d/simulaeduca.conf`):

```nginx
server {
    listen 80;
    server_name simulaeduca.com.br www.simulaeduca.com.br;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name simulaeduca.com.br www.simulaeduca.com.br;

    ssl_certificate /etc/letsencrypt/live/simulaeduca.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/simulaeduca.com.br/privkey.pem;

    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Proxy para Next.js
    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache para assets estáticos do Next.js
    location /_next/static {
        proxy_pass http://app:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

### 6.3 DNS

Apontar no painel de DNS do seu domínio:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| A | `@` | IP do VPS | 3600 |
| A | `www` | IP do VPS | 3600 |
| CNAME | `api` | `@` | 3600 |

### 6.4 Cloudflare (Opcional mas recomendado)

Usar Cloudflare como proxy DNS (nuvem laranja) fornece gratuitamente:
- **CDN** para assets estáticos
- **DDoS Protection** básica
- **WAF** com regras básicas
- **SSL flexível** (Cloudflare → VPS pode ser Full Strict com o cert Let's Encrypt)

> [!NOTE]
> Se usar Cloudflare, configurar SSL Mode como **Full (Strict)** para que a conexão Cloudflare→VPS também seja criptografada com o certificado Let's Encrypt.

---

## 7. Gestão de Secrets e Variáveis de Ambiente

### 7.1 Arquivo `.env.production`

```bash
# Nunca commitar este arquivo no git!
# Criar diretamente no servidor

# Banco de Dados (conexão interna Docker)
DATABASE_URL="postgresql://simulaeduca:SENHA_FORTE_AQUI@postgres:5432/simulaeduca_db"
DIRECT_URL="postgresql://simulaeduca:SENHA_FORTE_AQUI@postgres:5432/simulaeduca_db"
POSTGRES_PASSWORD="SENHA_FORTE_AQUI"

# Auth
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="https://simulaeduca.com.br"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# IA
OPENAI_API_KEY="sk-..."

# Redis (conexão interna Docker)
REDIS_URL="redis://redis:6379"

# Stripe (quando implementar)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### 7.2 Boas Práticas

| Prática | Descrição |
|---------|-----------|
| **Nunca commitar `.env`** | Garanta que `.env*` está no `.gitignore` |
| **Gerar secrets fortes** | `openssl rand -base64 32` para cada secret |
| **URLs internas Docker** | Usar nomes de serviço (`postgres`, `redis`) ao invés de `localhost` |
| **Rotacionar API keys** | Trocar `OPENAI_API_KEY` e secrets periodicamente |
| **Separar envs por ambiente** | `.env.development`, `.env.production` |

---

## 8. Estratégia de Backup e Persistência

### 8.1 Volumes Docker (Persistência)

Os dados críticos estão em volumes nomeados:

| Volume | Dados | Criticidade |
|--------|-------|-------------|
| `postgres_data` | Banco de dados completo | 🔴 **Crítica** |
| `redis_data` | Cache (AOF) | 🟡 Média |
| `nginx_data` | Configs do proxy | 🟢 Baixa (recriável) |
| `nginx_letsencrypt` | Certificados SSL | 🟢 Baixa (renovável) |

### 8.2 Script de Backup Automatizado

Criar `scripts/backup.sh` no servidor:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/home/deploy/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "🔄 Iniciando backup - $TIMESTAMP"

# 1. Backup PostgreSQL (dump consistente)
docker exec simulaeduca_postgres \
  pg_dump -U simulaeduca -d simulaeduca_db --format=custom \
  > "$BACKUP_DIR/db_$TIMESTAMP.dump"

# 2. Comprimir
gzip "$BACKUP_DIR/db_$TIMESTAMP.dump"

# 3. Limpar backups antigos
find "$BACKUP_DIR" -name "db_*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "✅ Backup concluído: db_$TIMESTAMP.dump.gz"
echo "📊 Tamanho: $(du -h "$BACKUP_DIR/db_$TIMESTAMP.dump.gz" | cut -f1)"
```

### 8.3 Agendar com Cron

```bash
chmod +x /home/deploy/scripts/backup.sh

# Backup diário às 3h da manhã
crontab -e
# Adicionar:
0 3 * * * /home/deploy/scripts/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

### 8.4 Backup Offsite (Futuro)

Para MVP, o backup local é suficiente. Quando evoluir:
- **Rclone → Google Drive/S3**: Enviar dumps para storage externo
- **Hostinger Snapshots**: Snapshot semanal do VPS inteiro via painel

---

## 9. CI/CD — Pipeline de Deploy Automatizado

### 9.1 Estratégia Recomendada: GitHub Actions + SSH

```
[Push para main] → [GitHub Actions] → [Build imagem] → [SSH deploy no VPS]
```

### 9.2 Workflow `.github/workflows/deploy.yml`

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push Docker Image
        run: |
          echo ${{ secrets.GHCR_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker build -t ghcr.io/${{ github.repository }}:latest .
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:latest
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /home/deploy/simulaeduca
            docker compose -f docker-compose.prod.yml pull app
            docker compose -f docker-compose.prod.yml up -d app
            docker image prune -f
```

### 9.3 Deploy Manual (Primeiras vezes / Aprendizado)

```bash
# No VPS
cd /home/deploy/simulaeduca

# Pull do código
git pull origin main

# Rebuild e reiniciar apenas o app
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d app

# Rodar migrations se houver mudanças no schema
docker exec simulaeduca_app npx prisma migrate deploy

# Verificar logs
docker compose -f docker-compose.prod.yml logs -f app
```

### 9.4 Zero-Downtime Deploy (Intermediário)

Para evitar downtime durante deploys:

```bash
# 1. Build nova imagem
docker compose -f docker-compose.prod.yml build app

# 2. Escalar temporariamente (2 instâncias)
docker compose -f docker-compose.prod.yml up -d --scale app=2 --no-recreate

# 3. Aguardar novo container ficar healthy
sleep 10

# 4. Remover container antigo
docker compose -f docker-compose.prod.yml up -d --scale app=1
```

---

## 10. Monitoramento e Observabilidade

### 10.1 Mínimo Viável (CLI)

```bash
# Recursos em tempo real
docker stats

# Logs de todos os serviços
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Saúde dos containers
docker compose -f docker-compose.prod.yml ps

# Espaço em disco
df -h
docker system df
```

### 10.2 Stack Leve de Monitoramento (Futuro)

Para quando quiser algo visual sem consumir muita RAM:

| Ferramenta | RAM Estimada | Função |
|------------|-------------|--------|
| **Uptime Kuma** | ~70 MB | Monitoramento de uptime + alertas |
| **Dozzle** | ~30 MB | Visualizador de logs em tempo real (web) |

Ambas são leves o suficiente para rodar no KVM2 junto com a aplicação.

```yaml
# Adicionar ao docker-compose.prod.yml
uptimekuma:
  image: louislam/uptime-kuma:1
  container_name: uptimekuma
  restart: unless-stopped
  volumes:
    - uptimekuma_data:/app/data
  networks:
    - frontend
  deploy:
    resources:
      limits:
        memory: 128M
```

### 10.3 Alertas

- **Uptime Kuma** suporta notificações via Telegram, Discord, Email
- Configurar alertas para:
  - Site fora do ar (HTTP != 200)
  - Latência > 2s
  - Certificado SSL expirando

---

## 11. Segurança (Hardening)

### 11.1 Checklist de Segurança do VPS

| Item | Comando / Ação | Status |
|------|----------------|--------|
| Desabilitar login root SSH | `PermitRootLogin no` em `/etc/ssh/sshd_config` | [ ] |
| Usar apenas SSH keys | `PasswordAuthentication no` | [ ] |
| Firewall ativo (UFW) | `ufw enable` | [ ] |
| Fail2ban instalado | `apt install fail2ban` | [ ] |
| Updates automáticos | `apt install unattended-upgrades` | [ ] |
| Portas DB/Redis fechadas | Apenas acessível via network interna Docker | [ ] |

### 11.2 Segurança Docker

| Prática | Detalhes |
|---------|----------|
| **Não rodar como root** | Dockerfile usa `USER nextjs` |
| **Network interna** | `backend` com `internal: true` |
| **Sem portas expostas** | DB e Redis sem `ports:` no compose de produção |
| **Imagens oficiais** | Usar apenas imagens verificadas do Docker Hub |
| **Atualizar imagens** | `docker compose pull` regularmente |

### 11.3 Segurança da Aplicação

| Item | Ação |
|------|------|
| **NEXTAUTH_SECRET** | Secret forte e único (32+ bytes) |
| **HTTPS everywhere** | Nginx redireciona HTTP → HTTPS |
| **Rate limiting** | Implementar via Redis (middleware Next.js) |
| **CORS** | Configurar em `next.config.ts` |
| **Headers de segurança** | CSP, HSTS, X-Frame-Options via Nginx |

---

## 12. Plano de Escalabilidade

### 12.1 Fase 1 — MVP (Atual: KVM2)

**Capacidade estimada:** 50-200 usuários ativos/dia, ~500 simulados/mês

| Aspecto | Configuração |
|---------|-------------|
| App | 1 instância Next.js |
| DB | PostgreSQL local no mesmo VPS |
| Cache | Redis local |
| Vetores | pgvector no mesmo PostgreSQL |
| Assets | Servidos pelo Next.js/Nginx |

**Gargalos previstos:**
1. **RAM** durante geração de simulados (chamadas OpenAI + RAG retrieval)
2. **CPU** se múltiplos usuários gerarem simulados simultâneos
3. **Disco** conforme base RAG crescer (PDFs + embeddings)

### 12.2 Fase 2 — Crescimento (KVM4 ou KVM8)

**Quando:** > 500 usuários ativos/dia ou latência > 2s

| Melhoria | Descrição | Investimento |
|----------|-----------|--------------|
| **Upgrade VPS** | KVM4 (4 CPU, 8 GB) ou KVM8 (6 CPU, 16 GB) | ~$15-35/mês |
| **Connection Pooling** | Adicionar PgBouncer entre app e PostgreSQL | Config |
| **Redis real** | Integrar cache de questões/sessões no código | Desenvolvimento |
| **CDN** | Cloudflare para assets estáticos e PDFs | Gratuito |
| **Réplicas do app** | `--scale app=2` com Nginx load balancing | Config |

```yaml
# PgBouncer como serviço adicional
pgbouncer:
  image: edoburu/pgbouncer:latest
  environment:
    DATABASE_URL: "postgres://simulaeduca:${POSTGRES_PASSWORD}@postgres:5432/simulaeduca_db"
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 100
    DEFAULT_POOL_SIZE: 20
  networks:
    - backend
  deploy:
    resources:
      limits:
        memory: 64M
```

### 12.3 Fase 3 — Escala Real

**Quando:** > 5.000 usuários ativos/dia ou necessidade de alta disponibilidade

| Melhoria | Descrição |
|----------|-----------|
| **Managed PostgreSQL** | Migrar para Neon, Supabase, ou RDS |
| **Managed Redis** | Migrar para Upstash ou ElastiCache |
| **Object Storage** | S3/R2 para PDFs gerados |
| **Queue System** | BullMQ (Redis) para geração assíncrona de simulados |
| **Kubernetes** | Se precisar orquestrar múltiplos nós |
| **Vercel/Railway** | Considerar plataformas gerenciadas para o frontend |

### 12.4 Decisões de Tradeoff

| Decisão | Tradeoff |
|---------|----------|
| **Docker Compose vs Kubernetes** | Compose é mais simples e perfeito para 1 servidor. K8s só vale com 3+ nós e equipe dedicada. **Recomendação: Compose.** |
| **NPM vs Nginx manual** | NPM é mais fácil mas consome ~100 MB a mais de RAM. Para aprendizado, comece com NPM e depois migre para manual. **Recomendação: NPM.** |
| **Standalone vs Node completo** | Standalone reduz imagem em ~10x mas exige rebuild a cada deploy. **Recomendação: Standalone.** |
| **pgvector local vs Pinecone** | Local é grátis e tem latência mínima, mas compete por RAM. Com < 50k vetores, local é melhor. **Recomendação: Local.** |
| **Build no VPS vs CI/CD** | Build local consome CPU/RAM do servidor. CI/CD (GitHub Actions) faz o build na nuvem. **Recomendação: iniciar local, migrar para CI/CD.** |
| **Swap 2GB** | Evita OOM kills mas pode causar lentidão se usado constantemente. Monitorar com `free -h`. **Recomendação: criar swap, monitorar.** |

---

## 13. Checklist de Deploy

### Primeiro Deploy

- [ ] VPS configurado (Ubuntu, Docker, UFW, SSH keys)
- [ ] Swap de 2 GB criado
- [ ] Domínio apontando para IP do VPS
- [ ] Repositório clonado no VPS
- [ ] `.env.production` criado no servidor
- [ ] `next.config.ts` com `output: 'standalone'`
- [ ] `Dockerfile` criado e testado localmente
- [ ] `.dockerignore` configurado
- [ ] `docker/postgresql.conf` criado
- [ ] `docker-compose.prod.yml` configurado
- [ ] Containers subindo sem erros
- [ ] Nginx Proxy Manager configurado
- [ ] SSL/Let's Encrypt funcionando
- [ ] Prisma migrations executadas
- [ ] Seed de dados executado
- [ ] Aplicação acessível via HTTPS
- [ ] Porta 81 bloqueada no firewall
- [ ] Portas do DB e Redis não expostas

### Pós-Deploy

- [ ] Backup automatizado configurado (cron)
- [ ] `docker stats` mostrando uso saudável de recursos
- [ ] Google OAuth callback URL atualizada para domínio de produção
- [ ] Fail2ban instalado e ativo
- [ ] Updates automáticos habilitados
- [ ] Uptime Kuma (ou alternativa) monitorando

---

## 14. Referências e Recursos de Estudo

### Docker & Containerização
- [Docker Docs — Compose file reference](https://docs.docker.com/compose/compose-file/)
- [Docker Docs — Resource constraints](https://docs.docker.com/compose/compose-file/deploy/#resources)
- [Next.js — Docker example (oficial)](https://github.com/vercel/next.js/tree/canary/examples/with-docker)
- [Next.js — Standalone output docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

### PostgreSQL & pgvector
- [pgvector — GitHub](https://github.com/pgvector/pgvector)
- [PGTune — Calcular configurações ideais](https://pgtune.leopard.in.ua/)
- [PostgreSQL Wiki — Tuning](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)

### Nginx & SSL
- [Nginx Proxy Manager](https://nginxproxymanager.com/)
- [Let's Encrypt — Getting Started](https://letsencrypt.org/getting-started/)
- [Mozilla SSL Config Generator](https://ssl-config.mozilla.org/)

### Segurança
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Fail2ban — Getting Started](https://www.fail2ban.org/wiki/index.php/Main_Page)

### Monitoramento
- [Uptime Kuma](https://github.com/louislam/uptime-kuma)
- [Dozzle — Log viewer](https://dozzle.dev/)

---

> **Última atualização:** Março 2026
> **Autor:** Gerado com base na arquitetura atual do SimulaEduca
