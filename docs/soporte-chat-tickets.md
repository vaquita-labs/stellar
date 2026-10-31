# Chat de soporte: conversaciones por tema (tickets)

## Contexto

Vaquita es la app de ahorro de `apps/web`. Dentro de la app, en Ayuda →
"Chatea con nosotros", el usuario tiene un chat privado con el equipo. El
equipo responde desde `apps/admin`, que lee y escribe la base de datos con
Prisma. No hay websockets: la app consulta cada 5 segundos mientras el chat
está abierto.

**Cómo funciona hoy en el backend.** Una sola conversación por billetera.

- `support_conversations`: una fila por `wallet_address` (índice único).
  Guarda `resolved_at` (lo marca el admin al resolver, y cualquier mensaje
  nuevo lo limpia), `last_message_at` y `last_message_author`.
- `support_messages`: mensajes de esa conversación, con `author` (`user` |
  `team`), `body` y `created_at`.
- Rutas del API (`apps/api/src/routes/support/route.ts`), ambas con la sesión
  de la billetera (`requireSessionWallet`):
  - `GET /api/v1/support/messages` → `{ messages: [...] }`, todo el hilo del
    más antiguo al más reciente.
  - `POST /api/v1/support/messages` con `{ body }` → `{ message }`. Crea la
    conversación si no existe y limpia `resolved_at`.
- Lógica en `packages/shared/src/services/support/index.ts`:
  `getSupportThreadForWallet`, `createUserSupportMessage`,
  `createTeamSupportMessage`, `setSupportConversationResolved`,
  `listSupportConversations`, `getSupportConversation`.
- Admin: `apps/admin/src/app/api/admin/support/route.ts` y `[id]/route.ts`
  usan `listSupportConversations`, `getSupportConversation`,
  `createTeamSupportMessage` y `setSupportConversationResolved`.

**Qué cambió en el frontend.** La pantalla del chat ahora está pensada por
temas, para que el usuario pueda volver a cualquier conversación anterior:

- `/concierge/chat` lista "Tus conversaciones": una tarjeta por tema con
  asunto, último mensaje, estado (`Esperando respuesta`, `Respondida`,
  `Resuelta`) y fecha. Arriba, el botón "Nueva conversación".
- `/concierge/chat/new` abre un chat vacío; el primer mensaje crea la
  conversación y la pantalla pasa a ella.
- `/concierge/chat/:ticketId` es el chat de un tema. Si estaba resuelto, se
  puede releer y, si el usuario escribe, se reabre.

Mientras el backend no tenga tickets, el frontend sigue funcionando: toma el
hilo único de `GET /support/messages` y lo muestra como una sola conversación
(id interno `thread`). Cuando existan las rutas de abajo, no hay que cambiar
nada en el frontend.

Código del frontend que consume esto:
`apps/web/src/core-ui/hooks/useSupportChat.ts`,
`apps/web/src/core-ui/components/pages/concierge/SupportTicketsPage.tsx` y
`SupportChatPage.tsx`.

---

## Lo que hay que construir

### Modelo

Mantener `support_conversations` una por billetera, para que el inbox del
admin siga igual, y agregar los tickets como tramos de esa conversación.

Tabla nueva `support_tickets`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK a `support_conversations.id`, cascade |
| `wallet_address` | varchar(64) | Copia de la conversación, para listar por billetera |
| `subject` | varchar(120) | Primer mensaje del ticket, recortado en una palabra |
| `opened_at` | timestamptz | Cuándo se abrió |
| `resolved_at` | timestamptz null | Cuándo lo resolvió el equipo |
| `last_message_at` | timestamptz | Denormalizado, como en la conversación |
| `last_message_author` | varchar(8) | `user` \| `team` |
| `created_at`, `updated_at` | timestamptz | |

Índices: `(wallet_address, last_message_at desc)` y `(conversation_id, opened_at desc)`.

Columna nueva `support_messages.ticket_id` (uuid, nullable, FK a
`support_tickets.id` con `ON DELETE SET NULL`), con índice `(ticket_id, created_at)`.

**Migración de datos.** Cada conversación existente pasa a ser un ticket con
todos sus mensajes: `subject` = su primer mensaje, `opened_at` = `created_at`
de la conversación, `resolved_at` y `last_message_*` copiados de la
conversación. Así nadie pierde lo que escribió antes.

### Reglas

- Mensaje del usuario **con** `ticketId`: debe ser un ticket de su billetera
  (si no, `404`). Se agrega ahí y, si estaba resuelto, se reabre
  (`resolved_at = null`).
- Mensaje del usuario **sin** `ticketId`: va al ticket abierto de la
  conversación (`resolved_at` null, el de actividad más reciente). Si no hay
  ninguno abierto, se crea uno nuevo con `subject` = ese mensaje.
- Respuesta del equipo (desde admin): va al ticket abierto, o al último si
  todos están resueltos. Lo deja como `answered`.
- Resolver la conversación desde admin cierra todos sus tickets abiertos.
  Quitarle "resuelto" reabre el último.
- La conversación sigue actualizando `last_message_at`, `last_message_author`
  y `resolved_at` como hasta ahora, para que el inbox del admin no cambie.
- `status` de un ticket: `resolved` si tiene `resolved_at`; si no, `waiting`
  cuando el último mensaje es del usuario y `answered` cuando es del equipo.

### Rutas

Todas con la sesión de la billetera, como `/support/messages`. Envoltorio
habitual: `{ status: "success", data: {...} }` y errores
`{ status: "error", message }`.

**Listar**

```
GET /api/v1/support/tickets
```

```json
{
  "tickets": [
    {
      "id": "uuid",
      "subject": "No me llegó el depósito desde el banco",
      "status": "waiting",
      "openedAt": "2026-10-31T17:00:00.000Z",
      "resolvedAt": null,
      "lastMessageAt": "2026-10-31T18:29:00.000Z",
      "lastMessage": {
        "id": "uuid",
        "author": "team",
        "body": "Ya lo vemos, en unos minutos te confirmamos.",
        "createdAt": "2026-10-31T18:29:00.000Z"
      }
    }
  ]
}
```

Orden: actividad más reciente primero. `lastMessage` puede ser `null` solo en
un ticket sin mensajes, que no debería existir.

**Leer uno**

```
GET /api/v1/support/tickets/:id
```

```json
{
  "ticket": {
    "id": "uuid",
    "subject": "...",
    "status": "answered",
    "openedAt": "...",
    "resolvedAt": null,
    "lastMessageAt": "...",
    "lastMessage": { "id": "uuid", "author": "team", "body": "...", "createdAt": "..." },
    "messages": [
      { "id": "uuid", "author": "user", "body": "...", "createdAt": "..." },
      { "id": "uuid", "author": "team", "body": "...", "createdAt": "..." }
    ]
  }
}
```

`messages` del más antiguo al más reciente, como mucho los últimos 200.
`404` si el ticket no existe o no es de la billetera de la sesión.

**Enviar**

```
POST /api/v1/support/messages
{ "body": "texto", "ticketId": "uuid" }
```

`ticketId` es opcional. Validaciones actuales que se mantienen: `body`
obligatorio, máximo 2000 caracteres, límite de 60 mensajes por hora por
billetera (`429`).

```json
{
  "message": { "id": "uuid", "author": "user", "body": "texto", "createdAt": "..." },
  "ticketId": "uuid"
}
```

`ticketId` en la respuesta es el ticket donde quedó el mensaje: el pedido, el
que estaba abierto, o el recién creado. El frontend lo usa para pasar de
"Nueva conversación" al chat de ese ticket. `404` si el `ticketId` pedido no
es de la billetera.

**Se mantiene** `GET /api/v1/support/messages` tal como está. El frontend la
usa como respaldo mientras `/tickets` no exista.

### Alerta al equipo

`POST /support/messages` hoy avisa al equipo con `notifySupportMessage` y un
`kind` (`new` primer mensaje de la billetera, `reopened` si la conversación
estaba resuelta, `followup` el resto). Con tickets conviene que `reopened`
también cubra "escribió en un ticket resuelto" y que la alerta lleve el
`ticketId`.

### Cómo probar

1. Con una billetera sin historial: `POST /support/messages` sin `ticketId`
   crea conversación y ticket; `GET /support/tickets` lo lista como `waiting`.
2. Responder desde admin: el ticket pasa a `answered`.
3. Resolver desde admin: `resolved`. Un nuevo `POST` sin `ticketId` crea un
   segundo ticket; un `POST` con el `ticketId` del resuelto lo reabre.
4. `GET /support/tickets/:id` con el id de otra billetera responde `404`.
5. Una billetera con conversación previa a la migración ve un solo ticket con
   todos sus mensajes viejos.
