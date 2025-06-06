import { initializeUI, updateUI } from './ui.js';
import { initializeSorting } from './sorting.js';
import { initializeFiltering } from './filters.js';
import { calculateEfficiency } from './hiveApi.js';

/**
 * Inizializza l'applicazione al caricamento del DOM
 * Questa funzione configura gli elementi dell'interfaccia utente
 * e imposta i gestori degli eventi necessari
 */
document.addEventListener('DOMContentLoaded', () => {
  // Inizializza i componenti UI
  initializeUI();
  
  // Configura le funzionalità di ordinamento tabella
  initializeSorting();
  
  // Configura i filtri per la tabella dei risultati
  initializeFiltering();
  
  console.log('Analizzatore Efficienza Curation - Applicazione inizializzata');
});

// Esponi la funzione calculateEfficiency come proprietà globale
window.calculateEfficiency = calculateEfficiency;