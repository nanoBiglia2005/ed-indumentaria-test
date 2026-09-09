# ED Indumentaria — Convenciones

## Stack
- Backend: Node CommonJS + Express 5 + Prisma 7 (JS, sin TS). El esquema se versiona con
  **Prisma Migrate**: los cambios se hacen con `npx prisma migrate dev --name <descripcion>`
  desde `backend/`, NUNCA editando la base a mano. El deploy aplica lo pendiente con
  `npx prisma migrate deploy`.
- Los triggers y funciones plpgsql viven como SQL crudo dentro de las migraciones
  (`prisma/migrations/0_init/migration.sql`); Prisma no los modela y no los toca.
- `prisma migrate dev` puede ofrecer RESETEAR la base: solo se corre en desarrollo.
  Contra producción va únicamente `migrate deploy`.
- Frontend: React 19 + TypeScript + Vite + Tailwind v4 (clases inline) + Headless UI.
  Sin librerías nuevas sin justificación.
- **Node 24 LTS** en desarrollo y en el servidor. npm viene con Node: no se actualiza por separado.
- Identificadores y textos en español. Componentes PascalCase, hooks `useCosa`, resto camelCase.

## Base de datos
- **Dos bases**: `db_ed_indumentaria_dev` (local, desarrollo) y `db_ed_indumentaria` (VPS,
  producción). La estructura se declara en `schema.prisma`; Prisma genera la migración.
- Cambio de esquema: editar `schema.prisma` → `npx prisma migrate dev --name <descripcion>` desde
  `backend/` → **revisar el SQL generado antes de commitear** (un `DROP COLUMN` o un `ALTER TYPE`
  que pierda datos hay que verlo) → commitear el código junto con la carpeta de la migración.
- Lo que Prisma no modela (triggers, funciones, vistas, constraints raros):
  `npx prisma migrate dev --create-only --name <descripcion>`, se escribe el SQL a mano en el
  `migration.sql` generado, y recién después `npx prisma migrate dev` para aplicarlo.
- **Las migraciones son aditivas**: agregar columnas y tablas, nunca renombrar ni borrar.
  `migrate deploy` no tiene "deshacer" y revertir el código NO revierte la base, así que una base
  "adelantada" tiene que poder convivir con código viejo. Para eliminar algo van **dos deploys**:
  primero el código deja de usar la columna, después una migración la borra.
- Nunca `migrate dev` contra producción. El riesgo real es correrlo por costumbre estando
  conectado por SSH: verificar siempre en qué máquina se está parado.
- Traer datos de producción a local: restaurar un dump de `~/backups` del VPS. Después del
  restore, `npx prisma migrate status` (el dump trae la `_prisma_migrations` de producción) y
  volver a fijar la zona horaria de la base recreada.

## Tests
- Backend: **`node --test`** (runner nativo, sin dependencias), archivos en `backend/test/*.test.js`.
  Frontend: **Vitest**, archivos `*.test.ts` **junto al módulo** que prueban.
  Correr con `npm test` desde `backend/` o desde `frontend/`.
- **Si se modifica un módulo que tiene tests, se actualizan sus tests en el mismo cambio.**
  Un test que ya no refleja el comportamiento real es peor que no tener test: da confianza falsa.
- Qué está cubierto hoy (lógica pura; no hay tests de componentes ni de integración):
  `lib/validaciones.js`, `lib/http.js`, `lib/roles.js`, `services/preciosPorMetodo.js`,
  `services/impresion.js`, `services/pagosRemito.js`, `src/utils/precios.ts`, `src/utils/talles.ts`,
  `src/api/cliente.ts`, `src/features/ventas/pago/calculoPago.ts`,
  `src/features/ventas/codigoRemito.ts`, `src/features/ventas/cliente/formatoCliente.ts`,
  `services/impresoras.js`, `services/remitos.js` (`itemsDeRemito`), `src/utils/impresoras.ts`.
- **Los tests del frontend NO se typechequean**: Vitest transpila con esbuild sin verificar tipos, y
  los `*.test.ts` están excluidos de `tsconfig.app.json` (con `noUnusedLocals`, una variable sin usar
  en un test rompería el build y por lo tanto el deploy). Un error de tipos en un test es invisible.
- Al arreglar un bug, primero escribir el test que lo reproduce y verlo fallar. Un test que nunca se
  vio fallar no probó nada.
- Los tests son también documentación de las reglas de negocio: el comentario de cabecera de cada
  archivo explica QUÉ regla protege y por qué importa. Mantener ese hábito.

### Tres contratos que los tests congelan (romper uno no falla en este repo)
- **El redondeo de precios está DUPLICADO** en `backend/services/preciosPorMetodo.js` y
  `frontend/src/utils/precios.ts`, con la misma tabla de casos en los dos archivos de test. Si se
  toca una implementación hay que tocar **las cuatro**: si divergen, el precio que se muestra deja
  de coincidir con el que se cobra.
- **La asimetría del recargo 0 es deliberada**: el backend redondea siempre (es lo que cobra), el
  frontend devuelve el precio crudo cuando `recargo === 0` (redondearlo mostraría un número
  distinto al que se tipeó mientras se edita). Hay un test en cada lado que la fija: no "unificar".
- **`construirPayloadTicket` es un contrato con otra máquina**: el `printer-client` lee claves fijas
  (`precio_efectivo`, `subtotal_tarjeta`, `total_tarjeta`). Renombrar una rompe la impresión en
  producción sin que nada acá falle. El test de forma del payload existe para eso.

## Impresión (multi-impresora)
- **Hay N impresoras**: una fila en `IMPRESORAS` por cada PC del local que corre un `printer-client`.
  El `print-service` mantiene un `dict[id_impresora → WebSocket]` y rutea cada trabajo a ese socket:
  **nunca broadcast**. Un ticket que sale en la impresora equivocada expone datos de otra venta y
  nadie se entera.
- **El destino se resuelve en el servidor**, en `services/impresoras.js` (`resolverImpresora`), con el
  rol de `res.locals.session`. Si el rol no está en `ROLES_ELIGEN_IMPRESORA`, el `id_impresora` del
  body se **ignora** (no es un 403: el trabajo sale por la predeterminada igual). El selector del
  frontend es comodidad, no permiso. Hay un test que congela esto: es la regla central del módulo.
- **`id_impresora` va FUERA del payload del ticket**, en el body de `POST /jobs`. Meterlo adentro
  obligaría a tocar el `printer-client`, que es justo lo que el contrato congelado evita.
- **Un token por impresora**, guardado hasheado (sha256) en `IMPRESORAS.token_hash`. Se muestra en
  claro **una sola vez**; si se pierde, se regenera. El `print-service` no conoce los tokens: los
  valida contra `POST /interno/impresoras/validar-token`, con caché de 60s.
- **`/interno` se monta ANTES de `requireAuth`** en `index.js` (lo llama el print-service, no un
  usuario) y se protege con `X-Print-Secret`. Nginx solo proxea `/api` y `/auth`, y Express escucha
  en 127.0.0.1: no sale del VPS. Lo mismo protege `POST /jobs`.
- **La impresora asignada a un usuario se lee de la base en cada impresión, NUNCA del JWT**: la sesión
  de Auth.js cachea el usuario hasta el próximo login. (El `rol` sí viene del JWT y arrastra ese
  problema, pero es preexistente de todo el sistema de roles.)
- **Gana el último socket que conecta**: si una impresora reconecta, se cierra la conexión anterior. El
  guard viejo hacía lo contrario y un socket medio abierto la dejaba afuera hasta reiniciar `ed-print`
  — que es justo lo que el deploy no hace.
- **`ed-print` se reinicia a mano** y eso desconecta a TODOS los printer-client unos segundos. El
  `printer-client` de cada PC también se actualiza a mano, una por una.
- **Ni el `print-service` ni el `printer-client` tienen tests automáticos** (no hay CI de Python): lo
  que se toque ahí se verifica a mano con dos clientes conectados.

## Backend
- Todas las llamadas a la API deben verificar si el usuario está loggeado antes de realizarse.
- `index.js` es solo bootstrap (health → auth → requireAuth → routers). No agregar rutas ahí.
- Nueva ruta: archivo en `routes/<dominio>.js` con `express.Router`, handlers envueltos en
  `asyncHandler(fn, 'mensaje de error 500')` de `lib/http.js`. Errores esperados:
  `throw new HttpError(status, body)`.
- IDs de params: `parseId()` / `parseIds()`. Unicidad de nombres: `assertNombreUnico()`.
  Errores de Prisma (P2002/P2003/P2025): el mapa `errores` de `asyncHandler`
  (todo en `lib/validaciones.js` y `lib/http.js`).
- Los ABMs (grupos/subgrupos/clientes/lineas) son routers explícitos con esos helpers:
  se descartó un factory genérico porque los cuatro desvían en validaciones reales
  (filtros, campos extra, chequeos de padre). No introducir un factory con flags.
- Lógica de negocio (precios, remitos, impresión) va en `services/`, nunca en el handler.
  Si la lógica es pura, **exportarla** aunque solo la use ese archivo: si no, no es testeable.
- Constantes compartidas con el frontend: un JSON por dominio en `shared/`
  (`ventas.json`, `agrupaciones.json`, `barcode.json`, `roles.json`, `precios.json`,
  `clientes.json`, `metodosPago.json`) es la única fuente. CJS las lee vía
  `constants/<dominio>.js`; el frontend vía `types.ts`. Nunca duplicar el valor literal.

## Frontend
- Los precios (En efectivo y con otros métodos de pago) deben SIEMPRE estar formateados utilizando
  la funcion formatearPesos de `src/utils/formato.ts` excepto cuando se esté editando un campo de precio.
- El frontend importa del backend SOLO `@backend/types`. Prohibido importar
  `backend/generated/**` y prohibido `fetch()` fuera de `src/api/cliente.ts`.
- `@backend/types` reexporta tipos de `backend/generated/prisma`, que está gitignoreado y lo produce
  el `postinstall` del backend. **Orden obligatorio**: `npm install` en `backend/` antes de compilar
  o typechequear el frontend, o `tsc -b` falla.
- Llamadas HTTP: función en `src/api/<recurso>.ts` usando `request<T>`. Lanzan `ApiError`;
  el llamador maneja el error.
- Estructura: páginas y sus modales viven en `features/<feature>/` (articulos, ventas,
  configuracion, auth); lo compartido en `components/` (`ui/`, `layout/`, `tabla/`),
  `hooks/`, `api/`, `types/`, `utils/`.
- Nuevo modal: en `features/<feature>/modales/`, siempre sobre `components/ui/BaseModal`.
  Convención de apertura: `abierto: boolean` + payload como prop separada.
  Acciones async con `useAccionAsync`; confirmación demorada con `useCuentaRegresiva`.
- Nueva columna de tabla: agregar una `ColumnaTabla<T>` en el `columnas.tsx` de la feature.
  El motor (`useTablaServidor`) y la grilla (`DataGrid`) no se modifican para casos puntuales.
  *(Algunos comentarios del código todavía lo llaman `useTablaFiltrable`: es un nombre histórico.)*
- Asociaciones muchos-a-muchos de un artículo: usar `EditRelacionesModal` con un objeto
  de textos + funciones de api, no crear un modal nuevo por entidad.
- Tipos compartidos en `src/types/` ({id, nombre} = `Opcion`). Los tipos de dominio no viven
  dentro de componentes.
- Compartido entre features → `components/`, `hooks/`, `utils/`. De una sola feature → dentro
  de la feature. Ante la duda, dejarlo en la feature (extraer recién con el segundo uso).
- **Un módulo que define un componente no puede exportar además constantes o funciones**: rompe Fast
  Refresh (`react-refresh/only-export-components`). Si hace falta, el componente va a su propio
  archivo (ver `features/articulos/ListaDeChips.tsx`, separado de `columnas.tsx`).
- **Resetear estado cuando cambia una prop va con `useResetAlCambiar`**, que ajusta durante el render
  (patrón oficial de React), no con `useEffect` + `setState`. Quedan ~23 advertencias de
  `react-hooks/set-state-in-effect` de código anterior a esta regla: al tocar un archivo que las
  tenga, migrarlo. Cuando no queden, subir la regla a `error` en `eslint.config.js`.
- No cambiar comportamiento al refactorizar. Bug encontrado = se documenta y se pregunta;
  no se arregla en silencio.
- Priorizar la claridad visual y simpleza de uso para todas las partes de la pagina ya que
  esta no será utilizada por un cliente técnico.
- Los colores principales de la página son violeta (violet en tailwind) y amarillo (amber
  en tailwind). Utilizar estos colores para botones, hovers, borders, etc.
- El desarrollo debe ser enfocado en uso en resoluciones de pantalla altas (PC) pero los
  elementos de la página deben adaptarse a resoluciones más pequeñas (Celular).
- Al crear una nueva pagina se debe crear un botón en la sidebar para acceder a esta.

## Ramas y deploy
- **`main` = producción, protegida.** No acepta push directo: todo entra por Pull Request.
  `testing` es la rama de trabajo diaria.
- Mergear a `main` dispara el deploy automático, que corre **sin pausa de aprobación manual**
  (el *environment* `producción` en GitHub no tiene protection rules: al ser un único desarrollador
  no hace falta el gate). El deploy reinterrumpe el backend unos segundos: mergear en un momento
  sin ventas.
- El CI (`.github/workflows/ci.yml`) corre en cada PR a `main` y en cada push a `testing`:
  tests de backend, typecheck, tests de frontend y lint. **Bloquea el merge si falla.**
  El lint bloquea ante errores; las advertencias pendientes no frenan el merge.
- **Si el cambio toca la base**, la migración se genera y se commitea ANTES de abrir el PR. El
  workflow corre `prisma migrate deploy` solo, antes de reiniciar el backend.
- **Nunca editar archivos en el VPS.** El deploy hace `git reset --hard origin/main` y borra
  cualquier cambio local. Las únicas excepciones, fuera del control de git a propósito, son los
  `.env` y `~/backup-db.sh`.
- **El `printer-client` NO se despliega con el CI.** Vive en la PC del comercio (es Windows-only por
  `pywin32`). Si se toca su código, hay que hacer `git pull` y reiniciar el servicio
  `ImpresionCliente` a mano en esa máquina.
- Nunca commitear `.env` ni volcados de la base (`*.dump`): contienen secretos y datos personales
  de los clientes. Ya están en `.gitignore`.

## Infraestructura (DonWeb)
- La aplicación corre en un Cloud Server Ubuntu administrado con CloudPanel, en
  `edindumentaria.store`. Tres servicios: `ed-backend` (Express, :5000), `ed-print` (FastAPI, :8001)
  y nginx (:443). Postgres y los dos servicios escuchan solo en localhost.
- El frontend son archivos estáticos servidos por nginx: no hay proceso que reiniciar. La config de
  nginx se toca **desde el Vhost Editor de CloudPanel**, nunca editando `/etc/nginx/`: el panel
  regenera esos archivos.
- `ed-print` guarda la conexión con la impresora **en memoria**: reiniciarlo la desconecta. Por eso
  el deploy automático no lo toca.
- Backups automáticos a las 03:00 y 15:00 a `~/backups/<fecha>/` y de ahí a Dropbox vía rclone.
  Incluyen los `.env`, así que la cuenta de Dropbox es parte de la superficie de seguridad.

### Zona horaria (resuelto, pero sigue importando)
- La base de producción y el SO del servidor están en `America/Buenos_Aires`. Verificable con
  `SHOW TimeZone;` y con `date` (debe terminar en `-03`); el smoke test del deploy lo comprueba.
- **Por qué importa para cualquier cambio nuevo**: con la base en UTC, todo lo que se sella con la
  fecha del servidor se corre un día para las operaciones posteriores a las 21:00 hora argentina.
  Afecta a `REMITOS.fecha_de_creacion` (default `now()`), al trigger `trg_fecha_de_emision` y sobre
  todo a `REMITOS.cod_mes` (default `EXTRACT(month FROM now())`), que entra en el código visible del
  remito: un remito del 31 a la noche quedaría numerado en el mes siguiente.
- Vale para cualquier `now()` / `CURRENT_DATE` que se agregue en la base, y para cualquier
  `new Date()` en el backend, donde manda el TZ del sistema operativo. Si una función nueva depende
  de la fecha, fijar la zona explícitamente
  (`(now() AT TIME ZONE 'America/Buenos_Aires')::date`) en vez de confiar en la configuración.

## General
- Aplicar buenas practicas de seguridad al manejar funcionalidades bloqueadas por el rol del usuario.
  El rol se lee SIEMPRE de la sesión del servidor (`res.locals.session`), nunca de un header ni del
  body: el frontend esconde secciones, pero eso es cosmético y la API tiene que negarse igual.
- Priorizar la reusabilidad en el desarrollo del codigo.
