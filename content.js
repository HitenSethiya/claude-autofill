// Main content script that runs on webpages
const FORM_ELEMENTS = [
  'input[type="text"]', 
  'textarea', 
  '[contenteditable="true"]', 
  'input[type="search"]', 
  '.form-control',
  // Airtable specific selectors
  '.cell-input', 
  '.input', 
  '.cellContainer input',
  '.cellContainer textarea',
  // Additional common form selectors
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])',
  '[role="textbox"]',
  '.ProseMirror',
  '.ql-editor', // Quill editor
  '.CodeMirror', // CodeMirror editor
  '[data-slate-editor="true"]' // Slate editor
];
let activeElement = null;
let claudeButton = null;
let currentConversationUrl = null;
let isProcessing = false;

// Initialize when the page loads
init();

// Listen for custom events from site-specific handlers (like Airtable)
document.addEventListener('claude-airtable-request', async (event) => {
  const { element, question } = event.detail;
  
  try {
    // Store element for later use
    activeElement = element;
    
    // Get settings
    const settings = await chrome.storage.sync.get(['defaultProject', 'autoDetect']);
    
    // Use provided question or prompt for one
    let finalQuestion = question;
    if (!finalQuestion) {
      finalQuestion = await promptForQuestion();
    }
    
    if (!finalQuestion) {
      return; // User cancelled
    }
    
    // Show notification that we're processing
    showNotification('Asking Claude...');
    
    // Send question to Claude
    const response = await sendMessageToBackground({
      action: 'askClaude',
      question: finalQuestion,
      projectId: settings.defaultProject
    });
    
    if (response && response.answer) {
      // Send response back to the page through another custom event
      const responseEvent = new CustomEvent('claude-response-ready', {
        detail: {
          element: element,
          answer: response.answer
        }
      });
      document.dispatchEvent(responseEvent);
      
      // Also try to insert directly
      insertTextIntoElement(element, response.answer);
    } else {
      showNotification('Error getting response from Claude. Please try again.');
    }
  } catch (error) {
    console.error('Error processing Airtable request:', error);
    showNotification('Error: ' + (error.message || 'Could not get response from Claude'));
  }
});

function init() {
  // Add listeners to all form elements
  addFormElementListeners();
  
  // Create the Claude button element but don't attach it yet
  createClaudeButton();
  
  // Listen for document changes to catch dynamically added form elements
  observePageChanges();
  
  // Retry initialization after a delay to catch late-loaded elements
  setTimeout(retryInitialization, 1500);
  
  // Handle iframe content if present
  handleIframes();
  
  // Add document-level event listeners for focus events
  document.addEventListener('focusin', handleGlobalFocus, true);
}

function retryInitialization() {
  // This helps with apps like Airtable that load content dynamically
  addFormElementListeners();
  
  // Check for frames again
  handleIframes();
}

function handleIframes() {
  // Try to add listeners to iframe contents if accessible
  try {
    const frames = document.querySelectorAll('iframe');
    frames.forEach(frame => {
      try {
        if (frame.contentDocument) {
          // Add listeners to form elements inside the iframe
          frame.contentDocument.querySelectorAll(FORM_ELEMENTS.join(', ')).forEach(element => {
            if (!element.dataset.claudeInitialized) {
              element.dataset.claudeInitialized = 'true';
              element.addEventListener('focus', handleElementFocus);
              element.addEventListener('blur', handleElementBlur);
            }
          });
          
          // Observe iframe document changes
          const observer = new MutationObserver(() => {
            addFormElementListenersToIframe(frame);
          });
          
          observer.observe(frame.contentDocument.body, {
            childList: true,
            subtree: true
          });
        }
      } catch (e) {
        // Cross-origin iframe, can't access content
        console.log('Could not access iframe content:', e);
      }
    });
  } catch (e) {
    console.error('Error handling iframes:', e);
  }
}

function addFormElementListenersToIframe(frame) {
  try {
    if (frame.contentDocument) {
      frame.contentDocument.querySelectorAll(FORM_ELEMENTS.join(', ')).forEach(element => {
        if (!element.dataset.claudeInitialized) {
          element.dataset.claudeInitialized = 'true';
          element.addEventListener('focus', handleElementFocus);
          element.addEventListener('blur', handleElementBlur);
        }
      });
    }
  } catch (e) {
    // Cross-origin iframe access error, ignore
  }
}

function handleGlobalFocus(event) {
  // This helps catch focus events on elements that might not have direct listeners
  if (FORM_ELEMENTS.some(selector => event.target.matches(selector))) {
    handleElementFocus(event);
  }
}

function addFormElementListeners() {
  // Query all potential form elements
  document.querySelectorAll(FORM_ELEMENTS.join(', ')).forEach(element => {
    // Avoid adding multiple listeners
    if (!element.dataset.claudeInitialized) {
      element.dataset.claudeInitialized = 'true';
      element.addEventListener('focus', handleElementFocus);
      element.addEventListener('blur', handleElementBlur);
    }
  });
}

function observePageChanges() {
  // Create a MutationObserver to watch for new form elements being added
  const observer = new MutationObserver(mutations => {
    let shouldUpdate = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        shouldUpdate = true;
      }
    });
    
    if (shouldUpdate) {
      // Add listeners to any new form elements
      addFormElementListeners();
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function createClaudeButton() {
  // Create button if it doesn't exist
  if (!claudeButton) {
    claudeButton = document.createElement('button');
    claudeButton.className = 'claude-form-assistant-button';
    claudeButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.183 0-11.2-5.017-11.2-11.2S9.817 4.8 16 4.8 27.2 9.817 27.2 16 22.183 27.2 16 27.2z" fill="#6352d4"/>
        <path d="M19.6 12.4h-7.2c-.992 0-1.8.808-1.8 1.8v3.6c0 .992.808 1.8 1.8 1.8h7.2c.992 0 1.8-.808 1.8-1.8v-3.6c0-.992-.808-1.8-1.8-1.8zm0 5.4h-7.2v-3.6h7.2v3.6z" fill="#6352d4"/>
        <path d="M16 10.6c.662 0 1.2-.538 1.2-1.2V8.2c0-.662-.538-1.2-1.2-1.2s-1.2.538-1.2 1.2v1.2c0 .662.538 1.2 1.2 1.2zM16 21.4c-.662 0-1.2.538-1.2 1.2v1.2c0 .662.538 1.2 1.2 1.2s1.2-.538 1.2-1.2v-1.2c0-.662-.538-1.2-1.2-1.2zM23.8 16c0 .662.538 1.2 1.2 1.2h1.2c.662 0 1.2-.538 1.2-1.2s-.538-1.2-1.2-1.2H25c-.662 0-1.2.538-1.2 1.2zM8.2 14.8H7c-.662 0-1.2.538-1.2 1.2s.538 1.2 1.2 1.2h1.2c.662 0 1.2-.538 1.2-1.2s-.538-1.2-1.2-1.2z" fill="#6352d4"/>
      </svg>
      <div class="claude-button-processing-spinner hidden"></div>
    `;
    claudeButton.title = 'Ask Claude to complete this field';
    claudeButton.addEventListener('click', handleClaudeButtonClick);
    document.body.appendChild(claudeButton);
    
    // Add styles for processing state if not already present
    if (!document.querySelector('#claude-form-assistant-styles')) {
      const style = document.createElement('style');
      style.id = 'claude-form-assistant-styles';
      style.textContent = `
        .claude-form-assistant-button.processing {
          background-color: #f0edff !important;
        }
        .claude-form-assistant-button.processing svg {
          opacity: 0.5;
        }
        .claude-button-processing-spinner {
          position: absolute;
          width: 16px;
          height: 16px;
          border: 2px solid #6352d4;
          border-top: 2px solid transparent;
          border-radius: 50%;
          animation: claude-spin 1s linear infinite;
        }
        .claude-button-processing-spinner.hidden {
          display: none;
        }
        @keyframes claude-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

function handleElementFocus(event) {
  activeElement = event.target;
  
  // Position the Claude button near the active element
  positionClaudeButton(activeElement);
}

function handleElementBlur(event) {
  // Small delay to allow for clicking the Claude button
  setTimeout(() => {
    // Check if the new active element is the Claude button itself
    if (document.activeElement !== claudeButton) {
      hideClaudeButton();
    }
  }, 100);
}

function positionClaudeButton(element) {
  if (!claudeButton || !element) return;
  
  const rect = element.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // Get the computed style of the element
  const computedStyle = window.getComputedStyle(element);
  
  // Calculate the best position (right side by default, but adjust if needed)
  let leftPos, topPos;
  
  // Find the containing element that has positioning
  let container = element.closest('.cellContainer, .cell, .form-group, .formField, [style*="position"], div');
  let containerRect = container ? container.getBoundingClientRect() : rect;
  
  // Check if there's enough space on the right
  if (rect.right + 40 < window.innerWidth) {
    // Position on the right side of the element
    leftPos = (rect.right + scrollLeft + 10) + 'px';
    topPos = (rect.top + scrollTop + rect.height / 2 - 15) + 'px';
  } else {
    // Not enough space on right, try above the element
    leftPos = (rect.left + scrollLeft + rect.width / 2 - 15) + 'px';
    topPos = (rect.top + scrollTop - 40) + 'px';
  }
  
  // Check for Airtable cell container
  if (element.closest('.cellContainer') || element.closest('[data-component="TableCellEditor"]')) {
    // For Airtable, position inside the cell on the right side
    const cell = element.closest('.cellContainer') || element.closest('[data-component="TableCellEditor"]');
    if (cell) {
      const cellRect = cell.getBoundingClientRect();
      leftPos = (cellRect.right + scrollLeft - 35) + 'px';
      topPos = (cellRect.top + scrollTop + 10) + 'px';
    }
  }
  
  // Apply the position
  claudeButton.style.left = leftPos;
  claudeButton.style.top = topPos;
  claudeButton.style.display = 'flex';
  
  // Make sure the button is visible in the viewport
  setTimeout(() => {
    const buttonRect = claudeButton.getBoundingClientRect();
    
    // If button is outside viewport, adjust position
    if (buttonRect.right > window.innerWidth) {
      claudeButton.style.left = (window.innerWidth - buttonRect.width - 10 + scrollLeft) + 'px';
    }
    if (buttonRect.bottom > window.innerHeight) {
      claudeButton.style.top = (window.innerHeight - buttonRect.height - 10 + scrollTop) + 'px';
    }
    if (buttonRect.left < 0) {
      claudeButton.style.left = (scrollLeft + 10) + 'px';
    }
    if (buttonRect.top < 0) {
      claudeButton.style.top = (scrollTop + 10) + 'px';
    }
  }, 0);
}

function hideClaudeButton() {
  if (claudeButton) {
    claudeButton.style.display = 'none';
  }
}

async function handleClaudeButtonClick() {
  // If already processing and we have a conversation URL, open that conversation
  if (isProcessing && currentConversationUrl) {
    window.open(currentConversationUrl, '_blank');
    return;
  }
  
  if (!activeElement) return;
  
  try {
    // Show processing state
    isProcessing = true;
    claudeButton.classList.add('processing');
    const spinner = claudeButton.querySelector('.claude-button-processing-spinner');
    spinner.classList.remove('hidden');
    claudeButton.title = 'Click to open conversation in Claude';
    
    // Get settings
    const settings = await chrome.storage.sync.get(['defaultProject', 'autoDetect']);
    
    // Get the question/prompt
    let question = '';
    
    if (settings.autoDetect) {
      // Try to detect the question from the form
      question = await detectFormQuestion(activeElement);
    }
    
    // If no question detected or auto-detect is off, ask the user
    if (!question) {
      question = await promptForQuestion();
    }
    
    if (!question) {
      // Reset processing state
      isProcessing = false;
      claudeButton.classList.remove('processing');
      spinner.classList.add('hidden');
      claudeButton.title = 'Ask Claude to complete this field';
      currentConversationUrl = null;
      return; // User cancelled
    }
    
    // Send the question to Claude via background script
    const response = await sendMessageToBackground({
      action: 'askClaude',
      question: question,
      projectId: settings.defaultProject
    });
    
    if (response && response.answer) {
      // Store the conversation URL for potential opening
      if (response.chatUrl) {
        currentConversationUrl = response.chatUrl;
      }
      
      // Insert the answer into the active element
      insertTextIntoElement(activeElement, response.answer);
      
      // Show success notification
      showNotification('Claude has filled the field successfully!');
    } else {
      showNotification('Error getting response from Claude. Please try again.');
    }
  } catch (error) {
    console.error('Error getting Claude response:', error);
    showNotification('Error: ' + (error.message || 'Could not get response from Claude'));
  } finally {
    // Reset processing state
    isProcessing = false;
    claudeButton.classList.remove('processing');
    const spinner = claudeButton.querySelector('.claude-button-processing-spinner');
    spinner.classList.add('hidden');
    claudeButton.title = 'Ask Claude to complete this field';
    
    // Clear conversation URL after a delay
    setTimeout(() => {
      currentConversationUrl = null;
    }, 10000); // Keep the URL for 10 seconds after processing completes
  }
}

async function detectFormQuestion(element) {
  // Look for labels or placeholders associated with the form element
  let question = '';
  
  // Check for label with 'for' attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label && label.textContent.trim()) {
      question = label.textContent.trim();
    }
  }
  
  // Check for placeholder attribute
  if (!question && element.placeholder) {
    question = element.placeholder;
  }
  
  // Check for aria-label attribute
  if (!question && element.getAttribute('aria-label')) {
    question = element.getAttribute('aria-label');
  }
  
  // Look for nearby labels (parent or previous sibling)
  if (!question) {
    // Check parent elements for label text
    let parent = element.parentElement;
    while (parent && !question) {
      const labelElement = parent.querySelector('label, .label, .form-label, h1, h2, h3, h4, h5, h6');
      if (labelElement && labelElement.textContent.trim()) {
        question = labelElement.textContent.trim();
        break;
      }
      parent = parent.parentElement;
      // Limit search depth
      if (parent === document.body) break;
    }
  }
  
  // Look for previous sibling or element that might contain a label
  if (!question) {
    let prevElement = element.previousElementSibling;
    while (prevElement && !question) {
      if (prevElement.textContent.trim()) {
        question = prevElement.textContent.trim();
        break;
      }
      prevElement = prevElement.previousElementSibling;
    }
  }
  
  // For contentEditable elements, check for surrounding context
  if (!question && element.getAttribute('contenteditable') === 'true') {
    // Look for headings or prompt text above the editable area
    const container = element.closest('div, section, article');
    if (container) {
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6, .prompt, .question');
      if (headings.length > 0) {
        question = headings[0].textContent.trim();
      }
    }
  }
  
  return question;
}

async function promptForQuestion() {
  return new Promise(resolve => {
    // Create a modal to ask for the question
    const modal = document.createElement('div');
    modal.className = 'claude-form-assistant-modal';
    modal.innerHTML = `
      <div class="claude-form-assistant-modal-content">
        <h3>Enter your question for Claude</h3>
        <textarea placeholder="What would you like Claude to help with?" rows="4"></textarea>
        <div class="claude-form-assistant-modal-buttons">
          <button class="claude-form-assistant-cancel-button">Cancel</button>
          <button class="claude-form-assistant-submit-button">Submit</button>
        </div>
      </div>
    `;
    
    // Add the modal to the page
    document.body.appendChild(modal);
    
    // Focus the textarea
    const textarea = modal.querySelector('textarea');
    textarea.focus();
    
    // Handle cancel button
    const cancelButton = modal.querySelector('.claude-form-assistant-cancel-button');
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(modal);
      resolve('');
    });
    
    // Handle submit button
    const submitButton = modal.querySelector('.claude-form-assistant-submit-button');
    submitButton.addEventListener('click', () => {
      const question = textarea.value.trim();
      document.body.removeChild(modal);
      resolve(question);
    });
    
    // Handle Enter key in textarea
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const question = textarea.value.trim();
        document.body.removeChild(modal);
        resolve(question);
      }
    });
  });
}

function insertTextIntoElement(element, text) {
  if (!element) return;
  
  // Handle different types of elements
  if (element.tagName === 'TEXTAREA' || 
      (element.tagName === 'INPUT' && element.type === 'text')) {
    // For textarea and text inputs
    element.value = text;
    
    // Trigger input event to notify any listeners
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    
    // Focus the element
    element.focus();
  } else if (element.getAttribute('contenteditable') === 'true') {
    // For contenteditable elements
    element.innerHTML = text;
    
    // Trigger input event
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
    
    // Focus and place cursor at the end
    element.focus();
    
    // Set cursor position to end
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'claude-form-assistant-notification';
  notification.textContent = message;
  
  // Add styles for notification if not already present
  if (!document.querySelector('#claude-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'claude-notification-styles';
    style.textContent = `
      .claude-form-assistant-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #f0edff;
        color: #6352d4;
        border: 1px solid #6352d4;
        padding: 10px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        animation: claude-notification-fade 0.3s ease-in-out;
      }
      
      @keyframes claude-notification-fade {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove notification after a few seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';
      notification.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      setTimeout(() => {
        if (notification.parentElement) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  }, 3000);
}

async function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}