import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from './dynamo';

export interface GlobalFieldMapping {
  pk: string;
  sk: string;
  bank_name: string;
  card_type: 'credit' | 'debit';
  format_name: string;
  date_column: string;
  amount_column: string;
  vendor_column: string;
  description_columns: string[];
  indicator_mode: 'auto' | 'column';
  indicator_column?: string;
  debit_value?: string;
  credit_value?: string;
  updated_at?: string;
}

const DEFAULT_MAPPINGS: GlobalFieldMapping[] = [
  {
    pk: 'CONFIG#GLOBAL',
    sk: 'MAPPING#ANZ#debit',
    bank_name: 'ANZ',
    card_type: 'debit',
    format_name: 'ANZ Debit Card',
    date_column: 'Date',
    amount_column: 'Amount',
    vendor_column: 'Details',
    description_columns: ['Particulars', 'Code', 'Reference'],
    indicator_mode: 'auto'
  },
  {
    pk: 'CONFIG#GLOBAL',
    sk: 'MAPPING#ANZ#credit',
    bank_name: 'ANZ',
    card_type: 'credit',
    format_name: 'ANZ Credit Card',
    date_column: 'TransactionDate',
    amount_column: 'Amount',
    vendor_column: 'Details',
    description_columns: ['ProcessedDate'],
    indicator_mode: 'auto'
  }
];

/**
 * Retrieves all global mappings from DynamoDB.
 * If the mappings are empty or incomplete, it seeds the missing default mappings.
 */
export async function getOrSeedGlobalMappings(): Promise<GlobalFieldMapping[]> {
  try {
    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': 'CONFIG#GLOBAL',
          ':prefix': 'MAPPING#',
        },
      })
    );

    const items = (response.Items || []) as GlobalFieldMapping[];
    const existingSks = new Set(items.map(item => item.sk));
    const toSeed = DEFAULT_MAPPINGS.filter(m => !existingSks.has(m.sk));

    if (toSeed.length > 0) {
      console.warn(`Mappings not found or incomplete. Seeding ${toSeed.length} default global mappings...`);
      const now = new Date().toISOString();
      for (const mapping of toSeed) {
        await ddb.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              ...mapping,
              updated_at: now
            }
          })
        );
        items.push({
          ...mapping,
          updated_at: now
        });
      }
    }

    return items;
  } catch (error) {
    console.error('Failed to get or seed global mappings. Falling back to defaults:', error);
    return DEFAULT_MAPPINGS;
  }
}
