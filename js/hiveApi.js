import { showError, setLoadingState, updateUI, resetLoadingState } from './ui.js';
import { getCurrentNode, findWorkingNode, HIVE_NODES, switchToNextNode } from './hiveNodes.js';

async function getAccountHistory(curator, lastId) {
    return retryWithFailover(async () => {
        return await hive.api.getAccountHistoryAsync(curator, lastId, 100);
    });
}

async function getPostDetails(comment_author, comment_permlink) {
    return retryWithFailover(async () => {
        const [vote, content] = await Promise.all([
            hive.api.getActiveVotesAsync(comment_author, comment_permlink),
            hive.api.getContentAsync(comment_author, comment_permlink)
        ]);
        return { vote, content };
    });
}

export async function calculateEfficiency() {
    const curator = document.getElementById('curator').value;
    const errorElement = document.getElementById('error');
    const loadingElement = document.getElementById('loading');
    const statsContainer = document.getElementById('statsContainer');
    const button = document.querySelector('.btn-calculate');
    const buttonText = button.querySelector('span');
    const loader = button.querySelector('.loader');
  
    if (!curator) {
        showError('Per favore, inserisci un username');
        resetLoadingState(button, buttonText, loader, loadingElement);
        return;
    }
  
    // Reset UI
    errorElement.classList.add('hidden');
    statsContainer.classList.add('hidden');
    setLoadingState(true, button, buttonText, loader, loadingElement);
  
    try {
        // Try to find a working node first
        if (!await findWorkingNode()) {
            throw new Error('Nessun nodo Hive disponibile');
        }

        console.log(`Using Hive node: ${getCurrentNode()}`);
        
        let allResults = [];
        let lastId = -1;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        let processedCount = 0;
        let isCurrentWeek = true; // Flag to track if we're still in current week
  
        while (isCurrentWeek) {
            buttonText.textContent = `Analisi in corso (${processedCount} operazioni)`;
            
            try {
                const accountHistory = await getAccountHistory(curator, lastId);
                if (accountHistory.length === 0) break;
        
                accountHistory.sort((a, b) => b[0] - a[0]);
                
                for (const entry of accountHistory) {
                    const [id, operation] = entry;
                    
                    if (operation.op[0] === 'curation_reward') {
                        const timestamp = new Date(operation.timestamp + 'Z');
                        
                        // Stop if we reach data older than a week
                        if (timestamp < oneWeekAgo) {
                            isCurrentWeek = false;
                            break;
                        }
        
                        const { author: comment_author, permlink: comment_permlink, reward: rewardAmount } = operation.op[1];
                        const postIdentifier = `@${comment_author}/${comment_permlink}`;
                        
                        try {
                            const { vote, content } = await getPostDetails(comment_author, comment_permlink);
                            
                            const voteDetails = vote.find(v => v.voter === curator);
        
                            if (voteDetails) {
                                const reward_vests = parseFloat(rewardAmount.split(' ')[0]);
                                const vote_weight = voteDetails.weight / 1000000000;
                                const percent = voteDetails.percent / 100;
                                const vote_time = new Date(voteDetails.time + 'Z');
                                const created_time = new Date(content.created + 'Z');
                                const voteAge = Math.floor((vote_time - created_time) / (1000 * 60)); // Convert to minutes
                                
                                const effective_reward_hp = await vestsToHive(reward_vests);
                                const estimate_reward = await vestsToHive(vote_weight);
                                const vote_weight_hp = estimate_reward * 2;
                                const efficiency = (effective_reward_hp / estimate_reward) * 100;
        
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
                                
                                if (processedCount % 10 === 0) {
                                    updateUI(allResults);
                                }
                            }
                        } catch (error) {
                            console.warn(`Errore nel processare il post ${postIdentifier}:`, error);
                            continue;
                        }
                    }
                    
                    lastId = id - 1;
                    if (lastId < 0) break;
                }
        
                // Break the loop if we've found entries older than a week
                if (!isCurrentWeek) break;
            } catch (error) {
                console.error('Errore durante il recupero della cronologia:', error);
                if (!await findWorkingNode()) {
                    throw new Error('Nessun nodo Hive disponibile');
                }
            }
        }
  
        if (allResults.length === 0) {
            showError('Nessuna curation reward trovata per l\'utente selezionato nell\'ultima settimana.');
        } else {
            updateUI(allResults);
        }
    } catch (error) {
        console.error(error);
        showError(error.message || 'Errore durante il calcolo dell\'efficienza.');
    } finally {
        resetLoadingState(button, buttonText, loader, loadingElement);
    }
}

// Modify API calls to handle node failures
async function retryWithFailover(apiCall) {
    for (let attempts = 0; attempts < HIVE_NODES.length; attempts++) {
        try {
            return await apiCall();
        } catch (error) {
            if (attempts < HIVE_NODES.length - 1) {
                console.warn(`API call failed, switching nodes...`);
                await switchToNextNode();
            } else {
                throw new Error('Tutti i nodi Hive sono irraggiungibili');
            }
        }
    }
}

export async function vestsToHive(vests) {
    return retryWithFailover(async () => {
        return new Promise((resolve, reject) => {
            hive.api.getDynamicGlobalProperties(function(err, result) {
                if (err) {
                    reject(err);
                    return;
                }
                const totalVests = parseFloat(result.total_vesting_shares.split(' ')[0]);
                const totalHive = parseFloat(result.total_vesting_fund_hive.split(' ')[0]);
                const hivePerVest = totalHive / totalVests;
                const hive = parseFloat(vests) * hivePerVest;
                resolve(hive);
            });
        });
    });
}