# El mapa se queda en blanco: tres causas distintas y qué falta revisar

> Trabajado entre el 2026-09-01 y el 2026-09-08. Este documento existe para una
> sola cosa: **revisar la telemetría en PostHog** y saber, sin volver a
> investigar desde cero, si el problema quedó cerrado o cambió de forma.

## 1. Lo que se reportaba

El mapa desaparecía y quedaba un rectángulo en blanco. Siempre igual: **sin un
solo error en consola**, sin cambiar de ventana, sin recargar, y a veces volvía
solo. Pasaba sobre todo en celular.

Ese "sin errores" es lo que hizo difícil el diagnóstico: las tres causas que
aparecieron son silenciosas por naturaleza, y ninguna deja excepción.

## 2. Las tres causas (son distintas, no variantes de una)

### 2.1 Contexto WebGL retirado por el navegador

Una página sostiene un número limitado de contextos WebGL (~16 en Chrome) y el
navegador se lleva los más viejos para no pasarse; en móvil además los reclama
por presión de memoria. No lanza excepción: el canvas deja de pintar.

**Confirmado en producción**: tres eventos `map_context_lost`, todos en Android
(Chrome y Brave), todos recuperados solos. Uno llegó a `attempt: 2` de 3.

### 2.2 Canvas reconstruido sin medir

R3F dimensiona el canvas con un `ResizeObserver` sobre su contenedor, y esas
entregas no ocurren con la pestaña oculta. Un canvas reconstruido en segundo
plano se queda en el `300x150` por defecto y no pinta nada, aunque su contexto
esté sano.

### 2.3 Animación de entrada que nunca arranca

**Esta era la causa del reporte original.** El mapa vivía dentro de un
`AnimatePresence` keyeado por el símbolo del token. En una app de un solo token
esa key cambia una vez por carga (`undefined` → `USDC`), así que el mapa se
montaba, desmontaba y remontaba en cada arranque. Si la animación de entrada no
llegaba a correr un solo frame, el contenedor se quedaba en sus valores
`initial`: `opacity: 0` y `translateY(100%)`.

Medido en producción en el momento del fallo:

```
contenedor:  opacity: 0, transform: matrix(1, 0, 0, 1, 0, 691)
contexto:    sano
canvas:      bien dimensionado
draw calls:  38.549 en 2 segundos
```

El mapa renderizaba a toda velocidad, empujado una pantalla hacia abajo y con
opacidad cero.

## 3. Qué se hizo

| Commit               | Qué                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `257242e`            | Recuperación de contexto: reconstrucción con tope de reintentos, `webglcontextcreationerror`, botón "Recargar mapa", pausa con la pestaña oculta y perfil de calidad por dispositivo |
| `9cea99b`            | El renderer de las miniaturas del ranking suelta su contexto tras 5 s sin trabajo                                                                                                    |
| `018e697`, `40cabe6` | Tests de `deviceTier` y de la recuperación                                                                                                                                           |
| `786b9e2`            | Miniaturas cacheadas como `Blob` en vez de data URL                                                                                                                                  |
| `fd9f22d`            | **El fix del reporte original**: se saca el `AnimatePresence` de alrededor del mapa                                                                                                  |
| `86fd9e7`            | Telemetría del estado real del mapa                                                                                                                                                  |

## 4. Lo que hay que revisar (el motivo de este documento)

En PostHog, dos eventos:

**`map_not_visible`** — el mapa dejó de verse. Trae `issue`, `canvas` y
`container`.

| `issue`             | Qué significa                                      | ¿Se repara solo?      |
| ------------------- | -------------------------------------------------- | --------------------- |
| `context_lost`      | el navegador se llevó el contexto                  | sí, reconstruye       |
| `canvas_unmeasured` | el canvas nunca tomó el tamaño del contenedor      | sí, fuerza remedición |
| `offscreen`         | el canvas quedó fuera del viewport                 | no, solo se reporta   |
| `transparent`       | un ancestro con opacidad ~0 o `visibility: hidden` | no, solo se reporta   |

**`map_visible_again`** — el mapa volvió. Trae `issue` y `seconds`, la duración
del episodio.

### Cómo leerlo

- **Silencio en los dos** → cerrado.
- **`transparent` u `offscreen`** → el fix del `AnimatePresence` no cubrió todos
  los caminos y hay otro lugar que esconde el mapa. Es lo más importante a
  vigilar.
- **`seconds` alto** → los usuarios se quedan mirando un mapa roto; hay que
  actuar. Bajo (2-4 s) → se auto-repara y el ruido es tolerable.
- **`canvas_unmeasured` frecuente** → el `ResizeObserver` de R3F falla más de lo
  asumido y el `dispatchEvent('resize')` es un curita sobre algo más grande.
- **`map_context_lost` con `willRetry: false`** → usuarios viendo "Recargar
  mapa"; tres reintentos se quedó corto.

## 5. Si vuelve a pasar: cómo clasificarlo en un paso

Con el mapa roto en pantalla, en la consola. Esto evita las vueltas que costó
la primera vez:

```js
(async () => {
  let d = 0;
  for (const P of [WebGL2RenderingContext, WebGLRenderingContext])
    for (const m of [
      "drawElements",
      "drawArrays",
      "drawElementsInstanced",
      "drawArraysInstanced",
    ]) {
      const o = P.prototype[m];
      if (!o || o.__p) continue;
      const f = function (...a) {
        d++;
        return o.apply(this, a);
      };
      f.__p = 1;
      P.prototype[m] = f;
    }
  let e = document.querySelector("canvas"),
    chain = [];
  while (e && e !== document.body) {
    const s = getComputedStyle(e);
    chain.push({
      cls: (e.className || "").toString().slice(0, 40) || "(sin clase)",
      opacity: s.opacity,
      transform: s.transform.slice(0, 32),
    });
    e = e.parentElement;
  }
  const c = document.querySelector("canvas"),
    g = c && (c.getContext("webgl2") || c.getContext("webgl"));
  d = 0;
  await new Promise((r) => setTimeout(r, 2000));
  console.log(
    JSON.stringify(
      {
        lost: g && g.isContextLost(),
        buf: c && c.width + "x" + c.height,
        drawsIn2s: d,
        visibility: document.visibilityState,
        chain,
      },
      null,
      1,
    ),
  );
})();
```

Cómo interpretar la salida:

- `lost: true` → causa 2.1, contexto retirado.
- `buf: "300x150"` con el contenedor grande → causa 2.2, canvas sin medir.
- Algún eslabón de `chain` con `opacity: 0` o un `transform` que lo corre de
  pantalla → causa 2.3.
- `drawsIn2s > 0` con todo lo anterior sano → **no es WebGL**. El mapa está
  renderizando y el problema es de datos o de cámara. Fue este número el que
  destrabó el diagnóstico: 38.549 draws hicieron imposible seguir culpando a la
  GPU.
- `drawsIn2s: 0` con `visibility: "hidden"` → correcto, la escena pausa a
  propósito en segundo plano.

## 6. Pendientes abiertos

- **Los umbrales de `deviceTier`** (`apps/web/src/core-ui/components/map/scene/deviceTier.ts`)
  se eligieron por criterio, no por medición, y se validaron en un solo teléfono.
  La regla `pointer: coarse → low` baja a **todos** los móviles a dpr 1, sin
  antialias y sombras de 512. Si aparecen quejas de bordes escalonados, se saca
  ese criterio y quedan memoria y cores.
- **Nunca se midió con throttling de CPU/GPU**: los 129 draw calls por frame son
  de un desktop con el mapa casi vacío. Un mapa lleno en gama baja escala desde
  ahí.
- **Las pérdidas de contexto en Android siguen ocurriendo.** Se recuperan solas,
  pero el margen es fino.

## 7. Un error de método que costó varias vueltas

La causa 2.3 estuvo a la vista en la primera sesión —`opacity: 0.137`,
`translateY(777px)` en la cadena de ancestros— y se descartó como artefacto de
tener la pestaña oculta, porque ahí `requestAnimationFrame` está suspendido. Era
el bug. Se persiguió WebGL durante días por esa lectura apurada.

La regla que queda: **una medición que no encaja no se descarta por tener una
explicación cómoda a mano.** Se anota y se vuelve.
