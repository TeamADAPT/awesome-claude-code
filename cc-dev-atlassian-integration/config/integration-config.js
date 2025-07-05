/**
 * CC Dev Atlassian Integration Configuration
 * Centralized configuration for all Atlassian ecosystem integrations
 */

// Load environment variables from .env file
require('dotenv').config();

const ATLASSIAN_CONFIG = {
  // Base Atlassian configuration
  baseUrl: process.env.ATLASSIAN_URL || 'https://levelup2x.atlassian.net',
  auth: {
    username: process.env.ATLASSIAN_USERNAME,
    apiToken: process.env.ATLASSIAN_API_TOKEN,
    type: 'basic'
  },

  // Rate limiting configuration
  rateLimits: {
    jira: {
      requestsPerSecond: 10,
      burst: 20,
      retryAfter: 5000
    },
    confluence: {
      requestsPerSecond: 8,
      burst: 15,
      retryAfter: 5000
    },
    jsm: {
      requestsPerSecond: 5,
      burst: 10,
      retryAfter: 7000
    }
  },

  // Webhook configuration
  webhooks: {
    port: process.env.WEBHOOK_PORT || 3000,
    path: '/webhooks/atlassian',
    secret: process.env.WEBHOOK_SECRET,
    events: {
      jira: ['issue_created', 'issue_updated', 'issue_deleted'],
      confluence: ['page_created', 'page_updated'],
      jsm: ['request_created', 'request_updated']
    }
  },

  // Project templates
  projectTemplates: {
    ccDev: {
      projectType: 'software',
      projectTemplate: 'com.pyxis.greenhopper.jira:basic-software-development-template',
      leadAccountId: '714ba16a45af1b82693df42c', // PRIME DevOps
      issueTypes: ['Epic', 'Story', 'Task', 'Bug', 'Research'],
      customFields: {
        novaAgent: 'customfield_10057', // Name field
        department: 'customfield_10058', // Dept field
        taskMasterId: 'customfield_10032', // Story Points (repurposed)
        ccDevMetadata: 'customfield_10038' // Revision field (repurposed)
      },
      workflows: {
        development: ['To Do', 'In Progress', 'Code Review', 'Testing', 'Done'],
        research: ['Draft', 'Research', 'Analysis', 'Review', 'Complete']
      }
    }
  },

  // Board configuration
  boardConfig: {
    swimlanes: {
      type: 'priority',
      values: ['Highest', 'High', 'Medium', 'Low', 'Lowest']
    },
    quickFilters: [
      { name: 'Nova Agents', jql: 'cf[10057] is not EMPTY' },
      { name: 'TaskMaster Tasks', jql: 'cf[10032] is not EMPTY' },
      { name: 'CC Dev Projects', jql: 'cf[10038] ~ "cc-dev"' }
    ],
    columns: ['To Do', 'In Progress', 'Review', 'Done']
  },

  // Confluence space templates
  confluenceTemplates: {
    ccDevProject: {
      spaceType: 'documentation',
      template: 'cc-dev-project-docs',
      pageHierarchy: [
        'Project Overview',
        'Architecture & Design',
        'Development Guidelines',
        'API Documentation',
        'Meeting Notes',
        'Troubleshooting Guide'
      ]
    }
  },

  // JSM service desk configuration
  jsmConfig: {
    serviceDesk: {
      name: 'CC Dev Support',
      projectKey: 'CCDEV',
      projectType: 'service_desk',
      requestTypes: [
        {
          name: 'Technical Support',
          description: 'Get help with CC Dev technical issues',
          issueType: 'Support'
        },
        {
          name: 'Feature Request',
          description: 'Request new features or enhancements',
          issueType: 'Story'
        },
        {
          name: 'Bug Report',
          description: 'Report bugs in CC Dev system',
          issueType: 'Bug'
        }
      ]
    },
    slaConfig: {
      high: { responseTime: '2h', resolutionTime: '8h' },
      medium: { responseTime: '4h', resolutionTime: '24h' },
      low: { responseTime: '8h', resolutionTime: '72h' }
    }
  },

  // Nova agent identity mapping
  novaAgents: {
    identityMapping: {
      'prime-devops': {
        atlassianAccountId: '714ba16a45af1b82693df42c',
        displayName: 'PRIME DevOps',
        email: 'prime@adapt.team',
        capabilities: ['development', 'devops', 'architecture', 'mcp-integration'],
        permissions: {
          jira: ['project:admin', 'issue:create', 'issue:edit', 'issue:delete'],
          confluence: ['space:admin', 'page:create', 'page:edit', 'page:delete'],
          jsm: ['servicedesk:admin', 'request:create', 'request:respond']
        }
      }
    },
    capabilityMatrix: {
      development: ['jira:issue:create', 'confluence:page:create'],
      devops: ['jira:project:admin', 'jsm:servicedesk:admin'],
      architecture: ['confluence:space:admin', 'jira:epic:create'],
      research: ['confluence:page:create', 'jira:research:create']
    }
  },

  // Synchronization configuration
  sync: {
    enabled: true,
    direction: 'bidirectional', // 'bidirectional', 'taskmaster-to-jira', 'jira-to-taskmaster'
    conflictResolution: 'last-write-wins', // 'last-write-wins', 'manual-review', 'merge'
    syncInterval: 30000, // 30 seconds
    tagFilters: [
      'cc-dev:*',
      'taskmaster:*',
      'atlassian:*',
      'nova:*'
    ],
    fieldMapping: {
      taskmaster: {
        id: 'customfield_10032',
        title: 'summary',
        description: 'description',
        status: 'status.name',
        priority: 'priority.name',
        assignee: 'assignee.accountId',
        tags: 'labels'
      },
      jira: {
        key: 'id',
        summary: 'title',
        description: 'description',
        'status.name': 'status',
        'priority.name': 'priority',
        'assignee.accountId': 'assignee',
        labels: 'tags'
      }
    }
  },

  // Monitoring and logging
  monitoring: {
    healthCheck: {
      enabled: true,
      interval: 60000, // 1 minute
      endpoints: [
        '/health/jira',
        '/health/confluence',
        '/health/jsm'
      ]
    },
    metrics: {
      enabled: true,
      retention: '30d',
      aggregation: '5m'
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      auditTrail: true,
      retention: '90d'
    }
  }
};

// Validation function
function validateConfig() {
  const required = [
    'ATLASSIAN_URL',
    'ATLASSIAN_USERNAME', 
    'ATLASSIAN_API_TOKEN'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return true;
}

module.exports = {
  ATLASSIAN_CONFIG,
  validateConfig
};