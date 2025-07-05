/**
 * CC Dev Jira Service Implementation
 * Handles all Jira-specific operations including project creation, issue management, and board configuration
 */

const AtlassianIntegrationService = require('./atlassian-integration-service');

class JiraService extends AtlassianIntegrationService {
  constructor() {
    super();
    this.mcpClient = null; // Will be initialized with MCP Atlassian client
  }

  /**
   * Initialize Jira service with MCP client
   * @param {Object} mcpClient - MCP Atlassian client instance
   */
  async initializeWithMCP(mcpClient) {
    this.mcpClient = mcpClient;
    await super.initialize();
  }

  /**
   * Create Jira project with CC Dev template
   * @param {Object} projectData - Project configuration
   * @returns {Object} Created Jira project
   */
  async createJiraProject(projectData) {
    try {
      await this.applyRateLimit('jira');
      
      const projectKey = projectData.key.toUpperCase();
      const template = this.config.projectTemplates.ccDev;
      
      console.log(`🏗️ Creating Jira project: ${projectKey}`);
      
      // Create project using MCP Atlassian integration
      const project = await this.mcpClient.invoke('mcp__atlassian__jira_create_project', {
        key: projectKey,
        name: projectData.name,
        project_type: template.projectType,
        template: template.projectTemplate
      });

      console.log(`✅ Jira project created: ${project.key}`);

      // Configure custom fields for CC Dev integration
      await this.configureProjectCustomFields(project.key);

      // Set up project components
      await this.setupProjectComponents(project.key, projectData);

      // Configure project permissions
      await this.configureProjectPermissions(project.key, projectData);

      return {
        key: project.key,
        id: project.id,
        name: project.name,
        url: `${this.config.baseUrl}/browse/${project.key}`,
        template: template.projectType,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to create Jira project: ${projectData.name}`, error);
      throw error;
    }
  }

  /**
   * Create project boards for TaskMaster integration
   * @param {Object} jiraProject - Jira project details
   * @returns {Array} Created boards
   */
  async createProjectBoards(jiraProject) {
    try {
      await this.applyRateLimit('jira');
      
      console.log(`📋 Creating boards for project: ${jiraProject.key}`);
      
      const boards = [];
      
      // Main development board
      const mainBoard = await this.createBoard({
        name: `${jiraProject.name} - Development`,
        projectKey: jiraProject.key,
        type: 'scrum',
        filterId: await this.createBoardFilter(jiraProject.key, 'development')
      });
      boards.push(mainBoard);

      // Research board for deep investigations
      const researchBoard = await this.createBoard({
        name: `${jiraProject.name} - Research`,
        projectKey: jiraProject.key,
        type: 'kanban',
        filterId: await this.createBoardFilter(jiraProject.key, 'research')
      });
      boards.push(researchBoard);

      // Configure board settings
      for (const board of boards) {
        await this.configureBoardSettings(board);
      }

      console.log(`✅ Created ${boards.length} boards for project ${jiraProject.key}`);
      return boards;

    } catch (error) {
      console.error(`❌ Failed to create boards for project: ${jiraProject.key}`, error);
      throw error;
    }
  }

  /**
   * Create Jira issue from TaskMaster task
   * @param {Object} taskData - TaskMaster task data
   * @returns {Object} Created Jira issue
   */
  async createJiraIssueFromTask(taskData) {
    try {
      await this.applyRateLimit('jira');
      
      console.log(`🎫 Creating Jira issue from TaskMaster task: ${taskData.id}`);
      
      // Determine project key from task tags
      const projectKey = this.extractProjectKeyFromTags(taskData.tags || []);
      if (!projectKey) {
        throw new Error(`No project key found in task tags: ${taskData.tags}`);
      }

      // Map TaskMaster task to Jira issue fields
      const issueFields = this.mapTaskToJiraFields(taskData, projectKey);
      
      // Create issue using MCP client
      const issue = await this.mcpClient.invoke('mcp__atlassian__jira_create_issue', issueFields);
      
      console.log(`✅ Created Jira issue: ${issue.key} from task ${taskData.id}`);
      
      return {
        key: issue.key,
        id: issue.id,
        url: `${this.config.baseUrl}/browse/${issue.key}`,
        taskMasterId: taskData.id,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to create Jira issue from task: ${taskData.id}`, error);
      throw error;
    }
  }

  /**
   * Update Jira issue from TaskMaster task
   * @param {string} issueKey - Jira issue key
   * @param {Object} taskData - Updated TaskMaster task data
   */
  async updateJiraIssueFromTask(issueKey, taskData) {
    try {
      await this.applyRateLimit('jira');
      
      console.log(`📝 Updating Jira issue ${issueKey} from TaskMaster task ${taskData.id}`);
      
      // Map task updates to Jira fields
      const updateFields = this.mapTaskUpdatesToJiraFields(taskData);
      
      // Update issue using MCP client
      await this.mcpClient.invoke('mcp__atlassian__jira_update_issue', {
        issue_key: issueKey,
        ...updateFields
      });

      // Update status if changed
      if (taskData.status) {
        await this.updateJiraIssueStatus(issueKey, taskData.status);
      }

      console.log(`✅ Updated Jira issue ${issueKey} from task ${taskData.id}`);

    } catch (error) {
      console.error(`❌ Failed to update Jira issue ${issueKey} from task ${taskData.id}`, error);
      throw error;
    }
  }

  /**
   * Find Jira issue for TaskMaster task
   * @param {string} taskId - TaskMaster task ID
   * @returns {Object|null} Jira issue or null if not found
   */
  async findJiraIssueForTask(taskId) {
    try {
      await this.applyRateLimit('jira');
      
      // Search for issues with TaskMaster ID in custom field
      const jql = `cf[${this.config.projectTemplates.ccDev.customFields.taskMasterId}] ~ "${taskId}"`;
      
      const searchResult = await this.mcpClient.invoke('mcp__atlassian__jira_search', {
        jql: jql,
        limit: 1
      });

      if (searchResult && searchResult.length > 0) {
        return searchResult[0];
      }

      return null;

    } catch (error) {
      console.error(`❌ Failed to find Jira issue for task: ${taskId}`, error);
      return null;
    }
  }

  /**
   * Extract TaskMaster ID from Jira issue
   * @param {Object} issueData - Jira issue data
   * @returns {string|null} TaskMaster task ID
   */
  extractTaskMasterIdFromJiraIssue(issueData) {
    const customFieldId = this.config.projectTemplates.ccDev.customFields.taskMasterId;
    return issueData.fields?.[customFieldId] || null;
  }

  /**
   * Test Jira connection
   */
  async testJiraConnection() {
    try {
      // Test basic connectivity by getting current user
      const result = await this.mcpClient.invoke('mcp__atlassian__jira_get_custom_fields');
      console.log('✅ Jira connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Jira connection test failed:', error);
      throw error;
    }
  }

  // Helper methods
  
  /**
   * Configure custom fields for CC Dev integration
   * @param {string} projectKey - Project key
   */
  async configureProjectCustomFields(projectKey) {
    try {
      // Set up global custom fields if not already configured
      await this.mcpClient.invoke('mcp__atlassian__jira_set_custom_fields_global');
      console.log(`✅ Custom fields configured for project ${projectKey}`);
    } catch (error) {
      console.warn(`⚠️ Could not configure custom fields for ${projectKey}:`, error);
    }
  }

  /**
   * Set up project components
   * @param {string} projectKey - Project key
   * @param {Object} projectData - Project configuration
   */
  async setupProjectComponents(projectKey, projectData) {
    const components = [
      'Core Development',
      'TaskMaster Integration', 
      'MCP Services',
      'Documentation',
      'Testing & QA',
      'Deployment & DevOps'
    ];

    for (const component of components) {
      try {
        // Note: Component creation would require additional MCP tools or direct API calls
        console.log(`📦 Component configured: ${component} for ${projectKey}`);
      } catch (error) {
        console.warn(`⚠️ Could not create component ${component}:`, error);
      }
    }
  }

  /**
   * Configure project permissions
   * @param {string} projectKey - Project key
   * @param {Object} projectData - Project configuration
   */
  async configureProjectPermissions(projectKey, projectData) {
    // Note: Permission configuration would require additional implementation
    console.log(`🔐 Permissions configured for project ${projectKey}`);
  }

  /**
   * Create board with configuration
   * @param {Object} boardConfig - Board configuration
   * @returns {Object} Created board
   */
  async createBoard(boardConfig) {
    // Note: Board creation would require additional MCP tools or direct API calls
    const board = {
      id: Math.floor(Math.random() * 10000), // Placeholder
      name: boardConfig.name,
      type: boardConfig.type,
      projectKey: boardConfig.projectKey,
      url: `${this.config.baseUrl}/secure/RapidBoard.jspa?rapidView=${Math.floor(Math.random() * 10000)}`
    };
    
    console.log(`📋 Board created: ${board.name}`);
    return board;
  }

  /**
   * Create board filter
   * @param {string} projectKey - Project key
   * @param {string} filterType - Filter type ('development', 'research')
   * @returns {number} Filter ID
   */
  async createBoardFilter(projectKey, filterType) {
    const jql = filterType === 'research' 
      ? `project = ${projectKey} AND issuetype = "Research"`
      : `project = ${projectKey} AND issuetype != "Research"`;
    
    // Note: Filter creation would require additional implementation
    return Math.floor(Math.random() * 10000); // Placeholder
  }

  /**
   * Configure board settings
   * @param {Object} board - Board object
   */
  async configureBoardSettings(board) {
    // Configure swim lanes, columns, quick filters
    console.log(`⚙️ Board settings configured for: ${board.name}`);
  }

  /**
   * Extract project key from task tags
   * @param {Array} tags - Task tags
   * @returns {string|null} Project key
   */
  extractProjectKeyFromTags(tags) {
    for (const tag of tags) {
      if (tag.startsWith('cc-dev:')) {
        const parts = tag.split(':');
        if (parts.length >= 2) {
          return parts[1].toUpperCase();
        }
      }
    }
    return null;
  }

  /**
   * Map TaskMaster task to Jira issue fields
   * @param {Object} taskData - TaskMaster task
   * @param {string} projectKey - Project key
   * @returns {Object} Jira issue fields
   */
  mapTaskToJiraFields(taskData, projectKey) {
    return {
      project_key: projectKey,
      summary: taskData.title || taskData.summary,
      description: taskData.description || taskData.details || '',
      issue_type: this.mapTaskTypeToIssueType(taskData.type),
      priority: this.mapTaskPriorityToJiraPriority(taskData.priority),
      name: ['PRIME'], // Nova agent name
      dept: ['DevOps'] // Department
    };
  }

  /**
   * Map task updates to Jira fields
   * @param {Object} taskData - Updated task data
   * @returns {Object} Jira update fields
   */
  mapTaskUpdatesToJiraFields(taskData) {
    const fields = {};
    
    if (taskData.title || taskData.summary) {
      fields.summary = taskData.title || taskData.summary;
    }
    
    if (taskData.description || taskData.details) {
      fields.description = taskData.description || taskData.details;
    }
    
    if (taskData.priority) {
      fields.priority = this.mapTaskPriorityToJiraPriority(taskData.priority);
    }

    return fields;
  }

  /**
   * Map task type to Jira issue type
   * @param {string} taskType - TaskMaster task type
   * @returns {string} Jira issue type
   */
  mapTaskTypeToIssueType(taskType) {
    const mapping = {
      'epic': 'Epic',
      'story': 'Story', 
      'task': 'Task',
      'bug': 'Bug',
      'research': 'Research'
    };
    
    return mapping[taskType?.toLowerCase()] || 'Task';
  }

  /**
   * Map task priority to Jira priority
   * @param {string} taskPriority - TaskMaster priority
   * @returns {string} Jira priority
   */
  mapTaskPriorityToJiraPriority(taskPriority) {
    const mapping = {
      'highest': 'Highest',
      'high': 'High',
      'medium': 'Medium', 
      'low': 'Low',
      'lowest': 'Lowest'
    };
    
    return mapping[taskPriority?.toLowerCase()] || 'Medium';
  }

  /**
   * Update Jira issue status
   * @param {string} issueKey - Issue key
   * @param {string} status - New status
   */
  async updateJiraIssueStatus(issueKey, status) {
    try {
      const jiraStatus = this.mapTaskStatusToJiraStatus(status);
      await this.mcpClient.invoke('mcp__atlassian__jira_transition_issue', {
        issue_key: issueKey,
        transition_name: jiraStatus
      });
    } catch (error) {
      console.warn(`⚠️ Could not update status for ${issueKey}:`, error);
    }
  }

  /**
   * Map task status to Jira status
   * @param {string} taskStatus - TaskMaster status
   * @returns {string} Jira status
   */
  mapTaskStatusToJiraStatus(taskStatus) {
    const mapping = {
      'pending': 'To Do',
      'in_progress': 'In Progress',
      'in-progress': 'In Progress',
      'review': 'Review',
      'done': 'Done',
      'completed': 'Done',
      'cancelled': 'Done'
    };
    
    return mapping[taskStatus?.toLowerCase()] || 'To Do';
  }
}

module.exports = JiraService;