// Claude.ai API interaction endpoints
const CLAUDE_API = {
  BASE_URL: 'https://claude.ai',
  ORGANIZATIONS: '/api/organizations',
  CHAT_LIST: '/api/organizations/{orgId}/chat_conversations',
  CHAT: '/api/organizations/{orgId}/chat_conversations/{chatId}?tree=True&rendering_mode=messages',
  SEND_MESSAGE: '/api/organizations/{orgId}/chat_conversations/{chatId}/completion',
  PROJECTS: '/api/organizations/{orgId}/projects'
};

// Store organization ID after login
let currentOrgId = null;
let cachedProjects = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Claude Form Assistant installed');
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle different action types
  switch (request.action) {
    case 'checkLoginStatus':
      checkLoginStatus().then(sendResponse);
      return true; // Indicates async response
      
    case 'getUserInfo':
      getUserInfo().then(sendResponse);
      return true;
      
    case 'getProjects':
      getProjects().then(sendResponse);
      return true;
      
    case 'askClaude':
      console.log(`Received message from ${sender.tab ? 'content script' : 'popup'}:`, request);
      askClaude(request.question, request.projectId, request.conversationTitle).then(sendResponse);
      return true;
      
    case 'captureScreenshot':
      captureScreenshot().then(sendResponse);
      return true; // Indicates async response
  }
});

// Capture a screenshot of the current active tab
async function captureScreenshot() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      throw new Error('No active tab found');
    }
    
    try {
      // Attempt to capture screenshot of the active tab
      const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      return { screenshotData: screenshot };
    } catch (captureError) {
      console.error('Screenshot capture failed:', captureError);
      return { 
        error: captureError.message || 'Screenshot capture failed. Make sure the extension has proper permissions.' 
      };
    }
  } catch (error) {
    console.error('Error in screenshot capture process:', error);
    return { error: error.message };
  }
}

// Check if the user is logged in to Claude.ai
async function checkLoginStatus() {
  try {
    // Try to get organizations - this will fail if not logged in
    const orgs = await fetchOrganizations();
    return !!orgs;
  } catch (error) {
    console.error('Error checking login status:', error);
    return false;
  }
}

// Get the user info from Claude.ai
async function getUserInfo() {
  try {
    const orgs = await fetchOrganizations();
    if (orgs && orgs.length > 0) {
      // Return the user name from the first organization
      return { name: orgs[0].name };
    }
    return null;
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
}

// Fetch available projects/conversations
async function getProjects() {
  try {
    // Use cached projects if available
    if (cachedProjects) {
      return cachedProjects;
    }
    
    // Get organization ID if not already available
    if (!currentOrgId) {
      const orgs = await fetchOrganizations();
      if (orgs && orgs.length > 0) {
        currentOrgId = orgs[0].uuid;
      } else {
        throw new Error('No organizations found');
      }
    }
    
    // Fetch recent conversations
    const conversations = await fetchProjects(currentOrgId);
    
    // Cache the projects
    cachedProjects = conversations.map(conv => ({
      id: conv.uuid,
      name: conv.name || 'Untitled Conversation',
      lastUpdated: new Date(conv.updated_at)
    }));
    
    // Sort by last updated date (newest first)
    cachedProjects.sort((a, b) => b.lastUpdated - a.lastUpdated);
    
    return cachedProjects;
  } catch (error) {
    console.error('Error getting projects:', error);
    return [];
  }
}

// Ask Claude a question and get the response
async function askClaude(question, projectId, conversationTitle) {
  try {
    // Get organization ID if not already available
    if (!currentOrgId) {
      const orgs = await fetchOrganizations();
      if (orgs && orgs.length > 0) {
        currentOrgId = orgs[0].uuid;
      } else {
        throw new Error('No organizations found');
      }
    }
    
    // Create a new conversation if no project ID is specified or if it's the default project
    let conversationId = null;
    let newConversationCreated = false;
    
    // Use the provided conversation title or fallback to a generic one
    let conversationName = conversationTitle || `Form Assistant - ${new Date().toLocaleString()}`;

    conversationId = await createConversation(currentOrgId, projectId, conversationName);
    newConversationCreated = true;
    
    // Send the message to Claude
    const response = await sendMessage(currentOrgId, conversationId, question);

    // Sleep for 5 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Generate the conversation URL
    const conversationUrl = `${CLAUDE_API.BASE_URL}${CLAUDE_API.CHAT.replace('{orgId}', currentOrgId).replace('{chatId}', conversationId)}`;
    console.log('Conversation URL:', conversationUrl);
    const chatResponseRaw = await fetch(conversationUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    if (!chatResponseRaw.ok) {
      throw new Error(`Failed to retrieve messages: ${chatResponseRaw.status}`);
    }
    const chatResponse = await chatResponseRaw.json();
    console.log('Response from Claude:', chatResponse);

    const chatUrl = `${CLAUDE_API.BASE_URL}/chat/${conversationId}`
    
    // Extract answer from the response
    const result = {
      answer: extractAnswer(chatResponse),
      conversationId,
      chatUrl,
      newConversationCreated
    };

    console.log('Result from Claude:', JSON.stringify(result));

    return result;
  } catch (error) {
    console.error('Error asking Claude:', error, error.stack);
    throw error;
  }
}

// Helper function to extract the answer from Claude's response
function extractAnswer(response) {
  if (!response || !response.chat_messages || response.chat_messages.length < 2 || !response.chat_messages[1].content || response.chat_messages[1].content.length < 1 || !response.chat_messages[1].content[0].text) {
    return '';
  }

  return response.chat_messages[1].content[0].text;
}

// Fetch organizations from Claude.ai
async function fetchOrganizations() {
  const response = await fetch(`${CLAUDE_API.BASE_URL}${CLAUDE_API.ORGANIZATIONS}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch organizations: ${response.status}`);
  }
  
  return await response.json();
}

// Fetch recent conversations from Claude.ai
async function fetchProjects(orgId) {
  const url = `${CLAUDE_API.BASE_URL}${CLAUDE_API.PROJECTS.replace('{orgId}', orgId)}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.status}`);
  }
  
  return await response.json();
}

// Create a new conversation on Claude.ai
async function createConversation(orgId, projId, name = null) {
  const url = `${CLAUDE_API.BASE_URL}${CLAUDE_API.CHAT_LIST.replace('{orgId}', orgId)}`;
  
  const conversationName = name || `Form Assistant - ${new Date().toLocaleString()}`;

  const uuid = crypto.randomUUID();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      name: conversationName,
      include_conversation_preferences: true,
      project_uuid: projId,
      uuid: uuid,
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }
  await response.json()
  
  return uuid;
}

// Send a message to Claude and get the response
async function sendMessage(orgId, conversationId, message) {
  const url = `${CLAUDE_API.BASE_URL}${CLAUDE_API.SEND_MESSAGE.replace().replace('{orgId}', orgId).replace('{chatId}', conversationId)}`;
  console.log("sending message on url", url);
  
  // Check if the message contains an image tag (screenshot)
  const hasImage = message.includes("<image>");
  let attachments = [];
  
  if (hasImage) {
    // Extract the base64 image data
    const imageMatch = message.match(/<image>(.*?)<\/image>/s);
    if (imageMatch && imageMatch[1]) {
      const base64Data = imageMatch[1].trim();
      
      // Create an attachment for the image
      attachments = [{
        file_name: "screenshot.png",
        file_type: "image/png",
        file_size: Math.ceil(base64Data.length * 0.75), // Approximate size in bytes
        extracted_content: "",
        file_id: crypto.randomUUID(),
        media_type: "image",
        width: 1200, // Default width
        height: 800, // Default height
        display_width: 1200,
        display_height: 800,
        data: base64Data
      }];
      
      // Remove the image tag from the message
      message = message.replace(/<image>.*?<\/image>/s, "");
    }
  }
  
  // Send the message to Claude
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      "prompt": message,
      "parent_message_uuid": "00000000-0000-4000-8000-000000000000",
      "timezone": "Asia/Calcutta",
      "personalized_styles": [
        {
          "type": "default",
          "key": "Default",
          "name": "Normal",
          "nameKey": "normal_style_name",
          "prompt": "Normal",
          "summary": "Default responses from Claude",
          "summaryKey": "normal_style_summary",
          "isDefault": true
        }
      ],
      "locale": "en-US",
      "tools": [],
      "attachments": hasImage ? attachments : [],
      "files": [],
      "sync_sources": [],
      "rendering_mode": "messages"
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`);
  }
  
  return await response.text();
}