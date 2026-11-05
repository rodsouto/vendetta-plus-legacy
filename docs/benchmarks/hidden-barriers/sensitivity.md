# Sensibilidad al margen de apertura

Escenario medium-local, medias de tres semillas. Margen 0 es una referencia optimista, no una recomendación de privacidad.

| Margen (s) | Modelo | Edificio bloqueado (%) | Espera p95 (s) |
| ---: | --- | ---: | ---: |
| 0 | global | 9.61 | 3.35 |
| 0 | disk | 1.05 | 0.00 |
| 0 | owners | 2.51 | 0.00 |
| 3 | global | 12.00 | 5.77 |
| 3 | disk | 1.36 | 0.00 |
| 3 | owners | 3.24 | 0.00 |
| 15 | global | 20.93 | 19.08 |
| 15 | disk | 2.59 | 0.00 |
| 15 | owners | 6.16 | 3.70 |

# Ventana del incidente

Margen de 3 s. La ventana comienza con la ráfaga o caída: 30 min para ráfagas, 60 min para caídas de 30 min (incluye 30 min posteriores).

| Escenario | Modelo | Edificio bloqueado en ventana (%) | Espera p95 en ventana (s) |
| --- | --- | ---: | ---: |
| keeper-outage-30m | global | 56.35 | 1627.19 |
| keeper-outage-30m | disk | 32.29 | 1209.98 |
| keeper-outage-30m | owners | 47.31 | 1503.55 |
| valid-burst-1-account | global | 15.25 | 7.84 |
| valid-burst-1-account | disk | 2.16 | 0.00 |
| valid-burst-1-account | owners | 4.57 | 0.52 |
| valid-burst-10-accounts | global | 23.22 | 123.39 |
| valid-burst-10-accounts | disk | 10.65 | 80.33 |
| valid-burst-10-accounts | owners | 14.15 | 113.21 |
| burst-serial-publisher | global | 74.31 | 1182.05 |
| burst-serial-publisher | disk | 64.76 | 1129.58 |
| burst-serial-publisher | owners | 70.83 | 1165.78 |
| slow-recovery | global | 75.43 | 2132.15 |
| slow-recovery | disk | 40.54 | 1510.37 |
| slow-recovery | owners | 59.77 | 1908.70 |
