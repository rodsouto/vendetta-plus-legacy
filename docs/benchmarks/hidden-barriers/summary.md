# Resultados de la simulación sintética

Medias de tres semillas; cada fila usa margen de apertura de 3 s. No son medidas de Gnosis ni una ejecución del juego. Los percentiles son medias de percentiles por ejecución. Ver el informe de metodología y los parámetros completos en results.json.

| Escenario | Modelo | Edificio bloqueado (%) | Todos bloqueados (%) | Espera p95 (s) | Espera p99 (s) | Recuperación keeper (s) | Alcance medio (%) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small | global | 1.09 | 1.09 | 0.00 | 0.45 | 0.00 | 100.00 |
| small | disk | 0.59 | 0.15 | 0.00 | 0.00 | 0.00 | 60.80 |
| small | owners | 0.59 | 0.15 | 0.00 | 0.00 | 0.00 | 60.80 |
| medium-local | global | 12.00 | 12.00 | 5.77 | 10.54 | 0.00 | 100.00 |
| medium-local | disk | 1.36 | 0.00 | 0.00 | 2.67 | 0.00 | 12.01 |
| medium-local | owners | 3.24 | 0.00 | 0.00 | 7.15 | 0.00 | 28.92 |
| medium-random | global | 12.14 | 12.14 | 5.81 | 10.54 | 0.00 | 100.00 |
| medium-random | disk | 6.96 | 1.16 | 2.95 | 9.48 | 0.00 | 62.33 |
| medium-random | owners | 9.06 | 4.18 | 4.68 | 9.99 | 0.00 | 81.86 |
| dense-local | global | 12.17 | 12.17 | 5.66 | 10.64 | 0.00 | 100.00 |
| dense-local | disk | 1.62 | 0.00 | 0.00 | 3.52 | 0.00 | 14.17 |
| dense-local | owners | 3.86 | 0.00 | 0.00 | 7.67 | 0.00 | 33.91 |
| busy-local | global | 48.21 | 48.21 | 18.64 | 29.86 | 0.00 | 100.00 |
| busy-local | disk | 6.48 | 0.00 | 2.58 | 9.55 | 0.00 | 11.76 |
| busy-local | owners | 14.96 | 0.02 | 7.55 | 11.80 | 0.00 | 28.29 |
| owners-offline | global | 13.35 | 13.35 | 7.11 | 11.09 | 0.00 | 100.00 |
| owners-offline | disk | 1.53 | 0.00 | 0.00 | 3.85 | 0.00 | 12.01 |
| owners-offline | owners | 3.66 | 0.00 | 0.00 | 8.07 | 0.00 | 28.92 |
| keeper-outage-30m | global | 13.80 | 13.80 | 8.02 | 919.29 | 46.67 | 100.00 |
| keeper-outage-30m | disk | 2.64 | 0.00 | 0.00 | 228.65 | 39.33 | 12.01 |
| keeper-outage-30m | owners | 5.07 | 0.70 | 0.75 | 748.54 | 45.00 | 28.92 |
| valid-burst-1-account | global | 12.10 | 12.10 | 5.74 | 10.66 | 0.00 | 100.00 |
| valid-burst-1-account | disk | 1.36 | 0.00 | 0.00 | 2.72 | 0.00 | 11.77 |
| valid-burst-1-account | owners | 3.24 | 0.00 | 0.00 | 7.30 | 0.00 | 28.38 |
| valid-burst-10-accounts | global | 12.36 | 12.36 | 6.19 | 11.94 | 0.00 | 100.00 |
| valid-burst-10-accounts | disk | 1.57 | 0.00 | 0.00 | 4.22 | 0.00 | 11.87 |
| valid-burst-10-accounts | owners | 3.52 | 0.14 | 0.00 | 8.52 | 0.00 | 28.58 |
| burst-serial-publisher | global | 13.54 | 13.54 | 7.72 | 387.13 | 0.00 | 100.00 |
| burst-serial-publisher | disk | 2.71 | 0.00 | 0.00 | 263.20 | 0.00 | 11.87 |
| burst-serial-publisher | owners | 4.74 | 1.31 | 0.00 | 371.23 | 0.00 | 28.58 |
| slow-recovery | global | 33.13 | 33.13 | 31.50 | 1419.74 | 412.67 | 100.00 |
| slow-recovery | disk | 4.37 | 0.00 | 0.00 | 527.01 | 369.33 | 12.01 |
| slow-recovery | owners | 8.78 | 0.93 | 11.67 | 1153.20 | 406.00 | 28.92 |
| drand-unavailable | global | 100.00 | 100.00 | ∞ | ∞ | 0.00 | 100.00 |
| drand-unavailable | disk | 100.00 | 100.00 | ∞ | ∞ | 0.00 | 12.01 |
| drand-unavailable | owners | 100.00 | 100.00 | ∞ | ∞ | 0.00 | 28.92 |
