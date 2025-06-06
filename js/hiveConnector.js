import { getCurrentNode, findWorkingNode, switchToNextNode } from './hiveNodes.js';

/**
 * HiveConnector - Modulo per gestire le connessioni e le chiamate API alla blockchain Hive
 * Fornisce un'interfaccia unificata per tutte le chiamate API necessarie
 */
class HiveConnector {
  constructor() {
    this.initialized = false;
  }

  /**
   * Inizializza la connessione a Hive
   */
  async initialize() {
    if (this.initialized) return;
    
    if (!await findWorkingNode()) {
      throw new Error('Nessun nodo Hive disponibile');
    }
    
    console.log(`HiveConnector inizializzato con nodo: ${getCurrentNode()}`);
    this.initialized = true;
  }

  /**
   * Esegue una chiamata API con gestione automatica di failover tra nodi
   * @param {Function} apiCall - Funzione che esegue la chiamata API
   * @returns {Promise<any>} Risultato della chiamata API
   */
  async executeWithFailover(apiCall) {
    await this.initialize();
    
    try {
      return await apiCall();
    } catch (error) {
      console.warn(`Errore API, tentativo di switch nodo...`, error);
      if (await switchToNextNode()) {
        return await apiCall();
      }
      throw error;
    }
  }

  /**
   * Ottiene la cronologia di un account
   * @param {string} account - Nome utente dell'account
   * @param {number} lastId - ID dell'ultima operazione recuperata
   * @param {number} limit - Numero massimo di operazioni da recuperare
   * @returns {Promise<Array>} Cronologia dell'account
   */
  async getAccountHistory(account, lastId = -1, limit = 1000) {
    return this.executeWithFailover(() => {
      return new Promise((resolve, reject) => {
        hive.api.getAccountHistoryAsync(account, lastId, limit)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * Ottiene i dettagli di un post e dei voti
   * @param {string} author - Autore del post
   * @param {string} permlink - Permlink del post
   * @returns {Promise<Object>} Dettagli del post e dei voti
   */
  async getPostDetails(author, permlink) {
    return this.executeWithFailover(async () => {
      const [votes, content] = await Promise.all([
        hive.api.getActiveVotesAsync(author, permlink),
        hive.api.getContentAsync(author, permlink)
      ]);
      return { votes, content };
    });
  }

  /**
   * Ottiene i dati di un account
   * @param {string} account - Nome utente dell'account
   * @returns {Promise<Object>} Dati dell'account
   */
  async getAccountData(account) {
    return this.executeWithFailover(() => {
      return new Promise((resolve, reject) => {
        hive.api.getAccounts([account], (err, accounts) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!accounts || accounts.length === 0) {
            reject(new Error('Account non trovato'));
            return;
          }
          
          resolve(accounts[0]);
        });
      });
    });
  }

  /**
   * Ottiene le proprietà globali dinamiche
   * @returns {Promise<Object>} Proprietà globali
   */
  async getDynamicGlobalProperties() {
    return this.executeWithFailover(() => {
      return new Promise((resolve, reject) => {
        hive.api.getDynamicGlobalProperties((err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    });
  }

  /**
   * Ottiene i dati del reward fund
   * @param {string} type - Tipo di reward fund ('post' per default)
   * @returns {Promise<Object>} Dati del reward fund
   */
  async getRewardFund(type = 'post') {
    return this.executeWithFailover(() => {
      return new Promise((resolve, reject) => {
        hive.api.getRewardFund(type, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    });
  }

  /**
   * Ottiene il prezzo mediano corrente
   * @returns {Promise<Object>} Dati del prezzo mediano
   */
  async getCurrentMedianHistoryPrice() {
    return this.executeWithFailover(() => {
      return new Promise((resolve, reject) => {
        hive.api.getCurrentMedianHistoryPrice((err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    });
  }

  /**
   * Converte VESTS in HIVE
   * @param {number} vests - Quantità di VESTS da convertire
   * @returns {Promise<number>} Quantità equivalente in HIVE
   */
  async vestsToHive(vests) {
    const props = await this.getDynamicGlobalProperties();
    const totalVests = parseFloat(props.total_vesting_shares.split(' ')[0]);
    const totalHive = parseFloat(props.total_vesting_fund_hive.split(' ')[0]);
    const hivePerVest = totalHive / totalVests;
    return parseFloat(vests) * hivePerVest;
  }
}

export default new HiveConnector();
