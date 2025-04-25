document.addEventListener('DOMContentLoaded', async () => {
  const projectSelect = document.getElementById('project-select');
  const refreshButton = document.getElementById('refresh-projects');
  const autoDetectCheckbox = document.getElementById('auto-detect');
  const saveButton = document.getElementById('save-settings');
  const statusMessage = document.getElementById('status-message');
  const openClaudeButton = document.getElementById('open-claude');
  const loggedInElement = document.getElementById('logged-in');
  const notLoggedInElement = document.getElementById('not-logged-in');
  const usernameElement = document.getElementById('username');
  
  // Check if user is logged in to Claude.ai
  checkLoginStatus();

  // Load saved settings
  loadSettings();

  // Event listeners
  refreshButton.addEventListener('click', fetchProjects);
  saveButton.addEventListener('click', saveSettings);
  openClaudeButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://claude.ai' });
  });

  async function checkLoginStatus() {
    try {
      const isLoggedIn = await sendMessageToBackground({ action: 'checkLoginStatus' });
      
      if (isLoggedIn) {
        loggedInElement.classList.remove('hidden');
        notLoggedInElement.classList.add('hidden');
        
        // Get and display username if available
        const userInfo = await sendMessageToBackground({ action: 'getUserInfo' });
        if (userInfo && userInfo.name) {
          usernameElement.textContent = userInfo.name;
        }
        
        // Load projects if logged in
        fetchProjects();
      } else {
        loggedInElement.classList.add('hidden');
        notLoggedInElement.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Error checking login status:', error);
    }
  }

  async function fetchProjects() {
    try {
      projectSelect.innerHTML = '<option value="loading">Loading projects...</option>';
      
      const projects = await sendMessageToBackground({ action: 'getProjects' });
      
      if (projects && projects.length > 0) {
        projectSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.textContent = 'Default Project';
        projectSelect.appendChild(defaultOption);
        
        // Add all projects
        projects.forEach(project => {
          const option = document.createElement('option');
          option.value = project.id;
          option.textContent = project.name;
          projectSelect.appendChild(option);
        });
        
        // Select previously saved project if exists
        const settings = await chrome.storage.sync.get(['defaultProject']);
        if (settings.defaultProject) {
          projectSelect.value = settings.defaultProject;
        }
      } else {
        projectSelect.innerHTML = '<option value="none">No projects found</option>';
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      projectSelect.innerHTML = '<option value="error">Error loading projects</option>';
    }
  }

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(['defaultProject', 'autoDetect']);
    
    if (settings.autoDetect !== undefined) {
      autoDetectCheckbox.checked = settings.autoDetect;
    }
  }

  async function saveSettings() {
    const settings = {
      defaultProject: projectSelect.value,
      autoDetect: autoDetectCheckbox.checked
    };
    
    await chrome.storage.sync.set(settings);
    
    statusMessage.textContent = 'Settings saved!';
    setTimeout(() => {
      statusMessage.textContent = '';
    }, 2000);
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
});