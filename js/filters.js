import { getColumnValues, getUniqueValues, parseItalianDateTime, formatDateForInput } from './utils.js';
import { sortTable } from './sorting.js';

export let activeFilters = {};

export function initializeFiltering() {
    const table = document.getElementById('resultsTable');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    
    headers.forEach((header, index) => {
        if (index !== 1) { // Skip the "Post" column
            // Clean up the text content
            const originalText = header.textContent.replace(/\s+/g, ' ').trim();
            const headerContent = document.createElement('div');
            headerContent.className = 'column-header';
            
            // Create sort container
            const sortContainer = document.createElement('div');
            sortContainer.className = 'text-sort-container';
            sortContainer.innerHTML = `
                <span data-column-name="${originalText}">${originalText}</span>
                <span class="sort-icon">↕</span>
            `;
            
            // Create filter icon
            const filterIcon = document.createElement('div');
            filterIcon.className = 'filter-icon';
            filterIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
            `;
            
            // Add click events
            filterIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                showFilterPopup(header, index);
            });

            headerContent.appendChild(sortContainer);
            headerContent.appendChild(filterIcon);
            
            // Clear header and add new content
            header.innerHTML = '';
            header.appendChild(headerContent);
            header.classList.add('sortable');
        }
    });
}
  
function createDateFilterPopup(now, oneWeekAgo, formatDateForInput) {
    return `
        <div class="filter-header">
            <h3>Filtra per Data</h3>
        </div>
        <div class="date-filter-content">
            <div class="date-range">
                <label>Da:</label>
                <input type="text" id="dateFrom" class="date-input" 
                       value="${formatDateForInput(oneWeekAgo)}" readonly>
            </div>
            <div class="date-range">
                <label>A:</label>
                <input type="text" id="dateTo" class="date-input" 
                       value="${formatDateForInput(now)}" readonly>
            </div>
            <div class="quick-filters">
                <button data-period="today">Oggi</button>
                <button data-period="yesterday">Ieri</button>
                <button data-period="week">Questa Settimana</button>
                <button data-period="custom">Personalizza</button>
            </div>
            <div class="filter-actions">
                <button class="apply">Applica</button>
                <button class="reset">Reset</button>
            </div>
        </div>
    `;
}

function createRegularFilterPopup(uniqueValues, currentFilters) {
    return `
        <div class="filter-header">
            <input type="text" class="filter-search" placeholder="Cerca valori...">
            <div class="select-options">
                <button class="select-all">Seleziona tutti</button>
                <button class="deselect-all">Deseleziona tutti</button>
            </div>
        </div>
        <div class="filter-options">
            ${uniqueValues.map(value => `
                <div class="filter-option">
                    <label>
                        <input type="checkbox" value="${value}" 
                            ${!currentFilters.length || currentFilters.includes(value) ? 'checked' : ''}>
                        <span>${value}</span>
                    </label>
                </div>
            `).join('')}
        </div>
        <div class="filter-actions">
            <button class="cancel">Annulla</button>
            <button class="apply">Applica</button>
        </div>
    `;
}

function setupDateFilterEvents(popup, columnIndex) {
    setupQuickFilters(popup);
    setupDateFilterActions(popup, columnIndex);
}

function setupQuickFilters(popup) {
    popup.querySelectorAll('.quick-filters button').forEach(button => {
        button.addEventListener('click', () => {
            const period = button.dataset.period;
            const now = new Date();
            let fromDate = new Date();
            
            switch(period) {
                case 'today':
                    fromDate.setHours(0,0,0,0);
                    break;
                case 'yesterday':
                    fromDate.setDate(fromDate.getDate() - 1);
                    fromDate.setHours(0,0,0,0);
                    now.setDate(now.getDate() - 1);
                    now.setHours(23,59,59,999);
                    break;
                case 'week':
                    fromDate.setDate(fromDate.getDate() - 7);
                    break;
                case 'custom':
                    document.getElementById('dateFrom').readOnly = false;
                    document.getElementById('dateTo').readOnly = false;
                    return;
            }
            
            document.getElementById('dateFrom').value = formatDateForInput(fromDate);
            document.getElementById('dateTo').value = formatDateForInput(now);
        });
    });
}

function setupDateFilterActions(popup, columnIndex) {
    // Handle Apply button click
    popup.querySelector('.apply').addEventListener('click', () => {
        const fromDate = parseItalianDateTime(document.getElementById('dateFrom').value);
        const toDate = parseItalianDateTime(document.getElementById('dateTo').value);
        
        // Set the active filter for this column
        activeFilters[columnIndex] = (value) => {
            const rowDate = new Date(value);
            return rowDate >= fromDate && rowDate <= toDate;
        };
        
        // Update UI to show active filter
        const filterIcon = document.querySelector(`th:nth-child(${columnIndex + 1}) .filter-icon`);
        if (filterIcon) {
            filterIcon.classList.add('active');
        }
        
        // Apply all active filters and update stats
        applyAllFilters();
        updateFilteredStats();
        popup.remove();
    });

    // Handle Reset button click
    popup.querySelector('.reset').addEventListener('click', () => {
        // Remove the filter for this column
        delete activeFilters[columnIndex];
        
        // Reset UI
        const filterIcon = document.querySelector(`th:nth-child(${columnIndex + 1}) .filter-icon`);
        if (filterIcon) {
            filterIcon.classList.remove('active');
        }
        
        // Reset date inputs to default values
        const now = new Date();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        document.getElementById('dateFrom').value = formatDateForInput(oneWeekAgo);
        document.getElementById('dateTo').value = formatDateForInput(now);
        
        // Apply remaining filters and update stats
        applyAllFilters();
        updateFilteredStats();
        popup.remove();
    });
}

function setupRegularFilterEvents(popup, header, columnIndex) {
    const searchInput = popup.querySelector('.filter-search');
    searchInput.addEventListener('input', () => filterOptions(popup, searchInput.value));

    popup.querySelector('.select-all').addEventListener('click', () => {
        popup.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => cb.checked = true);
    });

    popup.querySelector('.deselect-all').addEventListener('click', () => {
        popup.querySelectorAll('.filter-option input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    popup.querySelector('.cancel').addEventListener('click', () => popup.remove());
    popup.querySelector('.apply').addEventListener('click', () => {
        applyFilter(columnIndex, popup);
        popup.remove();
    });

    setupOutsideClickHandler(popup, header);
}

function setupOutsideClickHandler(popup, header) {
    const handleOutsideClick = (event) => {
        // Check if click is outside both popup and header
        if (!popup.contains(event.target) && !header.contains(event.target)) {
            popup.remove();
            document.removeEventListener('mousedown', handleOutsideClick);
        }
    };

    // Add event listener with a slight delay to avoid immediate trigger
    setTimeout(() => {
        document.addEventListener('mousedown', handleOutsideClick);
    }, 0);

    // Clean up event listener when popup is removed
    popup.addEventListener('remove', () => {
        document.removeEventListener('mousedown', handleOutsideClick);
    });
}

export function showFilterPopup(header, columnIndex) {
    const existingPopup = document.querySelector('.filter-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.className = 'filter-popup show';

    const t = header.querySelector('[data-column-name]')?.getAttribute('data-column-name') || 
                      header.textContent.split('↕')[0].trim();
    const headerText = t.split('↕')[0].trim();
    
    // Add sorting controls to top of popup
    const sortingControls = document.createElement('div');
    sortingControls.className = 'sorting-controls';
    sortingControls.innerHTML = `
        <div class="sort-buttons">
            <button class="sort-asc">Crescente ↑</button>
            <button class="sort-desc">Decrescente ↓</button>
        </div>
    `;
    
    popup.appendChild(sortingControls);
    
    // Add divider
    const divider = document.createElement('div');
    divider.className = 'popup-divider';
    popup.appendChild(divider);
    
    // Continue with existing filter content
    const filterContent = document.createElement('div');
    
    if (headerText === 'Data') {
        const now = new Date();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        filterContent.innerHTML = createDateFilterPopup(now, oneWeekAgo, formatDateForInput);
        popup.appendChild(filterContent);
        setupDateFilterEvents(popup, columnIndex);
    } else {
        const values = getColumnValues(columnIndex);
        const uniqueValues = getUniqueValues(values);
        const currentFilters = activeFilters[columnIndex] || [];
        
        filterContent.innerHTML = createRegularFilterPopup(uniqueValues, currentFilters);
        popup.appendChild(filterContent);
        setupRegularFilterEvents(popup, header, columnIndex);
    }

    // Add sorting event handlers
    const sortAscButton = popup.querySelector('.sort-asc');
    const sortDescButton = popup.querySelector('.sort-desc');
    
    if (sortAscButton && sortDescButton) {
        sortAscButton.addEventListener('click', () => {
            const headerCells = document.querySelectorAll('#resultsTable th');
            headerCells.forEach(cell => {
                cell.classList.remove('sort-asc', 'sort-desc');
            });
            header.classList.add('sort-asc');
            header.classList.remove('sort-desc');
            
            if (window.currentResults) {
                sortTable(columnIndex, true);
                popup.remove();
            }
        });
        
        sortDescButton.addEventListener('click', () => {
            const headerCells = document.querySelectorAll('#resultsTable th');
            headerCells.forEach(cell => {
                cell.classList.remove('sort-asc', 'sort-desc');
            });
            header.classList.add('sort-desc');
            header.classList.remove('sort-asc');
            
            if (window.currentResults) {
                sortTable(columnIndex, false);
                popup.remove();
            }
        });
    }

    // Position the popup
    const headerRect = header.getBoundingClientRect();
    popup.style.top = `${headerRect.bottom + window.scrollY}px`;
    popup.style.left = `${headerRect.left + window.scrollX}px`;

    document.body.appendChild(popup);
}

export function filterOptions(popup, searchText) {
    const options = popup.querySelectorAll('.filter-option');
    const searchLower = searchText.toLowerCase();
    
    options.forEach(option => {
      const text = option.querySelector('span').textContent.toLowerCase();
      option.style.display = text.includes(searchLower) ? '' : 'none';
    });
  }
  
export function applyFilter(columnIndex, popup) {
    const checkedValues = Array.from(popup.querySelectorAll('.filter-option input:checked'))
      .map(input => input.value);
    
    const allValues = Array.from(popup.querySelectorAll('.filter-option input'))
      .map(input => input.value);
  
    if (checkedValues.length === allValues.length) {
      delete activeFilters[columnIndex];
      document.querySelectorAll('#resultsTable th')[columnIndex]
        .classList.remove('active-filter');
    } else {
      activeFilters[columnIndex] = checkedValues;
      document.querySelectorAll('#resultsTable th')[columnIndex]
        .classList.add('active-filter');
    }
  
    applyAllFilters();
  }
  
export function applyAllFilters() {
    const rows = document.querySelectorAll('#resultsTable tbody tr');
    rows.forEach(row => {
      let showRow = true;
      
      for (const [columnIndex, allowedValues] of Object.entries(activeFilters)) {
        const cell = row.cells[columnIndex];
        const cellValue = cell.dataset.value || cell.textContent.trim();
        if (!allowedValues.includes(cellValue)) {
          showRow = false;
          break;
        }
      }
      
      row.style.display = showRow ? '' : 'none';
    });
  
    updateFilteredStats();
  }
  
export function updateFilteredStats() {
    const visibleRows = Array.from(document.querySelectorAll('#resultsTable tbody tr'))
      .filter(row => row.style.display !== 'none');
  
    const stats = {
      avgEfficiency: 0,
      bestVote: 0,
      totalHP: 0,
      count: visibleRows.length
    };
  
    visibleRows.forEach(row => {
      const efficiency = parseFloat(row.cells[5].textContent);
      const rewardHP = parseFloat(row.cells[2].textContent);
      
      stats.avgEfficiency += efficiency;
      stats.bestVote = Math.max(stats.bestVote, efficiency);
      stats.totalHP += rewardHP;
    });
  
    stats.avgEfficiency /= stats.count || 1;
  
    document.getElementById('avgEfficiency').textContent = `${stats.avgEfficiency.toFixed(2)}%`;
    document.getElementById('bestVote').textContent = `${stats.bestVote.toFixed(2)}%`;
    document.getElementById('totalHP').textContent = `${stats.totalHP.toFixed(4)} HP`;
    document.getElementById('votesAnalyzed').textContent = stats.count;
  }