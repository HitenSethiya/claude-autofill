// Functions to handle capturing page context and creating enhanced prompts

/**
 * Captures the current webpage context using various methods
 * @returns {Promise<string>} The captured context as text
 */
async function capturePageContext() {
  try {
    // Check if this is a public webpage that we can access
    if (isPublicWebpage()) {
      // Try r.jina.ai API first for public pages
      try {
        const jinaContext = await captureWithJina();
        if (jinaContext && jinaContext.length > 100) {
          return jinaContext;
        }
      } catch (jinaError) {
        console.log('Could not use r.jina.ai, falling back to direct page scraping', jinaError);
      }
    }
    
    // Fallback to direct page scraping
    return captureDirectPageContent();
  } catch (error) {
    console.error('Error capturing page context:', error);
    return ''; // Return empty string if context capture fails
  }
}

/**
 * Determines if the current webpage is likely public (not behind auth)
 * @returns {boolean} True if the page is likely public
 */
function isPublicWebpage() {
  // Simple heuristic: if the URL doesn't contain private indicators and isn't a file or localhost
  const url = window.location.href;
  
  // Check for private/local indicators
  const privateIndicators = [
    'localhost',
    '127.0.0.1',
    'file://',
    'chrome://',
    'chrome-extension://',
    'admin',
    'dashboard',
    'account',
    'profile',
    'settings',
    'internal',
    'signin',
    'login',
    'auth',
    'portal'
  ];
  
  // If any private indicators are in the URL, consider it non-public
  return !privateIndicators.some(indicator => url.includes(indicator));
}

/**
 * Captures page content using r.jina.ai's API
 * @returns {Promise<string>} Markdown representation of the page
 */
async function captureWithJina() {
  try {
    // Get the current URL
    const url = window.location.href;
    
    // Make the API request to r.jina.ai
    const response = await fetch(`${CONTEXT_CONFIG.r_jina_api}/reader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        format: 'markdown', // Request markdown format
        include_images: false // Skip images to reduce response size
      })
    });
    
    if (!response.ok) {
      throw new Error(`r.jina.ai API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if we have markdown content
    if (data && data.markdown) {
      // Truncate if too long
      if (data.markdown.length > CONTEXT_CONFIG.maxPageContentLength) {
        return data.markdown.substring(0, CONTEXT_CONFIG.maxPageContentLength) + 
               "\n\n[Content truncated due to length]";
      }
      return data.markdown;
    } else {
      throw new Error('No markdown content returned from r.jina.ai');
    }
  } catch (error) {
    console.error('Error using r.jina.ai:', error);
    throw error; // Let the caller handle the fallback
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
 * @param {string} pageContext The captured page context
 * @returns {string} The enhanced prompt
 */
function createEnhancedPrompt(question, pageContext) {
  // Create a prompt that gives Claude context and clear instructions
  const prompt = `I need help filling out a form field. I'll provide the context from the current webpage and my specific question.

## Current Webpage Context:
${pageContext || "No context available from the current page."}

## My Question:
${question}

## Instructions:
1. Analyze the webpage context to understand what I'm filling out.
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