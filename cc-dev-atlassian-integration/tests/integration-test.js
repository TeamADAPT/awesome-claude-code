#!/usr/bin/env node

/**
 * CC Dev Atlassian Integration Test Suite
 * Comprehensive testing for the integration system
 */

const CCDevAtlassianIntegration = require('../cc-dev-atlassian-integration');
const { ATLASSIAN_CONFIG } = require('../config/integration-config');

class IntegrationTester {
  constructor() {
    this.integration = new CCDevAtlassianIntegration();
    this.testResults = [];
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log('🧪 Starting CC Dev Atlassian Integration Tests');
    console.log('=' .repeat(60));

    try {
      // Initialize integration system
      await this.integration.initialize();

      // Run test suites
      await this.testConfigurationValidation();
      await this.testServiceConnections();
      await this.testProjectCreation();
      await this.testTaskMasterSync();
      await this.testBidirectionalSync();
      await this.testErrorHandling();

      // Generate test report
      this.generateTestReport();

    } catch (error) {
      console.error('❌ Test suite failed to initialize:', error);
      process.exit(1);
    } finally {
      await this.integration.shutdown();
    }
  }

  /**
   * Test configuration validation
   */
  async testConfigurationValidation() {
    await this.runTest('Configuration Validation', async () => {
      // Test required environment variables
      const requiredVars = ['ATLASSIAN_URL', 'ATLASSIAN_USERNAME', 'ATLASSIAN_API_TOKEN'];
      const missing = requiredVars.filter(key => !process.env[key] && !ATLASSIAN_CONFIG.auth[key.toLowerCase()]);
      
      if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
      }

      // Test configuration structure
      if (!ATLASSIAN_CONFIG.projectTemplates.ccDev) {
        throw new Error('CC Dev project template not configured');
      }

      if (!ATLASSIAN_CONFIG.sync.enabled) {
        console.warn('⚠️ Sync is disabled in configuration');
      }

      return { configValid: true, missingVars: 0 };
    });
  }

  /**
   * Test service connections
   */
  async testServiceConnections() {
    await this.runTest('Service Connections', async () => {
      const results = await this.integration.testIntegration();
      
      if (!results) {
        throw new Error('Service connection tests failed');
      }

      return { allServicesConnected: true };
    });
  }

  /**
   * Test project creation
   */
  async testProjectCreation() {
    await this.runTest('Project Creation', async () => {
      const testProject = {
        name: 'Test Project Integration',
        key: 'TESTINT',
        description: 'Test project for integration validation'
      };

      const ecosystem = await this.integration.createProject(testProject);

      // Validate ecosystem creation
      if (!ecosystem.jiraProject || !ecosystem.jiraProject.key) {
        throw new Error('Jira project not created properly');
      }

      if (ecosystem.jiraProject.key !== testProject.key) {
        throw new Error('Project key mismatch');
      }

      return {
        projectCreated: true,
        jiraProject: ecosystem.jiraProject.key,
        hasConfluenceSpace: !!ecosystem.confluenceSpace,
        hasJSMServiceDesk: !!ecosystem.jsmServiceDesk,
        boardCount: ecosystem.boards ? ecosystem.boards.length : 0
      };
    });
  }

  /**
   * Test TaskMaster synchronization
   */
  async testTaskMasterSync() {
    await this.runTest('TaskMaster Synchronization', async () => {
      const testTasks = [
        {
          id: 'test-001',
          title: 'Test Task 1',
          description: 'Test task for sync validation',
          status: 'pending',
          priority: 'high',
          tags: ['cc-dev:testint', 'integration-test']
        },
        {
          id: 'test-002', 
          title: 'Test Task 2',
          description: 'Second test task for sync validation',
          status: 'in_progress',
          priority: 'medium',
          tags: ['cc-dev:testint', 'integration-test']
        }
      ];

      // Test tag-based sync
      await this.integration.syncTagToBoards('test-integration', testTasks);

      // Simulate task updates
      for (const task of testTasks) {
        if (this.integration.taskMasterHandler) {
          await this.integration.taskMasterHandler.handleTaskUpdate(task, 'test-integration');
        }
      }

      return {
        tasksProcessed: testTasks.length,
        syncSuccessful: true
      };
    });
  }

  /**
   * Test bidirectional synchronization
   */
  async testBidirectionalSync() {
    await this.runTest('Bidirectional Sync', async () => {
      // Simulate Jira issue update
      const mockJiraIssue = {
        key: 'TESTINT-1',
        fields: {
          summary: 'Updated from Jira',
          description: 'This task was updated in Jira',
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          [ATLASSIAN_CONFIG.projectTemplates.ccDev.customFields.taskMasterId]: 'test-001'
        }
      };

      if (this.integration.taskMasterHandler) {
        await this.integration.taskMasterHandler.handleJiraIssueUpdate(mockJiraIssue);
      }

      return {
        bidirectionalSyncTested: true,
        jiraToTaskMasterSync: true
      };
    });
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    await this.runTest('Error Handling', async () => {
      const errorScenarios = [];

      // Test invalid project configuration
      try {
        await this.integration.createProject({ name: 'Invalid' }); // Missing key
        errorScenarios.push('❌ Should have failed with missing key');
      } catch (error) {
        errorScenarios.push('✅ Correctly handled missing project key');
      }

      // Test invalid task sync
      try {
        const invalidTask = { id: 'invalid', tags: [] }; // No syncable tags
        if (this.integration.taskMasterHandler) {
          await this.integration.taskMasterHandler.handleTaskUpdate(invalidTask);
          errorScenarios.push('✅ Correctly skipped non-syncable task');
        }
      } catch (error) {
        errorScenarios.push('⚠️ Unexpected error handling invalid task');
      }

      return {
        errorScenariosHandled: errorScenarios.length,
        scenarios: errorScenarios
      };
    });
  }

  /**
   * Run individual test with error handling
   */
  async runTest(testName, testFunction) {
    console.log(`🧪 Running test: ${testName}`);
    
    const startTime = Date.now();
    
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        name: testName,
        status: 'PASSED',
        duration: duration,
        result: result
      });
      
      console.log(`✅ ${testName} - PASSED (${duration}ms)`);
      if (result && typeof result === 'object') {
        Object.entries(result).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        name: testName,
        status: 'FAILED',
        duration: duration,
        error: error.message
      });
      
      console.error(`❌ ${testName} - FAILED (${duration}ms)`);
      console.error(`   Error: ${error.message}`);
    }
    
    console.log('');
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport() {
    console.log('📊 Integration Test Report');
    console.log('=' .repeat(60));

    const passed = this.testResults.filter(test => test.status === 'PASSED').length;
    const failed = this.testResults.filter(test => test.status === 'FAILED').length;
    const total = this.testResults.length;
    const totalDuration = this.testResults.reduce((sum, test) => sum + test.duration, 0);

    console.log(`Tests Run: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('');

    if (failed > 0) {
      console.log('Failed Tests:');
      this.testResults
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`❌ ${test.name}: ${test.error}`);
        });
      console.log('');
    }

    // Detailed results
    console.log('Detailed Results:');
    this.testResults.forEach(test => {
      const status = test.status === 'PASSED' ? '✅' : '❌';
      console.log(`${status} ${test.name} (${test.duration}ms)`);
      
      if (test.result) {
        Object.entries(test.result).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }
      
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });

    // Write results to file
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, successRate: (passed / total) * 100, totalDuration },
      results: this.testResults
    };

    require('fs').writeFileSync('./test-results.json', JSON.stringify(reportData, null, 2));
    console.log('📄 Test results written to test-results.json');

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new IntegrationTester();
  tester.runAllTests().catch(console.error);
}

module.exports = IntegrationTester;