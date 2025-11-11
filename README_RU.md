# Прокси-сервер для Player Finder

Node.js Express сервер для обработки запросов к Roblox API.

---

## Зачем нужен прокси?

Roblox блокирует прямые HTTP запросы к своим API из игры (защита от DDoS). Этот прокси-сервер работает как посредник и делает запросы от нашего имени.

---

## Быстрый деплой

### Render.com (Бесплатно, рекомендуется)

1. https://render.com/ → Sign Up
2. New + → Web Service
3. Подключи GitHub или загрузи код
4. Settings:
   - Environment: Node
   - Build: `npm install`
   - Start: `npm start`
   - Instance: Free
5. Deploy
6. Скопируй URL

### Heroku

```bash
cd ProxyServer
heroku create player-finder-proxy
git init
git add .
git commit -m "Deploy"
git push heroku main
```

### VPS (DigitalOcean, AWS и т.д.)

```bash
cd /var/www/ProxyServer
npm install
npm install -g pm2
pm2 start server.js --name player-finder-proxy
pm2 save
pm2 startup
```

---

## Конфигурация

Создай файл `.env`:

```env
PORT=3000
ROBLOSECURITY=
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30
CACHE_TTL_SECONDS=10
ALLOWED_ORIGINS=*
```

### ROBLOSECURITY (опционально)

Для доступа к большей информации:

1. roblox.com → F12 → Application → Cookies
2. Найди `.ROBLOSECURITY`
3. Copy Value
4. Добавь в .env: `ROBLOSECURITY=твой_cookie`

⚠️ **НИКОГДА НЕ ДЕЛИСЬ ЭТИМ COOKIE!**

---

## API Endpoints

### GET /health
Проверка работоспособности

**Response:**
```json
{"status":"ok","timestamp":1234567890}
```

### POST /api/username-to-id
Конвертация username → User ID

**Request:**
```json
{"username":"Roblox"}
```

**Response:**
```json
{
  "success":true,
  "userId":1,
  "username":"Roblox",
  "displayName":"Roblox"
}
```

### POST /api/presence
Статус игрока (онлайн, в какой игре)

**Request:**
```json
{"userIds":[1,2,3]}
```

**Response:**
```json
{
  "success":true,
  "userPresences":[{
    "userId":1,
    "userPresenceType":2,
    "placeId":123456
  }]
}
```

### POST /api/servers
Список серверов игры

**Request:**
```json
{"placeId":123456,"cursor":null}
```

**Response:**
```json
{
  "success":true,
  "servers":[...],
  "nextPageCursor":"..."
}
```

### POST /api/find-player
Главный endpoint - находит игрока

**Request:**
```json
{"username":"PlayerName"}
```

**Response:**
```json
{
  "success":true,
  "found":true,
  "userId":123,
  "username":"PlayerName",
  "placeId":456,
  "gameName":"Game Name",
  "jobId":"server-job-id",
  "serverInfo":{
    "playing":10,
    "maxPlayers":50
  }
}
```

### POST /api/thumbnail
Аватар игрока

**Request:**
```json
{"userId":1,"size":"420x420"}
```

**Response:**
```json
{
  "success":true,
  "imageUrl":"https://..."
}
```

---

## Тестирование

После деплоя:

```bash
curl https://your-url.com/health
```

Должно вернуть `{"status":"ok"}`

---

## Мониторинг

### Render
Dashboard → Logs → смотри real-time логи

### Heroku
```bash
heroku logs --tail
```

### PM2 (VPS)
```bash
pm2 logs player-finder-proxy
pm2 monit
```

---

## Производительность

- Время ответа: 100-500ms
- Throughput: ~100 req/min
- Cache hit rate: 60-80%
- Память: ~100MB

---

## Безопасность

✅ Rate limiting включён (30 req/min)
✅ CORS настроен
✅ Кеширование включено
✅ Валидация входных данных

⚠️ Не коммить .env в Git!
⚠️ Не делиться ROBLOSECURITY!

---

## Проблемы

### Timeout
Увеличь лимит сканирования или используй pagination

### Rate limit от Roblox
Добавь .ROBLOSECURITY cookie

### High memory
Уменьши CACHE_TTL_SECONDS

---

Больше информации в главном README.md проекта.

**Версия: 1.0.0**
