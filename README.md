# Agenda iPad

Agenda personal diària, setmanal i mensual dissenyada principalment per a iPad,
però compatible també amb navegadors d'escriptori.

## Funcionalitats

- Planificació diària amb tres activitats imperatives i tres activitats importants.
- Llistes de seguiments i contactes.
- Horari laboral de les 07:00 a les 19:00.
- Espais per a comunicacions, valoració diària i logro principal.
- Escriptura amb Apple Pencil mitjançant Scribble.
- Zona pròpia per a notes manuscrites.
- Vistes de dia, setmana i mes.
- Caps de setmana diferenciats visualment.
- Festius oficials de Catalunya i festius locals de Lleida per a l'any 2026.
- Funcionament fora de línia quan s'instal·la com a PWA.
- Exportació i restauració de còpies de seguretat en format JSON.
- Disseny adaptat a iPad en orientació horitzontal i vertical.

## Dades i privacitat

Les dades de l'agenda es guarden localment al navegador de cada dispositiu.
La versió actual no sincronitza automàticament les dades entre ordinador i iPad.

Els textos es guarden a `localStorage` i les notes manuscrites a `IndexedDB`.
Les dades no s'envien a Vercel ni a cap servidor extern.

Per traslladar o protegir les dades:

1. Utilitza el botó **Copia** de l'agenda.
2. Guarda el fitxer `.json` en una ubicació segura.
3. Utilitza **Restaurar** per recuperar-lo en un altre dispositiu.

La restauració substitueix les dades existents al dispositiu on es realitza.

## Instal·lació a l'iPad

1. Publica l'aplicació en una adreça HTTPS, per exemple mitjançant Vercel.
2. Obre l'adreça amb Safari a l'iPad.
3. Toca **Compartir**.
4. Selecciona **Afegir a la pantalla d'inici**.
5. Obre Agenda des de la icona creada.

Cal obrir l'aplicació almenys una vegada amb connexió perquè es prepari el mode
fora de línia.

## Desplegament a Vercel

El projecte utilitza una compilació estàtica sense dependències externes.

Configuració recomanada:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Vercel executa `build-vercel.js`, que copia els fitxers publicables a `dist/`.

## Fitxers principals

```text
index.html              Interfície de l'aplicació
styles.css              Disseny visual i adaptació responsive
app.js                  Lògica, agenda i emmagatzematge local
manifest.webmanifest    Configuració PWA
service-worker.js       Funcionament fora de línia
icons/                  Icones per a la instal·lació
package.json            Ordre de compilació per a Vercel
build-vercel.js         Generador de la carpeta dist
vercel.json             Configuració del desplegament
```

## Versió

Versió actual: **3.3.0**

El calendari de festius incorporat correspon a Lleida i Catalunya per a 2026.
Els calendaris oficials d'anys posteriors s'han d'afegir quan siguin publicats.

## Copyright

Copyright (c) 2026 Jordi. Tots els drets reservats.

Aquesta aplicació, el seu codi, el disseny, els textos i els recursos gràfics són
propietat del titular del copyright. No es permet copiar, modificar, distribuir,
publicar, vendre ni crear obres derivades sense autorització prèvia i escrita del
titular.

La publicació del codi en un repositori accessible públicament no implica la
concessió d'una llicència d'ús, modificació o redistribució.

## Avís

Aquesta aplicació és una eina personal de planificació. Les còpies de seguretat
són responsabilitat de l'usuari. Es recomana generar-les periòdicament i abans
de substituir dades, canviar de dispositiu o actualitzar l'aplicació.
