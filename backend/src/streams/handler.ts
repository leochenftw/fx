import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';

const ddbRaw = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbRaw);
const FOREIGN_ENTITIES_TABLE_NAME = process.env.FOREIGN_ENTITIES_TABLE_NAME || '';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log(`[Stream] Received stream event with ${event.Records.length} records.`);

  for (const record of event.Records) {
    // We are only interested in new item insertions (INSERT events)
    if (record.eventName !== 'INSERT') {
      continue;
    }

    try {
      const newImage = record.dynamodb?.NewImage;
      if (!newImage) {
        console.log('[Stream] No NewImage payload found in INSERT record. Skipping.');
        continue;
      }

      // Restore DynamoDB AttributeValue map to a plain Javascript object
      const item = unmarshall(newImage as any);
      const pk = item.pk || '';
      const sk = item.sk || '';

      const isAR = sk.startsWith('OPENING#AR#');
      const isAP = sk.startsWith('OPENING#AP#');

      if (isAR || isAP) {
        // Extract org UUID (pk structure is ORG#<uuid> -> slice off first 4 characters)
        const orgId = pk.startsWith('ORG#') ? pk.substring(4) : pk;
        
        // Extract entity name from either specific attributes or fallback to sk suffix
        const rawEntityName = item.customer_name || item.vendor_name || sk.substring(sk.lastIndexOf('#') + 1);

        if (!orgId || !rawEntityName) {
          console.warn(`[Stream] Insufficient payload data to register entity. Skipping. pk: "${pk}", sk: "${sk}"`);
          continue;
        }

        const entityId = `ent-${randomUUID()}`;
        const utcNow = new Date().toISOString(); // Native toISOString outputs standard UTC format ending in 'Z'

        console.log(`[Stream] Processing insert for org: "${orgId}". Found external entity name: "${rawEntityName}"`);

        await ddb.send(new PutCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Item: {
            org_id: orgId,
            entity_id: entityId,
            entity_name: rawEntityName.trim(),
            ird_number: '',
            created_at: utcNow,
            updated_at: utcNow,
          },
        }));

        console.log(`[Stream] Successfully registered foreign entity "${rawEntityName}" with entity_id "${entityId}"`);
      }
    } catch (err: any) {
      console.error('[Stream] Fatal error occurred while processing individual stream record. Continuing loop.', err);
      // We catch block exceptions here to prevent blocking subsequent valid chunk records
    }
  }
};
