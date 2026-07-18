import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as path from 'path';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ──────────────────────────────────────────────
    // 1. DynamoDB Single Table (On-Demand = $0 idle)
    // ──────────────────────────────────────────────
    const table = new dynamodb.Table(this, 'FxSovereignTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_IMAGE, // Enable stream to trigger asynchronous processes
    });

    // ──────────────────────────────────────────────
    // 1.1 FxForeignEntitiesTable (Separate Table for Customers/Suppliers)
    // ──────────────────────────────────────────────
    const foreignEntitiesTable = new dynamodb.Table(this, 'FxForeignEntitiesTable', {
      partitionKey: { name: 'entity_type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'entity_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ──────────────────────────────────────────────
    // 2. S3 Bucket for receipts & voice recordings
    // ──────────────────────────────────────────────
    const rawBucket = new s3.Bucket(this, 'FxRawDataBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ──────────────────────────────────────────────
    // 3. Cognito User Pool (Email Sign-in, Private Only)
    // ──────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'FxUserPool', {
      userPoolName: 'FxUserPool', // Explicit physical name
      selfSignUpEnabled: false, // Disabled self signup for private sovereign security
      signInAliases: { email: true },
      autoVerify: { email: true },
      userInvitation: {
        emailSubject: 'Welcome to FX Books - Your Temporary Password',
        emailBody: `
          <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h3 style="color: #1e293b;">Kia ora {username},</h3>
            <p style="color: #475569; line-height: 1.6;">Welcome to your private financial data island.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px dashed #cbd5e1; margin: 20px 0;">
              <span style="color: #64748b; font-size: 14px;">Your temporary password is:</span>
              <div style="font-size: 20px; font-weight: bold; color: #7b2cbf; margin-top: 5px; font-family: monospace;">{####}</div>
            </div>
            <p style="color: #475569; line-height: 1.6;">Please use this temporary password to log in to your dashboard, where you will be prompted to set your permanent password.</p>
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">Best regards,<br/><strong>FX Books Team</strong></p>
          </div>
        `,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
    });

    // ── 3.1 Cognito User Groups (OWNER, ADMIN, STAFF) ──
    new cognito.CfnUserPoolGroup(this, 'UserPoolOwnerGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'OWNER',
      description: 'Owner - Full administrative and financial control',
      precedence: 1,
    });

    new cognito.CfnUserPoolGroup(this, 'UserPoolAdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'ADMIN',
      description: 'Admin - Full transaction management but no opening balance access',
      precedence: 2,
    });

    new cognito.CfnUserPoolGroup(this, 'UserPoolStaffGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'STAFF',
      description: 'Staff - Create-only transaction recording',
      precedence: 3,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'FxUserPoolClient', {
      userPool,
      userPoolClientName: 'FxUserPoolClient', // Explicit physical name
      generateSecret: false, // Must be false for web/PWA clients
      authFlows: {
        userSrp: true, // Secure Remote Password protocol
        adminUserPassword: true, // Enable admin user password auth for CLI E2E testing
      },
    });

    // ──────────────────────────────────────────────
    // 4. Lambda — Organizations API
    // ──────────────────────────────────────────────
    const orgsLambda = new lambdaNodejs.NodejsFunction(this, 'FxOrgsLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../backend/src/orgs/handler.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../package-lock.json'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: rawBucket.bucketName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        FOREIGN_ENTITIES_TABLE_NAME: foreignEntitiesTable.tableName,
      },
    });

    table.grantReadWriteData(orgsLambda);
    foreignEntitiesTable.grantReadWriteData(orgsLambda);
    rawBucket.grantReadWrite(orgsLambda);

    // Bedrock access for future AI receipt extraction
    orgsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:ap-southeast-2::foundation-model/amazon.nova-lite-*'],
    }));

    // Cognito Identity Provider access for Staff Management API (Admin Create/Delete/Get/List)
    orgsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers',
        'cognito-idp:AdminListGroupsForUser',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminUserGlobalSignOut',
      ],
      resources: [userPool.userPoolArn],
    }));

    // Function URL — direct HTTPS endpoint, no API Gateway cost
    const fnUrl = orgsLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: ['content-type', 'authorization', 'x-api-key'],
        allowedMethods: [lambda.HttpMethod.ALL],
      },
    });

    // ──────────────────────────────────────────────
    // 4.1 Lambda — Streams Processor (Asynchronous Contacts Collector)
    // ──────────────────────────────────────────────
    const streamLambda = new lambdaNodejs.NodejsFunction(this, 'FxStreamLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../backend/src/streams/handler.ts'),
      handler: 'handler',
      projectRoot: path.join(__dirname, '../..'),
      depsLockFilePath: path.join(__dirname, '../../package-lock.json'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        FOREIGN_ENTITIES_TABLE_NAME: foreignEntitiesTable.tableName,
      },
    });

    // Grant Stream read access and FxForeignEntitiesTable write access to the streams consumer lambda
    table.grantStreamRead(streamLambda);
    foreignEntitiesTable.grantReadWriteData(streamLambda);

    // Connect DynamoDB streams event source map to the stream processor
    streamLambda.addEventSource(new lambdaEventSources.DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 5,
      retryAttempts: 3,
    }));

    // ──────────────────────────────────────────────
    // Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: rawBucket.bucketName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'OrgsApiUrl', { value: fnUrl.url });
    new cdk.CfnOutput(this, 'ForeignEntitiesTableName', { value: foreignEntitiesTable.tableName });
  }
}
