import logging
from datetime import datetime, timezone
from beem.account import Account
from beem import Steem, Hive
from beem.nodelist import NodeList
from beem.vote import Vote
from beem.comment import Comment

# Configurazione blockchain (impostare 'HIVE' o 'STEEM')
BLOCKCHAIN_CHOICE = "HIVE"  # <-- Modificare qui per cambiare blockchain

# Configuriamo il logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def convert_vests_to_power(amount, blockchain_instance):
    """Convert vesting shares to HP/SP in base alla blockchain."""
    try:
        if isinstance(blockchain_instance, Hive):
            return blockchain_instance.vests_to_hp(float(amount))
        elif isinstance(blockchain_instance, Steem):
            return blockchain_instance.vests_to_sp(float(amount))
        else:
            logger.error("Blockchain non supportata")
            return 0
    except Exception as e:
        logger.error(f"Errore nella conversione da vesting shares a power: {e}")
        return 0

def main():
    # Inizializza la connessione alla blockchain selezionata
    steem_node = "https://api.moecki.online"
    hive_node = "https://api.hive.blog"
    
    if BLOCKCHAIN_CHOICE == "HIVE":
        stm = Hive(node=hive_node)
        power_symbol = "HP"
        curator = "cur8"  # Account Hive di esempio
    else:
        stm = Steem(node=steem_node)
        power_symbol = "SP"
        curator = "cur8"  # Account Steem di esempio

    account = Account(curator, blockchain_instance=stm)
    results = []
    count = 0
    
    # Prepara le chiavi dinamiche per i risultati
    vote_value_key = f"Valore Voto ({power_symbol})"
    reward_key = f"Ricompensa ({power_symbol})"

    # Itera sulla cronologia dell'account
    for h in account.history_reverse():
        if h['type'] == 'curation_reward':
            try:
                # Estrae informazioni sul post
                author = h.get('comment_author') or h.get('author')
                permlink = h.get('comment_permlink') or h.get('permlink')
                post_identifier = f"@{author}/{permlink}"
                post = Comment(post_identifier, blockchain_instance=stm)

                # Tempi importanti
                op_time = datetime.strptime(h['timestamp'], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc)
                post_creation_time = post['created']

                # Calcola i valori
                reward_amount_vests = float(h['reward']['amount']) / 1e6
                reward_amount = convert_vests_to_power(reward_amount_vests, stm)

                # Recupera informazioni sul voto
                vote_identifier = f"{post_identifier}|{curator}"
                vote = Vote(vote_identifier, blockchain_instance=stm)
                vote_time = vote.time
                vote_percent = vote['percent'] / 100
                age = (vote_time - post_creation_time).total_seconds()

                if BLOCKCHAIN_CHOICE == "STEEM":
                    weight = vote.weight / 100
                else:
                    weight = vote.weight / 1000000000
                vote_value = convert_vests_to_power(weight, stm)

                # Calcola l'efficienza
                efficiency = (reward_amount / vote_value * 100) if vote_value > 0 else None

                results.append({
                    "Post": post_identifier,
                    "Data Operazione": op_time.isoformat(),
                    "Data Voto": vote_time.isoformat(),
                    "Età Post (s)": f"{age:.0f}",
                    vote_value_key: f"{vote_value:.4f}",
                    reward_key: f"{reward_amount:.4f}",
                    "Efficienza (%)": f"{efficiency:.2f}" if efficiency else "N/A",
                    "Percentuale": f"{vote_percent:.2f}",
                })

                count += 1
                if count >= 20:  # Limita a 20 risultati
                    break

            except Exception as e:
                logger.error(f"Errore processando {post_identifier}: {str(e)}")
                continue

    # Mostra i risultati
    if results:
        logger.info("\n\nRISULTATI ANALISI CURATION")
        logger.info(f"Blockchain: {BLOCKCHAIN_CHOICE}")
        logger.info(f"Account analizzato: @{curator}")
        logger.info("="*60)
        
        for idx, res in enumerate(results, 1):
            logger.info(f"RISULTATO #{idx}")
            logger.info(f"Post: {res['Post']}")
            logger.info(f"Votato il: {res['Data Voto']}")
            logger.info(f"Età post al voto: {res['Età Post (s)']} secondi")
            logger.info(f"{vote_value_key}: {res[vote_value_key]}")
            logger.info(f"{reward_key}: {res[reward_key]}")
            logger.info(f"Efficienza: {res['Efficienza (%)']}%")
            logger.info(f"Percentuale: {res['Percentuale']}%")
            logger.info("-"*60)
    else:
        logger.info("Nessuna curation reward trovata nella cronologia")

if __name__ == "__main__":
    main()