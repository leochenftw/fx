import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';

const ddbRaw = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbRaw);
const FOREIGN_ENTITIES_TABLE_NAME = process.env.FOREIGN_ENTITIES_TABLE_NAME || '';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log(`[Stream] Received stream event with ${event.Records.length} records.`);

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
      continue;
    }

    try {
      const newImage = record.dynamodb?.NewImage;
      if (!newImage) {
        console.log(`[Stream] No NewImage payload found in ${record.eventName} record. Skipping.`);
        continue;
      }

      // Restore DynamoDB AttributeValue map to a plain Javascript object
      const item = unmarshall(newImage as any);
      const pk = item.pk || '';
      const sk = item.sk || '';

      const isAR = sk.startsWith('OPENING#AR#');
      const isAP = sk.startsWith('OPENING#AP#');
      const isTX = sk.startsWith('TX#');

      // 安全限制：对于 MODIFY 事件只处理交易流水的分类变更，避免在期初余额更新时重复建联系人
      if (record.eventName === 'MODIFY' && !isTX) {
        console.log('[Stream] Skip MODIFY event for non-transaction record.');
        continue;
      }

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

        const cleanEntityName = rawEntityName.trim().replace(/\s+/g, ' ');
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
          await updateGlobalCache(cleanEntityName, cleanCategory);
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
          await updateGlobalCache(cleanEntityName, cleanCategory);
        }
      }
    } catch (err: any) {
      console.error('[Stream] Fatal error occurred while processing individual stream record. Continuing loop.', err);
      // We catch block exceptions here to prevent blocking subsequent valid chunk records
    }
  }
};

/**
 * Incrementally updates the global configuration cache with a new or modified entity category, advancing the version.
 */
async function updateGlobalCache(entityName: string, category: string): Promise<void> {
  try {
    const cleanName = entityName.trim().replace(/\s+/g, ' ');
    const cleanCat = category.trim();

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

    // 2. Incrementally update array in memory
    entitiesArray = entitiesArray.filter((e: any) => e.entity_name.trim().replace(/\s+/g, ' ').toLowerCase() !== cleanName.toLowerCase());
    entitiesArray.push({ entity_name: cleanName, default_category: cleanCat });

    // 3. Write new version record
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
      console.log(`[Stream Cache Sync] Deleted old version record: ${oldVersion}`);
    }

    console.log(`[Stream Cache Sync] Successfully updated global cache to version ${versionString} with entity "${cleanName}"`);
  } catch (err) {
    console.error('[Stream Cache Sync] Failed to incrementally update global config version:', err);
  }
}
