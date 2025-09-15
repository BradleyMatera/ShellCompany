const { Connection, Deployment, Audit } = require('../models');

class AWSService {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  async getConnection(userId) {
    const connection = await Connection.findOne({
      where: { user_id: userId, provider: 'aws', status: 'active' }
    });

    if (!connection) {
      throw new Error('AWS connection not found or inactive');
    }

    const credentials = connection.getCredentials();
    if (!credentials) {
      throw new Error('AWS credentials not available');
    }

    return { connection, credentials };
  }

  async makeRequest(service, action, params = {}, credentials) {
    // For production, this would use the AWS SDK
    // Here's a simplified implementation for demonstration
    const { accessKeyId, secretAccessKey, roleArn } = credentials;

    if (roleArn) {
      // Use STS to assume role (GitHub OIDC integration)
      return this.assumeRoleAndCall(service, action, params, roleArn);
    } else {
      // Use direct credentials
      return this.callAWSService(service, action, params, { accessKeyId, secretAccessKey });
    }
  }

  async assumeRoleAndCall(service, action, params, roleArn) {
    // In production, use AWS SDK's STS.assumeRole
    // This is a simplified mock implementation
    console.log(`Assuming role ${roleArn} for ${service}.${action}`);

    // Mock implementation - replace with actual AWS SDK calls
    return { success: true, service, action, params };
  }

  async callAWSService(service, action, params, credentials) {
    // Mock implementation - replace with actual AWS SDK calls
    console.log(`Calling ${service}.${action} with params:`, params);
    return { success: true, service, action, params };
  }

  // ECR (Elastic Container Registry)
  async createECRRepository(userId, repositoryData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('ecr', 'createRepository', {
      repositoryName: repositoryData.name,
      imageTagMutability: repositoryData.imageTagMutability || 'MUTABLE',
      imageScanningConfiguration: {
        scanOnPush: repositoryData.scanOnPush || true
      },
      encryptionConfiguration: {
        encryptionType: 'AES256'
      }
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_ECR_REPOSITORY',
      target: 'ecr_repository',
      target_id: repositoryData.name,
      metadata: {
        repository_name: repositoryData.name,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async pushImageToECR(userId, repositoryName, imageTag, dockerfilePath) {
    const { credentials } = await this.getConnection(userId);

    // Get ECR login token
    const authResult = await this.makeRequest('ecr', 'getAuthorizationToken', {}, credentials);

    // Build and push docker image (this would involve docker commands)
    const buildResult = await this.makeRequest('docker', 'build', {
      dockerfilePath,
      tag: `${repositoryName}:${imageTag}`,
      push: true,
      registry: `${credentials.accountId}.dkr.ecr.${this.region}.amazonaws.com`
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'PUSH_ECR_IMAGE',
      target: 'ecr_image',
      target_id: `${repositoryName}:${imageTag}`,
      metadata: {
        repository_name: repositoryName,
        image_tag: imageTag,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return buildResult;
  }

  // ECS (Elastic Container Service)
  async createECSCluster(userId, clusterData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('ecs', 'createCluster', {
      clusterName: clusterData.name,
      capacityProviders: ['FARGATE', 'FARGATE_SPOT'],
      defaultCapacityProviderStrategy: [
        {
          capacityProvider: 'FARGATE',
          weight: 1
        }
      ],
      tags: clusterData.tags || []
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_ECS_CLUSTER',
      target: 'ecs_cluster',
      target_id: clusterData.name,
      metadata: {
        cluster_name: clusterData.name,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async createECSTaskDefinition(userId, taskDefData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('ecs', 'registerTaskDefinition', {
      family: taskDefData.family,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: taskDefData.cpu || '256',
      memory: taskDefData.memory || '512',
      executionRoleArn: taskDefData.executionRoleArn,
      taskRoleArn: taskDefData.taskRoleArn,
      containerDefinitions: taskDefData.containerDefinitions
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_ECS_TASK_DEFINITION',
      target: 'ecs_task_definition',
      target_id: taskDefData.family,
      metadata: {
        family: taskDefData.family,
        cpu: taskDefData.cpu,
        memory: taskDefData.memory,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async createECSService(userId, serviceData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('ecs', 'createService', {
      serviceName: serviceData.name,
      cluster: serviceData.clusterName,
      taskDefinition: serviceData.taskDefinition,
      desiredCount: serviceData.desiredCount || 1,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: serviceData.subnets,
          securityGroups: serviceData.securityGroups,
          assignPublicIp: serviceData.assignPublicIp || 'ENABLED'
        }
      },
      loadBalancers: serviceData.loadBalancers || [],
      enableExecuteCommand: serviceData.enableExecuteCommand || false
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_ECS_SERVICE',
      target: 'ecs_service',
      target_id: serviceData.name,
      metadata: {
        service_name: serviceData.name,
        cluster_name: serviceData.clusterName,
        desired_count: serviceData.desiredCount,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async updateECSService(userId, clusterName, serviceName, updates) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('ecs', 'updateService', {
      cluster: clusterName,
      service: serviceName,
      ...updates
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_ECS_SERVICE',
      target: 'ecs_service',
      target_id: serviceName,
      metadata: {
        cluster_name: clusterName,
        service_name: serviceName,
        updates,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async deployECSService(userId, deploymentData) {
    const { credentials } = await this.getConnection(userId);

    // Update service with new task definition
    const deployment = await this.makeRequest('ecs', 'updateService', {
      cluster: deploymentData.clusterName,
      service: deploymentData.serviceName,
      taskDefinition: deploymentData.taskDefinition,
      forceNewDeployment: true
    }, credentials);

    // Store deployment in database
    const dbDeployment = await Deployment.create({
      user_id: userId,
      repository_id: deploymentData.repository || '',
      deployment_id: deployment.deploymentId || `ecs-${Date.now()}`,
      environment: deploymentData.environment || 'production',
      ref: deploymentData.ref || '',
      sha: deploymentData.sha || '',
      status: 'pending',
      provider: 'aws-ecs',
      metadata: {
        aws_deployment: deployment,
        cluster_name: deploymentData.clusterName,
        service_name: deploymentData.serviceName,
        task_definition: deploymentData.taskDefinition
      }
    });

    await Audit.create({
      actor_id: userId,
      action: 'DEPLOY_ECS_SERVICE',
      target: 'deployment',
      target_id: deployment.deploymentId,
      metadata: {
        cluster_name: deploymentData.clusterName,
        service_name: deploymentData.serviceName,
        task_definition: deploymentData.taskDefinition,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return { aws: deployment, database: dbDeployment };
  }

  // RDS (Relational Database Service)
  async createRDSInstance(userId, dbData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('rds', 'createDBInstance', {
      DBInstanceIdentifier: dbData.identifier,
      DBInstanceClass: dbData.instanceClass || 'db.t3.micro',
      Engine: dbData.engine || 'postgres',
      EngineVersion: dbData.engineVersion || '14.6',
      MasterUsername: dbData.masterUsername,
      MasterUserPassword: dbData.masterPassword,
      AllocatedStorage: dbData.allocatedStorage || 20,
      StorageType: dbData.storageType || 'gp2',
      StorageEncrypted: dbData.storageEncrypted || true,
      VpcSecurityGroupIds: dbData.securityGroupIds || [],
      DBSubnetGroupName: dbData.subnetGroupName,
      MultiAZ: dbData.multiAZ || false,
      BackupRetentionPeriod: dbData.backupRetentionPeriod || 7,
      PreferredBackupWindow: dbData.preferredBackupWindow || '03:00-04:00',
      PreferredMaintenanceWindow: dbData.preferredMaintenanceWindow || 'sun:04:00-sun:05:00',
      DeletionProtection: dbData.deletionProtection || true
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_RDS_INSTANCE',
      target: 'rds_instance',
      target_id: dbData.identifier,
      metadata: {
        db_identifier: dbData.identifier,
        engine: dbData.engine,
        instance_class: dbData.instanceClass,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async createRDSSnapshot(userId, dbIdentifier, snapshotIdentifier) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('rds', 'createDBSnapshot', {
      DBSnapshotIdentifier: snapshotIdentifier,
      DBInstanceIdentifier: dbIdentifier
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_RDS_SNAPSHOT',
      target: 'rds_snapshot',
      target_id: snapshotIdentifier,
      metadata: {
        db_identifier: dbIdentifier,
        snapshot_identifier: snapshotIdentifier,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // S3 (Simple Storage Service)
  async createS3Bucket(userId, bucketData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('s3', 'createBucket', {
      Bucket: bucketData.name,
      CreateBucketConfiguration: {
        LocationConstraint: this.region !== 'us-east-1' ? this.region : undefined
      }
    }, credentials);

    // Enable versioning
    if (bucketData.versioning) {
      await this.makeRequest('s3', 'putBucketVersioning', {
        Bucket: bucketData.name,
        VersioningConfiguration: {
          Status: 'Enabled'
        }
      }, credentials);
    }

    // Set encryption
    await this.makeRequest('s3', 'putBucketEncryption', {
      Bucket: bucketData.name,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256'
            }
          }
        ]
      }
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_S3_BUCKET',
      target: 's3_bucket',
      target_id: bucketData.name,
      metadata: {
        bucket_name: bucketData.name,
        versioning: bucketData.versioning,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async uploadToS3(userId, bucketName, key, data, metadata = {}) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('s3', 'putObject', {
      Bucket: bucketName,
      Key: key,
      Body: data,
      Metadata: metadata,
      ServerSideEncryption: 'AES256'
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'UPLOAD_S3_OBJECT',
      target: 's3_object',
      target_id: `${bucketName}/${key}`,
      metadata: {
        bucket_name: bucketName,
        object_key: key,
        size: data.length,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // CloudFront (CDN)
  async createCloudFrontDistribution(userId, distributionData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('cloudfront', 'createDistribution', {
      DistributionConfig: {
        CallerReference: `shellcompany-${Date.now()}`,
        Comment: distributionData.comment || 'ShellCompany Distribution',
        DefaultCacheBehavior: {
          TargetOriginId: distributionData.originId,
          ViewerProtocolPolicy: 'redirect-to-https',
          TrustedSigners: {
            Enabled: false,
            Quantity: 0
          },
          ForwardedValues: {
            QueryString: false,
            Cookies: {
              Forward: 'none'
            }
          },
          MinTTL: 0,
          Compress: true
        },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: distributionData.originId,
              DomainName: distributionData.originDomainName,
              S3OriginConfig: {
                OriginAccessIdentity: ''
              }
            }
          ]
        },
        Enabled: true,
        PriceClass: distributionData.priceClass || 'PriceClass_100'
      }
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_CLOUDFRONT_DISTRIBUTION',
      target: 'cloudfront_distribution',
      target_id: result.Distribution?.Id,
      metadata: {
        origin_domain: distributionData.originDomainName,
        price_class: distributionData.priceClass,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // CloudWatch (Monitoring)
  async createCloudWatchDashboard(userId, dashboardData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('cloudwatch', 'putDashboard', {
      DashboardName: dashboardData.name,
      DashboardBody: JSON.stringify(dashboardData.widgets)
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_CLOUDWATCH_DASHBOARD',
      target: 'cloudwatch_dashboard',
      target_id: dashboardData.name,
      metadata: {
        dashboard_name: dashboardData.name,
        widget_count: dashboardData.widgets.length,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async createCloudWatchAlarm(userId, alarmData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('cloudwatch', 'putMetricAlarm', {
      AlarmName: alarmData.name,
      AlarmDescription: alarmData.description,
      MetricName: alarmData.metricName,
      Namespace: alarmData.namespace,
      Statistic: alarmData.statistic || 'Average',
      Period: alarmData.period || 300,
      EvaluationPeriods: alarmData.evaluationPeriods || 2,
      Threshold: alarmData.threshold,
      ComparisonOperator: alarmData.comparisonOperator,
      AlarmActions: alarmData.alarmActions || [],
      Dimensions: alarmData.dimensions || []
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_CLOUDWATCH_ALARM',
      target: 'cloudwatch_alarm',
      target_id: alarmData.name,
      metadata: {
        alarm_name: alarmData.name,
        metric_name: alarmData.metricName,
        threshold: alarmData.threshold,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Systems Manager Parameter Store
  async putParameter(userId, name, value, type = 'SecureString') {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('ssm', 'putParameter', {
      Name: name,
      Value: value,
      Type: type,
      Overwrite: true
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'PUT_SSM_PARAMETER',
      target: 'ssm_parameter',
      target_id: name,
      metadata: {
        parameter_name: name,
        type: type,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async getParameter(userId, name, withDecryption = true) {
    const { credentials } = await this.getConnection(userId);

    return this.makeRequest('ssm', 'getParameter', {
      Name: name,
      WithDecryption: withDecryption
    }, credentials);
  }

  // IAM (Identity and Access Management)
  async createRole(userId, roleData) {
    const { credentials } = await this.getConnection(userId);

    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: roleData.service || 'ecs-tasks.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    };

    if (roleData.githubRepo) {
      // Add OIDC trust for GitHub Actions
      trustPolicy.Statement.push({
        Effect: 'Allow',
        Principal: {
          Federated: 'arn:aws:iam::' + credentials.accountId + ':oidc-provider/token.actions.githubusercontent.com'
        },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com'
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${roleData.githubRepo}:*`
          }
        }
      });
    }

    const result = await this.makeRequest('iam', 'createRole', {
      RoleName: roleData.name,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Description: roleData.description,
      MaxSessionDuration: roleData.maxSessionDuration || 3600
    }, credentials);

    // Attach policies
    if (roleData.policies) {
      for (const policy of roleData.policies) {
        await this.makeRequest('iam', 'attachRolePolicy', {
          RoleName: roleData.name,
          PolicyArn: policy
        }, credentials);
      }
    }

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_IAM_ROLE',
      target: 'iam_role',
      target_id: roleData.name,
      metadata: {
        role_name: roleData.name,
        github_repo: roleData.githubRepo,
        policies: roleData.policies,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Cost and billing
  async getCostAndUsage(userId, startDate, endDate) {
    const { credentials } = await this.getConnection(userId);

    return this.makeRequest('ce', 'getCostAndUsage', {
      TimePeriod: {
        Start: startDate,
        End: endDate
      },
      Granularity: 'DAILY',
      Metrics: ['BlendedCost', 'UsageQuantity']
    }, credentials);
  }

  // Health checks and status
  async getServiceHealth(userId, serviceName) {
    const { credentials } = await this.getConnection(userId);

    // This would check various AWS services status
    const checks = {
      ecs: await this.makeRequest('ecs', 'listServices', { cluster: serviceName }, credentials),
      rds: await this.makeRequest('rds', 'describeDBInstances', {}, credentials),
      s3: await this.makeRequest('s3', 'listBuckets', {}, credentials)
    };

    return {
      status: 'healthy',
      checks,
      timestamp: new Date()
    };
  }

  // CloudFormation integration
  async deployCloudFormationStack(userId, stackData) {
    const { credentials } = await this.getConnection(userId);

    const result = await this.makeRequest('cloudformation', 'createStack', {
      StackName: stackData.name,
      TemplateBody: stackData.template,
      Parameters: stackData.parameters || [],
      Capabilities: stackData.capabilities || ['CAPABILITY_IAM'],
      Tags: stackData.tags || []
    }, credentials);

    await Audit.create({
      actor_id: userId,
      action: 'DEPLOY_CLOUDFORMATION_STACK',
      target: 'cloudformation_stack',
      target_id: stackData.name,
      metadata: {
        stack_name: stackData.name,
        region: this.region
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Helper methods for deployment status updates
  async updateDeploymentStatus(deploymentId, status) {
    await Deployment.update(
      {
        status,
        deployed_at: status === 'running' ? new Date() : null
      },
      { where: { deployment_id: deploymentId, provider: 'aws-ecs' } }
    );
  }

  mapAWSStatus(awsStatus) {
    const statusMap = {
      'PENDING': 'pending',
      'RUNNING': 'running',
      'STOPPED': 'stopped',
      'PROVISIONING': 'building',
      'DEPROVISIONING': 'stopping',
      'ACTIVE': 'running',
      'FAILED': 'failed'
    };
    return statusMap[awsStatus] || 'unknown';
  }
}

module.exports = new AWSService();