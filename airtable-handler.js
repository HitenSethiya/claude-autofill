// Special handling for Airtable forms and tables
(function() {
  // Only run this script on Airtable domains
  if (!window.location.hostname.includes('airtable.com')) {
    return;
  }
  
  console.log('Claude Form Assistant: Airtable handler active');
  
  // Inject specific styles for Airtable
  const style = document.createElement('style');
  style.textContent = `
    .claude-airtable-button {
      position: absolute;
      right: 10px;
      top: 10px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: white;
      border: 1px solid #e0e0e0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      opacity: 0.9;
      transition: opacity 0.2s;
    }
    
    .claude-airtable-button:hover {
      opacity: 1;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    
    .airtable-cell-focused .claude-airtable-button {
      display: flex !important;
    }
  `;
  document.head.appendChild(style);
  
  // Create a MutationObserver to watch for cell activations
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      // Check for added nodes
      if (mutation.addedNodes.length > 0) {
        // Look for cell editors and grid cells
        document.querySelectorAll('.cellContainer, [data-component="TableCellEditor"], .cell').forEach(cell => {
          if (!cell.querySelector('.claude-airtable-button')) {
            addButtonToCell(cell);
          }
        });
      }
      
      // Check for class changes (for focused cells)
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('focus') || 
            target.classList.contains('focused') || 
            target.classList.contains('active') ||
            target.getAttribute('data-focus') === 'true') {
          
          if (target.classList.contains('cellContainer') || 
              target.hasAttribute('data-component') || 
              target.classList.contains('cell')) {
            
            if (!target.querySelector('.claude-airtable-button')) {
              addButtonToCell(target);
            }
          }
        }
      }
    });
  });
  
  // Start observing the document
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-focus']
  });
  
  // Also check periodically for active cells
  setInterval(() => {
    document.querySelectorAll('.cellContainer.focus, [data-component="TableCellEditor"], .cell.focus, .cell.active').forEach(cell => {
      if (!cell.querySelector('.claude-airtable-button')) {
        addButtonToCell(cell);
      }
    });
  }, 1000);
  
  function addButtonToCell(cell) {
    // Create button if it doesn't exist for this cell
    const button = document.createElement('button');
    button.className = 'claude-airtable-button';
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.183 0-11.2-5.017-11.2-11.2S9.817 4.8 16 4.8 27.2 9.817 27.2 16 22.183 27.2 16 27.2z" fill="#6352d4"/>
        <path d="M19.6 12.4h-7.2c-.992 0-1.8.808-1.8 1.8v3.6c0 .992.808 1.8 1.8 1.8h7.2c.992 0 1.8-.808 1.8-1.8v-3.6c0-.992-.808-1.8-1.8-1.8zm0 5.4h-7.2v-3.6h7.2v3.6z" fill="#6352d4"/>
        <path d="M16 10.6c.662 0 1.2-.538 1.2-1.2V8.2c0-.662-.538-1.2-1.2-1.2s-1.2.538-1.2 1.2v1.2c0 .662.538 1.2 1.2 1.2zM16 21.4c-.662 0-1.2.538-1.2 1.2v1.2c0 .662.538 1.2 1.2 1.2s1.2-.538 1.2-1.2v-1.2c0-.662-.538-1.2-1.2-1.2z" fill="#6352d4"/>
      </svg>
    `;
    button.title = 'Ask Claude to complete this field';
    
    // Find the input/textarea element within the cell
    const input = cell.querySelector('input, textarea, [contenteditable="true"]');
    
    // Add click event for the button
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Find the question/prompt for this cell
      let question = '';
      
      // Look for a header
      const table = cell.closest('.tableContainer, .viewContainer');
      if (table) {
        // Try to get column header
        const cellIndex = [...cell.parentElement.children].indexOf(cell);
        const header = table.querySelector(`.headerCell:nth-child(${cellIndex + 1}), .header-cell:nth-child(${cellIndex + 1})`);
        if (header) {
          question = header.textContent.trim();
        }
      }
      
      // If no question found, look for field name or label
      if (!question) {
        const fieldName = cell.closest('[data-field-name]');
        if (fieldName) {
          question = fieldName.getAttribute('data-field-name');
        }
      }
      
      // Dispatch a custom event that our content script can listen for
      const event = new CustomEvent('claude-airtable-request', {
        detail: {
          element: input,
          question: question
        }
      });
      document.dispatchEvent(event);
    });
    
    // Add button to cell
    cell.style.position = 'relative';
    cell.appendChild(button);
  }
  
  // Listen for the event from our content script
  document.addEventListener('claude-response-ready', (event) => {
    const { element, answer } = event.detail;
    
    if (element && answer) {
      // Set the value for the input
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = answer;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.hasAttribute('contenteditable')) {
        element.innerHTML = answer;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
})();