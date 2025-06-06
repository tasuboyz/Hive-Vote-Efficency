import { showError, setLoadingState, updateUI, resetLoadingState } from './ui.js';
import curationCalculator from './curationCalculator.js';

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
        buttonText.textContent = 'Analisi in corso...';
        
        // Utilizza il nuovo modulo CurationCalculator
        const result = await curationCalculator.calculateCurationEfficiency(curator, 7);
        
        if (!result || result.results.length === 0) {
            showError('Nessuna curation reward trovata per l\'utente selezionato nell\'ultima settimana.');
            return;
        }

        const { results, apr } = result;
        
        window.currentResults = results;  // Keep as array
        window.currentApr = apr.toFixed(2);  // Store APR separately
        
        // Update UI with APR
        updateUI(results, apr);
        const event = new Event('resultsAvailable');
        document.dispatchEvent(event);
    } catch (error) {
        console.error(error);
        showError(error.message || 'Errore durante il calcolo dell\'efficienza.');
    } finally {
        resetLoadingState(button, buttonText, loader, loadingElement);
    }
}
