export function formatVoteAge(minutes) {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } else {
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor((minutes % 1440) / 60);
      return `${days}d ${hours}h`;
    }
} 

export function formatDate(date) {
    return date.toISOString().split('T')[0];
}

export function parseItalianDateTime(dateStr) {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/');
    const [hours, minutes] = timePart.split(':');
    return new Date(year, month - 1, day, hours, minutes);
}

export function getColumnValues(columnIndex) {
  const rows = document.querySelectorAll('#resultsTable tbody tr');
  return Array.from(rows).map(row => {
    const cell = row.cells[columnIndex];
    return cell.dataset.value || cell.textContent.trim();
  });
}

export function getUniqueValues(values) {
  return [...new Set(values)].sort((a, b) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.toString().localeCompare(b.toString());
  });
}

export function formatDateForInput(date) {
    const pad = (num) => String(num).padStart(2, '0');
    
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}