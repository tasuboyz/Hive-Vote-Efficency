import logging
from datetime import datetime, timezone
from beem.account import Account
from beem import Steem, Hive
from beem.nodelist import NodeList
from beem.vote import Vote
from beem.comment import Comment
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import numpy as np
from xgboost import XGBClassifier, XGBRegressor
import random
import time
import requests
import json

# Configurazione blockchain (impostare 'HIVE' o 'STEEM')
BLOCKCHAIN_CHOICE = "HIVE"  # <-- Modificare qui per cambiare blockchain

# Configuriamo il logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Manual node configuration
STEEM_NODES = [
    "https://api.steemit.com",
    "https://api.justyy.com",
    "https://api.moecki.online"
]

HIVE_NODES = [
    "https://api.deathwing.me",
    "https://api.hive.blog",
    "https://api.openhive.network",
]

CURATOR = "menny.trx"  # Account

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

def update_payout_average(author, current_payout, author_payout_dict):
    """Updates the average payout for an author."""
    if author not in author_payout_dict:
        author_payout_dict[author] = {
            'total': current_payout,
            'count': 1,
            'average': current_payout
        }
    else:
        payout_data = author_payout_dict[author]
        payout_data['total'] += current_payout
        payout_data['count'] += 1
        payout_data['average'] = payout_data['total'] / payout_data['count']
    
    return author_payout_dict[author]['average']

def test_node(node_url, blockchain_type="HIVE"):
    """Test if a node is responsive and functioning correctly."""
    try:
        # Prepare the test request
        headers = {'Content-Type': 'application/json'}
        payload = {
            "jsonrpc": "2.0",
            "method": "condenser_api.get_dynamic_global_properties",
            "params": [],
            "id": 1
        }
        
        # Make request with timeout
        response = requests.post(node_url, json=payload, headers=headers, timeout=5)
        
        if response.status_code == 200:
            result = response.json()
            if 'result' in result:
                logger.info(f"Node {node_url} is working properly")
                return True
            
        logger.warning(f"Node {node_url} returned invalid response")
        return False
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"Node {node_url} test failed: {str(e)}")
        return False

def get_working_node(blockchain_type="HIVE"):
    """Get a working node from the configured list with fallback mechanism."""
    # Get nodes based on blockchain type
    nodes = HIVE_NODES if blockchain_type == "HIVE" else STEEM_NODES
    working_nodes = []
    
    # Test all nodes and collect working ones
    for node in nodes:
        if test_node(node, blockchain_type):
            working_nodes.append(node)
    
    if not working_nodes:
        raise Exception(f"No working {blockchain_type} nodes found!")
    
    # Return a random working node from the list
    selected_node = random.choice(working_nodes)
    logger.info(f"Selected {blockchain_type} node: {selected_node}")
    return selected_node

def switch_to_backup_node(current_node, blockchain_type="HIVE"):
    """Switch to a different working node, avoiding the current one."""
    nodes = HIVE_NODES if blockchain_type == "HIVE" else STEEM_NODES
    backup_nodes = [node for node in nodes if node != current_node]
    
    for node in backup_nodes:
        if test_node(node, blockchain_type):
            logger.info(f"Switching from {current_node} to backup node: {node}")
            return node
    
    raise Exception(f"No working backup {blockchain_type} nodes available!")

def main():
    logger.info("Inizio elaborazione dati...")

    # Initialize blockchain connection with automatic node selection
    try:
        if BLOCKCHAIN_CHOICE == "HIVE":
            working_node = get_working_node("HIVE")
            stm = Hive(node=working_node)
            power_symbol = "HP"
            curator = CURATOR
        else:
            working_node = get_working_node("STEEM")
            stm = Steem(node=working_node)
            power_symbol = "SP"
            curator = CURATOR
        
        logger.info(f"Connected to {BLOCKCHAIN_CHOICE} node: {working_node}")
    except Exception as e:
        logger.error(f"Failed to initialize blockchain connection: {str(e)}")
        return

    # Add retry decorator for blockchain operations
    def retry_on_failure(max_retries=3, delay=1):
        def decorator(func):
            def wrapper(*args, **kwargs):
                nonlocal stm  # Add this to access the outer stm variable
                for attempt in range(max_retries):
                    try:
                        return func(*args, **kwargs)
                    except Exception as e:
                        if attempt == max_retries - 1:
                            raise
                        logger.warning(f"Operation failed, retrying... ({attempt + 1}/{max_retries})")
                        time.sleep(delay)
                        # Try to get a new node and recreate blockchain instance
                        try:
                            new_node = get_working_node(BLOCKCHAIN_CHOICE)
                            # Recreate blockchain instance with new node
                            if BLOCKCHAIN_CHOICE == "HIVE":
                                stm = Hive(node=new_node)
                            else:
                                stm = Steem(node=new_node)
                            logger.info(f"Switched to new node: {new_node}")
                        except Exception as e:
                            logger.warning(f"Failed to switch node: {str(e)}")
                            pass
            return wrapper
        return decorator

    # Use the retry decorator for blockchain operations
    @retry_on_failure()
    def get_post_data(post_identifier):
        return Comment(post_identifier, blockchain_instance=stm)

    @retry_on_failure()
    def get_vote_data(vote_identifier):
        return Vote(vote_identifier, blockchain_instance=stm)

    account = Account(curator, blockchain_instance=stm)
    results = []
    count = 0
    
    # Prepara le chiavi dinamiche per i risultati
    vote_value_key = f"Valore Voto ({power_symbol})"
    reward_key = f"Ricompensa ({power_symbol})"

    # Inizializza il dizionario per tenere traccia dei dati
    author_efficiency_dict = {}
    author_payout_dict = {}
    
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
        'author_avg_payout': [],  # New field
    }

    # Itera sulla cronologia dell'account
    for h in account.history_reverse():
        if h['type'] == 'curation_reward':
            try:
                # Estrae informazioni sul post
                author = h.get('comment_author') or h.get('author')
                permlink = h.get('comment_permlink') or h.get('permlink')
                post_identifier = f"@{author}/{permlink}"
                post = get_post_data(post_identifier)

                author_reputation = post['author_reputation']
                author_payout_token_dollar = float(str(post['author_payout_value']).split()[0])  # Convert to float
                avg_payout = update_payout_average(author, author_payout_token_dollar, author_payout_dict)

                # Tempi importanti
                op_time = datetime.strptime(h['timestamp'], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc)
                post_creation_time = post['created']

                # Calcola i valori
                reward_amount_vests = float(h['reward']['amount']) / 1e6
                reward_amount = convert_vests_to_power(reward_amount_vests, stm)

                # Recupera informazioni sul voto
                vote_identifier = f"{post_identifier}|{curator}"
                vote = get_vote_data(vote_identifier)
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
                data['efficiency'].append(efficiency if efficiency else 0)  # non verrà usata per training classificazione
                data['author_avg_efficiency'].append(avg_efficiency)
                # Il target "success" indica se mettere like (1 se l'efficienza > 50)
                data['success'].append(1 if efficiency and efficiency > 50 else 0)
                data['author_reputation'].append(author_reputation)

                # Salviamo informazioni per l'output Excel
                data['Post'].append(post_identifier)
                data['Author'].append(author)
                data['like_efficiency'].append(efficiency if efficiency else 0)
                data['author_avg_payout'].append(avg_payout)

                count += 1
                if count >= 1000:  # Limita a 1000 risultati
                    break

            except Exception as e:
                logger.error(f"Errore processando {post_identifier}: {str(e)}")
                continue

    logger.info("Elaborazione dati completata. Inizio addestramento modello...")

    # Creazione DataFrame
    df = pd.DataFrame(data)

    # Calcola il delay ottimale storico per autore
    optimal_delay_history = df[df['success'] == 1].groupby('Author')['vote_delay'].mean().to_dict()
    logger.info(f"Delay ottimali storici calcolati per {len(optimal_delay_history)} autori")

    # Definiamo le feature: vote_delay, author_avg_efficiency e author_reputation
    X = df[['vote_delay', 'author_avg_efficiency', 'author_reputation', 'author_avg_payout']]
    # Target per la classificazione: successo del like (1 se l'efficienza > 50)
    y_clf = df['success']
    # Target per la regressione: valore effettivo di like_efficiency
    y_reg = df['like_efficiency']

    # Split per il classificatore
    X_train, X_test, y_clf_train, y_clf_test = train_test_split(X, y_clf, test_size=0.2, random_state=42)
    clf_model = XGBClassifier()
    clf_model.fit(X_train, y_clf_train)

    # After fitting the classifier model, add these lines for evaluation metrics
    y_pred = clf_model.predict(X_test)
    accuracy = accuracy_score(y_clf_test, y_pred)
    class_report = classification_report(y_clf_test, y_pred)
    
    logger.info(f"Accuracy Score: {accuracy:.4f}")
    logger.info("Classification Report:")
    logger.info("\n" + class_report)

    # Split per il regressore
    X_reg_train, X_reg_test, y_reg_train, y_reg_test = train_test_split(X, y_reg, test_size=0.2, random_state=42)
    reg_model = XGBRegressor()
    reg_model.fit(X_reg_train, y_reg_train)

    # Simuliamo le previsioni sui nuovi dati (X_test)
    predictions_list = []
    for index, row in X_test.iterrows():
        post_features = row.to_frame().T
        author = df.loc[index, 'Author']
        vote_decision = clf_model.predict(post_features)[0]
    
        if vote_decision == 0:
            vote_decision_result = 0
            optimal_delay = None
            predicted_eff = None
        else:
            # Use historical optimal delay if available, otherwise use default
            optimal_delay = int(optimal_delay_history.get(author, 1440))  # default 24h if no history
            
            # Predict efficiency with this delay
            modified_features = post_features.copy()
            modified_features["vote_delay"] = optimal_delay
            predicted_eff = reg_model.predict(modified_features)[0]
            vote_decision_result = 1

        predictions_list.append({
            "vote_decision": vote_decision_result,
            "optimal_vote_delay_minutes": optimal_delay,
            "predicted_efficiency": predicted_eff
        })

    # Creazione del DataFrame per Excel:
    # includiamo Post, Author, like_efficiency, il target reale e le previsioni della nuova pipeline
    prediction_df = df.loc[X_test.index, ['Post', 'Author', 'like_efficiency', 'vote_delay']].copy()
    prediction_df = prediction_df.rename(columns={'vote_delay': 'actual_vote_delay_minutes'})
    prediction_df['real_success'] = y_clf_test.values
    prediction_df['vote_decision'] = [p['vote_decision'] for p in predictions_list]
    prediction_df['optimal_vote_delay_minutes'] = [p['optimal_vote_delay_minutes'] for p in predictions_list]
    prediction_df['predicted_efficiency'] = [p['predicted_efficiency'] for p in predictions_list]

    # Add delay difference column (optional)
    prediction_df['delay_difference_minutes'] = prediction_df.apply(
        lambda row: row['optimal_vote_delay_minutes'] - row['actual_vote_delay_minutes'] 
        if row['optimal_vote_delay_minutes'] is not None else None, 
        axis=1
    )

    # Before saving the Excel file, add author performance analysis
    author_stats = pd.DataFrame({
        'Author': df['Author'].unique(),
        'Total_Posts': df.groupby('Author').size(),
        'Avg_Efficiency': df.groupby('Author')['like_efficiency'].mean(),
        'Success_Rate': df.groupby('Author')['success'].mean() * 100,
        'Avg_Payout': df.groupby('Author')['author_avg_payout'].mean()
    }).reset_index(drop=True)

    # Sort by different metrics and get top/bottom 10
    top_by_efficiency = author_stats.nlargest(10, 'Avg_Efficiency')
    bottom_by_efficiency = author_stats.nsmallest(10, 'Avg_Efficiency')
    
    top_by_success = author_stats.nlargest(10, 'Success_Rate')
    bottom_by_success = author_stats.nsmallest(10, 'Success_Rate')
    
    top_by_payout = author_stats.nlargest(10, 'Avg_Payout')
    bottom_by_payout = author_stats.nsmallest(10, 'Avg_Payout')

    # Create Excel writer object
    with pd.ExcelWriter('predictions_and_rankings.xlsx') as writer:
        # Save the predictions
        prediction_df.to_excel(writer, sheet_name='Predictions', index=False)
        
        # Save the rankings
        top_by_efficiency.to_excel(writer, sheet_name='Top Authors by Efficiency', index=False)
        bottom_by_efficiency.to_excel(writer, sheet_name='Bottom Authors by Efficiency', index=False)
        
        top_by_success.to_excel(writer, sheet_name='Top Authors by Success Rate', index=False)
        bottom_by_success.to_excel(writer, sheet_name='Bottom Authors by Success Rate', index=False)
        
        top_by_payout.to_excel(writer, sheet_name='Top Authors by Payout', index=False)
        bottom_by_payout.to_excel(writer, sheet_name='Bottom Authors by Payout', index=False)
        
        # Save complete author stats
        author_stats.sort_values('Avg_Efficiency', ascending=False).to_excel(
            writer, 
            sheet_name='Complete Author Stats', 
            index=False
        )

    logger.info("File Excel con le previsioni e classifiche salvato come 'predictions_and_rankings.xlsx'.")
    logger.info("Operazione completata.")

if __name__ == "__main__":
    main()