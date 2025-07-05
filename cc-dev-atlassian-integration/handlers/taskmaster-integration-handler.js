/**
 * TaskMaster Integration Handler
 * Handles bidirectional synchronization between TaskMaster and Atlassian ecosystem
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class TaskMasterIntegrationHandler extends EventEmitter {
  constructor(jiraService, confluenceService, jsmService) {
    super();
    this.jiraService = jiraService;
    this.confluenceService = confluenceService;
    this.jsmService = jsmService;
    this.syncEnabled = true;
    this.syncLocks = new Set(); // Prevent sync loops
    this.taskMasterPath = process.env.TASKMASTER_PATH || '/adaptai/ceo/cso/repos/awesome-claude-code/cc_dev/config/taskmaster-local';
  }

  /**
   * Initialize TaskMaster integration
   */
  async initialize() {
    console.log('🔗 Initializing TaskMaster integration handler...');
    
    // Set up file watchers for TaskMaster changes
    await this.setupTaskMasterWatchers();
    
    // Perform initial sync
    await this.performInitialSync();
    
    console.log('✅ TaskMaster integration handler initialized');
  }

  /**
   * Handle TaskMaster tag update
   * @param {string} tagName - Tag name (e.g., 'master', 'cc-dev:project')
   * @param {Array} tasks - Updated tasks
   */
  async handleTagUpdate(tagName, tasks) {
    try {
      if (!this.syncEnabled || this.syncLocks.has(`tag:${tagName}`)) {
        return;
      }

      this.syncLocks.add(`tag:${tagName}`);
      console.log(`🏷️ Processing TaskMaster tag update: ${tagName}`);

      // Filter tasks that should sync to Jira
      const syncableTasks = this.filterSyncableTasks(tasks);
      
      if (syncableTasks.length === 0) {
        console.log(`ℹ️ No syncable tasks found for tag: ${tagName}`);
        return;
      }

      // Group tasks by project
      const tasksByProject = this.groupTasksByProject(syncableTasks);

      // Sync each project's tasks
      for (const [projectKey, projectTasks] of Object.entries(tasksByProject)) {
        await this.syncProjectTasks(projectKey, projectTasks, tagName);
      }

      // Update board configurations
      await this.updateBoardsForTag(tagName, syncableTasks);

      console.log(`✅ Completed tag sync: ${tagName} (${syncableTasks.length} tasks)`);
      this.emit('tag:synced', { tagName, taskCount: syncableTasks.length });

    } catch (error) {
      console.error(`❌ Failed to handle tag update: ${tagName}`, error);
      this.emit('tag:sync:error', { tagName, error });
    } finally {
      this.syncLocks.delete(`tag:${tagName}`);
    }
  }

  /**
   * Handle individual task update
   * @param {Object} taskData - Updated task data
   * @param {string} tagName - Tag context
   */
  async handleTaskUpdate(taskData, tagName = 'master') {
    try {
      if (!this.syncEnabled || this.syncLocks.has(`task:${taskData.id}`)) {
        return;
      }

      this.syncLocks.add(`task:${taskData.id}`);
      console.log(`📝 Processing TaskMaster task update: ${taskData.id}`);

      // Check if task should be synced
      if (!this.shouldSyncTask(taskData)) {
        console.log(`ℹ️ Task ${taskData.id} does not meet sync criteria`);
        return;
      }

      // Sync to Jira
      await this.syncTaskToJira(taskData);

      // Update related documentation if needed
      if (this.isDocumentationTask(taskData)) {
        await this.updateTaskDocumentation(taskData);
      }

      // Create support ticket if needed
      if (this.isSupportTask(taskData)) {
        await this.createSupportTicket(taskData);
      }

      console.log(`✅ Completed task sync: ${taskData.id}`);
      this.emit('task:synced', { taskId: taskData.id, tagName });

    } catch (error) {
      console.error(`❌ Failed to handle task update: ${taskData.id}`, error);
      this.emit('task:sync:error', { taskId: taskData.id, error });
    } finally {
      this.syncLocks.delete(`task:${taskData.id}`);
    }
  }

  /**
   * Handle Jira issue update (webhook)
   * @param {Object} issueData - Jira issue data
   */
  async handleJiraIssueUpdate(issueData) {
    try {
      if (!this.syncEnabled) return;

      const taskId = this.jiraService.extractTaskMasterIdFromJiraIssue(issueData);
      if (!taskId || this.syncLocks.has(`jira:${issueData.key}`)) {
        return;
      }

      this.syncLocks.add(`jira:${issueData.key}`);
      console.log(`🎫 Processing Jira issue update: ${issueData.key} -> Task ${taskId}`);

      // Update TaskMaster task
      await this.updateTaskMasterTask(taskId, issueData);

      console.log(`✅ Completed Jira sync: ${issueData.key} -> ${taskId}`);
      this.emit('jira:synced', { issueKey: issueData.key, taskId });

    } catch (error) {
      console.error(`❌ Failed to handle Jira issue update: ${issueData.key}`, error);
      this.emit('jira:sync:error', { issueKey: issueData.key, error });
    } finally {
      this.syncLocks.delete(`jira:${issueData.key}`);
    }
  }

  /**
   * Sync project tasks to Jira
   * @param {string} projectKey - Project key
   * @param {Array} tasks - Project tasks
   * @param {string} tagName - Tag name
   */
  async syncProjectTasks(projectKey, tasks, tagName) {
    console.log(`🏗️ Syncing ${tasks.length} tasks for project: ${projectKey}`);

    for (const task of tasks) {
      try {
        await this.syncTaskToJira(task, projectKey);
      } catch (error) {
        console.error(`❌ Failed to sync task ${task.id} to project ${projectKey}:`, error);
      }
    }
  }

  /**
   * Sync individual task to Jira
   * @param {Object} taskData - Task data
   * @param {string} projectKey - Override project key
   */
  async syncTaskToJira(taskData, projectKey = null) {
    // Check if Jira issue already exists
    const existingIssue = await this.jiraService.findJiraIssueForTask(taskData.id);

    if (existingIssue) {
      // Update existing issue
      await this.jiraService.updateJiraIssueFromTask(existingIssue.key, taskData);
      console.log(`📝 Updated Jira issue: ${existingIssue.key}`);
    } else {
      // Create new issue
      if (projectKey) {
        // Temporarily add project tag for creation
        taskData.tags = taskData.tags || [];
        if (!taskData.tags.some(tag => tag.includes(projectKey.toLowerCase()))) {
          taskData.tags.push(`cc-dev:${projectKey.toLowerCase()}`);
        }
      }
      
      const newIssue = await this.jiraService.createJiraIssueFromTask(taskData);
      console.log(`🎫 Created Jira issue: ${newIssue.key}`);
    }
  }

  /**
   * Update TaskMaster task from Jira issue
   * @param {string} taskId - TaskMaster task ID
   * @param {Object} issueData - Jira issue data
   */
  async updateTaskMasterTask(taskId, issueData) {
    try {
      // Read current TaskMaster tasks
      const tasksFile = path.join(this.taskMasterPath, '.taskmaster/tasks/tasks.json');
      const tasksData = JSON.parse(await fs.readFile(tasksFile, 'utf8'));

      // Find and update the task
      const masterTasks = tasksData.master?.tasks || tasksData.tasks || [];
      const taskIndex = masterTasks.findIndex(task => task.id.toString() === taskId.toString());

      if (taskIndex === -1) {
        console.warn(`⚠️ TaskMaster task not found: ${taskId}`);
        return;
      }

      const task = masterTasks[taskIndex];
      
      // Map Jira fields back to TaskMaster
      if (issueData.fields?.summary && issueData.fields.summary !== task.title) {
        task.title = issueData.fields.summary;
      }
      
      if (issueData.fields?.description && issueData.fields.description !== task.description) {
        task.description = issueData.fields.description;
      }

      if (issueData.fields?.status?.name) {
        const mappedStatus = this.mapJiraStatusToTaskStatus(issueData.fields.status.name);
        if (mappedStatus !== task.status) {
          task.status = mappedStatus;
        }
      }

      if (issueData.fields?.priority?.name) {
        const mappedPriority = this.mapJiraPriorityToTaskPriority(issueData.fields.priority.name);
        if (mappedPriority !== task.priority) {
          task.priority = mappedPriority;
        }
      }

      // Update timestamp
      tasksData.metadata = tasksData.metadata || {};
      tasksData.metadata.updated = new Date().toISOString();

      // Write back to file
      await fs.writeFile(tasksFile, JSON.stringify(tasksData, null, 2));
      
      console.log(`📝 Updated TaskMaster task ${taskId} from Jira issue ${issueData.key}`);

    } catch (error) {
      console.error(`❌ Failed to update TaskMaster task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Set up TaskMaster file watchers
   */
  async setupTaskMasterWatchers() {
    try {
      const tasksFile = path.join(this.taskMasterPath, '.taskmaster/tasks/tasks.json');
      
      // Watch for changes to tasks file
      fs.watch(path.dirname(tasksFile), { persistent: false }, async (eventType, filename) => {
        if (filename === 'tasks.json' && eventType === 'change') {
          await this.handleTaskMasterFileChange();
        }
      });

      console.log('👀 TaskMaster file watchers set up');

    } catch (error) {
      console.error('❌ Failed to setup TaskMaster watchers:', error);
    }
  }

  /**
   * Handle TaskMaster file changes
   */
  async handleTaskMasterFileChange() {
    try {
      // Debounce rapid changes
      clearTimeout(this.fileChangeTimeout);
      this.fileChangeTimeout = setTimeout(async () => {
        console.log('📁 TaskMaster file changed, processing updates...');
        await this.processTaskMasterUpdates();
      }, 1000);

    } catch (error) {
      console.error('❌ Failed to handle TaskMaster file change:', error);
    }
  }

  /**
   * Process TaskMaster updates
   */
  async processTaskMasterUpdates() {
    try {
      const tasksFile = path.join(this.taskMasterPath, '.taskmaster/tasks/tasks.json');
      const tasksData = JSON.parse(await fs.readFile(tasksFile, 'utf8'));

      // Process master tag tasks
      if (tasksData.master?.tasks) {
        await this.handleTagUpdate('master', tasksData.master.tasks);
      }

      // Process other tags if present
      for (const [tagName, tagData] of Object.entries(tasksData)) {
        if (tagName !== 'master' && tagName !== 'metadata' && tagData.tasks) {
          await this.handleTagUpdate(tagName, tagData.tasks);
        }
      }

    } catch (error) {
      console.error('❌ Failed to process TaskMaster updates:', error);
    }
  }

  /**
   * Perform initial sync on startup
   */
  async performInitialSync() {
    console.log('🔄 Performing initial TaskMaster sync...');
    await this.processTaskMasterUpdates();
    console.log('✅ Initial sync completed');
  }

  // Helper methods

  filterSyncableTasks(tasks) {
    return tasks.filter(task => this.shouldSyncTask(task));
  }

  shouldSyncTask(task) {
    // Only sync tasks with cc-dev tags or specific criteria
    if (!task.tags || !Array.isArray(task.tags)) return false;
    
    return task.tags.some(tag => 
      tag.startsWith('cc-dev:') || 
      tag.startsWith('atlassian:') ||
      tag.startsWith('jira:')
    );
  }

  groupTasksByProject(tasks) {
    const groups = {};
    
    for (const task of tasks) {
      const projectKey = this.extractProjectKeyFromTask(task);
      if (projectKey) {
        if (!groups[projectKey]) groups[projectKey] = [];
        groups[projectKey].push(task);
      }
    }
    
    return groups;
  }

  extractProjectKeyFromTask(task) {
    if (!task.tags) return null;
    
    for (const tag of task.tags) {
      if (tag.startsWith('cc-dev:')) {
        const parts = tag.split(':');
        return parts[1]?.toUpperCase();
      }
    }
    
    return 'ADAPT'; // Default project
  }

  async updateBoardsForTag(tagName, tasks) {
    // Update board configurations based on tag updates
    console.log(`📋 Updating boards for tag: ${tagName}`);
  }

  isDocumentationTask(task) {
    return task.tags?.some(tag => tag.includes('documentation') || tag.includes('docs'));
  }

  isSupportTask(task) {
    return task.tags?.some(tag => tag.includes('support') || tag.includes('help'));
  }

  async updateTaskDocumentation(taskData) {
    // Update Confluence documentation for documentation tasks
    console.log(`📚 Updating documentation for task: ${taskData.id}`);
  }

  async createSupportTicket(taskData) {
    // Create JSM ticket for support tasks
    console.log(`🎫 Creating support ticket for task: ${taskData.id}`);
  }

  mapJiraStatusToTaskStatus(jiraStatus) {
    const mapping = {
      'To Do': 'pending',
      'In Progress': 'in_progress',
      'Review': 'review',
      'Done': 'completed',
      'Closed': 'completed'
    };
    return mapping[jiraStatus] || 'pending';
  }

  mapJiraPriorityToTaskPriority(jiraPriority) {
    const mapping = {
      'Highest': 'highest',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Lowest': 'lowest'
    };
    return mapping[jiraPriority] || 'medium';
  }
}

module.exports = TaskMasterIntegrationHandler;