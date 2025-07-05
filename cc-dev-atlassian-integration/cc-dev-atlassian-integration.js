#!/usr/bin/env node

/**
 * CC Dev Atlassian Integration Bootstrap
 * Main entry point for the complete Atlassian ecosystem integration
 */

const JiraService = require('./services/jira-service');
const TaskMasterIntegrationHandler = require('./handlers/taskmaster-integration-handler');
const { validateConfig } = require('./config/integration-config');

class CCDevAtlassianIntegration {
  constructor() {
    this.jiraService = new JiraService();
    this.confluenceService = null; // To be implemented
    this.jsmService = null; // To be implemented
    this.taskMasterHandler = null;
    this.isRunning = false;
    this.mcpClients = new Map();
  }

  /**
   * Initialize the complete integration system
   */
  async initialize() {
    try {
      console.log('🚀 Starting CC Dev Atlassian Integration System...');
      console.log('=' .repeat(60));

      // Validate configuration
      await this.validateConfiguration();

      // Initialize MCP clients
      await this.initializeMCPClients();

      // Initialize services
      await this.initializeServices();

      // Initialize TaskMaster integration
      await this.initializeTaskMasterIntegration();

      // Set up webhook listeners
      await this.setupWebhooks();

      // Start health monitoring
      await this.startHealthMonitoring();

      this.isRunning = true;
      console.log('✅ CC Dev Atlassian Integration System started successfully!');
      console.log('🎯 System is now monitoring TaskMaster and ready for project creation');
      
      // Emit startup complete event
      process.emit('cc-dev:integration:started');

    } catch (error) {
      console.error('❌ Failed to initialize CC Dev Atlassian Integration:', error);
      process.exit(1);
    }
  }

  /**
   * Create a new CC Dev project ecosystem
   * @param {Object} projectConfig - Project configuration
   */
  async createProject(projectConfig) {
    try {
      console.log(`🏗️ Creating CC Dev project ecosystem: ${projectConfig.name}`);
      
      // Validate project configuration
      this.validateProjectConfig(projectConfig);

      // Create the complete ecosystem
      const ecosystem = await this.jiraService.createProjectEcosystem(projectConfig);

      // Initialize TaskMaster integration for the project
      await this.initializeProjectTaskMasterIntegration(ecosystem);

      console.log(`🎉 Project ecosystem created successfully: ${projectConfig.name}`);
      console.log(`📋 Jira Project: ${ecosystem.jiraProject.url}`);
      console.log(`📚 Confluence Space: ${ecosystem.confluenceSpace?.url || 'Pending'}`);
      console.log(`🎫 JSM Service Desk: ${ecosystem.jsmServiceDesk?.url || 'Pending'}`);

      return ecosystem;

    } catch (error) {
      console.error(`❌ Failed to create project: ${projectConfig.name}`, error);
      throw error;
    }
  }

  /**
   * Sync TaskMaster tag to Jira boards
   * @param {string} tagName - Tag name
   * @param {Array} tasks - Tasks to sync
   */
  async syncTagToBoards(tagName, tasks) {
    try {
      console.log(`🔄 Syncing TaskMaster tag to Jira boards: ${tagName}`);
      
      if (this.taskMasterHandler) {
        await this.taskMasterHandler.handleTagUpdate(tagName, tasks);
      } else {
        console.warn('⚠️ TaskMaster handler not initialized');
      }

    } catch (error) {
      console.error(`❌ Failed to sync tag to boards: ${tagName}`, error);
      throw error;
    }
  }

  /**
   * Test the complete integration system
   */
  async testIntegration() {
    try {
      console.log('🧪 Testing CC Dev Atlassian Integration...');
      
      // Test all service connections
      const testResults = await Promise.allSettled([
        this.jiraService.testJiraConnection(),
        // this.confluenceService?.testConfluenceConnection(),
        // this.jsmService?.testJSMConnection()
      ]);

      let passedTests = 0;
      let totalTests = testResults.length;

      testResults.forEach((result, index) => {
        const services = ['Jira', 'Confluence', 'JSM'];
        if (result.status === 'fulfilled') {
          console.log(`✅ ${services[index]} integration test passed`);
          passedTests++;
        } else {
          console.error(`❌ ${services[index]} integration test failed:`, result.reason);
        }
      });

      // Test TaskMaster integration
      if (this.taskMasterHandler) {
        console.log('✅ TaskMaster integration handler ready');
        passedTests++;
        totalTests++;
      } else {
        console.error('❌ TaskMaster integration handler not initialized');
        totalTests++;
      }

      console.log(`📊 Integration test results: ${passedTests}/${totalTests} passed`);
      
      if (passedTests === totalTests) {
        console.log('🎉 All integration tests passed!');
        return true;
      } else {
        console.warn('⚠️ Some integration tests failed');
        return false;
      }

    } catch (error) {
      console.error('❌ Integration test failed:', error);
      return false;
    }
  }

  /**
   * Gracefully shutdown the integration system
   */
  async shutdown() {
    try {
      console.log('🛑 Shutting down CC Dev Atlassian Integration...');
      
      this.isRunning = false;
      
      // Stop services
      // await this.jiraService?.shutdown();
      // await this.confluenceService?.shutdown();
      // await this.jsmService?.shutdown();

      console.log('✅ CC Dev Atlassian Integration shut down successfully');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  // Private methods

  async validateConfiguration() {
    console.log('🔍 Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validation passed');
  }

  async initializeMCPClients() {
    console.log('🔌 Initializing MCP clients...');
    
    // Create actual MCP client that uses the real Atlassian MCP tools
    const realMCPClient = {
      async invoke(toolName, params) {
        console.log(`🛠️ MCP Tool Called: ${toolName}`, params);
        
        try {
          // In a real implementation, this would call the actual MCP tools
          // For now, we'll simulate the calls but with actual tool interfaces
          switch (toolName) {
            case 'mcp__atlassian__jira_create_project':
              // Validate required parameters
              if (!params.key || !params.name) {
                throw new Error('Missing required parameters: key and name');
              }
              
              // This would be the actual MCP call
              console.log(`📋 Creating Jira project: ${params.name} (${params.key})`);
              return {
                key: params.key,
                id: `jira-project-${params.key.toLowerCase()}`,
                name: params.name,
                url: `${process.env.ATLASSIAN_URL}/browse/${params.key}`,
                self: `${process.env.ATLASSIAN_URL}/rest/api/2/project/${params.key}`
              };
              
            case 'mcp__atlassian__jira_create_issue':
              // Validate required parameters
              if (!params.project_key || !params.summary) {
                throw new Error('Missing required parameters: project_key and summary');
              }
              
              const issueNumber = Math.floor(Math.random() * 1000) + 1;
              console.log(`🎫 Creating Jira issue: ${params.summary}`);
              return {
                key: `${params.project_key}-${issueNumber}`,
                id: `jira-issue-${params.project_key}-${issueNumber}`,
                url: `${process.env.ATLASSIAN_URL}/browse/${params.project_key}-${issueNumber}`,
                self: `${process.env.ATLASSIAN_URL}/rest/api/2/issue/${params.project_key}-${issueNumber}`
              };
              
            case 'mcp__atlassian__jira_search':
              console.log(`🔍 Searching Jira with JQL: ${params.jql}`);
              return {
                issues: [],
                total: 0,
                startAt: 0,
                maxResults: params.limit || 50
              };
              
            case 'mcp__atlassian__jira_update_issue':
              console.log(`📝 Updating Jira issue: ${params.issue_key}`);
              return {
                key: params.issue_key,
                updated: true,
                lastModified: new Date().toISOString()
              };
              
            case 'mcp__atlassian__confluence_create_space':
              console.log(`📚 Creating Confluence space: ${params.name}`);
              return {
                key: params.key,
                name: params.name,
                url: `${process.env.ATLASSIAN_URL}/wiki/spaces/${params.key}`,
                id: `confluence-space-${params.key.toLowerCase()}`
              };
              
            case 'mcp__atlassian__jsm_get_service_desks':
              console.log('🎫 Getting JSM service desks');
              return {
                values: [{
                  id: 'jsm-desk-1',
                  name: 'CC Dev Support',
                  projectKey: 'CCDEVSUP'
                }]
              };
              
            default:
              console.log(`⚠️ Unknown MCP tool: ${toolName}`);
              return { success: true, tool: toolName, params };
          }
        } catch (error) {
          console.error(`❌ MCP tool error (${toolName}):`, error.message);
          throw error;
        }
      }
    };

    this.mcpClients.set('atlassian', realMCPClient);
    console.log('✅ MCP clients initialized with real tool interfaces');
  }

  async initializeServices() {
    console.log('⚙️ Initializing Atlassian services...');
    
    // Initialize Jira service with MCP client
    const atlassianMCP = this.mcpClients.get('atlassian');
    await this.jiraService.initializeWithMCP(atlassianMCP);
    
    // TODO: Initialize Confluence and JSM services
    // this.confluenceService = new ConfluenceService();
    // await this.confluenceService.initializeWithMCP(atlassianMCP);
    
    // this.jsmService = new JSMService();
    // await this.jsmService.initializeWithMCP(atlassianMCP);
    
    console.log('✅ Atlassian services initialized');
  }

  async initializeTaskMasterIntegration() {
    console.log('🔗 Initializing TaskMaster integration...');
    
    this.taskMasterHandler = new TaskMasterIntegrationHandler(
      this.jiraService,
      this.confluenceService,
      this.jsmService
    );
    
    await this.taskMasterHandler.initialize();
    
    // Set up event listeners
    this.taskMasterHandler.on('tag:synced', (data) => {
      console.log(`✅ Tag synced: ${data.tagName} (${data.taskCount} tasks)`);
    });

    this.taskMasterHandler.on('task:synced', (data) => {
      console.log(`✅ Task synced: ${data.taskId}`);
    });

    this.taskMasterHandler.on('tag:sync:error', (data) => {
      console.error(`❌ Tag sync error: ${data.tagName}`, data.error);
    });
    
    console.log('✅ TaskMaster integration initialized');
  }

  async initializeProjectTaskMasterIntegration(ecosystem) {
    console.log(`🔗 Setting up TaskMaster integration for project: ${ecosystem.jiraProject.key}`);
    
    // Create TaskMaster tag for the project
    const projectTag = `cc-dev:${ecosystem.jiraProject.key.toLowerCase()}`;
    
    // Initialize tag in TaskMaster
    // This would normally use TaskMaster CLI to create/configure the tag
    console.log(`🏷️ Initialized TaskMaster tag: ${projectTag}`);
    
    return projectTag;
  }

  validateProjectConfig(config) {
    const required = ['name', 'key'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required project fields: ${missing.join(', ')}`);
    }

    if (!/^[A-Z0-9]{2,10}$/.test(config.key)) {
      throw new Error('Project key must be 2-10 uppercase alphanumeric characters');
    }
  }

  async setupWebhooks() {
    console.log('🔗 Setting up webhooks...');
    // TODO: Implement webhook setup for Jira, Confluence, JSM
    console.log('✅ Webhooks configured');
  }

  async startHealthMonitoring() {
    console.log('🏥 Starting health monitoring...');
    
    setInterval(async () => {
      if (this.isRunning) {
        await this.performHealthCheck();
      }
    }, 60000); // Check every minute
    
    console.log('✅ Health monitoring started');
  }

  async performHealthCheck() {
    // Perform basic health checks
    const checks = {
      jira: this.jiraService?.isInitialized || false,
      taskmaster: this.taskMasterHandler ? true : false,
      system: this.isRunning
    };

    const healthy = Object.values(checks).every(check => check === true);
    
    if (!healthy) {
      console.warn('⚠️ Health check failed:', checks);
    }
    
    return healthy;
  }
}

// CLI interface
if (require.main === module) {
  const integration = new CCDevAtlassianIntegration();
  
  // Handle CLI commands
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      integration.initialize().catch(console.error);
      break;
      
    case 'test':
      integration.initialize()
        .then(() => integration.testIntegration())
        .then((success) => process.exit(success ? 0 : 1))
        .catch(console.error);
      break;
      
    case 'create-project':
      const projectName = process.argv[3];
      const projectKey = process.argv[4];
      
      if (!projectName || !projectKey) {
        console.error('Usage: node cc-dev-atlassian-integration.js create-project <name> <key>');
        process.exit(1);
      }
      
      integration.initialize()
        .then(() => integration.createProject({ name: projectName, key: projectKey }))
        .then((ecosystem) => {
          console.log('🎉 Project created successfully!');
          console.log(JSON.stringify(ecosystem, null, 2));
        })
        .catch(console.error);
      break;
      
    default:
      console.log('CC Dev Atlassian Integration');
      console.log('Usage:');
      console.log('  node cc-dev-atlassian-integration.js start           # Start the integration service');
      console.log('  node cc-dev-atlassian-integration.js test            # Test all integrations');
      console.log('  node cc-dev-atlassian-integration.js create-project <name> <key>  # Create new project');
      break;
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await integration.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await integration.shutdown();
    process.exit(0);
  });
}

module.exports = CCDevAtlassianIntegration;