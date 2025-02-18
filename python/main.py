import logging
from datetime import datetime, timezone
from beem.account import Account
from beem import Steem, Hive
from beem.nodelist import NodeList
from beem.vote import Vote
from beem.comment import Comment
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
import numpy as np

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

def update_efficiency_average(author, current_efficiency, author_efficiency_dict):
    """Aggiorna l'efficienza media di un autore."""
    if author not in author_efficiency_dict:
        author_efficiency_dict[author] = {
            'total': current_efficiency,
            'count': 1,
            'average': current_efficiency
        }
    else:
        author_data = author_efficiency_dict[author]
        author_data['total'] += current_efficiency
        author_data['count'] += 1
        author_data['average'] = author_data['total'] / author_data['count']
    
    return author_efficiency_dict[author]['average']

def main():
    logger.info("Inizio elaborazione dati...")

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

    # Inizializza il dizionario per tenere traccia dei dati
    author_efficiency_dict = {}
    
    # Aggiungiamo anche i dati per tracciare a quale post/autore mettiamo like 
    data = {
        'voting_power': [],
        'vote_delay': [],
        'reward': [],
        'efficiency': [],
        'author_avg_efficiency': [],
        'success': [],
        'author_reputation': [],
        'Post': [],
        'Author': [],
        'like_efficiency': [],
    }

    # Itera sulla cronologia dell'account
    for h in account.history_reverse():
        if h['type'] == 'curation_reward':
            try:
                # Estrae informazioni sul post
                author = h.get('comment_author') or h.get('author')
                permlink = h.get('comment_permlink') or h.get('permlink')
                post_identifier = f"@{author}/{permlink}"
                post = Comment(post_identifier, blockchain_instance=stm)

                author_reputation = post['author_reputation']
                author_payout_token_dollar = post['author_payout_value']

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
                teoric_reward = convert_vests_to_power(weight, stm)

                vote_value = teoric_reward * 2

                # Calcola l'efficienza (che useremo in output come "like_efficiency")
                efficiency = (((reward_amount - teoric_reward) / teoric_reward) * 100) if vote_value > 0 else None

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

                # Calcola l'efficienza media storica dell'autore
                current_efficiency = efficiency if efficiency else 0
                avg_efficiency = update_efficiency_average(author, current_efficiency, author_efficiency_dict)

                # Append data per il ML
                data['voting_power'].append(vote_percent)
                data['vote_delay'].append(age / 60)  # converte in minuti
                data['reward'].append(reward_amount)
                data['efficiency'].append(efficiency if efficiency else 0)  # non verrà usata per training
                data['author_avg_efficiency'].append(avg_efficiency)
                # Il target "success" indica se mettere like (1 se l'efficienza > 50)
                data['success'].append(1 if efficiency and efficiency > 50 else 0)
                data['author_reputation'].append(author_reputation)

                # Salviamo informazioni per l'output Excel
                data['Post'].append(post_identifier)
                data['Author'].append(author)
                data['like_efficiency'].append(efficiency if efficiency else 0)

                count += 1
                if count >= 1000:  # Limita a 1000 risultati
                    break

            except Exception as e:
                logger.error(f"Errore processando {post_identifier}: {str(e)}")
                continue

    logger.info("Elaborazione dati completata. Inizio addestramento modello...")

    # Creazione DataFrame
    df = pd.DataFrame(data)

    # Separiamo le feature per l'addestramento: NOTA che efficiency non viene usata per trainare
    X = df[['voting_power', 'vote_delay', 'author_avg_efficiency']]
    y = df['success']

    # Split del dataset in training e nuovi dati
    X_train, X_new, y_train, y_new = train_test_split(X, y, test_size=0.2, random_state=42)

    # Creazione e addestramento del modello
    model = LogisticRegression()
    model.fit(X_train, y_train)

    # Valutazione sul training set
    y_pred = model.predict(X_train)
    accuracy = accuracy_score(y_train, y_pred)
    report = classification_report(y_train, y_pred)
    logger.info(f'Accuratezza del modello: {accuracy:.2f}')
    logger.info('Report di classificazione:')
    logger.info(report)

    # Previsioni sui nuovi dati
    predictions = model.predict(X_new)
    logger.info(f'Previsioni per i nuovi dati: {predictions}')

    # Creazione del DataFrame per Excel: includiamo Post, Author, like_efficiency, il target reale ed il predetto
    prediction_df = df.loc[X_new.index, ['Post', 'Author', 'like_efficiency']].copy()
    prediction_df['real_success'] = y_new
    prediction_df['prediction'] = predictions

    # Salva il file Excel
    prediction_df.to_excel('predictions.xlsx', index=False)
    logger.info("File Excel con le previsioni salvato come 'predictions.xlsx'.")

    # Mostra i risultati nel logger
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

    logger.info("Operazione completata.")

if __name__ == "__main__":
    main()