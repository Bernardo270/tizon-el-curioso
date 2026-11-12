# Tizón el Curioso 🐉

Un juego de navegador de un solo botón protagonizado por un dragón que colecciona
curiosidades en lugar de tesoros.

Tizón corretea por un valle que cambia de luz mientras avanza el día. Salta rocas y
cristales, recoge monedas y, sobre todo, libros: cada libro desbloquea una curiosidad
real sobre dragones de distintas culturas y épocas.

No hay dependencias, ni build, ni servidor: HTML, CSS y JavaScript con Canvas 2D y
WebAudio.

## Cómo jugar

| Acción | Tecla | Ratón / táctil |
| --- | --- | --- |
| Empezar / saltar | `ESPACIO`, `↑` o `W` | Toca o haz clic en el lienzo |
| Segundo salto (aleteo) | `ESPACIO` en el aire | Toca de nuevo en el aire |
| Pausa | `P` o `ESC` | — |
| Silencio | `M` | Botón de sonido arriba a la derecha |
| Reiniciar | `R` | — |

Mantén pulsado el salto para subir más alto. En el aire tienes un único aleteo extra.

## Mecánicas

- **Corredor infinito**: la velocidad aumenta poco a poco; la dificultad también.
- **Monedas**: +10 puntos cada una.
- **Libros**: +50 puntos y una curiosidad. Se guardan en tu archivo personal.
- **Rocas y cristales**: si los tocas, la partida termina.
- **Archivo**: las curiosidades descubiertas y el récord se guardan en `localStorage`.
- **Sin conexión**: una vez cargada la página, funciona sin red.

## Curiosidades incluidas

El archivo reúne 12 datos reales de mitología e historia: los dragones de agua
chinos, el Mušḫuššu de Mesopotamia, Y Ddraig Goch, Quetzalcóatl, Nidhogg, los
«huesos de dragón» vendidos como medicina, San Jorge en la Leyenda Áurea, Ryūjin,
el dragón de Komodo, el ouroboros, el dragón de Beowulf y Fafnir.

## Estructura

```
tizon-el-curioso/
├── index.html    ← página y lienzo
├── styles.css    ← marco responsive 16:9
├── game.js       ← motor completo (lógica, dibujo y sonido)
├── LICENSE
└── README.md
```

## Jugar en local

No hace falta instalar nada. Abre `index.html` en el navegador, o sirve la carpeta:

```bash
python3 -m http.server 8000
```

y visita <http://localhost:8000>.

## Trucos para curiosear

La consola expone una pequeña API de depuración:

```js
Tizon.state.score = 9999;
Tizon.startGame();
Tizon.FACTS;      // las 12 curiosidades
Tizon.archive;    // tu archivo actual
```

## Licencia

MIT — ver [LICENSE](LICENSE).
