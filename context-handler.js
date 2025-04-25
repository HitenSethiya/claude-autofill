// Functions to handle capturing page context and creating enhanced prompts

/**
 * Captures the current webpage context using various methods
 * @returns {Promise<string>} The captured context as text
 */
async function capturePageContext() {
  try {
    // Capture basic page information
    const basicInfo = `# ${document.title}\nURL: ${window.location.href}\n\n`;
    
    // Try to take a screenshot of the current page
    try {
      const screenshotData = await captureScreenshot();
      
      // If we got a screenshot, return it with basic info
      if (screenshotData) {
        return {
          textContext: basicInfo + extractFormLabelsAndContext(),
          screenshotData: screenshotData
        };
      }
    } catch (screenshotError) {
      console.error('Error capturing screenshot:', screenshotError);
    }
    
    // Fallback to just text capture if screenshot fails
    return {
      textContext: basicInfo + captureDirectPageContent(),
      screenshotData: null
    };
  } catch (error) {
    console.error('Error capturing page context:', error);
    // Return minimal context if everything fails
    return {
      textContext: `# ${document.title}\nURL: ${window.location.href}`,
      screenshotData: null
    };
  }
}

/**
 * Captures a screenshot of the current tab
 * @returns {Promise<string>} Base64 encoded screenshot data
 */
async function captureScreenshot() {
  return new Promise((resolve, reject) => {
    // Send message to the background script to capture the screenshot
    chrome.runtime.sendMessage(
      { action: 'captureScreenshot' },
      response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (response && response.screenshotData) {
          resolve(response.screenshotData);
        } else {
          reject(new Error('Failed to capture screenshot'));
        }
      }
    );
  });
}

/**
 * Extracts form labels and relevant context around the active element
 * @returns {string} Text description of form context
 */
function extractFormLabelsAndContext() {
  try {
    let contextText = "## Form Context\n";
    
    // Look for the form containing the active element
    const formElement = activeElement ? activeElement.closest('form') : null;
    
    if (formElement) {
      // Get form title or name if available
      const formTitle = formElement.getAttribute('aria-label') || 
                        formElement.getAttribute('name') || 
                        formElement.getAttribute('id') || 
                        'Form';
      
      contextText += `Form: ${formTitle}\n\n`;
      
      // Get all labels in the form
      const labels = formElement.querySelectorAll('label, .form-label, .label');
      
      if (labels.length > 0) {
        contextText += "Form fields:\n";
        labels.forEach(label => {
          const labelText = label.textContent.trim();
          if (labelText) {
            contextText += `- ${labelText}\n`;
          }
        });
        contextText += "\n";
      }
      
      // Get heading elements that might provide context
      const headings = formElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headings.length > 0) {
        contextText += "Form headings:\n";
        headings.forEach(heading => {
          contextText += `- ${heading.textContent.trim()}\n`;
        });
        contextText += "\n";
      }
    } else {
      // If no form is found, try to get context around the active element
      if (activeElement) {
        // Look for nearby headings
        let parent = activeElement.parentElement;
        const headings = [];
        
        // Go up to 5 levels up to find headings
        for (let i = 0; i < 5 && parent; i++) {
          const nearbyHeadings = parent.querySelectorAll('h1, h2, h3, h4, h5, h6');
          nearbyHeadings.forEach(h => headings.push(h.textContent.trim()));
          parent = parent.parentElement;
        }
        
        if (headings.length > 0) {
          contextText += "Nearby headings:\n";
          [...new Set(headings)].forEach(h => {
            contextText += `- ${h}\n`;
          });
          contextText += "\n";
        }
        
        // Get any labels associated with the active element
        if (activeElement.id) {
          const associatedLabel = document.querySelector(`label[for="${activeElement.id}"]`);
          if (associatedLabel) {
            contextText += `Field label: ${associatedLabel.textContent.trim()}\n\n`;
          }
        }
        
        // Check for aria-label on the element itself
        if (activeElement.getAttribute('aria-label')) {
          contextText += `Field aria-label: ${activeElement.getAttribute('aria-label')}\n\n`;
        }
        
        // Check for placeholder
        if (activeElement.placeholder) {
          contextText += `Field placeholder: ${activeElement.placeholder}\n\n`;
        }
      }
    }
    
    return contextText;
  } catch (error) {
    console.error('Error extracting form context:', error);
    return "Could not extract detailed form context.";
  }
}

/**
 * Directly scrapes the current page for its content
 * @returns {string} The page content as text
 */
function captureDirectPageContent() {
  try {
    // Select the most relevant content containers first
    const mainContent = document.querySelector('main, #main, #content, .content, article, .article, [role="main"]');
    
    // If we found a main content container, use that, otherwise use the body
    const contentElement = mainContent || document.body;
    
    // Extract the text content
    let pageContent = '';
    
    // Try to extract structured content first
    pageContent = extractStructuredContent(contentElement);
    
    // If structured extraction failed, use a simpler approach
    if (!pageContent || pageContent.length < 100) {
      // Get text content excluding scripts, styles, and hidden elements
      const visibleTextNodes = getVisibleTextNodes(contentElement);
      pageContent = visibleTextNodes.map(node => node.textContent.trim()).join('\n\n');
    }
    
    // Clean up the extracted content
    pageContent = cleanPageContent(pageContent);
    
    // Truncate if too long
    if (pageContent.length > CONTEXT_CONFIG.maxPageContentLength) {
      pageContent = pageContent.substring(0, CONTEXT_CONFIG.maxPageContentLength) + 
                    "\n\n[Content truncated due to length]";
    }
    
    // Return with page title and URL
    return `# ${document.title}\nURL: ${window.location.href}\n\n${pageContent}`;
  } catch (error) {
    console.error('Error extracting page content:', error);
    // Return minimal info if extraction fails
    return `Page Title: ${document.title}\nURL: ${window.location.href}`;
  }
}

/**
 * Extracts structured content from a DOM element
 * @param {Element} element The DOM element to extract from
 * @returns {string} Structured content in a markdown-like format
 */
function extractStructuredContent(element) {
  try {
    // Create a document fragment to work with
    const clone = element.cloneNode(true);
    
    // Remove non-content elements
    removeNonContentElements(clone);
    
    // Initialize the content buffer
    let content = '';
    
    // Extract headings and their content
    const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    if (headings.length > 0) {
      // Process each heading and its following content
      headings.forEach(heading => {
        // Get heading level and text
        const level = parseInt(heading.tagName.substring(1));
        const headingText = heading.textContent.trim();
        
        // Add heading with appropriate markdown format
        content += '\n' + '#'.repeat(level) + ' ' + headingText + '\n\n';
        
        // Get content until next heading
        let currentNode = heading.nextSibling;
        while (currentNode && 
               !['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(currentNode.tagName)) {
          if (currentNode.nodeType === Node.ELEMENT_NODE) {
            // For paragraphs and other text-containing elements
            const text = currentNode.textContent.trim();
            if (text) {
              content += text + '\n\n';
            }
          }
          
          // Move to next node
          if (!currentNode.nextSibling) break;
          currentNode = currentNode.nextSibling;
        }
      });
    } else {
      // No headings found, extract paragraphs directly
      const paragraphs = clone.querySelectorAll('p, div, section, article, li');
      paragraphs.forEach(para => {
        const text = para.textContent.trim();
        if (text) {
          content += text + '\n\n';
        }
      });
    }
    
    return content.trim();
  } catch (error) {
    console.error('Error extracting structured content:', error);
    return '';
  }
}

/**
 * Removes non-content elements from a DOM node
 * @param {Node} node The DOM node to clean
 */
function removeNonContentElements(node) {
  // Elements to remove (likely non-content)
  const elementsToRemove = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    'iframe', 'noscript', 'svg', 'img', 'video', 'audio',
    'form', 'input', 'button', 'select', 'option', 'textarea'
  ];
  
  // Remove matching elements
  elementsToRemove.forEach(tag => {
    const elements = node.querySelectorAll(tag);
    elements.forEach(el => el.parentNode.removeChild(el));
  });
  
  // Also remove elements with likely non-content classes/ids
  const nonContentSelectors = [
    '.nav', '.navigation', '.menu', '.sidebar', '.footer', '.header', '.ad', '.ads', 
    '.banner', '.promo', '.related', '.share', '.social', '.comment', '.comments',
    '#nav', '#navigation', '#menu', '#sidebar', '#footer', '#header', '#ad', '#ads',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
  ];
  
  nonContentSelectors.forEach(selector => {
    try {
      const elements = node.querySelectorAll(selector);
      elements.forEach(el => el.parentNode.removeChild(el));
    } catch (e) {
      // Some selectors might be invalid, ignore those errors
    }
  });
  
  // Remove hidden elements
  const hiddenElements = node.querySelectorAll('[hidden], [style*="display: none"], [style*="display:none"], [style*="visibility: hidden"], [style*="visibility:hidden"]');
  hiddenElements.forEach(el => el.parentNode.removeChild(el));
}

/**
 * Gets visible text nodes from an element
 * @param {Element} element The DOM element to get text from
 * @returns {Array} Array of text nodes
 */
function getVisibleTextNodes(element) {
  const textNodes = [];
  
  // Recursive function to get all text nodes
  function getTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        textNodes.push(node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip hidden elements
      const style = window.getComputedStyle(node);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        // Skip non-content elements
        const tag = node.tagName.toLowerCase();
        if (!['script', 'style', 'noscript', 'svg'].includes(tag)) {
          // Process children
          for (let i = 0; i < node.childNodes.length; i++) {
            getTextNodes(node.childNodes[i]);
          }
        }
      }
    }
  }
  
  getTextNodes(element);
  return textNodes;
}

/**
 * Cleans up the extracted page content
 * @param {string} content The content to clean
 * @returns {string} Cleaned content
 */
function cleanPageContent(content) {
  // Replace multiple newlines with just two
  let cleaned = content.replace(/\n{3,}/g, '\n\n');
  
  // Replace multiple spaces with single space
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  
  // Remove strange Unicode control characters
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  
  // Remove very short lines (likely menu items, etc.)
  const lines = cleaned.split('\n');
  cleaned = lines.filter(line => line.trim().length > 10 || line.trim() === '').join('\n');
  
  return cleaned;
}

/**
 * Creates an enhanced prompt for Claude with context and instructions
 * @param {string} question The user's original question
 * @param {Object} pageContext The captured page context (text and screenshot)
 * @returns {string} The enhanced prompt
 */
function createEnhancedPrompt(question, pageContext) {
  // Create a prompt that gives Claude context and clear instructions
  let prompt = `I need help filling out a form field. I'll provide context from the current webpage and my specific question.`;
  
  // Add screenshot if available
  if (pageContext.screenshotData) {
    prompt += `\n\n## Screenshot of Current Page:
<image>
${pageContext.screenshotData}
</image>`;
  }
  
  // Add text context
  prompt += `\n\n## Current Webpage Context:
${pageContext.textContext || "No text context available from the current page."}

## My Question:
${question}

## Instructions:
1. Look at the screenshot and webpage context to understand what I'm filling out.
2. Provide a direct, focused answer to my question based on the context.
3. IMPORTANT: Answer ONLY the question without any introductions, explanations, or conclusions.
4. Do not include phrases like "Based on the context" or "According to the webpage".
5. Keep your answer concise and to the point.
6. Only give me the exact text that should be entered into the form field.
7. If you're uncertain about any aspect, make a reasonable best effort.

Just provide the exact text for the form field:`;

  return prompt;
}

/**
 * Generates a descriptive conversation title based on the question
 * @param {string} question The user's question
 * @returns {string} A conversation title
 */
function generateConversationTitle(question) {
  try {
    // Create a shortened version of the question for the title
    let title = question.trim();
    
    // Remove markdown formatting if present
    title = title.replace(/[#*_~`]/g, '');
    
    // If question is long, use just the first part
    if (title.length > 50) {
      // Try to find a sentence boundary
      const sentenceEnd = title.match(/[.!?]/);
      if (sentenceEnd && sentenceEnd.index < 60) {
        title = title.substring(0, sentenceEnd.index + 1);
      } else {
        // No sentence boundary found, cut at 50 chars and add ellipsis
        title = title.substring(0, 47) + '...';
      }
    }
    
    // Add a prefix to make it clear what this conversation is for
    return `Form: ${title}`;
  } catch (error) {
    console.error('Error generating title:', error);
    return `Form Assistant - ${new Date().toLocaleString()}`;
  }
}