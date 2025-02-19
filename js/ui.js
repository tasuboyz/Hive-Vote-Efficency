import { formatVoteAge } from './utils.js';

export function initializeUI() {
    const curator = document.getElementById('curator');
    curator.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            calculateEfficiency();
        }
    });
}

export function showError(message) {
    const errorElement = document.getElementById('error');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}
  
export function resetLoadingState(button, buttonText, loader, loadingElement) {
    setLoadingState(false, button, buttonText, loader, loadingElement);
}

export function setLoadingState(isLoading, button, buttonText, loader, loadingElement) {
    button.disabled = isLoading;
    buttonText.textContent = isLoading ? 'Analisi...' : 'Analizza';
    loader.style.display = isLoading ? 'block' : 'none';
    
    if (isLoading) {
        loadingElement.classList.remove('hidden');
    } else {
        loadingElement.classList.add('hidden');
    }
}

export function updateUI(results, apr) {
    const statsContainer = document.getElementById('statsContainer');
    statsContainer.style.opacity = '0';
    statsContainer.classList.remove('hidden');
    statsContainer.offsetHeight;
    statsContainer.style.opacity = '1';
    
    updateStats(results, apr);
    updateTableContent(results);
}

function updateStats(results, apr) {
    const avgEfficiency = results.reduce((acc, cur) => acc + cur.efficiency, 0) / results.length;
    const bestVote = Math.max(...results.map(r => r.efficiency));
    const totalHP = results.reduce((acc, cur) => acc + cur.rewardHP, 0);

    document.getElementById('avgEfficiency').textContent = `${avgEfficiency.toFixed(2)}%`;
    document.getElementById('bestVote').textContent = `${bestVote.toFixed(2)}%`;
    document.getElementById('totalHP').textContent = `${totalHP.toFixed(4)} HP`;
    document.getElementById('votesAnalyzed').textContent = results.length;
    
    // Update APR stats
    const aprElement = document.querySelector('#aprStats p');
    if (aprElement) {
        aprElement.textContent = apr ? `${apr.toFixed(2)}%` : '-';
    }
}

export function updateTableContent(results) {
    const tbody = document.querySelector('#resultsTable tbody');
    tbody.innerHTML = '';
    
    results.forEach(result => {
      const date = new Date(result.time + 'Z');
      const giorno = String(date.getDate()).padStart(2, '0');
      const mese = String(date.getMonth() + 1).padStart(2, '0');
      const anno = date.getFullYear();
      const ore = String(date.getHours()).padStart(2, '0');
      const minuti = String(date.getMinutes()).padStart(2, '0');
      const formattedDate = `${giorno}/${mese}/${anno} ${ore}:${minuti}`;
  
      const postParts = result.post.split('/');
      const author = postParts[0].trim().replace(/\s+/g, ' ');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${author}</td>
        <td>
          <a href="https://hive.blog/${result.post}" target="_blank" class="post-link">
            <svg class="external-link" viewBox="0 0 24 24" width="14" height="14">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
            </svg>
          </a>
        </td>
        <td data-value="${result.rewardHP}">${result.rewardHP.toFixed(4)}</td>
        <td data-value="${result.voteValue}">${result.voteValue.toFixed(4)}</td>
        <td data-value="${result.expectedReward}">${result.expectedReward.toFixed(4)}</td>
        <td data-value="${result.efficiency}">${result.efficiency.toFixed(2)}%</td>
        <td data-value="${result.percent}">${result.percent.toFixed(2)}%</td>
        <td data-value="${date.getTime()}">${formattedDate}</td>
        <td data-value="${result.voteAge}">${formatVoteAge(result.voteAge)}</td>
      `;
      tbody.appendChild(row);
    });
  }