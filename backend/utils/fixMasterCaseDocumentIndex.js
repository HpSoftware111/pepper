/**
 * Migration script to fix MasterCaseDocument index
 * 
 * This script:
 * 1. Drops the old unique index on case_id (which doesn't respect is_deleted)
 * 2. Creates a new partial unique index on { case_id: 1, user_id: 1 } 
 *    that only enforces uniqueness for non-deleted cases
 * 
 * Run this once: node utils/fixMasterCaseDocumentIndex.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const COLLECTION_NAME = 'master_case_documents';

async function fixIndex() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection(COLLECTION_NAME);

        // Step 1: List all indexes
        console.log('\n📋 Current indexes:');
        const indexes = await collection.indexes();
        indexes.forEach(index => {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
            if (index.unique) console.log(`    Unique: ${index.unique}`);
            if (index.partialFilterExpression) {
                console.log(`    Partial Filter: ${JSON.stringify(index.partialFilterExpression)}`);
            }
        });

        // Step 2: Drop old unique index on case_id (case_id_1)
        console.log('\n🗑️  Dropping old unique index on case_id...');
        try {
            await collection.dropIndex('case_id_1');
            console.log('✅ Successfully dropped index: case_id_1');
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log('ℹ️  Index case_id_1 not found (may have already been dropped)');
            } else {
                throw error;
            }
        }

        // Step 3: Drop old compound index if it exists (user_id_1_case_id_1)
        console.log('\n🗑️  Checking for old compound index...');
        try {
            const oldCompoundIndex = indexes.find(idx => 
                idx.name === 'user_id_1_case_id_1' || 
                (idx.key.user_id === 1 && idx.key.case_id === 1 && !idx.unique)
            );
            if (oldCompoundIndex) {
                await collection.dropIndex(oldCompoundIndex.name);
                console.log(`✅ Successfully dropped index: ${oldCompoundIndex.name}`);
            } else {
                console.log('ℹ️  No old compound index found');
            }
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log('ℹ️  Old compound index not found');
            } else {
                console.warn('⚠️  Could not drop old compound index:', error.message);
            }
        }

        // Step 4: Ensure all documents have is_deleted field set (for safety)
        console.log('\n🔧 Ensuring all documents have is_deleted field set...');
        const updateResult = await collection.updateMany(
            { is_deleted: { $exists: false } },
            { $set: { is_deleted: false } }
        );
        if (updateResult.modifiedCount > 0) {
            console.log(`✅ Updated ${updateResult.modifiedCount} document(s) to set is_deleted: false`);
        } else {
            console.log('ℹ️  All documents already have is_deleted field set');
        }

        // Step 5: Create new partial unique index
        console.log('\n📝 Creating new partial unique index on { case_id: 1, user_id: 1 }...');
        await collection.createIndex(
            { case_id: 1, user_id: 1 },
            {
                unique: true,
                partialFilterExpression: { is_deleted: false },
                name: 'case_id_1_user_id_1_partial'
            }
        );
        console.log('✅ Successfully created partial unique index');

        // Step 6: Verify the new index
        console.log('\n✅ Verifying new indexes:');
        const newIndexes = await collection.indexes();
        const newIndex = newIndexes.find(idx => 
            idx.key.case_id === 1 && idx.key.user_id === 1 && idx.unique === true
        );
        if (newIndex) {
            console.log(`  ✅ Found: ${newIndex.name}`);
            console.log(`     Keys: ${JSON.stringify(newIndex.key)}`);
            console.log(`     Unique: ${newIndex.unique}`);
            if (newIndex.partialFilterExpression) {
                console.log(`     Partial Filter: ${JSON.stringify(newIndex.partialFilterExpression)}`);
            }
        } else {
            console.warn('⚠️  Warning: New index not found after creation');
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Final index list:');
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach(index => {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
            if (index.unique) console.log(`    Unique: ${index.unique}`);
            if (index.partialFilterExpression) {
                console.log(`    Partial Filter: ${JSON.stringify(index.partialFilterExpression)}`);
            }
        });

    } catch (error) {
        console.error('\n❌ Error during migration:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 MongoDB connection closed');
        process.exit(0);
    }
}

// Run the migration
fixIndex().catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
});
