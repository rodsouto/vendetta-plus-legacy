# Reglamento de Vendetta

Reglas para los abusos que los contratos no pueden ver (B-13, B-23), vigentes desde el lanzamiento.
El rol `arbiter` (B-14: una Safe en v1, Kleros más adelante) juzga las denuncias según este texto y
sanciona con `suspend(player, until)`. Versión en inglés: [rulebook.md](rulebook.md); si las dos
versiones difieren, vale la inglesa.

## 1. Qué está permitido

Todo lo que permiten los contratos está permitido salvo que una regla de abajo lo prohíba. En
particular:

- **Varias cuentas por persona.** Nada en la cadena dice quién está detrás de una cuenta, así que
  tener varias cuentas no se sanciona. Lo que se sanciona es el pushing entre ellas (regla 4).
- **Automatización.** Los contratos son una API pública; los scripts y bots son legítimos (B-13).
- **Compartir y regalar cuentas.** Una cuenta puede tener varios controladores (dispositivos,
  personas) y se puede transferir (B-26). Vender una cuenta está permitido.

## 2. Pruebas

- **Los eventos del juego son la prueba más fuerte.** Cada batalla (`Battle`), transporte,
  intercambio, cambio de puntos (`PointsChanged`), familia y guerra es público en la cadena. Las
  denuncias citan hashes de transacción.
- Las capturas, los chats y las declaraciones valen menos: se aceptan si coinciden con los eventos
  del juego o tratan de cosas que el juego no registra (mensajes, acuerdos).
- Una denuncia nombra al jugador acusado, la regla y las transacciones. El árbitro puede mirar
  cualquier otro evento público.

## 3. Abuso de bugs

- Usar un bug de los contratos, del cliente o de la infraestructura para sacar ventaja está
  prohibido. **Las reglas son la especificación (`docs/spec/`)**, no lo que el código haga: un
  comportamiento que contradice la especificación es un bug, aunque el contrato acepte la
  transacción.
- Quien encuentra un bug debe reportarlo en privado al equipo, sin publicarlo ni usarlo.
- Sanción: al menos 1 día de suspensión, hasta una permanente, según la ganancia y el daño. No
  reportar a sabiendas un bug que uno usó o vio usar se sanciona igual.

## 4. Pushing

**Pushing** es que un jugador reciba recursos de otra cuenta sin devolver su valor. Está prohibido,
también durante una guerra.

**Regalos.** Enviar recursos a otro jugador sin contrapartida (un transporte que no paga nada) solo
está permitido si se cumple todo esto:

1. Cuando llegan los recursos, el receptor tiene **como mucho la mitad de los puntos** del que
   envía (B-19).
2. El receptor **se mantiene en la mitad o menos** de los puntos del que envía durante los **14
   días** siguientes a la llegada.
3. Todo lo que el que envía le da a ese receptor en cualquier ventana de 24 horas es **menos de la
   mitad de su producción diaria** de cada recurso enviado: 24 veces la producción por hora de ese
   recurso sumada en todos sus edificios, como la muestra el juego al enviar.

**El alcohol** nunca se intercambia: cualquier transferencia de alcohol a otro jugador cuenta como
regalo.

**Intercambios.** El mercado (B-11) es la forma de intercambiar: sus intercambios usan las tasas del
mercado y nunca cuentan como pushing. Un intercambio fuera del mercado (transportes en los dos
sentidos) solo está permitido si la devolución llega dentro de las **48 horas** del primer envío y a
una de las tasas del mercado (`market.exchange_rates`, [game_config.yaml](data/game_config.yaml));
si no, cada envío se juzga como regalo.

**También es pushing:**

- Dejar recursos en edificios para que otra cuenta se los lleve atacando (dejarse saquear a
  propósito).
- Crear cuentas para enviar sus recursos iniciales (`new_player`) o su producción a otra cuenta.
- Aceptar intercambios del mercado sin intención de pagar, para que el depósito del comprador vaya
  al vendedor.
- Préstamos: recursos dados ahora para que se devuelvan más tarde.
- Extorsión: recursos pagados bajo amenaza de ataques, si no cumplen las condiciones de un regalo.
- Cualquier otra forma de que una cuenta reciba recursos sin devolver su valor.

La sanción se aplica al que envía y al receptor si el receptor lo sabía. Si las cuentas son de la
misma persona, se sancionan las dos.

## 5. Bashing

**Bashing** es atacar el mismo edificio **más de 5 veces en 24 horas**: el sexto ataque del mismo
jugador que llega dentro de cualquier ventana de 24 horas contra un edificio rompe la regla.

- Cuenta cada misión de Ataque que produce una batalla, lleve las tropas que lleve, salvo un ataque
  que lleva **solo espías** (espionaje, [06-combat.md](06-combat.md#espionage)).
- Los ataques se cuentan por jugador atacante, sumando todos sus edificios, y por edificio atacado.
- No cuentan los ataques entre miembros de dos familias **en guerra** en el momento de la batalla
  (B-31), siempre que las dos familias tengan al menos 2 miembros, salvo que la guerra sea abusiva
  (regla 6).

## 6. Guerras

Las guerras se declaran y terminan en el juego (B-31); la cadena es el registro y ningún admin tiene
que reconocerlas. Durante una guerra no rige el límite de bashing entre las dos familias (regla 5);
el pushing sigue prohibido (regla 4).

**Guerras abusivas.** La exención es para rivales, no para hostigar a una familia mucho más débil:
una guerra se declara sin el consentimiento de la otra familia, y solo el bando que la declaró puede
aceptar su rendición. El árbitro puede juzgar que una guerra es abusiva y contar sus ataques como
bashing. Evalúa el caso en conjunto, sin un umbral fijo, considerando:

- la diferencia de puntos y de miembros entre las dos familias;
- si la familia más débil ofreció rendirse o un empate y la oferta se rechazó o se ignoró;
- cuánto duran los ataques y cuántas veces golpean los mismos edificios;
- si los ataques le sirven de algo al atacante (saqueo, marcador de la guerra) o solo impiden jugar
  a las víctimas.

## 7. Nombres y contenido

Los nombres y tags de familia (on-chain, B-31), los mensajes, el chat, los tablones de familia y
cualquier imagen o texto que se muestre en el juego (off-chain, B-10) no pueden ser pornográficos,
ofensivos, racistas ni ilegales, ni infringir derechos de terceros, ni hacer publicidad de otros
juegos. Los tablones de familia solo pueden enlazar contenido relacionado con la familia.

Los nombres on-chain no se pueden cambiar ni borrar: el cliente los oculta, y el jugador que creó la
familia puede ser suspendido. El contenido off-chain se elimina.

## 8. Sin reversiones

Nadie es reembolsado ni restaurado por pérdidas causadas por un bug, una caída o una actualización
del contrato. Los bugs se corrigen hacia adelante (B-17). Una resolución nunca mueve recursos, tropas
ni edificios: la única sanción es la suspensión (B-14).

## 9. Sanciones

La única sanción es la **suspensión** (B-14). Un jugador suspendido no puede actuar (construir,
investigar, entrenar, enviar misiones, intercambiar, cambiar de familia, transferir la cuenta), pero
sigue produciendo, sus colas y misiones en curso terminan, y **puede ser atacado**. El árbitro fija la
duración según la ganancia, el daño y la reincidencia; una suspensión permanente no tiene fecha de
fin.

## Qué no se prohíbe

Reglas habituales de los juegos de navegador que este reglamento deja afuera a propósito:

| Regla | Por qué |
|-------|---------|
| Compartir cuenta | Una cuenta puede tener varios controladores (B-26) |
| Multicuentas | No se puede detectar on-chain; solo se sanciona el pushing entre cuentas (regla 4) |
| Cuidar e intercambiar cuentas | Controladores y `transferPlayer` (B-26) |
| Scripts y bots | La automatización es legítima (B-13) |
| Propiedad, comercio con dinero real | Las cuentas se pueden regalar (B-26) y serán tokens (B-24) |
| Registro de guerras, fundadores, inactividad | Las guerras viven on-chain (B-31) |
| Atacar cuentas de admin | No hay |
| Inactividad y `[4SALE]` | Las vacaciones son on-chain (D-18); las cuentas inactivas siguen atacables |
