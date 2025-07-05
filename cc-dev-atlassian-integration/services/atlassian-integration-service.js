/**
 * CC Dev Atlassian Integration Service
 * Main orchestration service for all Atlassian ecosystem operations
 */

const { ATLASSIAN_CONFIG, validateConfig } = require('../config/integration-config');
const EventEmitter = require('events');

class AtlassianIntegrationService extends EventEmitter {
  constructor() {
    super();
    this.config = ATLASSIAN_CONFIG;
    this.isInitialized = false;
    this.rateLimiters = new Map();
    this.syncQueue = [];
    this.processingSync = false;
    
    // Initialize rate limiters
    this.initializeRateLimiters();
  }

  /**
   * Initialize the integration service
   */
  async initialize() {
    try {
      console.log('🚀 Initializing CC Dev Atlassian Integration Service...');
      
      // Validate configuration
      validateConfig();
      
      // Test connections to all Atlassian services
      await this.testConnections();
      
      // Initialize webhook listeners
      await this.initializeWebhooks();
      
      // Start sync processing
      this.startSyncProcessor();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.isInitialized = true;
      console.log('✅ Atlassian Integration Service initialized successfully');
      
      this.emit('service:initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize Atlassian Integration Service:', error);
      throw error;
    }
  }

  /**
   * Create a complete CC Dev project ecosystem
   * @param {Object} projectData - Project configuration
   * @returns {Object} Created project details
   */
  async createProjectEcosystem(projectData) {
    try {
      console.log(`🏗️ Creating CC Dev project ecosystem: ${projectData.name}`);
      
      const ecosystem = {
        project: projectData,
        jiraProject: null,
        confluenceSpace: null,
        jsmServiceDesk: null,
        boards: [],
        createdAt: new Date().toISOString()
      };

      // 1. Create Jira project with CC Dev template
      ecosystem.jiraProject = await this.createJiraProject(projectData);
      console.log(`✅ Jira project created: ${ecosystem.jiraProject.key}`);

      // 2. Create Confluence space for documentation
      ecosystem.confluenceSpace = await this.createConfluenceSpace(projectData);
      console.log(`✅ Confluence space created: ${ecosystem.confluenceSpace.key}`);

      // 3. Create JSM service desk for support
      ecosystem.jsmServiceDesk = await this.createJSMServiceDesk(projectData);
      console.log(`✅ JSM service desk created: ${ecosystem.jsmServiceDesk.key}`);

      // 4. Create boards for TaskMaster integration
      ecosystem.boards = await this.createProjectBoards(ecosystem.jiraProject);
      console.log(`✅ Project boards created: ${ecosystem.boards.length} boards`);

      // 5. Initialize documentation structure
      await this.initializeDocumentationStructure(ecosystem);
      console.log(`✅ Documentation structure initialized`);

      // 6. Set up initial webhooks and automation
      await this.setupProjectAutomation(ecosystem);
      console.log(`✅ Project automation configured`);

      // Log audit trail
      await this.logAuditEvent('project:created', {
        projectKey: ecosystem.jiraProject.key,
        ecosystem: ecosystem
      });

      console.log(`🎉 CC Dev project ecosystem created successfully: ${projectData.name}`);
      this.emit('project:created', ecosystem);
      
      return ecosystem;

    } catch (error) {
      console.error(`❌ Failed to create project ecosystem: ${projectData.name}`, error);
      throw error;
    }
  }

  /**
   * Synchronize TaskMaster tag with Jira board
   * @param {string} tag - TaskMaster tag (e.g., 'cc-dev:project:feature')
   * @param {Array} tasks - TaskMaster tasks
   */
  async syncTagToBoard(tag, tasks) {
    try {
      console.log(`🔄 Syncing TaskMaster tag to Jira board: ${tag}`);
      
      // Add to sync queue
      this.syncQueue.push({
        type: 'tag-to-board',
        tag: tag,
        tasks: tasks,
        timestamp: Date.now()
      });

      // Process if not already processing
      if (!this.processingSync) {
        await this.processSyncQueue();
      }

    } catch (error) {
      console.error(`❌ Failed to queue tag sync: ${tag}`, error);
      throw error;
    }
  }

  /**
   * Handle TaskMaster task update
   * @param {Object} taskData - Updated task data
   */
  async handleTaskUpdate(taskData) {
    try {
      // Find corresponding Jira issue
      const jiraIssue = await this.findJiraIssueForTask(taskData.id);
      
      if (jiraIssue) {
        // Update Jira issue
        await this.updateJiraIssueFromTask(jiraIssue.key, taskData);
        console.log(`✅ Updated Jira issue ${jiraIssue.key} from TaskMaster task ${taskData.id}`);
      } else {
        // Create new Jira issue
        const newIssue = await this.createJiraIssueFromTask(taskData);
        console.log(`✅ Created Jira issue ${newIssue.key} from TaskMaster task ${taskData.id}`);
      }

      // Log audit trail
      await this.logAuditEvent('task:synced', {
        taskId: taskData.id,
        jiraKey: jiraIssue?.key || 'new',
        action: jiraIssue ? 'updated' : 'created'
      });

    } catch (error) {
      console.error(`❌ Failed to handle task update: ${taskData.id}`, error);
      throw error;
    }
  }

  /**
   * Handle Jira issue update
   * @param {Object} issueData - Updated Jira issue data
   */
  async handleJiraIssueUpdate(issueData) {
    try {
      // Find corresponding TaskMaster task
      const taskId = this.extractTaskMasterIdFromJiraIssue(issueData);
      
      if (taskId) {
        // Update TaskMaster task
        await this.updateTaskMasterTaskFromJira(taskId, issueData);
        console.log(`✅ Updated TaskMaster task ${taskId} from Jira issue ${issueData.key}`);
        
        // Log audit trail
        await this.logAuditEvent('issue:synced', {
          jiraKey: issueData.key,
          taskId: taskId,
          action: 'updated'
        });
      }

    } catch (error) {
      console.error(`❌ Failed to handle Jira issue update: ${issueData.key}`, error);
      throw error;
    }
  }

  /**
   * Initialize rate limiters for all Atlassian services
   */
  initializeRateLimiters() {
    for (const [service, config] of Object.entries(this.config.rateLimits)) {
      this.rateLimiters.set(service, {
        tokens: config.burst,
        lastRefill: Date.now(),
        config: config
      });
    }
  }

  /**
   * Apply rate limiting for service
   * @param {string} service - Service name ('jira', 'confluence', 'jsm')
   */
  async applyRateLimit(service) {
    const limiter = this.rateLimiters.get(service);
    if (!limiter) return;

    const now = Date.now();
    const timePassed = now - limiter.lastRefill;
    const tokensToAdd = Math.floor(timePassed / (1000 / limiter.config.requestsPerSecond));
    
    limiter.tokens = Math.min(limiter.config.burst, limiter.tokens + tokensToAdd);
    limiter.lastRefill = now;

    if (limiter.tokens <= 0) {
      await new Promise(resolve => setTimeout(resolve, limiter.config.retryAfter));
      limiter.tokens = 1;
    } else {
      limiter.tokens--;
    }
  }

  /**
   * Test connections to all Atlassian services
   */
  async testConnections() {
    console.log('🔍 Testing Atlassian service connections...');
    
    // Test Jira connection (required)
    try {
      await this.testJiraConnection();
      console.log('✅ Jira connection successful');
    } catch (error) {
      console.error('❌ Jira connection failed:', error);
      throw error; // Fail fast for Jira
    }

    // Test optional services
    try {
      await this.testConfluenceConnection();
      console.log('✅ Confluence connection successful');
    } catch (error) {
      console.warn('⚠️ Confluence connection failed:', error.message);
    }

    try {
      await this.testJSMConnection();
      console.log('✅ JSM connection successful');
    } catch (error) {
      console.warn('⚠️ JSM connection failed:', error.message);
    }
  }

  /**
   * Start sync queue processor
   */
  async startSyncProcessor() {
    console.log('🔄 Starting sync processor...');
    
    setInterval(async () => {
      if (!this.processingSync && this.syncQueue.length > 0) {
        await this.processSyncQueue();
      }
    }, this.config.sync.syncInterval);
  }

  /**
   * Process sync queue
   */
  async processSyncQueue() {
    if (this.processingSync || this.syncQueue.length === 0) return;
    
    this.processingSync = true;
    
    try {
      while (this.syncQueue.length > 0) {
        const syncItem = this.syncQueue.shift();
        await this.processSyncItem(syncItem);
      }
    } catch (error) {
      console.error('❌ Error processing sync queue:', error);
    } finally {
      this.processingSync = false;
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    console.log('🏥 Starting health monitoring...');
    
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.monitoring.healthCheck.interval);
  }

  /**
   * Log audit event
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  async logAuditEvent(event, data) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      event: event,
      data: data,
      service: 'atlassian-integration'
    };

    console.log(`📝 AUDIT: ${event}`, auditEntry);
    
    // In production, this would write to audit log system
    this.emit('audit:logged', auditEntry);
  }

  // Placeholder methods to be implemented in specific service modules
  async createJiraProject(projectData) { throw new Error('Not implemented'); }
  async createProjectBoards(jiraProject) { throw new Error('Not implemented'); }
  async findJiraIssueForTask(taskId) { throw new Error('Not implemented'); }
  async updateJiraIssueFromTask(issueKey, taskData) { throw new Error('Not implemented'); }
  async createJiraIssueFromTask(taskData) { throw new Error('Not implemented'); }
  async extractTaskMasterIdFromJiraIssue(issueData) { throw new Error('Not implemented'); }
  async updateTaskMasterTaskFromJira(taskId, issueData) { throw new Error('Not implemented'); }
  async testJiraConnection() { throw new Error('Not implemented'); }
  
  // Optional services - return placeholder implementations
  async createConfluenceSpace(projectData) { 
    console.log('ℹ️ Confluence integration not yet implemented');
    return { key: 'PENDING', name: 'Pending Implementation', url: '#' };
  }
  
  async createJSMServiceDesk(projectData) { 
    console.log('ℹ️ JSM integration not yet implemented');
    return { key: 'PENDING', name: 'Pending Implementation', url: '#' };
  }
  
  async initializeDocumentationStructure(ecosystem) { 
    console.log('ℹ️ Documentation structure initialization not yet implemented');
  }
  
  async setupProjectAutomation(ecosystem) { 
    console.log('ℹ️ Project automation setup not yet implemented');
  }
  
  async testConfluenceConnection() { 
    console.log('ℹ️ Confluence connection test not yet implemented');
    return true;
  }
  
  async testJSMConnection() { 
    console.log('ℹ️ JSM connection test not yet implemented');
    return true;
  }
  
  async initializeWebhooks() { 
    console.log('ℹ️ Webhook initialization not yet implemented');
  }
  
  async processSyncItem(syncItem) { 
    console.log(`ℹ️ Processing sync item: ${syncItem.type}`);
  }
  
  async performHealthCheck() { 
    return {
      jira: this.isInitialized,
      confluence: true, // Placeholder
      jsm: true, // Placeholder
      overall: this.isInitialized
    };
  }
}

module.exports = AtlassianIntegrationService;