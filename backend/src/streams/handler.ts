import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
      const isTX = sk.startsWith('TX#');

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

        const entityType = isAR ? 'Customer' : 'Supplier';

        await ddb.send(new PutCommand({
          TableName: FOREIGN_ENTITIES_TABLE_NAME,
          Item: {
            entity_type: entityType,
            entity_id: entityId,
            entity_name: rawEntityName.trim(),
            ird_number: '',
            created_at: utcNow,
            updated_at: utcNow,
          },
        }));

        console.log(`[Stream] Successfully registered foreign entity "${rawEntityName}" as "${entityType}"`);
      }

      if (isTX) {
        const orgId = pk.startsWith('ORG#') ? pk.substring(4) : pk;
        const rawEntityName = item.vendor;
        const category = item.category;

        if (!orgId || !rawEntityName) {
          console.log('[Stream] Transaction item missing orgId or vendor. Skipping.');
          continue;
        }

        const cleanEntityName = rawEntityName.trim();
        const cleanCategory = category ? category.trim() : 'Uncategorized';
        const entityType = item.type === 'income' || cleanCategory === 'Sales & Revenue' || cleanCategory === 'Other Income' ? 'Customer' : 'Supplier';

        // 1. Query if a foreign entity with the same name already exists globally under this type
        const response = await ddb.send(
          new QueryCommand({
            TableName: FOREIGN_ENTITIES_TABLE_NAME,
            KeyConditionExpression: 'entity_type = :entity_type',
            FilterExpression: 'entity_name = :entity_name',
            ExpressionAttributeValues: {
              ':entity_type': entityType,
              ':entity_name': cleanEntityName,
            },
          })
        );

        const existingEntity = response.Items?.[0];
        const utcNow = new Date().toISOString();

        if (!existingEntity) {
          // 2. Not exists: create new entity with default_category
          const entityId = `ent-${randomUUID()}`;
          console.log(`[Stream] Registering NEW foreign entity "${cleanEntityName}" under "${entityType}" with category "${cleanCategory}"`);
          
          await ddb.send(
            new PutCommand({
              TableName: FOREIGN_ENTITIES_TABLE_NAME,
              Item: {
                entity_type: entityType,
                entity_id: entityId,
                entity_name: cleanEntityName,
                default_category: cleanCategory,
                ird_number: '',
                created_at: utcNow,
                updated_at: utcNow,
              },
            })
          );
        } else if (existingEntity.default_category !== cleanCategory && cleanCategory !== 'Uncategorized') {
          // 3. Exists but category changed: update default_category to keep mapping fresh
          console.log(`[Stream] Updating existing foreign entity "${cleanEntityName}" under "${entityType}" from "${existingEntity.default_category}" to "${cleanCategory}"`);
          
          await ddb.send(
            new PutCommand({
              TableName: FOREIGN_ENTITIES_TABLE_NAME,
              Item: {
                ...existingEntity,
                default_category: cleanCategory,
                updated_at: utcNow,
              },
            })
          );
        }
      }
    } catch (err: any) {
      console.error('[Stream] Fatal error occurred while processing individual stream record. Continuing loop.', err);
      // We catch block exceptions here to prevent blocking subsequent valid chunk records
    }
  }
};
