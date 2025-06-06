import hiveConnector from './hiveConnector.js';
import { showError } from './ui.js';

/**
 * CurationCalculator - Modulo per calcolare l'efficienza di curazione
 * Implementa la logica per analizzare l'efficienza dei voti di curazione
 */
class CurationCalculator {
  /**
   * Calcola l'efficienza di curazione per un dato utente
   * @param {string} curator - Nome utente del curatore
   * @param {number} daysBack - Numero di giorni da analizzare
   * @returns {Promise<Object>} Risultati dell'analisi
   */
  async calculateCurationEfficiency(curator, daysBack = 7) {
    if (!curator) {
      showError('Per favore, inserisci un username');
      return null;
    }

    try {
      // Inizializza la connessione Hive
      await hiveConnector.initialize();

      let allResults = [];
      let lastId = -1;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      let isWithinTimeframe = true;
      let processedCount = 0;

      // Impostazioni per prevenire loop infiniti
      const maxOperations = 5000;
      const startTime = Date.now();
      const maxTimeMs = 30000; // 30 secondi massimo
      const batchSize = 1000; // <= 1000, limite massimo consentito da Hive

      // Ottieni dati dell'account per calcoli successivi
      const account = await hiveConnector.getAccountData(curator);
      
      // Calcola SP effettivo del curatore
      const delegatedVestingShares = parseFloat(account.delegated_vesting_shares.split(' ')[0]);
      const vestingShares = parseFloat(account.vesting_shares.split(' ')[0]);
      const receivedVestingShares = parseFloat(account.received_vesting_shares.split(' ')[0]);
      const totalVestingShares = vestingShares + receivedVestingShares - delegatedVestingShares;

      while (isWithinTimeframe) {
        // Controllo se abbiamo superato i limiti
        // if (processedCount > maxOperations || (Date.now() - startTime) > maxTimeMs) {
        //   console.warn(`Arresto calcolo: raggiunto limite (${processedCount} operazioni elaborate)`);
        //   break;
        // }

        try {
          // Ottieni la cronologia dell'account in batch più grandi
          const accountHistory = await hiveConnector.getAccountHistory(curator, lastId, batchSize);
          if (!accountHistory || accountHistory.length === 0) break;

          // Ordina per ID in ordine decrescente
          accountHistory.sort((a, b) => b[0] - a[0]);

          // Filtra solo le ricompense di curazione nel periodo
          for (const entry of accountHistory) {
            const [id, operation] = entry;
            
            if (operation.op[0] === 'curation_reward') {
              const timestamp = new Date(operation.timestamp + 'Z');
              
              // Fermati se raggiungiamo dati più vecchi del periodo
              if (timestamp < cutoffDate) {
                isWithinTimeframe = false;
                break;
              }
              
              const opData = operation.op[1];
              const comment_author = this.getOperationField(opData, ['author', 'comment_author']);
              const comment_permlink = this.getOperationField(opData, ['permlink', 'comment_permlink']);
              const rewardAmount = this.getOperationField(opData, ['reward']);
              
              const postIdentifier = `@${comment_author}/${comment_permlink}`;
              
              try {
                const { votes, content } = await hiveConnector.getPostDetails(comment_author, comment_permlink);
                
                const voteDetails = votes.find(v => v.voter === curator);
                
                if (voteDetails) {
                  const reward_vests = parseFloat(rewardAmount.split(' ')[0]);
                  const vote_weight = voteDetails.weight / 1000000000;
                  const percent = voteDetails.percent / 100;
                  const vote_time = new Date(voteDetails.time + 'Z');
                  const created_time = new Date(content.created + 'Z');
                  const voteAge = Math.floor((vote_time - created_time) / (1000 * 60)); // Converti in minuti
                  
                  const effective_reward_hp = await hiveConnector.vestsToHive(reward_vests);
                  const votingPower = 10000; // 100% per default
                  const estimate_reward = await this.calculateVoteValue(percent, totalVestingShares, votingPower);
                  const vote_weight_hp = estimate_reward * 2;
                  const efficiency = ((effective_reward_hp) / estimate_reward) * 100;

                  allResults.push({
                    post: postIdentifier,
                    rewardHP: effective_reward_hp,
                    voteValue: vote_weight_hp,
                    expectedReward: estimate_reward,
                    efficiency: efficiency,
                    percent: percent,
                    time: voteDetails.time,
                    voteAge: voteAge
                  });
                  
                  processedCount++;
                }
              } catch (error) {
                console.warn(`Errore nel processare il post ${postIdentifier}:`, error);
                continue;
              }
            }
            
            lastId = id - 1;
            if (lastId < 0) break;
          }

          // Interrompi il ciclo se abbiamo trovato voci più vecchie di una settimana
          if (!isWithinTimeframe) break;
          
          // Interrompi anche se l'ultimo ID è negativo o abbiamo meno risultati del batch size
          if (lastId < 0 || accountHistory.length < batchSize) {
            isWithinTimeframe = false;
          }
        } catch (error) {
          console.error('Errore recupero cronologia account:', error);
          if (!await hiveConnector.initialize()) {
            throw new Error('Nessun nodo Hive disponibile');
          }
        }
      }

      // Calcola APR
      let apr = 0;
      if (allResults.length > 0) {
        const totalWeeklyRewards = allResults.reduce((sum, result) => sum + result.rewardHP, 0);
        apr = await this.calculateAPR(totalWeeklyRewards, totalVestingShares);
      }

      return {
        results: allResults,
        apr: apr
      };
    } catch (error) {
      console.error('Errore durante il calcolo dell\'efficienza:', error);
      showError(error.message || 'Errore durante il calcolo dell\'efficienza.');
      return null;
    }
  }

  /**
   * Calcola l'Annual Percentage Rate (APR) basato sulle ricompense settimanali
   * @param {number} totalWeeklyRewards - Totale ricompense settimanali
   * @param {number} vestingShares - VESTS effettivi dell'utente
   * @returns {Promise<number>} APR calcolato
   */
  async calculateAPR(totalWeeklyRewards, vestingShares) {
    try {
      const totalVestingHive = await hiveConnector.vestsToHive(vestingShares);
      const annualRewards = totalWeeklyRewards * 52;
      const apr = (annualRewards / totalVestingHive) * 100;
      return apr;
    } catch (error) {
      console.error('Errore calcolo APR:', error);
      return 0;
    }
  }

  /**
   * Calcola il valore di un voto utilizzando la formula ufficiale di Hive
   * @param {number} votePercent - Percentuale di voto (-100 a 100)
   * @param {number} effectiveVests - VESTS effettivi dell'utente
   * @param {number} votingPower - Potenza di voto (default: 10000 = 100%)
   * @returns {Promise<number>} Valore stimato del voto in HP
   */
  async calculateVoteValue(votePercent, effectiveVests, votingPower = 10000) {
    try {
      // Ottieni proprietà globali
      const props = await hiveConnector.getDynamicGlobalProperties();

      // Calcola rapporto HP/VESTS
      const totalVestingFundHive = parseFloat(props.total_vesting_fund_hive.split(' ')[0]);
      const totalVestingShares = parseFloat(props.total_vesting_shares.split(' ')[0]);
      const hivePerVests = totalVestingFundHive / totalVestingShares;

      // Converti vests in Hive Power
      const hp = effectiveVests * hivePerVests;

      // Calcola 'r' (rapporto HP/hpv)
      const r = hp / hivePerVests;

      // Calcola 'p' (potenza di voto)
      const weight = Math.abs(votePercent) * 100; // Converti la percentuale in peso (100% = 10000)
      const p = (votingPower * weight / 10000 + 49) / 50;

      // Ottieni reward fund
      const rewardFund = await hiveConnector.getRewardFund();

      // Calcola rbPrc
      const recentClaims = parseFloat(rewardFund.recent_claims);
      const rewardBalance = parseFloat(rewardFund.reward_balance.split(' ')[0]);
      const rbPrc = rewardBalance / recentClaims;

      // Ottieni prezzo mediano da Hive API
      const priceInfo = await hiveConnector.getCurrentMedianHistoryPrice();

      const baseAmount = parseFloat(priceInfo.base.split(' ')[0]);
      const quoteAmount = parseFloat(priceInfo.quote.split(' ')[0]);
      const hiveToHbdRate = baseAmount / quoteAmount;

      // Applica la formula ufficiale Hive
      // risultato = r * p * 100 * rbPrc
      const hiveValue = r * p * 100 * rbPrc;

      return parseFloat(hiveValue.toFixed(4));
    } catch (error) {
      console.error('Errore calcolo valore voto:', error);
      return 0;
    }
  }

  /**
   * Ottiene un campo da un oggetto operazione cercando tra vari nomi possibili
   * @param {Object} opData - Dati dell'operazione
   * @param {Array<string>} fields - Nomi possibili del campo
   * @returns {any} Valore del campo trovato
   */
  getOperationField(opData, fields) {
    for (const field of fields) {
      if (opData[field] !== undefined) {
        return opData[field];
      }
    }
    throw new Error(`Campo richiesto non trovato. Campi controllati: ${fields.join(', ')}`);
  }
}

export default new CurationCalculator();
