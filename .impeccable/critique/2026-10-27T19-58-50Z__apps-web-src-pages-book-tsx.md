---
target: "Ledger: costos de habitaciones, tropas y entrenamientos bloqueados"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/src/pages/Book.tsx"
target_fingerprint: "sha256:e39b95f2acd91454f341ca1ace28f4b14ac109e9c692e9f2ad825ecd483ac911"
target_path: /home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/src/pages/Book.tsx
timestamp: 2026-10-27T19-58-50Z
slug: apps-web-src-pages-book-tsx
---
Método: dos evaluaciones independientes (A: /root/design_review; B: /root/evidence_review).

Veredicto: mejora la planificación y conserva la identidad contable de Vendetta. Orden Rooms / Training / Troops estable, costos futuros visibles y tiempos no disponibles representados con —. No se encontró error aritmético en costos de Training.

| Heurística | /4 |
|---|---:|
| Visibilidad del estado | 3 |
| Lenguaje del usuario | 3 |
| Control y libertad | 3 |
| Consistencia | 3 |
| Prevención de errores | 3 |
| Reconocimiento | 3 |
| Eficiencia | 2 |
| Diseño minimalista | 2 |
| Diagnóstico y recuperación | 2 |
| Ayuda contextual | 3 |
| Total | 27/40 |

Prioridades:
1. P1: Book.tsx:534. Tropas oculta investigaciones pendientes cuando falta habitación. Regresión respecto de Locked que combinaba ambas. Mostrar todos los requisitos sin duplicados. Comando: impeccable harden.
2. P2: Book.tsx:551. Cantidad editable con Train bloqueado y valores unitarios sin cambios. Deshabilitar cantidad bloqueada y aclarar costo por unidad. Comando: impeccable clarify.
3. P2: Book.tsx:74. 52 filas; altura móvil 8435px a 390x844, escritorio 4235px. Añadir saltos Rooms / Training / Troops manteniendo costos visibles y orden. Comando: impeccable layout.
4. P3: Book.tsx:546. Tropas omite stock y no marca faltantes como otras tablas. Deuda previa. Unificar por unidad. Comando: impeccable polish.

Carga cognitiva moderada: catálogo legítimo para planificación, pero controles bloqueados compiten con acciones disponibles. Jugador nuevo recibe requisitos incompletos; jugador móvil debe recorrer muchas filas; usuario de teclado encuentra inputs sin acción disponible. La anticipación de costos mejora, pero descubrir requisitos ocultos después frustra.

Observaciones: costos unitarios preexistentes requieren etiqueta; diseño visual coherente; no desborde horizontal en 390px ni 1440px. Detector CLI 0 hallazgos. Assessment A de fuente y B con navegador real, sin transacciones.

Preguntas para siguiente paso: priorizar requisitos/estados o navegación; corregir cuatro hallazgos o los tres primeros.
