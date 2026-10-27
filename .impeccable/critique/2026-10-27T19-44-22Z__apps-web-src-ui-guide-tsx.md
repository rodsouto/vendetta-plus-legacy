---
target: How to play y Your next building
total_score: 24
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 2
target_identity: "file:/home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/src/ui/Guide.tsx"
target_fingerprint: "sha256:21fa4c2b8da76ed198fe5f5ba0829d0b7cc32664f5c8fc2220b24711c9ea5a42"
target_path: /home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/src/ui/Guide.tsx
timestamp: 2026-10-27T19-44-22Z
slug: apps-web-src-ui-guide-tsx
---
Method: dual-agent (A: /root/design_review · B: /root/evidence_review)

Target: apps/web/src/ui/Guide.tsx — How to play y Your next building.

24/36 (67%, aceptable). Identidad de Vendetta reconocible; la ayuda necesita menos lectura y mejor jerarquía móvil.

| Heurística | /4 | Hallazgo |
|---|---:|---|
| Estado | 2 | En curso sin tiempo restante |
| Lenguaje | 3 | Mob School aparece en español |
| Control | 4 | Escape, cerrar, reabrir y ocultar persistente |
| Consistencia | 2 | Panel teñido ajeno al libro contable |
| Prevención | 3 | Déficits y capacidad explicados |
| Reconocimiento | 3 | Enlaces precisos, instrucciones largas |
| Eficiencia | 2 | Ayuda desplaza saldo y colas |
| Simplicidad | 2 | Mucha explicación antes de actuar |
| Recuperación | n/a | Guía sin operaciones propias |
| Ayuda | 3 | Contextual; falta revelación progresiva |

Fortalezas: recomendaciones según progreso real, enlaces que enfocan la habitación precisa, guía opcional con control de foco.

Prioridades:
1. P1 Modal demasiado largo: siete temas; Empezar a jugar fuera del viewport 390x844. Tres fundamentos, temas avanzados desplegables y salida accesible. Guide.tsx:80,118,127. impeccable onboard.
2. P1 Recomendación domina móvil: edificio comienza cerca de y=566. Entrada compacta tras saldo/colas con acción, coste y destino; explicación y camino desplegables. Guide.tsx:153,273,276. impeccable layout.
3. P2 Panel teñido rompe DESIGN.md: usar título y líneas del libro sin superficie adicional. styles.css:962. impeccable polish.
4. P2 Espera sin tiempo: mostrar duración restante y enlace preciso a cola, fase actual. Guide.tsx:269,274. impeccable clarify.
5. P2 Déficits poco visibles: Cost recibe coste sin stock y avisos usan muted; aplicar señal de tinta de aviso y explicación textual. Guide.tsx:281,288. impeccable colorize.

Personas: principiante recibe siete conceptos antes de actuar; jugador recurrente móvil debe desplazar ayuda antes de consultar saldo/colas; usuario de teclado tiene buen diálogo nativo y Escape, pero lectura extensa separa controles.
Carga cognitiva: siete temas y seis fases expandidas; no confundir temas de lectura con opciones de acción. Máximo dos recomendaciones paralelas. Instrucciones de ocupación exigen recordar condiciones en otro formulario.
Trayectoria emocional: bienvenida temática y próxima acción tranquilizadora; exceso de lectura y poca noción del progreso hasta expandir.
Detalles: corregir Mob School en español y nombrar habitación en enlace de destino.

Detector estático: 0 hallazgos, JSON [], exit 0. Navegador: 14 señales globales de página (incluyendo straggler y undersized functional text), sin atribución individual al objetivo. No son 14 defectos de Guide.tsx. Overlay ejecutado en navegador headless, no pestaña visible persistente.
Evidencia: A revisó capturas móviles existentes posteriores a fuente/CSS y fuente; B alcanzó diálogo y recomendación en curso en página viva. Sin validación visual de escritorio, tema oscuro o déficit.

Preguntas: ¿priorizar primera acción del principiante, rapidez al volver, o ambas? ¿ajuste visual conservador o reorganización con ayuda progresiva?
