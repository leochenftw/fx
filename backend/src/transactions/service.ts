import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '../common/dynamo';
import { getGstRateForDate } from '../common/gst';
import { randomUUID } from 'crypto';

export interface TransactionInput {
  date: string; // YYYY-MM-DD
  vendor: string;
  description?: string;
  type: 'income' | 'expense';
  gross_amount: number;
  gst_type: 'input_tax' | 'output_tax' | 'zero_rated' | 'exempt' | 'non_taxable';
  category: string;
  gst_amount?: number; // Optional manual override
  receipt_s3_key?: string;
  source?: 'manual' | 'voice' | 'bank_feed' | 'Bank Statement Import';
  hash?: string; // Client-side dedup fingerprint
  occur_idx?: number; // Occurrence index for same-hash entries in a single CSV
  force_insert?: boolean; // Bypass cloud dedup lock when user explicitly confirms
}

export interface Transaction {
  id: string;
  date: string;
  vendor: string;
  description?: string;
  type: 'income' | 'expense';
  gross_amount: number;
  net_amount: number;
  gst_amount: number;
  gst_rate: number;
  gst_type: 'input_tax' | 'output_tax' | 'zero_rated' | 'exempt' | 'non_taxable';
  category: string;
  receipt_s3_key?: string;
  source: 'manual' | 'voice' | 'bank_feed' | 'Bank Statement Import';
  matched_bank_statement_id?: string;
  created_at: string;
  updated_at: string;
}

export interface BatchImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: Array<{ hash?: string; occur_idx?: number; status: 'imported' | 'duplicate' | 'error'; error?: string }>;
}

export class ServiceError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * Validates date format YYYY-MM-DD strictly
 */
function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

/**
 * Validates cross-correctness between transaction direction and GST category
 */
function validateGstType(type: 'income' | 'expense', gstType: string) {
  if (type === 'expense') {
    const allowed = ['input_tax', 'zero_rated', 'exempt', 'non_taxable'];
    if (!allowed.includes(gstType)) {
      throw new ServiceError(400, `Invalid gst_type '${gstType}' for expense transaction. Allowed: ${allowed.join(', ')}`);
    }
  } else if (type === 'income') {
    const allowed = ['output_tax', 'zero_rated', 'exempt', 'non_taxable'];
    if (!allowed.includes(gstType)) {
      throw new ServiceError(400, `Invalid gst_type '${gstType}' for income transaction. Allowed: ${allowed.join(', ')}`);
    }
  }
}

/**
 * Creates a new transaction under an organisation
 */
export async function createTransaction(orgId: string, input: TransactionInput): Promise<Transaction> {
  const { date, vendor, description, type, gross_amount, gst_type, category, gst_amount: manualGst, receipt_s3_key, source = 'manual' } = input;

  // 1. Validations
  if (!date || !vendor || !type || gross_amount === undefined || !gst_type || !category) {
    throw new ServiceError(400, 'date, vendor, type, gross_amount, gst_type, and category are required.');
  }
  if (!isValidDate(date)) {
    throw new ServiceError(400, 'date must be in YYYY-MM-DD format.');
  }
  if (type !== 'income' && type !== 'expense') {
    throw new ServiceError(400, "type must be 'income' or 'expense'.");
  }
  validateGstType(type, gst_type);

  // 2. Resolve GST rate and compute amount
  let gstRate = 0;
  let gstAmount = 0;
  let netAmount = gross_amount;

  const cleanDate = date.substring(0, 10); // 强固 YYYY-MM-DD 长度

  if (gst_type === 'input_tax' || gst_type === 'output_tax') {
    // 🆕 传入纯字符串让修正后的 gst 引擎进行零时区字典序匹配
    gstRate = await getGstRateForDate(cleanDate);
    if (manualGst !== undefined) {
      gstAmount = manualGst;
    } else {
      const calculatedGst = gross_amount - (gross_amount / (1 + gstRate));
      gstAmount = Math.round(calculatedGst * 100) / 100;
    }
    netAmount = Math.round((gross_amount - gstAmount) * 100) / 100;
  } else {
    gstRate = 0;
    gstAmount = 0;
    netAmount = gross_amount;
  }

  const txId = randomUUID();
  const now = new Date().toISOString();

  const item = {
    pk: `ORG#${orgId}`,
    sk: `TX#${cleanDate}#${txId}`,
    id: txId,
    date: cleanDate,
    vendor,
    description: description || '',
    type,
    gross_amount: Number(gross_amount.toFixed(2)),
    net_amount: netAmount,
    gst_amount: gstAmount,
    gst_rate: gstRate,
    gst_type,
    category,
    receipt_s3_key,
    source,
    created_at: now,
    updated_at: now,
  };

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  }));

  const { pk, sk, ...cleaned } = item;
  return cleaned as Transaction;
}

/**
 * Batch imports transactions with cloud-side dedup via DynamoDB conditional writes.
 * Uses the hash + occur_idx pair as a unique dedup lock key.
 * If hash/occur_idx are not provided, the transaction is written unconditionally.
 */
export async function batchImportTransactions(
  orgId: string,
  inputs: TransactionInput[]
): Promise<BatchImportResult> {
  const result: BatchImportResult = { imported: 0, skipped: 0, errors: 0, details: [] };

  // Process sequentially to maintain watermark consistency within the batch
  for (const input of inputs) {
    const { hash, occur_idx, force_insert } = input;

    try {
      // 1. If dedup fingerprint is provided, attempt conditional write on the DUP lock
      if (hash && occur_idx !== undefined) {
        const dupPk = `ORG#${orgId}#DUP`;
        const dupSk = `HASH#${hash}#${occur_idx}`;

        if (force_insert) {
          // Force insert: overwrite DUP lock unconditionally to keep watermarks aligned
          await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: dupPk,
              sk: dupSk,
              hash,
              occur_idx,
              force_inserted: true,
              created_at: new Date().toISOString(),
            },
          }));
        } else {
          // Normal dedup: conditional write — fail if lock already exists
          try {
            await ddb.send(new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                pk: dupPk,
                sk: dupSk,
                hash,
                occur_idx,
                created_at: new Date().toISOString(),
              },
              ConditionExpression: 'attribute_not_exists(pk)',
            }));
          } catch (dupErr: any) {
            if (dupErr.name === 'ConditionalCheckFailedException') {
              // This hash+occur_idx combo already exists in cloud — skip as duplicate
              result.skipped++;
              result.details.push({ hash, occur_idx, status: 'duplicate' });
              continue;
            }
            throw dupErr; // Re-throw unexpected errors
          }
        }
      }

      // 2. Write the actual transaction record
      await createTransaction(orgId, input);
      result.imported++;
      result.details.push({ hash, occur_idx, status: 'imported' });
    } catch (err: any) {
      result.errors++;
      result.details.push({
        hash,
        occur_idx,
        status: 'error',
        error: err.message || 'Unknown error',
      });
    }
  }

  return result;
}

/**
 * Queries all transactions in an organisation, optionally filtering by date range and type
 */
export async function listTransactions(
  orgId: string,
  queryParams: { start_date?: string; end_date?: string; type?: 'income' | 'expense' }
): Promise<Transaction[]> {
  const { start_date, end_date, type } = queryParams;

  let keyCondition = 'pk = :pk';
  const expressionAttributeValues: Record<string, any> = {
    ':pk': `ORG#${orgId}`,
  };

  if (start_date && end_date) {
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      throw new ServiceError(400, 'start_date and end_date must be in YYYY-MM-DD format.');
    }
    keyCondition += ' AND sk BETWEEN :start_sk AND :end_sk';
    expressionAttributeValues[':start_sk'] = `TX#${start_date}`;
    expressionAttributeValues[':end_sk'] = `TX#${end_date}\uFFFF`;
  } else if (start_date) {
    if (!isValidDate(start_date)) {
      throw new ServiceError(400, 'start_date must be in YYYY-MM-DD format.');
    }
    keyCondition += ' AND sk >= :start_sk';
    expressionAttributeValues[':start_sk'] = `TX#${start_date}`;
  } else if (end_date) {
    if (!isValidDate(end_date)) {
      throw new ServiceError(400, 'end_date must be in YYYY-MM-DD format.');
    }
    keyCondition += ' AND sk BETWEEN :start_sk AND :end_sk';
    expressionAttributeValues[':start_sk'] = 'TX#0000-00-00';
    expressionAttributeValues[':end_sk'] = `TX#${end_date}\uFFFF`;
  } else {
    keyCondition += ' AND begins_with(sk, :prefix)';
    expressionAttributeValues[':prefix'] = 'TX#';
  }

  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionAttributeValues,
  }));

  let transactions = Items.map(({ pk, sk, ...rest }) => rest as Transaction);

  if (type) {
    if (type !== 'income' && type !== 'expense') {
      throw new ServiceError(400, "type filter must be 'income' or 'expense'.");
    }
    transactions = transactions.filter(t => t.type === type);
  }

  return transactions;
}

/**
 * Gets a single transaction by ID and date
 */
export async function getTransaction(orgId: string, date: string, txId: string): Promise<Transaction> {
  if (!isValidDate(date)) {
    throw new ServiceError(400, 'date must be in YYYY-MM-DD format.');
  }

  const response = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: `ORG#${orgId}`,
      sk: `TX#${date}#${txId}`,
    },
  }));

  if (!response.Item) {
    throw new ServiceError(404, 'Transaction not found.');
  }

  const { pk, sk, ...cleaned } = response.Item;
  return cleaned as Transaction;
}

/**
 * Deletes a transaction by ID and date
 */
export async function deleteTransaction(orgId: string, date: string, txId: string): Promise<void> {
  await getTransaction(orgId, date, txId);

  await ddb.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: `ORG#${orgId}`,
      sk: `TX#${date}#${txId}`,
    },
  }));
}

/**
 * Updates an existing transaction. Handles changes to the date safely.
 */
export async function updateTransaction(
  orgId: string,
  oldDate: string,
  txId: string,
  input: TransactionInput
): Promise<Transaction> {
  const { date: newDate, vendor, description, type, gross_amount, gst_type, category, gst_amount: manualGst, receipt_s3_key, source = 'manual' } = input;

  if (!newDate || !vendor || !type || gross_amount === undefined || !gst_type || !category) {
    throw new ServiceError(400, 'date, vendor, type, gross_amount, gst_type, and category are required.');
  }
  if (!isValidDate(oldDate) || !isValidDate(newDate)) {
    throw new ServiceError(400, 'Both oldDate and date must be in YYYY-MM-DD format.');
  }
  if (type !== 'income' && type !== 'expense') {
    throw new ServiceError(400, "type must be 'income' or 'expense'.");
  }
  validateGstType(type, gst_type);

  const oldTx = await getTransaction(orgId, oldDate, txId);
  const cleanNewDate = newDate.substring(0, 10);

  let gstRate = 0;
  let gstAmount = 0;
  let netAmount = gross_amount;

  if (gst_type === 'input_tax' || gst_type === 'output_tax') {
    gstRate = await getGstRateForDate(cleanNewDate);
    if (manualGst !== undefined) {
      gstAmount = manualGst;
    } else {
      const calculatedGst = gross_amount - (gross_amount / (1 + gstRate));
      gstAmount = Math.round(calculatedGst * 100) / 100;
    }
    netAmount = Math.round((gross_amount - gstAmount) * 100) / 100;
  } else {
    gstRate = 0;
    gstAmount = 0;
    netAmount = gross_amount;
  }

  const now = new Date().toISOString();

  const newItem = {
    pk: `ORG#${orgId}`,
    sk: `TX#${cleanNewDate}#${txId}`,
    id: txId,
    date: cleanNewDate,
    vendor,
    description: description || '',
    type,
    gross_amount: Number(gross_amount.toFixed(2)),
    net_amount: netAmount,
    gst_amount: gstAmount,
    gst_rate: gstRate,
    gst_type,
    category,
    receipt_s3_key,
    source,
    created_at: oldTx.created_at,
    updated_at: now,
  };

  if (oldDate !== cleanNewDate) {
    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `ORG#${orgId}`,
        sk: `TX#${oldDate}#${txId}`,
      },
    }));
  }

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: newItem,
  }));

  const { pk, sk, ...cleaned } = newItem;
  return cleaned as Transaction;
}