import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from './dynamo';

export interface GstRatePeriod {
  rate: number;
  effective_from: string;
  effective_to: string | null;
}

export interface GstConfig {
  pk: string;
  sk: string;
  country: string;
  tax_name: string;
  default_rate: number;
  rate_history: GstRatePeriod[];
}

// Memory-cached GST periods to avoid repeated DynamoDB reads across warm Lambda invocations
let cachedGstPeriods: GstRatePeriod[] | null = null;

// New Zealand standard GST seed data
const NZ_GST_SEED: GstConfig = {
  pk: 'CONFIG#GLOBAL',
  sk: 'TAX#NZ#GST',
  country: 'NZ',
  tax_name: 'GST',
  default_rate: 0.15,
  rate_history: [
    {
      rate: 0.15,
      effective_from: '2010-10-01',
      effective_to: null, // null means currently active
    },
    {
      rate: 0.125,
      effective_from: '1989-07-01',
      effective_to: '2010-09-30',
    },
  ],
};

/**
 * Resolves the historical GST rate active on a specific transaction date.
 * Automatically handles DynamoDB caching and self-healing initialization (seeding).
 * 
 * @param dateStr ISO date string (YYYY-MM-DD or full timestamp)
 * @returns Decimal GST rate (e.g. 0.15 for 15%)
 */
export async function getGstRateForDate(dateStr: string): Promise<number> {
  // 1. Return from local Lambda memory cache if hit
  if (cachedGstPeriods) {
    return resolveRateFromHistory(dateStr, cachedGstPeriods);
  }

  try {
    // 2. Query global config from single table
    const response = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: 'CONFIG#GLOBAL',
          sk: 'TAX#NZ#GST',
        },
      })
    );

    if (response.Item && response.Item.rate_history) {
      cachedGstPeriods = response.Item.rate_history as GstRatePeriod[];
      return resolveRateFromHistory(dateStr, cachedGstPeriods);
    }

    // 3. Self-healing Seeding: If DB is empty, write NZ GST seed values
    console.warn('GST Config not found in database. Seeding default New Zealand GST rates...');
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: NZ_GST_SEED,
      })
    );

    cachedGstPeriods = NZ_GST_SEED.rate_history;
    return resolveRateFromHistory(dateStr, cachedGstPeriods);

  } catch (error) {
    console.error('Failed to retrieve GST rate configuration. Falling back to standard 15%:', error);
    return 0.15; // Safe NZ fallback
  }
}

function resolveRateFromHistory(dateStr: string, periods: GstRatePeriod[]): number {
  const cleanDate = dateStr.substring(0, 10); // Safe YYYY-MM-DD string slice

  for (const period of periods) {
    const from = period.effective_from;
    const to = period.effective_to || '9999-12-31';

    if (cleanDate >= from && cleanDate <= to) {
      return period.rate;
    }
  }

  return 0.15; // default fallback
}
