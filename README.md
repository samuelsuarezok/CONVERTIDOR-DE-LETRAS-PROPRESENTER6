# Convertidor de letras para ProPresenter 6

Página web de un solo archivo que convierte letras de canciones (pegadas tal como vienen, con acordes, repeticiones y etiquetas) en diapositivas listas para importar en ProPresenter 6.

## Cómo usarla

1. Descargá [`cargador-letras.html`](cargador-letras.html) y abrilo con el navegador (Chrome, Edge, Firefox o Safari). No necesita instalación ni conexión a internet.
2. Escribí el título y pegá la letra: las diapositivas aparecen en la vista previa.
3. Ajustá las opciones (líneas por diapositiva, mayúsculas, etc.) y corregí a mano lo que haga falta.
4. Tocá **Descargar** (o `Ctrl/Cmd + S`) para bajar el `.txt`, o **Descargar todas**.
5. En ProPresenter 6 andá a **File → Import**, elegí el `.txt` y en la ventana de importación poné **Slides delimited by: Paragraph Break** y **Delimiters per slide: 1**.

## Qué reconoce en la letra

- **Etiquetas**, solas en su línea o seguidas de dos puntos: Verso, Coro / Estribillo, Pre-coro, Puente, Intro, Final, Tag, Interludio (también en inglés: Verse, Chorus, Bridge…). Agrupan las diapositivas y les dan color.
- **Repeticiones**: `x2`, `2x`, `(2 veces)` o `(bis)` al final de una línea repiten esa línea; junto a la etiqueta (`Coro x2`) o solas en su línea repiten la estrofa. Una etiqueta sin letra debajo (por ejemplo `Coro`) repite la última vez que apareció.
- **Acordes**: quita las líneas que solo tienen acordes y los acordes entre corchetes, como `[G]`.
- **Numeración**: quita `1.` o `2)` al principio de las líneas.

Por ejemplo:

```
Verso 1
Señor mi Dios, al contemplar los cielos
El firmamento y las estrellas mil

Coro x2
Mi corazón entona la canción
¡Cuán grande es Él! ¡Cuán grande es Él!
```

## Otras funciones

- Editar, dividir, unir o borrar diapositivas a mano.
- Arrastrar archivos `.txt` a la ventana para cargarlos como canciones.
- Exportar en `.pro6` (experimental): conserva los grupos con sus colores. Si ProPresenter no lo abre, usá el `.txt`.
- **Acentos compatibles (Windows)** agrega una marca al `.txt` para que ProPresenter en Windows lea bien las tildes y la ñ.

## Dónde se guardan las canciones

En el navegador donde abrís la página. No se sube nada a internet. Si cambiás de navegador, borrás los datos de navegación o movés el archivo, puede que no aparezcan: descargalas antes.

## Pruebas automáticas (para desarrollo)

Necesitan Node.js 22 o superior; las de interfaz, además, Google Chrome:

```
node tests/logica.test.js
node tests/interfaz.test.js
```
