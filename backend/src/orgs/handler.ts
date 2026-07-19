import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, TABLE_NAME } from '../common/dynamo';
import {
  PutCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getGstRateForDate, clearGstCache } from '../common/gst';
import { getOrSeedGlobalMappings } from '../common/mappings';
import {
  createTransaction,
  batchImportTransactions,
  listTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  ServiceError,
} from '../transactions/service';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// ── Cognito Verifier Initialization ─────────────
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'dummy-pool-id',
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID || 'dummy-client-id',
});

const cognitoClient = new CognitoIdentityProviderClient({});
const bedrock = new BedrockRuntimeClient({ region: 'ap-southeast-2' });
const FOREIGN_ENTITIES_TABLE_NAME = process.env.FOREIGN_ENTITIES_TABLE_NAME || '';

// ── Types ───────────────────────────────────────
interface OrgMetadata {
  id: string;
  name: string;
  ird_number: string;
  entity_type: 'sole_trader' | 'company' | 'ltc' | 'trust' | 'partnership';
  gst_registered: boolean;
  gst_basis?: 'payments' | 'invoice';
  gst_period?: '1_month' | '2_months' | '6_months';
  tax_year_end_month: number;
  bank_accounts?: BankAccount[];
  created_by: string; // 顺手塞入创建者审计字段，但不做越权卡线
  nzbn?: string;
  address?: string;
  payroll_cycle?: 'weekly' | 'fortnightly' | 'monthly';
  categories?: string[];
  static_rules?: {
    pattern: string;
    category: string;
  }[];
  conversion_date?: string;
}

interface BankOpeningDetail {
  balance: number;
  conversion_date: string; // 每个账户拥有自己独立的基准日
}

interface OpeningBalancesInput {
  bank_balances?: Record<string, BankOpeningDetail>; // 键为卡号，值为明细对象
  ar_balances?: Record<string, number>;
  ap_balances?: Record<string, number>;
}

interface BankAccount {
  account_name: string;
  account_number: string;
  bank_name: string;
}

// ── Helpers ─────────────────────────────────────
function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ── Handler ─────────────────────────────────────
export async function handler(event: {
  requestContext: { http: { method: string; path: string } };
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  // 1. Authenticate Request using Cognito JWT
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);
  let userId: string;

  try {
    const payload = await verifier.verify(token);
    userId = payload.sub; // 获取当前操作用户的 Cognito sub ID
  } catch (jwtErr) {
    return json(401, { error: 'Unauthorized: Invalid token' });
  }

  // ── 1.2 Org-Level Membership & RBAC Guard ──
  const orgIdMatch = path.match(/^\/orgs\/([a-f0-9-]+)(?:\/|$)/);
  let userRole: 'OWNER' | 'ADMIN' | 'STAFF' | undefined;

  if (orgIdMatch) {
    const orgId = orgIdMatch[1];

    const membershipRes = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `ORG#${orgId}`,
      },
    }));

    if (!membershipRes.Item) {
      return json(403, { error: `Forbidden: You do not belong to organisation ${orgId}` });
    }

    userRole = membershipRes.Item.role as 'OWNER' | 'ADMIN' | 'STAFF';

    // ── RBAC Rule 1: View Organisation details (GET /orgs/:org_id) ──
    if (path === `/orgs/${orgId}`) {
      if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
        return json(403, { error: 'Forbidden: Insufficient permissions to view organisation details.' });
      }
    }

    // ── RBAC Rule 2: Transactions API access controls ──
    if (path.startsWith(`/orgs/${orgId}/transactions`)) {
      // STAFF can only perform POST /transactions. All other actions (GET, PUT, DELETE) are forbidden.
      if (userRole === 'STAFF' && method !== 'POST') {
        return json(403, { error: 'Forbidden: STAFF members are only permitted to write (create) transaction records.' });
      }
    }
  }

  // 2. Decode Request Body
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body || '{}';

  try {
    // GET /config/gst — Get global GST rules
    if (method === 'GET' && path === '/config/gst') {
      const response = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'CONFIG#GLOBAL',
            sk: 'TAX#NZ#GST',
          },
        })
      );
      if (response.Item) {
        return json(200, response.Item);
      }
      return json(200, {
        rate_history: [
          { rate: 0.15, effective_from: '2010-10-01', effective_to: null }
        ]
      });
    }

    // PUT /config/gst — Update global GST rules
    if (method === 'PUT' && path === '/config/gst') {
      const payload = JSON.parse(rawBody);
      if (!payload.rate_history || !Array.isArray(payload.rate_history)) {
        return json(400, { error: 'rate_history array is required' });
      }

      const history = payload.rate_history.map((p: any) => ({
        rate: Number(p.rate),
        effective_from: String(p.effective_from).trim(),
        effective_to: p.effective_to ? String(p.effective_to).trim() : null
      }));

      for (const p of history) {
        if (!p.effective_from) {
          return json(400, { error: 'effective_from is required for all periods' });
        }
        if (p.effective_to && p.effective_from.localeCompare(p.effective_to) > 0) {
          return json(400, { error: `effective_from cannot be after effective_to for rate ${p.rate}` });
        }
        if (isNaN(p.rate) || p.rate < 0 || p.rate > 1) {
          return json(400, { error: `invalid rate value: ${p.rate}. Must be decimal ratio between 0.0 and 1.0.` });
        }
      }

      // Check overlap conflicts
      for (let i = 0; i < history.length; i++) {
        const p1 = history[i];
        const s1 = p1.effective_from;
        const e1 = p1.effective_to || '9999-12-31';

        for (let j = i + 1; j < history.length; j++) {
          const p2 = history[j];
          const s2 = p2.effective_from;
          const e2 = p2.effective_to || '9999-12-31';

          if (s1 <= e2 && s2 <= e1) {
            return json(400, {
              error: `GST rate periods overlap: [${p1.effective_from} to ${p1.effective_to || 'open-ended'}] overlaps with [${p2.effective_from} to ${p2.effective_to || 'open-ended'}]`
            });
          }
        }
      }

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: 'CONFIG#GLOBAL',
            sk: 'TAX#NZ#GST',
            country: 'NZ',
            tax_name: 'GST',
            default_rate: history[0]?.rate || 0.15,
            rate_history: history,
            updated_at: new Date().toISOString()
          },
        })
      );

      // Invalidate the cache
      clearGstCache();

      return json(200, { message: 'GST config updated' });
    }

    // GET /config/mappings — Get all global CSV mappings
    if (method === 'GET' && path === '/config/mappings') {
      const mappings = await getOrSeedGlobalMappings();
      return json(200, mappings);
    }

    // PUT /config/mappings/:bankName/:cardType — Save/update a global mapping
    const mappingMatch = path.match(/^\/config\/mappings\/([^/]+)\/([^/]+)$/);
    if (method === 'PUT' && mappingMatch) {
      const bankName = decodeURIComponent(mappingMatch[1]);
      const cardType = decodeURIComponent(mappingMatch[2]);
      const payload = JSON.parse(rawBody);

      if (!payload.format_name || !payload.date_column || !payload.amount_column || !payload.vendor_column) {
        return json(400, { error: 'format_name, date_column, amount_column, and vendor_column are required' });
      }

      const item = {
        pk: 'CONFIG#GLOBAL',
        sk: `MAPPING#${bankName}#${cardType}`,
        bank_name: bankName,
        card_type: cardType,
        format_name: payload.format_name,
        date_column: payload.date_column,
        amount_column: payload.amount_column,
        vendor_column: payload.vendor_column,
        description_columns: payload.description_columns || [],
        indicator_mode: payload.indicator_mode || 'auto',
        indicator_column: payload.indicator_column,
        debit_value: payload.debit_value,
        credit_value: payload.credit_value,
        updated_at: new Date().toISOString()
      };

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );
      return json(200, item);
    }

    // GET /config/workflow — Get global workflow config (categories + static_rules)
    if (method === 'GET' && path === '/config/workflow') {
      const response = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'CONFIG#GLOBAL',
            sk: 'WORKFLOW#SETTINGS',
          },
        })
      );
      if (response.Item) {
        return json(200, {
          categories: response.Item.categories || [],
          static_rules: response.Item.static_rules || [],
        });
      }
      // Return sensible defaults if not yet configured
      return json(200, {
        categories: [
          'Sales', 'Consulting Income', 'Rent', 'Utilities',
          'Internet & Phone', 'Travel', 'Motor Vehicle Expenses',
          'Software', 'Wages', 'General Expenses', 'Uncategorized',
        ],
        static_rules: [],
      });
    }

    // PUT /config/workflow — Update global workflow config (categories + static_rules)
    if (method === 'PUT' && path === '/config/workflow') {
      const payload = JSON.parse(rawBody);

      if (!Array.isArray(payload.categories)) {
        return json(400, { error: 'categories must be an array of strings' });
      }
      if (!Array.isArray(payload.static_rules)) {
        return json(400, { error: 'static_rules must be an array' });
      }
      for (const rule of payload.static_rules) {
        if (!rule.pattern || !rule.category) {
          return json(400, { error: 'Each static rule must have a pattern and a category' });
        }
      }

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: 'CONFIG#GLOBAL',
            sk: 'WORKFLOW#SETTINGS',
            categories: payload.categories.map((c: any) => String(c).trim()).filter(Boolean),
            static_rules: payload.static_rules.map((r: any) => ({
              pattern: String(r.pattern).trim(),
              category: String(r.category).trim(),
            })),
            updated_at: new Date().toISOString(),
          },
        })
      );
      return json(200, { message: 'Workflow config updated' });
    }

    // POST /orgs — Create a new organisation
    if (method === 'POST' && path === '/orgs') {
      const rawPayload = JSON.parse(rawBody);
      const payload: Partial<OrgMetadata> = rawPayload;
      const openings: OpeningBalancesInput = rawPayload.opening_balances || {};

      // 校验中移除了全局 conversion_date 的硬性限制
      if (!payload.name || !payload.entity_type || !payload.ird_number) {
        return json(400, { error: 'name, entity_type, and ird_number are required' });
      }

      const id = randomUUID();
      const orgPk = `ORG#${id}`;

      // ── 1. 写入 METADATA 记录 ──
      const metadataItem = {
        pk: orgPk,
        sk: 'METADATA',
        id,
        created_by: userId,
        name: payload.name,
        ird_number: payload.ird_number,
        entity_type: payload.entity_type,
        gst_registered: payload.gst_registered ?? false,
        gst_basis: payload.gst_basis,
        gst_period: payload.gst_period,
        tax_year_end_month: payload.tax_year_end_month ?? 3,
        bank_accounts: payload.bank_accounts ?? [],
        conversion_date: payload.conversion_date || '2026-04-01',
        created_at: new Date().toISOString(),
      };

      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: metadataItem }));

      // ── 1.1 写入首条 OWNER Membership 关系记录 ──
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `USER#${userId}`,
          sk: `ORG#${id}`,
          role: 'OWNER',
          assigned_at: new Date().toISOString(),
          assigned_by: 'SYSTEM',
        },
      }));

      // ── 2. 写入银行账户期初余额与账户专属基准日 ──
      if (openings.bank_balances) {
        for (const [accNum, detail] of Object.entries(openings.bank_balances)) {
          const convDate = detail.conversion_date || payload.conversion_date;
          if (!convDate) {
            return json(400, { error: `conversion_date is required for bank account: ${accNum}` });
          }

          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: orgPk,
              sk: `OPENING#BANK#${accNum}`,
              account_number: accNum,
              balance: detail.balance,
              conversion_date: convDate, // 基准日落库至各账户中
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      // ── 3. 写入应收账款（客户历史欠款）期初 ──
      if (openings.ar_balances) {
        for (const [customerName, amount] of Object.entries(openings.ar_balances)) {
          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: orgPk,
              sk: `OPENING#AR#${customerName}`,
              customer_name: customerName,
              amount_owed: amount,
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      // ── 4. 写入应付账款（欠供应商钱）期初 ──
      if (openings.ap_balances) {
        for (const [vendorName, amount] of Object.entries(openings.ap_balances)) {
          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: orgPk,
              sk: `OPENING#AP#${vendorName}`,
              vendor_name: vendorName,
              amount_to_pay: amount,
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      return json(201, { org_id: id, message: "Organisation and opening balances initialized successfully." });
    }

    // GET /bootstrap — Lightweight user initialization & config payload
    if (method === 'GET' && path === '/bootstrap') {
      const systemConfigRes = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: 'CONFIG#GLOBAL',
          sk: 'SYSTEM'
        }
      }));

      const genesisDone = systemConfigRes.Item?.genesis_done === true;
      const activeRate = await getGstRateForDate(new Date().toISOString());

      return json(200, {
        genesis_done: genesisDone,
        config: {
          gst_rate: activeRate,
          country: 'NZ'
        }
      });
    }

    // POST /bootstrap — Explicit client-initiated completion of genesis state
    if (method === 'POST' && path === '/bootstrap') {
      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: 'CONFIG#GLOBAL',
          sk: 'SYSTEM',
          genesis_done: true,
          updated_at: new Date().toISOString()
        }
      }));

      return json(200, { success: true, message: "Genesis state completed successfully." });
    }

    // ── 5. STAFF MEMBERS MANAGEMENT (Sovereign flat user management & PII physical isolation) ──

    // 5.1 GET /staff - List all staff members
    if (method === 'GET' && path === '/staff') {
      try {
        // A. 从 DynamoDB 中拉取所有员工财务明细
        const { Items: staffItems = [] } = await ddb.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: {
            ':pk': 'STAFF',
          },
        }));

        // B. 从 Cognito 中拉取所有用户属性以拼装 PII 属性
        const cognitoRes = await cognitoClient.send(new ListUsersCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
        }));

        const cognitoUsers = cognitoRes.Users || [];

        // 将 Cognito 用户转成 Map [sub -> UserDetails] 方便快速查找
        const dbStaffMap = new Map<string, any>();
        for (const item of staffItems) {
          const sub = item.sk.substring(5); // 从 USER#<sub> 中截取 sub
          dbStaffMap.set(sub, item);
        }

        // C. 以 Cognito 账号为核心主体，并发查询角色组并匹配挂载其 DynamoDB 中的财务信息
        const staffList = await Promise.all(cognitoUsers.map(async u => {
          const sub = u.Attributes?.find(a => a.Name === 'sub')?.Value || '';
          const email = u.Attributes?.find(a => a.Name === 'email')?.Value || 'N/A';
          const givenName = u.Attributes?.find(a => a.Name === 'given_name')?.Value || '';
          const familyName = u.Attributes?.find(a => a.Name === 'family_name')?.Value || '';
          const fullName = `${givenName} ${familyName}`.trim() || u.Username || 'Unknown User';

          let isOwner = false;
          let userGroups: string[] = [];
          try {
            const groupsRes = await cognitoClient.send(new AdminListGroupsForUserCommand({
              UserPoolId: process.env.COGNITO_USER_POOL_ID,
              Username: sub
            }));
            userGroups = (groupsRes.Groups || []).map(g => g.GroupName || '').filter(Boolean);
            isOwner = userGroups.includes('OWNER');
          } catch (groupsErr) {
            console.error(`Failed to list groups for user ${sub}:`, groupsErr);
          }

          const dbItem = dbStaffMap.get(sub);

          return {
            id: sub,
            name: fullName,
            email,
            position: isOwner ? 'Instance Owner' : (dbItem?.position || 'System Member'),
            employment_model: dbItem?.employment_model || 'employee',
            tax_code: dbItem?.tax_code || 'N/A',
            ird_number: dbItem?.ird_number || 'N/A',
            hourly_rate: dbItem?.hourly_rate !== undefined ? Number(dbItem.hourly_rate) : 0,
            bank_account: dbItem?.bank_account || 'N/A',
            status: dbItem?.status || 'active',
            created_at: dbItem?.created_at || u.UserCreateDate?.toISOString() || new Date().toISOString(),
            is_owner: isOwner,
            groups: userGroups
          };
        }));

        return json(200, { staff: staffList });
      } catch (err: any) {
        return json(500, { error: `Failed to retrieve staff ledger: ${err.message}` });
      }
    }

    // 5.2 POST /staff - Add a new staff member (Cognito Account Invite + DynamoDB Financial record)
    if (method === 'POST' && path === '/staff') {
      try {
        const payload = JSON.parse(rawBody);
        const { email, name, position, employment_model, tax_code, ird_number, hourly_rate, bank_account, user_group } = payload;

        if (!email || !name || !position || !employment_model || !tax_code || !ird_number || !hourly_rate || !bank_account) {
          return json(400, { error: 'Missing required staff fields' });
        }

        // Validate user_group: required, and must not be OWNER
        if (!user_group) {
          return json(400, { error: 'user_group is required. Please assign ADMIN or STAFF.' });
        }
        if (!['ADMIN', 'STAFF'].includes(user_group)) {
          return json(400, { error: 'Invalid user_group. Only ADMIN or STAFF can be assigned.' });
        }

        // 解析名字
        const nameParts = name.trim().split(/\s+/);
        const givenName = nameParts.slice(0, -1).join(' ') || nameParts[0];
        const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ' ';

        // A. 在 Cognito 中创建新用户 (发送临时密码激活邮件)
        const cognitoUser = await cognitoClient.send(new AdminCreateUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'given_name', Value: givenName },
            { Name: 'family_name', Value: familyName },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }));

        const sub = cognitoUser.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
        if (!sub) {
          throw new Error('Cognito account created but no sub ID was returned.');
        }

        // B. 在 DynamoDB 中写入员工财务档案 (物理隔绝 name 和 email)
        const staffItem = {
          pk: 'STAFF',
          sk: `USER#${sub}`,
          id: sub,
          position,
          employment_model,
          tax_code,
          ird_number,
          hourly_rate: Number(hourly_rate),
          bank_account,
          status: 'active',
          created_at: new Date().toISOString(),
        };

        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: staffItem,
        }));

        // C. 将用户加入指定的 Cognito User Group
        await cognitoClient.send(new AdminAddUserToGroupCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: sub,
          GroupName: user_group,
        }));

        return json(201, { staff_id: sub, message: 'Staff member invited and registered successfully.' });
      } catch (err: any) {
        return json(500, { error: `Failed to create staff member: ${err.message}` });
      }
    }

    // 5.3 GET /staff/:staffId - View single staff profile & execution history
    const staffIdMatch = path.match(/^\/staff\/([a-f0-9-]+)$/);
    if (method === 'GET' && staffIdMatch) {
      try {
        const staffId = staffIdMatch[1];

        // A. 优先调用 Cognito 获取姓名与邮箱，证实用户存在
        const cognitoUser = await cognitoClient.send(new AdminGetUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: staffId, // 用 Cognito sub ID 查询
        }));

        const email = cognitoUser.UserAttributes?.find(a => a.Name === 'email')?.Value;
        const givenName = cognitoUser.UserAttributes?.find(a => a.Name === 'given_name')?.Value || '';
        const familyName = cognitoUser.UserAttributes?.find(a => a.Name === 'family_name')?.Value || '';
        const fullName = `${givenName} ${familyName}`.trim() || 'Unknown User';

        let userGroups: string[] = [];
        try {
          const groupsRes = await cognitoClient.send(new AdminListGroupsForUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: staffId
          }));
          userGroups = (groupsRes.Groups || []).map(g => g.GroupName || '').filter(Boolean);
        } catch (groupsErr) {
          console.error(`Failed to list groups for user ${staffId}:`, groupsErr);
        }

        // B. 抓取 DynamoDB 中的财务明细 (若没有则优雅漏出默认属性)
        const dbRes = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'STAFF',
            sk: `USER#${staffId}`
          }
        }));

        const dbItem = dbRes.Item || {};
        const hourlyRate = dbItem.hourly_rate !== undefined ? Number(dbItem.hourly_rate) : 0;

        // C. 生成 Mock 发行历史 (Execution History)
        const executionHistory = hourlyRate > 0 ? [
          {
            cycle: '16 Jun - 30 Jun 2026',
            gross: hourlyRate * 80,
            paye: Math.round(hourlyRate * 80 * 0.17 * 100) / 100,
            net: Math.round(hourlyRate * 80 * 0.83 * 100) / 100,
            status: 'SETTLED'
          },
          {
            cycle: '01 Jun - 15 Jun 2026',
            gross: hourlyRate * 80,
            paye: Math.round(hourlyRate * 80 * 0.17 * 100) / 100,
            net: Math.round(hourlyRate * 80 * 0.83 * 100) / 100,
            status: 'SETTLED'
          }
        ] : [];

        const isOwner = userGroups.includes('OWNER');

        // D. Query all organisation memberships for this staff member
        const { Items: orgMemberships = [] } = await ddb.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${staffId}`,
            ':sk_prefix': 'ORG#',
          },
        }));

        const orgList = [];
        for (const membership of orgMemberships) {
          const orgId = membership.sk.substring(4); // Remove 'ORG#' prefix
          const role = membership.role;
          try {
            const { Items: orgItems = [] } = await ddb.send(new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: 'pk = :pk',
              ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
            }));

            const metadataItem = orgItems.find(item => item.sk === 'METADATA');
            if (metadataItem) {
              const bank_accounts = metadataItem.bank_accounts || [];

              // Get bank balances
              const bankBalancesObj: Record<string, any> = {};
              orgItems
                .filter(item => item.sk.startsWith('OPENING#BANK#'))
                .forEach(item => {
                  const accNum = item.sk.substring(13);
                  bankBalancesObj[accNum] = {
                    balance: item.balance,
                    conversion_date: item.conversion_date,
                  };
                });

              orgList.push({
                id: orgId,
                name: metadataItem.name,
                entity_type: metadataItem.entity_type,
                ird_number: metadataItem.ird_number,
                gst_registered: metadataItem.gst_registered,
                gst_basis: metadataItem.gst_basis,
                gst_period: metadataItem.gst_period,
                role: role,
                bank_accounts: bank_accounts,
                opening_balances: {
                  bank_balances: bankBalancesObj
                }
              });
            }
          } catch (orgErr) {
            console.error(`Failed to fetch org details for ${orgId}:`, orgErr);
          }
        }

        return json(200, {
          id: staffId,
          name: fullName,
          email,
          position: isOwner ? 'Instance Owner' : (dbItem.position || 'System Member'),
          employment_model: dbItem.employment_model || 'employee',
          tax_code: dbItem.tax_code || 'N/A',
          ird_number: dbItem.ird_number || 'N/A',
          hourly_rate: hourlyRate,
          bank_account: dbItem.bank_account || 'N/A',
          status: dbItem.status || 'active',
          created_at: dbItem.created_at || new Date().toISOString(),
          execution_history: executionHistory,
          is_owner: isOwner,
          groups: userGroups,
          organisations: orgList
        });
      } catch (err: any) {
        if (err.name === 'UserNotFoundException') {
          return json(404, { error: 'Staff account has been deprovisioned in Cognito.' });
        }
        return json(500, { error: `Failed to retrieve staff details: ${err.message}` });
      }
    }

    // 5.4 PUT /staff/:staffId - Update staff attributes & financial parameters
    if (method === 'PUT' && staffIdMatch) {
      try {
        const staffId = staffIdMatch[1];
        const payload = JSON.parse(rawBody);
        const { name, position, employment_model, tax_code, ird_number, hourly_rate, bank_account, user_group } = payload;

        if (!name || !position || !employment_model || !tax_code || !ird_number || !hourly_rate || !bank_account) {
          return json(400, { error: 'Missing required update fields' });
        }

        // Validate user_group if provided: must be OWNER, ADMIN or STAFF
        if (user_group && !['OWNER', 'ADMIN', 'STAFF'].includes(user_group)) {
          return json(400, { error: 'Invalid user_group. Only OWNER, ADMIN or STAFF can be assigned.' });
        }

        // A. 验证 Cognito 用户是否存在
        await cognitoClient.send(new AdminGetUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: staffId
        }));

        // B. 同步修改 Cognito 中的姓名属性
        const nameParts = name.trim().split(/\s+/);
        const givenName = nameParts.slice(0, -1).join(' ') || nameParts[0];
        const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ' ';

        await cognitoClient.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: staffId,
          UserAttributes: [
            { Name: 'given_name', Value: givenName },
            { Name: 'family_name', Value: familyName },
          ],
        }));

        // C. 更新/创建 DynamoDB 中的财务信息 (物理隔离)
        const updatedItem = {
          pk: 'STAFF',
          sk: `USER#${staffId}`,
          id: staffId,
          position,
          employment_model,
          tax_code,
          ird_number,
          hourly_rate: Number(hourly_rate),
          bank_account,
          status: 'active',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        const dbRes = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'STAFF',
            sk: `USER#${staffId}`
          }
        }));
        if (dbRes.Item && dbRes.Item.created_at) {
          updatedItem.created_at = dbRes.Item.created_at;
        }

        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: updatedItem
        }));

        // D. 如果指定了 user_group，先移出旧组，再加入新组（单一组制）
        if (user_group) {
          let groupActuallyChanged = false;
          try {
            const currentGroupsRes = await cognitoClient.send(new AdminListGroupsForUserCommand({
              UserPoolId: process.env.COGNITO_USER_POOL_ID,
              Username: staffId,
            }));
            const allGroups = (currentGroupsRes.Groups || [])
              .map(g => g.GroupName || '')
              .filter(Boolean);

            const isTargetOwner = allGroups.includes('OWNER');

            if (isTargetOwner) {
              console.log(`[Auth] User ${staffId} is an OWNER. Group update skipped.`);
            } else {
              if (user_group === 'OWNER') {
                return json(400, { error: 'Cannot elevate a regular staff to OWNER group.' });
              }

              const currentGroups = allGroups.filter(g => g !== 'OWNER');

              for (const oldGroup of currentGroups) {
                if (oldGroup !== user_group) {
                  await cognitoClient.send(new AdminRemoveUserFromGroupCommand({
                    UserPoolId: process.env.COGNITO_USER_POOL_ID,
                    Username: staffId,
                    GroupName: oldGroup,
                  }));
                  groupActuallyChanged = true;
                }
              }

              if (!currentGroups.includes(user_group)) {
                await cognitoClient.send(new AdminAddUserToGroupCommand({
                  UserPoolId: process.env.COGNITO_USER_POOL_ID,
                  Username: staffId,
                  GroupName: user_group,
                }));
                groupActuallyChanged = true;
              }
            }

            // E. Group 实际发生变更时，revoke 用户的所有 Refresh Token，强制重新登录
            if (groupActuallyChanged) {
              try {
                await cognitoClient.send(new AdminUserGlobalSignOutCommand({
                  UserPoolId: process.env.COGNITO_USER_POOL_ID,
                  Username: staffId,
                }));
                console.log(`[Auth] Session revoked for user ${staffId} after group change.`);
              } catch (signOutErr) {
                console.error(`[Auth] Failed to revoke session for ${staffId}:`, signOutErr);
              }
            }
          } catch (groupErr) {
            console.error(`Failed to update user group for ${staffId}:`, groupErr);
          }
        }

        return json(200, { message: 'Staff profile updated successfully.' });
      } catch (err: any) {
        if (err.name === 'UserNotFoundException') {
          return json(404, { error: 'Staff account has been deprovisioned in Cognito.' });
        }
        return json(500, { error: `Failed to update staff member: ${err.message}` });
      }
    }

    // 5.5 DELETE /staff/:staffId - Deprovision Cognito account and delete DynamoDB record
    if (method === 'DELETE' && staffIdMatch) {
      try {
        const staffId = staffIdMatch[1];

        // Strict self-deletion gate block
        if (staffId === userId) {
          return json(400, { error: 'Self-deletion rejected: You cannot deprovision your own profile.' });
        }

        // Prevent deletion of users who are members of the OWNER group
        try {
          const targetGroupsRes = await cognitoClient.send(new AdminListGroupsForUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: staffId
          }));
          const targetIsOwner = (targetGroupsRes.Groups || []).some(g => g.GroupName === 'OWNER');
          if (targetIsOwner) {
            return json(400, { error: 'Deprovisioning rejected: Users in the OWNER group cannot be deleted.' });
          }
        } catch (groupsCheckErr) {
          console.warn(`Failed to inspect Cognito groups for target user ${staffId}:`, groupsCheckErr);
        }

        // B. 在 Cognito 中物理删除用户 (切断登录)
        try {
          await cognitoClient.send(new AdminDeleteUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: staffId
          }));
        } catch (cognitoErr: any) {
          // 如果用户已经被管理员手动从 Cognito 控制台删了，放行
          if (cognitoErr.name !== 'UserNotFoundException') {
            throw cognitoErr;
          }
        }

        // C. 物理删除 DynamoDB 里的员工档案行
        await ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'STAFF',
            sk: `USER#${staffId}`
          }
        }));

        return json(200, { message: 'Staff member deprovisioned and deleted successfully.' });
      } catch (err: any) {
        return json(500, { error: `Failed to delete staff member: ${err.message}` });
      }
    }

    // 5.6 POST /staff/:staffId/orgs - Assign staff member to an organisation
    const staffOrgsMatch = path.match(/^\/staff\/([a-f0-9-]+)\/orgs$/);
    if (method === 'POST' && staffOrgsMatch) {
      try {
        const targetStaffId = staffOrgsMatch[1];
        const payload = JSON.parse(rawBody);
        const { org_id, role = 'STAFF' } = payload;

        if (!org_id) {
          return json(400, { error: 'Missing org_id' });
        }

        if (role !== 'ADMIN' && role !== 'STAFF') {
          return json(400, { error: 'Invalid role: Only ADMIN and STAFF can be assigned.' });
        }

        // A. Verify that the current user (operator) is OWNER or ADMIN of the target organisation
        const operatorMembership = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `USER#${userId}`,
            sk: `ORG#${org_id}`
          }
        }));

        if (!operatorMembership.Item || (operatorMembership.Item.role !== 'OWNER' && operatorMembership.Item.role !== 'ADMIN')) {
          return json(403, { error: 'Forbidden: You do not have owner/admin permission for this organisation.' });
        }

        // B. Create membership for target staff member
        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `USER#${targetStaffId}`,
            sk: `ORG#${org_id}`,
            role: role,
            assigned_at: new Date().toISOString(),
            assigned_by: userId,
          }
        }));

        return json(200, { message: 'Staff member assigned to organisation successfully.' });
      } catch (err: any) {
        return json(500, { error: `Failed to assign staff to organisation: ${err.message}` });
      }
    }

    // 5.7 DELETE /staff/:staffId/orgs/:orgId - Remove staff member's access to an organisation
    const staffOrgRemoveMatch = path.match(/^\/staff\/([a-f0-9-]+)\/orgs\/([a-f0-9-]+)$/);
    if (method === 'DELETE' && staffOrgRemoveMatch) {
      try {
        const targetStaffId = staffOrgRemoveMatch[1];
        const orgId = staffOrgRemoveMatch[2];

        // A. Verify that the current user (operator) is OWNER or ADMIN of the target organisation
        const operatorMembership = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `USER#${userId}`,
            sk: `ORG#${orgId}`
          }
        }));

        if (!operatorMembership.Item || (operatorMembership.Item.role !== 'OWNER' && operatorMembership.Item.role !== 'ADMIN')) {
          return json(403, { error: 'Forbidden: You do not have owner/admin permission for this organisation.' });
        }

        // B. Remove membership
        await ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `USER#${targetStaffId}`,
            sk: `ORG#${orgId}`
          }
        }));

        return json(200, { message: 'Staff member removed from organisation successfully.' });
      } catch (err: any) {
        return json(500, { error: `Failed to remove staff from organisation: ${err.message}` });
      }
    }

    // GET /orgs — List all organisations this user belongs to (No-Scan 二阶段安全检索)
    if (method === 'GET' && path === '/orgs') {
      const limit = 5;
      const lastKeyStr = event.queryStringParameters?.lastKey;
      let exclusiveStartKey = undefined;
      if (lastKeyStr) {
        try {
          exclusiveStartKey = JSON.parse(decodeURIComponent(lastKeyStr));
        } catch (e) {
          console.error('Failed to parse lastKey:', e);
        }
      }

      const queryParams: any = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk_prefix': 'ORG#',
        },
        Limit: limit,
      };
      if (exclusiveStartKey) {
        queryParams.ExclusiveStartKey = exclusiveStartKey;
      }

      const { Items = [], LastEvaluatedKey } = await ddb.send(new QueryCommand(queryParams));

      if (Items.length === 0) {
        return json(200, { orgs: [], lastKey: null });
      }

      // 并发批量拉取关联组织的 METADATA 与全部期初余额
      const orgPromises = Items.map(async (membership) => {
        const orgId = membership.sk.substring(4); // 从 ORG#<org_id> 提取 id
        const role = membership.role;

        try {
          const { Items: orgItems = [] } = await ddb.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
          }));

          const metadataItem = orgItems.find(item => item.sk === 'METADATA');
          if (!metadataItem) return null;

          const opening_balances: {
            bank_balances: Record<string, BankOpeningDetail>;
            ar_balances: Record<string, number>;
            ap_balances: Record<string, number>;
          } = {
            bank_balances: {},
            ar_balances: {},
            ap_balances: {},
          };

          for (const item of orgItems) {
            const sk = item.sk || '';
            if (sk.startsWith('OPENING#BANK#')) {
              opening_balances.bank_balances[item.account_number] = {
                balance: item.balance,
                conversion_date: item.conversion_date,
              };
            } else if (sk.startsWith('OPENING#AR#')) {
              opening_balances.ar_balances[item.customer_name] = item.amount_owed;
            } else if (sk.startsWith('OPENING#AP#')) {
              opening_balances.ap_balances[item.vendor_name] = item.amount_to_pay;
            }
          }

          const { pk, sk, ...cleanedMetadata } = metadataItem;
          return {
            ...cleanedMetadata,
            role, // 动态带回本地角色，方便前端 UI 渲染
            opening_balances,
          };
        } catch (err) {
          console.error(`Failed to fetch metadata for org: ${orgId}`, err);
          return null;
        }
      });

      const orgs = await Promise.all(orgPromises);
      const cleanedOrgs = orgs.filter(o => o !== null);

      return json(200, {
        orgs: cleanedOrgs,
        lastKey: LastEvaluatedKey ? encodeURIComponent(JSON.stringify(LastEvaluatedKey)) : null
      });
    }

    // GET /debug-gst — 调试并激活自愈 Seed 写入 GST 全局税率
    if (method === 'GET' && path === '/debug-gst') {
      const activeRate = await getGstRateForDate(new Date().toISOString());
      return json(200, {
        message: "GST Config initialised or verified successfully.",
        current_active_rate: activeRate,
      });
    }

    // GET /orgs/:id — Get a single organisation with all opening balances
    const getMatch = path.match(/^\/orgs\/([a-f0-9-]+)$/);
    if (method === 'GET' && getMatch) {
      const orgId = getMatch[1];

      // 1次网络请求捞出全部平铺数据
      const { Items = [] } = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
      }));

      if (Items.length === 0) {
        return json(404, { error: 'Organisation not found' });
      }

      const metadataItem = Items.find(item => item.sk === 'METADATA');
      if (!metadataItem) {
        return json(404, { error: 'Organisation metadata not found' });
      }

      // 内存中高效拼装期初对象
      const opening_balances: {
        bank_balances: Record<string, BankOpeningDetail>; // 类型对齐
        ar_balances: Record<string, number>;
        ap_balances: Record<string, number>;
      } = {
        bank_balances: {},
        ar_balances: {},
        ap_balances: {},
      };

      for (const item of Items) {
        const sk = item.sk || '';
        if (sk.startsWith('OPENING#BANK#')) {
          // 拼装完整的账户明细返回给前端
          opening_balances.bank_balances[item.account_number] = {
            balance: item.balance,
            conversion_date: item.conversion_date,
          };
        } else if (sk.startsWith('OPENING#AR#')) {
          opening_balances.ar_balances[item.customer_name] = item.amount_owed;
        } else if (sk.startsWith('OPENING#AP#')) {
          opening_balances.ap_balances[item.vendor_name] = item.amount_to_pay;
        }
      }

      // 2. Fetch staff members who have access to this organisation
      let staffWithAccess: any[] = [];
      try {
        const cognitoRes = await cognitoClient.send(new ListUsersCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
        }));
        const cognitoUsers = cognitoRes.Users || [];

        staffWithAccess = (await Promise.all(cognitoUsers.map(async u => {
          const sub = u.Attributes?.find(a => a.Name === 'sub')?.Value || '';
          const email = u.Attributes?.find(a => a.Name === 'email')?.Value || 'N/A';
          const givenName = u.Attributes?.find(a => a.Name === 'given_name')?.Value || '';
          const familyName = u.Attributes?.find(a => a.Name === 'family_name')?.Value || '';
          const fullName = `${givenName} ${familyName}`.trim() || u.Username || 'Unknown User';

          try {
            const membershipRes = await ddb.send(new GetCommand({
              TableName: TABLE_NAME,
              Key: {
                pk: `USER#${sub}`,
                sk: `ORG#${orgId}`
              }
            }));

            if (membershipRes.Item) {
              return {
                id: sub,
                name: fullName,
                email,
                role: membershipRes.Item.role, // 'OWNER', 'ADMIN', or 'STAFF'
              };
            }
          } catch (err) {
            console.error(`Failed to verify membership for user ${sub} in org ${orgId}:`, err);
          }
          return null;
        }))).filter(Boolean);
      } catch (cognitoErr) {
        console.error(`Failed to fetch staff members for org ${orgId}:`, cognitoErr);
      }

      const { pk, sk, ...cleanedMetadata } = metadataItem;

      return json(200, {
        ...cleanedMetadata,
        opening_balances,
        staff: staffWithAccess,
      });
    }

    // PUT /orgs/:id — Update an organisation details and opening balances
    if (method === 'PUT' && getMatch) {
      const orgId = getMatch[1];
      const rawPayload = JSON.parse(rawBody);
      const payload: Partial<OrgMetadata> = rawPayload;
      const openings: OpeningBalancesInput = rawPayload.opening_balances || {};

      const orgPk = `ORG#${orgId}`;

      // Retrieve all existing records for this organization to handle deletions
      const existingRes = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': orgPk
        }
      }));

      const existingItems = existingRes.Items || [];
      const existingItem = existingItems.find(item => item.sk === 'METADATA') || {};

      const name = payload.name !== undefined ? payload.name : existingItem.name;
      const entity_type = payload.entity_type !== undefined ? payload.entity_type : existingItem.entity_type;
      const ird_number = payload.ird_number !== undefined ? payload.ird_number : existingItem.ird_number;

      if (!name || !entity_type || !ird_number) {
        return json(400, { error: 'name, entity_type, and ird_number are required' });
      }

      // 1. 更新 METADATA 记录
      const metadataItem = {
        pk: orgPk,
        sk: 'METADATA',
        id: orgId,
        created_by: existingItem.created_by || userId,
        name,
        ird_number,
        entity_type,
        gst_registered: payload.gst_registered !== undefined ? payload.gst_registered : (existingItem.gst_registered ?? false),
        gst_basis: payload.gst_basis !== undefined ? payload.gst_basis : existingItem.gst_basis,
        gst_period: payload.gst_period !== undefined ? payload.gst_period : existingItem.gst_period,
        tax_year_end_month: payload.tax_year_end_month !== undefined ? payload.tax_year_end_month : (existingItem.tax_year_end_month ?? 3),
        bank_accounts: payload.bank_accounts !== undefined ? payload.bank_accounts : (existingItem.bank_accounts ?? []),
        nzbn: payload.nzbn !== undefined ? payload.nzbn : existingItem.nzbn,
        address: payload.address !== undefined ? payload.address : existingItem.address,
        payroll_cycle: payload.payroll_cycle !== undefined ? payload.payroll_cycle : existingItem.payroll_cycle,
        conversion_date: payload.conversion_date !== undefined ? payload.conversion_date : (existingItem.conversion_date || '2026-04-01'),
        updated_at: new Date().toISOString(),
      };

      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: metadataItem }));

      // 2. 更新银行账户期初余额与账户专属基准日，并清理被删除的账户余额
      if (openings.bank_balances) {
        // 清理被删除的银行账户余额记录
        const existingBankAccs = existingItems.filter(item => item.sk.startsWith('OPENING#BANK#'));
        for (const item of existingBankAccs) {
          const accNum = item.sk.substring('OPENING#BANK#'.length);
          if (!openings.bank_balances[accNum]) {
            await ddb.send(new DeleteCommand({
              TableName: TABLE_NAME,
              Key: { pk: orgPk, sk: item.sk }
            }));
          }
        }

        // 保存/更新当前银行账户余额
        for (const [accNum, detail] of Object.entries(openings.bank_balances)) {
          const convDate = detail.conversion_date || payload.conversion_date || metadataItem.conversion_date;

          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: orgPk,
              sk: `OPENING#BANK#${accNum}`,
              account_number: accNum,
              balance: detail.balance,
              conversion_date: convDate,
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      // 3. 更新应收账款期初，并清理被删除的AR记录
      if (openings.ar_balances) {
        // 清理被删除的AR记录
        const existingArItems = existingItems.filter(item => item.sk.startsWith('OPENING#AR#'));
        for (const item of existingArItems) {
          const customerName = item.sk.substring('OPENING#AR#'.length);
          if (openings.ar_balances[customerName] === undefined) {
            await ddb.send(new DeleteCommand({
              TableName: TABLE_NAME,
              Key: { pk: orgPk, sk: item.sk }
            }));
          }
        }

        // 保存/更新当前应收记录
        for (const [customerName, amount] of Object.entries(openings.ar_balances)) {
          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: orgPk,
              sk: `OPENING#AR#${customerName}`,
              customer_name: customerName,
              amount_owed: amount,
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      // 4. 更新应付账款期初，并清理被删除的AP记录
      if (openings.ap_balances) {
        // 清理被删除的AP记录
        const existingApItems = existingItems.filter(item => item.sk.startsWith('OPENING#AP#'));
        for (const item of existingApItems) {
          const vendorName = item.sk.substring('OPENING#AP#'.length);
          if (openings.ap_balances[vendorName] === undefined) {
            await ddb.send(new DeleteCommand({
              TableName: TABLE_NAME,
              Key: { pk: orgPk, sk: item.sk }
            }));
          }
        }

        // 保存/更新当前应付记录
        for (const [vendorName, amount] of Object.entries(openings.ap_balances)) {
          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: orgPk,
              sk: `OPENING#AP#${vendorName}`,
              vendor_name: vendorName,
              amount_to_pay: amount,
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      return json(200, { message: "Organisation and opening balances updated successfully." });
    }

    // GET /entities/mapping — 获取增量比对商户对账映射配置
    if (path === '/entities/mapping' && method === 'GET') {
      const qs = event.queryStringParameters || {};
      const clientVersion = qs.version || '';

      // 1. 查询唯一存在的最新记录
      const latestQuery = await ddb.send(new QueryCommand({
        TableName: FOREIGN_ENTITIES_TABLE_NAME,
        KeyConditionExpression: 'entity_type = :pk',
        ExpressionAttributeValues: {
          ':pk': 'GLOBAL#CONFIG'
        }
      }));

      const latestItem = latestQuery.Items?.[0];

      if (!latestItem) {
        // 自愈分支：全表扫描现存 Supplier 和 Customer 实体，并生成极简映射写入新版本
        console.log('[Self-Healing] GLOBAL#CONFIG not found. Scanning database to self-heal...');
        const scanRes = await ddb.send(new ScanCommand({ TableName: FOREIGN_ENTITIES_TABLE_NAME }));
        const rawEntities = scanRes.Items || [];
        const consolidated = rawEntities
          .filter(e => e.entity_type === 'Supplier' || e.entity_type === 'Customer')
          .map(e => ({
            entity_name: String(e.entity_name || '').trim(),
            default_category: String(e.default_category || '').trim()
          }))
          .filter(e => e.entity_name && e.default_category);

        const selfHealedVersion = String(Date.now());
        await ddb.send(new PutCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Item: {
            entity_type: 'GLOBAL#CONFIG',
            entity_id: selfHealedVersion,
            entities: consolidated,
            created_at: new Date().toISOString()
          }
        }));

        // 如果客户端不带版本参数（无缓存），直接下发完整的映射列表供前端构建本地 IndexedDB
        // 如果带了版本参数，说明是由于云端为空触发的自愈，此时前端版本即是 selfHealedVersion，返回空数组即可
        return json(200, {
          version: selfHealedVersion,
          entities: clientVersion ? [] : consolidated
        });
      }

      const serverVersion = latestItem.entity_id;
      const entitiesList = latestItem.entities || [];

      // 如果客户端不带版本（无缓存），或者服务端最新版本大于客户端当前版本，返回最新的全量实体数组以同步缓存
      if (!clientVersion || Number(serverVersion) > Number(clientVersion)) {
        return json(200, { version: serverVersion, entities: entitiesList });
      } else {
        return json(200, { version: serverVersion, entities: [] });
      }
    }

    // GET /entities/all — full scan, returns both Supplier and Customer
    if (path === '/entities/all' && method === 'GET') {
      const { Items = [] } = await ddb.send(
        new ScanCommand({ TableName: FOREIGN_ENTITIES_TABLE_NAME })
      );
      return json(200, { entities: Items });
    }

    // GET & POST /entities/:entity_type (Supplier | Customer)
    const entitiesMatch = path.match(/^\/entities\/(Supplier|Customer)$/);
    if (entitiesMatch) {
      const entityType = entitiesMatch[1];

      if (method === 'GET') {
        const { Items = [] } = await ddb.send(
          new QueryCommand({
            TableName: FOREIGN_ENTITIES_TABLE_NAME,
            KeyConditionExpression: 'entity_type = :entity_type',
            ExpressionAttributeValues: {
              ':entity_type': entityType,
            },
          })
        );
        return json(200, { entities: Items });
      }

      if (method === 'POST') {
        const payload = JSON.parse(rawBody);
        if (!payload.entity_name || !payload.default_category) {
          return json(400, { error: 'entity_name and default_category are required' });
        }
        const entityId = `ent-${randomUUID()}`;
        const now = new Date().toISOString();
        const item = {
          entity_type: entityType,
          entity_id: entityId,
          entity_name: String(payload.entity_name).trim().replace(/\s+/g, ' '),
          default_category: String(payload.default_category).trim(),
          ird_number: String(payload.ird_number || '').trim(),
          created_at: now,
          updated_at: now
        };
        await ddb.send(new PutCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Item: item
        }));

        // 增量同步缓存
        await updateGlobalCacheBackend(item.entity_name, item.default_category);

        return json(201, item);
      }
    }

    // PUT & DELETE /entities/:entity_type/:entity_id
    const entityDetailMatch = path.match(/^\/entities\/(Supplier|Customer)\/(ent-[a-f0-9-]+)$/);
    if (entityDetailMatch) {
      const entityType = entityDetailMatch[1];
      const entityId = entityDetailMatch[2];

      if (method === 'PUT') {
        const payload = JSON.parse(rawBody);
        if (!payload.entity_name || !payload.default_category) {
          return json(400, { error: 'entity_name and default_category are required' });
        }

        // 获取原实体的名字用于内存中的重构比对
        const existingEnt = await ddb.send(new GetCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Key: {
            entity_type: entityType,
            entity_id: entityId
          }
        }));
        const oldName = existingEnt.Item ? existingEnt.Item.entity_name : undefined;

        const now = new Date().toISOString();
        const item = {
          entity_type: entityType,
          entity_id: entityId,
          entity_name: String(payload.entity_name).trim().replace(/\s+/g, ' '),
          default_category: String(payload.default_category).trim(),
          ird_number: String(payload.ird_number || '').trim(),
          created_at: payload.created_at || now,
          updated_at: now
        };
        await ddb.send(new PutCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Item: item
        }));

        // 增量同步缓存
        await updateGlobalCacheBackend(item.entity_name, item.default_category, oldName);

        return json(200, item);
      }

      if (method === 'DELETE') {
        // 删除前先读取该项目获取其 entity_name
        const existingEnt = await ddb.send(new GetCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Key: {
            entity_type: entityType,
            entity_id: entityId
          }
        }));
        const deleteName = existingEnt.Item ? existingEnt.Item.entity_name : undefined;

        await ddb.send(new DeleteCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Key: {
            entity_type: entityType,
            entity_id: entityId
          }
        }));

        if (deleteName) {
          // 从极简缓存中剔除删除项
          await updateGlobalCacheBackend(deleteName, '', undefined, true);
        }

        return json(200, { message: 'Entity deleted successfully' });
      }
    }

    // POST /ai-assistant/categorise-tx
    if (method === 'POST' && path === '/ai-assistant/categorise-tx') {
      const raw = JSON.parse(rawBody);
      const vendors = raw.vendors;

      if (!Array.isArray(vendors) || vendors.length === 0) {
        return json(200, { categories: {} });
      }

      let categoriesPool: string[] = [];
      try {
        const configRes = await ddb.send(new GetCommand({
          TableName: process.env.TABLE_NAME,
          Key: {
            pk: 'CONFIG#GLOBAL',
            sk: 'WORKFLOW#SETTINGS'
          }
        }));
        if (configRes.Item && Array.isArray(configRes.Item.categories)) {
          categoriesPool = configRes.Item.categories;
        }
      } catch (dbErr) {
        console.warn('[Bedrock] Failed to fetch dynamic categories, falling back to static pool:', dbErr);
      }

      if (categoriesPool.length === 0) {
        categoriesPool = [
          'Advertising & Marketing', 'Bank Fees & Interest', 'Consulting & Professional',
          'Entertainment', 'Insurance', 'Motor Vehicle Expenses', 'Office Supplies & Post',
          'Rent & Lease', 'Repairs & Maintenance', 'Software & IT Services',
          'Subscriptions & Memberships', 'Travel & Accommodation', 'Utilities & Comm',
          'Wages & Salaries', 'Sales & Revenue', 'Other Income', 'Cost of Goods Sold',
          'Taxes', 'Transfer'
        ];
      }

      const prompt = [
        'You are a professional bookkeeper working with New Zealand and Australian small business bank statements.',
        '',
        'Your task: categorise each vendor/payee name into exactly one category from this allowed list:',
        JSON.stringify(categoriesPool),
        '',
        'Rules:',
        '1. Use ONLY categories from the list above. Never invent new categories.',
        '2. If the vendor name looks like a bank account number (e.g. "01-0505-0780727-00"), a credit card number (e.g. "9554-****-****-1524"), or a fund transfer description (e.g. "To: 88890388-1001" or contains "Transfer"), classify it as "Transfer".',
        '3. NZ-specific: Spark = "Utilities & Comm", Vodafone = "Utilities & Comm", Contact Energy = "Utilities & Comm", ANZ/BNZ/ASB/Westpac fees = "Bank Fees & Interest", Southern Cross = "Insurance", AA Insurance = "Insurance", Kindo = "Office Supplies & Post", Snapper = "Travel & Accommodation".',
        '4. Supermarkets, Asian supermarkets, restaurants, food suppliers = "Cost of Goods Sold".',
        '5. If genuinely uncertain, prefer "Consulting & Professional" over "Other Income".',
        '6. NZ-specific: Inland Revenue, IRD, tax payments, GST payments, PAYE payments = "Taxes".',
        '7. Return ONLY a valid JSON object. No markdown code fences, no explanation.',
        '',
        'Vendors to categorise:',
        JSON.stringify(vendors),
        '',
        'Output format (raw JSON only):',
        '{"vendor_name_1":"category","vendor_name_2":"category"}'
      ].join('\n');

      const requestPayload = {
        messages: [
          {
            role: "user",
            content: [
              {
                text: prompt
              }
            ]
          }
        ],
        inferenceConfig: {
          temperature: 0.1,
          max_new_tokens: 1500
        }
      };

      let aiText = '';
      try {
        const response = await bedrock.send(new InvokeModelCommand({
          modelId: 'amazon.nova-lite-v1:0',
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(requestPayload)
        }));
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        aiText = responseBody.output.message.content[0].text;
      } catch (err: any) {
        console.error('[Bedrock] Amazon Nova Lite failed to invoke:', err);
        return json(500, { error: `AI Assistant unavailable: ${err.message || 'InvokeModel failed'}` });
      }

      try {
        let cleaned = aiText.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        }
        const categoriesMap = JSON.parse(cleaned);
        return json(200, { categories: categoriesMap });
      } catch (parseErr: any) {
        console.error('[Bedrock] Failed to parse AI categorization response. Raw text:', aiText, parseErr);
        return json(500, { error: 'Failed to parse AI classification result. Clean formatting response error.' });
      }
    }

    // ── Transactions API Routes ───────────────────────────────────────

    // GET /transactions (Global Scan of all transactions across all organisations, paginated 50 items per batch)
    if (path === '/transactions') {
      if (method === 'GET') {
        const qs = event.queryStringParameters || {};
        const limit = qs.limit ? parseInt(qs.limit) : 50;
        const exclusiveStartKey = qs.exclusive_start_key
          ? JSON.parse(Buffer.from(qs.exclusive_start_key, 'base64').toString('utf8'))
          : undefined;

        // 🚨 安全哨兵：查询当前用户加入的全部组织
        const userOrgsRes = await ddb.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk_prefix': 'ORG#',
          },
        }));

        const allowedOrgIds = (userOrgsRes.Items || []).map(item => item.sk.substring('ORG#'.length));
        if (allowedOrgIds.length === 0) {
          return json(200, { transactions: [], last_evaluated_key: undefined });
        }

        // 动态构造 FilterExpression 以保障数据多租户隔离与安全性
        const expressionAttributeValues: Record<string, any> = {
          ':prefix': 'TX#',
        };
        const inConditions: string[] = [];
        allowedOrgIds.forEach((orgId, idx) => {
          const varName = `:orgPk${idx}`;
          expressionAttributeValues[varName] = `ORG#${orgId}`;
          inConditions.push(varName);
        });

        const scanParams: any = {
          TableName: TABLE_NAME,
          FilterExpression: `begins_with(sk, :prefix) AND pk IN (${inConditions.join(', ')})`,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: limit,
        };
        if (exclusiveStartKey) {
          scanParams.ExclusiveStartKey = exclusiveStartKey;
        }

        const scanResult = await ddb.send(new ScanCommand(scanParams));

        const txs = (scanResult.Items || []).map(({ pk, sk, ...rest }) => ({
          ...rest,
          pk,
          sk,
          org_id: pk.substring('ORG#'.length)
        }));

        const lastEvaluatedKey = scanResult.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(scanResult.LastEvaluatedKey)).toString('base64')
          : undefined;

        return json(200, { transactions: txs, last_evaluated_key: lastEvaluatedKey });
      }
    }

    // POST & GET /orgs/:org_id/transactions
    const txListMatch = path.match(/^\/orgs\/([a-f0-9-]+)\/transactions$/);
    if (txListMatch) {
      const orgId = txListMatch[1];

      if (method === 'POST') {
        const raw = JSON.parse(rawBody);

        // Batch import: POST body is an array of transactions
        if (Array.isArray(raw)) {
          if (raw.length === 0) {
            return json(400, { error: 'Batch import array must not be empty.' });
          }
          if (raw.length > 500) {
            return json(400, { error: 'Batch import array must not exceed 500 items.' });
          }

          const inputs = raw.map((item: any) => ({
            date: String(item.date),
            vendor: String(item.vendor),
            description: item.description ? String(item.description) : undefined,
            type: item.type,
            gross_amount: Number(item.gross_amount),
            gst_type: item.gst_type,
            category: String(item.category || 'Uncategorized'),
            gst_amount: item.gst_amount !== undefined ? Number(item.gst_amount) : undefined,
            receipt_s3_key: item.receipt_s3_key ? String(item.receipt_s3_key) : undefined,
            source: item.source || 'Bank Statement Import',
            hash: item.hash ? String(item.hash) : undefined,
            occur_idx: item.occur_idx !== undefined ? Number(item.occur_idx) : undefined,
            force_insert: item.force_insert === true,
          }));

          const result = await batchImportTransactions(orgId, inputs);
          return json(201, result);
        }

        // Single transaction creation (backward compatible)
        const tx = await createTransaction(orgId, {
          date: String(raw.date),
          vendor: String(raw.vendor),
          description: raw.description ? String(raw.description) : undefined,
          type: raw.type,
          gross_amount: Number(raw.gross_amount),
          gst_type: raw.gst_type,
          category: String(raw.category),
          gst_amount: raw.gst_amount !== undefined ? Number(raw.gst_amount) : undefined,
          receipt_s3_key: raw.receipt_s3_key ? String(raw.receipt_s3_key) : undefined,
          source: raw.source
        });

        return json(201, tx);
      }

      if (method === 'GET') {
        const qs = event.queryStringParameters || {};
        const txs = await listTransactions(orgId, {
          start_date: qs.start_date,
          end_date: qs.end_date,
          type: qs.type as 'income' | 'expense' | undefined,
        });
        return json(200, { transactions: txs });
      }
    }

    // GET, PUT, DELETE /orgs/:org_id/transactions/:date/:tx_id
    const txSingleMatch = path.match(/^\/orgs\/([a-f0-9-]+)\/transactions\/(\d{4}-\d{2}-\d{2})\/([a-f0-9-]+)$/);
    if (txSingleMatch) {
      const orgId = txSingleMatch[1];
      const date = txSingleMatch[2];
      const txId = txSingleMatch[3];

      if (method === 'GET') {
        const tx = await getTransaction(orgId, date, txId);
        return json(200, tx);
      }

      if (method === 'PUT') {
        const payload = JSON.parse(rawBody);

        // 核心防线：如果 URL 里的日期跟 payload 里传进来的 old_date 或 new_date 逻辑打架了
        // 必须确保 URL 里的这个位置，传的是【数据库里现存的、那个需要被干掉的旧日期】
        const urlDate = txSingleMatch[2];

        // 强转并安全调用
        const tx = await updateTransaction(orgId, urlDate, txId, {
          ...payload,
          gross_amount: payload.gross_amount !== undefined ? Number(payload.gross_amount) : undefined,
          gst_amount: payload.gst_amount !== undefined ? Number(payload.gst_amount) : undefined
        });
        return json(200, tx);
      }

      if (method === 'DELETE') {
        await deleteTransaction(orgId, date, txId);
        return json(200, { message: 'Transaction deleted successfully.' });
      }
    }

    return json(404, { error: 'Not found' });
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json(err.statusCode, { error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json(500, { error: message });
  }
}

/**
 * Incrementally updates the global configuration cache in backend with a new or modified entity category, advancing the version.
 */
async function updateGlobalCacheBackend(
  entityName: string,
  category: string,
  oldName?: string,
  isDelete: boolean = false
): Promise<void> {
  try {
    // 1. Get current latest GLOBAL#CONFIG
    const latestQuery = await ddb.send(new QueryCommand({
      TableName: FOREIGN_ENTITIES_TABLE_NAME,
      KeyConditionExpression: 'entity_type = :pk',
      ExpressionAttributeValues: {
        ':pk': 'GLOBAL#CONFIG'
      }
    }));

    const latestItem = latestQuery.Items?.[0];
    const oldVersion = latestItem ? latestItem.entity_id : undefined;
    let entitiesArray = latestItem ? (latestItem.entities || []) : [];

    const cleanName = entityName.trim().replace(/\s+/g, ' ');
    const cleanCat = category.trim();

    // 2. Perform memory edits
    if (isDelete) {
      entitiesArray = entitiesArray.filter((e: any) => e.entity_name.trim().replace(/\s+/g, ' ').toLowerCase() !== cleanName.toLowerCase());
    } else {
      if (oldName) {
        const cleanOldName = oldName.trim().replace(/\s+/g, ' ');
        entitiesArray = entitiesArray.filter((e: any) => e.entity_name.trim().replace(/\s+/g, ' ').toLowerCase() !== cleanOldName.toLowerCase());
      }
      entitiesArray = entitiesArray.filter((e: any) => e.entity_name.trim().replace(/\s+/g, ' ').toLowerCase() !== cleanName.toLowerCase());
      entitiesArray.push({ entity_name: cleanName, default_category: cleanCat });
    }

    // 3. Write new version
    const versionString = String(Date.now());
    await ddb.send(new PutCommand({
      TableName: FOREIGN_ENTITIES_TABLE_NAME,
      Item: {
        entity_type: 'GLOBAL#CONFIG',
        entity_id: versionString,
        entities: entitiesArray,
        created_at: new Date().toISOString()
      }
    }));

    // 4. Delete the old version record to prevent history bloat
    if (oldVersion && oldVersion !== versionString) {
      await ddb.send(new DeleteCommand({
        TableName: FOREIGN_ENTITIES_TABLE_NAME,
        Key: {
          entity_type: 'GLOBAL#CONFIG',
          entity_id: oldVersion
        }
      }));
      console.log(`[Cache Sync Backend] Deleted old version record: ${oldVersion}`);
    }

    console.log(`[Cache Sync Backend] Updated global cache to version ${versionString} with entity "${cleanName}"`);
  } catch (err) {
    console.error('[Cache Sync Backend] Failed to update global cache:', err);
  }
}