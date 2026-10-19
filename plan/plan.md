# SUPER IQ-FOAM: passaggio al codice AZIENDA-1- (multi-company) con i dati reali

In questo job si installa il codice del repository AZIENDA-1- (branch feature/multicompany-erp, fino al commit 1b7452d), con tutte le sue funzioni, il suo design e i tre profili aziendali.
I dati reali di questo job (clienti, saldi, stock, flotta, impostazioni, utenti) vengono assegnati al profilo SUPER IQ-FOAM. Prima di tutto si fa una copia di sicurezza completa, che poi non verrà toccata.

## Per chi è
Il titolare e gli utenti autorizzati dei tre profili aziendali. Ogni profilo vede e gestisce solo i propri dati.

## Funzioni principali ed esperienza
- **Codice e design di AZIENDA-1-**: si usa l'app come è stata costruita con Copilot, senza riscriverla né cambiarne l'aspetto. Restano le funzioni di questo job che AZIENDA-1- non ha, come l'AI Assistant: vanno nell'elenco finale delle differenze e non si aggiungono senza la tua approvazione.
- **Copia di sicurezza intoccabile**: prima di qualsiasi modifica si salva un'istantanea completa del database attuale, che resta disponibile per ripristino o confronto. Il codice attuale resta recuperabile con il "Rollback" della piattaforma.
- **Migrazione dati verso SUPER IQ-FOAM**:
  - circa 290 clienti;
  - 26 saldi iniziali (R 905.471,00);
  - stock, incluso Ribbon Black / Ribbon Pink;
  - flotta (Hino 300, Hino 500, Hyundai Mighty e trailer, con consumi e portate);
  - impostazioni aziendali (ROCKY RIDGE LODGE, KOKSTAD, telefoni);
  - utenti autorizzati, compreso l'accesso Google del titolare.
- **Altri due profili**: partono vuoti e funzionanti, con nomi e impostazioni come nel repository.
- **Separazione dei dati**: clienti, invoice, stock, flotta e utenti restano chiusi nel proprio profilo. Un utente di un profilo non può vedere né modificare i dati di un altro.
- **Segreti**: nessuna password, token o chiave viene copiata nel codice o nei dati. Le chiavi necessarie vengono configurate nelle impostazioni protette dell'ambiente. Le password dei tre profili vengono impostate di nuovo e comunicate solo a te.
- **Rapporto di confronto finale**: per SUPER IQ-FOAM, conteggi e saldi della copia di sicurezza messi accanto a quelli del nuovo sistema. Segue l'elenco di ogni dato o funzione non trasferibile, con il motivo.

## Flusso utente
1. Rendi pubblico il repository AZIENDA-1- e me lo comunichi. Io prendo il codice al commit 1b7452d e ti avviso, così puoi rimetterlo privato subito.
2. Viene fatta la copia di sicurezza dei dati attuali.
3. Il codice di AZIENDA-1- sostituisce quello attuale in questo job.
4. I dati reali vengono caricati nel profilo SUPER IQ-FOAM.
5. Vengono configurati in modo sicuro le chiavi e gli accessi dei tre profili.
6. Verifiche:
   - confronto di conteggi e saldi;
   - login dei tre profili e controllo che un profilo non veda i dati degli altri;
   - creazione, anteprima e PDF di una invoice;
   - delivery note.
7. Ricevi il rapporto con le differenze e i punti non trasferibili. Solo dopo il lavoro viene dichiarato completato.

## Interfaccia
Si usa esattamente il design di AZIENDA-1-. L'app resta in inglese.

## Fasi di lavoro
- **Fase 1 (MVP, da fare ora)**: copia di sicurezza, installazione del codice AZIENDA-1- al commit 1b7452d, migrazione dei dati reali in SUPER IQ-FOAM, configurazione sicura degli accessi, verifiche complete e rapporto finale.
- **Fase 2**: correzione dei problemi trovati nelle verifiche ed eventuale aggiunta in AZIENDA-1- delle funzioni di questo job che mancano (AI Assistant, Smart Planner, delivery note in urdu), solo quelle che approvi.
- **Fase 3**: completamento delle voci rimaste aperte, cioè nomi dei dipendenti, pesi per misura dei materassi e dati bancari sul PDF.

## Assunzioni
- Il nome "nuovo job" è inteso come questo stesso job: da qui non è possibile lavorare in un altro job.
- I dati del job sorgente restano intatti nella copia di sicurezza. Il database attivo, invece, viene adattato alla struttura multi-company di AZIENDA-1-.
- Dove la struttura di AZIENDA-1- non ha un campo corrispondente a un dato attuale, il dato si conserva nella copia di sicurezza e viene segnalato nel rapporto. Non si inventano campi nuovi.
- Le invoice non vengono migrate: erano già state eliminate su tua richiesta.
- Presenze e produzione vengono migrate solo se contengono dati reali e se AZIENDA-1- ha le sezioni corrispondenti.
- Il login dei tre profili si verifica con credenziali di prova create da me. Le credenziali reali le imposti tu. L'accesso Google del titolare resta su `2j2skp87z8@privaterelay.appleid.com`.
- Se AZIENDA-1- richiede servizi esterni con chiavi proprie, te le chiedo al momento. Senza quelle chiavi la funzione relativa viene segnalata come non attiva.
- Per contenere i crediti si fa una sola tornata di verifica completa, seguita dalla correzione dei soli problemi bloccanti.
