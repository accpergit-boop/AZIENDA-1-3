# SUPER IQ-FOAM — Usare la versione di GitHub come versione definitiva

La versione dell'ERP SUPER IQ-FOAM modificata dal proprietario su GitHub diventa la versione ufficiale dell'app.
L'anteprima smette così di mostrare il lavoro vecchio e mostra proprio la versione di GitHub.

## Per chi è
Il proprietario di SUPER IQ-FOAM, unico utente. Ha modificato il progetto su GitHub e vuole vedere e usare quella versione nell'anteprima e nell'app.

## Spiegazione semplice della situazione
- Il progetto esiste oggi in due copie:
  - **Copia qui (anteprima):** contiene il lavoro fatto in questa chat, comprese le ultime modifiche (nuova Invoice con Preview e PDF, eliminazione invoice, delivery note inglese/urdu, Production bianco/blu, Attendance Present/Absent, planner consegne con diesel, assistente con ricerca web).
  - **Copia su GitHub:** contiene le modifiche fatte dal proprietario.
- L'anteprima mostra sempre la copia di qui. Per questo vede "il lavoro vecchio": le modifiche fatte su GitHub non sono ancora arrivate qui.
- Inoltre il proprietario non ha ancora salvato (caricato) tutto il suo lavoro nel repository GitHub. Finché non lo fa, non c'è niente da prendere.
- **I dati non sono su GitHub.** Clienti, stock, opening balance e impostazioni stanno nel database dell'app, non nel codice. GitHub contiene solo il codice e gli eventuali dati iniziali scritti dentro il codice.

## Funzionalità e risultato
- **Versione GitHub come definitiva:** il codice di qui viene sostituito con quello dello stesso repository e branch usati con "Save to GitHub". Le modifiche fatte qui che non sono su GitHub vengono perse.
- **Dati dalla versione GitHub:** il database viene ripartito da zero con i dati iniziali previsti dal codice GitHub. Se quel codice non contiene i 266 clienti, lo stock e gli opening balance, questi non ci saranno più.
- **Anteprima aggiornata:** dopo la sostituzione l'anteprima mostra la versione GitHub, senza messaggi di app che si riapre in continuazione.
- **Controllo finale:** login, Dashboard, Customers, Invoices (con PDF), Stock, Deliveries e Settings vengono aperti e provati. Ogni parte che non funziona viene segnalata al proprietario, senza cambiare nulla del suo design.

## Flusso
1. Il proprietario salva tutto il suo progetto sul repository GitHub, stesso repository e stesso branch di sempre.
2. Il proprietario scrive in chat "fatto, ho caricato su GitHub".
3. Il codice viene preso da GitHub e sostituisce quello di qui. Il database riparte con i dati del codice GitHub.
4. Il proprietario apre l'anteprima e vede la sua versione GitHub.
5. Il proprietario riceve un breve resoconto: cosa funziona e cosa eventualmente va sistemato.

## Aspetto
Resta esattamente quello della versione GitHub. Non vengono fatte modifiche grafiche.

## Fasi
- **Fase 1 (MVP, si fa adesso):** attendere il caricamento su GitHub, sostituire il codice di qui con quello di GitHub, ripartire con i dati del codice GitHub, verificare che l'anteprima mostri la versione giusta e che le sezioni principali funzionino.
- **Fase 2:** correggere gli eventuali errori trovati nella versione GitHub, solo quelli approvati dal proprietario.
- **Fase 3:** se servono, recuperare dalla vecchia copia singole funzioni o dati (per esempio la lista dei 266 clienti con gli opening balance), su richiesta del proprietario.

## Assunzioni
- La versione GitHub sostituisce completamente il codice di qui (risposta del proprietario: "versione definitiva fatta con GitHub"). Non c'è nessuna unione con le ultime modifiche fatte in questa chat.
- Si usa lo stesso repository e lo stesso branch di "Save to GitHub", come indicato dal proprietario.
- Il lavoro parte solo dopo che il proprietario conferma di aver caricato tutto su GitHub.
- "Usare i dati della versione GitHub" vuol dire: il database attuale viene svuotato e riparte con i dati iniziali presenti nel codice GitHub. I dati attuali (266 clienti, 56 articoli di stock, opening balance, impostazioni) vanno persi se non sono nel codice GitHub.
- Login: valgono le credenziali previste dalla versione GitHub. Se non ce ne sono, resta l'account del proprietario 2j2skp87z8@privaterelay.appleid.com.
- Chiavi e configurazioni dell'ambiente di qui (database, chiave AI, login) restano quelle attuali, perché su GitHub non vengono salvate.
