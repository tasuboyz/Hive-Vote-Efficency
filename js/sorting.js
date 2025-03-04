import { updateTableContent } from './ui.js';
import { showFilterPopup } from './filters.js';

export function initializeSorting() {
    const table = document.getElementById('resultsTable');
    if (!table) {
        console.error('Table not found');
        return;
    }

    const headers = table.querySelectorAll('th');
    console.log('Headers found:', headers);

    headers.forEach((header, index) => {
        if (index !== 1) { // Skip the "Post" column
            const headerText = header.textContent;
            const columnHeader = document.createElement('div');
            columnHeader.className = 'column-header';

            // Create text and sort container
            const textAndSortContainer = document.createElement('div');
            textAndSortContainer.className = 'text-sort-container';
            textAndSortContainer.innerHTML = `
                <span>${headerText}</span>
            `;

            // Create filter icon
            const filterIcon = document.createElement('div');
            filterIcon.className = 'filter-icon';
            filterIcon.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M4 4h16c.55 0 1 .45 1 1v.88c0 .27-.11.52-.29.71L14 13.59V19c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-5.41L3.29 6.59c-.18-.19-.29-.44-.29-.71V5c0-.55.45-1 1-1z"/>
                </svg>
            `;

            columnHeader.appendChild(textAndSortContainer);
            columnHeader.appendChild(filterIcon);

            // Add click events
            textAndSortContainer.addEventListener('click', () => {
                console.log(`Header clicked: ${headerText}`);
                const headerCells = table.querySelectorAll('th');
                headerCells.forEach(cell => {
                    if (cell !== header) {
                        cell.classList.remove('sort-asc', 'sort-desc');
                    }
                });

                const isAsc = header.classList.toggle('sort-asc');
                header.classList.remove('sort-desc');

                if (!isAsc) {
                    header.classList.remove('sort-asc');
                    header.classList.add('sort-desc');
                }

                console.log(`Sorting column: ${index}, Ascending: ${isAsc}`);
                if (window.currentResults) {
                    sortTable(index, isAsc);
                } else {
                    console.log('Results not available yet, setting up listener');
                    document.addEventListener('resultsAvailable', () => {
                        sortTable(index, isAsc);
                    }, { once: true });
                }
            });

            filterIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                showFilterPopup(header, index);
            });

            header.innerHTML = '';
            header.appendChild(columnHeader);
        }
    });
}

export function sortTable(column, asc) {
    // The structure is { 0: {...}, 1: {...}, ..., apr: "12.34" }
    // We need to extract just the array portion
    const resultsObj = window.currentResults;
    
    // Create a proper array from the object, excluding non-numeric keys
    const results = [];
    for (const key in resultsObj) {
        if (!isNaN(key) && typeof resultsObj[key] === 'object') {
            results.push(resultsObj[key]);
        }
    }
    
    const sortingMap = {
        0: 'post',
        2: 'rewardHP',
        3: 'voteValue',
        4: 'expectedReward',
        5: 'efficiency',
        6: 'percent',
        7: 'time',
        8: 'voteAge'
    };

    const key = sortingMap[column];

    results.sort((a, b) => {
        let valueA, valueB;

        if (column === 0) {
            valueA = a.post.split('/')[0].toLowerCase();
            valueB = b.post.split('/')[0].toLowerCase();
        } else {
            valueA = a[key];
            valueB = b[key];
        }

        if (typeof valueA === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
        }

        if (valueA < valueB) return asc ? -1 : 1;
        if (valueA > valueB) return asc ? 1 : -1;
        return 0;
    });

    console.log('Table sorted:', results);
    updateTableContent(results);
}
