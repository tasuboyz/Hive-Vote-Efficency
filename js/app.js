import { initializeUI, updateUI } from './ui.js';
import { initializeSorting } from './sorting.js';
import { initializeFiltering } from './filters.js';
import { calculateEfficiency } from './hiveApi.js';

document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  initializeSorting();
  initializeFiltering();
});

window.calculateEfficiency = calculateEfficiency;